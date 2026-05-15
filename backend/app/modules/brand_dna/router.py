from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Annotated

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.auth.dependencies import AnyAuthenticated, CreatorOnly, CurrentUser
from app.budget import TraceBudget
from app.config import get_settings
from app.llm.claude_client import call_claude, extract_json
from app.modules.brand_dna.schemas import BrandManual, ProductBrief

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/brand-dna", tags=["brand_dna"])


# ─────────────────────────────────────────────
# In-memory job registry (Redis in production)
# ─────────────────────────────────────────────

@dataclass
class JobState:
    job_id: str
    brand_id: str
    creator_id: str
    status: str = "running"
    manual: BrandManual | None = None
    error: str | None = None
    budget_summary: dict[str, Any] | None = None
    judge_scores: dict[str, Any] | None = None
    langfuse_trace_url: str | None = None
    started_at: datetime = field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None
    # Reference to live TraceBudget so GET /jobs/{id} can report cost in real time
    budget_ref: TraceBudget | None = None
    # Coarse-grained pipeline phase for the UI progress indicator
    phase: str = "planning"  # planning | researching | synthesizing | evaluating | repairing | done


_jobs: dict[str, JobState] = {}


# ─────────────────────────────────────────────
# Background pipeline runner
# ─────────────────────────────────────────────

async def _run_pipeline_bg(
    job_id: str,
    brief: ProductBrief,
    budget: TraceBudget,
) -> None:
    from app.modules.brand_dna.embedding import embed_and_store
    from app.modules.brand_dna.orchestrator import run_brand_dna_pipeline

    try:
        db_pool = None
        try:
            from app.db.client import get_pool
            db_pool = get_pool()
        except RuntimeError:
            pass

        def _update_phase(p: str) -> None:
            if job_id in _jobs:
                _jobs[job_id].phase = p

        result = await run_brand_dna_pipeline(
            brief, budget, db_pool=db_pool, phase_callback=_update_phase,
        )
        job = _jobs[job_id]
        job.status = result.status
        job.manual = result.manual
        job.budget_summary = result.budget_summary
        job.judge_scores = result.judge_scores
        job.error = result.error
        job.completed_at = datetime.utcnow()

        if result.manual is not None and db_pool is not None:
            try:
                await embed_and_store(result.manual, db_pool)
            except Exception as exc:
                log.error("embed_failed", job_id=job_id, error=str(exc))

        if result.manual is not None and db_pool is not None:
            try:
                await _persist_manual(job_id, brief, result, db_pool)
            except Exception as exc:
                log.error("persist_manual_failed", job_id=job_id, error=str(exc))

    except RuntimeError as exc:
        job = _jobs[job_id]
        job.status = "failed"
        job.error = str(exc)
        job.completed_at = datetime.utcnow()
        log.error("pipeline_worker_abort", job_id=job_id, error=str(exc))
    except Exception as exc:
        job = _jobs[job_id]
        job.status = "failed"
        job.error = str(exc)
        job.completed_at = datetime.utcnow()
        log.error("pipeline_bg_error", job_id=job_id, error=str(exc))


async def _persist_manual(
    job_id: str, brief: ProductBrief, result: Any, db_pool: Any
) -> None:
    from app.db.client import acquire_conn
    manual = result.manual
    async with acquire_conn() as conn:
        await conn.execute(
            """
            insert into public.brand_manuals
              (id, brand_id, version, manual_json, status, trace_id,
               judge_scores, partial_evidence, cost_usd, cache_hit_rate,
               product_brief_id, creator_id)
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            on conflict (brand_id, version) do update set
              manual_json = excluded.manual_json,
              status      = excluded.status,
              judge_scores = excluded.judge_scores,
              cost_usd    = excluded.cost_usd,
              updated_at  = now()
            """,
            job_id,
            manual.meta.brand_id,
            manual.meta.version,
            manual.model_dump_json(by_alias=True),
            result.status,
            result.trace_id,
            str(result.judge_scores),
            result.partial_evidence,
            result.budget_summary.get("spent_usd") if result.budget_summary else None,
            result.budget_summary.get("cache_hit_rate") if result.budget_summary else None,
            None,
            _jobs[job_id].creator_id,
        )


# ─────────────────────────────────────────────
# Brief extraction (AI-powered, cheap — Haiku 4.5)
# ─────────────────────────────────────────────

class ExtractBriefRequest(BaseModel):
    raw_text: str = Field(..., min_length=10, max_length=2000)


