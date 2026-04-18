import logging
import shutil
from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Header, HTTPException, UploadFile, status

from app.clients.extraction_client import forward_to_extraction
from app.clients.job_client import register_job_with_service
from app.config import Settings, get_settings
from app.deps import get_storage
from app.models.schemas import UploadAcceptedResponse
from app.storage.local_storage import LocalObjectStorage
from app.validation import assert_extension_allowed, assert_magic_matches_extension

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["uploads"])


async def _schedule_register_job(
    settings: Settings,
    *,
    job_id: UUID,
    document_id: UUID,
    user_id: str | None,
    storage_relative_path: str,
    stored_filename: str,
    content_type: str,
) -> None:
    try:
        await register_job_with_service(
            settings,
            job_id=job_id,
            document_id=document_id,
            user_id=user_id,
            storage_relative_path=storage_relative_path,
            stored_filename=stored_filename,
            content_type=content_type,
        )
    except Exception:
        logger.exception("Job registration failed job_id=%s document_id=%s", job_id, document_id)


async def _schedule_forward(
    settings: Settings,
    *,
    file_path: Path,
    document_id: UUID,
    job_id: UUID,
    content_type: str,
    user_id: str | None,
) -> None:
    if not settings.enable_extraction_forward:
        logger.info(
            "Extraction forward disabled; skipping HTTP call document_id=%s job_id=%s",
            document_id,
            job_id,
        )
        return
    try:
        await forward_to_extraction(
            settings,
            file_path=file_path,
            document_id=document_id,
            job_id=job_id,
            content_type=content_type,
            user_id=user_id,
        )
    except Exception:
        logger.exception(
            "Background forward failed document_id=%s job_id=%s (file retained for operator replay)",
            document_id,
            job_id,
        )


@router.post(
    "/uploads",
    response_model=UploadAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Ingest a document and enqueue downstream processing",
)
async def create_upload(
    background_tasks: BackgroundTasks,
    settings: Annotated[Settings, Depends(get_settings)],
    storage: Annotated[LocalObjectStorage, Depends(get_storage)],
    file: UploadFile = File(..., description="PDF or image file."),
    user_id: str | None = Form(None, description="Optional caller id (e.g. portal user)."),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> UploadAcceptedResponse:
    if file.filename is None or not str(file.filename).strip():
        raise HTTPException(status_code=400, detail="Missing filename.")
    await file.seek(0)
    normalized_user = (user_id or x_user_id or "").strip() or None

    try:
        suffix = assert_extension_allowed(file.filename, settings)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    document_id = uuid4()
    job_id = uuid4()
    content_type = file.content_type or "application/octet-stream"

    try:
        artifact = storage.save(
            document_id=document_id,
            job_id=job_id,
            original_filename=file.filename,
            stream=file.file,
            content_type=content_type,
            user_id=normalized_user,
            max_bytes=settings.max_upload_bytes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except OSError as exc:
        logger.exception("Storage failure for new upload")
        raise HTTPException(status_code=500, detail="Failed to persist upload.") from exc

    doc_dir = artifact.absolute_path.parent
    try:
        assert_magic_matches_extension(artifact.absolute_path, suffix)
    except ValueError as exc:
        shutil.rmtree(doc_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    rel_posix = artifact.relative_path.as_posix()

    background_tasks.add_task(
        _schedule_register_job,
        settings,
        job_id=job_id,
        document_id=document_id,
        user_id=normalized_user,
        storage_relative_path=rel_posix,
        stored_filename=artifact.stored_filename,
        content_type=content_type,
    )
    background_tasks.add_task(
        _schedule_forward,
        settings,
        file_path=artifact.absolute_path,
        document_id=document_id,
        job_id=job_id,
        content_type=content_type,
        user_id=normalized_user,
    )

    return UploadAcceptedResponse(
        job_id=job_id,
        document_id=document_id,
        status="accepted",
        stored_filename=artifact.stored_filename,
        content_type=content_type,
        user_id=normalized_user,
    )


@router.get("/health", summary="Liveness probe")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "upload"}
