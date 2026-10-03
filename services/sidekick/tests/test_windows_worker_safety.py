"""Safe mocked coverage for the Windows worker's trust and UIA contracts.

No test creates a live window or sends input to the desktop.
"""

from __future__ import annotations

import ctypes
import hashlib
import hmac
import json
import sys
import types
import time

import pytest

from tools.computer_use import windows_worker as worker


def _signed(engine, action, parameters, snapshot_id="snap_test", run_id="task_test", nonce="nonce_0123456789"):
    payload = json.dumps(
        {
            "action": action,
            "parameters": parameters,
            "snapshot_id": snapshot_id,
            "run_id": run_id,
            "nonce": nonce,
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    mac = hmac.new(engine._physical_auth_secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return {"nonce": nonce, "mac": mac}


def _get_window_rect(_hwnd, out_rect, bounds=(0, 0, 100, 100)):
    rect = ctypes.cast(out_rect, ctypes.POINTER(worker.RECT)).contents
    rect.left, rect.top, width, height = bounds
    rect.right, rect.bottom = rect.left + width, rect.top + height
    return 1


def _get_client_rect(_hwnd, out_rect, bounds=(0, 0, 100, 100)):
    rect = ctypes.cast(out_rect, ctypes.POINTER(worker.RECT)).contents
    rect.left, rect.top, width, height = bounds
    rect.right, rect.bottom = rect.left + width, rect.top + height
    return 1


def _client_to_screen(_hwnd, out_point, origin=(0, 0)):
    point = ctypes.cast(out_point, ctypes.POINTER(worker.POINT)).contents
    point.x, point.y = origin
    return 1


class _Monitor:
    def start(self):
        pass

    def stop(self):
        return {"foreground_changed": False, "cursor_moved": False}


class _FocusChangedMonitor(_Monitor):
    def stop(self):
        return {"foreground_changed": True, "cursor_moved": False}


def _fake_uia(monkeypatch, *, pattern_id=10000, scroll_amount=None):
    auto = types.SimpleNamespace(
        PatternId=types.SimpleNamespace(InvokePattern=pattern_id, ValuePattern=10002, ScrollPattern=10004),
        ScrollAmount=scroll_amount or types.SimpleNamespace(
            NoAmount=0, SmallDecrement=1, SmallIncrement=3
        ),
    )
    monkeypatch.setitem(sys.modules, "uiautomation", auto)
    return auto


def test_emergency_stop_releases_only_agent_held_inputs(monkeypatch):
    engine = worker.WindowsEngine()
    engine._agent_held_keys = {0x41}
    engine._agent_held_mouse_buttons = {"left"}
    calls = []

    def send_input(count, events, size):
        calls.append([events[i] for i in range(count)])
        return count

    monkeypatch.setattr(worker.user32, "SendInput", send_input)
    result = engine.emergency_stop()

    assert result["ok"] is True
    sent = [event for batch in calls for event in batch]
    assert len(sent) == 2
    assert {(event.type, event.union.ki.wVk if event.type == worker.INPUT_KEYBOARD else event.union.mi.dwFlags) for event in sent} == {
        (worker.INPUT_KEYBOARD, 0x41),
        (worker.INPUT_MOUSE, worker.MOUSEEVENTF_LEFTUP),
    }
    assert set(result["released"]) == {"key_0x41", "mouse_left"}


def test_invoke_reports_false_pattern_result(monkeypatch):
    engine = worker.WindowsEngine()
    engine._physical_auth_secret = "fixture-secret"
    control = types.SimpleNamespace(GetPattern=lambda _pattern: types.SimpleNamespace(Invoke=lambda: False))
    monkeypatch.setattr(engine, "_resolve_element", lambda *_: ({"control": control, "metadata": {"index": 1, "label": "Run"}}, None))
    monkeypatch.setattr(worker, "InvariantMonitor", _Monitor)
    _fake_uia(monkeypatch)

    result = engine.invoke(
        "#1", "snap_test", "task_test",
        _signed(engine, "invoke", {"element_ref": "#1"}),
    )
    assert result["ok"] is False
    assert "returned failure" in result["message"]


def test_invoke_reports_success_and_no_retry_when_focus_changes(monkeypatch):
    engine = worker.WindowsEngine()
    engine._physical_auth_secret = "fixture-secret"
    control = types.SimpleNamespace(GetPattern=lambda _pattern: types.SimpleNamespace(Invoke=lambda: True))
    monkeypatch.setattr(engine, "_resolve_element", lambda *_: ({"control": control, "metadata": {"index": 1, "label": "Run"}}, None))
    monkeypatch.setattr(worker, "InvariantMonitor", _FocusChangedMonitor)
    _fake_uia(monkeypatch)

    result = engine.invoke(1, "snap_test", "task_test", _signed(engine, "invoke", {"element_ref": 1}))
    assert result["ok"] is True
    assert result["meta"]["executed"] is True
    assert result["meta"]["safe_to_retry"] is False
    assert result["meta"]["foreground_changed"] is True


def test_invoke_exception_marks_execution_unknown_and_non_retryable(monkeypatch):
    engine = worker.WindowsEngine()
    engine._physical_auth_secret = "fixture-secret"
    control = types.SimpleNamespace(GetPattern=lambda _pattern: types.SimpleNamespace(Invoke=lambda: (_ for _ in ()).throw(RuntimeError("late COM error"))))
    monkeypatch.setattr(engine, "_resolve_element", lambda *_: ({"control": control, "metadata": {"index": 1, "label": "Run"}}, None))
    monkeypatch.setattr(worker, "InvariantMonitor", _Monitor)
    _fake_uia(monkeypatch)

    result = engine.invoke(1, "snap_test", "task_test", _signed(engine, "invoke", {"element_ref": 1}))
    assert result["ok"] is False
    assert result["meta"]["executed"] == "unknown"
    assert result["meta"]["safe_to_retry"] is False


def test_invoke_rejects_missing_invoke_pattern(monkeypatch):
    engine = worker.WindowsEngine()
    engine._physical_auth_secret = "fixture-secret"
    control = types.SimpleNamespace(GetPattern=lambda _pattern: None)
    monkeypatch.setattr(engine, "_resolve_element", lambda *_: ({"control": control, "metadata": {"index": 1, "label": "Run"}}, None))
    _fake_uia(monkeypatch)

    result = engine.invoke(
        1, "snap_test", "task_test",
        _signed(engine, "invoke", {"element_ref": 1}),
    )
    assert result["ok"] is False
    assert "does not support InvokePattern" in result["message"]


def test_set_value_requires_success_and_matching_postcondition(monkeypatch):
    engine = worker.WindowsEngine()
    engine._physical_auth_secret = "fixture-secret"
    pattern = types.SimpleNamespace(SetValue=lambda _value: False, Value="expected")
    control = types.SimpleNamespace(GetPattern=lambda _pattern: pattern)
    monkeypatch.setattr(engine, "_resolve_element", lambda *_: ({"control": control, "metadata": {"index": 2}}, None))
    monkeypatch.setattr(worker, "InvariantMonitor", _Monitor)
    _fake_uia(monkeypatch, pattern_id=10002)

    result = engine.set_value(
        "#2", "expected", "snap_test", "task_test",
        _signed(engine, "set_value", {"element_ref": "#2", "value": "expected"}),
    )
    assert result["ok"] is True
    assert result["meta"]["verified"] is True
    assert result["meta"]["pattern_call_succeeded"] is False


def test_scroll_rejects_invalid_direction_and_no_movement(monkeypatch):
    engine = worker.WindowsEngine()
    engine._physical_auth_secret = "fixture-secret"
    pattern = types.SimpleNamespace(
        HorizontalScrollPercent=0,
        VerticalScrollPercent=0,
        Scroll=lambda *_: True,
    )
    control = types.SimpleNamespace(GetPattern=lambda _pattern: pattern)
    monkeypatch.setattr(engine, "_resolve_element", lambda *_: ({"control": control, "metadata": {"index": 3}}, None))
    monkeypatch.setattr(worker, "InvariantMonitor", _Monitor)
    _fake_uia(monkeypatch, pattern_id=10004)

    params = {"element_ref": "#3", "direction": "diagonal", "amount": 1}
    invalid = engine.scroll("#3", "diagonal", 1, "snap_test", "task_test", _signed(engine, "scroll", params))
    assert invalid["ok"] is False
    assert "Unsupported scroll direction" in invalid["message"]

    params = {"element_ref": "#3", "direction": "down", "amount": 1}
    no_move = engine.scroll("#3", "down", 1, "snap_test", "task_test", _signed(engine, "scroll", params, nonce="nonce_012345678A"))
    assert no_move["ok"] is False
    assert no_move["meta"]["verified_movement"] is False


def test_host_authorization_is_bound_to_action_and_single_use():
    engine = worker.WindowsEngine()
    engine._physical_auth_secret = "fixture-secret"
    params = {"element_ref": "#4"}
    envelope = _signed(engine, "invoke", params)

    assert engine._verify_host_authorization("invoke", params, "snap_test", "task_test", envelope) == (True, "")
    assert engine._verify_host_authorization("invoke", params, "snap_test", "task_test", envelope)[0] is False
    assert engine._verify_host_authorization("set_value", params, "snap_test", "task_test", _signed(engine, "set_value", params, nonce="nonce_012345678A"))[0] is True


def test_emergency_stopped_worker_rejects_valid_signed_semantic_command():
    engine = worker.WindowsEngine()
    engine._physical_auth_secret = "fixture-secret"
    engine._emergency_stopped = True
    params = {"element_ref": 1}
    ok, error = engine._verify_host_authorization(
        "invoke", params, "snap_test", "task_test", _signed(engine, "invoke", params)
    )
    assert ok is False
    assert "emergency-stopped" in error


def test_request_dispatch_rejects_bad_json_shapes_and_contains_command_exception():
    engine = worker.WindowsEngine()
    assert worker.dispatch_worker_request(engine, []) == {
        "ok": False, "error": "Worker request must be a JSON object."
    }
    assert worker.dispatch_worker_request(engine, {"command": "ping", "args": []}) == {
        "ok": False, "error": "Worker request args must be a JSON object."
    }

    class RaisingEngine:
        ready = True

        def invoke(self, **_kwargs):
            raise RuntimeError("UIA fixture exception")

    result = worker.dispatch_worker_request(
        RaisingEngine(), {"command": "invoke", "args": {"element_ref": 1}}
    )
    assert result["ok"] is False
    assert result["action"] == "invoke"
    assert "UIA fixture exception" in result["error"]


def test_dispatch_does_not_execute_signed_action_after_emergency_stop():
    engine = worker.WindowsEngine()
    engine._physical_auth_secret = "fixture-secret"
    engine.ready = True
    engine._emergency_stopped = True
    params = {"element_ref": 1}
    result = worker.dispatch_worker_request(
        engine,
        {
            "command": "invoke",
            "args": {"element_ref": 1, "snapshot_id": "snap_test"},
            "run_id": "task_test",
            "host_authorization": _signed(engine, "invoke", params),
        },
    )
    assert result["ok"] is False
    assert "emergency-stopped" in result["message"]


def test_nonce_cache_fails_closed_at_capacity_without_evicting_fresh_replay_markers(monkeypatch):
    engine = worker.WindowsEngine()
    engine._physical_auth_secret = "fixture-secret"
    params = {"element_ref": 1}
    envelopes = []
    for index in range(1024):
        nonce = f"nonce_{index:010d}"
        envelope = _signed(engine, "invoke", params, nonce=nonce)
        envelopes.append(envelope)
        assert engine._verify_host_authorization("invoke", params, "snap_test", "task_test", envelope)[0] is True

    overflow = _signed(engine, "invoke", params, nonce="nonce_overflow0001")
    ok, error = engine._verify_host_authorization("invoke", params, "snap_test", "task_test", overflow)
    assert ok is False
    assert "cache is full" in error

    ok, error = engine._verify_host_authorization("invoke", params, "snap_test", "task_test", envelopes[0])
    assert ok is False
    assert "already been used" in error

    original_monotonic = time.monotonic
    monkeypatch.setattr(worker.time, "monotonic", lambda: original_monotonic() + engine.SNAPSHOT_TTL + 1)
    assert engine._verify_host_authorization("invoke", params, "snap_test", "task_test", overflow) == (True, "")


def test_resolve_element_reacquires_current_runtime_id_and_rechecks_geometry(monkeypatch):
    engine = worker.WindowsEngine()
    hwnd, pid = 444, 33
    rect = types.SimpleNamespace(left=10, top=20, width=lambda: 30, height=lambda: 40)
    current = types.SimpleNamespace(
        GetRuntimeId=lambda: [1, 2, 3], BoundingRectangle=rect,
        Name="Save", ControlTypeName="Button",
        AutomationId="save-button", ClassName="Button", FrameworkId="Fixture", NativeWindowHandle=444,
    )
    root = types.SimpleNamespace(Exists=lambda *_: True)
    auto = types.SimpleNamespace(
        ControlFromHandle=lambda _hwnd: root,
        WalkTree=lambda *_args, **_kwargs: [(current, 1, 0)],
    )
    monkeypatch.setitem(sys.modules, "uiautomation", auto)
    monkeypatch.setattr(worker.user32, "IsWindow", lambda _hwnd: True)

    def get_pid(_hwnd, out_pid):
        ctypes.cast(out_pid, ctypes.POINTER(worker.wintypes.DWORD)).contents.value = pid
        return 1

    monkeypatch.setattr(worker.user32, "GetWindowThreadProcessId", get_pid)
    monkeypatch.setattr(engine, "_get_process_creation_time", lambda _pid: 987)
    metadata = {
        "index": 1, "hwnd": hwnd, "pid": pid, "process_creation_time": 987,
        "runtime_id": [1, 2, 3], "bounds": [10, 20, 30, 40],
        "label": "Save", "role": "Button",
    }
    engine._snapshot_cache["snap_test"] = {
        "created_at_mono": time.monotonic(),
        "elements": {1: {"control": object(), "metadata": metadata}},
    }

    resolved, error = engine._resolve_element("#1", "snap_test")
    assert error is None
    assert resolved["control"] is current

    moved = types.SimpleNamespace(
        GetRuntimeId=lambda: [1, 2, 3],
        BoundingRectangle=types.SimpleNamespace(left=11, top=20, width=lambda: 30, height=lambda: 40),
        Name="Save", ControlTypeName="Button",
    )
    auto.WalkTree = lambda *_args, **_kwargs: [(moved, 1, 0)]
    resolved, error = engine._resolve_element("#1", "snap_test")
    assert resolved is None
    assert "geometry changed" in error

    reused = types.SimpleNamespace(
        GetRuntimeId=lambda: [1, 2, 3], BoundingRectangle=rect,
        Name="Save", ControlTypeName="Button",
        AutomationId="replacement-button", ClassName="Button", FrameworkId="Fixture", NativeWindowHandle=444,
    )
    metadata.update({
        "automationid": "save-button", "classname": "Button", "frameworkid": "Fixture",
        "nativewindowhandle": 444,
    })
    auto.WalkTree = lambda *_args, **_kwargs: [(reused, 1, 0)]
    resolved, error = engine._resolve_element("#1", "snap_test")
    assert resolved is None
    assert "UIA identity property automationid changed" in error


def test_snapshot_ttl_rejects_expired_snapshot():
    engine = worker.WindowsEngine()
    engine._snapshot_cache["snap_old"] = {
        "created_at_mono": time.monotonic() - engine.SNAPSHOT_TTL - 1,
        "elements": {1: {"control": object(), "metadata": {"index": 1}}},
    }
    entry, error = engine._resolve_element(1, "snap_old")
    assert entry is None
    assert "expired" in error


def test_capture_target_uses_only_target_window_and_ax_skips_framebuffer(monkeypatch):
    from PIL import Image

    hwnd = 444
    engine = worker.WindowsEngine()
    engine.dpi_initialized = True
    monkeypatch.setattr(engine, "list_windows", lambda: [{
        "hwnd": hwnd, "pid": 33, "process_creation_time": 99,
        "title": "fixture window", "class_name": "Fixture",
        "bounds": (10, 20, 100, 90),
    }])
    monkeypatch.setattr(worker.user32, "GetDpiForWindow", lambda _hwnd: 144)
    monkeypatch.setattr(worker.user32, "GetSystemMetrics", lambda metric: {
        worker.SM_XVIRTUALSCREEN: -100, worker.SM_YVIRTUALSCREEN: 0,
        worker.SM_CXVIRTUALSCREEN: 400, worker.SM_CYVIRTUALSCREEN: 200,
    }[metric])
    monkeypatch.setattr(worker.user32, "GetClientRect", lambda hwnd, rect: _get_client_rect(hwnd, rect, (0, 0, 80, 60)))
    monkeypatch.setattr(worker.user32, "ClientToScreen", lambda hwnd, point: _client_to_screen(hwnd, point, (20, 30)))
    monkeypatch.setattr(worker.user32, "GetWindowRect", lambda hwnd, rect: _get_window_rect(hwnd, rect, (10, 20, 100, 90)))
    grab_calls = []

    def grab(**kwargs):
        grab_calls.append(kwargs)
        return Image.new("RGB", (80, 60), "black")

    monkeypatch.setattr("PIL.ImageGrab.grab", grab)
    auto = types.SimpleNamespace(
        ControlFromHandle=lambda _hwnd: types.SimpleNamespace(Exists=lambda *_: True),
        WalkTree=lambda *_args, **_kwargs: [],
    )
    monkeypatch.setitem(sys.modules, "uiautomation", auto)

    captured = engine.capture(mode="vision", target_hwnd=hwnd)
    assert captured["ok"] is True
    assert grab_calls == [{"window": hwnd}]
    assert captured["origin"] == [20, 30]
    assert [captured["width"], captured["height"]] == [80, 60]
    assert captured["coordinate_space"] == "physical_virtual_screen_pixels"
    assert captured["coordinate_mapping"] == "absolute_screen = image_origin + image_local_pixel"
    assert captured["target_outer_bounds"] == [10, 20, 100, 90]
    assert captured["virtual_origin"] == [-100, 0]
    assert captured["virtual_dimensions"] == [400, 200]
    assert captured["capture_dpi"] == 144

    grab_calls.clear()
    ax = engine.capture(mode="ax", target_hwnd=hwnd)
    assert ax["ok"] is True
    assert ax["png_b64"] is None
    assert grab_calls == []

    snapshot_ids = [engine.capture(mode="ax", target_hwnd=hwnd)["snapshot_id"] for _ in range(7)]
    assert len(set(snapshot_ids)) == 7
    assert len(engine._snapshot_cache) == engine.MAX_SNAPSHOTS


def test_capture_failure_returns_no_synthetic_image(monkeypatch):
    hwnd = 444
    engine = worker.WindowsEngine()
    monkeypatch.setattr(engine, "list_windows", lambda: [{
        "hwnd": hwnd, "pid": 33, "process_creation_time": 99,
        "title": "fixture window", "class_name": "Fixture",
        "bounds": (10, 20, 100, 90),
    }])
    monkeypatch.setattr(worker.user32, "GetDpiForWindow", lambda _hwnd: 144)
    monkeypatch.setattr(worker.user32, "GetSystemMetrics", lambda metric: {
        worker.SM_XVIRTUALSCREEN: -100, worker.SM_YVIRTUALSCREEN: 0,
        worker.SM_CXVIRTUALSCREEN: 400, worker.SM_CYVIRTUALSCREEN: 200,
    }[metric])
    monkeypatch.setattr(worker.user32, "GetClientRect", lambda hwnd, rect: _get_client_rect(hwnd, rect, (0, 0, 80, 60)))
    monkeypatch.setattr(worker.user32, "ClientToScreen", lambda hwnd, point: _client_to_screen(hwnd, point, (20, 30)))
    monkeypatch.setattr(worker.user32, "GetWindowRect", lambda hwnd, rect: _get_window_rect(hwnd, rect, (10, 20, 100, 90)))
    monkeypatch.setattr("PIL.ImageGrab.grab", lambda **_kwargs: (_ for _ in ()).throw(OSError("fixture capture failure")))
    monkeypatch.setitem(sys.modules, "uiautomation", types.SimpleNamespace())

    result = engine.capture(mode="vision", target_hwnd=hwnd)
    assert result["ok"] is False
    assert "desktop_capture_unavailable" in result["error"]
    assert "png_b64" not in result


def test_target_ax_capture_omits_nonclient_controls_without_clipping_client_bounds(monkeypatch):
    hwnd = 444
    engine = worker.WindowsEngine()
    engine.dpi_initialized = True
    monkeypatch.setattr(engine, "list_windows", lambda: [{
        "hwnd": hwnd, "pid": 33, "process_creation_time": 99,
        "title": "fixture window", "class_name": "Fixture",
        "bounds": (1080, 421, 440, 190),
    }])
    monkeypatch.setattr(engine, "is_element_occluded_conservative", lambda *_: False)
    monkeypatch.setattr(worker.user32, "GetDpiForWindow", lambda _hwnd: 144)
    monkeypatch.setattr(worker.user32, "GetSystemMetrics", lambda metric: {
        worker.SM_XVIRTUALSCREEN: 0, worker.SM_YVIRTUALSCREEN: 0,
        worker.SM_CXVIRTUALSCREEN: 2000, worker.SM_CYVIRTUALSCREEN: 1000,
    }[metric])
    monkeypatch.setattr(worker.user32, "GetWindowRect", lambda hwnd, rect: _get_window_rect(hwnd, rect, (1080, 421, 440, 190)))
    monkeypatch.setattr(worker.user32, "GetClientRect", lambda hwnd, rect: _get_client_rect(hwnd, rect, (0, 0, 424, 151)))
    monkeypatch.setattr(worker.user32, "ClientToScreen", lambda hwnd, point: _client_to_screen(hwnd, point, (1092, 452)))

    class Rect:
        def __init__(self, left, top, width, height):
            self.left, self.top = left, top
            self._width, self._height = width, height

        def width(self):
            return self._width

        def height(self):
            return self._height

    def control(runtime_id, automation_id, rect):
        return types.SimpleNamespace(
            BoundingRectangle=rect, GetRuntimeId=lambda: [1, runtime_id],
            ControlTypeName="Button", Name=automation_id, AutomationId=automation_id,
            ClassName="Button", FrameworkId="Fixture", NativeWindowHandle=0,
            GetPattern=lambda _pattern: object(),
        )

    titlebar = control(1, "TitleBarControl", Rect(1092, 422, 170, 22))
    content = control(2, "OwnedInvoke", Rect(1092, 476, 170, 42))
    auto = types.SimpleNamespace(
        PatternId=types.SimpleNamespace(InvokePattern=1, ValuePattern=2, ScrollPattern=3),
        ControlFromHandle=lambda _hwnd: types.SimpleNamespace(Exists=lambda *_: True),
        WalkTree=lambda *_args, **_kwargs: [(titlebar, 1, 0), (content, 1, 0)],
    )
    monkeypatch.setitem(sys.modules, "uiautomation", auto)

    result = engine.capture(mode="ax", target_hwnd=hwnd)
    assert result["ok"] is True
    assert [element["label"] for element in result["elements"]] == ["OwnedInvoke"]
    assert result["elements"][0]["bounds"] == [1092, 476, 170, 42]
    assert result["elements"][0]["index"] == 1
    assert result["capture_region"] == "window_client"
    assert result["coordinate_mapping"] == "absolute_screen = image_origin + image_local_pixel"


def test_dpi_initialization_fails_closed_and_failed_desktop_assignment_closes_handle(monkeypatch):
    engine = worker.WindowsEngine()
    monkeypatch.setattr(worker.user32, "SetProcessDpiAwarenessContext", lambda _ctx: False)
    monkeypatch.setattr(worker.user32, "GetThreadDpiAwarenessContext", lambda: 123)
    monkeypatch.setattr(worker.user32, "AreDpiAwarenessContextsEqual", lambda *_: False)
    monkeypatch.setattr(worker.ctypes, "GetLastError", lambda: 5)
    ok, message = engine.initialize()
    assert ok is False
    assert engine.dpi_initialized is False
    assert "could not be verified" in message

    engine = worker.WindowsEngine()
    monkeypatch.setattr(worker.user32, "SetProcessDpiAwarenessContext", lambda _ctx: True)
    monkeypatch.setattr(worker.user32, "GetThreadDpiAwarenessContext", lambda: 123)
    monkeypatch.setattr(worker.user32, "AreDpiAwarenessContextsEqual", lambda *_: True)
    monkeypatch.setattr(worker.user32, "OpenInputDesktop", lambda *_: 789)
    monkeypatch.setattr(worker.user32, "SetThreadDesktop", lambda _handle: False)
    closed = []
    monkeypatch.setattr(worker.user32, "CloseDesktop", lambda handle: closed.append(handle) or True)
    monkeypatch.setattr(worker.ole32, "CoInitializeEx", lambda *_: 0)
    monkeypatch.setitem(sys.modules, "uiautomation", types.SimpleNamespace(GetRootControl=lambda: object()))
    ok, _message = engine.initialize()
    assert ok is True
    assert closed == [789]
    assert engine._input_desktop_handle is None


def test_process_handle_is_closed_after_creation_time_query(monkeypatch):
    engine = worker.WindowsEngine()
    monkeypatch.setattr(worker.kernel32, "OpenProcess", lambda *_: 234)

    def get_times(_handle, creation, _exit, _kernel, _user):
        ctypes.cast(creation, ctypes.POINTER(worker.FILETIME)).contents.dwLowDateTime = 0x1234
        ctypes.cast(creation, ctypes.POINTER(worker.FILETIME)).contents.dwHighDateTime = 0xABCD
        return True

    closed = []
    monkeypatch.setattr(worker.kernel32, "GetProcessTimes", get_times)
    monkeypatch.setattr(worker.kernel32, "CloseHandle", lambda handle: closed.append(handle) or True)
    assert engine._get_process_creation_time(33) == 0xABCD00001234
    assert closed == [234]


def test_physical_typing_sends_utf16_surrogate_pair_and_verifies_counts(monkeypatch):
    engine = worker.WindowsEngine()
    engine._physical_auth_secret = "fixture-secret"
    engine._snapshot_cache["snap_test"] = {
        "created_at_mono": time.monotonic(), "target_hwnd": 444, "target_pid": 33,
        "proc_creation_time": 987, "origin": [0, 0], "dimensions": [100, 100],
        "crop_bounds": [0, 0, 100, 100], "target_outer_bounds": [0, 0, 100, 100],
        "virtual_origin": [0, 0], "virtual_dimensions": [100, 100],
    }
    monkeypatch.setattr(engine, "_get_process_creation_time", lambda _pid: 987)
    monkeypatch.setattr(worker.user32, "IsWindow", lambda _hwnd: True)
    monkeypatch.setattr(worker.user32, "GetForegroundWindow", lambda: 444)
    monkeypatch.setattr(worker.user32, "GetWindowRect", _get_window_rect)
    monkeypatch.setattr(worker.user32, "GetClientRect", _get_client_rect)
    monkeypatch.setattr(worker.user32, "ClientToScreen", _client_to_screen)

    def get_pid(_hwnd, out_pid):
        ctypes.cast(out_pid, ctypes.POINTER(worker.wintypes.DWORD)).contents.value = 33
        return 1

    monkeypatch.setattr(worker.user32, "GetWindowThreadProcessId", get_pid)
    monkeypatch.setattr(worker.user32, "GetSystemMetrics", lambda metric: {
        worker.SM_XVIRTUALSCREEN: 0, worker.SM_YVIRTUALSCREEN: 0,
        worker.SM_CXVIRTUALSCREEN: 100, worker.SM_CYVIRTUALSCREEN: 100,
    }[metric])
    units = []

    def send_input(count, events, _size):
        units.extend((events[i].union.ki.wScan, events[i].union.ki.dwFlags) for i in range(count))
        return count

    monkeypatch.setattr(worker.user32, "SendInput", send_input)
    actions = [{"type": "type", "text": "😀"}]
    result = engine.physical_input(
        actions, "snap_test", run_id="task_test",
        host_authorization=_signed(engine, "physical_input", {"actions": actions}),
    )

    assert result["ok"] is True
    assert result["executed_count"] == 1
    assert [scan for scan, _flags in units] == [0xD83D, 0xD83D, 0xDE00, 0xDE00]
    assert [flags for _scan, flags in units] == [worker.KEYEVENTF_UNICODE, worker.KEYEVENTF_UNICODE | worker.KEYEVENTF_KEYUP] * 2


def test_partial_click_sendinput_releases_agent_mouse_button(monkeypatch):
    engine = worker.WindowsEngine()
    engine._physical_auth_secret = "fixture-secret"
    engine._snapshot_cache["snap_test"] = {
        "created_at_mono": time.monotonic(), "target_hwnd": 444, "target_pid": 33,
        "proc_creation_time": 987, "origin": [0, 0], "dimensions": [100, 100],
        "crop_bounds": [0, 0, 100, 100], "target_outer_bounds": [0, 0, 100, 100],
        "virtual_origin": [0, 0], "virtual_dimensions": [100, 100],
    }
    monkeypatch.setattr(engine, "_get_process_creation_time", lambda _pid: 987)
    monkeypatch.setattr(engine, "is_element_occluded_conservative", lambda *_: False)
    monkeypatch.setattr(worker.user32, "IsWindow", lambda _hwnd: True)
    monkeypatch.setattr(worker.user32, "WindowFromPoint", lambda _point: 444)
    monkeypatch.setattr(worker.user32, "GetParent", lambda _hwnd: 0)
    monkeypatch.setattr(worker.user32, "GetWindowRect", _get_window_rect)
    monkeypatch.setattr(worker.user32, "GetClientRect", _get_client_rect)
    monkeypatch.setattr(worker.user32, "ClientToScreen", _client_to_screen)

    def get_pid(_hwnd, out_pid):
        ctypes.cast(out_pid, ctypes.POINTER(worker.wintypes.DWORD)).contents.value = 33
        return 1

    monkeypatch.setattr(worker.user32, "GetWindowThreadProcessId", get_pid)
    monkeypatch.setattr(worker.user32, "GetSystemMetrics", lambda metric: {
        worker.SM_XVIRTUALSCREEN: 0, worker.SM_YVIRTUALSCREEN: 0,
        worker.SM_CXVIRTUALSCREEN: 100, worker.SM_CYVIRTUALSCREEN: 100,
    }[metric])
    calls = []

    def partial_send(count, events, _size):
        if count == 3:
            calls.append([events[i].union.mi.dwFlags for i in range(count)])
            return 2  # move + left down were accepted, left up was not
        event = ctypes.cast(events, ctypes.POINTER(worker.INPUT)).contents
        calls.append([event.union.mi.dwFlags])
        return 1

    monkeypatch.setattr(worker.user32, "SendInput", partial_send)
    actions = [{"type": "click", "x": 50, "y": 50}]
    result = engine.physical_input(
        actions, "snap_test", run_id="task_test",
        host_authorization=_signed(engine, "physical_input", {"actions": actions}),
    )

    assert result["ok"] is False
    assert calls == [[worker.MOUSEEVENTF_MOVE | worker.MOUSEEVENTF_ABSOLUTE | worker.MOUSEEVENTF_VIRTUALDESK,
                      worker.MOUSEEVENTF_LEFTDOWN, worker.MOUSEEVENTF_LEFTUP],
                     [worker.MOUSEEVENTF_LEFTUP]]
    assert "left" not in engine._agent_held_mouse_buttons


def test_right_click_uses_right_button_and_bad_later_step_sends_nothing(monkeypatch):
    engine = worker.WindowsEngine()
    engine._physical_auth_secret = "fixture-secret"
    engine._snapshot_cache["snap_test"] = {
        "created_at_mono": time.monotonic(), "target_hwnd": 444, "target_pid": 33,
        "proc_creation_time": 987, "origin": [0, 0], "dimensions": [100, 100],
        "crop_bounds": [0, 0, 100, 100], "target_outer_bounds": [0, 0, 100, 100],
        "virtual_origin": [0, 0], "virtual_dimensions": [100, 100],
    }
    monkeypatch.setattr(engine, "_get_process_creation_time", lambda _pid: 987)
    monkeypatch.setattr(engine, "is_element_occluded_conservative", lambda *_: False)
    monkeypatch.setattr(worker.user32, "IsWindow", lambda _hwnd: True)
    monkeypatch.setattr(worker.user32, "WindowFromPoint", lambda _point: 444)
    monkeypatch.setattr(worker.user32, "GetParent", lambda _hwnd: 0)
    monkeypatch.setattr(worker.user32, "GetWindowRect", _get_window_rect)
    monkeypatch.setattr(worker.user32, "GetClientRect", _get_client_rect)
    monkeypatch.setattr(worker.user32, "ClientToScreen", _client_to_screen)
    monkeypatch.setattr(worker.user32, "GetForegroundWindow", lambda: 444)

    def get_pid(_hwnd, out_pid):
        ctypes.cast(out_pid, ctypes.POINTER(worker.wintypes.DWORD)).contents.value = 33
        return 1

    monkeypatch.setattr(worker.user32, "GetWindowThreadProcessId", get_pid)
    monkeypatch.setattr(worker.user32, "GetSystemMetrics", lambda metric: {
        worker.SM_XVIRTUALSCREEN: 0, worker.SM_YVIRTUALSCREEN: 0,
        worker.SM_CXVIRTUALSCREEN: 100, worker.SM_CYVIRTUALSCREEN: 100,
    }[metric])
    calls = []

    def send_input(count, events, _size):
        calls.append([events[i].union.mi.dwFlags for i in range(count)])
        return count

    monkeypatch.setattr(worker.user32, "SendInput", send_input)
    right_click = [{"type": "click", "x": 50, "y": 50, "button": "right"}]
    result = engine.physical_input(
        right_click, "snap_test", run_id="task_test",
        host_authorization=_signed(engine, "physical_input", {"actions": right_click}),
    )
    assert result["ok"] is True
    assert calls[0] == [
        worker.MOUSEEVENTF_MOVE | worker.MOUSEEVENTF_ABSOLUTE | worker.MOUSEEVENTF_VIRTUALDESK,
        worker.MOUSEEVENTF_RIGHTDOWN,
        worker.MOUSEEVENTF_RIGHTUP,
    ]

    calls.clear()
    bad_sequence = [right_click[0], {"type": "unsupported"}]
    result = engine.physical_input(
        bad_sequence, "snap_test", run_id="task_test",
        host_authorization=_signed(engine, "physical_input", {"actions": bad_sequence}, nonce="nonce_012345678A"),
    )
    assert result["ok"] is False
    assert "Unsupported physical input action" in result["message"]
    assert calls == []


def test_targeted_crop_uses_global_desktop_geometry_and_rejects_moved_window(monkeypatch):
    engine = worker.WindowsEngine()
    engine._physical_auth_secret = "fixture-secret"
    engine._snapshot_cache["snap_test"] = {
        "created_at_mono": time.monotonic(), "target_hwnd": 444, "target_pid": 33,
        "proc_creation_time": 987, "origin": [20, 30], "dimensions": [80, 60],
        "target_outer_bounds": [10, 20, 100, 90],
        "crop_bounds": [20, 30, 80, 60], "virtual_origin": [-100, 0],
        "virtual_dimensions": [200, 120],
    }
    monkeypatch.setattr(engine, "_get_process_creation_time", lambda _pid: 987)
    monkeypatch.setattr(engine, "is_element_occluded_conservative", lambda *_: False)
    monkeypatch.setattr(worker.user32, "IsWindow", lambda _hwnd: True)
    monkeypatch.setattr(worker.user32, "WindowFromPoint", lambda _point: 444)
    monkeypatch.setattr(worker.user32, "GetParent", lambda _hwnd: 0)

    def get_pid(_hwnd, out_pid):
        ctypes.cast(out_pid, ctypes.POINTER(worker.wintypes.DWORD)).contents.value = 33
        return 1

    monkeypatch.setattr(worker.user32, "GetWindowThreadProcessId", get_pid)
    monkeypatch.setattr(worker.user32, "GetSystemMetrics", lambda metric: {
        worker.SM_XVIRTUALSCREEN: -100, worker.SM_YVIRTUALSCREEN: 0,
        worker.SM_CXVIRTUALSCREEN: 200, worker.SM_CYVIRTUALSCREEN: 120,
    }[metric])
    current_bounds = [10, 20, 100, 90]

    def get_rect(hwnd, out_rect):
        return _get_window_rect(hwnd, out_rect, tuple(current_bounds))

    monkeypatch.setattr(worker.user32, "GetWindowRect", get_rect)
    monkeypatch.setattr(worker.user32, "GetClientRect", lambda hwnd, rect: _get_client_rect(hwnd, rect, (0, 0, 80, 60)))
    monkeypatch.setattr(worker.user32, "ClientToScreen", lambda hwnd, point: _client_to_screen(hwnd, point, (20, 30)))
    calls = []

    def send_input(count, events, _size):
        calls.append([events[i] for i in range(count)])
        return count

    monkeypatch.setattr(worker.user32, "SendInput", send_input)
    actions = [{"type": "click", "x": 50, "y": 50}]
    accepted = engine.physical_input(
        actions, "snap_test", run_id="task_test",
        host_authorization=_signed(engine, "physical_input", {"actions": actions}),
    )
    assert accepted["ok"] is True
    assert calls[0][0].union.mi.dx == int(((50 - (-100)) * 65535) / 200)
    assert calls[0][0].union.mi.dy == int((50 * 65535) / 120)

    calls.clear()
    current_bounds[0] += 1
    moved = engine.physical_input(
        actions, "snap_test", run_id="task_test",
        host_authorization=_signed(engine, "physical_input", {"actions": actions}, nonce="nonce_012345678A"),
    )
    assert moved["ok"] is False
    assert "moved or resized" in moved["message"]
    assert calls == []


def test_physical_worker_rejects_caller_approval_id():
    engine = worker.WindowsEngine()
    result = engine.physical_input([], "snap_test", approval_id="caller-forged")
    assert result["ok"] is False
    assert "caller-supplied" in result["message"]
