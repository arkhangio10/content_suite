from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

_PROMPTS_DIR = Path(__file__).parent / "prompts"

_VALID_NAMES = {
    "orchestrator",
    "competitive_scan",
    "audience_research",
    "trend_analysis",
    "cultural_context",
    "positioning_analysis",
    "synthesizer",
    "evaluator",
    "repair",
}


@lru_cache(maxsize=32)
def _read_prompt_raw(name: str) -> str:
    path = _PROMPTS_DIR / f"{name}.md"
    if not path.exists():
        raise FileNotFoundError(f"Prompt file not found: {path}")
    return path.read_text(encoding="utf-8")


def load_prompt(name: str, **vars: object) -> str:
    if name not in _VALID_NAMES:
        raise ValueError(f"Unknown prompt '{name}'. Valid: {sorted(_VALID_NAMES)}")
    template = _read_prompt_raw(name)
    if not vars:
        return template

    def _replace(m: re.Match[str]) -> str:
        key = m.group(1)
        value = vars.get(key)
        if value is None:
            return m.group(0)
        return str(value)

    return re.sub(r"\{\{(\w+)\}\}", _replace, template)
