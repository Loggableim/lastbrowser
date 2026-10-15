#!/usr/bin/env python3
"""OpenCode Go fixed-model TTFT (cold/warm). Fast mode stops after first_text.

When LastBrowser Electron owns Sidekick (8789), prefer ELECTRON_MANAGED_RESTART=1:
SIGTERM the sidekick child only and wait for the shell to respawn + rebind (73de30bc+).
Do not spawn a second uvicorn (avoids scope_mismatch / stale bridge).

Usage:
  ELECTRON_MANAGED_RESTART=1 OUTPUT_JSON=/tmp/ttft.json python3 scripts/probe-opencode-ttft-cold-warm.py
"""
from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any

BASE = os.environ.get("LASTBROWSER_WEBUI_URL", "http://127.0.0.1:8789")
LOG_PATH = Path(
    os.environ.get("AGENT_LOG", "/home/ubuntu/.config/@lastbrowser/desktop/runtime/logs/agent.log")
)
SCOPE = json.loads(
    os.environ.get(
        "TTFT_SCOPE_JSON",
        '{"spaceId":"bbf1b3876e0644d1bb10c1a994f23720","backendProfileId":"55b19501ad004efabbe1317b15e0640c","browserProfileId":"default"}',
    )
)
MODEL = os.environ.get("OPENCODE_MODEL", "glm-5.3-flash")
PROVIDER = "opencode-go"
PROMPT = os.environ.get("LATENCY_PROMPT", "Reply with exactly: LATENCY-OK")
RUNS = int(os.environ.get("LATENCY_RUNS", "5"))
FAST = os.environ.get("FAST_TTFT", "1") != "0"
ELECTRON_RESTART = os.environ.get("ELECTRON_MANAGED_RESTART", "1") != "0"
SIDEKICK_DIR = Path(os.environ.get("SIDEKICK_AGENT_DIR", "/workspace/services/sidekick"))
PYTHON = Path(os.environ.get("LASTBROWSER_WEBUI_PYTHON", "/workspace/apps/desktop/runtime/python/python3"))
PHASE_RE = re.compile(
    r"native_chat_phase stream=(\S+) stage=(first_text|broker_ready) elapsed_ms=([\d.]+)"
)


def sidekick_pid() -> str:
    port = urllib.parse.urlparse(BASE).port or 8789
    return subprocess.check_output(["pgrep", "-f", f"port {port}"], text=True).strip().split()[0]


def read_sidekick_env() -> dict[str, str]:
    pid = sidekick_pid()
    env: dict[str, str] = {}
    for raw in Path(f"/proc/{pid}/environ").read_bytes().split(b"\0"):
        if b"=" in raw:
            k, v = raw.split(b"=", 1)
            env[k.decode()] = v.decode()
    return env


def wait_http(timeout_s: float = 90.0) -> None:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(BASE + "/", timeout=5) as r:
                if r.status == 200:
                    return
        except OSError:
            time.sleep(0.4)
    raise TimeoutError(f"Sidekick at {BASE} not ready")


