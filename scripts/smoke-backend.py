import os
import sys
import time
import json
import urllib.request
import urllib.error
import subprocess
from pathlib import Path

import tempfile
import shutil

def run_smoke():
    repo_root = Path(__file__).resolve().parent.parent
    python_exe = repo_root / "apps" / "desktop" / "runtime" / "python" / "python.exe"
    sidekick_dir = repo_root / "services" / "sidekick"
    temp_dir_obj = tempfile.TemporaryDirectory(prefix="lastbrowser-smoke-")
    test_state_dir = Path(temp_dir_obj.name)

    port = 18999
    env = os.environ.copy()
    env["LASTBROWSER_INTEGRATED"] = "1"
    env["LASTBROWSER_HOME"] = str(test_state_dir)
    env["LASTBROWSER_WEBUI_AGENT_DIR"] = str(sidekick_dir)
    env["LASTBROWSER_WEBUI_STATE_DIR"] = str(test_state_dir)
    env["SIDEKICK_WEBUI_AGENT_DIR"] = str(sidekick_dir)
    env["SIDEKICK_WEBUI_STATE_DIR"] = str(test_state_dir)
    env["SIDEKICK_STATE_DIR"] = str(test_state_dir)
    env["SIDEKICK_WEBUI_PORT"] = str(port)
    env["SIDEKICK_WEBUI_NO_BROWSER"] = "1"
    env["PYTHONPATH"] = str(sidekick_dir)

    print(f"[smoke] Starting uvicorn cli.web_server:app on port {port}...")
    try:
        log_file_path = test_state_dir / "uvicorn.log"
        log_file = open(log_file_path, "w", encoding="utf-8")
        proc = subprocess.Popen(
            [
                str(python_exe),
                "-m",
                "uvicorn",
                "cli.web_server:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(port)
            ],
            cwd=str(sidekick_dir),
            env=env,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
        )

        base_url = f"http://127.0.0.1:{port}"
        session_token = None
        started = False
        for attempt in range(30):
            time.sleep(1)
            try:
                req = urllib.request.Request(f"{base_url}/")
                with urllib.request.urlopen(req, timeout=5) as resp:
                    html = resp.read().decode("utf-8")
                    import re
                    m = re.search(r'__SIDEKICK_SESSION_TOKEN__\s*=\s*["\']([^"\']+)["\']', html)
                    if m:
                        session_token = m.group(1)
                        print(f"[smoke] Server up, session token acquired: {session_token[:8]}...")
                        started = True
                        break
            except Exception:
                if proc.poll() is not None:
                    out = log_file_path.read_text(encoding="utf-8", errors="replace") if log_file_path.exists() else ""
                    print(f"[smoke] Process exited prematurely code {proc.returncode}:\n{out}")
                    return False

        auth_headers = {
            "X-Sidekick-Session-Token": session_token or "",
            "Authorization": f"Bearer {session_token or ''}"
        }

        if not started:
            print("[smoke] Failed to connect to server within timeout.")
            return False

        # Test update blocking on /api/sidekick/update (must return HTTP 409 Conflict)
        try:
            update_headers = dict(auth_headers)
            update_headers["Content-Type"] = "application/json"
            req = urllib.request.Request(f"{base_url}/api/sidekick/update", data=b"{}", headers=update_headers, method="POST")
            urllib.request.urlopen(req, timeout=10)
            print("[smoke] ERROR: /api/sidekick/update did not fail with 409!")
            return False
        except urllib.error.HTTPError as exc:
            if exc.code == 409:
                body = json.loads(exc.read().decode("utf-8"))
                print(f"[smoke] Verified /api/sidekick/update correctly returned HTTP 409: {body}")
            else:
                print(f"[smoke] ERROR: Expected 409, got {exc.code}")
                return False

        # Test update blocking on /api/updates/check
        try:
            req = urllib.request.Request(f"{base_url}/api/updates/check", headers=auth_headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                print(f"[smoke] /api/updates/check response: {data}")
                assert data.get("disabled") is True
                assert data.get("managed_by") == "lastbrowser"
        except Exception as exc:
            print(f"[smoke] /api/updates/check verification: {exc}")
            return False

        # Test update blocking on /api/updates/apply (must return HTTP 409 Conflict)
        try:
            apply_headers = dict(auth_headers)
            apply_headers["Content-Type"] = "application/json"
            req = urllib.request.Request(f"{base_url}/api/updates/apply", data=b'{"target":"webui"}', headers=apply_headers, method="POST")
            urllib.request.urlopen(req, timeout=10)
            print("[smoke] ERROR: /api/updates/apply did not fail with 409!")
            return False
        except urllib.error.HTTPError as exc:
            if exc.code == 409:
                body = json.loads(exc.read().decode("utf-8"))
                print(f"[smoke] Verified /api/updates/apply correctly returned HTTP 409: {body}")
            else:
                print(f"[smoke] ERROR: /api/updates/apply expected 409, got {exc.code}")
                return False

        # Test session list / creation
        try:
            req = urllib.request.Request(f"{base_url}/api/sessions", headers=auth_headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                print(f"[smoke] /api/sessions response: ok={resp.status}")
        except Exception as exc:
            print(f"[smoke] /api/sessions request: {exc}")
            return False

        print("[smoke] Backend started, responded to health/API, enforced update blocking, and shut down cleanly.")
        return True
    finally:
        if 'proc' in locals() and proc is not None:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                try:
                    proc.kill()
                    proc.wait(timeout=2)
                except Exception:
                    pass
        if 'log_file' in locals() and log_file is not None and not log_file.closed:
            try:
                log_file.close()
            except Exception:
                pass
        temp_dir_obj.cleanup()

if __name__ == "__main__":
    success = run_smoke()
    sys.exit(0 if success else 1)