class ExtractedBrief(BaseModel):
    brand_id: str = Field(..., description="Brand identifier — UPPERCASE")
    category: str = Field(..., description="One of: Alimentos, Bebidas, Cuidado Personal, Limpieza del Hogar, Otros")
    audience: str = Field(..., description="Target audience description")
    tone_hint: str = Field(..., description="Tone descriptors, 2-4 words")
    concept: str = Field(..., description="Product concept (one sentence)")
    constraints: list[str] = Field(default_factory=list, description="Detected constraints / forbidden claims")
    launch_id: str = Field(..., description="Auto-generated launch identifier")
    confidence: float = Field(default=0.85, ge=0, le=1)


_EXTRACT_BRIEF_SYSTEM = """Eres un analista de marketing que extrae briefs estructurados de texto en lenguaje natural.

El usuario describe un lanzamiento de producto en español peruano. Tu trabajo es extraer los siguientes campos en JSON:

- **brand_id**: nombre de la marca en MAYÚSCULAS, sin tildes (ej. "GLACITAS", "DON VITTORIO", "AJI-NO-MEN").
  Marcas Alicorp conocidas: PRIMOR, BOLIVAR, NEGRITA, DON VITTORIO, OPAL, SAYÓN, GLACITAS, FIELD, ANÚA, AJI-NO-MEN, MARSELLA.
  Si el usuario menciona una marca nueva, úsala tal cual en mayúsculas.
- **category**: exactamente una de: "Alimentos", "Bebidas", "Cuidado Personal", "Limpieza del Hogar", "Otros".
- **audience**: descripción concisa de la audiencia (edad, NSE, ubicación, hábitos). Una oración.
- **tone_hint**: 2-4 adjetivos que describen el tono (ej. "cálido, cercano, confiable" o "divertido, barrial, joven").
- **concept**: el concepto del producto en una oración clara.
- **constraints**: array de restricciones detectadas (claims prohibidos, ingredientes vetados, requisitos especiales). Si el usuario dice "sin azúcar" → ["Sin azúcar añadida"]. Si dice "evitar 100% natural" → ["No usar '100% natural'"].
- **launch_id**: genera un id formato LCH-2026-XXX donde XXX es 3 dígitos aleatorios (40-999).
- **confidence**: tu confianza en la extracción, de 0 a 1. Baja si el texto es muy ambiguo.

Devuelve SOLO JSON válido. Sin texto antes ni después. Sin markdown fences.
"""


@router.post(
    "/extract-brief",
    summary="Extract structured brief fields from natural-language text (Claude Haiku)",
)
async def extract_brief_endpoint(
    req: ExtractBriefRequest,
    user: AnyAuthenticated,
) -> ExtractedBrief:
    settings = get_settings()
    budget = TraceBudget(trace_id=str(uuid.uuid4()), ceiling_usd=0.05)

    try:
        response = await call_claude(
            model=settings.claude_model_worker,  # Haiku 4.5 — fast + cheap
            system=_EXTRACT_BRIEF_SYSTEM,
            messages=[{"role": "user", "content": req.raw_text}],
            max_tokens=512,
            budget=budget,
            span="extract_brief",
            allow_groq_fallback=False,
        )
        raw = extract_json(response["text"])
        # Pydantic validates the shape
        return ExtractedBrief.model_validate(raw)
    except Exception as exc:
        log.error("extract_brief_failed", error=str(exc))
        raise HTTPException(
            status_code=502,
            detail=f"Brief extraction failed: {exc}",
        )


# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────

@router.post(
    "/generate",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start brand manual generation (async)",
)
async def generate_brand_dna(
    brief: ProductBrief,
    background_tasks: BackgroundTasks,
    user: CreatorOnly,
) -> dict[str, Any]:
    settings = get_settings()
    job_id = str(uuid.uuid4())
    trace_id = job_id
    brief.requested_by = uuid.UUID(user.id)
    if not brief.brand_id:
        brief.brand_id = f"{brief.launch_id}_{brief.category}".lower().replace(" ", "_")

    budget = TraceBudget(trace_id=trace_id, ceiling_usd=settings.cost_ceiling_usd)
    _jobs[job_id] = JobState(
        job_id=job_id,
        brand_id=brief.brand_id,
        creator_id=user.id,
        budget_ref=budget,  # so GET /jobs/{id} can read spent_usd in real time
    )

    asyncio.create_task(_run_pipeline_bg(job_id, brief, budget))
    log.info("generation_started", job_id=job_id, brand_id=brief.brand_id, user=user.id)

    return {
        "job_id": job_id,
        "status": "running",
        "brand_id": brief.brand_id,
        "trace_id": trace_id,
    }


