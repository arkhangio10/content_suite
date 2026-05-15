from __future__ import annotations

import os
from typing import TYPE_CHECKING

import structlog

from app.config import get_settings

if TYPE_CHECKING:
    from langfuse import Langfuse

_langfuse: "Langfuse | None" = None
_instrumented: bool = False

log = structlog.get_logger(__name__)


def init_observability() -> "Langfuse | None":
    global _langfuse, _instrumented

    settings = get_settings()

    if not (settings.langfuse_public_key and settings.langfuse_secret_key):
        log.warning("langfuse_keys_missing", reason="skipping_observability_bootstrap")
        return None

    os.environ.setdefault("LANGFUSE_PUBLIC_KEY", settings.langfuse_public_key)
    os.environ.setdefault("LANGFUSE_SECRET_KEY", settings.langfuse_secret_key)
    os.environ.setdefault("LANGFUSE_HOST", settings.langfuse_host)

    from langfuse import get_client

    _instrumented = True  # instrumentor disabled — call_claude uses @observe(as_type="generation") instead

    _langfuse = get_client()
    log.info("langfuse_initialized", host=settings.langfuse_host)
    return _langfuse


def get_langfuse() -> "Langfuse | None":
    return _langfuse


def shutdown_observability() -> None:
    if _langfuse is not None:
        try:
            _langfuse.flush()
            log.info("langfuse_flushed")
        except Exception as exc:
            log.error("langfuse_flush_failed", error=str(exc))
