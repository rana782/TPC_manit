from __future__ import annotations

import re


_WS = re.compile(r"\s+")


def build_summary_hint(text: str, *, max_chars: int) -> str:
    """
    Short, neutral preview string for routing/prompt planning (not classification).
    """
    if not text:
        return ""
    one_line = _WS.sub(" ", text).strip()
    if len(one_line) <= max_chars:
        return one_line
    cut = one_line[: max_chars + 1]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" ,.;:-") + "…"
