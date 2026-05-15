from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING, Any, AsyncIterator
from contextlib import asynccontextmanager

import asyncpg
import structlog

from app.config import get_settings

if TYPE_CHECKING:
    from supabase import Client as SupabaseClient

log = structlog.get_logger(__name__)

_pool: asyncpg.Pool | None = None


async def init_db_pool() -> asyncpg.Pool:
    global _pool
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not configured")
    if _pool is None:
        log.info("db_pool_creating")
        _pool = await asyncpg.create_pool(
            dsn=settings.database_url,
            min_size=1,
            max_size=10,
            command_timeout=30,
            statement_cache_size=0,
        )
        log.info("db_pool_ready")
    return _pool


async def close_db_pool() -> None:
    global _pool
    if _pool is not None:
        log.info("db_pool_closing")
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool not initialised — call init_db_pool() first")
    return _pool


@asynccontextmanager
async def acquire_conn() -> AsyncIterator[asyncpg.Connection]:
    pool = get_pool()
    async with pool.acquire() as conn:
        yield conn


async def fetch_one(query: str, *args: Any) -> asyncpg.Record | None:
    async with acquire_conn() as conn:
        return await conn.fetchrow(query, *args)


async def fetch_all(query: str, *args: Any) -> list[asyncpg.Record]:
    async with acquire_conn() as conn:
        return list(await conn.fetch(query, *args))


async def execute(query: str, *args: Any) -> str:
    async with acquire_conn() as conn:
        return await conn.execute(query, *args)


@lru_cache(maxsize=1)
def get_supabase_admin() -> "SupabaseClient":
    from supabase import create_client

    settings = get_settings()
    if not (settings.supabase_url and settings.supabase_service_role_key):
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def get_supabase_anon() -> "SupabaseClient":
    from supabase import create_client

    settings = get_settings()
    if not (settings.supabase_url and settings.supabase_anon_key):
        raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY must be configured")
    return create_client(settings.supabase_url, settings.supabase_anon_key)
