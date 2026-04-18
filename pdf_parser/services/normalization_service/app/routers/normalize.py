from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.pipeline import normalize_nanonets_payload
from app.schema.llm_document import LLMNormalizedDocument

router = APIRouter(prefix="/v1", tags=["normalize"])


class NormalizeRequest(BaseModel):
    nanonets_response: dict[str, Any] = Field(
        description="Raw JSON body returned by Nanonets Document Extraction (sync/async poll).",
    )
    document_id: UUID | None = None
    job_id: UUID | None = None


@router.post(
    "/normalize",
    response_model=LLMNormalizedDocument,
    summary="Normalize Nanonets JSON into LLM-ready text + chunks",
)
async def normalize(
    request: Request,
    body: NormalizeRequest,
    settings: Annotated[Settings, Depends(get_settings)],
) -> LLMNormalizedDocument:
    cl = request.headers.get("content-length")
    if cl is not None:
        try:
            if int(cl) > settings.max_request_json_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="Request body exceeds max_request_json_bytes.",
                )
        except ValueError:
            pass

    try:
        return normalize_nanonets_payload(
            body.nanonets_response,
            settings=settings,
            document_id=body.document_id,
            job_id=body.job_id,
        )
    except TypeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/health", summary="Liveness probe")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "normalization"}
