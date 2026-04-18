from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    poll_interval_seconds: float = Field(default=1.5, gt=0)
    http_timeout_seconds: float = Field(default=600.0, gt=0)

    job_service_base_url: str = Field(default="http://127.0.0.1:8004")
    upload_service_base_url: str = Field(default="http://127.0.0.1:8001")
    extraction_service_base_url: str = Field(default="http://127.0.0.1:8002")
    normalization_service_base_url: str = Field(default="http://127.0.0.1:8003")

    internal_service_token: SecretStr = Field(default=SecretStr("change-me-internal-token"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
