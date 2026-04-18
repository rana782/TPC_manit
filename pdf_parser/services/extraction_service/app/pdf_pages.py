"""Best-effort PDF page counting for routing only (not content interpretation)."""

from __future__ import annotations

import logging
from io import BytesIO

from pypdf import PdfReader

logger = logging.getLogger(__name__)


def count_pdf_pages(data: bytes) -> int | None:
    try:
        reader = PdfReader(BytesIO(data), strict=False)
        return len(reader.pages)
    except Exception:
        logger.warning("Could not determine PDF page count; falling back to size-based routing.")
        return None
