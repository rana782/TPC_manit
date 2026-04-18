from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any

import httpx

from app.config import Settings, get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("worker")


def _headers(settings: Settings) -> dict[str, str]:
    return {"X-Internal-Token": settings.internal_service_token.get_secret_value()}


async def claim_job(client: httpx.AsyncClient, settings: Settings) -> dict[str, Any] | None:
    url = settings.job_service_base_url.rstrip("/") + "/v1/internal/jobs/claim"
    resp = await client.post(url, headers=_headers(settings))
    if resp.status_code == 204:
        return None
    resp.raise_for_status()
    return resp.json()


async def fetch_upload_bytes(
    client: httpx.AsyncClient,
    settings: Settings,
    *,
    document_id: uuid.UUID,
) -> tuple[bytes, str]:
    url = (
        settings.upload_service_base_url.rstrip("/")
        + f"/v1/internal/documents/{document_id}/file"
    )
    resp = await client.get(url, headers=_headers(settings), timeout=settings.http_timeout_seconds)
    resp.raise_for_status()
    ctype = resp.headers.get("content-type", "application/octet-stream")
    return resp.content, ctype


async def extract_document(
    client: httpx.AsyncClient,
    settings: Settings,
    *,
    job_id: uuid.UUID,
    document_id: uuid.UUID,
    filename: str,
    content_type: str,
    data: bytes,
) -> dict[str, Any]:
    url = settings.extraction_service_base_url.rstrip("/") + "/v1/internal/ingest"
    files = {"file": (filename, data, content_type)}
    form = {"job_id": str(job_id), "document_id": str(document_id)}
    resp = await client.post(
        url,
        headers=_headers(settings),
        files=files,
        data=form,
        timeout=settings.http_timeout_seconds,
    )
    resp.raise_for_status()
    return resp.json()


async def normalize_document(
    client: httpx.AsyncClient,
    settings: Settings,
    *,
    nanonets_raw: dict[str, Any],
    job_id: uuid.UUID,
    document_id: uuid.UUID,
) -> dict[str, Any]:
    url = settings.normalization_service_base_url.rstrip("/") + "/v1/normalize"
    payload = {
        "nanonets_response": nanonets_raw,
        "job_id": str(job_id),
        "document_id": str(document_id),
    }
    resp = await client.post(url, json=payload, timeout=settings.http_timeout_seconds)
    resp.raise_for_status()
    return resp.json()


async def persist_result(
    client: httpx.AsyncClient,
    settings: Settings,
    *,
    job_id: uuid.UUID,
    nanonets_raw: dict[str, Any] | None,
    normalized: dict[str, Any] | None,
    ok: bool,
    error_message: str | None,
) -> None:
    url = settings.job_service_base_url.rstrip("/") + f"/v1/internal/jobs/{job_id}/result"
    body = {
        "nanonets_raw": nanonets_raw if ok else None,
        "normalized": normalized if ok else None,
        "status": "completed" if ok else "failed",
        "error_message": error_message,
    }
    resp = await client.put(url, headers=_headers(settings), json=body, timeout=60.0)
    resp.raise_for_status()


async def process_once(settings: Settings) -> bool:
    async with httpx.AsyncClient() as client:
        job = await claim_job(client, settings)
        if job is None:
            return False

        job_id = uuid.UUID(str(job["job_id"]))
        document_id = uuid.UUID(str(job["document_id"]))
        stored_filename = str(job["stored_filename"])
        content_type = str(job["content_type"])

        nanonets_raw: dict[str, Any] | None = None
        try:
            raw_bytes, ctype = await fetch_upload_bytes(client, settings, document_id=document_id)
            nanonets_raw = await extract_document(
                client,
                settings,
                job_id=job_id,
                document_id=document_id,
                filename=stored_filename,
                content_type=ctype or content_type,
                data=raw_bytes,
            )
            normalized = await normalize_document(
                client,
                settings,
                nanonets_raw=nanonets_raw,
                job_id=job_id,
                document_id=document_id,
            )
            await persist_result(
                client,
                settings,
                job_id=job_id,
                nanonets_raw=nanonets_raw,
                normalized=normalized,
                ok=True,
                error_message=None,
            )
            logger.info("Completed job_id=%s", job_id)
        except Exception as exc:
            logger.exception("Failed job_id=%s", job_id)
            await persist_result(
                client,
                settings,
                job_id=job_id,
                nanonets_raw=nanonets_raw,
                normalized=None,
                ok=False,
                error_message=str(exc),
            )
        return True


async def run_forever() -> None:
    settings = get_settings()
    logger.info("Worker started.")
    while True:
        try:
            worked = await process_once(settings)
            if not worked:
                await asyncio.sleep(settings.poll_interval_seconds)
        except Exception:
            logger.exception("Worker loop error")
            await asyncio.sleep(settings.poll_interval_seconds)


def main() -> None:
    asyncio.run(run_forever())


if __name__ == "__main__":
    main()
