from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx
import structlog

from app.modules.brand_dna.schemas import ProductBrief, ResearchFinding

log = structlog.get_logger(__name__)


# ─────────────────────────────────────────────
# Context passed to every tool handler
# ─────────────────────────────────────────────

@dataclass
class ToolContext:
    trace_id: str
    brand_id: str
    brief: ProductBrief
    db_pool: Any | None = None  # asyncpg.Pool — optional for dry runs
    findings_cache: dict[str, ResearchFinding] = field(default_factory=dict)


# ─────────────────────────────────────────────
# Anthropic native tool definition
# NOTE: Verify allowed_domains against current Anthropic docs before live run.
# max_uses is confirmed supported; allowed_domains may be silently ignored.
# ─────────────────────────────────────────────

WEB_SEARCH_TOOL: dict[str, Any] = {
    "type": "web_search_20250305",
    "name": "web_search",
    "max_uses": 5,
}

PERUVIAN_DOMAINS = [
    "elcomercio.pe",
    "gestion.pe",
    "inei.gob.pe",
    "alicorp.com.pe",
    "andina.pe",
    "rpp.pe",
    "kantar.com",
    "statista.com",
    "ipsos.com",
    "peru21.pe",
    "semanaeconomica.com",
]


# ─────────────────────────────────────────────
# Custom client-side tool definitions (JSON Schema)
# ─────────────────────────────────────────────

SAVE_RESEARCH_FINDING_TOOL: dict[str, Any] = {
    "name": "save_research_finding",
    "description": (
        "Persists research findings to the database. "
        "MUST be called as the final action in every worker run. "
        "Returns a finding_id that the orchestrator uses to track this worker's output."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "agent_role": {
                "type": "string",
                "enum": [
                    "competitive_scan",
                    "audience_research",
                    "trend_analysis",
                    "cultural_context",
                    "positioning_analysis",
                ],
                "description": "The role of the worker calling this tool.",
            },
            "summary": {
                "type": "string",
                "maxLength": 500,
                "description": "One-paragraph summary of key findings for the orchestrator.",
            },
            "detailed_findings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "claim": {"type": "string"},
                        "evidence": {"type": "string"},
                        "source_url": {"type": "string"},
                        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    },
                    "required": ["claim", "evidence"],
                },
            },
            "structured_data": {
                "type": "object",
                "description": "Role-specific structured output (competitors list, personas, etc.).",
            },
            "quality_self_assessment": {
                "type": "number",
                "minimum": 0,
                "maximum": 1,
                "description": "Self-scored confidence in the overall research quality.",
            },
        },
        "required": ["agent_role", "summary", "detailed_findings", "structured_data"],
    },
}

COMPETITOR_SCRAPE_TOOL: dict[str, Any] = {
    "name": "competitor_site_scrape",
    "description": "Fetches and extracts key marketing copy and claims from a competitor URL.",
    "input_schema": {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "Full HTTPS URL to scrape."},
            "focus": {
                "type": "string",
                "description": "What to look for: 'taglines', 'claims', 'pricing', 'audience'.",
            },
        },
        "required": ["url"],
    },
}

REDDIT_SEARCH_TOOL: dict[str, Any] = {
    "name": "reddit_search_spanish",
    "description": "Searches Spanish-language Reddit communities for consumer sentiment.",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "subreddits": {
                "type": "array",
                "items": {"type": "string"},
                "default": ["r/peru", "r/latinoamerica"],
            },
            "limit": {"type": "integer", "default": 10, "maximum": 25},
        },
        "required": ["query"],
    },
}

GOOGLE_TRENDS_TOOL: dict[str, Any] = {
    "name": "google_trends_peru",
    "description": "Returns Google Trends interest-over-time data for terms in Peru (geo=PE).",
    "input_schema": {
        "type": "object",
        "properties": {
            "keywords": {"type": "array", "items": {"type": "string"}, "maxItems": 5},
            "timeframe": {"type": "string", "default": "today 12-m"},
        },
        "required": ["keywords"],
    },
}

