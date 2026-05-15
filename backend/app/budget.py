from __future__ import annotations

from dataclasses import dataclass, field
from threading import Lock
from typing import Any

import structlog

log = structlog.get_logger(__name__)


class BudgetExceeded(Exception):
    def __init__(self, trace_id: str, spent_usd: float, ceiling_usd: float) -> None:
        self.trace_id = trace_id
        self.spent_usd = spent_usd
        self.ceiling_usd = ceiling_usd
        super().__init__(
            f"Budget exceeded for trace {trace_id}: "
            f"${spent_usd:.4f} spent vs ${ceiling_usd:.4f} ceiling"
        )


@dataclass(frozen=True)
class ModelPricing:
    input_per_mtok: float
    output_per_mtok: float
    cache_read_per_mtok: float
    cache_write_per_mtok: float


PRICING: dict[str, ModelPricing] = {
    "claude-opus-4-7": ModelPricing(
        input_per_mtok=5.00,
        output_per_mtok=25.00,
        cache_read_per_mtok=0.50,
        cache_write_per_mtok=6.25,
    ),
    "claude-sonnet-4-6": ModelPricing(
        input_per_mtok=3.00,
        output_per_mtok=15.00,
        cache_read_per_mtok=0.30,
        cache_write_per_mtok=3.75,
    ),
    "claude-haiku-4-5": ModelPricing(
        input_per_mtok=1.00,
        output_per_mtok=5.00,
        cache_read_per_mtok=0.10,
        cache_write_per_mtok=1.25,
    ),
    "llama-3.3-70b-versatile": ModelPricing(
        input_per_mtok=0.59,
        output_per_mtok=0.79,
        cache_read_per_mtok=0.0,
        cache_write_per_mtok=0.0,
    ),
}


@dataclass
class CallEntry:
    model: str
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cache_write_tokens: int
    cost_usd: float
    span: str | None = None


@dataclass
class TraceBudget:
    trace_id: str
    ceiling_usd: float
    spent_usd: float = 0.0
    entries: list[CallEntry] = field(default_factory=list)
    _lock: Lock = field(default_factory=Lock, repr=False)

    def estimate_cost(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
        cache_read_tokens: int = 0,
        cache_write_tokens: int = 0,
    ) -> float:
        pricing = PRICING.get(model)
        if pricing is None:
            log.warning("budget_unknown_model", model=model)
            return 0.0
        billable_input = max(input_tokens - cache_read_tokens - cache_write_tokens, 0)
        return (
            billable_input * pricing.input_per_mtok / 1_000_000
            + output_tokens * pricing.output_per_mtok / 1_000_000
            + cache_read_tokens * pricing.cache_read_per_mtok / 1_000_000
            + cache_write_tokens * pricing.cache_write_per_mtok / 1_000_000
        )

    def charge(
        self,
        *,
        model: str,
        input_tokens: int,
        output_tokens: int,
        cache_read_tokens: int = 0,
        cache_write_tokens: int = 0,
        span: str | None = None,
    ) -> float:
        cost = self.estimate_cost(
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_read_tokens=cache_read_tokens,
            cache_write_tokens=cache_write_tokens,
        )
        with self._lock:
            self.spent_usd += cost
            self.entries.append(
                CallEntry(
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    cache_read_tokens=cache_read_tokens,
                    cache_write_tokens=cache_write_tokens,
                    cost_usd=cost,
                    span=span,
                )
            )
            spent = self.spent_usd

        log.info(
            "budget_charged",
            trace_id=self.trace_id,
            model=model,
            cost_usd=round(cost, 6),
            spent_usd=round(spent, 6),
            ceiling_usd=self.ceiling_usd,
            span=span,
        )
        if spent > self.ceiling_usd:
            raise BudgetExceeded(self.trace_id, spent, self.ceiling_usd)
        return cost

    def charge_anthropic_usage(self, model: str, usage: Any, span: str | None = None) -> float:
        input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
        cache_read = int(getattr(usage, "cache_read_input_tokens", 0) or 0)
        cache_write = int(getattr(usage, "cache_creation_input_tokens", 0) or 0)
        return self.charge(
            model=model,
            input_tokens=input_tokens + cache_read + cache_write,
            output_tokens=output_tokens,
            cache_read_tokens=cache_read,
            cache_write_tokens=cache_write,
            span=span,
        )

    def cache_hit_rate(self) -> float:
        total_input = sum(e.input_tokens for e in self.entries)
        cache_read = sum(e.cache_read_tokens for e in self.entries)
        if total_input == 0:
            return 0.0
        return cache_read / total_input

    def remaining_usd(self) -> float:
        with self._lock:
            return max(self.ceiling_usd - self.spent_usd, 0.0)

    def summary(self) -> dict[str, Any]:
        with self._lock:
            return {
                "trace_id": self.trace_id,
                "spent_usd": round(self.spent_usd, 6),
                "ceiling_usd": self.ceiling_usd,
                "remaining_usd": round(max(self.ceiling_usd - self.spent_usd, 0.0), 6),
                "calls": len(self.entries),
                "cache_hit_rate": round(self.cache_hit_rate(), 4),
            }
