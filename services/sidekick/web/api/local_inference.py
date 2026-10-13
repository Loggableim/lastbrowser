"""Application-owned local model connection; independent of cloud credentials."""
import hashlib
import json
import os
import urllib.request
from pathlib import Path

BASE_URL = "http://127.0.0.1:11435/v1"


def is_owned_runtime(model, base_url, api_key):
    if base_url != BASE_URL:
        return False
    try:
        return connection(model)["api_key"] == api_key
    except (OSError, ValueError):
        return False


def connection(model_id=None):
    home = os.environ.get("LASTBROWSER_LOCAL_AI_HOME")
    catalog = os.environ.get("LASTBROWSER_LOCAL_AI_CATALOG")
    if not home or not catalog:
        raise ValueError("Start local AI from Lastbrowser Settings first.")
    models = json.loads(Path(catalog).read_text(encoding="utf-8"))
    if model_id and model_id not in {item["id"] for item in models if item.get('agentEvaluation') != 'failed'}:
        raise ValueError("Unknown local model.")
    key = (Path(home) / "runtime.key").read_text(encoding="utf-8").strip()
    if len(key) != 64 or any(c not in "0123456789abcdef" for c in key):
        raise ValueError("Invalid local runtime credential.")
    return {"provider": "custom", "requested_provider": "lastbrowser-local",
            "api_mode": "chat_completions", "base_url": BASE_URL,
            "api_key": key, "source": "lastbrowser-local"}


def space_configuration(workspace):
    home = os.environ.get("LASTBROWSER_LOCAL_AI_HOME")
    if not home or not workspace:
        return None
    filename = hashlib.sha256(str(workspace).encode("utf-8")).hexdigest() + ".json"
    try:
        config = json.loads((Path(home) / filename).read_text(encoding="utf-8"))
        if config.get("workspace") != workspace:
            return None
        connection(config.get("modelId"))
        return config
    except (OSError, ValueError, KeyError):
        return None


def fallback_for_space(workspace):
    config = space_configuration(workspace)
    if not config or not config.get("allowFallback") or not config.get("modelId"):
        return None
    runtime = connection(config["modelId"])
    request = urllib.request.Request(BASE_URL + "/models", headers={"Authorization": "Bearer " + runtime["api_key"]})
    try:
        # Never fall through to an external endpoint or an unauthenticated port collision.
        with urllib.request.urlopen(request, timeout=2) as response:
            models = json.load(response)
        if not any(item.get("id") == config["modelId"] for item in models.get("data", [])):
            return None
    except (OSError, ValueError):
        return None
    return {"model": config["modelId"], "provider": "custom", "base_url": BASE_URL,
            "api_key": runtime["api_key"], "safe_before_tools": True, "context_length": 8192}
