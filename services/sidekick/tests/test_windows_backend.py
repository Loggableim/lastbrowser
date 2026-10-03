"""Bounded Windows UIA integration checks against our private test fixture only.

These tests never enumerate or target arbitrary desktop windows and never send
physical mouse or keyboard input. Semantic mutations are scoped to the fixture
and require a host-issued, parameter-bound token.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path
import struct
import subprocess
import sys
import threading
import time

import pytest

from tools.computer_use.approval import (
    action_parameters_fingerprint,
    compute_action_target_fingerprint,
    default_approval_registry,
)
from tools.computer_use.windows_backend import WindowsUiaBackend


pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="requires Windows UIA and WinForms")

FIXTURE_TITLE = "Lastbrowser UIA Test Fixture"
FIXTURE_SCRIPT = Path(__file__).parent / "fixtures" / "windows_uia_test_app.ps1"
TEST_RUN_ID = "windows-uia-fixture-test"


class OwnedWinFormsFixture:
    """One PowerShell-hosted WinForms app and its private temporary IPC files."""

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
        state = self.wait_state(lambda value: value.get("ready") is True, timeout=8)
        assert state["pid"] == self.process.pid

    def read_state(self) -> dict:
        try:
            return json.loads(self.state_path.read_text(encoding="utf-8-sig"))
        except (FileNotFoundError, PermissionError, json.JSONDecodeError):
            return {}

    def wait_state(self, predicate, timeout: float = 5) -> dict:
        deadline = time.monotonic() + timeout
        last = {}
        while time.monotonic() < deadline:
            if self.process is not None and self.process.poll() is not None:
                raise RuntimeError(f"owned UIA fixture exited with code {self.process.returncode}; last state={last}")
            last = self.read_state()
            if predicate(last):
                return last
            time.sleep(0.05)
        raise TimeoutError(f"timed out waiting for owned UIA fixture state; last state={last}")

    def request_ui_thread_block(self, duration_ms: int = 12000) -> None:
        temporary = self.ipc_dir / "request.tmp"
        temporary.write_text(json.dumps({"action": "block_ui", "duration_ms": duration_ms}), encoding="utf-8")
        temporary.replace(self.request_path)
        self.wait_state(lambda value: value.get("uiBlocked") is True, timeout=3)

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


@pytest.fixture
def owned_fixture(tmp_path):
    fixture = OwnedWinFormsFixture(tmp_path / "windows-uia-fixture")
    fixture.start()
    try:
        yield fixture
    finally:
        fixture.close()


@pytest.fixture
def backend():
    instance = WindowsUiaBackend(timeout=12.0)
    instance.start()
    try:
        yield instance
    finally:
        instance.stop()


def _issue_fixture_approval(action: str, params: dict) -> str:
    token = default_approval_registry.issue_token(
        action=action,
        target=compute_action_target_fingerprint(action, params),
        snapshot_id=str(params["snapshot_id"]),
        run_id=TEST_RUN_ID,
        parameters_fingerprint=action_parameters_fingerprint(action, params),
        ttl_seconds=10,
    )
    return token


def _fixture_elements(capture):
    by_label = {element.label: element for element in capture.elements}
    assert "Invoke Counter" in by_label, f"fixture button absent from scoped UIA tree: {sorted(by_label)}"
    assert "Own Edit" in by_label, f"fixture edit absent from scoped UIA tree: {sorted(by_label)}"
    return by_label


def _assert_scoped_client_bounds(capture):
    assert capture.app == FIXTURE_TITLE
    assert capture.width > 0 and capture.height > 0
    origin_x, origin_y = capture.meta["origin"]
    outer_bounds = capture.meta.get("target_outer_bounds")
    for element in capture.elements:
        x, y, width, height = element.bounds
        assert width > 0 and height > 0, f"invalid scoped element bounds: {element}"
        inside = (
            x >= origin_x and y >= origin_y
            and x + width <= origin_x + capture.width
            and y + height <= origin_y + capture.height
        )
        assert inside, (
            "owned fixture geometry mismatch: "
            f"outer={outer_bounds}, client={(origin_x, origin_y, capture.width, capture.height)}, "
            f"element_bounds={[(item.label, item.role, item.bounds, item.attributes.get('patterns')) for item in capture.elements]}"
        )


def _assert_scoped_png_and_bounds(capture):
    _assert_scoped_client_bounds(capture)
    assert capture.png_b64
    png = base64.b64decode(capture.png_b64, validate=True)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    image_width, image_height = struct.unpack(">II", png[16:24])
    assert (image_width, image_height) == (capture.width, capture.height)
def test_worker_diagnostics_and_fixture_scoped_semantic_mutations(backend, owned_fixture):
    """Real UIA Invoke and ValuePattern affect only our own instrumented app."""
    ok, diagnostic = backend.check_availability_diagnostics()
    assert ok, diagnostic

    som_capture = backend.capture(mode="som", app=FIXTURE_TITLE)
    _assert_scoped_png_and_bounds(som_capture)
    assert som_capture.snapshot_id == backend._last_snapshot_id
    vision_capture = backend.capture(mode="vision", app=FIXTURE_TITLE)
    _assert_scoped_png_and_bounds(vision_capture)
    ax_capture = backend.capture(mode="ax", app=FIXTURE_TITLE)
    _assert_scoped_client_bounds(ax_capture)
    assert not any(element.role == "TitleBarControl" for element in ax_capture.elements)
    assert ax_capture.meta["target_outer_bounds"] == som_capture.meta["target_outer_bounds"]
    assert ax_capture.meta["origin"] == som_capture.meta["origin"]
    capture = ax_capture
    elements = _fixture_elements(capture)
    button = elements["Invoke Counter"]
    edit = elements["Own Edit"]

    # The button is a valid top-level fixture control but has no ValuePattern.
    # A correctly bound token must not fall back to changing a window caption.
    button_patterns = button.attributes["patterns"]
    assert button_patterns.get("invoke") is True
    assert button_patterns.get("value") is False
    window_title_attempt = "unauthorized-window-title-change"
    no_pattern_params = {
        "element_ref": button.index,
        "value": window_title_attempt,
        "snapshot_id": capture.snapshot_id,
    }
    no_pattern_result = backend.set_value(
        window_title_attempt,
        element=button.index,
        snapshot_id=capture.snapshot_id,
        approval_id=_issue_fixture_approval("set_value", no_pattern_params),
        run_id=TEST_RUN_ID,
    )
    assert no_pattern_result.ok is False
    assert "does not support ValuePattern" in no_pattern_result.message
    assert owned_fixture.read_state().get("windowTitle") == FIXTURE_TITLE

    # A missing host token must reject before the fixture counter changes.
    denied = backend.invoke(element_ref=button.index, snapshot_id=capture.snapshot_id, run_id=TEST_RUN_ID)
    assert denied.ok is False and denied.meta.get("requires_approval") is True
    assert owned_fixture.read_state().get("counter") == 0

    invoke_params = {"element_ref": button.index, "snapshot_id": capture.snapshot_id}
    invoke_result = backend.invoke(
        element_ref=button.index,
        snapshot_id=capture.snapshot_id,
        approval_id=_issue_fixture_approval("invoke", invoke_params),
        run_id=TEST_RUN_ID,
    )
    assert invoke_result.ok is True, invoke_result.message
    assert invoke_result.meta.get("safe_to_retry") is False
    if invoke_result.meta.get("foreground_changed"):
        assert invoke_result.meta.get("executed") is True
        assert invoke_result.meta.get("safe_to_retry") is False
    state = owned_fixture.wait_state(lambda value: value.get("counter") == 1)
    assert state["pid"] == owned_fixture.process.pid

    replacement = "sidekick-uia-fixture-value"
    value_params = {
        "element_ref": edit.index,
        "value": replacement,
        "snapshot_id": capture.snapshot_id,
    }
    set_result = backend.set_value(
        replacement,
        element=edit.index,
        snapshot_id=capture.snapshot_id,
        approval_id=_issue_fixture_approval("set_value", value_params),
        run_id=TEST_RUN_ID,
    )
    assert set_result.ok is True, set_result.message
    assert set_result.meta.get("safe_to_retry") is False
    state = owned_fixture.wait_state(lambda value: value.get("ownEdit") == replacement)
    assert state["ownEdit"] == replacement


def test_emergency_stop_terminates_worker_hung_on_owned_ui_thread(backend, owned_fixture, monkeypatch):
    """A blocked test fixture proves bounded stop, worker kill, and no restart."""
    owned_fixture.request_ui_thread_block(duration_ms=15000)
    capture_errors: list[BaseException] = []
    capture_sent = threading.Event()
    send_command = backend._send_command

    def observe_capture_command(command, *args, **kwargs):
        if command == "capture":
            capture_sent.set()
        return send_command(command, *args, **kwargs)

    monkeypatch.setattr(backend, "_send_command", observe_capture_command)

    def capture_blocked_fixture():
        try:
            backend.capture(mode="ax", app=FIXTURE_TITLE)
        except BaseException as exc:  # captured for the assertion below
            capture_errors.append(exc)

    capture_thread = threading.Thread(target=capture_blocked_fixture, daemon=True)
    capture_thread.start()

    # Wait until the exact worker has received the scoped capture request.
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        process = backend._proc
        if capture_sent.is_set() and process is not None and process.stdin is not None and backend._io_lock.locked():
            break
        if not capture_thread.is_alive():
            pytest.fail(f"capture returned before the owned UIA hang was exercised: {capture_errors}")
        time.sleep(0.01)
    else:
        pytest.fail("capture command did not enter the worker I/O path")

    worker_process = backend._proc
    assert worker_process is not None
    started = time.perf_counter()
    stopped = backend.emergency_stop()
    elapsed_ms = (time.perf_counter() - started) * 1000

    assert stopped.ok is True, stopped.message
    assert stopped.meta.get("input_dispatch_latched") is True
    assert stopped.meta.get("worker_terminated") is True
    assert stopped.meta.get("input_dispatch_latch_ms", float("inf")) < 50
    assert stopped.meta.get("worker_termination_ms", float("inf")) < 500
    assert elapsed_ms < 1000
    assert worker_process.poll() is not None
    assert backend._proc is None

    # The emergency latch forbids even a harmless ping from starting a fresh worker.
    with pytest.raises(RuntimeError, match="emergency-stop state"):
        backend._send_command("ping")
    assert backend._proc is None

    capture_thread.join(timeout=2)
    assert not capture_thread.is_alive(), "blocked command reader did not unwind after worker termination"
    assert capture_errors, "capture should report interruption after the worker is killed"


def test_runtime_dependency_probe_is_bounded_and_explicit():
    """UIA import failure is reported as a blocker rather than hidden as a skip."""
    probe = subprocess.run(
        [sys.executable, "-c", "import uiautomation; print('UIA_IMPORT_OK')"],
        capture_output=True,
        text=True,
        timeout=5,
        check=False,
    )
    assert probe.returncode == 0, f"UIA import unavailable: {probe.stderr.strip()}"
    assert "UIA_IMPORT_OK" in probe.stdout

    backend = WindowsUiaBackend(timeout=2.0)
    ok, message = backend.check_availability_diagnostics()
    assert ok is True, message
    backend.stop()
