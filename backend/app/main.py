from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import Settings, get_settings
from app.modules.brand_dna.router import router as brand_dna_router
from app.modules.creative.router import router as creative_router
from app.modules.governance.router import router as governance_router
from app.observability import init_observability, shutdown_observability

API_PREFIX = "/api/v1"


def _configure_logging(settings: Settings) -> None:
    timestamper = structlog.processors.TimeStamper(fmt="iso")
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        timestamper,
    ]
    if settings.is_production:
        renderer: structlog.types.Processor = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[*shared_processors, structlog.processors.StackInfoRenderer(), renderer],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, settings.log_level, logging.INFO)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
    logging.basicConfig(level=settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    _configure_logging(settings)
    log = structlog.get_logger("app.lifespan")
    log.info("startup_begin", env=settings.app_env, version=__version__)

    init_observability()

    # Initialize the Postgres pool (best-effort — auth role-lookup needs it).
    # If DATABASE_URL is unreachable we keep going; protected endpoints will 503 instead.
    if settings.database_url:
        try:
            from app.db.client import init_db_pool

            await init_db_pool()
            log.info("db_pool_initialized")
        except Exception as exc:
            log.error("db_pool_init_failed", error=str(exc))
    else:
        log.warning("database_url_missing — auth role lookups will fail")

    log.info("startup_complete")

    try:
        yield
    finally:
        log.info("shutdown_begin")
        try:
            from app.db.client import close_db_pool

            await close_db_pool()
        except Exception as exc:
            log.warning("db_pool_close_failed", error=str(exc))
        shutdown_observability()
        log.info("shutdown_complete")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Content Suite API",
        version=__version__,
        description="Brand DNA Architect, Creative Engine, Governance, Observability",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    app.include_router(brand_dna_router, prefix=API_PREFIX)
    app.include_router(creative_router, prefix=API_PREFIX)
    app.include_router(governance_router, prefix=API_PREFIX)

    return app


app = create_app()
