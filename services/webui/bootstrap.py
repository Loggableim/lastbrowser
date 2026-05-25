#!/usr/bin/env python3
"""Portable launcher for Hermes Web UI.

This module is the documented entry point used by `start.sh`, `ctl.sh`, and
the Windows wrappers. It keeps bootstrap responsibilities small:
environment loading, Python/agent discovery, health waiting, and process
launching.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen

REPO_ROOT = Path(__file__).resolve().parent
DEFAULT_STATE_DIR = Path(os.getenv("HERMES_WEBUI_STATE_DIR", str(Path.home() / ".hermes" / "webui"))).expanduser()


def _load_repo_dotenv() -> None:
    env_path = REPO_ROOT / ".env"
    if not env_path.exists():
        return
    try:
        for raw in env_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            if line.startswith("export "):
                line = line[len("export ") :]
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ[key] = value
    except Exception as exc:
        print(f"[bootstrap] warning: could not load .env: {exc}", file=sys.stderr, flush=True)


_load_repo_dotenv()
DEFAULT_HOST = os.getenv("HERMES_WEBUI_HOST", "127.0.0.1")
DEFAULT_PORT = int(os.getenv("HERMES_WEBUI_PORT", "8787"))


def _detect_supervisor() -> str | None:
    explicit = os.getenv("HERMES_WEBUI_FOREGROUND", "").strip().lower()
    if explicit in ("1", "true", "yes", "on"):
        return "HERMES_WEBUI_FOREGROUND"
    for name in ("INVOCATION_ID", "JOURNAL_STREAM", "NOTIFY_SOCKET", "XPC_SERVICE_NAME", "SUPERVISOR_ENABLED"):
        value = os.getenv(name, "").strip()
        if not value:
            continue
        if name == "XPC_SERVICE_NAME" and (value == "0" or value.startswith("application.")):
            continue
        return name
    return None


def discover_agent_dir() -> Path | None:
    candidates: list[Path] = []
    if os.getenv("HERMES_WEBUI_AGENT_DIR"):
        candidates.append(Path(os.getenv("HERMES_WEBUI_AGENT_DIR")).expanduser())
    hermes_home = Path(os.getenv("HERMES_HOME", str(Path.home() / ".hermes"))).expanduser()
    candidates.extend([
        hermes_home / "hermes-agent",
        REPO_ROOT.parent / "hermes-agent",
        Path.home() / ".hermes" / "hermes-agent",
        Path.home() / "hermes-agent",
    ])
    for candidate in candidates:
        if candidate.exists() and (candidate / "run_agent.py").exists():
            return candidate.resolve()
    return None


def discover_launcher_python(agent_dir: Path | None) -> str:
    if os.getenv("HERMES_WEBUI_PYTHON"):
        return os.getenv("HERMES_WEBUI_PYTHON")
    if agent_dir:
        for rel in [
            ("venv", "Scripts", "python.exe"),
            ("venv", "bin", "python"),
            (".venv", "Scripts", "python.exe"),
            (".venv", "bin", "python"),
        ]:
            p = agent_dir.joinpath(*rel)
            if p.exists():
                return str(p)
    local_venv_candidates = [
        REPO_ROOT / ".venv" / "Scripts" / "python.exe",
        REPO_ROOT / ".venv" / "bin" / "python",
    ]
    for p in local_venv_candidates:
        if p.exists():
            return str(p)
    return shutil.which("python3") or shutil.which("python") or sys.executable


def _python_can_run_webui_and_agent(python_exe: str, agent_dir: Path | None = None) -> bool:
    try:
        env = os.environ.copy()
        if agent_dir:
            env["HERMES_WEBUI_AGENT_DIR"] = str(agent_dir)
        code = "import yaml\nimport importlib; importlib.import_module('run_agent')\n"
        result = subprocess.run([python_exe, "-c", code], env=env, capture_output=True, text=True, timeout=15)
        return result.returncode == 0
    except Exception:
        return False


def ensure_python_has_webui_deps(python_exe: str, agent_dir: Path | None) -> str:
    if _python_can_run_webui_and_agent(python_exe, agent_dir):
        return python_exe
    if agent_dir:
        candidate = discover_launcher_python(agent_dir)
        if candidate != python_exe and _python_can_run_webui_and_agent(candidate, agent_dir):
            return candidate
    raise RuntimeError("Python environment cannot import both WebUI dependencies and Hermes Agent")


def hermes_command_exists() -> bool:
    return shutil.which("hermes") is not None


def ensure_supported_platform() -> None:
    return None


def wait_for_health(url: str, timeout: int = 30) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("health URL must start with http:// or https://")
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False


def open_browser(url: str) -> None:
    import webbrowser
    webbrowser.open(url)


def _build_server_argv(host: str, port: int, foreground: bool, extra: list[str]) -> list[str]:
    argv = [sys.executable, str(REPO_ROOT / "server.py")]
    os.environ["HERMES_WEBUI_HOST"] = host
    os.environ["HERMES_WEBUI_PORT"] = str(port)
    os.environ.setdefault("HERMES_WEBUI_STATE_DIR", str(DEFAULT_STATE_DIR))
    if extra:
        os.environ["HERMES_WEBUI_EXTRA_ARGS"] = " ".join(extra)
    return argv


def parse_args(argv: list[str] | None = None):
    p = argparse.ArgumentParser()
    p.add_argument("--foreground", action="store_true", help="Run under launchd/systemd/supervisord without a parent bootstrap process.")
    p.add_argument("--no-browser", action="store_true", help="Do not open the browser automatically.")
    p.add_argument("--host", default=DEFAULT_HOST)
    p.add_argument("port", nargs="?", type=int, default=DEFAULT_PORT)
    args, _extra = p.parse_known_args(argv)
    return args


def main() -> int:
    ensure_supported_platform()
    args = parse_args()
    agent_dir = discover_agent_dir()
    python_exe = discover_launcher_python(agent_dir)
    os.environ["HERMES_WEBUI_HOST"] = args.host
    os.environ["HERMES_WEBUI_PORT"] = str(args.port)
    if agent_dir:
        os.environ["HERMES_WEBUI_AGENT_DIR"] = str(agent_dir)
    server_argv = _build_server_argv(args.host, args.port, args.foreground, [])
    if args.foreground or _detect_supervisor():
        if Path(python_exe).exists():
            if not str(python_exe).lower().endswith((".exe", ".bat", ".cmd", ".com")):
                raise RuntimeError(f"python executable not executable: {python_exe}")
        if agent_dir:
            os.chdir(str(agent_dir))
        os.execv(python_exe, [python_exe, *server_argv[1:]])
        return 0
    subprocess.Popen([python_exe, *server_argv[1:]], cwd=str(agent_dir or REPO_ROOT))
    wait_for_health(f"http://{args.host}:{args.port}/health")
    if not args.no_browser:
        open_browser(f"http://{args.host}:{args.port}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
