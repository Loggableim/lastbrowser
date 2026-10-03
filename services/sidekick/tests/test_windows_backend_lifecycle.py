"""Deterministic lifecycle regressions for the Windows worker host.

These tests use fake pipes/processes and never send input to the desktop.
"""

from __future__ import annotations

import json
import hashlib
import hmac
import threading

import pytest

from tools.computer_use import windows_backend
from tools.computer_use.approval import (
    action_parameters_fingerprint,
    compute_action_target_fingerprint,
    default_approval_registry,
)


class FakeStdin:
    def __init__(self):
        self.writes = []

    def write(self, value):
        self.writes.append(value)

    def flush(self):
        pass


class FakeStdout:
    def __init__(self, response=None, *, block=False):
        self.response = response
        self.block = block
        self.release = threading.Event()

    def readline(self):
        if self.block:
            self.release.wait()
            return ""
        return self.response


class FakeProcess:
    def __init__(self, response=None, *, block=False, alive=True, kill_fails=False):
        self.stdin = FakeStdin()
        self.stdout = FakeStdout(response, block=block)
        self.alive = alive
        self.terminated = False
        self.killed = False
        self.kill_fails = kill_fails

    def poll(self):
        return None if self.alive else 1

    def terminate(self):
        self.terminated = True
        self.alive = False

    def kill(self):
        self.killed = True
        if not self.kill_fails:
            self.alive = False

    def wait(self, timeout=None):
        if self.kill_fails and self.alive:
            raise TimeoutError("fake worker did not exit")
        self.alive = False
        return 0


def _with_fake_spawner(monkeypatch, *processes):
    pending = iter(processes)
    spawned = []

    def popen(*args, **kwargs):
        proc = next(pending)
        spawned.append(proc)
        return proc

    monkeypatch.setattr(windows_backend.subprocess, "Popen", popen)
    return spawned


def test_first_command_starts_worker_and_reads_reply(monkeypatch):
    proc = FakeProcess(json.dumps({"ok": True}) + "\n")
    spawned = _with_fake_spawner(monkeypatch, proc)
    backend = windows_backend.WindowsUiaBackend(timeout=0.2)

    assert backend._send_command("ping")["ok"] is True
    assert spawned == [proc]
    assert json.loads(proc.stdin.writes[0]) == {"command": "ping", "args": {}}


def test_timeout_stops_hung_worker_and_next_command_restarts(monkeypatch):
    hung = FakeProcess(block=True)
    recovered = FakeProcess(json.dumps({"ok": True}) + "\n")
    spawned = _with_fake_spawner(monkeypatch, hung, recovered)
    backend = windows_backend.WindowsUiaBackend(timeout=0.01)

    with pytest.raises(TimeoutError):
        backend._send_command("capture", timeout=0.01)

    assert hung.killed or hung.terminated
    assert backend._proc is None
    assert backend._send_command("ping")["ok"] is True
    assert spawned == [hung, recovered]
    hung.stdout.release.set()


def test_eof_cleans_up_worker_and_allows_recovery(monkeypatch):
    dead = FakeProcess("")
    recovered = FakeProcess(json.dumps({"ok": True}) + "\n")
    spawned = _with_fake_spawner(monkeypatch, dead, recovered)
    backend = windows_backend.WindowsUiaBackend()

    with pytest.raises(RuntimeError, match="terminated unexpectedly"):
        backend._send_command("ping")

    assert backend._proc is None
    assert backend._send_command("ping")["ok"] is True
    assert spawned == [dead, recovered]


def test_malformed_response_stops_worker_and_allows_recovery(monkeypatch):
    broken = FakeProcess("not-json\n")
    recovered = FakeProcess(json.dumps({"ok": True}) + "\n")
    spawned = _with_fake_spawner(monkeypatch, broken, recovered)
    backend = windows_backend.WindowsUiaBackend()

    with pytest.raises(RuntimeError, match="Malformed worker JSON"):
        backend._send_command("ping")

    assert backend._proc is None
    assert backend._send_command("ping")["ok"] is True
    assert spawned == [broken, recovered]


def test_emergency_latch_prevents_implicit_worker_restart(monkeypatch):
    proc = FakeProcess(json.dumps({"ok": True}) + "\n")
    spawned = _with_fake_spawner(monkeypatch, proc)
    backend = windows_backend.WindowsUiaBackend()
    backend._emergency_stopped = True

    with pytest.raises(RuntimeError, match="emergency-stop state"):
        backend._send_command("physical_input", {"actions": []})

    assert spawned == []


def test_only_explicit_start_resumes_emergency_latch(monkeypatch):
    proc = FakeProcess(json.dumps({"ok": True}) + "\n")
    spawned = _with_fake_spawner(monkeypatch, proc)
    backend = windows_backend.WindowsUiaBackend()
    backend._emergency_stopped = True

    backend.start()

    assert backend._send_command("ping")["ok"] is True
    assert spawned == [proc]


