from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

import structlog

from app.budget import BudgetExceeded, TraceBudget
from app.config import get_settings
from app.llm.claude_client import call_claude, extract_json
from app.modules.brand_dna.prompt_loader import load_prompt
from app.modules.brand_dna.schemas import (
    AgentRole,
    ProductBrief,
    ResearchFinding,
    WorkerResult,
)
from app.modules.brand_dna.tools import ToolContext
from app.llm.langfuse_helpers import observe, score_trace, update_trace

log = structlog.get_logger(__name__)

_WORKER_ROLES: list[AgentRole] = [
    "competitive_scan",
    "audience_research",
    "trend_analysis",
    "cultural_context",
    "positioning_analysis",
]

_MIN_WORKERS_TO_PROCEED = 3


@observe(name="orchestrator_plan")
async def run_orchestrator(
    brief: ProductBrief, budget: TraceBudget
) -> dict[AgentRole, str]:
    settings = get_settings()
    system = load_prompt(
        "orchestrator",
        category=brief.category,
        product_concept=brief.product_concept,
        target_audience=brief.target_audience,
        tone_hint=brief.tone_hint or "equilibrado y auténtico",
        business_constraints=str(brief.business_constraints),
        market=brief.market,
    )
    messages: list[dict[str, Any]] = [
        {
            "role": "user",
            "content": (
                f"Create a research plan for: {brief.product_concept} "
                f"in the {brief.category} category targeting {brief.target_audience}."
            ),
        }
    ]

    response = await call_claude(
        model=settings.claude_model_orchestrator,
        system=system,
        messages=messages,
        max_tokens=1024,
        budget=budget,
        span="orchestrator_plan",
    )

    plan_raw = extract_json(response["text"])
    research_plan: dict[AgentRole, str] = plan_raw.get("research_plan", plan_raw)

    if len(research_plan) != 5 or not all(r in research_plan for r in _WORKER_ROLES):
        log.warning("orchestrator_plan_incomplete", keys=list(research_plan.keys()))
        for role in _WORKER_ROLES:
            if role not in research_plan:
                research_plan[role] = f"Research {role.replace('_', ' ')} for {brief.category} in Peru."

    log.info("orchestrator_plan_ready", roles=list(research_plan.keys()))
    return research_plan


async def run_all_workers(
    plan: dict[AgentRole, str],
    brief: ProductBrief,
    budget: TraceBudget,
    context: ToolContext,
) -> tuple[list[WorkerResult], bool]:
    """
    Returns (successes, partial_evidence).
    Raises RuntimeError if fewer than _MIN_WORKERS_TO_PROCEED succeed.
    """
    from app.modules.brand_dna.workers import (
        audience_research,
        competitive_scan,
        cultural_context,
        positioning_analysis,
        trend_analysis,
    )

    worker_map = {
        "competitive_scan": competitive_scan.run,
        "audience_research": audience_research.run,
        "trend_analysis": trend_analysis.run,
        "cultural_context": cultural_context.run,
        "positioning_analysis": positioning_analysis.run,
    }

    tasks = [
        worker_map[role](plan[role], brief, budget, context)
        for role in _WORKER_ROLES
        if role in plan
    ]

    raw_results: list[WorkerResult | BaseException] = await asyncio.gather(
        *tasks, return_exceptions=True
    )

    successes: list[WorkerResult] = []
    for role, result in zip(_WORKER_ROLES, raw_results):
        if isinstance(result, BaseException):
            log.error("worker_failed", role=role, error=str(result))
        else:
            successes.append(result)

    n = len(successes)
    log.info("workers_complete", successes=n, total=len(tasks))

    if n < _MIN_WORKERS_TO_PROCEED:
        raise RuntimeError(
            f"Too many worker failures: only {n}/{len(tasks)} succeeded "
            f"(minimum {_MIN_WORKERS_TO_PROCEED} required)."
        )

    partial_evidence = n < len(tasks)
    return successes, partial_evidence


# ─────────────────────────────────────────────
# Full pipeline
# ─────────────────────────────────────────────

@dataclass
class PipelineResult:
    manual: Any  # BrandManual — avoid circular import at module level
    trace_id: str
    budget_summary: dict[str, Any]
    partial_evidence: bool
    judge_scores: dict[str, Any] | None = None
    status: Literal[
        "complete",
        "needs_human_review",
        "incomplete_budget_hit",
        "failed",
    ] = "complete"
    error: str | None = None


