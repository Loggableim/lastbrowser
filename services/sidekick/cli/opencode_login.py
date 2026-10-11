"""Profile-isolated launcher for the official OpenCode auth CLI."""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import threading
import uuid
from pathlib import Path
from typing import Any

from cli.config import get_sidekick_home

logger = logging.getLogger(__name__)

_CLI_PROVIDER_IDS = {"opencode-zen": "opencode", "opencode-go": "opencode-go"}
_LOGINS: dict[str, dict[str, Any]] = {}
_LOGINS_LOCK = threading.Lock()


def _profile_auth_path() -> Path:
    return get_sidekick_home() / "opencode-data" / "opencode" / "auth.json"


def _has_profile_credentials(provider_id: str) -> bool:
    cli_provider = _CLI_PROVIDER_IDS.get(provider_id)
    if not cli_provider:
        return False
    try:
        payload = json.loads(_profile_auth_path().read_text(encoding="utf-8"))
        entry = payload.get(cli_provider) if isinstance(payload, dict) else None
        return bool(
            isinstance(entry, dict)
            and entry.get("type") == "api"
            and isinstance(entry.get("key"), str)
            and len(entry["key"].strip()) >= 4
        )
    except (OSError, ValueError, TypeError):
        return False


def start_login(provider_id: str) -> dict[str, Any]:
    """Open `opencode auth login` in a separate console with profile XDG data."""
    provider_id = str(provider_id or "").strip().lower()
    cli_provider = _CLI_PROVIDER_IDS.get(provider_id)
    if not cli_provider:
        return {"ok": False, "error_code": "unsupported_provider"}
    if os.name != "nt":
        return {"ok": False, "error_code": "unsupported_platform"}

    executable = shutil.which("opencode")
    if not executable:
        return {"ok": False, "error_code": "opencode_cli_not_found"}

    profile_home = get_sidekick_home().resolve()
    data_home = profile_home / "opencode-data"
    try:
        data_home.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(data_home, 0o700)
        except OSError:
            pass
        env = os.environ.copy()
        for variable in tuple(env):
            if variable.startswith("OPENCODE_"):
                env.pop(variable, None)
        env["XDG_DATA_HOME"] = str(data_home)
        args = [executable, "auth", "login", "--provider", cli_provider]
        if executable.lower().endswith((".cmd", ".bat")):
            command = subprocess.list2cmdline(args)
            args = [os.environ.get("COMSPEC", "cmd.exe"), "/d", "/s", "/c", f'"{command}"']
        process = subprocess.Popen(
            args,
            cwd=str(data_home),
            env=env,
            creationflags=subprocess.CREATE_NEW_CONSOLE,
            close_fds=True,
        )
    except Exception:
        logger.warning("Could not start OpenCode CLI login for %s", provider_id, exc_info=True)
        return {"ok": False, "error_code": "opencode_cli_start_failed"}

    login_id = uuid.uuid4().hex
    with _LOGINS_LOCK:
        _LOGINS[login_id] = {
            "provider": provider_id,
            "profile_home": str(profile_home),
            "process": process,
            "exit_code": None,
        }

    def watch_process() -> None:
        try:
            exit_code = process.wait()
        except Exception:
            exit_code = -1
        with _LOGINS_LOCK:
            login = _LOGINS.get(login_id)
            if login is not None:
                login["exit_code"] = exit_code

    threading.Thread(target=watch_process, name="opencode-auth-login", daemon=True).start()
    return {"ok": True, "login_id": login_id, "provider": provider_id, "status": "running"}


def login_status(login_id: str) -> dict[str, Any]:
    with _LOGINS_LOCK:
        login = _LOGINS.get(str(login_id or ""))
        if not login or login.get("profile_home") != str(get_sidekick_home().resolve()):
            return {"ok": False, "error_code": "login_not_found"}
        process = login["process"]
        exit_code = login.get("exit_code")
        provider_id = login["provider"]

    configured = _has_profile_credentials(provider_id)
    if configured:
        status = "connected"
    elif exit_code is None and process.poll() is None:
        status = "running"
    elif exit_code in (130, -1073741510):
        status = "cancelled"
    else:
        status = "failed"
    return {"ok": True, "provider": provider_id, "configured": configured, "status": status}


def cancel_login(login_id: str) -> dict[str, Any]:
    with _LOGINS_LOCK:
        login = _LOGINS.get(str(login_id or ""))
        if not login or login.get("profile_home") != str(get_sidekick_home().resolve()):
            return {"ok": False, "error_code": "login_not_found"}
        process = login["process"]
        if login.get("exit_code") is not None or process.poll() is not None:
            return {"ok": True, "status": "finished"}
        pid = process.pid

    try:
        result = subprocess.run(
            ["taskkill.exe", "/PID", str(pid), "/T", "/F"],
            capture_output=True,
            timeout=5,
            check=False,
        )
    except Exception:
        logger.warning("Could not cancel OpenCode CLI login process", exc_info=True)
        return {"ok": False, "error_code": "cancel_failed", "status": "running"}

    if result.returncode != 0:
        exit_code = process.poll()
        if exit_code is None:
            return {
                "ok": False,
                "error_code": "cancel_failed",
                "status": "running",
                "taskkill_exit_code": result.returncode,
            }
        return {
            "ok": False,
            "error_code": "cancel_failed",
            "status": "finished",
            "process_exit_code": exit_code,
            "taskkill_exit_code": result.returncode,
        }
    return {"ok": True, "status": "cancelled"}