def test_emergency_stop_does_not_release_untracked_user_inputs(monkeypatch):
    calls = []

    class User32:
        def keybd_event(self, *args):
            calls.append(("key", args))

        def mouse_event(self, *args):
            calls.append(("mouse", args))

    monkeypatch.setattr(windows_backend.ctypes, "windll", type("Dll", (), {"user32": User32()})(), raising=False)
    backend = windows_backend.WindowsUiaBackend()

    result = backend.emergency_stop()

    assert result.ok is True
    assert result.meta["worker_terminated"] is True
    assert calls == []


def test_emergency_stop_does_not_wait_for_command_io_lock(monkeypatch):
    backend = windows_backend.WindowsUiaBackend()
    entered = threading.Event()
    finished = threading.Event()

    def invoke_stop():
        entered.set()
        backend.emergency_stop()
        finished.set()

    with backend._io_lock:
        thread = threading.Thread(target=invoke_stop)
        thread.start()
        assert entered.wait(0.2)
        assert finished.wait(0.2)
    thread.join(timeout=0.2)


def test_emergency_stop_kills_blocked_worker_and_keeps_latch(monkeypatch):
    blocked = FakeProcess(block=True)
    spawned = _with_fake_spawner(monkeypatch, blocked)
    backend = windows_backend.WindowsUiaBackend(timeout=1.0)
    command_error = []

    def issue_command():
        try:
            backend._send_command("capture", timeout=1.0)
        except Exception as exc:  # expected after the worker is killed
            command_error.append(exc)

    command = threading.Thread(target=issue_command)
    command.start()
    # Wait until the command has been written and its fake response is blocked.
    for _ in range(100):
        if blocked.stdin.writes:
            break
        threading.Event().wait(0.005)
    assert blocked.stdin.writes

    result = backend.emergency_stop()
    assert result.ok is True
    assert blocked.killed is True
    assert result.meta["input_dispatch_latch_ms"] <= result.meta["total_elapsed_ms"]
    assert result.meta["measurement_scope"] == "host_dispatch_only"

    with pytest.raises(RuntimeError, match="emergency-stop state"):
        backend._send_command("physical_input", {"actions": []})

    blocked.stdout.release.set()
    command.join(timeout=0.5)
    assert not command.is_alive()
    assert spawned == [blocked]


def test_unconfirmed_kill_keeps_latch_and_prevents_resume(monkeypatch):
    stubborn = FakeProcess(kill_fails=True)
    _with_fake_spawner(monkeypatch, stubborn)
    backend = windows_backend.WindowsUiaBackend()
    backend.start()

    result = backend.emergency_stop()

    assert result.ok is False
    assert result.meta["worker_terminated"] is False
    assert backend._proc is stubborn
    with pytest.raises(RuntimeError, match="still running"):
        backend.start()
    with pytest.raises(RuntimeError, match="emergency-stop state"):
        backend._send_command("physical_input", {"actions": []})


def _issue_action_token(action, parameters, run_id):
    target = compute_action_target_fingerprint(action, parameters)
    fingerprint = action_parameters_fingerprint(action, parameters)
    if not target:
        target = fingerprint
    return default_approval_registry.issue_token(
        action=action,
        target=target,
        snapshot_id=parameters["snapshot_id"],
        run_id=run_id,
        parameters_fingerprint=fingerprint,
    )


def test_semantic_invoke_requires_approval_before_worker_start(monkeypatch):
    proc = FakeProcess(json.dumps({"ok": True, "message": "done"}) + "\n")
    spawned = _with_fake_spawner(monkeypatch, proc)
    backend = windows_backend.WindowsUiaBackend()

    denied = backend.invoke(element="#3", snapshot_id="snap-a", run_id="run-a")

    assert denied.ok is False
    assert denied.meta.get("requires_approval") is True
    assert spawned == []


