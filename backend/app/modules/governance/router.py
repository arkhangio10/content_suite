from __future__ import annotations

import base64
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

import structlog
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.auth.dependencies import AnyAuthenticated, ApproverAOnly, ApproverBOnly
from app.budget import TraceBudget
from app.config import get_settings
from app.llm.claude_client import call_claude
from app.llm.langfuse_helpers import observe

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/governance", tags=["governance"])


# ─────────────────────────────────────────────
# In-memory approval state (demo)
# ─────────────────────────────────────────────

@dataclass
class ApprovalRecord:
    review_id: str
    content_id: str
    brand_id: str
    submitted_by: str
    status: Literal["pending", "approved", "rejected", "changes_requested"] = "pending"
    reviewer_id: str | None = None
    reviewer_comment: str | None = None


@dataclass
class ImageAuditResult:
    audit_id: str
    brand_id: str
    filename: str
    passed: bool
    overall_score: float
    findings: list[dict[str, Any]] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)
    audited_by: str = ""


_reviews: dict[str, ApprovalRecord] = {}
_audits: dict[str, ImageAuditResult] = {}


# ─────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────

class ReviewDecision(BaseModel):
    decision: Literal["approve", "reject", "request_changes"]
    comment: str = Field(default="", max_length=1000)


class ReviewOut(BaseModel):
    review_id: str
    content_id: str
    brand_id: str
    status: str
    reviewer_comment: str | None


class AuditOut(BaseModel):
    audit_id: str
    brand_id: str
    filename: str
    passed: bool
    overall_score: float
    findings: list[dict[str, Any]]
    recommendations: list[str]


# ─────────────────────────────────────────────
# Claude Vision audit
# ─────────────────────────────────────────────

def _get_brand_guidelines_text(brand_id: str) -> str:
    from app.modules.brand_dna.router import _jobs

    manual = next(
        (j.manual for j in reversed(list(_jobs.values()))
         if j.brand_id == brand_id and j.manual is not None),
        None,
    )
    if manual is None:
        return f"No brand manual found for '{brand_id}'."

    primary = ", ".join(manual.visual_identity.primary_colors[:5])
    secondary = ", ".join(manual.visual_identity.secondary_colors[:5]) if manual.visual_identity.secondary_colors else "(none)"
    typo = " · ".join(f"{k}: {v}" for k, v in (manual.visual_identity.typography or {}).items())
    return (
        f"Brand: {manual.meta.brand_id}\n"
        f"Core Idea: {manual.brand_essence.core_idea}\n"
        f"Positioning: {manual.positioning.statement}\n"
        f"Tone: {', '.join(manual.tone_of_voice.descriptors)}\n"
        f"Primary colors: {primary}\n"
        f"Secondary colors: {secondary}\n"
        f"Typography: {typo}\n"
        f"Imagery Style: {manual.visual_identity.imagery_style}\n"
        f"Logo Usage: {manual.visual_identity.logo_usage}\n"
        f"Visual don'ts: {'; '.join(manual.visual_identity.donts[:5])}\n"
        f"Preferred Vocabulary: {', '.join(manual.vocabulary.preferred[:8])}\n"
        f"Forbidden Vocabulary: {', '.join(manual.vocabulary.forbidden[:8])}"
    )


@observe(name="image_audit")
async def _run_image_audit(
    image_b64: str,
    media_type: str,
    brand_id: str,
    filename: str,
) -> dict[str, Any]:
    settings = get_settings()
    budget = TraceBudget(trace_id=str(uuid.uuid4()), ceiling_usd=0.30)

    guidelines = _get_brand_guidelines_text(brand_id)

    system = (
        "You are a brand compliance auditor. Analyze the image against brand guidelines.\n"
        "Respond with valid JSON only:\n"
        "{\n"
        '  "passed": true|false,\n'
        '  "overall_score": 0.0-1.0,\n'
        '  "findings": [\n'
        '    {"dimension": "color|typography|imagery|tone|messaging",\n'
        '     "status": "pass|fail|warning",\n'
        '     "observation": "...",\n'
        '     "severity": "critical|moderate|minor"}\n'
        '  ],\n'
        '  "recommendations": ["...", "..."]\n'
        "}"
    )

    messages: list[dict[str, Any]] = [
        {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_b64,
                    },
                },
                {
                    "type": "text",
                    "text": (
                        f"Audit this image for brand compliance.\n\n"
                        f"## Brand Guidelines\n{guidelines}\n\n"
                        "Return your analysis as JSON."
                    ),
                },
            ],
        }
    ]

    response = await call_claude(
        model=settings.claude_model_vision,
        system=system,
        messages=messages,
        max_tokens=1024,
        budget=budget,
        span="image_audit",
    )

    from app.llm.claude_client import extract_json
    return extract_json(response["text"])


# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────

class PendingItem(BaseModel):
    review_id: str
    content_id: str
    brand_id: str
    content_type: str
    prompt: str
    excerpt: str
    submitted_by: str
    status: str


@router.get("/pending", summary="List content items awaiting approval (approver_a queue)")
async def list_pending(current_user: AnyAuthenticated) -> dict[str, Any]:
    """Returns all reviews currently in 'pending' state, plus the underlying content snippet."""
    from app.modules.creative.router import _content_items

    items: list[PendingItem] = []
    for review in _reviews.values():
        if review.status != "pending":
            continue
        content = _content_items.get(review.content_id)
        if content is None:
            continue
        items.append(
            PendingItem(
                review_id=review.review_id,
                content_id=review.content_id,
                brand_id=review.brand_id,
                content_type=content.content_type,
                prompt=content.prompt,
                excerpt=(content.generated_text or "")[:240],
                submitted_by=review.submitted_by,
                status=review.status,
            )
        )
    return {"pending": [i.model_dump() for i in items], "count": len(items)}


