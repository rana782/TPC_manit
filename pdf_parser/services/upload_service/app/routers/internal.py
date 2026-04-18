import json
import logging
from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import FileResponse

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/internal", tags=["internal"])


def _verify_token(settings: Settings, x_internal_token: str | None) -> None:
    if not x_internal_token or x_internal_token.strip() != settings.internal_service_token.get_secret_value():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal token.")


@router.get("/documents/{document_id}/file")
async def download_stored_document(
    document_id: UUID,
    settings: Annotated[Settings, Depends(get_settings)],
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
) -> FileResponse:
    _verify_token(settings, x_internal_token)
    doc_dir = (settings.storage_root / str(document_id)).resolve()
    manifest_path = doc_dir / "manifest.json"
    if not manifest_path.is_file():
        raise HTTPException(status_code=404, detail="Document not found.")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        logger.exception("Corrupt manifest for document_id=%s", document_id)
        raise HTTPException(status_code=500, detail="Corrupt manifest.") from exc
    stored = manifest.get("stored_filename")
    if not stored or not isinstance(stored, str):
        raise HTTPException(status_code=500, detail="Manifest missing stored_filename.")
    if ".." in stored or "/" in stored or "\\" in stored:
        raise HTTPException(status_code=400, detail="Invalid stored_filename.")
    file_path = (doc_dir / stored).resolve()
    try:
        file_path.relative_to(doc_dir)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid stored path.") from exc
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Stored file missing.")
    media_type = manifest.get("content_type") or "application/octet-stream"
    return FileResponse(path=file_path, filename=stored, media_type=media_type)
