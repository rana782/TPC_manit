from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class UploadAcceptedResponse(BaseModel):
    """Returned immediately after the file is stored; downstream work is asynchronous."""

    job_id: UUID = Field(description="Pipeline job identifier for status polling / worker use.")
    document_id: UUID = Field(description="Stable id for the stored blob and downstream services.")
    status: str = Field(default="accepted", description="Upload accepted; processing continues asynchronously.")
    stored_filename: str = Field(description="Sanitized original filename on disk.")
    content_type: str
    user_id: Optional[str] = None


class ErrorResponse(BaseModel):
    detail: str
    code: Optional[str] = None
