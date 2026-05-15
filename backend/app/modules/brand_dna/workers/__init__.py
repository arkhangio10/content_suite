from __future__ import annotations

import json
import uuid
from typing import Any

import structlog

from app.budget import TraceBudget
from app.config import get_settings
from app.llm.claude_client import call_claude
from app.modules.brand_dna.prompt_loader import load_prompt
from app.modules.brand_dna.schemas import AgentRole, ProductBrief, WorkerResult
from app.llm.langfuse_helpers import observe
from app.modules.brand_dna.tools import (
    ALL_CLIENT_TOOLS,
    WEB_SEARCH_TOOL,
    ToolContext,
    execute_tool,
)

log = structlog.get_logger(__name__)

_MAX_TURNS = 12


def _build_system(role: AgentRole, brief: ProductBrief, question: str) -> str:
    return load_prompt(
        role,
        research_question=question,
        product_concept=brief.product_concept,
        category=brief.category,
        target_audience=brief.target_audience,
        tone_hint=brief.tone_hint or "equilibrado y auténtico",
        business_constraints=json.dumps(brief.business_constraints, ensure_ascii=False),
        market=brief.market,
    )


@observe(name="worker")
async def run_worker(
    role: AgentRole,
    question: str,
    brief: ProductBrief,
    budget: TraceBudget,
    context: ToolContext,
) -> WorkerResult:
    settings = get_settings()
    system = _build_system(role, brief, question)
    messages: list[dict[str, Any]] = [{"role": "user", "content": question}]
    tools = [WEB_SEARCH_TOOL, *ALL_CLIENT_TOOLS]

    finding_id: str | None = None
    summary: str | None = None
    quality: float = 0.7

    for turn in range(_MAX_TURNS):
        response = await call_claude(
            model=settings.claude_model_worker,
            system=system,
            messages=messages,
            tools=tools,
            max_tokens=4096,
            budget=budget,
            span=f"{role}_turn_{turn}",
            allow_groq_fallback=True,
        )

        raw_content = response["raw_content"]
        tool_calls = response["tool_calls"]
        stop_reason = response["stop_reason"]

        if not tool_calls:
            # No tool calls: break regardless of stop_reason to avoid re-sending same messages
            break

        messages.append({"role": "assistant", "content": raw_content})
        tool_results: list[dict[str, Any]] = []
        called_save = False
        for tc in tool_calls:
            result = await execute_tool(tc["name"], tc["input"], context)
            if tc["name"] == "save_research_finding":
                finding_id = result.get("finding_id")
                summary = result.get("summary", "")
                quality = tc["input"].get("quality_self_assessment", 0.7)
                called_save = True
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tc["id"],
                "content": json.dumps(result, ensure_ascii=False),
            })
        messages.append({"role": "user", "content": tool_results})

        if called_save or stop_reason == "end_turn":
            break

    if not finding_id:
        log.warning("worker_missing_save_finding", role=role)
        finding_id = await _force_save_finding(role, response.get("text", ""), brief, context)
        summary = f"[Auto-saved] {response.get('text', '')[:400]}"

    return WorkerResult(
        finding_id=finding_id,
        summary=summary or "",
        quality_self_assessment=quality,
        agent_role=role,
    )


async def _force_save_finding(
    role: AgentRole,
    text: str,
    brief: ProductBrief,
    context: ToolContext,
) -> str:
    result = await execute_tool(
        "save_research_finding",
        {
            "agent_role": role,
            "summary": text[:500],
            "detailed_findings": [{"claim": text[:300], "evidence": "auto-extracted", "confidence": 0.5}],
            "structured_data": {"auto_saved": True},
            "quality_self_assessment": 0.4,
        },
        context,
    )
    return result.get("finding_id", str(uuid.uuid4()))
