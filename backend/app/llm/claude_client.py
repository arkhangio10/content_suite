from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

import anthropic
import structlog
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

from app.budget import BudgetExceeded, TraceBudget
from app.config import get_settings

log = structlog.get_logger(__name__)


# ─────────────────────────────────────────────
# Clients (singletons)
# ─────────────────────────────────────────────

@lru_cache(maxsize=1)
def _get_anthropic_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=get_settings().anthropic_api_key)


@lru_cache(maxsize=1)
def _get_groq_client() -> Any:
    from groq import AsyncGroq
    return AsyncGroq(api_key=get_settings().groq_api_key)


# ─────────────────────────────────────────────
# Prompt caching helpers
# ─────────────────────────────────────────────

def _cached_system(text: str) -> list[dict[str, Any]]:
    return [{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}]


def _cached_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for i, tool in enumerate(tools):
        t = dict(tool)
        if i == len(tools) - 1:
            t["cache_control"] = {"type": "ephemeral"}
        result.append(t)
    return result


# ─────────────────────────────────────────────
# Response normalisation
# ─────────────────────────────────────────────

def _extract_content(response: anthropic.types.Message) -> dict[str, Any]:
    text_parts: list[str] = []
    tool_calls: list[dict[str, Any]] = []
    thinking_parts: list[str] = []

    for block in response.content:
        if block.type == "text":
            text_parts.append(block.text)
        elif block.type == "tool_use":
            tool_calls.append({"name": block.name, "input": block.input, "id": block.id})
        elif block.type == "thinking":
            thinking_parts.append(getattr(block, "thinking", ""))

    return {
        "text": "\n".join(text_parts).strip(),
        "tool_calls": tool_calls,
        "thinking": "\n".join(thinking_parts).strip() if thinking_parts else None,
        "stop_reason": response.stop_reason,
        "raw_content": response.content,
        "model": response.model,
        "usage": response.usage,
    }


# ─────────────────────────────────────────────
# Groq fallback (workers only, no thinking, no tool-use)
# ─────────────────────────────────────────────

async def _call_groq(
    system: str,
    messages: list[dict[str, Any]],
    max_tokens: int,
    budget: TraceBudget | None,
    span: str | None,
) -> dict[str, Any]:
    settings = get_settings()
    client = _get_groq_client()
    groq_messages = [{"role": "system", "content": system}, *messages]
    response = await client.chat.completions.create(
        model=settings.groq_model,
        messages=groq_messages,
        max_tokens=max_tokens,
        temperature=0.3,
    )
    choice = response.choices[0]
    usage = response.usage
    if budget and usage:
        budget.charge(
            model=settings.groq_model,
            input_tokens=usage.prompt_tokens,
            output_tokens=usage.completion_tokens,
            span=span,
        )
    return {
        "text": choice.message.content or "",
        "tool_calls": [],
        "thinking": None,
        "stop_reason": choice.finish_reason,
        "model": settings.groq_model,
        "usage": usage,
    }


# ─────────────────────────────────────────────
# Retry decorator for Claude calls
# ─────────────────────────────────────────────

def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, anthropic.RateLimitError):
        return True
    if isinstance(exc, anthropic.APIStatusError) and exc.status_code >= 500:
        return True
    return False


_claude_retry = retry(
    retry=retry_if_exception_type((anthropic.RateLimitError, anthropic.APIStatusError)),
    stop=stop_after_attempt(3),
    wait=wait_exponential_jitter(initial=1.0, max=30.0, jitter=2.0),
    reraise=True,
)


# ─────────────────────────────────────────────
# Core call_claude function
# ─────────────────────────────────────────────

async def call_claude(
    *,
    model: str,
    system: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    max_tokens: int = 4096,
    enable_thinking: bool = False,
    thinking_budget: int = 4000,
    budget: TraceBudget | None = None,
    span: str | None = None,
    allow_groq_fallback: bool = False,
) -> dict[str, Any]:
    """
    Make an Anthropic Claude API call with prompt caching, retry, budget tracking,
    and optional Groq fallback for worker calls.
    """
    client = _get_anthropic_client()
    settings = get_settings()

    if budget is not None:
        budget.remaining_usd()

    kwargs: dict[str, Any] = {
        "model": model,
        "system": _cached_system(system),
        "messages": messages,
        "max_tokens": max_tokens,
    }

    if tools:
        native_tools = [t for t in tools if t.get("type", "").startswith("web_search")]
        custom_tools = [t for t in tools if not t.get("type", "").startswith("web_search")]
        merged: list[dict[str, Any]] = []
        if native_tools:
            merged.extend(native_tools)
        if custom_tools:
            merged.extend(_cached_tools(custom_tools))
        if not native_tools and custom_tools:
            merged = _cached_tools(custom_tools)
        kwargs["tools"] = merged if merged else []

    if enable_thinking:
        # Claude 4.x uses adaptive thinking; budget_tokens is set via output_config.effort
        kwargs["thinking"] = {"type": "adaptive"}
        kwargs["output_config"] = {"effort": "high"}

    @_claude_retry
    async def _attempt() -> anthropic.types.Message:
        return await client.messages.create(**kwargs)

    try:
        response = await _attempt()
        result = _extract_content(response)
        if budget is not None:
            try:
                budget.charge_anthropic_usage(model=model, usage=response.usage, span=span)
            except BudgetExceeded:
                raise
        log.info(
            "claude_call_ok",
            model=model,
            stop_reason=result["stop_reason"],
            input_tokens=getattr(response.usage, "input_tokens", 0),
            output_tokens=getattr(response.usage, "output_tokens", 0),
            span=span,
        )
        return result

    except BudgetExceeded:
        raise

    except (anthropic.RateLimitError, anthropic.APIStatusError) as exc:
        if allow_groq_fallback:
            log.warning(
                "claude_failed_groq_fallback",
                model=model,
                error=str(exc),
                span=span,
            )
            return await _call_groq(
                system=system,
                messages=messages,
                max_tokens=max_tokens,
                budget=budget,
                span=span,
            )
        raise

    except anthropic.APIConnectionError as exc:
        log.error("claude_connection_error", model=model, error=str(exc), span=span)
        if allow_groq_fallback:
            return await _call_groq(
                system=system,
                messages=messages,
                max_tokens=max_tokens,
                budget=budget,
                span=span,
            )
        raise


def extract_json(text: str) -> Any:
    """Extract the first JSON object or array from a possibly-markdown-wrapped response."""
    text = text.strip()
    # Strip markdown fences if present
    if text.startswith("```"):
        lines = text.splitlines()
        inner = "\n".join(
            line for line in lines if not line.startswith("```")
        ).strip()
        text = inner
    # Find first { or [
    for start_char, end_char in [("{", "}"), ("[", "]")]:
        start = text.find(start_char)
        if start != -1:
            end = text.rfind(end_char)
            if end != -1:
                return json.loads(text[start : end + 1])
    raise ValueError(f"No JSON found in response: {text[:200]}")
