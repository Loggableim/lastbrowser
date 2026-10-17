"""Configurable settings. Model + reasoning per tier; no secrets in repo."""
from __future__ import annotations

from functools import lru_cache
from typing import Any, Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Ami countersign: start confidence 0.6
DEFAULT_CONFIDENCE_THRESHOLD = 0.6

# Config spelling for humans/env; mapped to Ollama `think` field at call time.
# See https://docs.ollama.com/capabilities/thinking — false = off, "low"|"high"|"max" = level.
ReasoningLevel = Literal["off", "low", "high", "max"]


def think_value(level: ReasoningLevel) -> bool | str:
    """Map config reasoning level to Ollama /api/chat `think` parameter."""
    if level == "off":
        return False
    return level


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    redis_url: str = Field(default="redis://127.0.0.1:6379/0", alias="REDIS_URL")
    ollama_cloud_base_url: str = Field(default="https://ollama.com", alias="OLLAMA_CLOUD_BASE_URL")
    ollama_cloud_api_key: str = Field(default="", alias="OLLAMA_CLOUD_API_KEY")

    # Cid mapping (PR #321): low / mid / higher(opt-in only)
    model_light: str = Field(default="nemotron-3-nano", alias="MODEL_LIGHT")
    model_mid: str = Field(default="gpt-oss:20b", alias="MODEL_MID")
    model_heavy: str = Field(default="glm-5.3-flash", alias="MODEL_HEAVY")

    reasoning_light: ReasoningLevel = Field(default="off", alias="REASONING_LIGHT")
    reasoning_mid: ReasoningLevel = Field(default="off", alias="REASONING_MID")
    reasoning_heavy: ReasoningLevel = Field(default="low", alias="REASONING_HEAVY")

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

    def reasoning_for(self, tier: str) -> ReasoningLevel:
        mapping: dict[str, ReasoningLevel] = {
            "leicht": self.reasoning_light,
            "mittel": self.reasoning_mid,
            "schwer": self.reasoning_heavy,
        }
        return mapping.get(tier, self.reasoning_mid)

    def think_for(self, tier: str) -> bool | str:
        return think_value(self.reasoning_for(tier))

    def models_dict(self) -> dict[str, Any]:
        return {
            "leicht": {
                "model": self.model_light,
                "reasoning": self.reasoning_light,
                "think": think_value(self.reasoning_light),
            },
            "mittel": {
                "model": self.model_mid,
                "reasoning": self.reasoning_mid,
                "think": think_value(self.reasoning_mid),
            },
            "schwer": {
                "model": self.model_heavy,
                "reasoning": self.reasoning_heavy,
                "think": think_value(self.reasoning_heavy),
                "opt_in_only": True,
            },
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
