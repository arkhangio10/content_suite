from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator


# ─────────────────────────────────────────────
# Primitive helpers
# ─────────────────────────────────────────────

class Provenance(BaseModel):
    finding_ids: list[str] = Field(min_length=1)
    confidence: float = Field(ge=0.0, le=1.0)
    uncertainty: bool = False
    human_reviewed: bool = False


def _prov_field(**kwargs: Any) -> Any:
    """Shortcut: a required provenance field serialised as '_provenance'."""
    return Field(
        validation_alias=AliasChoices("provenance", "_provenance"),
        serialization_alias="_provenance",
        **kwargs,
    )


def _chunk_field() -> Any:
    """Shortcut: optional _chunk_id field."""
    return Field(
        default=None,
        validation_alias=AliasChoices("chunk_id", "_chunk_id"),
        serialization_alias="_chunk_id",
    )


# ─────────────────────────────────────────────
# Input
# ─────────────────────────────────────────────

class ProductBrief(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    launch_id: str
    brand_id: str = Field(default="")
    category: str = Field(min_length=3, max_length=120)
    product_concept: str = Field(min_length=10, max_length=2000)
    target_audience: str = Field(min_length=5, max_length=500)
    tone_hint: str | None = None
    market: str = Field(default="PE", max_length=10)
    business_constraints: dict[str, Any] = Field(default_factory=dict)
    constraints: dict[str, Any] | None = None
    requested_by: UUID


# ─────────────────────────────────────────────
# Persona
# ─────────────────────────────────────────────

SESBracket = Literal["A", "B", "C1", "C2", "D", "E"]


class Persona(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    age_range: str = Field(examples=["22-28", "35-45"])
    ses_bracket: SESBracket
    region: str = Field(examples=["Lima Metropolitana", "Arequipa"])
    occupation: str
    lifestyle: str
    pain_points: list[str] = Field(min_length=2)
    aspirations: list[str] = Field(min_length=2)
    consumption_occasions: list[str] = Field(min_length=2)
    trust_signals: list[str] = Field(min_length=2)
    native_phrases: list[str] = Field(min_length=5, description="Authentic Peruvian Spanish phrases")
    provenance: Provenance = _prov_field()
    chunk_id: str | None = _chunk_field()


# ─────────────────────────────────────────────
# Tone of voice
# ─────────────────────────────────────────────

class ExamplePhrase(BaseModel):
    good: str
    bad: str
    why: str


class ToneOfVoice(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    descriptors: list[str] = Field(min_length=3, max_length=5)
    voice_summary: str
    dos: list[str] = Field(min_length=3, max_length=10)
    donts: list[str] = Field(min_length=3, max_length=10)
    example_phrases: list[ExamplePhrase] = Field(min_length=1)
    provenance: Provenance = _prov_field()


# ─────────────────────────────────────────────
# Vocabulary
# ─────────────────────────────────────────────

class Vocabulary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    preferred: list[str] = Field(min_length=5)
    forbidden: list[str] = Field(min_length=5)
    neutral: list[str] | None = None
    provenance: Provenance = _prov_field()

    @model_validator(mode="after")
    def check_disjoint(self) -> "Vocabulary":
        preferred_lc = {w.lower() for w in self.preferred}
        forbidden_lc = {w.lower() for w in self.forbidden}
        overlap = preferred_lc & forbidden_lc
        if overlap:
            raise ValueError(
                f"vocabulary.preferred and vocabulary.forbidden share terms: {sorted(overlap)}"
            )
        return self


# ─────────────────────────────────────────────
# Brand manual sections
# ─────────────────────────────────────────────

class BrandEssence(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    core_idea: str
    values: list[str] = Field(min_length=3, max_length=7)
    mission_statement: str
    provenance: Provenance = _prov_field()


class Positioning(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    statement: str
    target_segment: str
    unique_value_prop: str
    reasons_to_believe: list[str] = Field(min_length=3)
    provenance: Provenance = _prov_field()


class ContentPillar(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    description: str
    key_messages: list[str] = Field(min_length=2)
    example_topics: list[str] = Field(min_length=1)
    provenance: Provenance = _prov_field()
    chunk_id: str | None = _chunk_field()


class CulturalNote(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    topic: str
    guidance: str
    severity: Literal["avoid", "caution", "note"]
    provenance: Provenance = _prov_field()


class VisualIdentity(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    primary_colors: list[str] = Field(min_length=1, description="Hex codes or Pantone refs")
    secondary_colors: list[str] = Field(default_factory=list)
    typography: dict[str, str] = Field(
        examples=[{"heading": "Montserrat Bold", "body": "Inter Regular"}]
    )
    imagery_style: str
    logo_usage: str
    donts: list[str] = Field(default_factory=list)
    provenance: Provenance = _prov_field()


class BrandManualMeta(BaseModel):
    brand_id: str
    product_name: str
    version: int = 1
    market: str = "PE"
    language: str = "es-PE"
    launch_id: str
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    source_brief_id: str | None = None
    partial_evidence: bool = False


# ─────────────────────────────────────────────
# BrandManual (top-level, source of truth)
# ─────────────────────────────────────────────

_STOP_WORDS = {
    # Spanish connectors, prepositions
    "y", "o", "e", "u", "en", "de", "la", "el", "los", "las",
    "un", "una", "con", "sin", "a", "al", "del", "por", "para",
    "que", "no", "ni", "se", "lo", "le", "su", "sus", "más",
    "pero", "sino", "como", "cuando", "si", "muy", "bien",
    # Common Spanish action verbs that appear in both dos/donts with different objects
    "hablar", "usar", "utilizar", "hacer", "tener", "ser", "estar", "ir",
    "dar", "ver", "poder", "querer", "decir", "saber", "llegar", "llevar",
    "escribir", "evitar", "incluir", "mostrar", "crear", "mantener",
    # English stop words
    "the", "an", "and", "or", "in", "of", "to", "be", "not", "use",
}


def _word_set(phrases: list[str]) -> set[str]:
    words: set[str] = set()
    for phrase in phrases:
        for word in re.split(r"\W+", phrase.lower()):
            if len(word) > 3 and word not in _STOP_WORDS:
                words.add(word)
    return words


def _phrases_contradict(dos_phrase: str, donts_phrase: str) -> bool:
    dos_words = _word_set([dos_phrase])
    donts_words = _word_set([donts_phrase])
    if not dos_words or not donts_words:
        return False
    overlap = dos_words & donts_words
    # Only flag if > 60% of the shorter phrase's words are shared
    shorter = min(len(dos_words), len(donts_words))
    return shorter > 0 and len(overlap) / shorter > 0.60


class BrandManual(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    meta: BrandManualMeta
    brand_essence: BrandEssence
    positioning: Positioning
    personas: list[Persona] = Field(min_length=1, max_length=3)
    tone_of_voice: ToneOfVoice
    vocabulary: Vocabulary
    content_pillars: list[ContentPillar] = Field(min_length=3, max_length=6)
    taglines: list[str] = Field(min_length=3)
    key_messages: list[str] = Field(min_length=3)
    competitive_differentiators: list[str] = Field(min_length=2)
    cultural_sensitivities: list[CulturalNote]
    visual_identity: VisualIdentity

    @model_validator(mode="after")
    def check_tone_coherence(self) -> "BrandManual":
        contradictions: list[str] = []
        for d in self.tone_of_voice.dos:
            for dont in self.tone_of_voice.donts:
                if _phrases_contradict(d, dont):
                    contradictions.append(f"'{d}' vs '{dont}'")
        if contradictions:
            raise ValueError(
                f"tone_of_voice has contradicting do/don't pairs: {contradictions[:3]}"
            )
        return self


# ─────────────────────────────────────────────
# Worker outputs
# ─────────────────────────────────────────────

AgentRole = Literal[
    "competitive_scan",
    "audience_research",
    "trend_analysis",
    "cultural_context",
    "positioning_analysis",
]


class FindingItem(BaseModel):
    claim: str
    evidence: str
    source_url: str | None = None
    confidence: float = Field(default=0.7, ge=0.0, le=1.0)


class ResearchFinding(BaseModel):
    id: str | None = None
    trace_id: str
    brand_id: str | None = None
    agent_role: AgentRole
    summary: str = Field(max_length=500)
    detailed_findings: list[FindingItem] = Field(default_factory=list)
    structured_data: dict[str, Any] = Field(default_factory=dict)
    source_urls: list[str] = Field(default_factory=list)
    quality_self_assessment: float | None = Field(default=None, ge=0.0, le=1.0)


class WorkerResult(BaseModel):
    finding_id: str
    summary: str
    quality_self_assessment: float = Field(default=0.7, ge=0.0, le=1.0)
    agent_role: AgentRole


# ─────────────────────────────────────────────
# Evaluator outputs
# ─────────────────────────────────────────────

JUDGE_WEIGHTS: dict[str, float] = {
    "internal_consistency": 0.30,
    "factual_grounding": 0.30,
    "cultural_fit_peru": 0.25,
    "completeness": 0.15,
}


class JudgeScore(BaseModel):
    internal_consistency: float = Field(ge=0.0, le=1.0)
    factual_grounding: float = Field(ge=0.0, le=1.0)
    cultural_fit_peru: float = Field(ge=0.0, le=1.0)
    completeness: float = Field(ge=0.0, le=1.0)
    overall: float = Field(ge=0.0, le=1.0)

    @model_validator(mode="after")
    def check_overall(self) -> "JudgeScore":
        expected = sum(
            getattr(self, dim) * weight for dim, weight in JUDGE_WEIGHTS.items()
        )
        if abs(self.overall - expected) > 0.05:
            self.overall = round(expected, 4)
        return self


class JudgeViolation(BaseModel):
    dimension: str
    description: str
    severity: Literal["low", "medium", "high"]
    suggested_fix: str | None = None


class JudgeResult(BaseModel):
    scores: JudgeScore
    violations: list[JudgeViolation] = Field(default_factory=list)
    verdict: Literal["pass", "repair", "reject"]
    reasoning: str

    @field_validator("verdict", mode="before")
    @classmethod
    def normalise_verdict(cls, v: str) -> str:
        return v.lower().strip()
