"""Non-secret model hosting metadata. Never expose configured endpoint URLs."""
from ipaddress import ip_address
from urllib.parse import urlsplit


def provider_deployment(provider_id, configuration=None, *, active_provider=None):
    pid = str(provider_id or "").strip().lower().replace("_", "-").replace(" ", "-")
    if pid == "ollama-cloud":
        return "cloud"
    if pid == 'local-store':
        return 'local'  # Only the Parent-owned loopback engine implements this provider.
    config = configuration if isinstance(configuration, dict) else {}
    model = config.get("model") if isinstance(config.get("model"), dict) else {}
    active = str(active_provider or model.get("provider") or config.get("provider") or "").lower().replace("_", "-")
    endpoint = model.get("base_url") if active == pid else None
    providers = config.get("providers") if isinstance(config.get("providers"), dict) else {}
    for key, value in providers.items():
        if str(key).lower().replace("_", "-") == pid and isinstance(value, dict):
            endpoint = endpoint or value.get("base_url")
    if pid.startswith("custom:"):
        from web.api.providers import _custom_provider_slug_from_name
        for row in config.get("custom_providers", []) if isinstance(config.get("custom_providers"), list) else []:
            if isinstance(row, dict) and _custom_provider_slug_from_name(str(row.get("name") or "")) == pid:
                endpoint = endpoint or row.get("base_url")
    if endpoint:
        try:
            parsed = urlsplit(str(endpoint))
            host = (parsed.hostname or "").lower().rstrip(".")
            if parsed.scheme not in {"http", "https"} or not host:
                return "unknown"
            try:
                loopback = ip_address(host).is_loopback
            except ValueError:
                loopback = host == "localhost"
            if loopback:
                return "local"
            if host in {"ollama.com", "www.ollama.com"}:
                return "cloud"
            return "remote"
        except (ValueError, TypeError):
            return "unknown"
    # Only providers whose runtime has an actual loopback default get this label.
    if pid in {"ollama", "lmstudio", "lm-studio"}:
        return "local"
    if pid in {"custom", "localai", "local-ai"} or pid.startswith("custom:"):
        return "unknown"
    return "cloud"
