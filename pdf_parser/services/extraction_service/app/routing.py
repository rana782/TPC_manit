from __future__ import annotations

from pathlib import Path

from app.config import Settings
from app.pdf_pages import count_pdf_pages

_IMAGE_SUFFIXES = frozenset(
    {
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".gif",
        ".tif",
        ".tiff",
        ".bmp",
    }
)


def should_use_async(*, filename: str, file_bytes: bytes, settings: Settings) -> bool:
    """
    Route large binaries (and multi-page PDFs) to Nanonets async. This is transport-only
    heuristics aligned with Nanonets sync limits; it does not interpret document semantics.
    """
    suffix = Path(filename or "").suffix.lower()
    size = len(file_bytes)

    if suffix in _IMAGE_SUFFIXES:
        return size > settings.sync_max_file_bytes

    if suffix == ".pdf":
        pages = count_pdf_pages(file_bytes)
        if pages is not None and pages > settings.sync_max_pdf_pages:
            return True
        return size > settings.sync_max_file_bytes

    return size > settings.sync_max_file_bytes
