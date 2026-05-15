-- =====================================================================
-- Migration 002 — extend content enums for the demo
-- =====================================================================
-- Aligns the DB enums with the values the Creative module produces.
-- Run AFTER schemas.sql is applied. Safe to re-run.
-- =====================================================================

-- 1) content_item_type — add the four UI types we generate today
do $$ begin
  alter type content_item_type add value if not exists 'social_post';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type content_item_type add value if not exists 'tagline';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type content_item_type add value if not exists 'email_subject';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type content_item_type add value if not exists 'ad_copy';
exception when duplicate_object then null; end $$;

-- 2) Make sure service_role can write to every table (in case the
--    earlier GRANT migration was missed).
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;
grant execute on all functions in schema public
  to authenticated, service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables
  to authenticated, service_role;
