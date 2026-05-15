# Content Suite — Alicorp Technical Challenge

AI platform that solves **brand consistency at scale** for product launches in Peru. A creator submits a natural-language brief; the system runs a multi-agent pipeline to research market, audience, competitors, trends and culture; synthesises a structured Brand Manual JSON; embeds it into pgvector for RAG; then governs every downstream content piece through an RBAC approval workflow and a Claude Vision image audit.

**Submitted to:** Prediqtdata / Alicorp · May 15, 2026

---

## Live Environment

| Service | URL |
|---------|-----|
| Backend API | `https://content-suite-backend-hulc.onrender.com` |
| API Docs | `https://content-suite-backend-hulc.onrender.com/docs` |
| Health Check | `https://content-suite-backend-hulc.onrender.com/health` |
| Observability | Langfuse Cloud (project: `alicorp-content-suite`) |

> **Note:** Render free tier spins down after 15 min of inactivity. First request may take ~50 s to cold-start.

---

## Demo Credentials

| Persona | Email | Password | Role |
|---------|-------|----------|------|
| María Torres | `maria.torres@demo.alicorp.com` | `creador_demo_2026` | `creator` |
| Carlos Ramírez | `carlos.ramirez@demo.alicorp.com` | `aprobador_a_demo_2026` | `approver_a` |
| Lucía Fernández | `lucia.fernandez@demo.alicorp.com` | `aprobador_b_demo_2026` | `approver_b` |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python 3.12) · managed with **uv** |
| Frontend | React 18 + Vite 5 + TailwindCSS + TypeScript |
| Database | Supabase (Postgres 15 + pgvector + Auth + RLS) |
| Primary LLMs | Claude Opus 4.7 (synthesiser) · Sonnet 4.6 (orchestrator / evaluator / vision) · Haiku 4.5 (workers + brief extraction) |
| Fallback LLM | Groq Llama 3.3 70B — worker fallback when Claude rate-limits |
| Embeddings | Voyage AI `voyage-multilingual-2` · 1024-dim · HNSW (`m=16, ef_construction=128`) |
| Web Search | Anthropic native tool `web_search_20250305` |
| Observability | Langfuse v4.6.1 · `@observe` OTEL decorator · `update_current_generation` for per-call token/cost reporting |
| Server state | TanStack Query v5 (polling, retries, mutations) |
| Auth | Direct `fetch()` to Supabase `/auth/v1/token` — bypasses supabase-js hanging bug |
| Hosting | Render (backend) + Vercel (frontend) |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                     Frontend  (React + Vite — Vercel)                │
│   Login · Brand DNA Architect · Creative Engine · Governance · Obs.  │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │  HTTPS + JWT (Supabase Auth ES256)
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    FastAPI   (Python 3.12 — Render)                  │
│   /api/v1/brand-dna    /api/v1/creative    /api/v1/governance        │
└──────┬────────────────────────┬──────────────────────┬───────────────┘
       │                        │                      │
       ▼                        ▼                      ▼
  Module I                 Module II             Module III
  Brand DNA                Creative              Governance
  Architect                Engine                & Vision
  (orchestrator            (RAG + Sonnet)        (RBAC +
   + 5 workers             pgvector              Claude Vision)
   + Opus synth            hybrid search)
   + judge loop)
       │                        │                      │
       └────────────────────────┴──────────────────────┘
                                │
                                ▼
            ┌─────────────────────────────────────────┐
            │          Supabase  (Postgres)            │
            │  brand_manuals   brand_chunks (HNSW)     │
            │  research_findings  content_items        │
            │  reviews   audit_logs   users            │
            └─────────────────────────────────────────┘
                                │
                                ▼
            ┌─────────────────────────────────────────┐
            │         Langfuse v4  (Observability)     │
            │  Nested OTEL traces · token counts       │
            │  cache hit rate · cost per span          │
            │  judge scores · cost_actual_usd score    │
            └─────────────────────────────────────────┘
```

---

## Module I — Brand DNA Architect

The most important module. A full orchestrator-workers agent pipeline that researches the Peruvian market in parallel and synthesises a structured `BrandManual` JSON.

### Pipeline Flow

```
User pastes natural-language brief
        │
        ▼
Claude Haiku  ──► POST /brand-dna/extract-brief
(~$0.001)          Returns structured ExtractedBrief chips
                   (brand_id · category · audience · tone · concept)
        │
        ▼
User reviews chips, clicks "Generar manual de marca"
        │
        ▼
