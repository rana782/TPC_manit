from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "document-api-gateway"
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "INFO"

    upload_service_base_url: str = Field(default="http://127.0.0.1:8001")
    job_service_base_url: str = Field(default="http://127.0.0.1:8004")

    gateway_http_timeout_seconds: float = Field(default=300.0, gt=0)
    max_upload_bytes: int = Field(
        default=26 * 1024 * 1024,
        ge=1024,
        description="Reject uploads larger than this (Content-Length guard).",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
