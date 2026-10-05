"""End-to-End verification script for packaged Lastbrowser + Sidekick integration.

Validates:
1. Presence and integrity of packaged binaries (NSIS, portable, win-unpacked).
2. Backend startup with bundled Python & in-tree services in an isolated environment.
3. Health check, API endpoints, and update blocking (409 Conflict, managed_by=lastbrowser).
4. Full round-trip chat functionality with mock OpenAI-compatible provider.
5. Persistence of settings and sessions across restart in isolated test directory.
6. Persistence of settings and sessions across simulated package update (Paketwechsel).
7. Live execution of packaged Lastbrowser.exe with process inspection & clean termination.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DESKTOP_DIR = REPO_ROOT / "apps" / "desktop"
RELEASE_DIR = DESKTOP_DIR / "release"
UNPACKED_DIR = RELEASE_DIR / "win-unpacked"
TEST_TMP_DIR = REPO_ROOT / ".test-tmp" / "packaged-integration-e2e"

CHECKS: list[tuple[str, bool, str]] = []


def record_check(name: str, passed: bool, detail: str = "") -> None:
    CHECKS.append((name, passed, detail))
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name}{f' - {detail}' if detail else ''}")


class MockOpenAIServer(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        pass  # Suppress default server logs

    def do_GET(self) -> None:
        if self.path in ("/v1/models", "/models"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            data = {
                "object": "list",
                "data": [
                    {"id": "test-model", "object": "model", "owned_by": "mock"}
                ]
            }
            self.wfile.write(json.dumps(data).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self) -> None:
        if "/chat/completions" in self.path:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            try:
                payload = json.loads(body.decode("utf-8"))
            except Exception:
                payload = {}
            is_stream = payload.get("stream", True)
            print(f"[mock-llm] Received POST {self.path} (stream={is_stream})")

            if is_stream:
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()

                chunk1 = {
                    "id": "chatcmpl-mock-1",
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": "test-model",
                    "choices": [{
                        "index": 0,
                        "delta": {"role": "assistant", "content": "Hallo aus dem gebündelten Sidekick-Backend!"},
                        "finish_reason": None
                    }]
                }
                chunk2 = {
                    "id": "chatcmpl-mock-1",
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": "test-model",
                    "choices": [{
                        "index": 0,
                        "delta": {},
                        "finish_reason": "stop"
                    }]
                }
                self.wfile.write(f"data: {json.dumps(chunk1)}\n\n".encode("utf-8"))
                self.wfile.flush()
                time.sleep(0.05)
                self.wfile.write(f"data: {json.dumps(chunk2)}\n\n".encode("utf-8"))
                self.wfile.flush()
                time.sleep(0.05)
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            else:
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                resp = {
                    "id": "chatcmpl-mock-1",
                    "object": "chat.completion",
                    "created": int(time.time()),
                    "model": "test-model",
                    "choices": [{
                        "index": 0,
                        "message": {"role": "assistant", "content": "Hallo aus dem gebündelten Sidekick-Backend!"},
                        "finish_reason": "stop"
                    }]
                }
                self.wfile.write(json.dumps(resp).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()


def start_mock_llm_server(port: int = 19999) -> HTTPServer:
    server = HTTPServer(("127.0.0.1", port), MockOpenAIServer)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def wait_for_server(base_url: str, timeout: float = 30.0) -> str | None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            req = urllib.request.Request(base_url)
            with urllib.request.urlopen(req, timeout=3) as resp:
                html = resp.read().decode("utf-8", errors="replace")
                m = re.search(r'__SIDEKICK_SESSION_TOKEN__\s*=\s*["\']([^"\']+)["\']', html)
                if m:
                    return m.group(1)
        except Exception:
            pass
        time.sleep(1)
    return None


def request_json(url: str, method: str = "GET", headers: dict[str, str] | None = None, body: dict | None = None, timeout: float = 10.0) -> tuple[int, dict]:
    req_headers = dict(headers or {})
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode("utf-8")
            return resp.status, json.loads(text) if text else {}
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(text)
        except Exception:
            parsed = {"raw": text}
        return exc.code, parsed
    except Exception as exc:
        return 0, {"error": str(exc)}


def run_pipeline() -> bool:
    print("=" * 70)
    print("LASTBROWSER & SIDEKICK PACKAGED INTEGRATION E2E TEST")
    print("=" * 70)

    # 1. Check packaged artifacts
    print("\n--- Step 1: Verify Packaged Artifacts ---")
    desktop_pkg = json.loads((DESKTOP_DIR / "package.json").read_text(encoding="utf-8"))
    pkg_ver = desktop_pkg.get("version", "")
    setup_exes = sorted(RELEASE_DIR.glob(f"Lastbrowser-{pkg_ver}-*-setup.exe"), key=lambda p: p.stat().st_mtime, reverse=True) or sorted(RELEASE_DIR.glob("Lastbrowser-*-setup.exe"), key=lambda p: p.stat().st_mtime, reverse=True)
    portable_exes = sorted(RELEASE_DIR.glob(f"Lastbrowser-{pkg_ver}-*-portable.exe"), key=lambda p: p.stat().st_mtime, reverse=True) or sorted(RELEASE_DIR.glob("Lastbrowser-*-portable.exe"), key=lambda p: p.stat().st_mtime, reverse=True)
    main_exe = UNPACKED_DIR / "Lastbrowser.exe"
    bundled_python = UNPACKED_DIR / "resources" / "runtime" / "python" / "python.exe"
    bundled_sidekick = UNPACKED_DIR / "resources" / "services" / "sidekick"
    bundled_manifest = UNPACKED_DIR / "resources" / "services" / "sidekick-source.json"

    record_check("Packaged NSIS installer exists", bool(setup_exes and setup_exes[0].stat().st_size > 50_000_000), str(setup_exes[0] if setup_exes else "none"))
    record_check("Packaged Portable executable exists", bool(portable_exes and portable_exes[0].stat().st_size > 50_000_000), str(portable_exes[0] if portable_exes else "none"))
    record_check("Packaged win-unpacked Lastbrowser.exe exists", main_exe.exists() and main_exe.stat().st_size > 50_000_000, str(main_exe))
    record_check("Bundled Python executable exists", bundled_python.exists(), str(bundled_python))
    record_check("Bundled Sidekick service tree exists", (bundled_sidekick / "cli" / "web_server.py").exists(), str(bundled_sidekick))
    record_check("Bundled sidekick-source.json manifest exists", bundled_manifest.exists(), str(bundled_manifest))

    # Start local mock LLM
    mock_port = 19999
    mock_server = start_mock_llm_server(mock_port)
    print(f"\n[mock-llm] Started local mock OpenAI server on 127.0.0.1:{mock_port}")

    # Prepare isolated test state directory
    isolated_state = TEST_TMP_DIR / "isolated-state"
    if isolated_state.exists():
        shutil.rmtree(isolated_state, ignore_errors=True)
    isolated_state.mkdir(parents=True, exist_ok=True)
    runtime_dir = isolated_state / "runtime"
    runtime_dir.mkdir(parents=True, exist_ok=True)
    (runtime_dir / "webui").mkdir(parents=True, exist_ok=True)

    # Seed isolated config.yaml pointing to the local mock OpenAI provider
    isolated_config = f"""model:
  provider: custom
  base_url: http://127.0.0.1:{mock_port}/v1
  api_key: mock-key-for-test
  model: test-model