POST /brand-dna/generate  ──► returns job_id
        │
        ▼ (polling GET /brand-dna/jobs/{id} every 4 s)
        │
        ├─── phase: "planning"
        │    Orchestrator (Sonnet 4.6) — plans 5 research questions
        │
        ├─── phase: "researching"
        │    5 workers (Haiku 4.5) via asyncio.gather:
        │    ├── competitive_scan      → web_search + competitor data
        │    ├── audience_research     → INEI demographics + Reddit sentiment
        │    ├── trend_analysis        → Google Trends + TikTok patterns
        │    ├── cultural_context      → Peruvian cultural nuances
        │    └── positioning_analysis  → market gaps + value proposition
        │    Each worker calls save_research_finding tool → pgvector DB
        │
        ├─── phase: "synthesizing"
        │    Synthesiser (Opus 4.7 + adaptive thinking, max_tokens=16000)
        │    Reads all 5 findings → produces BrandManual JSON
        │
        ├─── phase: "evaluating"
        │    Evaluator / LLM-as-judge (Sonnet 4.6, max_tokens=4096)
        │    4-dimensional rubric → verdict: pass | repair | reject
        │    Scores attached to Langfuse trace
        │
        └─── phase: "repairing" (if verdict=repair, max 2 iterations)
             JSON-Patch RFC 6902 — targeted fixes, NOT full regeneration
```

### BrandManual Schema (key sections)

| Section | Content |
|---------|---------|
| `brand_essence` | `core_idea`, `values[]`, `mission_statement` |
| `positioning` | `statement`, `target_segment`, `unique_value_prop`, `reasons_to_believe[]` |
| `personas[]` | `name`, `age_range`, `ses_bracket`, `region`, `pain_points`, `native_phrases[]` |
| `tone_of_voice` | `descriptors[]`, `voice_summary`, `dos[]`, `donts[]`, `example_phrases[]` |
| `vocabulary` | `preferred[]`, `forbidden[]` (guaranteed disjoint) |
| `content_pillars[]` | `name`, `description`, `key_messages[]`, `example_topics[]` |
| `visual_identity` | `primary_colors[]`, `typography: dict`, `imagery_style`, `logo_usage` |
| `cultural_sensitivities[]` | `topic`, `guidance`, `severity: avoid\|caution\|note` |

Every section carries a `_provenance` field with `finding_ids[]` and `confidence` (0–1).

### Observed Performance

| Metric | Value |
|--------|-------|
| Typical cost | $0.91 – $0.96 per manual |
| Hard ceiling | $2.00 (BudgetExceeded raises if exceeded) |
| Latency P95 | ~3.5 min |
| Cache hit rate | 30–45% first run · ≥60% warm cache |
| Judge score (Morochas) | 0.88 pass |
| Judge score (Quinua Snack) | 0.917 pass |

---

## Module II — Creative Engine

RAG-based content generation. Before generating, the backend retrieves the most relevant brand manual chunks from pgvector using hybrid search (0.7 vector + 0.3 full-text BM25).

### Flow

```
1. Creator selects brand from dropdown (pulls from /brand-dna/list)
2. Chooses content type: social_post · product_description · email_subject
                          tv_script · press_release · tagline · ad_copy
3. POST /api/v1/creative/generate
   ├── Hybrid pgvector search → top-k brand chunks
   ├── Brand context injected into system prompt
   ├── Claude Sonnet 4.6 generates content
   └── Forbidden vocabulary filtered automatically
4. Creator clicks "Enviar a revisión" → POST /governance/content/{id}/submit
5. Item appears in Approver A's live queue (5 s polling)
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/creative/generate` | Generate content with brand RAG context |
| `GET` | `/api/v1/creative/{content_id}` | Retrieve a content item |
| `GET` | `/api/v1/creative/brand/{brand_id}` | List all content for a brand |

---

## Module III — Governance & Multimodal Audit

Three-role RBAC enforced at **two layers**: FastAPI `Depends(require_role(...))` + Supabase Row Level Security policies.

### Text Approval Workflow

```
creator  ──► submit ──► status: pending_approver_a
                               │
                    approver_a reviews in drawer
                    (sees full text + brand context)
                               │
                    approve ──► status: approved
                    reject  ──► status: rejected (with motive)
```

**Persistence:** Every state transition is written to Supabase `content_items` + `reviews` tables via REST. On Render cold-start, `hydrate_state()` restores in-memory dicts from Supabase so the queue never disappears after a restart.

### Image Audit (Claude Vision)

```
approver_b uploads packshot / banner
        │
        ▼
POST /api/v1/governance/image/audit?brand_id=xxx   (multipart/form-data)
        │
        ▼
