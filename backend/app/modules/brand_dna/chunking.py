from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from app.modules.brand_dna.schemas import BrandManual


@dataclass
class ChunkRecord:
    brand_id: str
    manual_version: int
    section_name: str
    chunk_id: str
    content: str
    metadata: dict[str, Any] = field(default_factory=dict)


def _header(brand_id: str, section: str, market: str = "PE") -> str:
    return f"Brand: {brand_id}. Section: {section}. Market: {market}. "


def _safe_json(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, default=str)


def chunk_brand_manual(manual: BrandManual) -> list[ChunkRecord]:
    brand_id = manual.meta.brand_id
    version = manual.meta.version
    market = manual.meta.market
    chunks: list[ChunkRecord] = []

    def _add(section: str, chunk_suffix: str, content: str, meta: dict[str, Any] | None = None) -> None:
        chunk_id = f"{brand_id}_v{version}_{section}_{chunk_suffix}"
        header = _header(brand_id, section, market)
        chunks.append(
            ChunkRecord(
                brand_id=brand_id,
                manual_version=version,
                section_name=section,
                chunk_id=chunk_id,
                content=header + content,
                metadata=meta or {},
            )
        )

    # brand_essence
    essence = manual.brand_essence
    _add(
        "brand_essence",
        "main",
        f"Core idea: {essence.core_idea}. "
        f"Mission: {essence.mission_statement}. "
        f"Values: {', '.join(essence.values)}.",
    )

    # positioning
    pos = manual.positioning
    _add(
        "positioning",
        "main",
        f"Statement: {pos.statement}. "
        f"Target: {pos.target_segment}. "
        f"UVP: {pos.unique_value_prop}. "
        f"Reasons to believe: {'; '.join(pos.reasons_to_believe)}.",
    )

    # tone_of_voice
    tov = manual.tone_of_voice
    examples_text = " | ".join(
        f"Good: '{ep.good}' / Bad: '{ep.bad}'"
        for ep in tov.example_phrases[:3]
    )
    _add(
        "tone_of_voice",
        "main",
        f"Descriptors: {', '.join(tov.descriptors)}. "
        f"Summary: {tov.voice_summary}. "
        f"Dos: {'; '.join(tov.dos)}. "
        f"Don'ts: {'; '.join(tov.donts)}. "
        f"Examples: {examples_text}.",
    )

    # vocabulary
    vocab = manual.vocabulary
    _add(
        "vocabulary",
        "main",
        f"Preferred terms: {', '.join(vocab.preferred)}. "
        f"Forbidden terms: {', '.join(vocab.forbidden)}."
        + (f" Neutral: {', '.join(vocab.neutral)}." if vocab.neutral else ""),
    )

    # personas (one chunk each)
    for i, persona in enumerate(manual.personas):
        _add(
            "personas",
            f"persona_{i}",
            f"Name: {persona.name}. "
            f"Age: {persona.age_range}. NSE: {persona.ses_bracket}. "
            f"Region: {persona.region}. Occupation: {persona.occupation}. "
            f"Lifestyle: {persona.lifestyle}. "
            f"Pain points: {'; '.join(persona.pain_points)}. "
            f"Aspirations: {'; '.join(persona.aspirations)}. "
            f"Native phrases: {'; '.join(persona.native_phrases)}.",
            meta={"persona_index": i, "ses_bracket": persona.ses_bracket},
        )

    # content pillars (one chunk each)
    for i, pillar in enumerate(manual.content_pillars):
        _add(
            "content_pillars",
            f"pillar_{i}",
            f"Pillar: {pillar.name}. "
            f"Description: {pillar.description}. "
            f"Key messages: {'; '.join(pillar.key_messages)}. "
            f"Example topics: {'; '.join(pillar.example_topics)}.",
            meta={"pillar_index": i, "pillar_name": pillar.name},
        )

    # taglines + key messages + differentiators (combined)
    _add(
        "messaging",
        "taglines_messages",
        f"Taglines: {' | '.join(manual.taglines)}. "
        f"Key messages: {'; '.join(manual.key_messages)}. "
        f"Differentiators: {'; '.join(manual.competitive_differentiators)}.",
    )

    # cultural sensitivities
    if manual.cultural_sensitivities:
        sens_text = "; ".join(
            f"[{s.severity.upper()}] {s.topic}: {s.guidance}"
            for s in manual.cultural_sensitivities
        )
        _add("cultural_sensitivities", "main", sens_text)

    # visual identity
    vi = manual.visual_identity
    _add(
        "visual_identity",
        "main",
        f"Primary colors: {', '.join(vi.primary_colors)}. "
        f"Typography: {_safe_json(vi.typography)}. "
        f"Imagery style: {vi.imagery_style}. "
        f"Logo usage: {vi.logo_usage}.",
    )

    return chunks
