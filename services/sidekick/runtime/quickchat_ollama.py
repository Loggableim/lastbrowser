"""Verify a profile's explicitly configured local Ollama model for text Quickchat."""
from dataclasses import dataclass, field
import json
from pathlib import Path
from urllib.parse import urlsplit

from runtime.independent.policy import PolicyDenied

MAX_QUICKCHAT_OLLAMA_CONTEXT = 2048
_MAX_SHOW_BYTES = 1024 * 1024


def configured_local_ollama_endpoint(config, provider):
    model = config.get("model") if isinstance(config, dict) else None
    if provider not in {"ollama", "custom"} or not isinstance(model, dict) or model.get("provider") != "ollama":
        return None
    endpoint = str(model.get("base_url") or "").strip().rstrip("/")
    try:
        url = urlsplit(endpoint)
        if (url.scheme not in {"http", "https"} or url.hostname not in {"127.0.0.1", "::1", "localhost"}
                or url.username is not None or url.password is not None or url.query or url.fragment
                or url.port == 0):
            return None
    except ValueError:
        return None
    return endpoint if url.path.endswith("/v1") else endpoint + "/v1"


def _profile_config(home: Path):
    import yaml

    path = home / "config.yaml"
    if not path.is_file():
        return {}
    if not path.resolve().is_relative_to(home.resolve()) or path.stat().st_size > 8 * 1024 * 1024:
        raise PolicyDenied("quickchat_ollama_configuration_invalid")
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def profile_local_ollama_endpoint(home, provider):
    return configured_local_ollama_endpoint(_profile_config(Path(home)), provider)


def local_ollama_key(config):
    providers = config.get("providers") or {}
    local = providers.get("ollama") if isinstance(providers, dict) else None
    return str(local.get("api_key") or "").strip() if isinstance(local, dict) else ""


def is_listed_local_ollama_model(catalog, provider, model):
    if model.lower().endswith(("-cloud", ":cloud")):
        return False
    if not any(group.get("provider_id") == provider and group.get("quickchatLocalOllama") is True
               for group in catalog.get("groups", [])):
        return False
    return any(row.get("providerId") == provider and row.get("source") == "provider_api"
               and (model in row.get("modelIds", []) or f"@{provider}:{model}" in row.get("modelIds", []))
               for row in catalog.get("providerModelCatalog", {}).get("providers", []))


@dataclass(frozen=True)
class QuickchatOllama:
    base_url: str
    api_key: str = field(repr=False)
    context_tokens: int

    @property
    def max_output_tokens(self):
        return self.context_tokens // 4


def resolve_quickchat_ollama(home, provider, model):
    """Confirm an exact, text-capable, non-hosted model before sending user data."""
    import httpx

    config = _profile_config(Path(home))
    base_url = configured_local_ollama_endpoint(config, provider)
    if base_url is None:
        raise PolicyDenied("quickchat_ollama_endpoint_changed")
    if model.lower().endswith(("-cloud", ":cloud")):
        raise PolicyDenied("quickchat_ollama_model_not_local")
    key = local_ollama_key(config)
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    try:
        with httpx.Client(timeout=3, follow_redirects=False, trust_env=False, headers=headers) as client:
            with client.stream("POST", base_url[:-3] + "/api/show", json={"model": model}) as response:
                response.raise_for_status()
                raw = bytearray()
                for chunk in response.iter_bytes():
                    raw.extend(chunk)
                    if len(raw) > _MAX_SHOW_BYTES:
                        raise ValueError("Ollama metadata exceeds its size limit")
        metadata = json.loads(raw)
    except (httpx.HTTPError, ValueError) as exc:
        raise PolicyDenied("quickchat_ollama_metadata_unavailable") from exc
    if not isinstance(metadata, dict) or metadata.get("remote_host") or metadata.get("remote_model"):
        raise PolicyDenied("quickchat_ollama_model_not_local")
    capabilities = metadata.get("capabilities")
    if isinstance(capabilities, list) and "completion" not in capabilities:
        raise PolicyDenied("quickchat_ollama_text_unavailable")
    info = metadata.get("model_info")
    architecture = info.get("general.architecture") if isinstance(info, dict) else None
    length = info.get(f"{architecture}.context_length") if isinstance(architecture, str) else None
    if type(length) is not int or length < 1024:
        raise PolicyDenied("quickchat_ollama_context_unavailable")
    for line in str(metadata.get("parameters") or "").splitlines():
        setting = line.split()
        if len(setting) == 2 and setting[0] == "num_ctx" and setting[1].isdigit():
            length = min(length, int(setting[1]))
    if length < 1024:
        raise PolicyDenied("quickchat_ollama_context_unavailable")
    return QuickchatOllama(base_url, key, min(MAX_QUICKCHAT_OLLAMA_CONTEXT, length))
