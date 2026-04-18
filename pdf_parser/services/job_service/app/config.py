from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "document-job-service"
    host: str = "0.0.0.0"
    port: int = 8004
    log_level: str = "INFO"

    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/doc_intel",
        description="Async SQLAlchemy URL (postgresql+asyncpg://...).",
    )
    internal_service_token: SecretStr = Field(
        default=SecretStr("change-me-internal-token"),
        description="Shared secret for service-to-service calls.",
    )
    max_job_retries: int = Field(
        default=3,
        ge=0,
        description="Maximum number of re-queue attempts allowed for a failed job.",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
