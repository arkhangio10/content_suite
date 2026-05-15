"""REST-based persistence to Supabase using the service_role key.

This module is the demo-grade fallback when the asyncpg pool isn't reachable
(common on Render free tier with a cross-region Supavisor pooler). All writes
are best-effort: failures log a warning but never raise — the in-memory dicts
in each module stay as the source of truth during a session.

All requests go through PostgREST at {SUPABASE_URL}/rest/v1/* with the
service_role key (bypasses RLS). Timeouts are tight (8s) so a slow Supabase
never blocks the user-facing flow.
"""

from __future__ import annotations

import json
from typing import Any, Iterable

import httpx
import structlog

from app.config import get_settings

log = structlog.get_logger(__name__)

_TIMEOUT = httpx.Timeout(4.0, connect=2.0)


def _headers(prefer: str = "return=minimal") -> dict[str, str]:
    settings = get_settings()
    if not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY not configured")
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


def _base_url() -> str:
    return get_settings().supabase_url.rstrip("/")


# ---------------------------------------------------------------------------
# Low-level helpers
# ---------------------------------------------------------------------------


async def _post(table: str, payload: dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, Any]]:
    """INSERT row(s). Returns the inserted rows (Prefer: return=representation)."""
    url = f"{_base_url()}/rest/v1/{table}"
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.post(url, headers=_headers("return=representation"), json=payload)
        if res.status_code >= 400:
            log.warning(
                "rest_insert_failed",
                table=table,
                status=res.status_code,
                body=res.text[:400],
            )
            return []
        return res.json() if res.text else []


async def _upsert(table: str, payload: dict[str, Any], on_conflict: str) -> list[dict[str, Any]]:
    """UPSERT a row keyed on `on_conflict` columns."""
    url = f"{_base_url()}/rest/v1/{table}"
    headers = _headers("resolution=merge-duplicates,return=representation")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.post(
            url,
            headers=headers,
            params={"on_conflict": on_conflict},
            json=payload,
        )
        if res.status_code >= 400:
            log.warning(
                "rest_upsert_failed",
                table=table,
                status=res.status_code,
                body=res.text[:400],
            )
            return []
        return res.json() if res.text else []


async def _patch(table: str, eq: dict[str, str], payload: dict[str, Any]) -> int:
    """UPDATE rows matching the eq filters. Returns count of affected rows (best-effort)."""
    url = f"{_base_url()}/rest/v1/{table}"
    params = {k: f"eq.{v}" for k, v in eq.items()}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.patch(
            url,
            headers=_headers("return=representation"),
            params=params,
            json=payload,
        )
        if res.status_code >= 400:
            log.warning(
                "rest_update_failed",
                table=table,
                status=res.status_code,
                body=res.text[:400],
            )
            return 0
        try:
            return len(res.json())
        except Exception:
            return 0


