#!/usr/bin/env python3
"""Verify Windows UIA only against a private, self-owned WinForms fixture.

Exit codes: 0=all checks passed, 1=verification failure, 2=unsupported OS.
The verifier never captures the general desktop, targets arbitrary windows, or
uses global mouse/keyboard input. Mutations use UIA patterns on the fixture and
one-time host-issued approvals bound to action, element, snapshot, parameters,
and this verification run.
"""

from __future__ import annotations

import base64
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import uuid

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parents[1]
SIDEKICK_DIR = REPO_ROOT / "services" / "sidekick"
if str(SIDEKICK_DIR) not in sys.path:
    sys.path.insert(0, str(SIDEKICK_DIR))

FIXTURE_TITLE = "Lastbrowser UIA Test Fixture"
FIXTURE_SCRIPT = REPO_ROOT / "services" / "sidekick" / "tests" / "fixtures" / "windows_uia_test_app.ps1"

from tools.computer_use.approval import (  # noqa: E402
    action_parameters_fingerprint,
    compute_action_target_fingerprint,
    default_approval_registry,
)
from tools.computer_use.windows_backend import WindowsUiaBackend  # noqa: E402


def check(condition: bool, label: str, detail: str = "") -> None:
    if not condition:
        raise RuntimeError(f"{label}: {detail or 'condition was false'}")
    print(f"[PASS] {label}" + (f" — {detail}" if detail else ""))


class OwnedWinFormsFixture:
    def __init__(self, ipc_dir: Path):
        self.ipc_dir = ipc_dir
        self.state_path = ipc_dir / "state.json"
        self.request_path = ipc_dir / "request.json"
        self.process: subprocess.Popen | None = None

    def start(self) -> None:
        self.ipc_dir.mkdir(parents=True, exist_ok=True)
        command = [
            "powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-STA",
            "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", str(FIXTURE_SCRIPT),
            "-IpcDirectory", str(self.ipc_dir),
        ]
        self.process = subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        state = self.wait_state(lambda value: value.get("ready") is True, 8)
        check(state.get("pid") == self.process.pid, "owned fixture started", f"pid={self.process.pid}")

    def read_state(self) -> dict:
        try:
            return json.loads(self.state_path.read_text(encoding="utf-8-sig"))
        except (FileNotFoundError, PermissionError, json.JSONDecodeError):
            return {}

    def wait_state(self, predicate, timeout: float) -> dict:
        deadline = time.monotonic() + timeout
        last = {}
        while time.monotonic() < deadline:
            if self.process is not None and self.process.poll() is not None:
                raise RuntimeError(f"owned fixture exited with code {self.process.returncode}; last state={last}")
            last = self.read_state()
            if predicate(last):
                return last
            time.sleep(0.05)
        raise TimeoutError(f"timed out waiting for fixture state; last state={last}")

    def block_own_ui_thread(self, duration_ms: int) -> None:
        temporary = self.ipc_dir / "request.tmp"
        temporary.write_text(json.dumps({"action": "block_ui", "duration_ms": duration_ms}), encoding="utf-8")
        temporary.replace(self.request_path)
        self.wait_state(lambda value: value.get("uiBlocked") is True, 3)

    def close(self) -> None:
        if self.process is None:
            return
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=1)
        self.process = None


def issue_approval(action: str, params: dict, run_id: str) -> str:
    return default_approval_registry.issue_token(
        action=action,
        target=compute_action_target_fingerprint(action, params),
        snapshot_id=str(params["snapshot_id"]),
        run_id=run_id,
        parameters_fingerprint=action_parameters_fingerprint(action, params),
        ttl_seconds=10,
    )


def verify_client_bounds(capture, label: str) -> None:
    check(capture.app == FIXTURE_TITLE, f"{label} targets owned fixture", capture.app)
    check(capture.width > 0 and capture.height > 0, f"{label} dimensions are nonzero")
    origin_x, origin_y = capture.meta["origin"]
    outer = capture.meta.get("target_outer_bounds")
    own_bounds = [(item.label, item.role, item.bounds) for item in capture.elements]
    for element in capture.elements:
        x, y, width, height = element.bounds
        if width <= 0 or height <= 0 or not (
            x >= origin_x and y >= origin_y
            and x + width <= origin_x + capture.width
            and y + height <= origin_y + capture.height
        ):
            raise RuntimeError(
                f"{label} owned target geometry mismatch: outer={outer}, "
                f"client={(origin_x, origin_y, capture.width, capture.height)}, "
                f"elements={own_bounds}"
            )


