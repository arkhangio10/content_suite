"""Startup hydration — rebuild in-memory state from Supabase REST.

Called from the FastAPI lifespan after the DB pool is initialised. Lets the
backend survive a Render cold-start without losing the visible history of
brand manuals, content items, and reviews.

Best-effort: any failure is logged and ignored — the app boots either way.
"""

from __future__ import annotations

import structlog

from app.modules.brand_dna.schemas import BrandManual

log = structlog.get_logger(__name__)


async def hydrate_state() -> None:
    """Populate _jobs, _content_items, _reviews from recent Supabase rows."""
    try:
        from app.db.persistence_rest import (
            load_recent_brand_manuals,
            load_recent_content_items,
        )
    except Exception as exc:
        log.warning("hydration_import_failed", error=str(exc))
        return

    try:
        await _hydrate_brand_manuals(await load_recent_brand_manuals(limit=20))
    except Exception as exc:
        log.warning("hydration_brand_manuals_failed", error=str(exc))

    try:
        await _hydrate_content_items(await load_recent_content_items(limit=50))
    except Exception as exc:
        log.warning("hydration_content_items_failed", error=str(exc))


async def _hydrate_brand_manuals(rows: list[dict]) -> None:
    if not rows:
        log.info("hydration_brand_manuals_empty")
        return

    from datetime import datetime
    from app.modules.brand_dna.router import _jobs, JobState

    hydrated = 0
    for row in rows:
        try:
            manual = BrandManual.model_validate(row["manual_json"])
        except Exception as exc:
            log.warning("hydrate_manual_validation_failed", brand=row.get("brand_id"), error=str(exc))
            continue
        job_id = row["id"]
        if job_id in _jobs:
            continue
        budget_summary = None
        if row.get("cost_usd") is not None:
            budget_summary = {
                "spent_usd": float(row["cost_usd"]) if row["cost_usd"] is not None else None,
                "cache_hit_rate": float(row["cache_hit_rate"]) if row.get("cache_hit_rate") is not None else None,
            }
        completed = None
        if row.get("created_at"):
            try:
                completed = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
            except Exception:
                completed = None
        _jobs[job_id] = JobState(
            job_id=job_id,
            brand_id=row["brand_id"],
            creator_id=row["creator_id"],
            status="complete",
            phase="done",
            manual=manual,
            budget_summary=budget_summary,
            judge_scores=row.get("judge_scores"),
            completed_at=completed,
        )
        hydrated += 1
    log.info("hydration_brand_manuals_done", hydrated=hydrated)


async def _hydrate_content_items(rows: list[dict]) -> None:
    if not rows:
        log.info("hydration_content_items_empty")
        return

    from app.modules.creative.router import _content_items, ContentItem
    from app.modules.governance.router import _reviews, ApprovalRecord

    # Reverse DB-status mapping for the in-memory model
    status_reverse = {
        "draft": "draft",
        "pending_approver_a": "submitted",
        "pending_approver_b": "submitted",
        "approved": "approved",
        "rejected": "rejected",
    }

    hydrated_content = 0
    hydrated_reviews = 0
    for row in rows:
        content_id = row["id"]
        if content_id in _content_items:
            continue
        body = row.get("content_json") or {}
        if isinstance(body, str):
            try:
                import json
                body = json.loads(body)
            except Exception:
                body = {"text": body}
        chunks_raw = row.get("retrieved_chunks") or []
        if isinstance(chunks_raw, str):
            try:
                import json
                chunks_raw = json.loads(chunks_raw)
            except Exception:
                chunks_raw = []
        chunks = [
            c.get("excerpt", "") if isinstance(c, dict) else str(c)
            for c in chunks_raw
        ]
        ui_type = body.get("content_type") or row.get("type") or "product_description"
        memory_status = status_reverse.get(row.get("status", "draft"), "draft")
        _content_items[content_id] = ContentItem(
            content_id=content_id,
            brand_id=row["brand_id"],
            content_type=ui_type,
            prompt=row.get("prompt_context") or "",
            generated_text=body.get("text", "") if isinstance(body, dict) else "",
            brand_context_used=chunks,
            created_by=row["creator_id"],
            status=memory_status,
        )
        hydrated_content += 1

        # Rebuild a review record if this content is mid-flight or already decided
        if row.get("status") in ("pending_approver_a", "approved", "rejected"):
            import uuid as _uuid
            review_id = str(_uuid.uuid4())
            review_status = {
                "pending_approver_a": "pending",
                "approved": "approved",
                "rejected": "rejected",
            }[row["status"]]
            _reviews[review_id] = ApprovalRecord(
                review_id=review_id,
                content_id=content_id,
                brand_id=row["brand_id"],
                submitted_by=row["creator_id"],
                status=review_status,
                reviewer_id=row.get("approver_a_id"),
                reviewer_comment=row.get("rejection_reason"),
            )
            hydrated_reviews += 1

    log.info("hydration_content_items_done", content=hydrated_content, reviews=hydrated_reviews)
