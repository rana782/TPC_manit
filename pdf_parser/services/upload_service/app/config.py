from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "document-upload-service"
    host: str = "0.0.0.0"
    port: int = 8001
    log_level: str = "INFO"

    storage_root: Path = Field(default=Path("./data/uploads"))
    extraction_service_base_url: str = Field(
        default="http://127.0.0.1:8002",
        description="Base URL of the extraction microservice (no trailing slash).",
    )
    enable_extraction_forward: bool = Field(
        default=False,
        description="If true, upload forwards directly to extraction. Prefer false when a worker owns extraction.",
    )
    extraction_ingest_path: str = Field(
        default="/v1/internal/ingest",
        description="Path appended to base URL for forwarding uploads.",
    )
    extraction_timeout_seconds: float = 120.0
    forward_retries: int = 3
    forward_retry_backoff_seconds: float = 2.0

    job_service_base_url: str = Field(
        default="http://127.0.0.1:8004",
        description="Job/persistence service base URL (no trailing slash).",
    )
    enable_job_registration: bool = Field(
        default=True,
        description="If true, registers jobs with the job service after storing uploads.",
    )
    internal_service_token: SecretStr = Field(
        default=SecretStr("change-me-internal-token"),
        description="Shared secret for internal service routes and job registration.",
    )

    max_upload_bytes: int = 25 * 1024 * 1024
    allowed_extensions: frozenset[str] = frozenset(
        {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".tif", ".tiff"}
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