def verify_scoped_image(capture, label: str) -> None:
    verify_client_bounds(capture, label)
    check(bool(capture.png_b64), f"{label} returned PNG data")
    raw = base64.b64decode(capture.png_b64, validate=True)
    check(raw[:8] == b"\x89PNG\r\n\x1a\n", f"{label} is a valid PNG")
    width, height = struct.unpack(">II", raw[16:24])
    check((width, height) == (capture.width, capture.height),
          f"{label} PNG size matches reported dimensions", f"{width}x{height}")
    check(bool(capture.elements), f"{label} includes scoped UIA bounds")


def verify_runtime() -> None:
    import_probe = subprocess.run(
        [sys.executable, "-c", "import uiautomation; print('UIA_IMPORT_OK')"],
        capture_output=True,
        text=True,
        timeout=5,
        check=False,
    )
    check(import_probe.returncode == 0 and "UIA_IMPORT_OK" in import_probe.stdout,
          "UIA runtime import", import_probe.stderr.strip())

    run_id = f"windows-fixture-{uuid.uuid4().hex}"
    ipc_dir = Path(tempfile.mkdtemp(prefix="lastbrowser-windows-uia-"))
    fixture = OwnedWinFormsFixture(ipc_dir)
    backend = WindowsUiaBackend(timeout=15.0)
    capture_errors: list[BaseException] = []
    try:
        fixture.start()
        diagnostic_ok, diagnostic = backend.check_availability_diagnostics()
        check(diagnostic_ok, "worker diagnostics (DPI V2 + COM MTA + UIA)", diagnostic)

        som_capture = backend.capture(mode="som", app=FIXTURE_TITLE)
        verify_scoped_image(som_capture, "scoped SOM capture")
        vision_capture = backend.capture(mode="vision", app=FIXTURE_TITLE)
        verify_scoped_image(vision_capture, "scoped vision capture")
        capture = backend.capture(mode="ax", app=FIXTURE_TITLE)
        verify_client_bounds(capture, "scoped AX capture")
        check(not any(item.role == "TitleBarControl" for item in capture.elements),
              "AX target excludes nonclient titlebar controls")
        check(capture.meta.get("target_outer_bounds") == som_capture.meta.get("target_outer_bounds"),
              "owned outer window remains stable between capture modes")
        check(capture.meta.get("origin") == som_capture.meta.get("origin"),
              "owned client origin remains stable between capture modes")
        check(bool(capture.snapshot_id), "scoped snapshot issued")
        by_label = {element.label: element for element in capture.elements}
        check("Invoke Counter" in by_label, "fixture InvokePattern control discovered")
        check("Own Edit" in by_label, "fixture ValuePattern control discovered")
        button = by_label["Invoke Counter"]
        edit = by_label["Own Edit"]

        patterns = button.attributes["patterns"]
        check(patterns.get("invoke") is True and patterns.get("value") is False,
              "fixture button exposes Invoke but no ValuePattern")
        no_pattern_value = "unauthorized-window-title-change"
        no_pattern_params = {
            "element_ref": button.index,
            "value": no_pattern_value,
            "snapshot_id": capture.snapshot_id,
        }
        no_pattern = backend.set_value(
            no_pattern_value,
            element=button.index,
            snapshot_id=capture.snapshot_id,
            approval_id=issue_approval("set_value", no_pattern_params, run_id),
            run_id=run_id,
        )
        check(not no_pattern.ok and "does not support ValuePattern" in no_pattern.message,
              "approved SetValue rejects control without ValuePattern", no_pattern.message)
        check(fixture.read_state().get("windowTitle") == FIXTURE_TITLE,
              "unsupported SetValue leaves fixture window title unchanged")

        denied = backend.invoke(element_ref=button.index, snapshot_id=capture.snapshot_id, run_id=run_id)
        check(not denied.ok and denied.meta.get("requires_approval") is True,
              "semantic mutation denied without token")
        check(fixture.read_state().get("counter") == 0, "denied Invoke had no fixture side effect")

        invoke_params = {"element_ref": button.index, "snapshot_id": capture.snapshot_id}
        invoked = backend.invoke(
            element_ref=button.index,
            snapshot_id=capture.snapshot_id,
            approval_id=issue_approval("invoke", invoke_params, run_id),
            run_id=run_id,
        )
        check(invoked.ok, "approved UIA Invoke returned success", invoked.message)
        check(invoked.meta.get("safe_to_retry") is False,
              "executed Invoke is marked unsafe to retry")
        if invoked.meta.get("foreground_changed"):
            check(invoked.meta.get("executed") is True,
                  "foreground-change warning records that Invoke executed")
            check(invoked.meta.get("safe_to_retry") is False,
                  "foreground-change warning prohibits retry")
        counter = fixture.wait_state(lambda state: state.get("counter") == 1, 3)
        check(counter.get("counter") == 1, "Invoke changed only the fixture-owned counter")

        value = "lastbrowser-uia-controlled-value"
        value_params = {"element_ref": edit.index, "value": value, "snapshot_id": capture.snapshot_id}
        changed = backend.set_value(
            value,
            element=edit.index,
            snapshot_id=capture.snapshot_id,
            approval_id=issue_approval("set_value", value_params, run_id),
            run_id=run_id,
        )
        check(changed.ok, "approved UIA ValuePattern executed", changed.message)
        check(changed.meta.get("safe_to_retry") is False, "executed SetValue is marked unsafe to retry")
        state = fixture.wait_state(lambda item: item.get("ownEdit") == value, 3)
        check(state.get("ownEdit") == value, "SetValue reached the fixture IPC state file")

        fixture.block_own_ui_thread(15000)
        capture_sent = threading.Event()
        original_send = backend._send_command

        def observe_capture(command, *args, **kwargs):
            if command == "capture":
                capture_sent.set()
            return original_send(command, *args, **kwargs)

        backend._send_command = observe_capture

        def capture_blocked_app():
            try:
                backend.capture(mode="ax", app=FIXTURE_TITLE)
            except BaseException as exc:
                capture_errors.append(exc)

        capture_thread = threading.Thread(target=capture_blocked_app, daemon=True)
        capture_thread.start()
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            process = backend._proc
            if capture_sent.is_set() and process is not None and backend._io_lock.locked():
                break
            if not capture_thread.is_alive():
                raise RuntimeError(f"UIA capture returned before the controlled hang: {capture_errors}")
            time.sleep(0.01)
        else:
            raise TimeoutError("scoped capture did not enter the worker I/O path")

        worker_process = backend._proc
        check(worker_process is not None, "capture worker process exists")
        started = time.perf_counter()
        stop_result = backend.emergency_stop()
        elapsed_ms = (time.perf_counter() - started) * 1000
        check(stop_result.ok, "emergency stop terminated the UIA worker", stop_result.message)
        check(stop_result.meta.get("input_dispatch_latched") is True, "input dispatch latch confirmed")
        check(stop_result.meta.get("input_dispatch_latch_ms", float("inf")) < 50,
              "input latch latency measured", f"{stop_result.meta.get('input_dispatch_latch_ms')} ms")
        check(stop_result.meta.get("worker_terminated") is True, "worker termination independently confirmed")
        check(stop_result.meta.get("worker_termination_ms", float("inf")) < 500,
              "worker process-kill latency measured", f"{stop_result.meta.get('worker_termination_ms')} ms")
        check(elapsed_ms < 1000, "overall emergency stop completed", f"{elapsed_ms:.1f} ms")
        check(worker_process.poll() is not None and backend._proc is None,
              "hung worker is dead and detached")
        try:
            backend._send_command("ping")
        except RuntimeError as exc:
            check("emergency-stop state" in str(exc), "emergency latch denies follow-up calls", str(exc))
        else:
            raise RuntimeError("emergency-stopped backend accepted a follow-up ping")
        check(backend._proc is None, "follow-up denial did not spawn another worker")
        capture_thread.join(timeout=2)
        check(not capture_thread.is_alive(), "hung capture unwound after worker termination")
        check(bool(capture_errors), "hung capture reported worker termination")
    finally:
        backend.stop()
        fixture.close()
        try:
            import shutil
            shutil.rmtree(ipc_dir, ignore_errors=True)
        except Exception:
            pass


def main() -> int:
    print("Lastbrowser Windows Computer Use verifier")
    if sys.platform != "win32":
        print(f"[SKIP] Unsupported platform: {sys.platform}; this verifier requires Windows.")
        return 2
    try:
        verify_runtime()
    except Exception as exc:
        print(f"[FAIL] {type(exc).__name__}: {exc}")
        traceback.print_exc()
        return 1
    print("[PASS] All Windows UIA fixture checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
