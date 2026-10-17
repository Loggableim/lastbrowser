import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("REDIS_URL", "memory://")
os.environ.setdefault("OLLAMA_CLOUD_API_KEY", "")
os.environ.setdefault("DAILY_BUDGET_EUR", "10")
os.environ.setdefault("MODEL_LIGHT", "nemotron-3-nano")
os.environ.setdefault("MODEL_MID", "gpt-oss:20b")
os.environ.setdefault("MODEL_HEAVY", "glm-5.3-flash")
os.environ.setdefault("REASONING_LIGHT", "off")
os.environ.setdefault("REASONING_MID", "off")
os.environ.setdefault("REASONING_HEAVY", "low")


@pytest.fixture()
def client():
    from app.config import get_settings
    from app.main import app

    get_settings.cache_clear()
    with TestClient(app) as c:
        yield c
    get_settings.cache_clear()