INEI_STATS_TOOL: dict[str, Any] = {
    "name": "inei_peru_stats",
    "description": "Retrieves socioeconomic and demographic statistics from INEI Peru.",
    "input_schema": {
        "type": "object",
        "properties": {
            "topic": {
                "type": "string",
                "enum": [
                    "consumer_spending",
                    "demographics",
                    "food_consumption",
                    "income_distribution",
                    "urbanization",
                ],
            },
            "region": {"type": "string", "default": "Lima"},
        },
        "required": ["topic"],
    },
}

ALL_CLIENT_TOOLS: list[dict[str, Any]] = [
    SAVE_RESEARCH_FINDING_TOOL,
    COMPETITOR_SCRAPE_TOOL,
    REDDIT_SEARCH_TOOL,
    GOOGLE_TRENDS_TOOL,
    INEI_STATS_TOOL,
]


# ─────────────────────────────────────────────
# Tool handler implementations
# ─────────────────────────────────────────────

async def _handle_save_research_finding(
    input_data: dict[str, Any], context: ToolContext
) -> dict[str, Any]:
    import json as _json

    finding_id = str(uuid.uuid4())

    # Truncate summary to schema limit; models often send longer ones
    raw_summary = str(input_data.get("summary", ""))
    summary = raw_summary[:497] + "..." if len(raw_summary) > 500 else raw_summary

    # structured_data sometimes arrives as a JSON string — parse it
    structured_data = input_data.get("structured_data", {})
    if isinstance(structured_data, str):
        try:
            structured_data = _json.loads(structured_data)
        except Exception:
            structured_data = {"raw_text": structured_data[:2000]}

    finding = ResearchFinding(
        id=finding_id,
        trace_id=context.trace_id,
        brand_id=context.brand_id,
        agent_role=input_data["agent_role"],
        summary=summary,
        detailed_findings=input_data.get("detailed_findings", []),
        structured_data=structured_data,
        quality_self_assessment=input_data.get("quality_self_assessment"),
    )
    context.findings_cache[finding_id] = finding

    if context.db_pool is not None:
        try:
            async with context.db_pool.acquire() as conn:
                await conn.execute(
                    """
                    insert into public.research_findings
                      (id, trace_id, brand_id, agent_role, summary,
                       detailed_findings, structured_data, quality_self_assessment)
                    values ($1,$2,$3,$4,$5,$6,$7,$8)
                    """,
                    finding_id,
                    context.trace_id,
                    context.brand_id,
                    finding.agent_role,
                    finding.summary,
                    finding.detailed_findings,
                    finding.structured_data,
                    finding.quality_self_assessment,
                )
        except Exception as exc:
            log.error("save_research_finding_db_error", error=str(exc), finding_id=finding_id)

    log.info("research_finding_saved", finding_id=finding_id, role=finding.agent_role)
    return {"finding_id": finding_id, "summary": finding.summary}


async def _handle_competitor_scrape(
    input_data: dict[str, Any], _context: ToolContext
) -> dict[str, Any]:
    url = input_data["url"]
    focus = input_data.get("focus", "taglines")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"})
            text = resp.text[:8000]
    except Exception as exc:
        log.warning("competitor_scrape_failed", url=url, error=str(exc))
        text = ""

    return {
        "url": url,
        "focus": focus,
        "extracted_text": text,
        "status": "ok" if text else "fetch_failed",
    }


# DEMO STUB — replace with real Google Trends API integration post-MVP
async def _handle_google_trends_peru(
    input_data: dict[str, Any], _context: ToolContext
) -> dict[str, Any]:
    keywords = input_data.get("keywords", [])
    return {
        "geo": "PE",
        "timeframe": input_data.get("timeframe", "today 12-m"),
        "data": {
            kw: {
                "average_interest": 65,
                "peak_month": "diciembre",
                "related_queries": [f"{kw} precio", f"{kw} donde comprar", f"mejor {kw}"],
                "trend": "rising",
            }
            for kw in keywords
        },
        "_stub": True,
    }


