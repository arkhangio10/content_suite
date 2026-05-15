# Content Suite — Alicorp Technical Challenge

AI platform that solves **brand consistency at scale** for product launches in Peru. A creator submits a `ProductBrief`; the system runs an orchestrator-workers agent to research market, audience, competitors, trends and culture; synthesises a structured `BrandManual` JSON; embeds it into pgvector for RAG; then governs every downstream artefact through an RBAC approval workflow plus multimodal Claude Vision image audit.

**Deadline:** Friday May 15, 2026 — Prediqtdata / Alicorp.

---

## Tech Stack

| Layer          | Choice                                                                       |
|----------------|------------------------------------------------------------------------------|
| Backend        | FastAPI (Python 3.12+) managed with **uv**                                   |
| Frontend       | React + Vite + TailwindCSS                                                   |
| Database       | Supabase (Postgres + pgvector + Auth + RLS)                                  |
| LLMs           | Claude Opus 4.7 (synthesiser) · Sonnet 4.6 (orchestrator/evaluator/vision) · Haiku 4.5 (workers) |
| Fallback LLM   | Groq Llama 3.3 70B (worker fallback when Claude rate-limits)                 |
| Embeddings     | Voyage AI `voyage-multilingual-2` (1024-dim, HNSW index)                     |
| Web search     | Anthropic native `web_search_20250305`                                       |
| Observability  | Langfuse v4 + OpenInference Anthropic instrumentor (auto-traces all calls)   |
| Hosting        | Render (API) + Vercel (frontend)                                             |

---

## Module Overview

### Module I — Brand DNA Architect (core)

Orchestrator-workers agent pipeline:

```
ProductBrief
    │
    ▼
Orchestrator (Sonnet 4.6) ─── Plans 5 research questions
    │
    ├─► competitive_scan   ─┐
    ├─► audience_research  ─┤
    ├─► trend_analysis     ─┤─── asyncio.gather (parallel) ─► research_findings DB
    ├─► cultural_context   ─┤
    └─► positioning_analysis┘
            │
            ▼
    Synthesiser (Opus 4.7 + extended thinking)
            │
            ▼
    Evaluator (Sonnet 4.6) ── LLM-as-judge (4 dimensions)
            │
    pass ──► done          reject ──► needs_human_review
            │
    repair ─► JSON-Patch (RFC 6902) ── max 2 iterations
            │
            ▼
    BrandManual JSON ── chunked ── embedded (Voyage) ── stored in pgvector
```

**Cost targets:** $0.87 typical | $3.00 ceiling | ~44% cache hit rate (first run; 60%+ after warm)

**Key schemas:** `ProductBrief` → `BrandManual` (full Pydantic v2 with provenance, confidence, persona, vocabulary invariants)

### Module II — Creative Engine (RAG)

Retrieves relevant brand manual chunks from pgvector before every generation. Claude Sonnet 4.6 generates content that follows the brand DNA.

Endpoints:
- `POST /api/v1/creative/generate` — generate social post / tagline / product description / ad copy / email subject
- `POST /api/v1/creative/{content_id}/submit` — submit draft for governance review
- `GET /api/v1/creative/{content_id}` — retrieve item
- `GET /api/v1/creative/brand/{brand_id}` — list brand's content

### Module III — Governance & Multimodal Audit (RBAC + Vision)

Three-role RBAC (`creator` → `approver_a` → `approver_b`) enforced at both FastAPI dependency injection and Supabase RLS layers.

Image audit uses **Claude Sonnet 4.6 vision** to compare uploaded images against brand manual guidelines (color palette, typography, imagery style, forbidden vocabulary in text elements).

Endpoints:
- `POST /api/v1/governance/content/{content_id}/submit` — submit for approval
- `PATCH /api/v1/governance/content/{review_id}/review` — approve / reject / request changes
- `POST /api/v1/governance/image/audit?brand_id=xxx` — multipart image upload + vision audit
- `GET /api/v1/governance/audits/{brand_id}` — list audits

### Module IV — Observability

Every Claude call is traced via `openinference-instrumentation-anthropic` (OpenTelemetry). Langfuse receives:
- Nested spans: `brand_dna_generate` → `orchestrator_plan` → `worker` (×5) → `synthesizer` → `evaluator` → `repair`
- Token counts, cache hit/miss, cost per call
- Judge scores attached to the root trace via `score_trace("judge_overall", ...)`

