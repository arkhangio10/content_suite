# Content Suite — Claude Code Project Rules

## Project context

Technical challenge submission for **Alicorp** (Peru's largest CPG company) via Prediqtdata consultancy. Deadline: **Friday May 15, 2026 at 9:00 AM (Lima time)**. Defense at 9:30 AM.

The product is **Content Suite**: an AI platform that solves brand consistency at scale for product launches. Four modules:

- **Module I — Brand DNA Architect** (THE MOST IMPORTANT). Orchestrator-workers agent that researches market, audience, competitors, trends, and culture in Peru, then synthesizes a structured Brand Manual JSON stored in pgvector.
- **Module II — Creative Engine**. RAG-based content generation that retrieves brand rules before generating.
- **Module III — Governance & Multimodal Audit**. RBAC approval workflow + **Claude Sonnet 4.6 Vision** image audit (NO Gemini).
- **Module IV — Observability**. Langfuse v4 tracing wraps every LLM call.

## Current state (2026-05-14, T-1 day)

All 4 backend modules + full frontend + Supabase + E2E tests are working. **End-to-end content suite flow is now wired** (creator → submit → approver_a sees in real queue → approve/reject).

| Layer | Status | Notes |
|-------|--------|-------|
| Backend Module I | ✅ Working | E2E demo: Morochas judge `pass` 0.88, $0.91/run · earlier quinua_snack judge 0.917, $0.96/run |
| Backend Module II (Creative) | ✅ Working | Real Claude Sonnet 4.6 with brand-context loader · field names match BrandManual schema |
| Backend Module III (Governance + Claude Vision) | ✅ Working | RBAC + multipart image audit + **real approval queue + drawer** |
| Backend Module IV (Langfuse v4) | ✅ Working | Nested traces verified, smoke test passing |
| Backend `/brand-dna/extract-brief` | ✅ Working | Claude Haiku 4.5, ~$0.001/run, JSON output |
| Backend `/brand-dna/list` | ✅ Working | Lists all generated manuals from in-memory `_jobs` (filtered by ownership) |
| Backend `/governance/pending` + `/content/{id}/full` | ✅ Working | Approver A queue + drawer data |
| Frontend (Vite + React 18 + TS partial + Tailwind) | ✅ Built | 28+ files, scaffolded from v0/Bolt prototype |
| Frontend Architect — ManualsList | ✅ Working | Table of all generated manuals with judge/cost/cache · 5s polling |
| Frontend Governance — ApproverAQueue | ✅ Working | Real list + drawer + Approve/Reject with motive · 5s polling |
| Supabase (Postgres + Auth + RLS) | ✅ Working | Schema applied, 3 demo users provisioned with roles |
| Playwright E2E (8 tests) | ✅ All passing | Reports at `frontend/test-results/REPORT.md` + 11 screenshots |

**Demo users (real, in Supabase Auth, mirrored in `public.users` with role):**

| Persona | Email | Password | Role |
|---------|-------|----------|------|
| María Torres | `maria.torres@demo.alicorp.com` | `creador_demo_2026` | creator |
| Carlos Ramírez | `carlos.ramirez@demo.alicorp.com` | `aprobador_a_demo_2026` | approver_a |
| Lucía Fernández | `lucia.fernandez@demo.alicorp.com` | `aprobador_b_demo_2026` | approver_b |

**Cumulative Anthropic spend:** ~$9.71 (Anthropic dashboard).

**Remaining for Friday:** deploy backend to Render + frontend to Vercel · 6-slide deck · final live demo run.

## Tech stack (LOCKED — do NOT deviate)

### Backend
- **FastAPI** (Python **3.12**), `uv` for package management
- **asyncpg** for direct Postgres (with `httpx` fallback to Supabase REST when pool isn't available)
- **Pydantic v2** for all schemas

### Frontend
- **Vite 5 + React 18** (NOT React.StrictMode — see Known Fixes below)
- **TypeScript** in `api/`, `auth/`, `hooks/`, `data/`; JSX in pages/components (less refactor risk)
- **React Router v6** for routing + role-gated routes
- **TanStack Query v5** for server state (polling, mutations, retries)
- **axios** with a request interceptor that pulls the JWT from localStorage
- **lucide-react** for icons, aliased with legacy names via `components/icons.ts`
- **TailwindCSS** with custom Alicorp tokens in `tailwind.config.js`
- **Supabase JS** is installed but **NOT used for auth** — see `src/auth/rawApi.ts` (see Known Fixes)

### Database
- **Supabase** (Postgres + pgvector + Auth + RLS)
- pgvector embeddings: 1024-dim for `voyage-multilingual-2`, HNSW index `m=16, ef_construction=128`
- Hybrid retrieval via `public.match_brand_chunks()` (0.7 vector + 0.3 text rank)

### LLMs
- Anthropic Claude as primary: `claude-opus-4-7` (synthesizer), `claude-sonnet-4-6` (orchestrator/evaluator/repair/**vision**), `claude-haiku-4-5` (workers + brief extraction)
- Groq Llama 3.3 70B fallback (`llama-3.3-70b-versatile`) — workers only
- **NO Google Gemini** — Module III vision uses Claude Sonnet 4.6 (user decision)
- Embeddings: `voyage-multilingual-2` (1024-dim)
- Web search: Anthropic native `web_search_20250305` tool

### Observability
- **Langfuse v4** (NOT v3) + OpenInference Anthropic instrumentor
- Imports MUST be `from langfuse import observe` (top-level) — see Known Fixes

### Hosting
- Render (backend), Vercel (frontend)

## Verify model strings before coding

Anthropic model strings change. Check the user's existing `.env` or `https://docs.anthropic.com` first. If a model string doesn't work, ASK — do not silently substitute.

## Architectural patterns (FOLLOW EXACTLY)

### Module I — Orchestrator-workers

1. **Orchestrator** (Sonnet 4.6) — receives `ProductBrief`, plans 5 parallel research questions.
2. **5 parallel workers** (Haiku 4.5) — `competitive_scan`, `audience_research`, `trend_analysis`, `cultural_context`, `positioning_analysis`. Run via `asyncio.gather`.
3. **Synthesizer** (Opus 4.7) — reads worker findings from `findings_cache`, produces final `BrandManual` JSON. Uses adaptive thinking. `max_tokens=16000` is required.
4. **Evaluator** (Sonnet 4.6) — LLM-as-judge with 4-dimensional rubric. Verdict: `pass | repair | reject`. `max_tokens=4096`.
5. **Repair loop** — max 2 iterations, JSON-Patch (RFC 6902) output, NOT full regeneration.

The pipeline reports its **phase** back to the FastAPI router via a `phase_callback` (planning → researching → synthesizing → evaluating → repairing → done). The frontend polls `GET /api/v1/brand-dna/jobs/{id}` every 4s and displays:
- Real-time `budget.spent_usd` (live from `TraceBudget.summary()`)
- Real-time call count + cache hit rate
- Current phase + milestone dots
- Progress bar (% of pipeline + % of budget)

### Worker artifact pattern

Workers MUST call `save_research_finding` tool to persist findings, then return ONLY `{finding_id, summary}` to the orchestrator. NEVER return bulk research text.

**CRITICAL worker-loop invariant** (`workers/__init__.py`): the loop MUST break immediately after `save_research_finding` is called. Otherwise the model continues making web_search / scrape calls and burns 3-4× the budget per worker.

### Brief extraction (Claude Haiku)

`POST /api/v1/brand-dna/extract-brief` — takes natural-language text, returns structured `ExtractedBrief` (brand_id, category, audience, tone_hint, concept, constraints, launch_id, confidence). Costs **~$0.001** per call. Used by the frontend before the user reviews the chips and clicks "Generar".

The frontend has a regex fallback (`extractBriefLocal`) if the endpoint is unavailable.

### List + drawer endpoints (UI plumbing)

The frontend needs proper "list" endpoints because in-memory dicts (`_jobs`, `_content_items`, `_reviews`) are not directly queryable. We expose:

- `GET /api/v1/brand-dna/list` — all `_jobs` with a `manual`, filtered by `creator_id == user.id` unless the user is an approver. Returns `{ manuals: [...], count, source: "memory" }`.
- `GET /api/v1/governance/pending` — all `_reviews` with `status == "pending"`, joined with the corresponding content excerpt. Polled every 5s by Approver A queue.
- `GET /api/v1/governance/content/{id}/full` — full content + associated review, used by the review drawer when the approver clicks an item.

These are essential because **the in-memory storage means we cannot show real history elsewhere**. If you add new flows that need visibility (e.g., audit log for the creator), add a corresponding GET endpoint — do NOT introduce mock data in the frontend.

### Cost circuit-breaker

Every Claude call updates a `TraceBudget` ledger. Hard ceiling: **$2.00 USD per brand manual** (spec target). Observed typical cost: **$0.91-0.96**. If exceeded, raises `BudgetExceeded` → pipeline returns `status="incomplete_budget_hit"`.

Note: `TraceBudget` is approximate (cache writes priced at 1.25x). Anthropic's actual billing accounts for cache discounts — Langfuse's cost calc does NOT, so it over-estimates by ~20%. Anthropic dashboard is ground truth.

### Prompt caching

ALL system prompts and tool definitions wrap in `cache_control: {"type": "ephemeral"}`. First run cache hit rate is ~30-45%; second run on warm cache should reach ≥60%.

### Observability (Module IV) — Langfuse v4

`from langfuse import observe, get_client` — use the v4 top-level imports, NOT `langfuse.decorators` (v3 API doesn't share OTEL context with the OpenInference Anthropic instrumentor, resulting in 1:1 flat traces instead of nested).

Trace-level attributes (user_id, session_id, tags, metadata) are set via OTEL span attributes with `langfuse.trace.*` prefix — see `app/llm/langfuse_helpers.py`.

Every pipeline run should produce ONE root trace `brand_dna_generate` with nested children: `orchestrator_plan` · `worker:<role>` (×5) · `synthesizer` · `evaluator` · optional `repair`.

### Frontend auth — direct fetch via rawApi (NOT supabase-js)

`@supabase/supabase-js@2.45` has shown **deterministic hangs** in this project's setup (auth.signInWithPassword and from().select() never resolve in the browser). Bypass with **direct `fetch()`** in `src/auth/rawApi.ts`:

- `rawSignIn(email, password)` → POSTs `/auth/v1/token` directly
- `rawLoadProfile(session)` → GETs `/rest/v1/users?id=eq.{user_id}` with `Authorization: Bearer <jwt>`
- Session stored in localStorage under key `sb-<project-ref>-auth-token` (compatible with supabase-js format)
- **In-memory mirror** (`memorySession`) survives Vite HMR module re-imports

The axios `apiClient` interceptor pulls the JWT via `loadStoredSession()` from rawApi — never via the supabase-js client.

### Frontend job polling pattern

```
useGenerateBrandManual() → POST /generate → job_id
useJobStatus(jobId)     → GET /jobs/{id}, refetchInterval=4000ms while status==='running'
```

When `status==='complete'`:
1. `setPhase('done')`
2. `sessionStorage.setItem('cs.lastBrandId', brand_id)` for refresh-persistence
3. Render `<ManualSpread manual={adaptBrandManual(jobStatus.data.manual)} />`

On Architect page mount, if `cs.lastBrandId` exists, `useBrandManual(savedBrandId)` auto-fetches and renders the saved manual without re-running the pipeline.

## Code conventions

- **Type hints mandatory** on every Python function signature
- **Pydantic v2** for ALL data schemas (`BaseModel`, `Field`, `model_validator`, `ConfigDict`)
- **Async-first**: every I/O function is `async def`
- **No `print()` in app code** — use `structlog` configured for JSON output (`print` is OK in `scripts/`)
- **Errors are explicit**: never `except: pass`. Catch specific exceptions, log them, re-raise or return a typed error response
- **One function = one responsibility**: max ~50 lines per function
- **Tests are NOT required** for the demo (but Playwright E2E suite exists, see below)
- **No `node_modules`, no `__pycache__`, no `.venv` in commits** — `.gitignore` handles it
- **Frontend: no mock data masquerading as real data.** Empty states ("Aún no has generado ningún manual") are honest and clearer than fake fillers. The only "static data" allowed is UI enums (`V2_ROLE`, `V2_STATUS`, `V2_CATEGORIES`, `V2_CONTENT_TYPES`, `V2_SUGGESTIONS`) and the `V2_BRANDS` color/glyph identity registry.

## File structure (actual)

```
v1/
├── CLAUDE.md
├── README.md
├── .env, .env.example
├── .gitignore
├── backend/
│   ├── pyproject.toml, uv.lock
│   ├── brand_manual_quinua_snack_genz.json   # demo output (gitignored)
│   ├── scripts/
│   │   ├── test_pipeline.py                  # E2E smoke test (~$0.96 per run)
│   │   └── test_langfuse_nesting.py          # cheap OTEL nesting verifier (~$0.0001)
│   └── app/
│       ├── main.py, config.py, observability.py, budget.py
│       ├── auth/         (supabase_client.py + dependencies.py)
│       │                  # supabase_client.py supports ES256 (JWKS) + HS256 + REST fallback for role lookup
│       ├── db/           (client.py, schemas.sql)
│       ├── llm/          (claude_client.py, langfuse_helpers.py)   # NO gemini_client.py
│       └── modules/
│           ├── brand_dna/   (router, orchestrator, workers/, synthesizer, evaluator, repair,
│           │                tools, schemas, embedding, chunking, prompt_loader, prompts/)
│           ├── creative/    (router.py — RAG via brand manual cache)
│           └── governance/  (router.py — RBAC + Claude Vision audit)
└── frontend/
    ├── package.json, vite.config.ts, tsconfig.json, tailwind.config.js, postcss.config.js
    ├── index.html, .env.example, .gitignore
    ├── playwright.config.ts
    ├── e2e/
    │   ├── demo-flow.spec.ts                 # 8 tests, ~22s runtime
    │   └── generate-report.mjs               # builds REPORT.md with embedded screenshots
    ├── test-results/
    │   ├── REPORT.md                         # Markdown evidence report
    │   └── evidence/01-*.png ... 11-*.png    # 11 sequential screenshots
    └── src/
        ├── main.tsx, App.tsx, index.css, vite-env.d.ts
        ├── api/        (client.ts, types.ts, brandDna.ts, creative.ts, governance.ts)
        ├── auth/       (supabase.ts, rawApi.ts, AuthContext.tsx, ProtectedRoute.tsx)
        ├── hooks/      (useBrandDna.ts, useCreative.ts, useGovernance.ts)
        ├── components/ (icons.ts, ui.jsx, Toast.tsx, ErrorBoundary.tsx, ManualSpread.jsx)
        ├── data/       (index.ts — UI enums + V2_BRANDS identity registry; NO mock content)
        ├── layout/     (Shell.jsx — react-router based)
        └── pages/      (Login.tsx, Home.jsx, Architect.jsx, Creative.jsx, Governance.jsx, Observability.jsx)
```

## Database conventions

- Every table has `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` and `created_at timestamptz DEFAULT now()`
- Soft deletes via `deleted_at timestamptz` — never hard DELETE
- RLS enabled on every user-facing table
- pgvector embeddings: 1024-dim for `voyage-multilingual-2`, HNSW index with `m=16, ef_construction=128`
- Full-text search: `tsvector` column generated from content with `'spanish'` config
- **GRANTs required for BOTH `authenticated` AND `service_role`** on new Supabase projects — see Known Fixes

## Brand Manual JSON schema (canonical)

Reference `backend/app/modules/brand_dna/schemas.py`. Key invariants:

- Every section has a `_provenance` field with `finding_ids[]` and `confidence` (0-1) — serialized with `AliasChoices("provenance", "_provenance")`
- `vocabulary.preferred` and `vocabulary.forbidden` MUST be disjoint (case-insensitive set intersection)
- `tone_of_voice.dos` and `tone_of_voice.donts` coherence checked **at the phrase level**, not word level — common Spanish verbs ("hablar", "usar") legitimately appear in both lists with different objects. Validator flags only if a single dos/dont pair has >60% non-stop-word overlap.
- All Spanish text uses Peruvian register (`es-PE`), `tú` not `vosotros`

## RBAC roles

- `creator` — submits ProductBriefs, sees own brand manuals, generates content
- `approver_a` — reviews and approves text content (Module III state changes)
- `approver_b` — uploads images, runs **Claude Vision** audits

Enforce via Supabase RLS policies AND FastAPI dependency injection. Both layers.

## E2E tests (Playwright)

`npm run test:e2e` runs the 8-test demo flow in ~22s headless. Coverage:

1. Login as Creator (María) and see Home
2. Creator navigates Brand DNA Architect page
3. Creator navigates Creative Engine page
4. Creator is BLOCKED from Governance (RBAC enforcement)
5. Creator views Observability page
6. Login as Approver A (Carlos) — sees governance text queue empty state
7. Login as Approver B (Lucía) — sees Vision Audit page
8. Logout flow returns to /login

Generates `frontend/test-results/REPORT.md` with embedded screenshots and `playwright-report/index.html` (interactive). Use these as **evidence in the defense slides**.

Does NOT cover the expensive flows (full Brand DNA generation $0.96, image audit $0.05) — those are run live during the demo.

## Performance & cost targets

- Brand manual generation: P95 latency < 4 min (observed: ~3.5 min), success rate ≥ 95%
- Cost per manual: **$0.91-0.96 typical** (observed), $2.00 hard ceiling
- Cache hit rate: 30-45% first run, ≥60% on warm cache
- Workers dominate cost (~$0.60), synthesizer ~$0.27, evaluator+orchestrator ~$0.09
- Brief extraction: ~$0.001 (Claude Haiku, 700 tokens roundtrip)

## What to skip given the timeline

- Comprehensive backend test suite (the two scripts in `scripts/` + Playwright E2E are enough)
- Multiple language support (Spanish + English only)
- Multi-tenancy (single Alicorp tenant only)
- Real-time updates (4s polling is fine for the demo)
- Pretty error pages (JSON errors with status codes are fine)

## Known fixes / quirks (do NOT regress these)

- **Anthropic adaptive thinking syntax (Claude 4.x)**: use `thinking={"type": "adaptive"}` + `output_config={"effort": "high"}`. The legacy `{"type": "enabled", "budget_tokens": ...}` returns HTTP 400 on Claude 4.x.
- **Worker `save_research_finding` summary limit**: schema says max 500 chars; workers often send longer summaries. The tool handler truncates with `"..."` suffix. Don't remove this — re-raising the validation error wastes the entire worker run.
- **Worker `structured_data` arrives as JSON string**: handler parses it with `json.loads`, fallback to `{"raw_text": ...}`. Same reason — never lose a worker's work to a parsing nit.
- **Worker loop break on `save_research_finding`**: see Worker artifact pattern. 3-4× cost regression if removed.
- **Synthesizer `max_tokens=16000`**: smaller values truncate the BrandManual JSON mid-output, causing JSON parse errors. Do not reduce.
- **Evaluator `max_tokens=4096`**: same truncation risk for the judge result JSON.
- **Langfuse v4 nesting**: imports MUST be `from langfuse import observe` (top-level), not `from langfuse.decorators import observe`. The v3 decorator path bypasses OTEL context propagation, producing 1:1 flat traces.
- **Supabase JWT migration (ES256 asymmetric)**: new Supabase projects sign auth JWTs with **ES256** via a private key. Old `HS256` shared-secret no longer works. Backend `decode_supabase_jwt()` MUST:
  1. Read the JWT header to detect `alg`
  2. For ES256/RS256, fetch the public key from `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` via `PyJWKClient`
  3. For HS256 (legacy projects), use `SUPABASE_JWT_SECRET`
  4. Always pass `leeway=60` to `jwt.decode` (clock skew tolerance — otherwise fresh tokens fail with `"The token is not yet valid (iat)"`)
- **Supabase REST permissions for service_role**: new projects do NOT auto-grant table permissions. After applying `schemas.sql`, you MUST run:
  ```sql
  grant usage on schema public to authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to authenticated, service_role;
  alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, service_role;
  ```
  Without this, the backend gets `42501: permission denied for table users` even when using the service_role key.
- **Supabase direct DB connection (port 5432) often unreachable on free tier**: IPv4 direct connection is disabled by default for new projects. Either (a) use the **Supavisor pooler** at `aws-0-<region>.pooler.supabase.com:5432` with username `postgres.<project_ref>`, or (b) accept that the asyncpg pool will fail and rely on the **REST fallback** in `load_user_role()` (uses service_role_key via httpx).
- **supabase-js v2 hangs in this project**: `auth.signInWithPassword()` and `.from('users').select()` never resolve in the browser. Bypass via `src/auth/rawApi.ts` (direct `fetch()` with manual `Authorization: Bearer <jwt>` header). The `apiClient` axios interceptor reads from `loadStoredSession()` in rawApi, NOT from `supabase.auth.getSession()`.
- **React 18 StrictMode + supabase-js**: don't wrap the app in `<React.StrictMode>` while supabase-js is in the dependency tree — the double-mount triggers a known AbortController bug that hangs all subsequent fetches. Our `main.tsx` intentionally omits StrictMode.
- **axios headers compatibility**: `config.headers` in axios v1 is sometimes a plain object (when set via `axios.create({ headers: {...} })`), sometimes an `AxiosHeaders` instance. Interceptors must handle both: check `typeof headers.set === 'function'` and fall back to bracket assignment.
- **`.env.local` CRLF on Windows**: Vite reads env vars but some values may end with `\r`. The supabase client and rawApi MUST call `.trim()` on `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- **BrandManual field names — exact canonical names** (the Pydantic schema in `schemas.py` is the source of truth). Common mistakes that cause `AttributeError` and a 500 (which the browser then reports as a misleading "CORS error" because the response loses headers), OR silent rendering bugs where the UI shows just numbered placeholders without content:
  - `BrandEssence`: `core_idea`, `values: list[str]`, `mission_statement` — **NOT** `brand_promise` or `personality_traits`
  - `Positioning`: `statement`, `target_segment`, `unique_value_prop`, `reasons_to_believe` — **NOT** `key_differentiators`
  - `VisualIdentity`: `primary_colors: list[str]`, `secondary_colors: list[str]`, `typography: dict[str, str]`, `imagery_style`, `logo_usage`, `donts` — **NOT** `color_palette` (objects with name/hex) or `typography_style` (string). Typography is a **dict** like `{"heading": "Inter Bold", "body": "Inter Regular"}`.
  - `ToneOfVoice`: `descriptors`, `voice_summary`, `dos`, `donts`, `example_phrases` (each phrase is `{good, bad, why}`)
  - `Vocabulary`: `preferred`, `forbidden`, `neutral?`
  - `ContentPillar`: `name`, `description`, `key_messages`, `example_topics` — **NOT** `title`/`body`
  - `CulturalNote`: `topic`, `guidance`, `severity: 'avoid'|'caution'|'note'` — **NOT** `title`/`description`. **This bit us in the ManualSpread render**: the adapter was mapping `c.title`/`c.description` and the section rendered just `01 02 03 04 05` numbers with empty body text.
  - `Persona`: `name`, `age_range`, `ses_bracket: 'A'|'B'|'C1'|'C2'|'D'|'E'`, `region`, `occupation`, `lifestyle`, `pain_points`, `aspirations`, `consumption_occasions`, `trust_signals`, `native_phrases`
  - `BrandManual` top level: `meta`, `brand_essence`, `positioning`, `personas`, `tone_of_voice`, `vocabulary`, `content_pillars`, `taglines: list[str]`, `key_messages: list[str]`, `competitive_differentiators: list[str]` (just strings, NOT objects), `cultural_sensitivities`, `visual_identity`
  - When in doubt, open `backend/app/modules/brand_dna/schemas.py` and check the model class, OR look at `backend/brand_manual_quinua_snack_genz.json` for a real example.

## When you're unsure

- ASK the user instead of guessing on:
  - Model string changes
  - API key issues
  - Architectural deviations from this doc
  - Anything that costs more than $0.50 to test
- Read official docs (anthropic.com/docs, supabase.com/docs, langfuse.com/docs) before inventing patterns
- Prefer simple working code over clever incomplete code

## Demo priorities (for Friday)

1. ✅ Module I generates a real, grounded brand manual end-to-end (Morochas judge 0.88, quinua_snack 0.917)
2. ✅ Langfuse shows full trace with all spans nested
3. ✅ Frontend Modules I, II, III, IV all have real working UI (no mock data)
4. ✅ The 3 RBAC roles have working credentials (María, Carlos, Lucía)
5. ✅ Playwright E2E suite (8 tests, screenshots, Markdown report)
6. ✅ README explains the architecture with diagrams
7. ✅ End-to-end content flow wired: creator → submit → Approver A queue → Approve/Reject (real, no mocks)
8. Deploy backend to Render + frontend to Vercel
9. 6-slide deck ready

If a feature isn't in this list, don't build it.

## Demo flow (recommended live script)

1. **Login as María (creator)** → Brand DNA Architect.
2. Paste a natural-language brief (e.g., "Lanzamos morochas sabor fresa para jóvenes…"). Click **Extraer brief** → Claude Haiku fills the chips. Edit if needed.
3. Click **Generar manual de marca** → progress bar advances through planning → researching → synthesizing → evaluating. ~3.5 min, ~$0.96.
4. Manual appears below; show **judge score**, **costo**, **cache hit**. Toggle through sections (essence → personas → vocabulary forbidden/preferred → tone dos/don'ts → confidence dials).
5. Click **Usar en Creative Engine**. Type a content prompt (e.g., "post para Instagram, 280 chars, audiencia 16-22"). Generate. Submit for review.
6. Toggle role to **Carlos (approver_a)** in another browser tab. Open Governance. Show pending queue. Click the item → drawer → Approve or Reject with motive.
7. Toggle role to **Lucía (approver_b)**. Open Governance. Upload a real packshot/banner. Show Claude Vision audit findings + verdict.
8. Open Observability → click **Abrir Langfuse** → show the nested trace with cost per span.

**WARNING:** the in-memory `_jobs`, `_content_items`, `_reviews` dicts do NOT survive a backend restart. Do not restart `uvicorn` mid-demo.
