"""Windows UIA & Desktop Automation Backend.

Implements `ComputerUseBackend` using an out-of-process COM-MTA worker
(`windows_worker.py`) with strict interface separation:
  - UI Automation semantic operations: `invoke`, `set_value`, `scroll`
  - Physical fallback: `physical_input` (requires explicit approval & foreground)
  - Out-of-band stop latch and worker termination, with measured timings
  - Separate process and I/O locks with bounded command waits
  - Fail-closed capture and availability diagnostics
"""

from __future__ import annotations

import ctypes
import base64
from ctypes import wintypes
import hashlib
import hmac
import json
import logging
import os
import secrets
import subprocess
import sys
import threading
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from tools.computer_use.backend import (
    ActionResult,
    CaptureResult,
    ComputerUseBackend,
    UIElement,
)

logger = logging.getLogger(__name__)


class WindowsUiaBackend(ComputerUseBackend):
    """Backend managing the isolated Windows worker process."""

    requires_snapshot_approval = True

    def __init__(self, timeout: float = 5.0):
        self.timeout = timeout
        self._proc: Optional[subprocess.Popen] = None
        self._process_lock = threading.Lock()
        self._io_lock = threading.Lock()
        self._started = False
        self._emergency_stopped = False
        self._worker_auth_secret = ""
        self._last_snapshot_id: str = ""
        self._last_snapshot_meta: Dict[str, Any] = {}
        self._target_hwnd: Optional[int] = None

    def start(self) -> None:
        """Explicitly start or resume the out-of-process worker."""
        with self._process_lock:
            if (
                self._emergency_stopped
                and self._proc is not None
                and self._proc.poll() is None
            ):
                raise RuntimeError("Emergency-stopped Windows worker is still running; cannot resume safely.")
            # Only an explicit caller may resume after emergency stop. Worker
            # recovery in _send_command must never clear this latch implicitly.
            self._emergency_stopped = False
            self._start_unlocked()

    def _start_unlocked(self) -> None:
        if self._proc is not None and self._proc.poll() is None:
            return

        if self._emergency_stopped:
            raise RuntimeError("Windows backend is in emergency-stop state. Call start() to resume.")

        worker_cmd = [
            sys.executable,
            "-m",
            "tools.computer_use.windows_worker",
        ]
        cwd = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        self._worker_auth_secret = secrets.token_urlsafe(32)
        env["LASTBROWSER_COMPUTER_USE_WORKER_AUTH"] = self._worker_auth_secret
        if cwd not in env.get("PYTHONPATH", ""):
            env["PYTHONPATH"] = f"{cwd}{os.pathsep}{env.get('PYTHONPATH', '')}"

        try:
            self._proc = subprocess.Popen(
                worker_cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                cwd=cwd,
                env=env,
            )
            self._started = True
        except Exception as e:
            logger.error("Failed to spawn Windows worker process: %s", e)
            self._proc = None
            self._started = False
            raise RuntimeError(f"Could not spawn windows_worker: {e}")

    def stop(self) -> None:
        """Shut down the worker process cleanly."""
        with self._process_lock:
            self._stop_unlocked()

    def _stop_unlocked(self) -> None:
        if self._proc is not None:
            try:
                if self._proc.poll() is None:
                    try:
                        self._proc.terminate()
                        self._proc.wait(timeout=0.3)
                    except Exception:
                        self._proc.kill()
            except Exception:
                pass
            finally:
                self._proc = None
                self._started = False

    def is_available(self) -> bool:
        """Return True iff running on Windows and all diagnostics pass."""
        if sys.platform != "win32":
            return False
        ok, _ = self.check_availability_diagnostics()
        return ok

    def check_availability_diagnostics(self) -> Tuple[bool, str]:
        """Perform a fail-closed live diagnostics probe against the worker process."""
        if sys.platform != "win32":
            return False, f"Platform is '{sys.platform}', Windows required."

        # Ensure uiautomation package is importable
        try:
            import uiautomation as auto  # noqa: F401
        except ImportError as e:
            return False, f"Required dependency 'uiautomation' is missing: {e}"

        temp_started = False
        try:
            with self._process_lock:
                if not self._started or self._proc is None or self._proc.poll() is not None:
                    self._start_unlocked()
                    temp_started = True

            resp = self._send_command("ping", timeout=2.0)
            if not resp.get("ok"):
                return False, f"Worker ping failed: {resp.get('error', 'unknown error')}"

            if not resp.get("dpi"):
                return False, "Worker failed to initialize Per-Monitor-V2 DPI awareness."
            if not resp.get("com"):
                return False, "Worker failed to initialize COM MTA."

            return True, "Windows worker online and verified (DPI V2 + COM MTA + UIA active)."
        except Exception as e:
            return False, f"Diagnostics probe failed: {e}"
        finally:
            if temp_started:
                self.stop()

    def emergency_stop(self) -> ActionResult:
        """Latch input dispatch and kill the worker without taking the I/O lock.

        The host intentionally does not send global key-up or mouse-up events:
        those can release physical inputs held by the user. The worker owns its
        synthetic-input tracking and must perform any safe targeted cleanup.
        """
        t_start = time.perf_counter()
        self._emergency_stopped = True
        # This measures only how quickly the host blocks future dispatches. It
        # does not prove an already-started OS/UIA action has settled.
        dispatch_latch_ms = (time.perf_counter() - t_start) * 1000

        # Terminate worker out-of-band without waiting on _io_lock
        t_term_start = time.perf_counter()
        worker_terminated = True
        with self._process_lock:
            proc = self._proc
            if proc is not None:
                try:
                    proc.kill()
                    proc.wait(timeout=0.15)
                except Exception:
                    pass
                worker_terminated = proc.poll() is not None
                if worker_terminated:
                    self._proc = None
                    self._started = False

        worker_term_ms = (time.perf_counter() - t_term_start) * 1000
        total_ms = (time.perf_counter() - t_start) * 1000

        self._last_snapshot_id = ""
        self._last_snapshot_meta.clear()

        return ActionResult(
            ok=worker_terminated,
            action="emergency_stop",
            message=(
                f"Host dispatch latch set in {dispatch_latch_ms:.2f}ms; worker termination "
                f"{'confirmed' if worker_terminated else 'not confirmed'} after {worker_term_ms:.2f}ms. "
                "This does not confirm that an already-delivered UI Automation action has settled; "
                "the host did not release user-held inputs."
            ),
            meta={
                "input_dispatch_latch_ms": round(dispatch_latch_ms, 2),
                "measurement_scope": "host_dispatch_only",
                "input_dispatch_latched": True,
                "worker_termination_ms": round(worker_term_ms, 2),
                "worker_terminated": worker_terminated,
                "total_elapsed_ms": round(total_ms, 2),
                "released": [],
            },
        )

    def _send_command(
        self,
        command: str,
        args: Optional[Dict[str, Any]] = None,
        timeout: Optional[float] = None,
        *,
        run_id: str = "",
        host_authorization: Optional[Dict[str, str]] = None,
        authorization: Optional[Tuple[str, Dict[str, Any], str]] = None,
    ) -> Dict[str, Any]:
        """Send command to worker process via stdio with deadlock-free locking and watchdog."""
        if self._emergency_stopped:
            raise RuntimeError("Windows backend is in emergency-stop state. Call start() to resume.")

        # Ensure started under process lock
        with self._process_lock:
            if self._emergency_stopped:
                raise RuntimeError("Windows backend is in emergency-stop state. Call start() to resume.")
            if self._proc is None or self._proc.poll() is not None:
                self._start_unlocked()
            proc = self._proc

        # I/O execution protected by _io_lock
        with self._io_lock:
            # Emergency stop can race after startup and before I/O acquisition.
            # Recheck immediately before writing so no later command is queued.
            if self._emergency_stopped:
                raise RuntimeError("Windows backend is in emergency-stop state. Call start() to resume.")
            if proc is None or proc is not self._proc or proc.poll() is not None:
                raise RuntimeError("Windows worker process is not running.")

            if authorization is not None:
                action, parameters, snapshot_id = authorization
                host_authorization = self._authorize_worker_command(action, parameters, snapshot_id, run_id)

            request: Dict[str, Any] = {"command": command, "args": args or {}}
            if run_id:
                request["run_id"] = run_id
            if host_authorization is not None:
                request["host_authorization"] = host_authorization
            payload = json.dumps(request) + "\n"

            try:
                proc.stdin.write(payload)
                proc.stdin.flush()
            except Exception as e:
                self.stop()
                raise RuntimeError(f"Failed to write to worker process: {e}")

            to = timeout or self.timeout
            result: List[Optional[str]] = [None]
            error: List[Optional[Exception]] = [None]

            def reader():
                try:
                    result[0] = proc.stdout.readline()
                except Exception as ex:
                    error[0] = ex

            t = threading.Thread(target=reader, daemon=True)
            t.start()
            t.join(timeout=to)

            if t.is_alive():
                logger.error("Watchdog triggered: worker hung on command '%s' after %ss. Terminating.", command, to)
                self.stop()
                raise TimeoutError(f"Windows worker timed out after {to}s on command '{command}'.")

            if error[0]:
                self.stop()
                raise RuntimeError(f"Error reading from worker: {error[0]}")

            raw = result[0]
            if not raw:
                self.stop()
                raise RuntimeError("Worker process terminated unexpectedly (empty response).")

            try:
                return json.loads(raw)
            except json.JSONDecodeError as ex:
                self.stop()
                raise RuntimeError(f"Malformed worker JSON response: {raw!r}") from ex

    def _authorize_worker_command(
        self,
        action: str,
        parameters: Dict[str, Any],
        snapshot_id: str,
        run_id: str,
    ) -> Dict[str, Any]:
        """Create a one-use process-local envelope for the isolated worker."""
        if not self._worker_auth_secret:
            raise RuntimeError("Windows worker authorization secret is unavailable.")
        if not snapshot_id or not run_id:
            raise ValueError("A snapshot_id and trusted host run_id are required.")
        nonce = uuid.uuid4().hex
        payload = {
            "action": action,
            "parameters": parameters,
            "snapshot_id": snapshot_id,
            "run_id": run_id,
            "nonce": nonce,
        }
        canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        mac = hmac.new(self._worker_auth_secret.encode("utf-8"), canonical, hashlib.sha256).hexdigest()
        return {"nonce": nonce, "mac": mac}

    @staticmethod
    def _normalize_element_ref(element_ref: Any) -> Any:
        if isinstance(element_ref, str):
            value = element_ref.strip()
            if value.startswith("#"):
                value = value[1:]
            elif value.startswith("@e"):
                value = value[2:]
            try:
                return int(value)
            except ValueError as exc:
                raise ValueError(f"Invalid element reference: {element_ref!r}") from exc
        if isinstance(element_ref, bool) or not isinstance(element_ref, int):
            raise ValueError("A valid element reference is required.")
        return element_ref

    @staticmethod
    def _consume_action_approval(
        action: str,
        parameters: Dict[str, Any],
        approval_id: str,
        run_id: str,
    ) -> Optional[str]:
        from tools.computer_use.approval import (
            action_parameters_fingerprint,
            compute_action_target_fingerprint,
            default_approval_registry,
        )

        snapshot_id = str(parameters.get("snapshot_id") or "")
        target = compute_action_target_fingerprint(action, parameters)
        parameter_fingerprint = action_parameters_fingerprint(action, parameters)
        if not target:
            target = parameter_fingerprint
        approved, reason = default_approval_registry.validate_and_consume(
            token=approval_id,
            action=action,
            target=target,
            snapshot_id=snapshot_id,
            run_id=run_id,
            parameters_fingerprint=parameter_fingerprint,
        )
        return None if approved else reason

    # -----------------------------------------------------------------------
    # Capture & Observe
    # -----------------------------------------------------------------------

    def capture(self, mode: str = "som", app: Optional[str] = None) -> CaptureResult:
        """Capture desktop or application window with real UIA Set-of-Marks."""
        # Never leave an earlier snapshot looking current after a failed capture.
        self._last_snapshot_id = ""
        self._last_snapshot_meta.clear()
        target_hwnd = self._target_hwnd
        if app:
            requested_app = app.strip().lower()
            if not requested_app:
                raise ValueError("A non-empty app name is required when selecting an application capture.")
            windows = self.list_apps()
            target_hwnd = None
            exact_matches = [
                w for w in windows
                if requested_app in {w.get("app", "").strip().lower(), w.get("title", "").strip().lower()}
                and w.get("hwnd")
            ]
            matches = exact_matches or [
                w for w in windows
                if (requested_app in w.get("app", "").lower() or requested_app in w.get("title", "").lower())
                and w.get("hwnd")
            ]
            # A window can match both its class and title; count HWNDs once.
            matches_by_hwnd = {w["hwnd"]: w for w in matches}
            if len(matches_by_hwnd) == 1:
                target_hwnd = next(iter(matches_by_hwnd))
            elif len(matches_by_hwnd) > 1:
                raise RuntimeError(
                    f"Application selector '{app}' matched multiple windows; use an exact, unique title."
                )
            if target_hwnd is None:
                raise RuntimeError(f"Requested application '{app}' was not found; refusing desktop capture fallback.")

        resp = self._send_command("capture", {"mode": mode, "target_hwnd": target_hwnd})
        if not resp.get("ok"):
            raise RuntimeError(resp.get("error", "Capture failed"))

        self._last_snapshot_id = resp.get("snapshot_id", "")
        # Follow-up captures must remain scoped to the selected target instead
        # of silently expanding to the user's entire desktop.
        if app:
            self._target_hwnd = target_hwnd
        self._last_snapshot_meta = {
            "origin": resp.get("origin", [0, 0]),
            "dimensions": [resp.get("width", 0), resp.get("height", 0)],
            "coordinate_space": resp.get("coordinate_space", ""),
            "capture_dpi": resp.get("capture_dpi"),
            "dpi_awareness_verified": bool(resp.get("dpi_awareness_verified", False)),
            "snapshot_id": self._last_snapshot_id,
            "coordinate_mapping": resp.get("coordinate_mapping", ""),
            "capture_region": resp.get("capture_region", ""),
            "target_outer_bounds": resp.get("target_outer_bounds"),
            "virtual_origin": resp.get("virtual_origin"),
            "virtual_dimensions": resp.get("virtual_dimensions"),
        }

        raw_elements = resp.get("elements", [])
        ui_elements = []

        for e in raw_elements:
            ui_elements.append(
                UIElement(
                    index=e["index"],
                    role=e["role"],
                    label=e.get("label", ""),
                    bounds=tuple(e.get("bounds", [0, 0, 0, 0])),
                    app=e.get("class_name", ""),
                    pid=e.get("pid", 0),
                    window_id=e.get("hwnd", 0),
                    attributes={
                        "hwnd": e.get("hwnd"),
                        "patterns": e.get("patterns", {}),
                        "snapshot_id": self._last_snapshot_id,
                    },
                )
            )

        return CaptureResult(
            mode=mode,
            width=resp.get("width", 1920),
            height=resp.get("height", 1080),
            png_b64=resp.get("png_b64"),
            elements=ui_elements,
            app=resp.get("target_app", ""),
            window_title=resp.get("target_app", ""),
            png_bytes_len=len(base64.b64decode(resp["png_b64"], validate=True)) if resp.get("png_b64") else 0,
            snapshot_id=self._last_snapshot_id,
            meta=dict(self._last_snapshot_meta),
        )

    # -----------------------------------------------------------------------
    # Semantic Actions (Focus-Free)
    # -----------------------------------------------------------------------

    def invoke(
        self,
        element: Optional[Any] = None,
        *,
        element_ref: Optional[Any] = None,
        snapshot_id: Optional[str] = None,
        approval_id: str = "",
        run_id: str = "",
    ) -> ActionResult:
        """Real UIA InvokePattern on an element without moving the physical cursor."""
        elem = element if element is not None else element_ref
        snap_id = snapshot_id or self._last_snapshot_id
        try:
            elem = self._normalize_element_ref(elem)
        except ValueError as exc:
            return ActionResult(ok=False, action="invoke", message=str(exc))
        normalized = {"element_ref": elem, "snapshot_id": snap_id or ""}
        approval_error = self._consume_action_approval("invoke", normalized, approval_id, run_id)
        if approval_error:
            return ActionResult(
                ok=False,
                action="invoke",
                message=f"Approval validation failed: {approval_error}",
                meta={"approval_error": approval_error, "requires_approval": True},
            )
        worker_args = {
            "element_ref": elem,
            "snapshot_id": snap_id,
        }
        resp = self._send_command(
            "invoke", worker_args, run_id=run_id,
            authorization=("invoke", {"element_ref": elem}, snap_id or ""),
        )
        return ActionResult(
            ok=resp.get("ok", False),
            action="invoke",
            message=resp.get("message", ""),
            meta={
                "snapshot_id": snap_id,
                "requires_foreground": resp.get("requires_foreground", False),
                **(resp.get("meta") or {}),
            },
        )

    def set_value(
        self,
        value: str,
        element: Optional[Any] = None,
        snapshot_id: Optional[str] = None,
        approval_id: str = "",
        run_id: str = "",
        **kwargs,
    ) -> ActionResult:
        """Replace field content via real UIA ValuePattern.
        Compatible with both macOS signature (value, element) and kwargs.
        """
        elem_ref = element if element is not None else kwargs.get("element_ref")
        snap_id = snapshot_id or kwargs.get("snapshot_id") or self._last_snapshot_id
        try:
            elem_ref = self._normalize_element_ref(elem_ref)
        except ValueError as exc:
            return ActionResult(ok=False, action="set_value", message=str(exc))
        normalized = {"element_ref": elem_ref, "value": str(value), "snapshot_id": snap_id or ""}
        approval_error = self._consume_action_approval("set_value", normalized, approval_id, run_id)
        if approval_error:
            return ActionResult(
                ok=False,
                action="set_value",
                message=f"Approval validation failed: {approval_error}",
                meta={"approval_error": approval_error, "requires_approval": True},
            )
        worker_args = {
            "element_ref": elem_ref,
            "value": str(value),
            "snapshot_id": snap_id,
        }
        resp = self._send_command(
            "set_value", worker_args, run_id=run_id,
            authorization=("set_value", {"element_ref": elem_ref, "value": str(value)}, snap_id or ""),
        )
        return ActionResult(
            ok=resp.get("ok", False),
            action="set_value",
            message=resp.get("message", ""),
            meta={
                "snapshot_id": snap_id,
                "requires_foreground": resp.get("requires_foreground", False),
                **(resp.get("meta") or {}),
            },
        )

    def scroll(
        self,
        *,
        direction: str,
        amount: int = 3,
        element: Optional[int] = None,
        x: Optional[int] = None,
        y: Optional[int] = None,
        modifiers: Optional[List[str]] = None,
        snapshot_id: Optional[str] = None,
        approval_id: str = "",
        run_id: str = "",
    ) -> ActionResult:
        """Real UIA ScrollPattern execution."""
        snap_id = snapshot_id or self._last_snapshot_id
        elem_ref = element
        try:
            elem_ref = self._normalize_element_ref(elem_ref)
            amount = int(amount)
        except (TypeError, ValueError) as exc:
            return ActionResult(ok=False, action="scroll", message=f"Invalid scroll target: {exc}")
        normalized = {
            "element_ref": elem_ref,
            "direction": direction,
            "amount": amount,
            "snapshot_id": snap_id or "",
        }
        approval_error = self._consume_action_approval("scroll", normalized, approval_id, run_id)
        if approval_error:
            return ActionResult(
                ok=False,
                action="scroll",
                message=f"Approval validation failed: {approval_error}",
                meta={"approval_error": approval_error, "requires_approval": True},
            )
        worker_args = {
            "element_ref": elem_ref,
            "direction": direction,
            "amount": amount,
            "snapshot_id": snap_id,
        }
        resp = self._send_command(
            "scroll", worker_args, run_id=run_id,
            authorization=(
                "scroll",
                {"element_ref": elem_ref, "direction": direction, "amount": amount},
                snap_id or "",
            ),
        )
        return ActionResult(
            ok=resp.get("ok", False),
            action="scroll",
            message=resp.get("message", ""),
            meta={"snapshot_id": snap_id, **(resp.get("meta") or {})},
        )

    # -----------------------------------------------------------------------
    # Physical Fallback Actions (Require Foreground & Approval)
    # -----------------------------------------------------------------------

    def physical_input(
        self,
        actions: List[Dict[str, Any]],
        snapshot_id: Optional[str] = None,
        approval_id: str = "",
        run_id: str = "",
    ) -> ActionResult:
        """Execute physical mouse/keyboard actions via SendInput with authentic approval verification."""
        snap_id = snapshot_id or self._last_snapshot_id
        normalized = {"actions": actions, "snapshot_id": snap_id or ""}
        approval_error = self._consume_action_approval("physical_input", normalized, approval_id, run_id)
        if approval_error:
            return ActionResult(
                ok=False,
                action="physical_input",
                message=f"Approval validation failed: {approval_error}",
                meta={"approval_error": approval_error, "requires_approval": True, "requires_foreground": True},
            )

        resp = self._send_command(
            "physical_input",
            {
                "actions": actions,
                "snapshot_id": snap_id,
                "approval_id": "",
            },
            run_id=run_id,
            authorization=("physical_input", {"actions": actions}, snap_id or ""),
        )
        meta = {"executed_count": resp.get("executed_count", 0), "snapshot_id": snap_id}
        if "requires_foreground" in resp:
            meta["requires_foreground"] = resp["requires_foreground"]
        return ActionResult(
            ok=resp.get("ok", False),
            action="physical_input",
            message=resp.get("message", ""),
            meta=meta,
        )

    def click(
        self,
        *,
        element: Optional[int] = None,
        x: Optional[int] = None,
        y: Optional[int] = None,
        button: str = "left",
        click_count: int = 1,
        modifiers: Optional[List[str]] = None,
    ) -> ActionResult:
        """High-level click contract:
        - If element is provided: Attempts semantic invoke() first.
        - If coordinates only or right/double click: requires physical input with foreground.
        """
        if element is not None and button == "left" and click_count == 1:
            return self.invoke(element)

        if x is not None and y is not None:
            return ActionResult(
                ok=False,
                action="click",
                message="Coordinate-based physical click requires explicit physical_input() with valid approval_id.",
                meta={"requires_foreground": True, "target_coords": [x, y]},
            )

        return ActionResult(
            ok=False,
            action="click",
            message="Click could not be resolved to an element index.",
        )

    def drag(self, **kw) -> ActionResult:
        return ActionResult(
            ok=False,
            action="drag",
            message="Drag requires physical input with approval_id.",
            meta={"requires_foreground": True},
        )

    def type_text(self, text: str) -> ActionResult:
        return ActionResult(
            ok=False,
            action="type_text",
            message="Unscoped type_text requires foreground permission and approval_id.",
            meta={"requires_foreground": True},
        )

    def key(self, keys: str) -> ActionResult:
        return ActionResult(
            ok=False,
            action="key",
            message="Key combo requires foreground permission and approval_id.",
            meta={"requires_foreground": True},
        )

    # -----------------------------------------------------------------------
    # Introspection & Window Focus
    # -----------------------------------------------------------------------

    def list_apps(self) -> List[Dict[str, Any]]:
        """List open desktop windows."""
        resp = self._send_command("list_windows")
        raw = resp.get("windows", [])
        apps = []
        for w in raw:
            apps.append({
                "app": w.get("class_name", ""),
                "title": w.get("title", ""),
                "hwnd": w.get("hwnd"),
                "pid": w.get("pid"),
                "process_creation_time": w.get("process_creation_time", 0),
                "bounds": w.get("bounds"),
            })
        return apps

    def focus_app(self, app: str, raise_window: bool = False) -> ActionResult:
        """Set foreground target window and verify actual focus transfer."""
        user32 = ctypes.windll.user32
        user32.GetForegroundWindow.argtypes = []
        user32.GetForegroundWindow.restype = wintypes.HWND
        user32.SetForegroundWindow.argtypes = [wintypes.HWND]
        user32.SetForegroundWindow.restype = wintypes.BOOL

        windows = self.list_apps()
        matched = None
        for w in windows:
            if app.lower() in w.get("title", "").lower() or app.lower() in w.get("app", "").lower():
                matched = w
                break

        if not matched:
            return ActionResult(ok=False, action="focus_app", message=f"Application '{app}' not found.")

        hwnd = matched["hwnd"]
        self._target_hwnd = hwnd

        if raise_window:
            user32.SetForegroundWindow(hwnd)
            time.sleep(0.05)
            curr = user32.GetForegroundWindow()
            if curr != hwnd:
                return ActionResult(
                    ok=False,
                    action="focus_app",
                    message=f"Targeted window '{matched['title']}', but SetForegroundWindow failed to transfer focus.",
                    meta={"hwnd": hwnd, "focus_transferred": False, "requires_foreground": True},
                )

        return ActionResult(
            ok=True,
            action="focus_app",
            message=f"Bound to window '{matched['title']}' (HWND: {hwnd}).",
            meta={"hwnd": hwnd, "focus_transferred": True},
        )
