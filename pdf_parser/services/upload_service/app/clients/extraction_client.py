import asyncio
import logging
from pathlib import Path
from uuid import UUID

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)


async def forward_to_extraction(
    settings: Settings,
    *,
    file_path: Path,
    document_id: UUID,
    job_id: UUID,
    content_type: str,
    user_id: str | None,
) -> None:
    """
    POST multipart to extraction service. Retries with exponential backoff.
    """
    url = settings.extraction_service_base_url.rstrip("/") + settings.extraction_ingest_path
    last_exc: Exception | None = None
    for attempt in range(1, settings.forward_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=settings.extraction_timeout_seconds) as client:
                with file_path.open("rb") as fh:
                    files = {
                        "file": (file_path.name, fh, content_type or "application/octet-stream"),
                    }
                    data = {
                        "document_id": str(document_id),
                        "job_id": str(job_id),
                    }
                    if user_id is not None:
                        data["user_id"] = user_id
                    resp = await client.post(url, files=files, data=data)
                    resp.raise_for_status()
            logger.info(
                "Forwarded upload to extraction attempt=%s document_id=%s job_id=%s",
                attempt,
                document_id,
                job_id,
            )
            return
        except (httpx.HTTPError, OSError) as exc:
            last_exc = exc
            logger.warning(
                "Extraction forward failed attempt=%s/%s document_id=%s: %s",
                attempt,
                settings.forward_retries,
                document_id,
                exc,
            )
            if attempt < settings.forward_retries:
                await asyncio.sleep(settings.forward_retry_backoff_seconds * attempt)
    assert last_exc is not None
    logger.error(
        "Giving up forwarding document_id=%s job_id=%s after %s attempts",
        document_id,
        job_id,
        settings.forward_retries,
    )
    raise last_exc