---

## Local Development

```powershell
# 1. Copy env template
Copy-Item v1\.env.example v1\.env
# Fill in: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET,
#           VOYAGE_API_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, GROQ_API_KEY

# 2. Install backend deps
cd v1\backend
py -3.12 -m uv sync

# 3. Apply DB schema in Supabase SQL editor
#    File: v1/backend/app/db/schemas.sql

# 4. Run the API server
py -3.12 -m uv run uvicorn app.main:app --reload --port 8000

# 5. Smoke-test the pipeline (costs ~$0.90 in API credits)
py -3.12 -m uv run python scripts/test_pipeline.py
```

- `GET http://localhost:8000/health` → `{"status": "ok", "version": "0.1.0"}`
- `GET http://localhost:8000/docs` → OpenAPI interactive docs

---

## Architecture

```
                ┌──────────────────────────────────────────────────────────┐
                │                Frontend (React + Vite)                   │
                └──────────────────────────────────────────────────────────┘
                                          │ JWT (Supabase Auth)
                                          ▼
                ┌──────────────────────────────────────────────────────────┐
                │                  FastAPI  (Render)                       │
                │  /brand-dna    /creative    /governance    /health       │
                └──────────────────────────────────────────────────────────┘
          ┌──────────────┬────────────────┬───────────────────────┐
          ▼              ▼                ▼                       ▼
   Module I           Module II       Module III              Langfuse
 Orchestrator       RAG Generate    RBAC Workflow           Observability
    + Workers       (Sonnet 4.6)    + Claude Vision            (traces)
    + Synth                         (Sonnet 4.6)
    + Judge
          │              │                │
          └──────────────┴────────────────┘
                          │
                          ▼
              ┌──────────────────────────┐
              │  Supabase (Postgres)     │
              │  ├ brand_manuals         │
              │  ├ brand_chunks (HNSW)   │
              │  ├ research_findings     │
              │  ├ content_items         │
              │  └ audit_logs            │
              └──────────────────────────┘
```

---

## RBAC Roles

| Role        | Permissions                                                        |
|-------------|--------------------------------------------------------------------|
| `creator`   | Submit briefs, generate content, submit for review                 |
| `approver_a`| Review and approve/reject text content                             |
| `approver_b`| Upload images, run Claude Vision audits                            |

Enforced via Supabase Row Level Security **and** FastAPI `Depends(require_role(...))`.

## Demo Credentials

| Role        | Email                       | Password  |
|-------------|-----------------------------|-----------|
| creator     | `creator@demo.alicorp`      | _(TBA)_   |
| approver_a  | `approver_a@demo.alicorp`   | _(TBA)_   |
| approver_b  | `approver_b@demo.alicorp`   | _(TBA)_   |

## Langfuse

Traces at `https://cloud.langfuse.com` — every `brand_dna_generate` trace shows:
- Orchestrator planning span
- 5 parallel worker spans (each with tool calls: web_search, competitor_scrape, INEI stats, Reddit sentiment, Google Trends)
- Synthesiser span (Opus 4.7 + adaptive thinking)
- Evaluator span with judge scores
- Optional repair span (JSON Patch)
- Total cost, cache hit rate

## File Layout

```
v1/
├── CLAUDE.md               ← project rules (for AI assistant)
├── README.md               ← this file
├── .env.example
├── .gitignore
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py         ← FastAPI app factory
│   │   ├── config.py       ← Settings (pydantic-settings)
│   │   ├── observability.py← Langfuse + OpenInference bootstrap
│   │   ├── budget.py       ← TraceBudget cost ledger
│   │   ├── auth/           ← JWT + role-based FastAPI deps
│   │   ├── db/             ← asyncpg pool + schemas.sql
│   │   ├── llm/            ← claude_client.py (with Groq fallback)
│   │   └── modules/
│   │       ├── brand_dna/  ← Module I (orchestrator, workers, synth, eval, repair)
│   │       ├── creative/   ← Module II (RAG content generation)
│   │       └── governance/ ← Module III (approval workflow + Claude Vision)
│   └── scripts/
│       └── test_pipeline.py← E2E smoke test (no auth required)
└── frontend/               ← React + Vite + TailwindCSS
```