def test_approved_semantic_action_is_signed_for_worker(monkeypatch):
    default_approval_registry.clear()
    proc = FakeProcess(json.dumps({"ok": True, "message": "invoked"}) + "\n")
    spawned = _with_fake_spawner(monkeypatch, proc)
    backend = windows_backend.WindowsUiaBackend()
    parameters = {"element_ref": 3, "snapshot_id": "snap-a"}
    token = _issue_action_token("invoke", parameters, "run-a")

    result = backend.invoke(
        element="#3", snapshot_id="snap-a", approval_id=token, run_id="run-a"
    )

    request = json.loads(proc.stdin.writes[0])
    envelope = request["host_authorization"]
    signed_payload = {
        "action": "invoke",
        "parameters": {"element_ref": 3},
        "snapshot_id": "snap-a",
        "run_id": "run-a",
        "nonce": envelope["nonce"],
    }
    canonical = json.dumps(signed_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    expected_mac = hmac.new(
        backend._worker_auth_secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256
    ).hexdigest()

    assert result.ok is True
    assert request["run_id"] == "run-a"
    assert request["args"] == {"element_ref": 3, "snapshot_id": "snap-a"}
    assert hmac.compare_digest(envelope["mac"], expected_mac)
    assert spawned == [proc]
    default_approval_registry.clear()


def test_physical_approval_failure_does_not_send_to_worker(monkeypatch):
    proc = FakeProcess(json.dumps({"ok": True}) + "\n")
    spawned = _with_fake_spawner(monkeypatch, proc)
    backend = windows_backend.WindowsUiaBackend()

    result = backend.physical_input(
        actions=[{"type": "wait", "seconds": 0}],
        snapshot_id="snap-a",
        approval_id="",
        run_id="run-a",
    )

    assert result.ok is False
    assert result.meta.get("requires_approval") is True
    assert spawned == []


def test_scroll_without_element_fails_closed_before_worker_start(monkeypatch):
    proc = FakeProcess(json.dumps({"ok": True}) + "\n")
    spawned = _with_fake_spawner(monkeypatch, proc)
    backend = windows_backend.WindowsUiaBackend()

    result = backend.scroll(direction="down", snapshot_id="snap-a", run_id="run-a")

    assert result.ok is False
    assert "element reference" in result.message.lower()
    assert spawned == []


def test_capture_failure_clears_previous_snapshot(monkeypatch):
    backend = windows_backend.WindowsUiaBackend()
    backend._last_snapshot_id = "snap-old"
    backend._last_snapshot_meta = {"snapshot_id": "snap-old"}
    monkeypatch.setattr(backend, "_send_command", lambda *a, **k: {"ok": False, "error": "capture failed"})

    with pytest.raises(RuntimeError, match="capture failed"):
        backend.capture(mode="som")

    assert backend._last_snapshot_id == ""
    assert backend._last_snapshot_meta == {}


def test_unknown_application_capture_fails_without_desktop_fallback(monkeypatch):
    proc = FakeProcess(json.dumps({"ok": True, "windows": []}) + "\n")
    spawned = _with_fake_spawner(monkeypatch, proc)
    backend = windows_backend.WindowsUiaBackend()

    with pytest.raises(RuntimeError, match="refusing desktop capture fallback"):
        backend.capture(mode="som", app="Missing App")

    assert backend._last_snapshot_id == ""
    assert spawned == [proc]
    assert len(proc.stdin.writes) == 1
    assert json.loads(proc.stdin.writes[0])["command"] == "list_windows"


def test_ambiguous_application_capture_fails_before_capture(monkeypatch):
    windows = [
        {"app": "Chrome_WidgetWin_1", "title": "Chrome - Work", "hwnd": 101},
        {"app": "Chrome_WidgetWin_1", "title": "Chrome - Personal", "hwnd": 202},
    ]
    proc = FakeProcess(json.dumps({"ok": True, "windows": windows}) + "\n")
    spawned = _with_fake_spawner(monkeypatch, proc)
    backend = windows_backend.WindowsUiaBackend()

    with pytest.raises(RuntimeError, match="matched multiple windows"):
        backend.capture(mode="som", app="chrome")

    assert backend._last_snapshot_id == ""
    assert len(proc.stdin.writes) == 1
    assert json.loads(proc.stdin.writes[0])["command"] == "list_windows"
    assert spawned == [proc]


def test_capture_exposes_snapshot_and_coordinate_metadata(monkeypatch):
    backend = windows_backend.WindowsUiaBackend()
    monkeypatch.setattr(backend, "_send_command", lambda *a, **k: {
        "ok": True,
        "snapshot_id": "snap-new",
        "width": 1280,
        "height": 720,
        "origin": [-1280, 0],
        "capture_dpi": 144,
        "dpi_awareness_verified": True,
        "coordinate_space": "physical_virtual_screen_pixels",
        "elements": [],
        "png_b64": "YWJj",
    })

    result = backend.capture(mode="som")

    assert result.snapshot_id == "snap-new"
    assert result.meta["origin"] == [-1280, 0]
    assert result.meta["dimensions"] == [1280, 720]
    assert result.meta["capture_dpi"] == 144
    assert result.meta["dpi_awareness_verified"] is True
    assert result.meta["coordinate_space"] == "physical_virtual_screen_pixels"


def test_followup_capture_keeps_selected_window_scope(monkeypatch):
    backend = windows_backend.WindowsUiaBackend()
    monkeypatch.setattr(backend, "list_apps", lambda: [{"app": "fixture", "title": "Owned", "hwnd": 123}])
    targets = []
    def send(command, args, **_):
        targets.append(args["target_hwnd"])
        return {"ok": True, "snapshot_id": "snapshot", "elements": [], "width": 20, "height": 20}
    monkeypatch.setattr(backend, "_send_command", send)
    backend.capture(mode="ax", app="Owned")
    backend.capture(mode="ax")
    assert targets == [123, 123]