async def _select(
    table: str,
    *,
    select: str = "*",
    eq: dict[str, str] | None = None,
    order: str | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    """SELECT rows. Returns [] on failure."""
    url = f"{_base_url()}/rest/v1/{table}"
    params: dict[str, str] = {"select": select}
    if eq:
        for k, v in eq.items():
            params[k] = f"eq.{v}"
    if order:
        params["order"] = order
    if limit:
        params["limit"] = str(limit)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        res = await client.get(url, headers=_headers("count=none"), params=params)
        if res.status_code >= 400:
            log.warning(
                "rest_select_failed",
                table=table,
                status=res.status_code,
                body=res.text[:400],
            )
            return []
        return res.json()


# ---------------------------------------------------------------------------
# brand_manuals
# ---------------------------------------------------------------------------


async def save_brand_manual(
    *,
    job_id: str,
    brand_id: str,
    version: int,
    manual_json: dict[str, Any] | str,
    status: str,
    trace_id: str | None,
    judge_scores: dict[str, Any] | None,
    partial_evidence: bool,
    cost_usd: float | None,
    cache_hit_rate: float | None,
    creator_id: str,
) -> bool:
    """Insert (or upsert by brand_id+version) a brand_manuals row.

    `manual_json` may be a dict or a pre-serialized JSON string. We always
    send it as a dict so PostgREST stores it in the jsonb column correctly.
    """
    if isinstance(manual_json, str):
        try:
            manual_json = json.loads(manual_json)
        except json.JSONDecodeError:
            log.warning("save_brand_manual_bad_json", brand_id=brand_id)
            return False

    payload = {
        "id": job_id,
        "brand_id": brand_id,
        "version": version,
        "manual_json": manual_json,
        "status": _map_manual_status(status),
        "trace_id": trace_id,
        "judge_scores": judge_scores,
        "partial_evidence": partial_evidence,
        "cost_usd": cost_usd,
        "cache_hit_rate": cache_hit_rate,
        "creator_id": creator_id,
    }
    rows = await _upsert("brand_manuals", payload, on_conflict="brand_id,version")
    if rows:
        log.info("brand_manual_persisted", brand_id=brand_id, version=version, rows=len(rows))
        return True
    return False


def _map_manual_status(s: str) -> str:
    """Map pipeline status strings to the brand_manual_status enum."""
    mapping = {
        "complete": "approved",
        "completed": "approved",
        "pass": "approved",
        "running": "generating",
        "needs_review": "needs_human_review",
        "incomplete_budget_hit": "incomplete_budget_hit",
        "failed": "failed",
    }
    return mapping.get(s, "needs_human_review")


async def load_recent_brand_manuals(limit: int = 20) -> list[dict[str, Any]]:
    """Read recent manuals for startup hydration."""
    return await _select(
        "brand_manuals",
        select="id,brand_id,version,manual_json,status,trace_id,judge_scores,cost_usd,cache_hit_rate,creator_id,created_at",
        order="created_at.desc",
        limit=limit,
    )


async def load_brand_manual_by_brand_id(brand_id: str) -> dict[str, Any] | None:
    """Read the latest brand manual for a given brand_id (REST fallback)."""
    rows = await _select(
        "brand_manuals",
        select="id,brand_id,version,manual_json,status,judge_scores,cost_usd,cache_hit_rate,creator_id,created_at",
        eq={"brand_id": brand_id},
        order="version.desc",
        limit=1,
    )
    return rows[0] if rows else None


# ---------------------------------------------------------------------------
# content_items
# ---------------------------------------------------------------------------


_CONTENT_TYPE_MAP = {
    # UI / API types → DB enum values (after migration applied)
    "product_description": "product_description",
    "social_post": "social_post",
    "tagline": "tagline",
    "email_subject": "email_subject",
    "ad_copy": "ad_copy",
    "video_script": "video_script",
    "image_prompt": "image_prompt",
}

_CONTENT_STATUS_MAP = {
    "draft": "draft",
    "submitted": "pending_approver_a",
    "pending_approver_a": "pending_approver_a",
    "pending_approver_b": "pending_approver_b",
    "approved": "approved",
    "rejected": "rejected",
    "changes_requested": "rejected",
}


async def save_content_item(
    *,
    content_id: str,
    brand_id: str,
    manual_version: int,
    content_type: str,
    prompt: str,
    generated_text: str,
    brand_context_used: list[str],
    creator_id: str,
    status: str = "draft",
) -> bool:
    payload = {
        "id": content_id,
        "brand_id": brand_id,
        "manual_version": manual_version,
        "type": _CONTENT_TYPE_MAP.get(content_type, "product_description"),
        "prompt_context": prompt[:2000],
        "content_json": {"text": generated_text, "content_type": content_type},
        "retrieved_chunks": [{"excerpt": c} for c in brand_context_used],
        "status": _CONTENT_STATUS_MAP.get(status, "draft"),
        "creator_id": creator_id,
    }
    rows = await _post("content_items", payload)
    if rows:
        log.info("content_item_persisted", content_id=content_id, brand_id=brand_id)
        return True
    return False


async def update_content_item_status(
    *,
    content_id: str,
    status: str,
    approver_a_id: str | None = None,
    approver_b_id: str | None = None,
    rejection_reason: str | None = None,
    vision_audit: dict[str, Any] | None = None,
) -> bool:
    payload: dict[str, Any] = {"status": _CONTENT_STATUS_MAP.get(status, status)}
    if approver_a_id is not None:
        payload["approver_a_id"] = approver_a_id
    if approver_b_id is not None:
        payload["approver_b_id"] = approver_b_id
    if rejection_reason is not None:
        payload["rejection_reason"] = rejection_reason
    if vision_audit is not None:
        payload["vision_audit"] = vision_audit
    if status == "approved":
        from datetime import datetime, timezone
        payload["approved_at"] = datetime.now(timezone.utc).isoformat()
    affected = await _patch("content_items", {"id": content_id}, payload)
    return affected > 0


async def load_recent_content_items(limit: int = 50) -> list[dict[str, Any]]:
    return await _select(
        "content_items",
        select="id,brand_id,manual_version,type,prompt_context,content_json,retrieved_chunks,status,creator_id,approver_a_id,vision_audit,rejection_reason,created_at",
        order="created_at.desc",
        limit=limit,
    )


# ---------------------------------------------------------------------------
# audit_logs
# ---------------------------------------------------------------------------


async def save_audit_log(
    *,
    action: str,
    actor_id: str,
    actor_role: str,
    content_item_id: str | None = None,
    brand_manual_id: str | None = None,
    from_status: str | None = None,
    to_status: str | None = None,
    notes: str | None = None,
    payload: dict[str, Any] | None = None,
    trace_id: str | None = None,
) -> bool:
    body = {
        "action": action,
        "actor_id": actor_id,
        "actor_role": actor_role,
        "content_item_id": content_item_id,
        "brand_manual_id": brand_manual_id,
        "from_status": from_status,
        "to_status": to_status,
        "notes": notes,
        "payload": payload,
        "trace_id": trace_id,
    }
    rows = await _post("audit_logs", body)
    return bool(rows)


async def load_recent_audit_logs(limit: int = 50) -> list[dict[str, Any]]:
    return await _select(
        "audit_logs",
        select="id,action,actor_id,actor_role,content_item_id,brand_manual_id,from_status,to_status,notes,trace_id,created_at",
        order="created_at.desc",
        limit=limit,
    )
