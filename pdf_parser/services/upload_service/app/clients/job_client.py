import logging
from pathlib import Path
from uuid import UUID

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)


async def register_job_with_service(
    settings: Settings,
    *,
    job_id: UUID,
    document_id: UUID,
    user_id: str | None,
    storage_relative_path: str,
    stored_filename: str,
    content_type: str,
) -> None:
    if not settings.enable_job_registration:
        return
    url = settings.job_service_base_url.rstrip("/") + "/v1/internal/jobs/register"
    token = settings.internal_service_token.get_secret_value()
    payload = {
        "job_id": str(job_id),
        "document_id": str(document_id),
        "user_id": user_id,
        "storage_relative_path": storage_relative_path.replace("\\", "/"),
        "stored_filename": stored_filename,
        "content_type": content_type,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            url,
            json=payload,
            headers={"X-Internal-Token": token},
        )
        resp.raise_for_status()
    logger.info("Registered job_id=%s with job service", job_id)
