"""Configurable settings. Model names and budget are env-driven; no secrets in repo."""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Ami countersign: start confidence 0.6
DEFAULT_CONFIDENCE_THRESHOLD = 0.6


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    redis_url: str = Field(default="redis://127.0.0.1:6379/0", alias="REDIS_URL")
    ollama_cloud_base_url: str = Field(default="https://ollama.com", alias="OLLAMA_CLOUD_BASE_URL")
    ollama_cloud_api_key: str = Field(default="", alias="OLLAMA_CLOUD_API_KEY")

    model_light: str = Field(default="nemotron-3-nano", alias="MODEL_LIGHT")
    model_mid: str = Field(default="gpt-oss:120b", alias="MODEL_MID")
    model_mid_alt: str = Field(default="glm-5.3-flash", alias="MODEL_MID_ALT")
    model_heavy: str = Field(default="deepseek-v4.1-flash", alias="MODEL_HEAVY")

    # Placeholder amount; Cid sets the real daily budget.
    daily_budget_eur: float = Field(default=0.0, alias="DAILY_BUDGET_EUR")
    confidence_threshold: float = Field(
        default=DEFAULT_CONFIDENCE_THRESHOLD, alias="CONFIDENCE_THRESHOLD"
    )

    host: str = Field(default="127.0.0.1", alias="HOST")
    port: int = Field(default=8088, alias="PORT")

    def model_for(self, tier: str) -> str:
        mapping = {
            "leicht": self.model_light,
            "mittel": self.model_mid,
            "schwer": self.model_heavy,
        }
        return mapping.get(tier, self.model_mid)

    def models_dict(self) -> dict[str, str]:
        return {
            "leicht": self.model_light,
            "mittel": self.model_mid,
            "mittel_alt": self.model_mid_alt,
            "schwer": self.model_heavy,
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