@router.get("/content/{content_id}/full", summary="Get full content item + review for the drawer view")
async def get_content_full(content_id: str, current_user: AnyAuthenticated) -> dict[str, Any]:
    """Returns the content item + its associated review record (if any)."""
    from app.modules.creative.router import _content_items

    item = _content_items.get(content_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Content item not found")
    review = next(
        (r for r in _reviews.values() if r.content_id == content_id),
        None,
    )
    return {
        "content_id": item.content_id,
        "brand_id": item.brand_id,
        "content_type": item.content_type,
        "prompt": item.prompt,
        "generated_text": item.generated_text,
        "status": item.status,
        "review_id": review.review_id if review else None,
        "review_status": review.status if review else None,
        "reviewer_comment": review.reviewer_comment if review else None,
    }


@router.post("/content/{content_id}/submit", summary="Submit content for approval (creator → approver_a)")
async def submit_for_review(
    content_id: str,
    current_user: AnyAuthenticated,
) -> ReviewOut:
    from app.modules.creative.router import _content_items

    item = _content_items.get(content_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Content item not found")
    if item.status not in ("draft", "changes_requested"):
        raise HTTPException(status_code=409, detail=f"Content is already '{item.status}'")

    item.status = "submitted"
    review_id = str(uuid.uuid4())
    record = ApprovalRecord(
        review_id=review_id,
        content_id=content_id,
        brand_id=item.brand_id,
        submitted_by=str(current_user.id),
    )
    _reviews[review_id] = record
    log.info("content_submitted_for_review", review_id=review_id, content_id=content_id)

    return ReviewOut(
        review_id=review_id,
        content_id=content_id,
        brand_id=item.brand_id,
        status="pending",
        reviewer_comment=None,
    )


@router.patch("/content/{review_id}/review", summary="Approve or reject content (approver_a only)")
async def review_content(
    review_id: str,
    decision: ReviewDecision,
    current_user: ApproverAOnly,
) -> ReviewOut:
    from app.modules.creative.router import _content_items

    record = _reviews.get(review_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Review not found")
    if record.status != "pending":
        raise HTTPException(status_code=409, detail=f"Review already '{record.status}'")

    status_map = {
        "approve": "approved",
        "reject": "rejected",
        "request_changes": "changes_requested",
    }
    new_status = status_map[decision.decision]
    record.status = new_status
    record.reviewer_id = str(current_user.id)
    record.reviewer_comment = decision.comment or None

    item = _content_items.get(record.content_id)
    if item is not None:
        item.status = new_status

    log.info("content_reviewed", review_id=review_id, decision=decision.decision, reviewer=current_user.id)

    return ReviewOut(
        review_id=review_id,
        content_id=record.content_id,
        brand_id=record.brand_id,
        status=new_status,
        reviewer_comment=record.reviewer_comment,
    )


@router.get("/content/{review_id}", summary="Get review status")
async def get_review(
    review_id: str,
    current_user: AnyAuthenticated,
) -> ReviewOut:
    record = _reviews.get(review_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Review not found")
    return ReviewOut(
        review_id=review_id,
        content_id=record.content_id,
        brand_id=record.brand_id,
        status=record.status,
        reviewer_comment=record.reviewer_comment,
    )


@router.post("/image/audit", summary="Audit an image for brand compliance via Claude Vision (approver_b)")
async def audit_image(
    brand_id: str,
    current_user: ApproverBOnly,
    image: UploadFile = File(...),
) -> AuditOut:
    allowed_types = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    if image.content_type not in allowed_types:
        raise HTTPException(status_code=415, detail=f"Unsupported image type: {image.content_type}")

    raw_bytes = await image.read()
    if len(raw_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (max 5 MB)")

    image_b64 = base64.standard_b64encode(raw_bytes).decode()
    media_type = image.content_type or "image/jpeg"

    try:
        result = await _run_image_audit(image_b64, media_type, brand_id, image.filename or "upload")
    except Exception as exc:
        log.error("image_audit_error", brand_id=brand_id, error=str(exc))
        raise HTTPException(status_code=500, detail=f"Audit failed: {exc}")

    audit_id = str(uuid.uuid4())
    audit = ImageAuditResult(
        audit_id=audit_id,
        brand_id=brand_id,
        filename=image.filename or "upload",
        passed=result.get("passed", False),
        overall_score=float(result.get("overall_score", 0.0)),
        findings=result.get("findings", []),
        recommendations=result.get("recommendations", []),
        audited_by=str(current_user.id),
    )
    _audits[audit_id] = audit
    log.info("image_audit_complete", audit_id=audit_id, brand_id=brand_id, passed=audit.passed)

    return AuditOut(
        audit_id=audit_id,
        brand_id=brand_id,
        filename=audit.filename,
        passed=audit.passed,
        overall_score=audit.overall_score,
        findings=audit.findings,
        recommendations=audit.recommendations,
    )


@router.get("/audits/{brand_id}", summary="List image audits for a brand")
async def list_audits(
    brand_id: str,
    current_user: AnyAuthenticated,
) -> list[AuditOut]:
    return [
        AuditOut(
            audit_id=a.audit_id,
            brand_id=a.brand_id,
            filename=a.filename,
            passed=a.passed,
            overall_score=a.overall_score,
            findings=a.findings,
            recommendations=a.recommendations,
        )
        for a in _audits.values()
        if a.brand_id == brand_id
    ]