@router.get("/jobs/{job_id}", summary="Poll job status")
async def get_job(job_id: str, user: AnyAuthenticated) -> dict[str, Any]:
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    if job.creator_id != user.id and user.role not in ("approver_a", "approver_b"):
        raise HTTPException(status_code=403, detail="Access denied")

    # Prefer live budget from TraceBudget while running; fall back to the frozen
    # summary after the pipeline completes.
    if job.budget_summary is not None:
        budget_payload = job.budget_summary
    elif job.budget_ref is not None:
        budget_payload = job.budget_ref.summary()
    else:
        budget_payload = None

    response: dict[str, Any] = {
        "job_id": job.job_id,
        "status": job.status,
        "brand_id": job.brand_id,
        "phase": job.phase,
        "started_at": job.started_at.isoformat(),
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        "budget": budget_payload,
        "judge_scores": job.judge_scores,
        "error": job.error,
    }

    if job.manual is not None:
        response["manual"] = job.manual.model_dump(by_alias=True)

    return response


@router.get("/list", summary="List all brand manuals (in-memory + DB)")
async def list_brand_manuals(user: AnyAuthenticated) -> dict[str, Any]:
    """
    Return a flat list of all brand manuals the user can see, sorted newest first.

    Sources, in priority order:
      1. In-memory _jobs (current process lifetime)
      2. (Future) DB persistence via service_role REST
    """
    items: list[dict[str, Any]] = []
    seen_brands: set[str] = set()

    for job in reversed(list(_jobs.values())):
        # Filter by ownership: creator sees own; approvers see all
        if (
            job.creator_id != user.id
            and user.role not in ("approver_a", "approver_b")
        ):
            continue
        if job.manual is None:
            continue
        # Dedupe by brand_id, keep latest
        if job.brand_id in seen_brands:
            continue
        seen_brands.add(job.brand_id)

        items.append(
            {
                "job_id": job.job_id,
                "brand_id": job.brand_id,
                "status": job.status,
                "phase": job.phase,
                "started_at": job.started_at.isoformat(),
                "completed_at": job.completed_at.isoformat() if job.completed_at else None,
                "judge_scores": job.judge_scores,
                "budget": job.budget_summary or (job.budget_ref.summary() if job.budget_ref else None),
                "core_idea": job.manual.brand_essence.core_idea if job.manual else None,
                "tagline": job.manual.taglines[0] if job.manual and job.manual.taglines else None,
                "version": job.manual.meta.version if job.manual else 1,
                "language": job.manual.meta.language if job.manual else "es-PE",
                "creator_id": job.creator_id,
            }
        )

    return {"manuals": items, "count": len(items), "source": "memory"}


@router.get("/{brand_id}", summary="Get latest brand manual")
async def get_brand_manual(brand_id: str, user: AnyAuthenticated) -> dict[str, Any]:
    # Try in-memory first (jobs completed this session)
    for job in reversed(list(_jobs.values())):
        if job.brand_id == brand_id and job.manual is not None:
            return {
                "brand_id": brand_id,
                "version": job.manual.meta.version,
                "status": job.status,
                "manual": job.manual.model_dump(by_alias=True),
                "source": "cache",
            }

    # Fall back to DB
    try:
        from app.db.client import fetch_one
        row = await fetch_one(
            """
            select id, version, manual_json, status, judge_scores, cost_usd, cache_hit_rate
            from public.brand_manuals
            where brand_id = $1 and deleted_at is null
            order by version desc
            limit 1
            """,
            brand_id,
        )
        if row is None:
            raise HTTPException(status_code=404, detail=f"Brand manual for '{brand_id}' not found")
        return {
            "brand_id": brand_id,
            "version": row["version"],
            "status": row["status"],
            "manual": row["manual_json"],
            "source": "database",
        }
    except ImportError:
        raise HTTPException(status_code=404, detail=f"Brand manual for '{brand_id}' not found")


@router.get("/{brand_id}/retrieve", summary="RAG retrieval from brand manual")
async def retrieve_brand_chunks(
    brand_id: str,
    query: Annotated[str, Query(min_length=3, description="Natural language query")],
    user: AnyAuthenticated,
    top_k: Annotated[int, Query(ge=1, le=20)] = 8,
    section: str | None = Query(default=None),
) -> dict[str, Any]:
    from app.modules.brand_dna.embedding import embed_texts

    try:
        query_embeddings = await embed_texts([query])
        query_vec = query_embeddings[0]
    except Exception as exc:
        log.error("retrieval_embed_failed", error=str(exc))
        raise HTTPException(status_code=503, detail=f"Embedding service unavailable: {exc}")

    try:
        from app.db.client import fetch_all
        vec_str = "[" + ",".join(f"{v:.8f}" for v in query_vec) + "]"
        rows = await fetch_all(
            """
            select * from public.match_brand_chunks($1::vector, $2, $3, $4, $5)
            """,
            vec_str,
            query,
            brand_id,
            top_k,
            section,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Database retrieval failed: {exc}")

    return {
        "brand_id": brand_id,
        "query": query,
        "top_k": top_k,
        "results": [dict(row) for row in rows],
    }
