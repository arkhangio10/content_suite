from __future__ import annotations

import json
from typing import Any, Callable, TypeVar

F = TypeVar("F", bound=Callable[..., Any])

try:
    # Langfuse v4: top-level `observe` creates OpenTelemetry spans.
    # The OpenInference Anthropic instrumentor's spans (from messages.create)
    # automatically nest under these because they share the same OTEL context.
    from langfuse import get_client
    from langfuse import observe as _observe
    from opentelemetry import trace as _otel_trace

    def observe(name: str | None = None, **kwargs: Any) -> Callable[[F], F]:
        return _observe(name=name, **kwargs)  # type: ignore[return-value]

    def update_trace(
        user_id: str | None = None,
        session_id: str | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Set trace-level attributes on the current OTEL span.

        The Langfuse OTEL processor reads these specially-named attributes and
        promotes them to trace-level fields (user_id, session_id, tags, metadata).
        Setting them on the root pipeline span is sufficient — Langfuse aggregates
        across all spans in the trace.
        """
        span = _otel_trace.get_current_span()
        if span is None or not span.is_recording():
            return
        try:
            if user_id:
                span.set_attribute("langfuse.trace.user_id", str(user_id))
            if session_id:
                span.set_attribute("langfuse.trace.session_id", str(session_id))
            if tags:
                span.set_attribute("langfuse.trace.tags", json.dumps(list(tags)))
            if metadata:
                span.set_attribute(
                    "langfuse.trace.metadata",
                    json.dumps(metadata, default=str, ensure_ascii=False),
                )
        except Exception:
            pass

    def score_trace(name: str, value: float, comment: str | None = None) -> None:
        client = get_client()
        if client is None:
            return
        try:
            client.score_current_trace(name=name, value=value, comment=comment)
        except Exception:
            pass

    HAS_LANGFUSE = True

except ImportError:

    def observe(name: str | None = None, **kwargs: Any) -> Callable[[F], F]:  # type: ignore[misc]
        def decorator(func: F) -> F:
            return func
        return decorator

    def update_trace(**kwargs: Any) -> None:  # type: ignore[misc]
        pass

    def score_trace(name: str, value: float, comment: str | None = None) -> None:  # type: ignore[misc]
        pass

    HAS_LANGFUSE = False
