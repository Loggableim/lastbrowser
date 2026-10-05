from __future__ import annotations

import os
from pathlib import Path

from shared.paths import sidekick_home

VALID_REASONING_EFFORTS = ("minimal", "low", "medium", "high", "xhigh", "max")

_profile_fallback_warned = False


def get_sidekick_home() -> Path:
    return sidekick_home()


def get_default_sidekick_root() -> Path:
    native_sidekick = Path.home() / ".sidekick"

    env_home = os.environ.get("SIDEKICK_HOME", "").strip() or os.environ.get("LASTBROWSER_HOME", "").strip()
    if not env_home:
        return native_sidekick

    env_path = Path(env_home)
    try:
        env_path.resolve().relative_to(native_sidekick.resolve())
        return native_sidekick
    except ValueError:
        pass

    if env_path.parent.name == "profiles":
        return env_path.parent.parent
    return env_path


def get_sidekick_dir(new_subpath: str, old_name: str) -> Path:
    home = get_sidekick_home()
    old_path = home / old_name
    if old_path.exists():
        return old_path
    return home / new_subpath


def get_optional_skills_dir(default: Path | None = None) -> Path:
    override = os.getenv("SIDEKICK_OPTIONAL_SKILLS", "").strip()
    if override:
        return Path(override)
    if default is not None:
        return default
    return get_sidekick_home() / "optional-skills"


def display_sidekick_home() -> str:
    home = get_sidekick_home()
    try:
        relative = home.relative_to(Path.home()).as_posix()
        return "~/" + relative
    except ValueError:
        return str(home)


def get_subprocess_home() -> str | None:
    home = os.getenv("SIDEKICK_HOME")
    if not home:
        return None
    profile_home = Path(home) / "home"
    if profile_home.is_dir():
        return str(profile_home)
    return None


def get_config_path() -> Path:
    return get_sidekick_home() / "config.yaml"


def get_skills_dir() -> Path:
    return get_sidekick_home() / "skills"


def get_env_path() -> Path:
    return get_sidekick_home() / ".env"


def parse_reasoning_effort(effort: str) -> dict[str, object] | None:
    if not effort or not effort.strip():
        return None
    effort = effort.strip().lower()
    if effort == "none":
        return {"enabled": False}
    if effort in VALID_REASONING_EFFORTS:
        return {"enabled": True, "effort": effort}
    return None


def is_termux() -> bool:
    prefix = os.getenv("PREFIX", "")
    return bool(os.getenv("TERMUX_VERSION") or "com.termux/files/usr" in prefix)


_wsl_detected: bool | None = None


def is_wsl() -> bool:
    global _wsl_detected
    if _wsl_detected is not None:
        return _wsl_detected
    try:
        with open("/proc/version", "r", encoding="utf-8") as handle:
            _wsl_detected = "microsoft" in handle.read().lower()
    except Exception:
        _wsl_detected = False
    return _wsl_detected


_container_detected: bool | None = None


def is_container() -> bool:
    global _container_detected
    if _container_detected is not None:
        return _container_detected
    if os.path.exists("/.dockerenv") or os.path.exists("/run/.containerenv"):
        _container_detected = True
        return True
    try:
        with open("/proc/1/cgroup", "r", encoding="utf-8") as handle:
            text = handle.read().lower()
    except Exception:
        text = ""
    _container_detected = any(marker in text for marker in ("docker", "containerd", "kubepods", "podman"))
    return _container_detected


def apply_ipv4_preference() -> None:
    if os.getenv("SIDEKICK_PREFER_IPV4", "").strip().lower() in {"1", "true", "yes"}:
        os.environ.setdefault("RES_OPTIONS", "single-request-reopen")


def is_lastbrowser_integrated(root: Path | str | None = None) -> bool:
    """Return True if Sidekick is running as the integrated backend for Lastbrowser."""
    explicit = os.getenv("LASTBROWSER_INTEGRATED")
    if explicit is not None:
        return explicit.strip().lower() in {"1", "true", "yes"}

    for var in (
        "LASTBROWSER_HOME",
        "LASTBROWSER_WEBUI_AGENT_DIR",
        "LASTBROWSER_BRIDGE_TOKEN",
        "LASTBROWSER_SIDEKICK_DIR",
        "LASTBROWSER_WEBUI_PORT",
    ):
        if os.getenv(var):
            return True

    try:
        target = Path(root).resolve() if root is not None else Path(__file__).resolve()
        if ".test-tmp" in target.parts:
            return False
        candidates = [target, *target.parents]
        for parent in candidates:
            # Check for sidekick-source.json manifest (present in both repo and packaged build)
            manifest = parent / "sidekick-source.json"
            if manifest.exists():
                try:
                    import json
                    manifest_data = json.loads(manifest.read_text(encoding="utf-8"))
                    if manifest_data.get("mode") == "in-tree-monorepo" or manifest_data.get("source") == "in-tree":
                        return True
                except Exception:
                    return True
            # Packaged Electron app indicators
            if (parent / "app.asar").exists() or (parent / "Lastbrowser.exe").exists() or (parent / "resources" / "app.asar").exists():
                return True
            pkg_json = parent / "package.json"
            if pkg_json.exists():
                try:
                    import json
                    data = json.loads(pkg_json.read_text(encoding="utf-8"))
                    if data.get("name") in ("lastbrowser", "@lastbrowser/desktop"):
                        return True
                except Exception:
                    pass
            if (parent / "apps" / "desktop").is_dir() and (parent / "services" / "sidekick").is_dir():
                return True
    except Exception:
        pass

    return False
