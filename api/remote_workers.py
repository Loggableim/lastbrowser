# SENTINEL-20260512-1431 -- delete me after confirming live reload works
raise RuntimeError("REMOTE_WORKERS_MODULE_LOADED_AT: 14:35")

"""Remote Worker Bridge API for Hermes WebUI.

Provides REST endpoints that proxy kanban board data from remote
worker servers (EPYC, DediRock) via SSH, integrating them into
the existing kanban panel in the WebUI.

Endpoints:
  GET  /api/workers/status    - Aggregate dashboard stats from all workers
  GET  /api/workers/board     - Full board payload from a remote server
  POST /api/workers/task      - Create a task on a remote board
"""

from __future__ import annotations

import json
import logging
import subprocess
import time
from urllib.parse import parse_qs

from api.helpers import bad, j

logger = logging.getLogger(__name__)

# ── Remote server registry ──────────────────────────────────────────────────
# (host, user, board_slug, display_name, max_runtime, description)
REMOTE_SERVERS = [
    {
        "id": "epyc",
        "host": "87.239.129.187",
        "user": "root",
        "board": "epyc-main",
        "name": "EPYC (epyc-main)",
        "description": "Novacloud EPYC — 4C/23GB, Dispatcher alle 3 Min, max-runtime: 600s",
        "max_runtime": 600,
        "online": False,
        "tasks_total": 0,
        "tasks_running": 0,
        "tasks_completed": 0,
        "tasks_failed": 0,
        "tasks_ready": 0,
        "tasks_blocked": 0,
    },
    {
        "id": "dedirock",
        "host": "192.210.220.142",
        "user": "root",
        "board": "dedirock-light",
        "name": "DediRock (dedirock-light)",
        "description": "DediRock VPS — 1TB/2GB, Dispatcher alle 10 Min, max-runtime: 300s",
        "max_runtime": 300,
        "online": False,
        "tasks_total": 0,
        "tasks_running": 0,
        "tasks_completed": 0,
        "tasks_failed": 0,
        "tasks_ready": 0,
        "tasks_blocked": 0,
    },
]