Claude Sonnet 4.6 Vision
├── Checks colors vs brand primary/secondary palette
├── Checks typography vs brand guidelines
├── Scans visible text for forbidden vocabulary
├── Evaluates imagery style alignment
└── Returns: findings[], verdict (pass|changes_requested|reject), confidence
        │
        ▼
Audit logged to Supabase audit_logs table
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/governance/content/{id}/submit` | Submit for review |
| `GET` | `/api/v1/governance/pending` | Approver A live queue (polled every 5 s) |
| `GET` | `/api/v1/governance/content/{id}/full` | Full content + review for drawer |
| `PATCH` | `/api/v1/governance/review/{review_id}` | Approve / reject / request changes |
| `POST` | `/api/v1/governance/image/audit` | Upload image for Vision audit |
| `GET` | `/api/v1/governance/audits/{brand_id}` | List audits for a brand |
| `PATCH` | `/api/v1/governance/audit/{audit_id}/decision` | Record audit decision |

---

## Module IV — Observability

Every Claude API call is wrapped with Langfuse v4 `@observe` decorators (OTEL-based). The pipeline produces **one root trace** with fully nested children.

### Trace Structure

```
brand_dna_generate  (root)
├── orchestrator_plan          (Sonnet 4.6 — planning)
├── worker  ×5                 (Haiku 4.5 — parallel research)
│   └── call_claude [generation] (per turn, with model + token counts)
├── synthesizer                (Opus 4.7 — brand manual synthesis)
│   └── call_claude [generation]
├── evaluator                  (Sonnet 4.6 — LLM-as-judge)
│   └── call_claude [generation]
└── repair  (optional, ×1–2)   (Sonnet 4.6 — JSON Patch)
    └── call_claude [generation]
```

### What Langfuse Shows

- **Model** used per span (haiku / sonnet / opus)
- **Token breakdown**: `input`, `output`, `cache_read_input_tokens`, `cache_creation_input_tokens`
- **Cost per span** (Langfuse calculates from token counts + model pricing)
- **Score `cost_actual_usd`**: the exact cost from `TraceBudget` (more accurate than Langfuse's estimate because it accounts for cache discounts)
- **Score `judge_overall`**: LLM-as-judge composite score (0–1)
- **Tags**: `brand_dna`, market, category
- **User ID**: linked to the Supabase user who triggered the run

### Observability Technical Notes

Langfuse v4.6.1 uses pure OpenTelemetry — the `langfuse.decorators` module from v3 no longer exists. The correct pattern is:

```python
from langfuse import observe, get_client

@observe(as_type="generation")
async def call_claude(...):
    response = await client.messages.create(...)
    get_client().update_current_generation(
        model=model,
        usage_details={
            "input": response.usage.input_tokens,
            "output": response.usage.output_tokens,
            "cache_read_input_tokens": response.usage.cache_read_input_tokens,
            "cache_creation_input_tokens": response.usage.cache_creation_input_tokens,
        }
    )
```

---

## Database Schema

```sql
-- Core tables (all with RLS enabled)
brand_manuals       -- stores serialised BrandManual JSON + metadata
brand_chunks        -- pgvector 1024-dim embeddings (HNSW index)
research_findings   -- worker outputs from each pipeline run
content_items       -- generated text + status (pending_approver_a | approved | rejected)
reviews             -- approval records (decision + comment)
audit_logs          -- image audit results (Claude Vision findings + verdict)
users               -- mirrors Supabase Auth with role field
```

Hybrid retrieval uses `public.match_brand_chunks(query_embedding, query_text, brand_id, match_count)` combining:
- **0.7 weight** — cosine similarity via pgvector
- **0.3 weight** — full-text rank via `tsvector` with `'spanish'` config

---

## Authentication

JWT issued by Supabase Auth (ES256 asymmetric key). Backend verifies via JWKS endpoint:

```
GET {SUPABASE_URL}/auth/v1/.well-known/jwks.json
```

The `supabase-js` client library is intentionally **not used** for auth in the frontend — it had a deterministic hang on `signInWithPassword` in this project's setup. Authentication goes through direct `fetch()` calls to `/auth/v1/token` in `src/auth/rawApi.ts`.

---

## E2E Tests (Playwright)

8 automated tests covering the full demo flow. Run time: ~22 s headless.

```bash
cd v1/frontend
npm run test:e2e
```

| Test | Coverage |
|------|---------|
| 1 | Login as María (creator) → Home page |
| 2 | Navigate to Brand DNA Architect |
| 3 | Navigate to Creative Engine |
| 4 | Creator blocked from Governance (RBAC) |
| 5 | Creator views Observability page |
| 6 | Login as Carlos (approver_a) → empty queue state |
| 7 | Login as Lucía (approver_b) → Vision Audit page |
| 8 | Logout → redirect to /login |

Evidence report auto-generated at `frontend/test-results/REPORT.md` with 11 screenshots.

---

## Local Development

### Prerequisites

- Python 3.12
- Node.js 20+
- `uv` (`pip install uv`)
- Supabase project (free tier works)
- Anthropic API key
- Voyage AI API key
- Langfuse account (free tier)
- Groq API key (optional — worker fallback)

### Backend

```powershell
# 1. Clone and enter the backend directory
cd v1\backend