"""
    (runtime_dir / "config.yaml").write_text(isolated_config, encoding="utf-8")

    sidekick_port = 19876
    base_url = f"http://127.0.0.1:{sidekick_port}"

    def build_env(app_sidekick_dir: Path, app_python_exe: Path) -> dict[str, str]:
        env = os.environ.copy()
        env["LASTBROWSER_INTEGRATED"] = "1"
        env["LASTBROWSER_HOME"] = str(runtime_dir)
        env["LASTBROWSER_WEBUI_AGENT_DIR"] = str(app_sidekick_dir)
        env["LASTBROWSER_WEBUI_STATE_DIR"] = str(runtime_dir / "webui")
        env["SIDEKICK_HOME"] = str(runtime_dir)
        env["SIDEKICK_BASE_HOME"] = str(runtime_dir)
        env["SIDEKICK_AGENT_DIR"] = str(app_sidekick_dir)
        env["SIDEKICK_WEBUI_AGENT_DIR"] = str(app_sidekick_dir)
        env["SIDEKICK_WEBUI_STATE_DIR"] = str(runtime_dir / "webui")
        env["SIDEKICK_STATE_DIR"] = str(runtime_dir / "webui")
        env["SIDEKICK_WEBUI_PORT"] = str(sidekick_port)
        env["SIDEKICK_WEBUI_NO_BROWSER"] = "1"
        env["PYTHONPATH"] = str(app_sidekick_dir)
        env["CUSTOM_BASE_URL"] = f"http://127.0.0.1:{mock_port}/v1"
        env["CUSTOM_API_KEY"] = "mock-key-for-test"
        env["OPENAI_BASE_URL"] = f"http://127.0.0.1:{mock_port}/v1"
        env["OPENAI_API_KEY"] = "mock-key-for-test"
        return env

    session_id_created = ""

    # Phase 2: Start bundled backend in isolated environment
    print("\n--- Step 2: Start Bundled Backend with Isolated Data ---")
    log_file_1 = isolated_state / "uvicorn_run1.log"
    log_fp_1 = open(log_file_1, "w", encoding="utf-8")
    proc1 = subprocess.Popen(
        [
            str(bundled_python),
            "-m",
            "uvicorn",
            "cli.web_server:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(sidekick_port)
        ],
        cwd=str(bundled_sidekick),
        env=build_env(bundled_sidekick, bundled_python),
        stdout=log_fp_1,
        stderr=subprocess.STDOUT,
        text=True
    )

    try:
        token = wait_for_server(base_url, timeout=25.0)
        record_check("Bundled backend starts and returns session token", bool(token), f"token={token[:8]}..." if token else "timeout")
        if not token:
            print("Server log:\n" + log_file_1.read_text(encoding="utf-8", errors="replace"))
            return False

        auth_headers = {
            "X-Sidekick-Session-Token": token,
            "Authorization": f"Bearer {token}"
        }

        # Step 3: Health & APIs
        print("\n--- Step 3: Verify Health, Status and API Endpoints ---")
        status_code, onboarding_status = request_json(f"{base_url}/api/onboarding/status", headers=auth_headers)
        record_check("GET /api/onboarding/status returns HTTP 200", status_code == 200, f"code={status_code}")

        status_code, models_data = request_json(f"{base_url}/api/models", headers=auth_headers)
        record_check("GET /api/models responds successfully", status_code == 200, f"code={status_code}")

        status_code, providers_data = request_json(f"{base_url}/api/providers", headers=auth_headers)
        record_check("GET /api/providers responds successfully", status_code == 200, f"code={status_code}")

        # Step 4: Update Blocking (Update-Sperren)
        print("\n--- Step 4: Verify Unified Update Blocking ---")
        code, resp = request_json(f"{base_url}/api/sidekick/update", method="POST", headers=auth_headers, body={})
        record_check("POST /api/sidekick/update blocked with HTTP 409 Conflict", code == 409 and resp.get("disabled") is True and resp.get("managed_by") == "lastbrowser", f"code={code} resp={resp}")

        code, resp = request_json(f"{base_url}/api/updates/check", headers=auth_headers)
        record_check("GET /api/updates/check disabled by Lastbrowser", code == 200 and resp.get("disabled") is True and resp.get("managed_by") == "lastbrowser", f"code={code} resp={resp}")

        code, resp = request_json(f"{base_url}/api/updates/apply", method="POST", headers=auth_headers, body={"target": "webui"})
        record_check("POST /api/updates/apply blocked with HTTP 409 Conflict", code == 409 and resp.get("disabled") is True and resp.get("managed_by") == "lastbrowser", f"code={code} resp={resp}")

        # Step 5: Settings & Chat functionality
        print("\n--- Step 5: Verify Settings and Chat Execution ---")
        # Save custom setting with schema-valid values
        code, set_resp = request_json(f"{base_url}/api/settings", method="POST", headers=auth_headers, body={"theme": "light", "skin": "matrix", "language": "de"})
        record_check("POST /api/settings saves configuration", code == 200, f"code={code}")

        code, get_settings = request_json(f"{base_url}/api/settings", headers=auth_headers)
        record_check(
            "GET /api/settings retrieves saved configuration",
            code == 200 and get_settings.get("theme") == "light" and get_settings.get("skin") == "matrix" and get_settings.get("language") == "de",
            f"theme={get_settings.get('theme')}, skin={get_settings.get('skin')}, lang={get_settings.get('language')}"
        )

        # Create new session
        code, sess_resp = request_json(
            f"{base_url}/api/session/new",
            method="POST",
            headers=auth_headers,
            body={"title": "Persistent E2E Test Session", "model": "test-model", "model_provider": "custom"}
        )
        session_id_created = sess_resp.get("session", {}).get("session_id", "")
        record_check("POST /api/session/new creates a new session", code == 200 and bool(session_id_created), f"session_id={session_id_created}")

        # Start chat
        code, chat_start = request_json(
            f"{base_url}/api/chat/start",
            method="POST",
            headers=auth_headers,
            body={
                "session_id": session_id_created,
                "message": "Hallo Sidekick, bitte antworte!",
                "model": "test-model",
                "model_provider": "custom",
                "profile": "default"
            }
        )
        stream_id = chat_start.get("stream_id", "")
        record_check("POST /api/chat/start initiates chat stream", code == 200 and bool(stream_id), f"stream_id={stream_id}")

        # Wait for chat stream to finish processing
        chat_completed = False
        messages = []
        for poll_idx in range(50):
            time.sleep(0.5)
            c, s_detail = request_json(f"{base_url}/api/session?session_id={session_id_created}&messages=1", headers=auth_headers)
            sess_obj = s_detail.get("session", {})
            if not sess_obj.get("active_stream_id") and not sess_obj.get("pending_user_message"):
                messages = sess_obj.get("messages", [])
                if len(messages) >= 2:
                    chat_completed = True
                    break

        if not chat_completed:
            print(f"[chat-debug] Poll timed out. Last session state: active_stream={sess_obj.get('active_stream_id')}, pending_user_message={sess_obj.get('pending_user_message')}, msgs={len(messages)}")

        record_check("Chat completed and response stored in session database", chat_completed, f"message_count={len(messages)}")
    finally:
        proc1.terminate()
        try:
            proc1.wait(timeout=5)
        except Exception:
            proc1.kill()
        log_fp_1.close()

    # Step 6: Test persistence across RESTART
    print("\n--- Step 6: Verify Persistence across Restart ---")
    log_file_2 = isolated_state / "uvicorn_run2.log"
    log_fp_2 = open(log_file_2, "w", encoding="utf-8")
    proc2 = subprocess.Popen(
        [
            str(bundled_python),
            "-m",
            "uvicorn",
            "cli.web_server:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(sidekick_port)
        ],
        cwd=str(bundled_sidekick),
        env=build_env(bundled_sidekick, bundled_python),
        stdout=log_fp_2,
        stderr=subprocess.STDOUT,
        text=True
    )

    try:
        token2 = wait_for_server(base_url, timeout=25.0)
        record_check("Restarted bundled backend responds", bool(token2), f"token2={token2[:8]}..." if token2 else "timeout")
        auth_headers2 = {
            "X-Sidekick-Session-Token": token2,
            "Authorization": f"Bearer {token2}"
        }

        # Check settings persisted
        code, get_settings2 = request_json(f"{base_url}/api/settings", headers=auth_headers2)
        record_check(
            "Settings persisted across backend restart",
            code == 200 and get_settings2.get("theme") == "light" and get_settings2.get("skin") == "matrix" and get_settings2.get("language") == "de",
            f"theme={get_settings2.get('theme')}, skin={get_settings2.get('skin')}, lang={get_settings2.get('language')}"
        )

        # Check session persisted
        code, get_sess2 = request_json(f"{base_url}/api/session?session_id={session_id_created}&messages=1", headers=auth_headers2)
        session_data2 = get_sess2.get("session", {})
        messages2 = session_data2.get("messages", [])
        record_check("Session and chat history persisted across restart", code == 200 and len(messages2) >= 2, f"title={session_data2.get('title')}, msgs={len(messages2)}")
    finally:
        proc2.terminate()
        try:
            proc2.wait(timeout=5)
        except Exception:
            proc2.kill()
        log_fp_2.close()

    # Step 7: Test persistence across SIMULATED PACKAGE UPDATE (Paketwechsel)
    print("\n--- Step 7: Verify Persistence across Simulated Package Update ---")
    simulated_vnext = RELEASE_DIR / "win-unpacked-vNext"
    if simulated_vnext.exists():
        shutil.rmtree(simulated_vnext, ignore_errors=True)

    print(f"Creating simulated updated package directory: {simulated_vnext}")
    shutil.copytree(UNPACKED_DIR, simulated_vnext)

    # Bump version in simulated manifest to represent a new build
    vnext_manifest = simulated_vnext / "resources" / "services" / "sidekick-source.json"
    if vnext_manifest.exists():
        manifest_data = json.loads(vnext_manifest.read_text(encoding="utf-8"))
        manifest_data["version"] = "0.8.85-vNext"
        vnext_manifest.write_text(json.dumps(manifest_data, indent=2), encoding="utf-8")

    vnext_python = simulated_vnext / "resources" / "runtime" / "python" / "python.exe"
    vnext_sidekick = simulated_vnext / "resources" / "services" / "sidekick"

    log_file_3 = isolated_state / "uvicorn_run3_vnext.log"
    log_fp_3 = open(log_file_3, "w", encoding="utf-8")
    proc3 = subprocess.Popen(
        [
            str(vnext_python),
            "-m",
            "uvicorn",
            "cli.web_server:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(sidekick_port)
        ],
        cwd=str(vnext_sidekick),
        env=build_env(vnext_sidekick, vnext_python),
        stdout=log_fp_3,
        stderr=subprocess.STDOUT,
        text=True
    )

    try:
        token3 = wait_for_server(base_url, timeout=25.0)
        record_check("Backend runs cleanly from updated package layout (Paketwechsel)", bool(token3), f"token3={token3[:8]}..." if token3 else "timeout")
        auth_headers3 = {
            "X-Sidekick-Session-Token": token3,
            "Authorization": f"Bearer {token3}"
        }

        # Check settings still persisted
        code, get_settings3 = request_json(f"{base_url}/api/settings", headers=auth_headers3)
        record_check(
            "Settings retained after simulated package update",
            code == 200 and get_settings3.get("theme") == "light" and get_settings3.get("skin") == "matrix" and get_settings3.get("language") == "de",
            f"theme={get_settings3.get('theme')}, skin={get_settings3.get('skin')}, lang={get_settings3.get('language')}"
        )

        # Check previous session still persisted
        code, get_sess3 = request_json(f"{base_url}/api/session?session_id={session_id_created}&messages=1", headers=auth_headers3)
        session_data3 = get_sess3.get("session", {})
        messages3 = session_data3.get("messages", [])
        record_check("Previous session & messages retained after simulated package update", code == 200 and len(messages3) >= 2, f"title={session_data3.get('title')}, msgs={len(messages3)}")

        # Create a new session in vNext to verify full read/write continuity
        code, sess3_resp = request_json(
            f"{base_url}/api/session/new",
            method="POST",
            headers=auth_headers3,
            body={"title": "Session created in vNext", "model": "test-model"}
        )
        session_vnext_id = sess3_resp.get("session", {}).get("session_id", "")
        record_check("New session created successfully in vNext", code == 200 and bool(session_vnext_id), f"vNext_session_id={session_vnext_id}")

        code, sessions_list = request_json(f"{base_url}/api/sessions", headers=auth_headers3)
        sessions_ids = [s.get("session_id") or s.get("id") for s in sessions_list.get("sessions", [])]
        record_check("Both original and vNext sessions present in sessions list", session_id_created in sessions_ids and session_vnext_id in sessions_ids, f"total={len(sessions_ids)}")
    finally:
        proc3.terminate()
        try:
            proc3.wait(timeout=5)
        except Exception:
            proc3.kill()
        log_fp_3.close()
        shutil.rmtree(simulated_vnext, ignore_errors=True)

    # Step 8: Live Electron Executable Launch Test
    print("\n--- Step 8: Live Packaged Electron Executable Launch Test ---")
    electron_isolated = TEST_TMP_DIR / "electron-live-userData"
    electron_isolated.mkdir(parents=True, exist_ok=True)
    cdp_port = 19444

    live_proc = subprocess.Popen(
        [
            str(main_exe),
            f"--user-data-dir={electron_isolated}",
            f"--remote-debugging-port={cdp_port}",
            "--no-sandbox"
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    try:
        # Give Electron time to boot and check CDP
        cdp_ready = False
        cdp_targets = []
        for _ in range(30):
            time.sleep(1)
            try:
                req = urllib.request.Request(f"http://127.0.0.1:{cdp_port}/json/list")
                with urllib.request.urlopen(req, timeout=2) as r:
                    cdp_targets = json.loads(r.read().decode("utf-8"))
                    if cdp_targets:
                        cdp_ready = True
                        break
            except Exception:
                pass
            if live_proc.poll() is not None:
                break

        record_check("Packaged Lastbrowser.exe launches and opens CDP", cdp_ready, f"targets={len(cdp_targets)}")

        # Check process tree for python.exe child
        # PowerShell query for child python process
        ps_cmd = f"Get-CimInstance Win32_Process | Where-Object {{ $_.ParentProcessId -eq {live_proc.pid} -or $_.CommandLine -like '*uvicorn*' }} | Select-Object ProcessId, Name, ExecutablePath, CommandLine | ConvertTo-Json -Compress"
        ps_run = subprocess.run(["powershell.exe", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True)
        py_spawned = False
        if ps_run.returncode == 0 and ps_run.stdout.strip():
            try:
                procs = json.loads(ps_run.stdout)
                if not isinstance(procs, list):
                    procs = [procs]
                py_spawned = any("python" in p.get("Name", "").lower() or "uvicorn" in p.get("CommandLine", "").lower() for p in procs)
            except Exception:
                pass

        record_check("Packaged Lastbrowser.exe spawns bundled Python Sidecar process", py_spawned)

    finally:
        # Cleanly terminate live process tree
        subprocess.run(["taskkill.exe", "/PID", str(live_proc.pid), "/T", "/F"], capture_output=True)
        try:
            live_proc.wait(timeout=3)
        except Exception:
            pass

    # Stop mock server
    mock_server.shutdown()

    # Final summary
    print("\n" + "=" * 70)
    passed_count = sum(1 for _, ok, _ in CHECKS if ok)
    total_count = len(CHECKS)
    print(f"VERIFICATION RESULTS: {passed_count}/{total_count} CHECKS PASSED")
    print("=" * 70)
    for name, ok, detail in CHECKS:
        print(f"[{'PASS' if ok else 'FAIL'}] {name}{f' - {detail}' if detail else ''}")

    return passed_count == total_count


if __name__ == "__main__":
    success = run_pipeline()
    sys.exit(0 if success else 1)
