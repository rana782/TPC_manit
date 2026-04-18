"""
Derive a stable pre-normalization text baseline from Nanonets JSON (mirrors normalization logic,
kept local to avoid cross-service imports).
"""

from __future__ import annotations

import json
from typing import Any


def _stringify_json_like(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False)
    except TypeError:
        return str(value)


def baseline_extracted_text(nanonets_raw: dict[str, Any] | None) -> str:
    if not isinstance(nanonets_raw, dict):
        return ""

    result = nanonets_raw.get("result")
    if not isinstance(result, dict):
        result = {}

    def fmt_content(fmt: str) -> Any:
        node = result.get(fmt)
        if isinstance(node, dict):
            return node.get("content")
        return None

    jc, mc, hc, cc = (
        fmt_content("json"),
        fmt_content("markdown"),
        fmt_content("html"),
        fmt_content("csv"),
    )

    parts: list[str] = []
    if isinstance(mc, str) and mc.strip():
        parts.append(mc.strip())
    if isinstance(hc, str) and hc.strip():
        parts.append(hc.strip())
    if isinstance(cc, str) and cc.strip():
        parts.append(cc.strip())

    structured: Any
    if jc is None:
        structured = {}
    elif isinstance(jc, (dict, list)):
        structured = jc
    elif isinstance(jc, str):
        structured = {"value": jc}
        if not parts:
            parts.append(jc.strip())
    else:
        structured = {"value": jc}
        if not parts:
            parts.append(str(jc).strip())

    if not parts and structured not in ({}, None):
        if isinstance(structured, dict):
            parts.append(_stringify_json_like(structured))
        elif isinstance(structured, list):
            parts.append(_stringify_json_like(structured))
        else:
            parts.append(str(structured))

    return "\n\n".join([p for p in parts if p])
