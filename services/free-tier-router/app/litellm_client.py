"""
Ollama Cloud backend client (M1 stub).

No live API calls in default/test mode. API key only from env OLLAMA_CLOUD_API_KEY.
Daily budget gate reads DAILY_BUDGET_EUR (Cid sets amount); M1 tracks spend in-memory only.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from app.config import Settings, get_settings


@dataclass
class BudgetState:
    day_key: str = ""
    spent_eur: float = 0.0


@dataclass
class LiteLLMClient:
    settings: Settings = field(default_factory=get_settings)
    dry_run: bool = True
    _budget: BudgetState = field(default_factory=BudgetState)

    def _today(self) -> str:
        return time.strftime("%Y-%m-%d", time.gmtime())

    def budget_remaining(self) -> float | None:
        limit = float(self.settings.daily_budget_eur)
        if limit <= 0:
            return None  # unset / unlimited placeholder
        if self._budget.day_key != self._today():
            self._budget = BudgetState(day_key=self._today(), spent_eur=0.0)
        return max(limit - self._budget.spent_eur, 0.0)

    def budget_ok(self) -> bool:
        rem = self.budget_remaining()
        return rem is None or rem > 0

    def record_spend(self, amount_eur: float) -> None:
        if self._budget.day_key != self._today():
            self._budget = BudgetState(day_key=self._today(), spent_eur=0.0)
        self._budget.spent_eur += amount_eur

    async def complete(self, *, model: str, prompt: str, tier: str) -> dict[str, Any]:
        if not self.budget_ok():
            return {
                "ok": False,
                "error": "daily_budget_exceeded",
                "daily_budget_eur": self.settings.daily_budget_eur,
            }

        # M1: never call paid APIs from tests/default. Stub response only.
        if self.dry_run or not self.settings.ollama_cloud_api_key:
            return {
                "ok": True,
                "stub": True,
                "backend": "ollama_cloud",
                "model": model,
                "tier": tier,
                "base_url": self.settings.ollama_cloud_base_url,
                "content": f"[stub] routed to {model} ({tier})",
                "prompt_chars": len(prompt),
                "api_key_configured": bool(self.settings.ollama_cloud_api_key),
            }

        # Live path reserved for later milestones; still no key logging.
        import httpx

        headers = {"Authorization": f"Bearer {self.settings.ollama_cloud_api_key}"}
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
        }
        url = self.settings.ollama_cloud_base_url.rstrip("/") + "/api/chat"
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        return {"ok": True, "stub": False, "backend": "ollama_cloud", "model": model, "raw": data}
