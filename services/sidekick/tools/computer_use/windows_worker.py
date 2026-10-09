"""Out-of-process Windows Computer Use worker.

The host supervises the worker and owns its watchdog/termination policy. The
worker uses COM MTA and verifies Per-Monitor-V2 before it accepts UIA commands.
It performs real UIA patterns, retains bounded identity-checked snapshots, and
fails closed when framebuffer or control state cannot be verified. Its local
emergency-stop command can release tracked inputs while the command loop is
responsive; host-side termination can interrupt calls but cannot promise that
an already-dispatched UIA action has stopped inside the target application.
Commands use line-delimited JSON over the worker's private stdio channel.
"""

from __future__ import annotations

import base64
import ctypes
from collections import deque
import hashlib
import hmac
from ctypes import wintypes
import io
import json
import logging
import os
import secrets
import sys
# Configure comtypes / UIA to initialize in MTA mode (COINIT_MULTITHREADED = 0)
sys.coinit_flags = 0
import threading
import time
from typing import Any, Dict, List, Optional, Set, Tuple

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

logger = logging.getLogger("windows_worker")

# ---------------------------------------------------------------------------
# Win32 Structures and Function Prototypes (Explicit FFI)
# ---------------------------------------------------------------------------

user32 = ctypes.windll.user32
ole32 = ctypes.windll.ole32
kernel32 = ctypes.windll.kernel32

DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = ctypes.c_void_p(-4)

# Virtual screen metrics
SM_XVIRTUALSCREEN = 76
SM_YVIRTUALSCREEN = 77
SM_CXVIRTUALSCREEN = 78
SM_CYVIRTUALSCREEN = 79

# Mouse and Keyboard SendInput constants
INPUT_MOUSE = 0
INPUT_KEYBOARD = 1
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010  # Correct Win32 constant (was 0x000A)
MOUSEEVENTF_MIDDLEDOWN = 0x0020
MOUSEEVENTF_MIDDLEUP = 0x0040
MOUSEEVENTF_WHEEL = 0x0800
MOUSEEVENTF_VIRTUALDESK = 0x4000
MOUSEEVENTF_ABSOLUTE = 0x8000

KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004

VK_SHIFT = 0x10
VK_CONTROL = 0x11
VK_MENU = 0x12  # Alt
VK_LWIN = 0x5B

PROCESS_QUERY_LIMITED_INFORMATION = 0x1000

# Known control/action names likely to trigger modal dialogs in background mode
_KNOWN_DIALOG_TRIGGERS = {
    "open", "öffnen", "save as", "speichern unter", "print", "drucken",
    "browse", "durchsuchen", "settings", "einstellungen", "preferences",
    "options", "exit", "beenden", "about", "über"
}


class POINT(ctypes.Structure):
    _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG)]


class RECT(ctypes.Structure):
    _fields_ = [
        ("left", wintypes.LONG),
        ("top", wintypes.LONG),
        ("right", wintypes.LONG),
        ("bottom", wintypes.LONG),
    ]

    def to_tuple(self) -> Tuple[int, int, int, int]:
        return (self.left, self.top, self.right - self.left, self.bottom - self.top)


class FILETIME(ctypes.Structure):
    _fields_ = [
        ("dwLowDateTime", wintypes.DWORD),
        ("dwHighDateTime", wintypes.DWORD),
    ]

    def as_uint64(self) -> int:
        return (self.dwHighDateTime << 32) | self.dwLowDateTime


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.c_void_p),
    ]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.c_void_p),
    ]


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [
        ("uMsg", wintypes.DWORD),
        ("wParamL", wintypes.WORD),
        ("wParamH", wintypes.WORD),
    ]


class _INPUTunion(ctypes.Union):
    _fields_ = [
        ("mi", MOUSEINPUT),
        ("ki", KEYBDINPUT),
        ("hi", HARDWAREINPUT),
    ]


class INPUT(ctypes.Structure):
    _fields_ = [
        ("type", wintypes.DWORD),
        ("union", _INPUTunion),
    ]


# Setup explicit argtypes and restype on Win32 functions
user32.GetCursorPos.argtypes = [ctypes.POINTER(POINT)]
user32.GetCursorPos.restype = wintypes.BOOL

user32.SetCursorPos.argtypes = [ctypes.c_int, ctypes.c_int]
user32.SetCursorPos.restype = wintypes.BOOL

# WindowFromPoint takes POINT by value in 64-bit user32
user32.WindowFromPoint.argtypes = [POINT]
user32.WindowFromPoint.restype = wintypes.HWND

user32.GetForegroundWindow.argtypes = []
user32.GetForegroundWindow.restype = wintypes.HWND

user32.SetForegroundWindow.argtypes = [wintypes.HWND]
user32.SetForegroundWindow.restype = wintypes.BOOL

user32.IsWindow.argtypes = [wintypes.HWND]
user32.IsWindow.restype = wintypes.BOOL

user32.IsWindowVisible.argtypes = [wintypes.HWND]
user32.IsWindowVisible.restype = wintypes.BOOL

user32.IsIconic.argtypes = [wintypes.HWND]
user32.IsIconic.restype = wintypes.BOOL

user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(RECT)]
user32.GetWindowRect.restype = wintypes.BOOL
user32.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(RECT)]
user32.GetClientRect.restype = wintypes.BOOL
user32.ClientToScreen.argtypes = [wintypes.HWND, ctypes.POINTER(POINT)]
user32.ClientToScreen.restype = wintypes.BOOL

user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user32.GetWindowTextW.restype = ctypes.c_int

user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
user32.GetWindowTextLengthW.restype = ctypes.c_int

user32.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user32.GetClassNameW.restype = ctypes.c_int

user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
user32.GetWindowThreadProcessId.restype = wintypes.DWORD

user32.GetDpiForWindow.argtypes = [wintypes.HWND]
user32.GetDpiForWindow.restype = wintypes.UINT
user32.GetDpiForSystem.argtypes = []
user32.GetDpiForSystem.restype = wintypes.UINT

user32.GetParent.argtypes = [wintypes.HWND]
user32.GetParent.restype = wintypes.HWND

user32.SendInput.argtypes = [wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int]
user32.SendInput.restype = wintypes.UINT

user32.GetSystemMetrics.argtypes = [ctypes.c_int]
user32.GetSystemMetrics.restype = ctypes.c_int

kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
kernel32.OpenProcess.restype = wintypes.HANDLE

kernel32.GetProcessTimes.argtypes = [
    wintypes.HANDLE,
    ctypes.POINTER(FILETIME),
    ctypes.POINTER(FILETIME),
    ctypes.POINTER(FILETIME),
    ctypes.POINTER(FILETIME),
]
kernel32.GetProcessTimes.restype = wintypes.BOOL

kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
kernel32.CloseHandle.restype = wintypes.BOOL

ole32.CoInitializeEx.argtypes = [ctypes.c_void_p, wintypes.DWORD]
ole32.CoInitializeEx.restype = ctypes.c_long  # HRESULT is a signed 32-bit value; wintypes has no HRESULT on all Python builds.

ole32.CoUninitialize.argtypes = []
ole32.CoUninitialize.restype = None


# ---------------------------------------------------------------------------
# Continuous Invariant Monitor
# ---------------------------------------------------------------------------

