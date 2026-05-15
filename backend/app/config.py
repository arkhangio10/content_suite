from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    anthropic_api_key: str = Field(default="")
    claude_model_orchestrator: str = Field(default="claude-sonnet-4-6")
    claude_model_worker: str = Field(default="claude-haiku-4-5")
    claude_model_synthesizer: str = Field(default="claude-opus-4-7")
    claude_model_evaluator: str = Field(default="claude-sonnet-4-6")

    claude_model_vision: str = Field(default="claude-sonnet-4-6")

    groq_api_key: str = Field(default="")
    groq_model: str = Field(default="llama-3.3-70b-versatile")

    voyage_api_key: str = Field(default="")
    voyage_model: str = Field(default="voyage-multilingual-2")

    supabase_url: str = Field(default="")
    supabase_anon_key: str = Field(default="")
    supabase_service_role_key: str = Field(default="")
    supabase_jwt_secret: str = Field(default="")

    database_url: str = Field(default="")

    langfuse_public_key: str = Field(default="")
    langfuse_secret_key: str = Field(default="")
    langfuse_host: str = Field(default="https://cloud.langfuse.com")

    app_env: Literal["development", "staging", "production"] = Field(default="development")
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(default="INFO")
    cost_ceiling_usd: float = Field(default=2.00, gt=0)
    max_repair_iterations: int = Field(default=2, ge=0, le=5)

    cors_allowed_origins: str = Field(default="http://localhost:5173,http://localhost:3000")

    @field_validator("cors_allowed_origins")
    @classmethod
    def _strip_origins(cls, v: str) -> str:
        return ",".join(part.strip() for part in v.split(",") if part.strip())

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o for o in self.cors_allowed_origins.split(",") if o]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
