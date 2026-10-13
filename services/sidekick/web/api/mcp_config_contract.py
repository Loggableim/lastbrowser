"""Validate MCP imports for the same configuration used by Nova."""
import copy
import math
from urllib.parse import urlparse


def normalize_mcp_config(body, existing, masked_placeholder):
    if not isinstance(body, dict):
        raise ValueError("MCP configuration must be an object")
    keys = [key for key in ("mcpServers", "servers", "mcp_servers") if key in body]
    if len(keys) > 1:
        raise ValueError("Use only one MCP servers field")
    servers = body[keys[0]] if keys else body
    if not isinstance(servers, dict):
        raise ValueError("MCP servers must be an object")

    def restore(value, original):
        if value == masked_placeholder:
            if not isinstance(original, str) or original == masked_placeholder:
                raise ValueError("Masked credential has no stored original")
            return original
        if isinstance(value, dict):
            return {key: restore(item, original.get(key) if isinstance(original, dict) else None) for key, item in value.items()}
        return copy.deepcopy(value)

    normalized = {}
    for name, raw in servers.items():
        if not isinstance(name, str) or not name.strip() or name != name.strip():
            raise ValueError("Server names must be non-empty and have no surrounding whitespace")
        if not isinstance(raw, dict):
            raise ValueError(f"Server '{name}' must be an object")
        cfg = restore(raw, existing.get(name, {}))
        command, url = cfg.get("command"), cfg.get("url")
        if bool(command) == bool(url):
            raise ValueError(f"Server '{name}' requires either command or url")
        if command:
            if not isinstance(command, str) or not command.strip():
                raise ValueError(f"Server '{name}': command must be a string")
            cfg["command"] = command.strip()
        if url:
            if not isinstance(url, str) or urlparse(url).scheme not in {"http", "https"} or not urlparse(url).hostname:
                raise ValueError(f"Server '{name}': url must use HTTP or HTTPS")
            cfg["url"] = url.strip()
        if "args" in cfg and (not isinstance(cfg["args"], list) or any(not isinstance(arg, str) for arg in cfg["args"])):
            raise ValueError(f"Server '{name}': args must be an array of strings")
        for key in ("env", "headers"):
            if key in cfg and (not isinstance(cfg[key], dict) or any(not isinstance(value, str) for value in cfg[key].values())):
                raise ValueError(f"Server '{name}': {key} must be an object of strings")
        for key in ("timeout", "connect_timeout"):
            if key in cfg and (isinstance(cfg[key], bool) or not isinstance(cfg[key], (int, float)) or not math.isfinite(cfg[key]) or cfg[key] <= 0):
                raise ValueError(f"Server '{name}': {key} must be positive")
        if "disabled" in cfg:
            if not isinstance(cfg["disabled"], bool):
                raise ValueError(f"Server '{name}': disabled must be boolean")
            cfg.setdefault("enabled", not cfg.pop("disabled"))
        if "enabled" in cfg and not isinstance(cfg["enabled"], bool):
            raise ValueError(f"Server '{name}': enabled must be boolean")
        normalized[name] = cfg
    return normalized