class InvariantMonitor:
    """Monitors mouse cursor position and foreground window during actions."""

    def __init__(self, sample_interval: float = 0.02):
        self.interval = sample_interval
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

        self.initial_cursor: Tuple[int, int] = (0, 0)
        self.initial_foreground: int = 0
        self.cursor_moved: bool = False
        self.foreground_changed: bool = False
        self.final_foreground: int = 0
        self.max_cursor_delta: float = 0.0

    def start(self):
        pt = POINT()
        user32.GetCursorPos(ctypes.byref(pt))
        self.initial_cursor = (pt.x, pt.y)
        self.initial_foreground = user32.GetForegroundWindow()
        self.final_foreground = self.initial_foreground
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self):
        pt = POINT()
        while not self._stop_event.is_set():
            user32.GetCursorPos(ctypes.byref(pt))
            dx = pt.x - self.initial_cursor[0]
            dy = pt.y - self.initial_cursor[1]
            dist = (dx * dx + dy * dy) ** 0.5
            if dist > self.max_cursor_delta:
                self.max_cursor_delta = dist
            if dist > 2.0:
                self.cursor_moved = True

            fg = user32.GetForegroundWindow()
            if fg != self.initial_foreground:
                self.foreground_changed = True
                self.final_foreground = fg
            time.sleep(self.interval)

    def stop(self) -> Dict[str, Any]:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=0.2)
        fg = user32.GetForegroundWindow()
        if fg != self.initial_foreground:
            self.foreground_changed = True
            self.final_foreground = fg

        return {
            "cursor_moved": self.cursor_moved,
            "max_cursor_delta": round(self.max_cursor_delta, 1),
            "foreground_changed": self.foreground_changed,
            "initial_foreground": self.initial_foreground,
            "final_foreground": self.final_foreground,
        }


# ---------------------------------------------------------------------------
# Windows Automation Core Engine
# ---------------------------------------------------------------------------

