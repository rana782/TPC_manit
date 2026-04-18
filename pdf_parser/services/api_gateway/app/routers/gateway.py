from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse, Response

from app.config import Settings, get_settings
from app.upstream import get_job_payload, post_multipart_to_upload
from app.validation import validate_multipart_upload

router = APIRouter(tags=["gateway"])


@router.post("/upload")
async def upload(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    """
    Accept a multipart upload and forward it to the upload microservice.
    """
    validate_multipart_upload(request, settings)
    body = await request.body()
    content_type = request.headers.get("content-type", "")
    resp = await post_multipart_to_upload(settings, body=body, content_type=content_type)
    ct = resp.headers.get("content-type", "application/json")
    return Response(content=resp.content, status_code=resp.status_code, media_type=ct)


@router.get("/job/{id}")
async def get_job(
    id: uuid.UUID,
    settings: Annotated[Settings, Depends(get_settings)],
) -> JSONResponse:
    """
    Poll job status and metadata (normalized payload is under ``result`` when completed).
    """
    code, payload = await get_job_payload(settings, job_id=str(id))
    if code == 404 or payload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    if code != status.HTTP_200_OK:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to load job status.",
        )
    return JSONResponse(status_code=status.HTTP_200_OK, content=payload)


@router.get("/result/{id}")
async def get_result(
    id: uuid.UUID,
    settings: Annotated[Settings, Depends(get_settings)],
) -> JSONResponse:
    """
    Return **only** the persisted normalized document (LLM-ready JSON) for a completed job.
    """
    code, payload = await get_job_payload(settings, job_id=str(id))
    if code == 404 or payload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    if code != status.HTTP_200_OK:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to load job result.",
        )
    if payload.get("status") != "completed":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Result not available for this job yet.",
        )
    normalized = payload.get("result")
    if not isinstance(normalized, dict):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Normalized result not found.",
        )
    return JSONResponse(status_code=status.HTTP_200_OK, content=normalized)


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "gateway"}