@observe(name="brand_dna_generate")
async def run_brand_dna_pipeline(
    brief: ProductBrief,
    budget: TraceBudget,
    db_pool: Any | None = None,
    phase_callback: Any | None = None,
) -> PipelineResult:
    """
    Run the full Brand DNA pipeline.

    phase_callback: optional sync callable invoked at each stage boundary with one of:
      "planning" | "researching" | "synthesizing" | "evaluating" | "repairing" | "done"
    Used by the FastAPI router to surface progress to the UI poller.
    """
    from app.modules.brand_dna.evaluator import evaluate_manual
    from app.modules.brand_dna.repair import RepairError, repair_manual
    from app.modules.brand_dna.synthesizer import SynthesisError, synthesize_manual

    def _phase(p: str) -> None:
        if phase_callback:
            try:
                phase_callback(p)
            except Exception:
                pass  # never let a UI hook break the pipeline

    settings = get_settings()
    trace_id = budget.trace_id

    update_trace(
        user_id=str(brief.requested_by),
        session_id=trace_id,
        tags=["brand_dna", brief.market, brief.category],
        metadata={"brief_launch_id": brief.launch_id, "ceiling_usd": budget.ceiling_usd},
    )

    context = ToolContext(
        trace_id=trace_id,
        brand_id=brief.brand_id or brief.launch_id,
        brief=brief,
        db_pool=db_pool,
    )

    try:
        _phase("planning")
        plan = await run_orchestrator(brief, budget)

        _phase("researching")
        worker_results, partial_evidence = await run_all_workers(plan, brief, budget, context)

        _phase("synthesizing")
        manual = await synthesize_manual(worker_results, brief, budget, context, partial_evidence)

        max_iters = settings.max_repair_iterations
        judge_result = None

        for attempt in range(max_iters + 1):
            _phase("evaluating")
            judge_result = await evaluate_manual(manual, worker_results, budget, context)

            if judge_result.verdict == "pass":
                log.info("pipeline_judge_pass", attempt=attempt)
                score_trace("judge_overall", judge_result.scores.overall, comment=judge_result.reasoning[:200])
                break

            if judge_result.verdict == "reject":
                log.warning("pipeline_judge_reject", attempt=attempt, score=judge_result.scores.overall)
                _phase("done")
                return PipelineResult(
                    manual=manual,
                    trace_id=trace_id,
                    budget_summary=budget.summary(),
                    partial_evidence=partial_evidence,
                    judge_scores=judge_result.scores.model_dump(),
                    status="needs_human_review",
                )

            if attempt == max_iters:
                log.warning("pipeline_max_repairs_reached", score=judge_result.scores.overall)
                _phase("done")
                return PipelineResult(
                    manual=manual,
                    trace_id=trace_id,
                    budget_summary=budget.summary(),
                    partial_evidence=partial_evidence,
                    judge_scores=judge_result.scores.model_dump(),
                    status="needs_human_review",
                )

            try:
                _phase("repairing")
                manual = await repair_manual(manual, judge_result, budget, attempt=attempt + 1)
            except RepairError as exc:
                log.error("repair_failed", error=str(exc), attempt=attempt)
                break

        _phase("done")
        return PipelineResult(
            manual=manual,
            trace_id=trace_id,
            budget_summary=budget.summary(),
            partial_evidence=partial_evidence,
            judge_scores=judge_result.scores.model_dump() if judge_result else None,
            status="complete",
        )

    except BudgetExceeded as exc:
        log.warning("pipeline_budget_exceeded", spent=exc.spent_usd, ceiling=exc.ceiling_usd)
        return PipelineResult(
            manual=None,
            trace_id=trace_id,
            budget_summary=budget.summary(),
            partial_evidence=False,
            status="incomplete_budget_hit",
            error=str(exc),
        )

    except RuntimeError as exc:
        log.error("pipeline_worker_failure", error=str(exc))
        raise

    except Exception as exc:
        log.error("pipeline_unexpected_error", error=str(exc))
        return PipelineResult(
            manual=None,
            trace_id=trace_id,
            budget_summary=budget.summary(),
            partial_evidence=False,
            status="failed",
            error=str(exc),
        )
