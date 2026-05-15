from __future__ import annotations

import json
from typing import Any

import jsonpatch
import structlog
from pydantic import ValidationError

from app.budget import TraceBudget
from app.config import get_settings
from app.llm.claude_client import call_claude, extract_json
from app.modules.brand_dna.prompt_loader import load_prompt
from app.modules.brand_dna.schemas import BrandManual, JudgeResult
from app.llm.langfuse_helpers import observe

log = structlog.get_logger(__name__)


class RepairError(Exception):
    pass


@observe(name="repair")
async def repair_manual(
    manual: BrandManual,
    judge: JudgeResult,
    budget: TraceBudget,
    attempt: int = 1,
) -> BrandManual:
    settings = get_settings()

    manual_json = manual.model_dump_json(indent=2, by_alias=True)
    violations_text = "\n".join(
        f"  [{v.severity.upper()}] {v.dimension}: {v.description}"
        + (f"\n    Fix: {v.suggested_fix}" if v.suggested_fix else "")
        for v in judge.violations
    )

    system = load_prompt(
        "repair",
        brand_manual_json=manual_json,
        verdict=judge.verdict,
        overall_score=f"{judge.scores.overall:.2f}",
        violations_list=violations_text,
    )

    messages: list[dict[str, Any]] = [
        {
            "role": "user",
            "content": (
                f"Repair attempt {attempt}. "
                f"Produce a minimal JSON Patch array to fix all violations. "
                "Return ONLY the patch array."
            ),
        }
    ]

    response = await call_claude(
        model=settings.claude_model_evaluator,
        system=system,
        messages=messages,
        max_tokens=4096,
        budget=budget,
        span=f"repair_attempt_{attempt}",
        allow_groq_fallback=False,
    )

    try:
        patch_ops = extract_json(response["text"])
    except (ValueError, json.JSONDecodeError) as exc:
        raise RepairError(f"Could not parse repair patch: {exc}") from exc

    if not isinstance(patch_ops, list):
        raise RepairError(f"Repair returned non-list: {type(patch_ops)}")

    if not patch_ops:
        log.info("repair_no_ops", attempt=attempt)
        return manual

    manual_dict = json.loads(manual_json)
    try:
        patch = jsonpatch.JsonPatch(patch_ops)
        patched_dict = patch.apply(manual_dict)
    except Exception as exc:
        raise RepairError(f"JSON Patch application failed: {exc}") from exc

    try:
        patched_manual = BrandManual.model_validate(patched_dict)
    except ValidationError as exc:
        raise RepairError(f"Patched manual failed Pydantic validation: {exc}") from exc

    log.info(
        "repair_complete",
        attempt=attempt,
        ops=len(patch_ops),
        brand_id=patched_manual.meta.brand_id,
    )
    return patched_manual
