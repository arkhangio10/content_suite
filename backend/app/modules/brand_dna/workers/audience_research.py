from __future__ import annotations

from app.budget import TraceBudget
from app.modules.brand_dna.schemas import ProductBrief, WorkerResult
from app.modules.brand_dna.tools import ToolContext
from app.modules.brand_dna.workers import run_worker


async def run(
    question: str, brief: ProductBrief, budget: TraceBudget, context: ToolContext
) -> WorkerResult:
    return await run_worker("audience_research", question, brief, budget, context)
