"""
Tiny smoke test to verify Langfuse traces nest correctly under @observe spans.
Makes 2 minimal Claude calls (~$0.001 total) inside a parent @observe span.

Expected in Langfuse Tracing:
  - 1 trace named "brand_dna_test_parent"
  - 2 child observations (messages.create) nested under it
  - 1 score "test_score" on the trace

If you still see flat traces (1 per messages.create), the OTEL wiring is broken.
"""
from __future__ import annotations

import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.budget import TraceBudget
from app.llm.claude_client import call_claude
from app.llm.langfuse_helpers import observe, score_trace, update_trace
from app.observability import init_observability, shutdown_observability


@observe(name="child_call")
async def _child(label: str, budget: TraceBudget) -> str:
    response = await call_claude(
        model="claude-haiku-4-5",
        system="Reply with a single word.",
        messages=[{"role": "user", "content": f"Say '{label}'"}],
        max_tokens=10,
        budget=budget,
        span=f"test_{label}",
    )
    return response["text"]


@observe(name="brand_dna_test_parent")
async def _parent() -> None:
    trace_id = str(uuid.uuid4())
    budget = TraceBudget(trace_id=trace_id, ceiling_usd=0.05)

    update_trace(
        user_id="test-user-arkhangio",
        session_id=trace_id,
        tags=["langfuse-nesting-test", "smoke"],
        metadata={"purpose": "verify OpenInference + observe nest under one trace"},
    )

    a = await _child("alpha", budget)
    b = await _child("beta", budget)

    score_trace("test_score", 1.0, comment="2 child calls succeeded")
    print(f"[parent] alpha={a!r}  beta={b!r}  spent=${budget.spent_usd:.6f}")


async def main() -> None:
    init_observability()
    try:
        await _parent()
        print("\nOK — check Langfuse Tracing for a single trace 'brand_dna_test_parent' with 2 nested children.")
    finally:
        shutdown_observability()


if __name__ == "__main__":
    asyncio.run(main())