# 2. Copy env template and fill in your keys
Copy-Item ..\.env.example ..\.env
# Edit .env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY,
#            SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET,
#            VOYAGE_API_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY,
#            GROQ_API_KEY (optional)

# 3. Install dependencies
uv sync

# 4. Apply the database schema in Supabase SQL editor
#    Run: v1/backend/app/db/schemas.sql
#    Then run the permission grants (required for service_role):
#      GRANT USAGE ON SCHEMA public TO authenticated, service_role;
#      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
#      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

# 5. Start the API server
uv run uvicorn app.main:app --reload --port 8000

# Verify
# GET http://localhost:8000/health  →  {"status": "ok", "version": "0.1.0"}
# GET http://localhost:8000/docs    →  OpenAPI interactive docs
```

### Frontend

```powershell
cd v1\frontend

# 1. Install dependencies
npm install

# 2. Copy env template
Copy-Item .env.example .env.local
# Edit: VITE_API_URL=http://localhost:8000
#       VITE_SUPABASE_URL=https://xxx.supabase.co
#       VITE_SUPABASE_ANON_KEY=...

# 3. Start dev server
npm run dev
# → http://localhost:5173
```

### Smoke Test (costs ~$0.95 in API credits)

```powershell
cd v1\backend
uv run python scripts/test_pipeline.py
```

---

## Key Engineering Decisions

### Why direct fetch instead of supabase-js?

`@supabase/supabase-js@2.x` has a deterministic hang on `auth.signInWithPassword()` in this project's environment (likely an AbortController + React 18 interaction). All auth goes through manual `fetch()` in `src/auth/rawApi.ts`, which stores the session in localStorage in the same format supabase-js expects (so the key is compatible).

### Why disable the AnthropicInstrumentor?

`openinference-instrumentation-anthropic` auto-instruments every `client.messages.create()` call. When combined with Langfuse v4 `@observe` decorators on the same functions, it creates **duplicate spans** that are aggregated upward — resulting in 3–7× cost inflation in Langfuse. Solution: disable the instrumentor and use `@observe(as_type="generation")` directly on `call_claude`, then call `get_client().update_current_generation()` to report tokens.

### Why `max_tokens=16000` on the Synthesiser?

The `BrandManual` JSON is large (~4,000–6,000 tokens). Smaller `max_tokens` values cause truncated JSON mid-output, which fails Pydantic validation. 16,000 gives comfortable headroom.

### Why JSON-Patch (RFC 6902) for repair instead of full regeneration?

Full regeneration at $0.27/run (Opus 4.7) would double the cost on every repair. JSON-Patch targets only the specific failing fields (e.g., vocabulary overlap, cultural severity) and takes ~$0.04/repair with Sonnet 4.6.

### Supabase cold-start persistence

Render free tier restarts every 15 minutes of inactivity, wiping all in-memory state (`_jobs`, `_content_items`, `_reviews` dicts). On startup, `hydrate_state()` queries Supabase REST to restore:
- Brand manuals with `status = 'complete'`
- Content items with `status = 'pending_approver_a'` (so the approver queue survives restarts)
- Active reviews

### Supabase JWT — ES256 not HS256

New Supabase projects use asymmetric ES256 JWTs (private-key signed). The backend fetches the JWKS public key at `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` and verifies with `PyJWKClient`, with `leeway=60` for clock-skew tolerance.

---

## File Layout

```
v1/
├── CLAUDE.md                        ← project rules (AI assistant context)
├── README.md                        ← this file
├── .env.example
├── .gitignore
├── backend/
│   ├── pyproject.toml               ← dependencies (uv)
│   ├── uv.lock
│   └── app/
│       ├── main.py                  ← FastAPI app factory + lifespan
│       ├── config.py                ← Settings via pydantic-settings
│       ├── observability.py         ← Langfuse v4 bootstrap (get_client)
│       ├── budget.py                ← TraceBudget cost ledger + circuit-breaker
│       ├── auth/
│       │   ├── supabase_client.py   ← ES256/HS256 JWT decode + JWKS
│       │   └── dependencies.py      ← FastAPI require_role() Depends
│       ├── db/
│       │   ├── client.py            ← asyncpg pool (+ httpx REST fallback)
│       │   ├── schemas.sql          ← full Postgres schema with pgvector
│       │   ├── hydration.py         ← startup restore from Supabase REST
│       │   └── persistence_rest.py  ← httpx helpers for REST writes
│       ├── llm/
│       │   ├── claude_client.py     ← call_claude() @observe + Groq fallback
│       │   └── langfuse_helpers.py  ← observe/update_trace/score_trace wrappers
│       ├── scripts/
│       │   ├── test_pipeline.py     ← E2E smoke test (~$0.95 per run)
│       │   └── test_langfuse_nesting.py ← OTEL nesting verifier (~$0.0001)
│       └── modules/
│           ├── brand_dna/
│           │   ├── router.py
│           │   ├── orchestrator.py  ← @observe("brand_dna_generate")
│           │   ├── synthesizer.py   ← Opus 4.7 + adaptive thinking
│           │   ├── evaluator.py     ← LLM-as-judge, 4-dimensional rubric
│           │   ├── repair.py        ← JSON-Patch RFC 6902
│           │   ├── schemas.py       ← BrandManual Pydantic v2 (source of truth)
│           │   ├── tools.py         ← save_research_finding, web_search, etc.
│           │   ├── embedding.py     ← Voyage AI chunking + upsert to pgvector
│           │   ├── prompt_loader.py ← loads .txt prompts with variable substitution
│           │   └── workers/
│           │       ├── __init__.py  ← run_worker() @observe + tool loop
│           │       ├── competitive_scan.py
│           │       ├── audience_research.py
│           │       ├── trend_analysis.py
│           │       ├── cultural_context.py
│           │       └── positioning_analysis.py
│           ├── creative/
│           │   └── router.py        ← RAG generate + submit for review
│           └── governance/
│               └── router.py        ← RBAC review workflow + Claude Vision audit
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── playwright.config.ts
    ├── e2e/
    │   ├── demo-flow.spec.ts        ← 8 Playwright tests
    │   └── generate-report.mjs      ← builds REPORT.md with screenshots
    ├── test-results/
    │   ├── REPORT.md                ← evidence report (11 screenshots)
    │   └── evidence/                ← 01-*.png … 11-*.png
    └── src/
        ├── api/                     ← typed API clients (brandDna, creative, governance)
        ├── auth/                    ← rawApi.ts (direct fetch) + AuthContext
        ├── hooks/                   ← useBrandDna, useCreative, useGovernance
        ├── components/              ← icons, ui, ManualSpread, Toast, ErrorBoundary
        ├── data/                    ← UI enums + V2_BRANDS color/glyph registry
        ├── layout/                  ← Shell (react-router sidebar)
        └── pages/
            ├── Login.tsx
            ├── Home.jsx             ← role-aware dashboard
            ├── Architect.jsx        ← Brand DNA pipeline UI + progress bar
            ├── Creative.jsx         ← content generation + brand selector
            ├── Governance.jsx       ← approval queue + image audit
            └── Observability.jsx    ← Langfuse embed + stats
