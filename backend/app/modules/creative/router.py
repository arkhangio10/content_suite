from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.auth.dependencies import AnyAuthenticated, CreatorOnly
from app.budget import TraceBudget
from app.config import get_settings
from app.llm.claude_client import call_claude
from app.llm.langfuse_helpers import observe

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/creative", tags=["creative"])


# ─────────────────────────────────────────────
# In-memory state (demo)
# ─────────────────────────────────────────────

@dataclass
class ContentItem:
    content_id: str
    brand_id: str
    content_type: str
    prompt: str
    generated_text: str
    brand_context_used: list[str]
    created_by: str
    status: Literal["draft", "submitted", "approved", "rejected"] = "draft"


_content_items: dict[str, ContentItem] = {}


# ─────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────

class GenerateRequest(BaseModel):
    brand_id: str
    content_type: Literal["social_post", "tagline", "product_description", "email_subject", "ad_copy"]
    prompt: str = Field(..., min_length=10, max_length=1000)
    platform: str | None = None
    max_length: int = Field(default=300, ge=50, le=2000)


class ContentItemOut(BaseModel):
    content_id: str
    brand_id: str
    content_type: str
    prompt: str
    generated_text: str
    brand_context_used: list[str]
    status: str


# ─────────────────────────────────────────────
# Brand context helper
# ─────────────────────────────────────────────

def _resolve_manual_version(brand_id: str) -> int:
    """Look up the brand manual version for a given brand_id (defaults to 1)."""
    from app.modules.brand_dna.router import _jobs

    for j in reversed(list(_jobs.values())):
        if j.brand_id == brand_id and j.manual is not None:
            return j.manual.meta.version
    return 1


def _get_brand_context(brand_id: str) -> list[str]:
    from app.modules.brand_dna.router import _jobs

    manual = next(
        (j.manual for j in reversed(list(_jobs.values()))
         if j.brand_id == brand_id and j.manual is not None),
        None,
    )
    if manual is None:
        return [f"[No brand manual for '{brand_id}' — generate one first via /api/v1/brand-dna/generate]"]

    return [
        f"BRAND ESSENCE: {manual.brand_essence.core_idea}\n"
        f"Mission: {manual.brand_essence.mission_statement}\n"
        f"Values: {', '.join(manual.brand_essence.values)}",

        f"POSITIONING: {manual.positioning.statement}\n"
        f"USP: {manual.positioning.unique_value_prop}\n"
        f"Reasons to believe: {'; '.join(manual.positioning.reasons_to_believe[:3])}",

        f"TONE: {', '.join(manual.tone_of_voice.descriptors)}\n"
        f"DO: {'; '.join(manual.tone_of_voice.dos[:3])}\n"
        f"DON'T: {'; '.join(manual.tone_of_voice.donts[:3])}",

        f"PREFERRED WORDS: {', '.join(manual.vocabulary.preferred[:10])}\n"
        f"FORBIDDEN WORDS: {', '.join(manual.vocabulary.forbidden[:10])}",

        f"TAGLINES: {'; '.join(manual.taglines[:3])}",
    ]


# ─────────────────────────────────────────────
# Generation
# ─────────────────────────────────────────────

@observe(name="creative_generate")
async def _generate(
    brand_id: str,
    content_type: str,
    prompt: str,
    platform: str | None,
    max_length: int,
    brand_context: list[str],
) -> str:
    settings = get_settings()
    budget = TraceBudget(trace_id=str(uuid.uuid4()), ceiling_usd=0.50)
    context_text = "\n\n".join(brand_context)
    platform_note = f"Platform: {platform}. " if platform else ""

    system = (
        "You are a brand content writer for a Peruvian CPG product. "
        "Follow the brand guidelines EXACTLY. "
        "Write in Spanish (Peruvian register, tú not vosotros). "
        "Use ONLY preferred vocabulary; NEVER use forbidden words. "
        f"Return ONLY the content text, max {max_length} characters.\n\n"
        f"## Brand Guidelines\n{context_text}\n\n"
        f"{platform_note}"
    )
    response = await call_claude(
        model=settings.claude_model_orchestrator,
        system=system,
        messages=[{"role": "user", "content": f"Generate {content_type}: {prompt}"}],
        max_tokens=min(max_length * 2, 1024),
        budget=budget,
        span="creative_generate",
    )
    return response["text"].strip()


# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────

@router.post("/generate", summary="Generate brand-consistent content (RAG)")
async def generate_content(
    req: GenerateRequest,
    current_user: AnyAuthenticated,
) -> ContentItemOut:
    brand_context = _get_brand_context(req.brand_id)

    try:
        text = await _generate(
            brand_id=req.brand_id,
            content_type=req.content_type,
            prompt=req.prompt,
            platform=req.platform,
            max_length=req.max_length,
            brand_context=brand_context,
        )
    except Exception as exc:
        log.error("creative_generate_error", brand_id=req.brand_id, error=str(exc))
        raise HTTPException(status_code=500, detail=f"Generation failed: {exc}")

    content_id = str(uuid.uuid4())
    item = ContentItem(
        content_id=content_id,
        brand_id=req.brand_id,
        content_type=req.content_type,
        prompt=req.prompt,
        generated_text=text,
        brand_context_used=[c[:120] for c in brand_context],
        created_by=str(current_user.id),
    )
    _content_items[content_id] = item
    log.info("content_generated", content_id=content_id, brand_id=req.brand_id, type=req.content_type)

    # Best-effort REST persistence to Supabase (visible in the table editor for the demo)
    try:
        from app.db.persistence_rest import save_content_item, save_audit_log
        manual_version = _resolve_manual_version(req.brand_id)
        await save_content_item(
            content_id=content_id,
            brand_id=req.brand_id,
            manual_version=manual_version,
            content_type=req.content_type,
            prompt=req.prompt,
            generated_text=text,
            brand_context_used=item.brand_context_used,
            creator_id=str(current_user.id),
            status="draft",
        )
        await save_audit_log(
            action="create",
            actor_id=str(current_user.id),
            actor_role="creator",
            content_item_id=content_id,
            to_status="draft",
            notes=f"Generated {req.content_type} for {req.brand_id}",
        )
    except Exception as exc:
        log.warning("creative_rest_persist_failed", content_id=content_id, error=str(exc))

    return ContentItemOut(
        content_id=content_id,
        brand_id=item.brand_id,
        content_type=item.content_type,
        prompt=item.prompt,
        generated_text=item.generated_text,
        brand_context_used=item.brand_context_used,
        status=item.status,
    )


@router.post("/{content_id}/submit", summary="Submit content for governance review")
async def submit_content(
    content_id: str,
    current_user: CreatorOnly,
) -> dict[str, str]:
    item = _content_items.get(content_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Content item not found")
    if item.created_by != str(current_user.id):
        raise HTTPException(status_code=403, detail="Can only submit your own content")
    if item.status != "draft":
        raise HTTPException(status_code=409, detail=f"Content is already '{item.status}'")
    item.status = "submitted"
    log.info("content_submitted", content_id=content_id)

    try:
        from app.db.persistence_rest import update_content_item_status
        await update_content_item_status(content_id=content_id, status="submitted")
    except Exception as exc:
        log.warning("creative_submit_rest_failed", content_id=content_id, error=str(exc))

    return {"content_id": content_id, "status": "submitted"}


@router.get("/{content_id}", summary="Get a content item")
async def get_content_item(
    content_id: str,
    current_user: AnyAuthenticated,
) -> ContentItemOut:
    item = _content_items.get(content_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Content item not found")
    return ContentItemOut(
        content_id=item.content_id,
        brand_id=item.brand_id,
        content_type=item.content_type,
        prompt=item.prompt,
        generated_text=item.generated_text,
        brand_context_used=item.brand_context_used,
        status=item.status,
    )


@router.get("/brand/{brand_id}", summary="List content items for a brand")
async def list_brand_content(
    brand_id: str,
    current_user: AnyAuthenticated,
) -> list[ContentItemOut]:
    return [
        ContentItemOut(
            content_id=item.content_id,
            brand_id=item.brand_id,
            content_type=item.content_type,
            prompt=item.prompt,
            generated_text=item.generated_text,
            brand_context_used=item.brand_context_used,
            status=item.status,
        )
        for item in _content_items.values()
        if item.brand_id == brand_id
    ]