# DEMO STUB — replace with real Reddit API integration post-MVP
async def _handle_reddit_search(
    input_data: dict[str, Any], context: ToolContext
) -> dict[str, Any]:
    query = input_data.get("query", "")
    category = context.brief.category
    return {
        "query": query,
        "subreddits": input_data.get("subreddits", ["r/peru"]),
        "posts": [
            {
                "title": f"¿Dónde consigo {category} de calidad en Lima?",
                "subreddit": "r/peru",
                "upvotes": 142,
                "comments": 38,
                "sentiment": "curious",
                "top_comment": "En Wong de Miraflores siempre tienen buena oferta. Lo que más me importa es que sea natural.",
            },
            {
                "title": f"Mi opinión sobre {category} peruanos vs importados",
                "subreddit": "r/peru",
                "upvotes": 89,
                "comments": 21,
                "sentiment": "mixed",
                "top_comment": "Los nacionales han mejorado mucho, especialmente los que usan ingredientes andinos.",
            },
            {
                "title": f"{category} saludable sin químicos — ¿existe en Perú?",
                "subreddit": "r/latinoamerica",
                "upvotes": 55,
                "comments": 14,
                "sentiment": "seeking",
                "top_comment": "Busca marcas que usen quinua o kiwicha, son más naturales que las importadas.",
            },
        ],
        "sentiment_summary": {
            "positive": 0.45,
            "neutral": 0.30,
            "negative": 0.10,
            "curious": 0.15,
        },
        "key_themes": [
            "autenticidad peruana",
            "ingredientes naturales/andinos",
            "precio-valor",
            "disponibilidad en retail",
        ],
        "_stub": True,
    }


# DEMO STUB — replace with real INEI API integration post-MVP
async def _handle_inei_stats(
    input_data: dict[str, Any], _context: ToolContext
) -> dict[str, Any]:
    topic = input_data.get("topic", "demographics")
    region = input_data.get("region", "Lima")
    stubs: dict[str, Any] = {
        "demographics": {
            "population": 11_200_000,
            "urban_pct": 98.2,
            "median_age": 29,
            "gen_z_pct_18_25": 15.3,
            "millennials_pct_26_40": 28.1,
            "region": region,
        },
        "consumer_spending": {
            "monthly_avg_food_soles": 650,
            "snack_category_growth_yoy_pct": 12.4,
            "healthy_snack_premium_willingness_pct": 38,
            "ecommerce_food_pct": 22,
            "region": region,
        },
        "food_consumption": {
            "quinoa_consumption_growth_yoy_pct": 18.5,
            "traditional_snacks_market_share_pct": 42,
            "imported_snacks_market_share_pct": 28,
            "functional_food_awareness_pct": 55,
            "region": region,
        },
        "income_distribution": {
            "nse_ab_pct": 20.4,
            "nse_c_pct": 40.1,
            "nse_de_pct": 39.5,
            "region": region,
        },
        "urbanization": {
            "urban_pct": 98.2,
            "lima_share_of_national_gdp_pct": 55,
            "region": region,
        },
    }
    return {**stubs.get(topic, {}), "_stub": True, "source": "INEI 2024 (stub)"}


# ─────────────────────────────────────────────
# Dispatcher
# ─────────────────────────────────────────────

_HANDLERS = {
    "save_research_finding": _handle_save_research_finding,
    "competitor_site_scrape": _handle_competitor_scrape,
    "google_trends_peru": _handle_google_trends_peru,
    "reddit_search_spanish": _handle_reddit_search,
    "inei_peru_stats": _handle_inei_stats,
}


async def execute_tool(name: str, input_data: dict[str, Any], context: ToolContext) -> dict[str, Any]:
    handler = _HANDLERS.get(name)
    if handler is None:
        log.warning("unknown_tool", tool_name=name)
        return {"error": f"Unknown tool: {name}"}
    try:
        result = await handler(input_data, context)
        return result
    except Exception as exc:
        log.error("tool_execution_error", tool=name, error=str(exc))
        return {"error": str(exc), "tool": name}