```

---

## Recommended Demo Flow

1. **Login as María** (creator) → Brand DNA Architect
2. Paste a brief: _"Lanzamos morochas sabor fresa para jóvenes peruanos de 16-22 años, NSE C, digital-first"_
3. Click **Extraer brief** → Haiku fills the chips (~$0.001, ~2 s)
4. Click **Generar manual de marca** → watch the progress bar: planning → researching → synthesizing → evaluating (~3.5 min, ~$0.93)
5. Manual appears: show judge score, cost, cache hit rate. Browse sections (essence → personas → vocabulary → tone dos/don'ts)
6. Click **Usar en Creative Engine** → generate a social post → **Enviar a revisión**
7. Open a second browser tab, **login as Carlos** (approver_a) → Governance → item appears in queue
8. Click item → drawer shows full text + brand context → **Aprobar** or **Rechazar con motivo**
9. **Login as Lucía** (approver_b) → Governance → Vision Audit tab → upload a packshot → Claude Vision audit runs
10. Open **Observability** → click **Abrir Langfuse** → show nested trace with cost per span

> The in-memory dicts (`_jobs`, `_content_items`, `_reviews`) **do not survive a Render restart**. Do not restart the backend mid-demo. Items persist in Supabase and are restored on the next cold-start via `hydrate_state()`.
