from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.chunking import chunk_text_for_llm
from app.cleaning.apply import build_llm_text_cleaning_chain, deep_apply_string_cleaners
from app.config import Settings
from app.nanonets.parse import build_baseline_text_and_structure, extract_nanonets_fragments
from app.schema.llm_document import LLMNormalizedDocument, LLMReadyBundle
from app.summary_hint import build_summary_hint


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_metadata(
    *,
    settings: Settings,
    fragments: dict[str, Any],
    document_id: UUID | None,
    job_id: UUID | None,
) -> dict[str, Any]:
    return {
        "normalization_version": settings.normalization_version,
        "source": "nanonets-document-extraction",
        "normalized_at": _utc_now_iso(),
        "pages_processed": fragments.get("pages_processed"),
        "file_size": fragments.get("file_size"),
        "filename": fragments.get("filename"),
        "record_id": fragments.get("record_id"),
        "nanonets_status": fragments.get("status"),
        "nanonets_success": fragments.get("success"),
        "nanonets_message": fragments.get("message"),
        "processing_time": fragments.get("processing_time"),
        "created_at": fragments.get("created_at"),
        "correlation": {
            "document_id": str(document_id) if document_id else None,
            "job_id": str(job_id) if job_id else None,
        },
    }


def normalize_nanonets_payload(
    nanonets_raw: dict[str, Any],
    *,
    settings: Settings,
    document_id: UUID | None = None,
    job_id: UUID | None = None,
) -> LLMNormalizedDocument:
    if not isinstance(nanonets_raw, dict):
        raise TypeError("nanonets_raw must be a JSON object.")

    fragments = extract_nanonets_fragments(nanonets_raw)
    baseline_text, structured = build_baseline_text_and_structure(fragments)

    cleaners = build_llm_text_cleaning_chain()
    text = baseline_text or ""
    for fn in cleaners:
        text = fn(text)

    structured_clean = deep_apply_string_cleaners(structured, cleaners)

    chunks = chunk_text_for_llm(text, settings=settings)
    hint = build_summary_hint(text, max_chars=settings.summary_hint_max_chars)

    metadata = _build_metadata(
        settings=settings,
        fragments=fragments,
        document_id=document_id,
        job_id=job_id,
    )

    return LLMNormalizedDocument(
        text=text,
        structured=structured_clean,
        metadata=metadata,
        llm_ready=LLMReadyBundle(chunks=chunks, summary_hint=hint),
    )
