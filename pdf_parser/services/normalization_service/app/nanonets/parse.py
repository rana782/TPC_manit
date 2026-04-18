from __future__ import annotations

import json
from typing import Any


def extract_nanonets_fragments(nanonets_raw: dict[str, Any]) -> dict[str, Any]:
    """
    Pull common Nanonets Document Extraction shapes without interpreting business meaning.
    See Nanonets ``ExtractResponse`` / ``ExtractionResult`` (markdown/html/json/csv content).
    """
    result = nanonets_raw.get("result") if isinstance(nanonets_raw, dict) else None
    if not isinstance(result, dict):
        result = {}

    def fmt_content(fmt: str) -> Any:
        node = result.get(fmt)
        if isinstance(node, dict):
            return node.get("content")
        return None

    return {
        "json_content": fmt_content("json"),
        "markdown_content": fmt_content("markdown"),
        "html_content": fmt_content("html"),
        "csv_content": fmt_content("csv"),
        "record_id": nanonets_raw.get("record_id") if isinstance(nanonets_raw, dict) else None,
        "status": nanonets_raw.get("status") if isinstance(nanonets_raw, dict) else None,
        "success": nanonets_raw.get("success") if isinstance(nanonets_raw, dict) else None,
        "message": nanonets_raw.get("message") if isinstance(nanonets_raw, dict) else None,
        "filename": nanonets_raw.get("filename") if isinstance(nanonets_raw, dict) else None,
        "pages_processed": nanonets_raw.get("pages_processed") if isinstance(nanonets_raw, dict) else None,
        "file_size": nanonets_raw.get("file_size") if isinstance(nanonets_raw, dict) else None,
        "output_format": nanonets_raw.get("output_format") if isinstance(nanonets_raw, dict) else None,
        "processing_time": nanonets_raw.get("processing_time") if isinstance(nanonets_raw, dict) else None,
        "created_at": nanonets_raw.get("created_at") if isinstance(nanonets_raw, dict) else None,
    }


def _stringify_json_like(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False)
    except TypeError:
        return str(value)


def build_baseline_text_and_structure(
    fragments: dict[str, Any],
) -> tuple[str, Any]:
    """
    Returns (raw_text_baseline, structured_data_baseline).
    Prefers JSON ``content`` for structure; concatenates textual channels for ``raw_text``.
    """
    parts: list[str] = []
    jc = fragments.get("json_content")
    mc = fragments.get("markdown_content")
    hc = fragments.get("html_content")
    cc = fragments.get("csv_content")

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

    raw_text = "\n\n".join([p for p in parts if p])
    return raw_text, structured
