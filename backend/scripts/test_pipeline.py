"""
Dev-only smoke test for the Brand DNA pipeline.
Run from backend/ directory:
    uv run python scripts/test_pipeline.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import asyncio
import json
import uuid

from app.budget import TraceBudget
from app.modules.brand_dna.orchestrator import run_brand_dna_pipeline
from app.modules.brand_dna.schemas import ProductBrief
from app.observability import init_observability

DEMO_BRIEF = ProductBrief(
    launch_id="demo-quinua-snack-001",
    brand_id="quinua_snack_genz",
    category="snack saludable de quinua",
    product_concept=(
        "Snack crujiente de quinua nativa del Perú, sin gluten, alto en proteína. "
        "Sabores inspirados en la cocina peruana: aji amarillo, huacatay, y anticucho."
    ),
    target_audience=(
        "Generación Z (18-26 años) de Lima Metropolitana, NSE B-C1, "
        "activos en redes sociales, interesados en alimentación saludable y orgullo peruano."
    ),
    tone_hint="divertido pero auténtico, orgullo peruano, sin tecnicismos",
    market="PE",
    business_constraints={
        "price_range_soles": "4-8 PEN",
        "retail_target": ["Wong", "Plaza Vea", "bodegas"],
        "forbidden_ingredients": ["gluten", "MSG"],
    },
    requested_by=uuid.UUID("00000000-0000-0000-0000-000000000001"),
)


async def main() -> None:
    init_observability()
    trace_id = str(uuid.uuid4())
    budget = TraceBudget(trace_id=trace_id, ceiling_usd=3.00)

    print(f"\n=== Brand DNA Pipeline Test ===")
    print(f"Trace ID:  {trace_id}")
    print(f"Brief:     {DEMO_BRIEF.category}")
    print(f"Budget:    ${budget.ceiling_usd:.2f} USD ceiling\n")

    try:
        result = await run_brand_dna_pipeline(DEMO_BRIEF, budget)
        print(f"\n=== Result ===")
        print(f"Status:      {result.status}")
        print(f"Partial:     {result.partial_evidence}")
        print(f"Budget:      {json.dumps(result.budget_summary, indent=2)}")

        if result.judge_scores:
            print(f"Judge scores: {json.dumps(result.judge_scores, indent=2)}")

        if result.manual:
            manual = result.manual
            print(f"\n=== Brand Manual: {manual.meta.brand_id} ===")
            print(f"Core idea:   {manual.brand_essence.core_idea}")
            print(f"Positioning: {manual.positioning.statement}")
            print(f"Taglines:    {manual.taglines[:3]}")
            print(f"Pillars:     {[p.name for p in manual.content_pillars]}")
            print(f"Personas:    {[p.name for p in manual.personas]}")
            print(f"\nVocabulary preferred: {manual.vocabulary.preferred[:5]}")
            print(f"Vocabulary forbidden: {manual.vocabulary.forbidden[:5]}")
            print(f"\nFull JSON saved to: /tmp/brand_manual_{manual.meta.brand_id}.json")
            with open(f"brand_manual_{manual.meta.brand_id}.json", "w", encoding="utf-8") as f:
                f.write(manual.model_dump_json(indent=2, by_alias=True))
        else:
            print(f"Error: {result.error}")

    except Exception as exc:
        print(f"\nPipeline ERROR: {exc}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
