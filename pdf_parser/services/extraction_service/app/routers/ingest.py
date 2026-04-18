from __future__ import annotations

import json
import logging
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response

from app.config import Settings, get_settings
from app.json_options import resolve_json_options
from app.nanonets.extract import run_nanonets_extraction
from app.routing import should_use_async

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["ingest"])


def _nanonets_configured(settings: Settings) -> bool:
    key = settings.nanonets_api_key
    return key is not None and bool(key.get_secret_value().strip())


async def _read_upload_with_limit(upload: UploadFile, max_bytes: int) -> bytes:
    total = 0
    chunks: list[bytes] = []
    while True:
        piece = await upload.read(1024 * 1024)
        if not piece:
            break
        total += len(piece)
        if total > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds max_ingest_bytes={max_bytes}.",
            )
        chunks.append(piece)
    return b"".join(chunks)


@router.post(
    "/internal/ingest",
    summary="Ingest forwarded blob and call Nanonets (sync or async+poll)",
    response_class=Response,
)
async def internal_ingest(
    settings: Annotated[Settings, Depends(get_settings)],
    file: UploadFile = File(...),
    document_id: UUID = Form(...),
    job_id: UUID = Form(...),
    user_id: str | None = Form(None),
    json_options: str | None = Form(
        None,
        description="Passed verbatim to Nanonets json_options (field list, flags, or JSON Schema string).",
    ),
    json_schema: str | None = Form(
        None,
        description="Convenience: JSON text minified into json_options when json_options is omitted.",
    ),
) -> Response:
    if not _nanonets_configured(settings):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="NANONETS_API_KEY is not configured.",
        )

    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename on upload.")

    raw = await _read_upload_with_limit(file, settings.max_ingest_bytes)
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file.")

    try:
        resolved_json = resolve_json_options(json_options=json_options, json_schema=json_schema)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid json_schema JSON: {exc}") from exc

    use_async = should_use_async(filename=file.filename, file_bytes=raw, settings=settings)
    content_type = file.content_type or "application/octet-stream"

    logger.info(
        "Ingest job_id=%s document_id=%s async=%s bytes=%s user_id=%s",
        job_id,
        document_id,
        use_async,
        len(raw),
        user_id,
    )

    try:
        nanonets_resp = await run_nanonets_extraction(
            settings,
            file_bytes=raw,
            filename=file.filename,
            content_type=content_type,
            json_options=resolved_json,
            use_async=use_async,
        )
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    ct = nanonets_resp.headers.get("content-type", "application/json")
    return Response(content=nanonets_resp.content, status_code=nanonets_resp.status_code, media_type=ct)


@router.get("/health", summary="Liveness probe")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "extraction"}
