from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.config import Settings

logger = logging.getLogger("gateway.upstream")


def _client_timeout(settings: Settings) -> httpx.Timeout:
    return httpx.Timeout(settings.gateway_http_timeout_seconds)


async def post_multipart_to_upload(
    settings: Settings,
    *,
    body: bytes,
    content_type: str,
) -> httpx.Response:
    url = settings.upload_service_base_url.rstrip("/") + "/v1/uploads"
    try:
        async with httpx.AsyncClient(timeout=_client_timeout(settings)) as client:
            return await client.post(
                url,
                content=body,
                headers={"content-type": content_type},
            )
    except httpx.TimeoutException as exc:
        logger.warning("upload_upstream_timeout request_id=—")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Upload request timed out.",
        ) from exc
    except httpx.RequestError as exc:
        logger.warning("upload_upstream_unreachable type=%s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Upload service is temporarily unavailable.",
        ) from exc


async def get_job_payload(settings: Settings, *, job_id: str) -> tuple[int, dict[str, Any] | None]:
    url = settings.job_service_base_url.rstrip("/") + f"/v1/jobs/{job_id}"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
            resp = await client.get(url)
    except httpx.TimeoutException as exc:
        logger.warning("job_upstream_timeout")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Job query timed out.",
        ) from exc
    except httpx.RequestError as exc:
        logger.warning("job_upstream_unreachable type=%s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Job service is temporarily unavailable.",
        ) from exc

    if resp.status_code == status.HTTP_404_NOT_FOUND:
        return 404, None
    try:
        data = resp.json()
    except ValueError:
        logger.error("job_upstream_invalid_json status=%s", resp.status_code)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invalid response from job service.",
        )
    if not isinstance(data, dict):
        return resp.status_code, None
    return resp.status_code, data
