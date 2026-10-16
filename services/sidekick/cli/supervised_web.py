"""Keep the Sidekick web server tied to the Electron process that spawned it.

Electron launches ``python -m cli.supervised_web``. This process starts uvicorn
in its own session and exits when that parent pid is gone, including a crash
that never runs Electron's quit handlers. The uvicorn session is killed with
the supervisor, so official OpenCode children do not stay behind.
"""
from __future__ import annotations

import os
import signal
import subprocess
import sys
import time


def parent_alive(pid: int) -> bool:
    """True while *pid* is still a running process."""
    if pid <= 0:
        return False
    if sys.platform == "win32":
        return _windows_process_alive(pid)
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _windows_process_alive(pid: int) -> bool:
    import ctypes
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    process_query = 0x1000
    still_active = 259
    handle = kernel32.OpenProcess(process_query, False, pid)
    if not handle:
        return False
    try:
        code = ctypes.c_ulong()
        if not kernel32.GetExitCodeProcess(handle, ctypes.byref(code)):
            return False
        return code.value == still_active
    finally:
        kernel32.CloseHandle(handle)


def terminate_process_group(process: subprocess.Popen) -> None:
    """Stop a process and the session it leads, including grandchildren."""
    if process.poll() is not None:
        return
    if sys.platform == "win32":
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(process.pid)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=3)


def serve(argv: list[str], parent_pid: int) -> int:
    """Run uvicorn and return when it exits or the Electron parent is gone."""
    command = [sys.executable, "-m", "uvicorn", "cli.web_server:app", *argv]
    if parent_pid <= 0:
        os.execv(sys.executable, command)
    process = subprocess.Popen(command, start_new_session=True)

    def _stop(_signum, _frame):
        terminate_process_group(process)
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    while True:
        code = process.poll()
        if code is not None:
            return int(code)
        if not parent_alive(parent_pid):
            terminate_process_group(process)
            return 0
        time.sleep(0.4)


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    raw_parent = os.environ.get("LASTBROWSER_ELECTRON_PID", "").strip()
    parent_pid = int(raw_parent) if raw_parent.isdigit() else 0
    return serve(args, parent_pid)


if __name__ == "__main__":
    raise SystemExit(main())
