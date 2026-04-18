from functools import lru_cache

from typing import Optional

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "document-extraction-service"
    host: str = "0.0.0.0"
    port: int = 8002
    log_level: str = "INFO"

    nanonets_api_key: Optional[SecretStr] = Field(
        default=None,
        description="Bearer token for https://extraction-api.nanonets.com (required for ingest).",
    )
    nanonets_base_url: str = Field(
        default="https://extraction-api.nanonets.com",
        description="Nanonets API origin (no trailing slash).",
    )

    sync_max_pdf_pages: int = Field(
        default=5,
        ge=1,
        description="Nanonets sync supports small PDFs; route larger PDFs to async.",
    )
    sync_max_file_bytes: int = Field(
        default=15 * 1024 * 1024,
        ge=1,
        description="Also route to async when binary size exceeds this threshold.",
    )
    max_ingest_bytes: int = Field(
        default=50 * 1024 * 1024,
        ge=1,
        description="Reject inbound multipart bodies larger than this (rough guard).",
    )

    poll_interval_seconds: float = Field(default=2.0, gt=0)
    poll_timeout_seconds: float = Field(default=900.0, gt=0)
    nanonets_http_timeout_seconds: float = Field(default=300.0, gt=0)

    max_http_retries: int = Field(default=6, ge=1)
    base_backoff_seconds: float = Field(default=1.0, gt=0)
    max_retry_after_seconds: int = Field(default=120, ge=1)

    @field_validator("nanonets_base_url")
    @classmethod
    def strip_trailing_slash(cls, v: str) -> str:
        return v.rstrip("/")

    @field_validator("nanonets_api_key", mode="before")
    @classmethod
    def empty_api_key_as_none(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str) and v.strip() == "":
            return None
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
