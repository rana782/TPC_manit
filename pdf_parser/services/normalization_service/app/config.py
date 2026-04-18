from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "document-normalization-service"
    host: str = "0.0.0.0"
    port: int = 8003
    log_level: str = "INFO"

    normalization_version: str = Field(default="2.0.0")
    tiktoken_encoding: str = Field(
        default="cl100k_base",
        description="tiktoken encoding name used for chunk sizing (OpenAI-compatible).",
    )
    chunk_min_tokens: int = Field(default=500, ge=64)
    chunk_max_tokens: int = Field(default=1000, ge=128)
    summary_hint_max_chars: int = Field(default=420, ge=80, le=2000)
    max_request_json_bytes: int = Field(default=25 * 1024 * 1024, ge=1024)

    @model_validator(mode="after")
    def _validate_chunk_bounds(self) -> "Settings":
        if self.chunk_min_tokens > self.chunk_max_tokens:
            raise ValueError("chunk_min_tokens must be <= chunk_max_tokens")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
