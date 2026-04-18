from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import Settings, get_settings
from app.db import get_session
from app.deps import verify_internal_token
from app.models import Document, Job, Result
from app.nanonets_baseline import baseline_extracted_text
from app import statuses

router = APIRouter(prefix="/v1", tags=["jobs"])


class JobRegisterRequest(BaseModel):
    job_id: uuid.UUID
    document_id: uuid.UUID
    user_id: str | None = None
    storage_relative_path: str = Field(min_length=1)
    stored_filename: str = Field(min_length=1)
    content_type: str = Field(min_length=1)


class JobResultWrite(BaseModel):
    """Worker persistence payload. ``normalized`` maps to ``results.normalized_output``."""

    nanonets_raw: dict[str, Any] | None = None
    normalized: dict[str, Any] | None = None
    extracted_text: str | None = Field(
        default=None,
        description="Optional override; otherwise derived from nanonets_raw baseline concatenation.",
    )
    status: Literal["completed", "failed"]
    error_message: str | None = None


class JobPublicResponse(BaseModel):
    job_id: uuid.UUID
    document_id: uuid.UUID
    user_id: str | None
    status: str
    retry_count: int = 0
    max_job_retries: int = Field(description="Server limit for POST /internal/jobs/{id}/retry.")
    retries_remaining: int = Field(
        default=0,
        description="How many more internal retries are allowed after the current retry_count.",
    )
    extracted_text: str | None = None
    result: Any | None = Field(
        default=None,
        description="Full normalized LLM payload when present (typically a JSON object).",
    )
    error_message: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


@router.post(
    "/internal/jobs/register",
    dependencies=[Depends(verify_internal_token)],
    status_code=status.HTTP_201_CREATED,
)
async def register_job(
    payload: JobRegisterRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    existing_job = await session.get(Job, payload.job_id)
    if existing_job is not None:
        return {"status": "exists"}

    doc = await session.get(Document, payload.document_id)
    if doc is None:
        session.add(
            Document(
                document_id=payload.document_id,
                user_id=payload.user_id,
                storage_relative_path=payload.storage_relative_path,
                stored_filename=payload.stored_filename,
                content_type=payload.content_type,
            )
        )
    else:
        doc.user_id = payload.user_id if payload.user_id is not None else doc.user_id
        doc.storage_relative_path = payload.storage_relative_path
        doc.stored_filename = payload.stored_filename
        doc.content_type = payload.content_type

    session.add(
        Job(
            job_id=payload.job_id,
            document_id=payload.document_id,
            status=statuses.QUEUED,
            retry_count=0,
        )
    )
    await session.commit()
    return {"status": "created"}


@router.post(
    "/internal/jobs/claim",
    dependencies=[Depends(verify_internal_token)],
    response_model=None,
)
async def claim_next_job(session: Annotated[AsyncSession, Depends(get_session)]) -> Response:
    sql = text(
        """
WITH cte AS (
  SELECT job_id
  FROM jobs
  WHERE status = 'queued'
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE jobs AS j
SET status = 'processing', updated_at = NOW()
FROM cte, documents d
WHERE j.job_id = cte.job_id
  AND d.document_id = j.document_id
RETURNING
  j.job_id,
  j.document_id,
  j.retry_count,
  d.user_id AS user_id,
  j.status,
  d.storage_relative_path,
  d.stored_filename,
  d.content_type,
  j.created_at,
  j.updated_at;
"""
    )
    result = await session.execute(sql)
    row = result.mappings().first()
    await session.commit()
    if row is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return Response(
        content=json.dumps(dict(row), default=str),
        media_type="application/json",
        status_code=status.HTTP_200_OK,
    )


@router.put(
    "/internal/jobs/{job_id}/result",
    dependencies=[Depends(verify_internal_token)],
)
async def write_job_result(
    job_id: uuid.UUID,
    payload: JobResultWrite,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    job = await session.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    terminal_status = payload.status
    if job.status == statuses.COMPLETED and terminal_status == "completed":
        await session.commit()
        return {"status": "ok", "idempotent": True}

    if job.status in statuses.TERMINAL:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Job is already terminal: {job.status}",
        )

    if job.status != statuses.PROCESSING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Job must be in processing state (got {job.status}).",
        )

    job.status = terminal_status
    job.error_message = payload.error_message

    if terminal_status == statuses.COMPLETED or payload.nanonets_raw is not None or payload.normalized is not None:
        extracted = (payload.extracted_text or "").strip() or None
        if extracted is None and payload.nanonets_raw is not None:
            extracted = baseline_extracted_text(payload.nanonets_raw) or None

        existing = (
            await session.execute(select(Result).where(Result.job_id == job_id).limit(1))
        ).scalar_one_or_none()
        if existing is None:
            session.add(
                Result(
                    job_id=job_id,
                    document_id=job.document_id,
                    extracted_text=extracted,
                    nanonets_raw=payload.nanonets_raw,
                    normalized_output=payload.normalized,
                )
            )
        else:
            existing.extracted_text = extracted
            existing.nanonets_raw = payload.nanonets_raw
            existing.normalized_output = payload.normalized

    await session.commit()
    return {"status": "ok"}


@router.post(
    "/internal/jobs/{job_id}/retry",
    dependencies=[Depends(verify_internal_token)],
)
async def retry_failed_job(
    job_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    """
    Re-queue a **failed** job: clears persisted results and returns status to ``queued`` for the worker.
    """
    job = await session.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.status != statuses.FAILED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only failed jobs can be retried (status={job.status}).",
        )
    if job.retry_count >= settings.max_job_retries:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Maximum retry attempts reached for this job.",
        )

    await session.execute(delete(Result).where(Result.job_id == job_id))
    job.retry_count += 1
    job.status = statuses.QUEUED
    job.error_message = None
    await session.commit()
    return {
        "status": job.status,
        "job_id": str(job.job_id),
        "retry_count": job.retry_count,
        "max_job_retries": settings.max_job_retries,
    }


def _retries_remaining(job: Job, settings: Settings) -> int:
    if job.status != statuses.FAILED:
        return 0
    return max(0, settings.max_job_retries - job.retry_count)


@router.get("/jobs/{job_id}", response_model=JobPublicResponse)
async def get_job_public(
    job_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> JobPublicResponse:
    res = await session.execute(
        select(Job)
        .where(Job.job_id == job_id)
        .options(selectinload(Job.result), selectinload(Job.document))
    )
    job = res.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    r = job.result
    norm = r.normalized_output if r is not None else None
    extracted = r.extracted_text if r is not None else None

    return JobPublicResponse(
        job_id=job.job_id,
        document_id=job.document_id,
        user_id=job.document.user_id if job.document is not None else None,
        status=job.status,
        retry_count=job.retry_count,
        max_job_retries=settings.max_job_retries,
        retries_remaining=_retries_remaining(job, settings),
        extracted_text=extracted,
        result=norm,
        error_message=job.error_message,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "job", "time": datetime.now(timezone.utc).isoformat()}