class WindowsEngine:
    """Core automation engine running within the worker process."""

    SNAPSHOT_TTL = 30.0  # seconds
    MAX_SNAPSHOTS = 5

    def __init__(self):
        self.dpi_initialized = False
        self.com_initialized = False
        self._snapshot_cache: Dict[str, Dict[str, Any]] = {}
        self._cache_lock = threading.Lock()
        self._emergency_stopped = False
        self.ready = False
        # SetThreadDesktop requires this handle to stay open for the lifetime of
        # the thread using it. Keep a strong reference instead of leaking it.
        self._input_desktop_handle = None
        self._physical_auth_secret = os.environ.get("LASTBROWSER_COMPUTER_USE_WORKER_AUTH", "")
        self._used_auth_nonces: Dict[str, float] = {}
        self._auth_nonce_order = deque()

        # Input tracking: track only keys and mouse buttons physically pressed by the agent
        self._agent_held_keys: Set[int] = set()
        self._agent_held_mouse_buttons: Set[str] = set()
        self.uia_initialized = False
        self.initialization_error = ""

    def initialize(self) -> Tuple[bool, str]:
        """Perform one-time initialization of Per-Monitor-V2 DPI and COM MTA."""
        # 1. Per-Monitor-V2 DPI Awareness
        try:
            user32.SetProcessDpiAwarenessContext.argtypes = [ctypes.c_void_p]
            user32.SetProcessDpiAwarenessContext.restype = wintypes.BOOL
            user32.GetThreadDpiAwarenessContext.argtypes = []
            user32.GetThreadDpiAwarenessContext.restype = ctypes.c_void_p
            user32.AreDpiAwarenessContextsEqual.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
            user32.AreDpiAwarenessContextsEqual.restype = wintypes.BOOL
            res = user32.SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)
            current = user32.GetThreadDpiAwarenessContext()
            self.dpi_initialized = bool(
                current and user32.AreDpiAwarenessContextsEqual(
                    current, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
                )
            )
            if not self.dpi_initialized:
                err = ctypes.GetLastError()
                return False, f"Per-Monitor-V2 DPI awareness could not be verified (SetProcess result={res}, error={err})."
        except Exception as e:
            return False, f"Failed to initialize Per-Monitor-V2 DPI: {e}"

        # 2. Attach thread to Input Desktop if not already on an isolated/dedicated desktop
        try:
            user32.OpenInputDesktop.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
            user32.OpenInputDesktop.restype = wintypes.HANDLE
            user32.SetThreadDesktop.argtypes = [wintypes.HANDLE]
            user32.SetThreadDesktop.restype = wintypes.BOOL
            user32.CloseDesktop.argtypes = [wintypes.HANDLE]
            user32.CloseDesktop.restype = wintypes.BOOL
            user32.GetThreadDesktop.argtypes = [wintypes.DWORD]
            user32.GetThreadDesktop.restype = wintypes.HANDLE
            user32.GetUserObjectInformationW.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD)]
            user32.GetUserObjectInformationW.restype = wintypes.BOOL

            curr_desk = user32.GetThreadDesktop(kernel32.GetCurrentThreadId())
            curr_name = ""
            if curr_desk:
                buf = ctypes.create_unicode_buffer(256)
                needed = wintypes.DWORD()
                if user32.GetUserObjectInformationW(curr_desk, 2, buf, 512, ctypes.byref(needed)):
                    curr_name = buf.value.lower()

            # Preserve current thread desktop when running on a dedicated or sandbox desktop (e.g. exebox-*)
            if not curr_name or curr_name == "default":
                hdesk = user32.OpenInputDesktop(0, False, 0x01FF)
                if hdesk:
                    if user32.SetThreadDesktop(hdesk):
                        self._input_desktop_handle = hdesk
                    else:
                        user32.CloseDesktop(hdesk)
                        logger.debug("SetThreadDesktop failed; continuing on current desktop")
            else:
                logger.debug("Running on dedicated desktop %r; preserving thread desktop", curr_name)
        except Exception as e:
            logger.debug("OpenInputDesktop error (non-fatal): %s", e)

        # 3. COM MTA Initialized
        try:
            hr = ole32.CoInitializeEx(None, 0)  # COINIT_MULTITHREADED = 0
            if hr in (0, 1):  # S_OK (0) or S_FALSE (1)
                self.com_initialized = True
            else:
                return False, f"CoInitializeEx failed with HRESULT 0x{hr:08X}"
        except Exception as e:
            return False, f"Failed to initialize COM MTA: {e}"

        # 4. Verify UIA availability
        try:
            import uiautomation as auto
            root = auto.GetRootControl()
            if not root:
                self.initialization_error = "Failed to get UIA RootControl"
                return False, "Failed to get UIA RootControl"
        except Exception as e:
            self.initialization_error = f"UIA initialization failed: {e}"
            return False, f"UIA initialization failed: {e}"

        self.uia_initialized = True
        self.ready = bool(self.dpi_initialized and self.com_initialized and self.uia_initialized)
        return True, "Initialized Windows Automation Engine (DPI V2 + COM MTA + UIA active)"

    def _get_process_creation_time(self, pid: int) -> int:
        """Retrieve 64-bit creation time of process to detect PID recycling."""
        hproc = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if not hproc:
            return 0
        try:
            ct = FILETIME()
            et = FILETIME()
            kt = FILETIME()
            ut = FILETIME()
            if kernel32.GetProcessTimes(hproc, ctypes.byref(ct), ctypes.byref(et), ctypes.byref(kt), ctypes.byref(ut)):
                return ct.as_uint64()
        finally:
            kernel32.CloseHandle(hproc)
        return 0

    def _verify_host_authorization(
        self,
        action: str,
        parameters: Dict[str, Any],
        snapshot_id: str,
        run_id: str,
        authorization: Any,
    ) -> Tuple[bool, str]:
        """Verify one host-signed command and reject replayed nonces."""
        if self._emergency_stopped:
            return False, "Worker is emergency-stopped; restart it before issuing another command."
        if not self._physical_auth_secret or not run_id or not snapshot_id:
            return False, "Host authorization context is missing."
        if not isinstance(authorization, dict):
            return False, "Host authorization envelope is missing."
        nonce = authorization.get("nonce")
        mac = authorization.get("mac")
        if not isinstance(nonce, str) or not (16 <= len(nonce) <= 128):
            return False, "Host authorization nonce is invalid."
        if not isinstance(mac, str) or len(mac) != 64:
            return False, "Host authorization MAC is invalid."
        try:
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
        except (TypeError, ValueError) as exc:
            return False, f"Host authorization parameters are invalid: {exc}"
        expected = hmac.new(self._physical_auth_secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, mac):
            return False, "Host authorization did not match this command."
        with self._cache_lock:
            now = time.monotonic()
            # Keep every accepted nonce for at least the lifetime of any
            # snapshot it can authorize. Never evict a fresh replay marker to
            # make room: saturation fails closed until old entries expire.
            while self._auth_nonce_order:
                oldest = self._auth_nonce_order[0]
                accepted_at = self._used_auth_nonces.get(oldest)
                if accepted_at is None:
                    self._auth_nonce_order.popleft()
                    continue
                if now - accepted_at <= self.SNAPSHOT_TTL:
                    break
                self._auth_nonce_order.popleft()
                self._used_auth_nonces.pop(oldest, None)
            if nonce in self._used_auth_nonces:
                return False, "Host authorization nonce has already been used."
            if len(self._used_auth_nonces) >= 1024:
                return False, "Host authorization nonce cache is full; retry after recent entries expire."
            self._used_auth_nonces[nonce] = now
            self._auth_nonce_order.append(nonce)
        return True, ""

    def emergency_stop(self) -> Dict[str, Any]:
        """Abort execution and release only inputs this worker knows it held."""
        t0 = time.perf_counter()
        self._emergency_stopped = True
        released = []
        release_failures = []

        # Release agent-held mouse buttons
        if self._agent_held_mouse_buttons:
            mouse_inputs = []
            for btn in list(self._agent_held_mouse_buttons):
                inp = INPUT()
                inp.type = INPUT_MOUSE
                if btn == "left":
                    inp.union.mi.dwFlags = MOUSEEVENTF_LEFTUP
                elif btn == "right":
                    inp.union.mi.dwFlags = MOUSEEVENTF_RIGHTUP
                elif btn == "middle":
                    inp.union.mi.dwFlags = MOUSEEVENTF_MIDDLEUP
                mouse_inputs.append(inp)
                released.append(f"mouse_{btn}")

            if mouse_inputs:
                inp_arr = (INPUT * len(mouse_inputs))(*mouse_inputs)
                sent = user32.SendInput(len(mouse_inputs), inp_arr, ctypes.sizeof(INPUT))
                if sent == len(mouse_inputs):
                    self._agent_held_mouse_buttons.clear()
                else:
                    release_failures.append(f"mouse release sent {sent}/{len(mouse_inputs)}")

        # Release agent-held keyboard keys
        if self._agent_held_keys:
            key_inputs = []
            for vk in list(self._agent_held_keys):
                inp = INPUT()
                inp.type = INPUT_KEYBOARD
                inp.union.ki.wVk = vk
                inp.union.ki.dwFlags = KEYEVENTF_KEYUP
                key_inputs.append(inp)
                released.append(f"key_0x{vk:02X}")

            if key_inputs:
                inp_arr = (INPUT * len(key_inputs))(*key_inputs)
                sent = user32.SendInput(len(key_inputs), inp_arr, ctypes.sizeof(INPUT))
                if sent == len(key_inputs):
                    self._agent_held_keys.clear()
                else:
                    release_failures.append(f"key release sent {sent}/{len(key_inputs)}")

        with self._cache_lock:
            self._snapshot_cache.clear()

        input_halt_ms = (time.perf_counter() - t0) * 1000

        return {
            "ok": not release_failures,
            "action": "emergency_stop",
            "released": list(set(released)),
            "input_halt_ms": round(input_halt_ms, 2),
            "release_failures": release_failures,
            "message": f"Emergency stop executed: inputs released in {input_halt_ms:.2f}ms.",
        }

    @staticmethod
    def _control_runtime_id(control: Any) -> Tuple[int, ...]:
        try:
            value = control.GetRuntimeId()
            if value:
                return tuple(int(part) for part in value)
        except Exception:
            pass
        return ()

    @staticmethod
    def _control_bounds(control: Any) -> Optional[Tuple[int, int, int, int]]:
        try:
            rect = control.BoundingRectangle
            if not rect:
                return None
            return (int(rect.left), int(rect.top), int(rect.width()), int(rect.height()))
        except Exception:
            return None

    @staticmethod
    def _control_identity_properties(control: Any) -> Dict[str, Any]:
        """Capture stable UIA identifiers to distinguish reused RuntimeIds when possible."""
        result = {}
        for property_name in ("AutomationId", "ClassName", "FrameworkId", "NativeWindowHandle"):
            try:
                value = getattr(control, property_name)
                result[property_name.lower()] = int(value) if property_name == "NativeWindowHandle" else str(value or "")
            except Exception:
                result[property_name.lower()] = None
        return result

    @staticmethod
    def _window_outer_bounds(hwnd: int) -> Optional[List[int]]:
        rect = RECT()
        if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
            return None
        return list(rect.to_tuple())

    @staticmethod
    def _window_client_screen_bounds(hwnd: int) -> Optional[List[int]]:
        rect = RECT()
        origin = POINT(0, 0)
        if not user32.GetClientRect(hwnd, ctypes.byref(rect)):
            return None
        if not user32.ClientToScreen(hwnd, ctypes.byref(origin)):
            return None
        width, height = rect.right - rect.left, rect.bottom - rect.top
        if width <= 0 or height <= 0:
            return None
        return [origin.x, origin.y, width, height]

    def list_windows(self) -> List[Dict[str, Any]]:
        """List running top-level windows with title, class, HWND, PID, and process creation time."""
        windows = []
        seen_hwnds: Set[int] = set()

        def enum_proc(hwnd, lparam):
            if hwnd in seen_hwnds:
                return 1
            seen_hwnds.add(hwnd)
            if not user32.IsWindowVisible(hwnd) or user32.IsIconic(hwnd):
                return 1
            length = user32.GetWindowTextLengthW(hwnd)
            if length == 0:
                return 1

            buf = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buf, length + 1)
            title = buf.value.strip()

            rect = RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(rect))
            if rect.left <= -10000 or rect.top <= -10000 or (rect.right - rect.left) <= 10 or (rect.bottom - rect.top) <= 10:
                return 1

            class_buf = ctypes.create_unicode_buffer(256)
            user32.GetClassNameW(hwnd, class_buf, 256)
            class_name = class_buf.value

            pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            proc_time = self._get_process_creation_time(pid.value)

            windows.append({
                "hwnd": hwnd,
                "pid": pid.value,
                "process_creation_time": proc_time,
                "title": title,
                "class_name": class_name,
                "bounds": rect.to_tuple(),
            })
            return 1

        enum_proc_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        cb = enum_proc_type(enum_proc)
        user32.EnumWindows(cb, 0)
        hdesk = user32.OpenInputDesktop(0, False, 0x01FF)
        if hdesk:
            try:
                user32.EnumDesktopWindows(hdesk, cb, 0)
            finally:
                user32.CloseDesktop(hdesk)
        return windows

    def is_element_occluded_conservative(self, bounds: Tuple[int, int, int, int], target_hwnd: int) -> bool:
        """Conservative 5-point Z-order occlusion test.
        If center or fewer than 4 of 5 sample points match the target window hierarchy,
        treat element as occluded (omit badge).
        """
        x, y, w, h = bounds
        if w <= 0 or h <= 0:
            return True

        points = [
            (x + w // 2, y + h // 2),  # center
            (x + min(5, w // 4), y + min(5, h // 4)),  # top-left
            (x + w - min(5, w // 4), y + min(5, h // 4)),  # top-right
            (x + min(5, w // 4), y + h - min(5, h // 4)),  # bottom-left
            (x + w - min(5, w // 4), y + h - min(5, h // 4)),  # bottom-right
        ]

        def point_belongs(px: int, py: int) -> bool:
            pt = POINT(px, py)
            h_at = user32.WindowFromPoint(pt)
            if not h_at:
                return False
            curr = h_at
            while curr:
                if curr == target_hwnd:
                    return True
                curr = user32.GetParent(curr)
            return False

        # Center must be visible
        if not point_belongs(points[0][0], points[0][1]):
            return True

        visible_count = sum(1 for px, py in points if point_belongs(px, py))
        return visible_count < 4

    def capture(
        self,
        mode: str = "som",
        target_hwnd: Optional[int] = None,
        max_elements: int = 50,
    ) -> Dict[str, Any]:
        """Capture screen and build UIA Set-of-Marks. Fail-closed: No fake synthetic images."""
        import uiautomation as auto

        if mode not in {"som", "vision", "ax", "raw"}:
            return {"ok": False, "error": f"Unsupported capture mode: {mode!r}; use som, vision, or ax."}
        try:
            max_elements = max(1, min(int(max_elements), 100))
        except (TypeError, ValueError):
            max_elements = 50

        raw_windows = self.list_windows()

        virtual_x = user32.GetSystemMetrics(SM_XVIRTUALSCREEN)
        virtual_y = user32.GetSystemMetrics(SM_YVIRTUALSCREEN)
        virtual_width = user32.GetSystemMetrics(SM_CXVIRTUALSCREEN)
        virtual_height = user32.GetSystemMetrics(SM_CYVIRTUALSCREEN)
        if virtual_width <= 0 or virtual_height <= 0:
            return {"ok": False, "error": "desktop_geometry_unavailable: Virtual desktop geometry could not be verified."}

        # Determine target window
        target_info = None
        if target_hwnd:
            for w in raw_windows:
                if w["hwnd"] == target_hwnd:
                    target_info = w
                    break
            if target_info is None:
                return {"ok": False, "error": "target_window_unavailable: Requested HWND is not a live capturable top-level window."}

        capture_dpi = (
            user32.GetDpiForWindow(target_info["hwnd"])
            if target_info else user32.GetDpiForSystem()
        )

        if target_info:
            outer_bounds = self._window_outer_bounds(target_info["hwnd"])
            client_bounds = self._window_client_screen_bounds(target_info["hwnd"])
            if outer_bounds is None or client_bounds is None:
                return {"ok": False, "error": "target_window_unavailable: Target client and outer geometry could not be verified."}
            if outer_bounds != list(target_info["bounds"]):
                return {"ok": False, "error": "capture_geometry_changed: Target window moved during capture setup."}
            vx, vy, vw, vh = client_bounds
            bbox = None
        else:
            outer_bounds = None
            vx, vy, vw, vh = virtual_x, virtual_y, virtual_width, virtual_height
            bbox = (vx, vy, vx + vw, vy + vh) if vw > 0 and vh > 0 else None

        img = None
        if mode != "ax":
            from PIL import ImageDraw, ImageGrab
            try:
                if target_info:
                    img = ImageGrab.grab(window=int(target_info["hwnd"]))
                else:
                    img = ImageGrab.grab(bbox=bbox, all_screens=True) if bbox else ImageGrab.grab()
            except Exception as e:
                return {"ok": False, "error": f"desktop_capture_unavailable: Unable to capture requested frame ({e})."}

            if img is None:
                return {"ok": False, "error": "desktop_capture_unavailable: Screen capture returned None (session locked or headless)."}
            if tuple(img.size) != (vw, vh):
                return {
                    "ok": False,
                    "error": f"desktop_capture_unavailable: Captured size {img.size} does not match requested geometry {(vw, vh)}.",
                }
            if (
                self._window_outer_bounds(target_info["hwnd"]) != outer_bounds
                or self._window_client_screen_bounds(target_info["hwnd"]) != [vx, vy, vw, vh]
            ):
                return {"ok": False, "error": "capture_geometry_changed: Target window moved while its frame was captured."}

        snapshot_id = f"snap_{secrets.token_urlsafe(18)}"
        elements: List[Dict[str, Any]] = []
        element_cache: Dict[int, Any] = {}
        overlay_img = img.copy() if img is not None and mode == "som" else None
        draw = ImageDraw.Draw(overlay_img) if overlay_img is not None else None

        idx = 1
        # Traverse windows and extract real UIA interactive controls
        windows_to_inspect = [target_info] if target_info else raw_windows[:10]

        for win in windows_to_inspect:
            if not win or idx > max_elements:
                break
            w_hwnd = win["hwnd"]

            try:
                window_ctrl = auto.ControlFromHandle(w_hwnd)
                if not window_ctrl.Exists(0, 0):
                    continue
            except Exception:
                continue

            # Walk UIA Tree up to depth 3
            try:
                tree_items = auto.WalkTree(window_ctrl, getChildren=lambda c: c.GetChildren(), maxDepth=3)
            except Exception:
                tree_items = []

            for item in tree_items:
                if idx > max_elements:
                    break
                c = item[0]
                try:
                    rect = c.BoundingRectangle
                    if not rect or rect.width() <= 4 or rect.height() <= 4:
                        continue
                    bounds = (rect.left, rect.top, rect.width(), rect.height())
                except Exception:
                    continue

                if target_info:
                    # A window capture contains only client pixels. Keep real
                    # UIA bounds and IDs unchanged, but omit non-client controls
                    # that are not represented in that image (e.g. title bar).
                    if (
                        bounds[0] < vx or bounds[1] < vy
                        or bounds[0] + bounds[2] > vx + vw
                        or bounds[1] + bounds[3] > vy + vh
                    ):
                        continue

                # Conservative Z-Order Occlusion Check
                if self.is_element_occluded_conservative(bounds, w_hwnd):
                    continue

                # Query real UIA patterns
                try:
                    inv = c.GetPattern(auto.PatternId.InvokePattern) is not None
                    val = c.GetPattern(auto.PatternId.ValuePattern) is not None
                    scr = c.GetPattern(auto.PatternId.ScrollPattern) is not None
                except Exception:
                    inv = val = scr = False

                # Only include interactive elements that support at least one pattern or are standard controls
                if not (inv or val or scr):
                    continue

                runtime_id = self._control_runtime_id(c)
                if not runtime_id:
                    # Without UIA identity, a later action cannot safely
                    # distinguish this control from a replacement in the same HWND.
                    continue

                elem_data = {
                    "index": idx,
                    "role": c.ControlTypeName,
                    "label": c.Name or "",
                    "bounds": list(bounds),
                    "hwnd": w_hwnd,
                    "pid": win["pid"],
                    "process_creation_time": win.get("process_creation_time", 0),
                    "runtime_id": list(runtime_id),
                    **self._control_identity_properties(c),
                    "patterns": {"invoke": inv, "value": val, "scroll": scr},
                }
                elements.append(elem_data)
                element_cache[idx] = {
                    "control": c,
                    "metadata": elem_data,
                }

                # Draw SOM overlay
                ix = bounds[0] - vx
                iy = bounds[1] - vy
                if draw is not None:
                    draw.rectangle([ix, iy, ix + bounds[2], iy + bounds[3]], outline=(0, 229, 255), width=2)
                badge_text = f" #{idx} "
                if draw is not None:
                    bbox_badge = draw.textbbox((ix, iy), badge_text)
                    draw.rectangle(bbox_badge, fill=(0, 229, 255))
                    draw.text((ix, iy), badge_text, fill=(0, 0, 0))
                idx += 1

        if target_info and (
            self._window_outer_bounds(target_info["hwnd"]) != outer_bounds
            or self._window_client_screen_bounds(target_info["hwnd"]) != [vx, vy, vw, vh]
        ):
            return {"ok": False, "error": "capture_geometry_changed: Target window moved while UIA controls were enumerated."}

        png_b64 = None
        if img is not None:
            buf = io.BytesIO()
            (overlay_img if mode == "som" else img).save(buf, format="PNG")
            png_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

        # Cache snapshot with LRU eviction and monotone creation time
        with self._cache_lock:
            if len(self._snapshot_cache) >= self.MAX_SNAPSHOTS:
                # Remove oldest
                oldest_key = min(self._snapshot_cache.keys(), key=lambda k: self._snapshot_cache[k]["created_at_mono"])
                del self._snapshot_cache[oldest_key]

            self._snapshot_cache[snapshot_id] = {
                "created_at_mono": time.monotonic(),
                "target_hwnd": target_hwnd,
                "target_pid": target_info["pid"] if target_info else 0,
                "proc_creation_time": target_info.get("process_creation_time", 0) if target_info else 0,
                "elements": element_cache,
                "origin": [vx, vy],
                "dimensions": [vw, vh],
                "crop_bounds": [vx, vy, vw, vh],
                "target_outer_bounds": outer_bounds,
                "virtual_origin": [virtual_x, virtual_y],
                "virtual_dimensions": [virtual_width, virtual_height],
            }

        return {
            "ok": True,
            "snapshot_id": snapshot_id,
            "width": vw,
            "height": vh,
            "origin": [vx, vy],
            "capture_dpi": int(capture_dpi) if capture_dpi else 0,
            "dpi_awareness_verified": self.dpi_initialized,
            "coordinate_space": "physical_virtual_screen_pixels",
            "coordinate_mapping": "absolute_screen = image_origin + image_local_pixel",
            "capture_region": "window_client" if target_info else "virtual_desktop",
            "target_outer_bounds": outer_bounds,
            "virtual_origin": [virtual_x, virtual_y],
            "virtual_dimensions": [virtual_width, virtual_height],
            "virtual_geometry": {"origin": [virtual_x, virtual_y], "dimensions": [virtual_width, virtual_height]},
            "png_b64": png_b64,
            "elements": elements,
            "target_app": target_info["title"] if target_info else "",
        }

    def _resolve_element(self, element_ref: Any, snapshot_id: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        """Validate snapshot identity and reacquire the exact current UIA control."""
        with self._cache_lock:
            snap = self._snapshot_cache.get(snapshot_id)

        if not snap:
            return None, f"Snapshot '{snapshot_id}' expired or not found. Please capture a fresh snapshot."

        # Monotone TTL check
        age = time.monotonic() - snap["created_at_mono"]
        if age > self.SNAPSHOT_TTL:
            return None, f"Snapshot '{snapshot_id}' expired ({age:.1f}s > {self.SNAPSHOT_TTL}s TTL). Capture required."

        # Parse index
        try:
            if isinstance(element_ref, str) and element_ref.startswith("#"):
                elem_idx = int(element_ref[1:])
            elif isinstance(element_ref, str) and element_ref.startswith("@e"):
                elem_idx = int(element_ref[2:])
            else:
                elem_idx = int(element_ref)
        except ValueError:
            return None, f"Invalid element reference: '{element_ref}'"

        entry = snap["elements"].get(elem_idx)
        if not entry:
            return None, f"Element #{elem_idx} not found in snapshot '{snapshot_id}'."

        meta = entry["metadata"]
        hwnd = meta.get("hwnd")
        pid = meta.get("pid")
        orig_proc_time = meta.get("process_creation_time")
        runtime_id = tuple(meta.get("runtime_id") or ())

        # Validate process & window continuity
        if not hwnd or not user32.IsWindow(hwnd):
            return None, f"Target window for element #{elem_idx} was closed."

        if not pid or not orig_proc_time:
            return None, f"Snapshot '{snapshot_id}' lacks a verified process identity. Capture again."
        curr_pid = wintypes.DWORD()
        if not user32.GetWindowThreadProcessId(hwnd, ctypes.byref(curr_pid)) or curr_pid.value != pid:
            return None, f"Target process changed (was PID {pid}, now {curr_pid.value})."

        curr_proc_time = self._get_process_creation_time(pid)
        if not curr_proc_time or curr_proc_time != orig_proc_time:
            return None, f"Target application process was restarted or could not be verified since snapshot '{snapshot_id}'."

        if not runtime_id:
            return None, f"Element #{elem_idx} has no stable UIA runtime identity. Capture again."

        try:
            import uiautomation as auto
            root = auto.ControlFromHandle(hwnd)
            if not root or not root.Exists(0, 0):
                return None, f"Target window for element #{elem_idx} is no longer available to UIA."
            matches = []
            for node_index, item in enumerate(
                auto.WalkTree(root, getChildren=lambda c: c.GetChildren(), maxDepth=8)
            ):
                if node_index >= 2000:
                    return None, f"Target UIA tree exceeded the safe reacquisition limit for element #{elem_idx}."
                control = item[0]
                if self._control_runtime_id(control) == runtime_id:
                    matches.append(control)
                    if len(matches) > 1:
                        break
            if len(matches) != 1:
                return None, f"Element #{elem_idx} could not be uniquely reacquired in the current UIA tree."
            current = matches[0]
            if self._control_bounds(current) != tuple(meta.get("bounds") or ()):
                return None, f"Element #{elem_idx} geometry changed since snapshot '{snapshot_id}'. Capture again."
            if (current.Name or "") != (meta.get("label") or "") or current.ControlTypeName != meta.get("role"):
                return None, f"Element #{elem_idx} identity changed since snapshot '{snapshot_id}'. Capture again."
            current_identity = self._control_identity_properties(current)
            for property_name, value in current_identity.items():
                if property_name in meta and meta[property_name] != value:
                    return None, f"Element #{elem_idx} UIA identity property {property_name} changed since snapshot '{snapshot_id}'. Capture again."
            return {"control": current, "metadata": meta}, None
        except Exception as exc:
            return None, f"Element #{elem_idx} could not be safely reacquired: {exc}"

    def invoke(self, element_ref: Any, snapshot_id: str, run_id: str = "", host_authorization: Any = None) -> Dict[str, Any]:
        """Real UIA InvokePattern execution. Fails cleanly if pattern unsupported."""
        authorized, auth_error = self._verify_host_authorization(
            "invoke", {"element_ref": element_ref}, snapshot_id, run_id, host_authorization
        )
        if not authorized:
            return {"ok": False, "action": "invoke", "message": f"Invoke rejected: {auth_error}"}
        import uiautomation as auto

        entry, err = self._resolve_element(element_ref, snapshot_id)
        if err:
            return {"ok": False, "action": "invoke", "message": err}

        ctrl = entry["control"]
        meta = entry["metadata"]

        # Pre-check dialog triggers in background mode
        lbl = (meta.get("label") or "").lower()
        for trigger in _KNOWN_DIALOG_TRIGGERS:
            if trigger in lbl:
                return {
                    "ok": False,
                    "action": "invoke",
                    "requires_foreground": True,
                    "message": f"Action on '{meta.get('label')}' is known to trigger modal dialogs. Refusing in background mode.",
                }

        # Real UIA Pattern acquisition
        inv_pattern = ctrl.GetPattern(auto.PatternId.InvokePattern)
        if not inv_pattern:
            return {
                "ok": False,
                "action": "invoke",
                "message": f"Element #{meta['index']} ('{meta.get('label')}') does not support InvokePattern.",
            }

        monitor = InvariantMonitor()
        monitor.start()
        try:
            invoked = inv_pattern.Invoke()
        except Exception as e:
            return {
                "ok": False,
                "action": "invoke",
                "message": f"UIA Invoke raised after dispatch; execution status is unknown: {e}",
                "meta": {"executed": "unknown", "safe_to_retry": False},
            }
        finally:
            metrics = monitor.stop()

        if not invoked:
            return {
                "ok": False,
                "action": "invoke",
                "message": "UIA InvokePattern returned failure; the action may have partially executed.",
                "meta": {**metrics, "executed": "unknown", "safe_to_retry": False},
            }

        if metrics["foreground_changed"]:
            return {
                "ok": True,
                "action": "invoke",
                "requires_foreground": True,
                "message": f"Invoked element #{meta['index']}; foreground focus changed during the action.",
                "meta": {**metrics, "executed": True, "safe_to_retry": False},
            }

        return {
            "ok": True,
            "action": "invoke",
            "message": f"Successfully executed InvokePattern on element #{meta['index']} ('{meta.get('label')}').",
            "meta": {**metrics, "executed": True, "safe_to_retry": False},
        }

    def set_value(self, element_ref: Any, value: str, snapshot_id: str, run_id: str = "", host_authorization: Any = None) -> Dict[str, Any]:
        """Real UIA ValuePattern execution. Replaces content; no WM_SETTEXT fallback."""
        authorized, auth_error = self._verify_host_authorization(
            "set_value", {"element_ref": element_ref, "value": value}, snapshot_id, run_id, host_authorization
        )
        if not authorized:
            return {"ok": False, "action": "set_value", "message": f"SetValue rejected: {auth_error}"}
        import uiautomation as auto

        entry, err = self._resolve_element(element_ref, snapshot_id)
        if err:
            return {"ok": False, "action": "set_value", "message": err}

        ctrl = entry["control"]
        meta = entry["metadata"]

        val_pattern = ctrl.GetPattern(auto.PatternId.ValuePattern)
        if not val_pattern:
            return {
                "ok": False,
                "action": "set_value",
                "message": f"Element #{meta['index']} does not support ValuePattern. (WM_SETTEXT substitute is prohibited).",
            }

        monitor = InvariantMonitor()
        monitor.start()
        call_attempted = False
        try:
            call_attempted = True
            set_succeeded = val_pattern.SetValue(value)
            # Postcondition verification
            curr = val_pattern.Value
            verified = curr == value
        except Exception as e:
            return {
                "ok": False,
                "action": "set_value",
                "message": f"UIA SetValue postcondition unavailable after dispatch: {e}",
                "meta": {"executed": "unknown" if call_attempted else False, "safe_to_retry": False},
            }
        finally:
            metrics = monitor.stop()

        res_msg = f"Replaced content of element #{meta['index']} with '{value}'."
        if not verified:
            res_msg += f" (Postcondition mismatch: current value is '{curr}')"

        return {
            "ok": verified,
            "action": "set_value",
            "message": res_msg,
            "meta": {
                **metrics,
                "verified": verified,
                "pattern_call_succeeded": bool(set_succeeded),
                "safe_to_retry": not verified,
            },
        }

    def scroll(self, element_ref: Any, direction: str, amount: int, snapshot_id: str, run_id: str = "", host_authorization: Any = None) -> Dict[str, Any]:
        """Real UIA ScrollPattern execution."""
        authorized, auth_error = self._verify_host_authorization(
            "scroll", {"element_ref": element_ref, "direction": direction, "amount": amount},
            snapshot_id, run_id, host_authorization,
        )
        if not authorized:
            return {"ok": False, "action": "scroll", "message": f"Scroll rejected: {auth_error}"}
        import uiautomation as auto

        entry, err = self._resolve_element(element_ref, snapshot_id)
        if err:
            return {"ok": False, "action": "scroll", "message": err}

        ctrl = entry["control"]
        meta = entry["metadata"]

        if direction not in {"up", "down", "left", "right"}:
            return {"ok": False, "action": "scroll", "message": f"Unsupported scroll direction: {direction!r}."}
        try:
            amount = int(amount)
        except (TypeError, ValueError):
            return {"ok": False, "action": "scroll", "message": "Scroll amount must be an integer between 1 and 10."}
        if amount < 1 or amount > 10:
            return {"ok": False, "action": "scroll", "message": "Scroll amount must be between 1 and 10."}

        scr_pattern = ctrl.GetPattern(auto.PatternId.ScrollPattern)
        if not scr_pattern:
            return {
                "ok": False,
                "action": "scroll",
                "message": f"Element #{meta['index']} does not support ScrollPattern.",
            }

        monitor = InvariantMonitor()
        monitor.start()
        try:
            h_amount = auto.ScrollAmount.NoAmount
            v_amount = auto.ScrollAmount.NoAmount
            if direction == "up":
                v_amount = auto.ScrollAmount.SmallDecrement
            elif direction == "down":
                v_amount = auto.ScrollAmount.SmallIncrement
            elif direction == "left":
                h_amount = auto.ScrollAmount.SmallDecrement
            elif direction == "right":
                h_amount = auto.ScrollAmount.SmallIncrement

            before = (
                getattr(scr_pattern, "HorizontalScrollPercent", None),
                getattr(scr_pattern, "VerticalScrollPercent", None),
            )
            for _ in range(amount):
                if not scr_pattern.Scroll(h_amount, v_amount):
                    return {"ok": False, "action": "scroll", "message": "UIA ScrollPattern returned failure."}
            after = (
                getattr(scr_pattern, "HorizontalScrollPercent", None),
                getattr(scr_pattern, "VerticalScrollPercent", None),
            )
        except Exception as e:
            return {"ok": False, "action": "scroll", "message": f"UIA Scroll failed: {e}"}
        finally:
            metrics = monitor.stop()

        moved = before != after
        return {
            "ok": moved,
            "action": "scroll",
            "message": (
                f"Scrolled #{meta['index']} {direction} by {amount} increments via ScrollPattern."
                if moved else "UIA ScrollPattern returned success but the scroll position did not change."
            ),
            "meta": {
                **metrics, "verified_movement": moved,
                "scroll_before": before, "scroll_after": after,
                "safe_to_retry": not moved,
            },
        }

    def physical_input(
        self,
        actions: List[Dict[str, Any]],
        snapshot_id: str,
        approval_id: str = "",
        run_id: str = "",
        host_authorization: Any = None,
    ) -> Dict[str, Any]:
        """Physical mouse/keyboard input via SendInput with target point and snapshot re-verification."""
        if approval_id:
            return {
                "ok": False,
                "action": "physical_input",
                "requires_foreground": True,
                "message": "Physical input rejected: caller-supplied approval IDs are not trusted by the worker.",
            }

        authorized, auth_error = self._verify_host_authorization(
            "physical_input", {"actions": actions}, snapshot_id, run_id, host_authorization
        )
        if not authorized:
            return {"ok": False, "action": "physical_input", "requires_foreground": True, "message": f"Physical input rejected: {auth_error}"}

        if not snapshot_id:
            return {
                "ok": False,
                "action": "physical_input",
                "message": "Physical input rejected: snapshot_id is required.",
            }

        with self._cache_lock:
            snap = self._snapshot_cache.get(snapshot_id)

        if not snap:
            return {
                "ok": False,
                "action": "physical_input",
                "message": f"Snapshot '{snapshot_id}' expired or not found. Fresh capture required before physical input.",
            }

        target_hwnd = snap.get("target_hwnd")
        target_pid = snap.get("target_pid")
        target_creation = snap.get("proc_creation_time")
        if not target_hwnd or not user32.IsWindow(target_hwnd):
            return {"ok": False, "action": "physical_input", "message": "Physical input requires a live snapshot target window."}
        if not target_pid or not target_creation:
            return {"ok": False, "action": "physical_input", "message": "Snapshot lacks verified target process identity."}
        current_pid = wintypes.DWORD()
        if not user32.GetWindowThreadProcessId(target_hwnd, ctypes.byref(current_pid)) or current_pid.value != target_pid:
            return {"ok": False, "action": "physical_input", "message": "Snapshot target window process changed."}
        if not isinstance(actions, list) or not actions:
            return {"ok": False, "action": "physical_input", "message": "Physical input requires a non-empty action list."}

        age = time.monotonic() - snap["created_at_mono"]
        if age > self.SNAPSHOT_TTL:
            return {
                "ok": False,
                "action": "physical_input",
                "message": f"Snapshot '{snapshot_id}' expired ({age:.1f}s > {self.SNAPSHOT_TTL}s TTL). Fresh capture required.",
            }

        # Verify target process has not restarted since snapshot
        if snap.get("target_pid") and snap.get("proc_creation_time"):
            current_proc_time = self._get_process_creation_time(snap["target_pid"])
            if current_proc_time != snap["proc_creation_time"]:
                return {
                    "ok": False,
                    "action": "physical_input",
                    "message": f"Target application process was restarted since snapshot '{snapshot_id}'.",
                }

        vx = user32.GetSystemMetrics(SM_XVIRTUALSCREEN)
        vy = user32.GetSystemMetrics(SM_YVIRTUALSCREEN)
        vw = user32.GetSystemMetrics(SM_CXVIRTUALSCREEN)
        vh = user32.GetSystemMetrics(SM_CYVIRTUALSCREEN)
        if (
            vw <= 0 or vh <= 0
            or [vx, vy] != snap.get("virtual_origin")
            or [vw, vh] != snap.get("virtual_dimensions")
        ):
            return {"ok": False, "action": "physical_input", "message": "Virtual desktop geometry changed since the snapshot. Capture again."}

        current_outer_bounds = self._window_outer_bounds(target_hwnd)
        current_crop_bounds = self._window_client_screen_bounds(target_hwnd)
        if current_outer_bounds is None or current_crop_bounds is None:
            return {"ok": False, "action": "physical_input", "message": "Snapshot target client geometry could not be verified."}
        if (
            current_crop_bounds != snap.get("crop_bounds")
            or current_outer_bounds != snap.get("target_outer_bounds")
        ):
            return {"ok": False, "action": "physical_input", "message": "Snapshot target window moved or resized. Capture again."}

        # Reject malformed or unsupported later steps before the first input is
        # sent, so a mixed sequence cannot partially execute then fail validation.
        for index, act in enumerate(actions):
            if not isinstance(act, dict):
                return {"ok": False, "action": "physical_input", "message": f"Action {index} must be an object."}
            act_type = act.get("type")
            if act_type == "click":
                try:
                    x, y = int(act["x"]), int(act["y"])
                except (KeyError, TypeError, ValueError):
                    return {"ok": False, "action": "physical_input", "message": f"Click action {index} coordinates must be integers."}
                if not (vx <= x < vx + vw and vy <= y < vy + vh):
                    return {"ok": False, "action": "physical_input", "message": f"Click action {index} coordinate is outside the current virtual desktop."}
                cx, cy, cw, ch = snap["crop_bounds"]
                if not (cx <= x < cx + cw and cy <= y < cy + ch):
                    return {"ok": False, "action": "physical_input", "message": f"Click action {index} is outside the captured target client area."}
                if act.get("button", "left") not in {"left", "right", "middle"}:
                    return {"ok": False, "action": "physical_input", "message": f"Click action {index} has an unsupported mouse button."}
            elif act_type == "type":
                if not isinstance(act.get("text", ""), str):
                    return {"ok": False, "action": "physical_input", "message": f"Type action {index} text must be a string."}
            else:
                return {"ok": False, "action": "physical_input", "message": f"Unsupported physical input action: {act_type!r}."}

        executed_actions = 0
        for act in actions:
            if self._emergency_stopped:
                return {
                    "ok": False,
                    "action": "physical_input",
                    "message": "Physical input sequence aborted: Emergency stop triggered.",
                    "executed_count": executed_actions,
                }

            act_type = act["type"]
            if act_type == "click":
                x, y = int(act["x"]), int(act["y"])
                button = act.get("button", "left")
                target_hwnd = snap.get("target_hwnd")
                if not target_hwnd or not user32.IsWindow(target_hwnd):
                    return {"ok": False, "action": "physical_input", "message": "Physical click requires a live snapshot target window.", "executed_count": executed_actions}

                # Pre-click verification: Point must belong to target HWND
                if target_hwnd:
                    pt = POINT(x, y)
                    h_at = user32.WindowFromPoint(pt)
                    curr = h_at
                    matched = False
                    while curr:
                        if curr == target_hwnd:
                            matched = True
                            break
                        curr = user32.GetParent(curr)
                    if not matched:
                        return {
                            "ok": False,
                            "action": "physical_input",
                            "message": f"Pre-click verification failed: coordinate ({x}, {y}) does not belong to target HWND {target_hwnd}.",
                        }

                    # Conservative occlusion check at target point
                    if self.is_element_occluded_conservative((x, y, 1, 1), target_hwnd):
                        return {
                            "ok": False,
                            "action": "physical_input",
                            "message": f"Pre-click verification failed: coordinate ({x}, {y}) is occluded by another window.",
                        }

                norm_x = int(((x - vx) * 65535) / vw)
                norm_y = int(((y - vy) * 65535) / vh)

                inp = (INPUT * 3)()
                inp[0].type = INPUT_MOUSE
                inp[0].union.mi.dx = norm_x
                inp[0].union.mi.dy = norm_y
                inp[0].union.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK

                inp[1].type = INPUT_MOUSE
                down_flag, up_flag = {
                    "left": (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
                    "right": (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
                    "middle": (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
                }[button]
                inp[1].union.mi.dwFlags = down_flag

                inp[2].type = INPUT_MOUSE
                inp[2].union.mi.dwFlags = up_flag

                sent = user32.SendInput(3, inp, ctypes.sizeof(INPUT))
                if sent >= 2:
                    self._agent_held_mouse_buttons.add(button)
                if sent != 3:
                    if sent >= 2:
                        up = INPUT()
                        up.type = INPUT_MOUSE
                        up.union.mi.dwFlags = up_flag
                        released = user32.SendInput(1, ctypes.byref(up), ctypes.sizeof(INPUT)) == 1
                        if released:
                            self._agent_held_mouse_buttons.discard(button)
                    return {"ok": False, "action": "physical_input", "message": f"SendInput failed: {sent}/3 events sent; button release {'succeeded' if sent >= 2 and released else 'not confirmed'}.", "executed_count": executed_actions}
                self._agent_held_mouse_buttons.discard(button)
                executed_actions += 1

            elif act_type == "type":
                text = act.get("text", "")
                if user32.GetForegroundWindow() != target_hwnd:
                    return {"ok": False, "action": "physical_input", "message": "Typing requires the snapshot target to be foreground.", "executed_count": executed_actions}
                encoded = text.encode("utf-16-le", errors="surrogatepass")
                code_units = (int.from_bytes(encoded[i:i + 2], "little") for i in range(0, len(encoded), 2))
                for code in code_units:
                    if self._emergency_stopped:
                        return {
                            "ok": False,
                            "action": "physical_input",
                            "message": "Physical input sequence aborted: Emergency stop triggered.",
                            "executed_count": executed_actions,
                        }
                    inp = (INPUT * 2)()
                    inp[0].type = INPUT_KEYBOARD
                    inp[0].union.ki.wScan = code
                    inp[0].union.ki.dwFlags = KEYEVENTF_UNICODE

                    inp[1].type = INPUT_KEYBOARD
                    inp[1].union.ki.wScan = code
                    inp[1].union.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP

                    sent = user32.SendInput(2, inp, ctypes.sizeof(INPUT))
                    if sent != 2:
                        released = False
                        if sent >= 1:
                            key_up = INPUT()
                            key_up.type = INPUT_KEYBOARD
                            key_up.union.ki.wScan = code
                            key_up.union.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP
                            released = user32.SendInput(1, ctypes.byref(key_up), ctypes.sizeof(INPUT)) == 1
                        return {"ok": False, "action": "physical_input", "message": f"SendInput failed for UTF-16 unit U+{code:04X}; key release {'succeeded' if released else 'not needed or not confirmed'}.", "executed_count": executed_actions}
                executed_actions += 1

        return {
            "ok": True,
            "action": "physical_input",
            "executed_count": executed_actions,
            "message": f"Executed {executed_actions} physical input action(s).",
        }


# ---------------------------------------------------------------------------
# Worker Stdio Loop
# ---------------------------------------------------------------------------

def dispatch_worker_request(engine: WindowsEngine, req: Any) -> Dict[str, Any]:
    """Validate one decoded request and turn command exceptions into JSON errors."""
    if not isinstance(req, dict):
        return {"ok": False, "error": "Worker request must be a JSON object."}
    cmd = req.get("command")
    args = req.get("args", {})
    if not isinstance(args, dict):
        return {"ok": False, "error": "Worker request args must be a JSON object."}

    try:
        if cmd == "ping":
            return {
                "ok": True,
                "action": "ping",
                "message": "pong",
                "dpi": engine.dpi_initialized,
                "com": engine.com_initialized,
                "uia": engine.uia_initialized,
                "ready": engine.ready,
            }
        if cmd == "emergency_stop":
            return engine.emergency_stop()
        if not engine.ready:
            return {
                "ok": False,
                "error": engine.initialization_error or "Windows worker initialization was not verified.",
            }
        if cmd == "capture":
            return engine.capture(
                mode=args.get("mode", "som"),
                target_hwnd=args.get("target_hwnd"),
                max_elements=args.get("max_elements", 50),
            )
        if cmd == "list_windows":
            return {"ok": True, "windows": engine.list_windows()}
        if cmd == "invoke":
            return engine.invoke(
                element_ref=args.get("element_ref"),
                snapshot_id=args.get("snapshot_id", ""),
                run_id=req.get("run_id", ""),
                host_authorization=req.get("host_authorization"),
            )
        if cmd == "set_value":
            return engine.set_value(
                element_ref=args.get("element_ref"),
                value=args.get("value", ""),
                snapshot_id=args.get("snapshot_id", ""),
                run_id=req.get("run_id", ""),
                host_authorization=req.get("host_authorization"),
            )
        if cmd == "scroll":
            return engine.scroll(
                element_ref=args.get("element_ref"),
                direction=args.get("direction", "down"),
                amount=args.get("amount", 3),
                snapshot_id=args.get("snapshot_id", ""),
                run_id=req.get("run_id", ""),
                host_authorization=req.get("host_authorization"),
            )
        if cmd == "physical_input":
            return engine.physical_input(
                actions=args.get("actions", []),
                snapshot_id=args.get("snapshot_id", ""),
                approval_id=args.get("approval_id", ""),
                run_id=req.get("run_id", ""),
                host_authorization=req.get("host_authorization"),
            )
        return {"ok": False, "error": f"Unknown worker command: {cmd}"}
    except Exception as exc:
        logger.exception("Worker command failed: %r", cmd)
        return {"ok": False, "action": cmd if isinstance(cmd, str) else "", "error": f"Worker command failed: {exc}"}


def run_worker_loop():
    engine = WindowsEngine()
    ok, msg = engine.initialize()
    engine.ready = bool(ok and engine.dpi_initialized and engine.com_initialized and engine.uia_initialized)
    if not ok:
        sys.stderr.write(f"Worker initialization failed: {msg}\n")
        sys.stderr.flush()

    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            res = {"ok": False, "error": f"Invalid JSON: {e}"}
            sys.stdout.write(json.dumps(res) + "\n")
            sys.stdout.flush()
            continue

        res = dispatch_worker_request(engine, req)

        sys.stdout.write(json.dumps(res) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    run_worker_loop()
