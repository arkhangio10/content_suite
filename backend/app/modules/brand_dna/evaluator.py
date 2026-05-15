from __future__ import annotations

import json
from typing import Any

import structlog

from app.budget import TraceBudget
from app.config import get_settings
from app.llm.claude_client import call_claude, extract_json
from app.modules.brand_dna.prompt_loader import load_prompt
from app.modules.brand_dna.schemas import BrandManual, JudgeResult, WorkerResult
from app.modules.brand_dna.tools import ToolContext
from app.llm.langfuse_helpers import observe

log = structlog.get_logger(__name__)


def _build_findings_ref(
    worker_results: list[WorkerResult], context: ToolContext
) -> str:
    parts: list[str] = []
    for wr in worker_results:
        finding = context.findings_cache.get(wr.finding_id)
        summary = finding.summary if finding else wr.summary
        parts.append(f"- {wr.agent_role} (id: {wr.finding_id}): {summary}")
    return "\n".join(parts)


@observe(name="evaluator")
async def evaluate_manual(
    manual: BrandManual,
    worker_results: list[WorkerResult],
    budget: TraceBudget,
    context: ToolContext,
) -> JudgeResult:
    settings = get_settings()

    manual_json = manual.model_dump_json(indent=2, by_alias=True)
    findings_ref = _build_findings_ref(worker_results, context)

    system = load_prompt(
        "evaluator",
        brand_manual_json=manual_json,
        findings_summary=findings_ref,
    )

    messages: list[dict[str, Any]] = [
        {
            "role": "user",
            "content": (
                "Evaluate this brand manual against the research findings. "
                "Return ONLY the JudgeResult JSON object."
            ),
        }
    ]

    response = await call_claude(
        model=settings.claude_model_evaluator,
        system=system,
        messages=messages,
        max_tokens=4096,
        budget=budget,
        span="evaluator",
        allow_groq_fallback=False,
    )

    raw = extract_json(response["text"])
    result = JudgeResult.model_validate(raw)

    log.info(
        "evaluation_complete",
        verdict=result.verdict,
        overall=result.scores.overall,
        violations=len(result.violations),
    )
    return result
