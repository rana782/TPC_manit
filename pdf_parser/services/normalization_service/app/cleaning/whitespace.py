from __future__ import annotations

import re
import unicodedata


_MULTI_SPACE = re.compile(r"[ \t]+")
_MULTI_NEWLINE = re.compile(r"\n{3,}")


def normalize_whitespace(text: str) -> str:
    if not text:
        return ""
    t = unicodedata.normalize("NFKC", text)
    t = t.replace("\r\n", "\n").replace("\r", "\n")
    lines: list[str] = []
    for line in t.split("\n"):
        line = _MULTI_SPACE.sub(" ", line).rstrip()
        lines.append(line)
    t = "\n".join(lines)
    t = _MULTI_NEWLINE.sub("\n\n", t)
    return t.strip()
