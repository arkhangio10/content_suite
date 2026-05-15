from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import structlog
from pydantic import ValidationError

from app.budget import TraceBudget
from app.config import get_settings
from app.llm.claude_client import call_claude, extract_json
from app.modules.brand_dna.prompt_loader import load_prompt
from app.modules.brand_dna.schemas import BrandManual, ProductBrief, WorkerResult
from app.modules.brand_dna.tools import ToolContext
from app.llm.langfuse_helpers import observe

log = structlog.get_logger(__name__)


class SynthesisError(Exception):
    def __init__(self, message: str, raw_response: str = "") -> None:
        self.raw_response = raw_response
        super().__init__(message)


def _build_findings_summary(
    worker_results: list[WorkerResult],
    context: ToolContext,
) -> str:
    parts: list[str] = []
    for wr in worker_results:
        finding = context.findings_cache.get(wr.finding_id)
        if finding is None:
            parts.append(
                f"## {wr.agent_role} (finding_id: {wr.finding_id})\n"
                f"Summary: {wr.summary}\n"
                f"(Full finding not available in cache)\n"
            )
            continue

        structured_json = json.dumps(finding.structured_data, ensure_ascii=False, indent=2)
        detailed = "\n".join(
            f"  - {item.claim} (confidence: {item.confidence}, source: {item.source_url or 'n/a'})"
            for item in finding.detailed_findings[:10]
        )
        parts.append(
            f"## {wr.agent_role}\n"
            f"finding_id: {wr.finding_id}\n"
            f"Summary: {wr.summary}\n"
            f"Quality: {wr.quality_self_assessment:.2f}\n"
            f"Detailed findings:\n{detailed}\n"
            f"Structured data:\n{structured_json}\n"
        )
    return "\n\n".join(parts)


@observe(name="synthesizer")
async def synthesize_manual(
    worker_results: list[WorkerResult],
    brief: ProductBrief,
    budget: TraceBudget,
    context: ToolContext,
    partial_evidence: bool = False,
) -> BrandManual:
    settings = get_settings()
    findings_summary = _build_findings_summary(worker_results, context)

    partial_note = (
        "\n⚠️  PARTIAL EVIDENCE: Some workers failed. "
        "Mark `meta.partial_evidence = true` and use lower confidence scores (≤0.65) "
        "on sections with missing data.\n"
        if partial_evidence
        else ""
    )

    system = load_prompt(
        "synthesizer",
        product_name=brief.product_concept,
        category=brief.category,
        product_concept=brief.product_concept,
        target_audience=brief.target_audience,
        tone_hint=brief.tone_hint or "equilibrado y auténtico",
        market=brief.market,
        launch_id=brief.launch_id,
        brand_id=brief.brand_id or brief.launch_id,
        findings_summary=findings_summary,
        partial_evidence_note=partial_note,
    )

    messages: list[dict[str, Any]] = [
        {
            "role": "user",
            "content": (
                "Based on the research findings above, synthesize a complete Brand Manual "
                f"for '{brief.product_concept}' ({brief.category}). "
                "Return ONLY the JSON object, no markdown fences."
            ),
        }
    ]

    response = await call_claude(
        model=settings.claude_model_synthesizer,
        system=system,
        messages=messages,
        max_tokens=16000,
        enable_thinking=True,
        thinking_budget=4000,
        budget=budget,
        span="synthesizer",
        allow_groq_fallback=False,
    )

    raw_text = response["text"]
    if not raw_text and response.get("thinking"):
        raw_text = response["thinking"]

    try:
        manual_dict: dict[str, Any] = extract_json(raw_text)
    except (ValueError, json.JSONDecodeError) as exc:
        raise SynthesisError(f"Failed to parse synthesizer JSON: {exc}", raw_text) from exc

    manual_dict.setdefault("meta", {})
    manual_dict["meta"].setdefault("brand_id", brief.brand_id or brief.launch_id)
    manual_dict["meta"].setdefault("product_name", brief.product_concept)
    manual_dict["meta"].setdefault("launch_id", brief.launch_id)
    manual_dict["meta"].setdefault("market", brief.market)
    manual_dict["meta"].setdefault("language", "es-PE")
    manual_dict["meta"].setdefault("generated_at", datetime.utcnow().isoformat())
    manual_dict["meta"]["partial_evidence"] = partial_evidence

    try:
        manual = BrandManual.model_validate(manual_dict)
    except ValidationError as exc:
        raise SynthesisError(
            f"BrandManual validation failed: {exc}", raw_text
        ) from exc

    log.info(
        "synthesis_complete",
        brand_id=manual.meta.brand_id,
        pillars=len(manual.content_pillars),
        personas=len(manual.personas),
        partial=partial_evidence,
    )
    return manual
