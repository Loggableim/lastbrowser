"""Sidekick's supervisor leaves with the Electron parent, including after a crash."""
import subprocess
import sys

from cli.supervised_web import parent_alive, terminate_process_group


def test_parent_alive_is_false_after_the_process_exits():
    process = subprocess.Popen([sys.executable, "-c", "import sys; sys.exit(0)"])
    process.wait(timeout=10)
    assert parent_alive(process.pid) is False
    assert parent_alive(0) is False


def test_terminate_process_group_stops_the_session():
    process = subprocess.Popen(
        [sys.executable, "-c", "import time; time.sleep(30)"],
        start_new_session=True,
    )
    try:
        terminate_process_group(process)
        assert process.wait(timeout=8) is not None
    finally:
        if process.poll() is None:
            process.kill()