def _ssh(host: str, cmd: str, timeout: int = 15) -> tuple[str, int]:
    """Run a command on a remote server via SSH, return (stdout, returncode)."""
    full_cmd = [
        "ssh",
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "ConnectTimeout=10",
        f"root@{host}",
        cmd,
    ]
    try:
        result = subprocess.run(
            full_cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if result.returncode != 0:
            logger.warning(f"SSH to {host} rc={result.returncode}: {result.stderr[:200]}")
        return result.stdout, result.returncode
    except subprocess.TimeoutExpired:
        logger.warning(f"SSH to {host} timed out after {timeout}s")
        return "", -1
    except FileNotFoundError:
        logger.error(f"SSH client not found — is OpenSSH installed?")
        return "", -2
    except Exception as exc:
        logger.error(f"SSH error for {host}: {exc}")
        return "", -3


def _fetch_remote_board(server: dict) -> dict | None:
    """Fetch kanban board data from a remote server.

    Returns the board payload (same shape as local /api/kanban/board)
    or None on failure.
    """
    host = server["host"]
    board = server["board"]

    # First: check if server is reachable + switch to correct board
    stdout, rc = _ssh(host, f"hermes kanban boards switch {board} >/dev/null 2>&1 && hermes kanban list --json 2>&1", timeout=30)

    if rc != 0:
        logger.warning(f"Remote board {host}/{board} unreachable (rc={rc})")
        return None

    # Parse the JSON output
    # The output might contain non-JSON prefix lines (e.g. "Active board is now...")
    try:
        # Try to find JSON array/object start in the output
        json_start = stdout.find("[")
        if json_start == -1:
            json_start = stdout.find("{")
        if json_start >= 0:
            clean = stdout[json_start:]
            data = json.loads(clean)
            tasks = data if isinstance(data, list) else data.get("tasks", data.get("items", []))
        else:
            data = json.loads(stdout)
            tasks = data if isinstance(data, list) else data.get("tasks", data.get("items", []))
    except (json.JSONDecodeError, ValueError, TypeError):
        logger.warning(f"Could not parse kanban list JSON from {host}")
        return None

    # Transform tasks to match the local kanban API format
    transformed = []
    for t in tasks:
        transformed.append({
            "id": t.get("id", ""),
            "title": t.get("title", ""),
            "body": t.get("body", ""),
            "status": t.get("status", "unknown"),
            "assignee": t.get("assignee", ""),
            "priority": t.get("priority", 0),
            "created_at": t.get("created_at", 0),
            "started_at": t.get("started_at", 0),
            "completed_at": t.get("completed_at", 0),
            "max_runtime_seconds": t.get("max_runtime_seconds"),
            "worker_pid": t.get("worker_pid"),
            "age_seconds": t.get("age_seconds", 0),
            "age": t.get("age", 0),
            "progress": t.get("progress"),
        })

    # Also fetch full task details to get events/runs
    detailed_tasks = []
    for t in transformed[:50]:  # Max 50 tasks
        if t["status"] in ("running", "ready", "blocked"):
            stdout, rc = _ssh(host, f"hermes kanban boards switch {board} >/dev/null 2>&1 && hermes kanban show {t['id']} --json 2>&1", timeout=10)
            if rc == 0:
                try:
                    # Strip non-JSON prefix
                    json_start = stdout.find("{")
                    if json_start >= 0:
                        clean = stdout[json_start:]
                        detail = json.loads(clean)
                    else:
                        detail = json.loads(stdout)
                    task_detail = detail.get("task") or detail.get("data") or detail
                    if isinstance(task_detail, dict):
                        # Merge events/runs into the task
                        events = detail.get("events", task_detail.get("events", []))
                        runs = detail.get("runs", task_detail.get("runs", []))
                        t["events"] = [{"kind": e.get("kind"), "at": e.get("at", e.get("created_at"))} for e in events[:5]]
                        t["runs"] = [{"status": r.get("status", r.get("outcome")), "pid": r.get("pid")} for r in runs[:3]]
                except json.JSONDecodeError:
                    pass

    # Count by status
    counts = {"triage": 0, "todo": 0, "ready": 0, "running": 0, "blocked": 0, "done": 0}
    for t in transformed:
        status = t["status"]
        if status in counts:
            counts[status] += 1
        # Also count as "completed" if done
        if status == "done":
            counts.setdefault("completed", 0)
            counts["completed"] += 1

    return {
        "server": server["id"],
        "board": board,
        "tasks": transformed,
        "counts": counts,
        "latest_event_id": int(time.time()),
        "fetched_at": time.time(),
    }


def _update_server_online_status() -> None:
    """Ping all remote servers and update their online/offline status."""
    for server in REMOTE_SERVERS:
        stdout, rc = _ssh(server["host"], "echo pong", timeout=8)
        server["online"] = (rc == 0 and stdout.strip() == "pong")


# ── API Handlers ────────────────────────────────────────────────────────────

def handle_workers_get(handler, parsed) -> bool | None:
    """GET /api/workers/* — route to sub-handlers."""
    path = parsed.path

    if path == "/api/workers/status":
        return _handle_workers_status(handler, parsed)
    if path == "/api/workers/board":
        return _handle_workers_board(handler, parsed)
    return False


def handle_workers_post(handler, parsed, body) -> bool | None:
    """POST /api/workers/*."""
    path = parsed.path
    if path == "/api/workers/task":
        return _handle_workers_task_create(handler, parsed, body)
    return False


def _handle_workers_status(handler, parsed) -> bool:
    """GET /api/workers/status — aggregate dashboard stats.

    Returns online status + task counts for all remote workers.
    """
    _update_server_online_status()

    payload = {
        "servers": [],
        "aggregate": {
            "total_ready": 0,
            "total_running": 0,
            "total_completed": 0,
            "total_failed": 0,
            "total_blocked": 0,
        },
    }

    for server in REMOTE_SERVERS:
        srv = {
            "id": server["id"],
            "name": server["name"],
            "host": server["host"],
            "board": server["board"],
            "online": server["online"],
            "description": server["description"],
            "max_runtime": server["max_runtime"],
            "tasks": {"ready": 0, "running": 0, "completed": 0, "failed": 0, "blocked": 0},
        }

        if server["online"]:
            board_data = _fetch_remote_board(server)
            if board_data:
                counts = board_data["counts"]
                srv["tasks"]["ready"] = counts.get("ready", 0)
                srv["tasks"]["running"] = counts.get("running", 0)
                srv["tasks"]["completed"] = counts.get("completed", counts.get("done", 0))
                srv["tasks"]["blocked"] = counts.get("blocked", 0)
                srv["tasks"]["total"] = len(board_data["tasks"])

                payload["aggregate"]["total_ready"] += srv["tasks"]["ready"]
                payload["aggregate"]["total_running"] += srv["tasks"]["running"]
                payload["aggregate"]["total_completed"] += srv["tasks"]["completed"]
                payload["aggregate"]["total_blocked"] += srv["tasks"]["blocked"]

        payload["servers"].append(srv)

    j(handler, payload)
    return True


def _handle_workers_board(handler, parsed) -> bool:
    """GET /api/workers/board?server=epyc — fetch full board data.

    Query params:
      server (required): epyc | dedirock
    """
    params = parse_qs(parsed.query or "")
    server_ids = params.get("server", [])

    if not server_ids:
        return bad(handler, "Missing 'server' query param (epyc | dedirock)", 400)

    server_id = server_ids[0].strip().lower()
    logger.info(f"Fetching board for server={server_id}")
    
    server = None
    for s in REMOTE_SERVERS:
        if s["id"] == server_id:
            server = s
            break

    if not server:
        return bad(handler, f"Unknown server: {server_id}", 404)

    try:
        board_data = _fetch_remote_board(server)
    except Exception as exc:
        logger.error(f"Board fetch exception: {exc}", exc_info=True)
        return bad(handler, f"Internal error fetching board: {exc}", 500)
    
    if board_data is None:
        # Try to get more detail on what failed
        stdout, rc = _ssh(server["host"], "echo ok", timeout=10)
        return bad(handler, f"Server {server_id} unreachable or board not found (SSH health={rc}, output={stdout.strip()[:100]})", 502)

    j(handler, board_data)
    return True


def _handle_workers_task_create(handler, parsed, body) -> bool:
    """POST /api/workers/task — create a task on a remote board.

    Body (JSON):
      server: "epyc" | "dedirock"
      title: str
      body: str (optional)
      assignee: str (default: "worker")
    """
    if not isinstance(body, dict):
        return bad(handler, "JSON body required", 400)

    server_id = (body.get("server") or "").strip().lower()
    title = (body.get("title") or "").strip()
    task_body = (body.get("body") or "").strip()
    assignee = (body.get("assignee") or "worker").strip()

    if not server_id:
        return bad(handler, "Missing 'server' field", 400)
    if not title:
        return bad(handler, "Missing 'title' field", 400)

    server = None
    for s in REMOTE_SERVERS:
        if s["id"] == server_id:
            server = s
            break

    if not server:
        return bad(handler, f"Unknown server: {server_id}", 404)

    # Escape and build command
    safe_title = title.replace("'", "'\\''")
    safe_body = task_body.replace("'", "'\\''")
    max_runtime = server["max_runtime"]
    safe_assignee = assignee.replace("'", "'\\''")

    cmd = (
        f"hermes kanban boards switch {server['board']} 2>/dev/null && "
        f"hermes kanban create '{safe_title}' "
        f"--assignee '{safe_assignee}' "
        f"--max-runtime {max_runtime} "
        f"--body '{safe_body}' 2>&1"
    )

    stdout, rc = _ssh(server["host"], cmd, timeout=15)

    if rc != 0:
        return bad(handler, f"Failed to create task on {server_id}: {stdout[:500]}", 502)

    # Extract task ID from output
    task_id = ""
    for line in stdout.split("\n"):
        if "Created" in line or "t_" in line:
            for word in line.split():
                if word.startswith("t_") and len(word) > 3:
                    task_id = word.strip(" ,.)(;:")
                    break
            if task_id:
                break

    j(handler, {
        "success": True,
        "task_id": task_id,
        "server": server_id,
        "board": server["board"],
        "output": stdout.strip()[:300],
    })
    return True