def restart_sidekick() -> None:
    before = sidekick_pid()
    os.kill(int(before), signal.SIGTERM)
    time.sleep(1.0)
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        try:
            after = sidekick_pid()
            if after != before:
                break
        except subprocess.CalledProcessError:
            pass
        time.sleep(0.4)
    if not ELECTRON_RESTART:
        env = read_sidekick_env()
        port = str(urllib.parse.urlparse(BASE).port or 8789)
        launch_env = os.environ.copy()
        launch_env.update(env)
        launch_env["PYTHONPATH"] = str(SIDEKICK_DIR)
        subprocess.Popen(
            [str(PYTHON), "-m", "uvicorn", "cli.web_server:app", "--host", "127.0.0.1", "--port", port],
            cwd=str(SIDEKICK_DIR),
            env=launch_env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    wait_http(120)
    time.sleep(2.5)


def auth() -> tuple[str, str]:
    html = urllib.request.urlopen(BASE + "/", timeout=30).read(800_000).decode("utf-8", "replace")
    token = re.search(r'__SIDEKICK_SESSION_TOKEN__="([^"]+)"', html)
    if not token:
        raise RuntimeError("Missing session token")
    env = read_sidekick_env()
    bridge = env.get("LASTBROWSER_BRIDGE_TOKEN") or env.get("SIDEKICK_BRIDGE_TOKEN")
    if not bridge:
        raise RuntimeError("Missing bridge token")
    return token.group(1), bridge


def headers(token: str, bridge: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-Lastbrowser-Bridge-Token": bridge,
    }


def parse_phases(stream_id: str) -> dict[str, float]:
    out: dict[str, float] = {}
    if not LOG_PATH.is_file():
        return out
    for line in LOG_PATH.read_text(encoding="utf-8", errors="replace").splitlines()[-8000:]:
        m = PHASE_RE.search(line)
        if m and m.group(1) == stream_id:
            out[m.group(2)] = float(m.group(3))
    return out


def wait_first_text(stream_id: str, timeout_s: float = 120.0) -> dict[str, float]:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        phases = parse_phases(stream_id)
        if "first_text" in phases:
            return phases
        time.sleep(0.2)
    return parse_phases(stream_id)


def cancel_stream(token: str, bridge: str, stream_id: str, quick_id: str | None) -> None:
    if quick_id:
        body = {"quick_chat_id": quick_id, "stream_id": stream_id, "space_scope": SCOPE, "profile": "default"}
        path = "/api/quickchat/cancel"
    else:
        body = None
        path = f"/api/chat/cancel?stream_id={urllib.parse.quote(stream_id)}"
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body else None,
        headers=headers(token, bridge),
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=20).read()
    except Exception:
        pass


