from __future__ import annotations

import re


_MULTI_BLANK = re.compile(r"\n[ \t]*\n[ \t]*\n+")


def normalize_paragraph_breaks(text: str) -> str:
    """
    Collapses runs of blank lines into a single paragraph boundary (double newline).
    """
    if not text:
        return ""
    t = _MULTI_BLANK.sub("\n\n", text)
    return t.strip()
