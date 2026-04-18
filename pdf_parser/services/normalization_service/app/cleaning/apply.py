from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any

from app.cleaning.noise import strip_control_noise, strip_zero_width_and_bom
from app.cleaning.paragraphs import normalize_paragraph_breaks
from app.cleaning.whitespace import normalize_whitespace


def build_llm_text_cleaning_chain() -> list[Callable[[str], str]]:
    return [
        strip_control_noise,
        strip_zero_width_and_bom,
        normalize_whitespace,
        normalize_paragraph_breaks,
    ]


def deep_apply_string_cleaners(value: Any, cleaners: Sequence[Callable[[str], str]]) -> Any:
    if isinstance(value, dict):
        return {k: deep_apply_string_cleaners(v, cleaners) for k, v in value.items()}
    if isinstance(value, list):
        return [deep_apply_string_cleaners(v, cleaners) for v in value]
    if isinstance(value, str):
        out = value
        for fn in cleaners:
            out = fn(out)
        return out
    return value