def start_quickchat(token: str, bridge: str, quick_id: str, prompt: str) -> dict[str, Any]:
    body = {
        "quick_chat_id": quick_id,
        "space_scope": SCOPE,
        "profile": "default",
        "prompt": prompt,
        "model": MODEL,
        "model_provider": PROVIDER,
    }
    req = urllib.request.Request(
        BASE + "/api/quickchat/start",
        data=json.dumps(body).encode(),
        headers=headers(token, bridge),
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return {"ok": True, **json.loads(r.read())}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        code = None
        try:
            code = json.loads(raw).get("error_code")
        except json.JSONDecodeError:
            pass
        return {"ok": False, "http_status": e.code, "error_code": code, "body": raw[:400]}


def start_standard(token: str, bridge: str, session_id: str, prompt: str) -> dict[str, Any]:
    body = {
        "session_id": session_id,
        "message": prompt,
        "workspace": "/home/ubuntu/workspace",
        "model": MODEL,
        "model_provider": PROVIDER,
        "profile": "default",
        "space_scope": SCOPE,
        "chat_mode": "chat",
    }
    req = urllib.request.Request(
        BASE + "/api/chat/start",
        data=json.dumps(body).encode(),
        headers=headers(token, bridge),
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return {"ok": True, **json.loads(r.read())}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        code = None
        try:
            code = json.loads(raw).get("error_code")
        except json.JSONDecodeError:
            pass
        return {"ok": False, "http_status": e.code, "error_code": code, "body": raw[:400]}


def new_session(token: str, bridge: str) -> str:
    body = {"profile": "default", "model": MODEL, "model_provider": PROVIDER, "space_scope": SCOPE}
    req = urllib.request.Request(
        BASE + "/api/session/new",
        data=json.dumps(body).encode(),
        headers=headers(token, bridge),
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        payload = json.loads(r.read())
    sess = payload.get("session") or payload
    return sess["session_id"]


def row_meta(turn: dict[str, Any]) -> dict[str, Any]:
    ttft = turn.get("ttft_ms")
    broker = turn.get("broker_ready_ms")
    broker_to_first = None
    if ttft is not None and broker is not None:
        broker_to_first = round(ttft - broker, 2)
    return {
        "http_status": turn.get("http_status"),
        "error_code": turn.get("error_code"),
        "broker_to_first_ms": broker_to_first,
        "outlier_over_12s": bool(ttft is not None and ttft > 12_000),
        "is_409": turn.get("http_status") == 409,
    }


def measure_turn(
    token: str,
    bridge: str,
    start: dict[str, Any],
    *,
    quick_id: str | None,
) -> dict[str, Any]:
    if not start.get("ok"):
        return {
            "stream_id": None,
            "ttft_ms": None,
            "broker_ready_ms": None,
            **start,
        }
    stream_id = start["stream_id"]
    if FAST:
        phases = wait_first_text(stream_id)
        cancel_stream(token, bridge, stream_id, quick_id)
    else:
        phases = wait_first_text(stream_id, timeout_s=420)
    return {
        "stream_id": stream_id,
        "ttft_ms": phases.get("first_text"),
        "broker_ready_ms": phases.get("broker_ready"),
    }


def main() -> None:
    rows: list[dict[str, Any]] = []
    for run in range(1, RUNS + 1):
        restart_sidekick()
        token, bridge = auth()
        quick_id = uuid.uuid4().hex
        cold = measure_turn(token, bridge, start_quickchat(token, bridge, quick_id, PROMPT), quick_id=quick_id)
        rows.append({"surface": "Quickchat", "temperature": "cold", "run": run, "model": MODEL, "catalog_from_cache": False, **cold, **row_meta(cold)})
        warm = measure_turn(
            token,
            bridge,
            start_quickchat(token, bridge, quick_id, PROMPT + " (warm)"),
            quick_id=quick_id,
        )
        rows.append(
            {
                "surface": "Quickchat",
                "temperature": "warm",
                "run": run,
                "model": MODEL,
                "catalog_from_cache": True,
                **warm,
                **row_meta(warm),
            }
        )

        restart_sidekick()
        token, bridge = auth()
        session_id = new_session(token, bridge)
        cold_s = measure_turn(
            token, bridge, start_standard(token, bridge, session_id, PROMPT), quick_id=None
        )
        rows.append(
            {
                "surface": "Standard chat",
                "temperature": "cold",
                "run": run,
                "model": MODEL,
                "catalog_from_cache": False,
                **cold_s,
                **row_meta(cold_s),
            }
        )
        warm_s = measure_turn(
            token,
            bridge,
            start_standard(token, bridge, session_id, PROMPT + " (warm)"),
            quick_id=None,
        )
        rows.append(
            {
                "surface": "Standard chat",
                "temperature": "warm",
                "run": run,
                "model": MODEL,
                "catalog_from_cache": True,
                **warm_s,
                **row_meta(warm_s),
            }
        )
        print(f"run {run}/{RUNS} done", flush=True)

    def summarize(surface: str, temp: str) -> dict[str, Any]:
        import statistics

        sub = [r for r in rows if r["surface"] == surface and r["temperature"] == temp]
        ttfts = [r["ttft_ms"] for r in sub if r.get("ttft_ms") is not None]
        b2f = [r["broker_to_first_ms"] for r in sub if r.get("broker_to_first_ms") is not None]
        return {
            "n": len(ttfts),
            "409_count": sum(1 for r in sub if r.get("is_409")),
            "outlier_over_12s": sum(1 for r in sub if r.get("outlier_over_12s")),
            "median_ttft_ms": statistics.median(ttfts) if ttfts else None,
            "median_broker_to_first_ms": statistics.median(b2f) if b2f else None,
        }

    summaries = {
        "Quickchat_cold": summarize("Quickchat", "cold"),
        "Quickchat_warm": summarize("Quickchat", "warm"),
        "Standard_cold": summarize("Standard chat", "cold"),
        "Standard_warm": summarize("Standard chat", "warm"),
        "reference_note": "Quickchat medians are the reference; Standard minus Quickchat ≈ extra standard-chat path cost.",
    }
    qc = summaries["Quickchat_cold"].get("median_ttft_ms")
    sc = summaries["Standard_cold"].get("median_ttft_ms")
    if qc is not None and sc is not None:
        summaries["standard_minus_quickchat_cold_median_ms"] = round(sc - qc, 2)

    out = {
        "meta": {
            "git_commit": os.environ.get("TTFT_GIT_COMMIT", "73de30bc"),
            "auto_router": "off",
            "ttft_metric": "native_chat_phase stage=first_text elapsed_ms",
            "fast_ttft": FAST,
            "electron_managed_restart": ELECTRON_RESTART,
        },
        "summaries": summaries,
        "rows": rows,
    }
    path = Path(os.environ.get("OUTPUT_JSON", "/tmp/opencode-ttft-cold-warm.json"))
    path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
