-- =====================================================================
-- Content Suite — canonical schema
-- Target: Supabase (Postgres 15+ with pgvector, pg_trgm, uuid-ossp)
-- =====================================================================
--
-- Conventions:
--   - All user-facing tables have RLS enabled.
--   - Soft delete via deleted_at; never DELETE rows.
--   - All ids are uuid (gen_random_uuid()).
--   - All timestamps are timestamptz.
--   - tsvector full-text uses 'spanish' config.
--   - pgvector embeddings are 1024-dim (voyage-multilingual-2).
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "vector";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------

do $$ begin
  create type user_role as enum ('creator', 'approver_a', 'approver_b');
exception when duplicate_object then null; end $$;

do $$ begin
  create type brand_manual_status as enum (
    'pending',
    'generating',
    'evaluating',
    'repairing',
    'needs_human_review',
    'incomplete_budget_hit',
    'failed',
    'approved'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type content_item_type as enum (
    'product_description',
    'video_script',
    'image_prompt'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type content_item_status as enum (
    'draft',
    'pending_approver_a',
    'pending_approver_b',
    'approved',
    'rejected'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type audit_action as enum (
    'create',
    'submit',
    'approve_a',
    'reject_a',
    'approve_b',
    'reject_b',
    'vision_audit_pass',
    'vision_audit_fail'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Users (mirrors auth.users 1:1, adds role)
-- ---------------------------------------------------------------------

create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text,
  role        user_role not null default 'creator',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists users_role_idx on public.users (role) where deleted_at is null;

-- Keep updated_at in sync.
create or replace function public.tg_set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- Product briefs — input to Module I
-- ---------------------------------------------------------------------

create table if not exists public.product_briefs (
  id                    uuid primary key default gen_random_uuid(),
  launch_id             text not null,
  brand_id              text not null,
  category              text not null,
  product_concept       text not null,
  target_audience       text not null,
  tone_hint             text,
  market                text not null default 'PE',
  business_constraints  jsonb not null default '{}'::jsonb,
  constraints           jsonb,
  brief_json            jsonb not null,
  requested_by          uuid not null references public.users(id),
  created_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

create index if not exists product_briefs_brand_idx on public.product_briefs (brand_id);
create index if not exists product_briefs_launch_idx on public.product_briefs (launch_id);
create index if not exists product_briefs_requested_by_idx on public.product_briefs (requested_by);

-- ---------------------------------------------------------------------
-- Brand manuals — output of Module I
-- ---------------------------------------------------------------------

create table if not exists public.brand_manuals (
  id                  uuid primary key default gen_random_uuid(),
  brand_id            text not null,
  version             integer not null default 1,
  manual_json         jsonb not null,
  status              brand_manual_status not null default 'pending',
  trace_id            text,
  langfuse_trace_url  text,
  judge_scores        jsonb,
  partial_evidence    boolean not null default false,
  cost_usd            numeric(10, 6),
  cache_hit_rate      numeric(5, 4),
  product_brief_id    uuid references public.product_briefs(id),
  creator_id          uuid not null references public.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  unique (brand_id, version)
);

create index if not exists brand_manuals_brand_idx on public.brand_manuals (brand_id);
create index if not exists brand_manuals_status_idx on public.brand_manuals (status);
create index if not exists brand_manuals_creator_idx on public.brand_manuals (creator_id);

drop trigger if exists brand_manuals_set_updated_at on public.brand_manuals;
create trigger brand_manuals_set_updated_at
  before update on public.brand_manuals
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- Brand chunks — pgvector RAG store
-- ---------------------------------------------------------------------

create table if not exists public.brand_chunks (
  id                uuid primary key default gen_random_uuid(),
  brand_id          text not null,
  manual_version    integer not null,
  section_name      text not null,
  chunk_id          text not null,
  content           text not null,
  embedding         vector(1024),
  metadata          jsonb not null default '{}'::jsonb,
  tsv               tsvector generated always as (to_tsvector('spanish', coalesce(content, ''))) stored,
  embedded_at       timestamptz not null default now(),
  unique (brand_id, manual_version, chunk_id)
);

create index if not exists brand_chunks_brand_idx on public.brand_chunks (brand_id);
create index if not exists brand_chunks_section_idx on public.brand_chunks (section_name);
create index if not exists brand_chunks_tsv_idx on public.brand_chunks using gin (tsv);
create index if not exists brand_chunks_embedding_idx
  on public.brand_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 128);

-- ---------------------------------------------------------------------
-- Research findings — worker artifacts
-- ---------------------------------------------------------------------

create table if not exists public.research_findings (
  id                  uuid primary key default gen_random_uuid(),
  trace_id            text not null,
  brand_id            text,
  agent_role          text not null check (agent_role in (
    'orchestrator',
    'competitive_scan',
    'audience_research',
    'trend_analysis',
    'cultural_context',
    'positioning_analysis',
    'synthesizer',
    'evaluator'
  )),
  summary             text not null,
  detailed_findings   jsonb not null default '[]'::jsonb,
  structured_data     jsonb not null default '{}'::jsonb,
  source_urls         text[] not null default array[]::text[],
  quality_self_assessment numeric(3, 2),
  created_at          timestamptz not null default now()
);

create index if not exists research_findings_trace_idx on public.research_findings (trace_id);
create index if not exists research_findings_role_idx on public.research_findings (agent_role);
create index if not exists research_findings_brand_idx on public.research_findings (brand_id);

-- ---------------------------------------------------------------------
-- Content items — Module II outputs governed by Module III
-- ---------------------------------------------------------------------

create table if not exists public.content_items (
  id                uuid primary key default gen_random_uuid(),
  brand_id          text not null,
  manual_version    integer not null,
  type              content_item_type not null,
  prompt_context    text,
  content_json      jsonb not null,
  retrieved_chunks  jsonb not null default '[]'::jsonb,
  status            content_item_status not null default 'draft',
  vision_audit      jsonb,
  rejection_reason  text,
  creator_id        uuid not null references public.users(id),
  approver_a_id     uuid references public.users(id),
  approver_b_id     uuid references public.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  approved_at       timestamptz,
  deleted_at        timestamptz
);

create index if not exists content_items_brand_idx on public.content_items (brand_id);
create index if not exists content_items_status_idx on public.content_items (status);
create index if not exists content_items_creator_idx on public.content_items (creator_id);

drop trigger if exists content_items_set_updated_at on public.content_items;
create trigger content_items_set_updated_at
  before update on public.content_items
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- Audit logs — every state change in Module III
-- ---------------------------------------------------------------------

create table if not exists public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  content_item_id uuid references public.content_items(id),
  brand_manual_id uuid references public.brand_manuals(id),
  actor_id        uuid not null references public.users(id),
  actor_role      user_role not null,
  action          audit_action not null,
  from_status     text,
  to_status       text,
  notes           text,
  payload         jsonb,
  trace_id        text,
  created_at      timestamptz not null default now()
);

create index if not exists audit_logs_content_idx on public.audit_logs (content_item_id);
create index if not exists audit_logs_manual_idx on public.audit_logs (brand_manual_id);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

-- =====================================================================
-- Row-Level Security
-- =====================================================================

alter table public.users            enable row level security;
alter table public.product_briefs   enable row level security;
alter table public.brand_manuals    enable row level security;
alter table public.brand_chunks     enable row level security;
alter table public.research_findings enable row level security;
alter table public.content_items    enable row level security;
alter table public.audit_logs       enable row level security;

-- Helper: current user's role
create or replace function public.current_role() returns user_role
language sql stable as $$
  select role from public.users where id = auth.uid() and deleted_at is null
$$;

-- Users: everyone reads own row; service role manages.
drop policy if exists users_self_read on public.users;
create policy users_self_read on public.users
  for select using (id = auth.uid());

drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Product briefs: creators see own; approvers see all for governance review.
drop policy if exists product_briefs_creator_rw on public.product_briefs;
create policy product_briefs_creator_rw on public.product_briefs
  for all using (
    requested_by = auth.uid() or public.current_role() in ('approver_a', 'approver_b')
  )
  with check (requested_by = auth.uid());

-- Brand manuals: creator sees own; all approvers read.
drop policy if exists brand_manuals_read on public.brand_manuals;
create policy brand_manuals_read on public.brand_manuals
  for select using (
    creator_id = auth.uid() or public.current_role() in ('approver_a', 'approver_b')
  );

drop policy if exists brand_manuals_write_creator on public.brand_manuals;
create policy brand_manuals_write_creator on public.brand_manuals
  for insert with check (creator_id = auth.uid() and public.current_role() = 'creator');

drop policy if exists brand_manuals_update_creator on public.brand_manuals;
create policy brand_manuals_update_creator on public.brand_manuals
  for update using (creator_id = auth.uid())
  with check (creator_id = auth.uid());

-- Brand chunks: read-only for all authenticated users; only service role writes.
drop policy if exists brand_chunks_read_all on public.brand_chunks;
create policy brand_chunks_read_all on public.brand_chunks
  for select using (auth.role() = 'authenticated');

-- Research findings: read for all authenticated; write only via service role.
drop policy if exists research_findings_read on public.research_findings;
create policy research_findings_read on public.research_findings
  for select using (auth.role() = 'authenticated');

-- Content items:
--   creator: read/write own drafts and submissions
--   approver_a: read all pending; update for text approval
--   approver_b: read all approved-by-A; update for vision audit
drop policy if exists content_items_creator on public.content_items;
create policy content_items_creator on public.content_items
  for all using (creator_id = auth.uid())
  with check (creator_id = auth.uid());

drop policy if exists content_items_approver_a_read on public.content_items;
create policy content_items_approver_a_read on public.content_items
  for select using (public.current_role() = 'approver_a');

drop policy if exists content_items_approver_a_update on public.content_items;
create policy content_items_approver_a_update on public.content_items
  for update using (public.current_role() = 'approver_a')
  with check (public.current_role() = 'approver_a');

drop policy if exists content_items_approver_b_read on public.content_items;
create policy content_items_approver_b_read on public.content_items
  for select using (public.current_role() = 'approver_b');

drop policy if exists content_items_approver_b_update on public.content_items;
create policy content_items_approver_b_update on public.content_items
  for update using (public.current_role() = 'approver_b')
  with check (public.current_role() = 'approver_b');

-- Audit logs: read for all authenticated; write via service role only.
drop policy if exists audit_logs_read on public.audit_logs;
create policy audit_logs_read on public.audit_logs
  for select using (auth.role() = 'authenticated');

-- =====================================================================
-- RAG retrieval helper (hybrid: vector + BM25-style tsvector rank)
-- =====================================================================

create or replace function public.match_brand_chunks(
  query_embedding  vector(1024),
  query_text       text,
  brand_id_filter  text,
  match_count      int default 8,
  section_filter   text default null
)
returns table (
  id              uuid,
  brand_id        text,
  section_name    text,
  chunk_id        text,
  content         text,
  metadata        jsonb,
  vector_score    float,
  text_score      float,
  hybrid_score    float
)
language sql stable as $$
  select
    c.id,
    c.brand_id,
    c.section_name,
    c.chunk_id,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding)                                        as vector_score,
    coalesce(ts_rank_cd(c.tsv, websearch_to_tsquery('spanish', query_text)), 0)  as text_score,
    0.7 * (1 - (c.embedding <=> query_embedding))
      + 0.3 * coalesce(ts_rank_cd(c.tsv, websearch_to_tsquery('spanish', query_text)), 0)
                                                                                 as hybrid_score
  from public.brand_chunks c
  where c.brand_id = brand_id_filter
    and (section_filter is null or c.section_name = section_filter)
  order by hybrid_score desc
  limit match_count
$$;
