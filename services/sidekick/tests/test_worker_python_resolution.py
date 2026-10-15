from pathlib import Path

from runtime.independent.worker_host import resolve_worker_python_executable


def test_resolve_worker_python_prefers_packaged_env(monkeypatch, tmp_path):
    packaged = tmp_path / "python3"
    packaged.write_text("#!/bin/sh\n", encoding="utf-8")
    packaged.chmod(0o755)
    monkeypatch.setenv("SIDEKICK_WEBUI_PYTHON", str(packaged))
    assert resolve_worker_python_executable() == Path(str(packaged)).resolve()


def test_resolve_worker_python_ignores_missing_env(monkeypatch):
    monkeypatch.delenv("SIDEKICK_WEBUI_PYTHON", raising=False)
    monkeypatch.delenv("LASTBROWSER_WEBUI_PYTHON", raising=False)
    monkeypatch.delenv("HERMES_WEBUI_PYTHON", raising=False)
    resolved = resolve_worker_python_executable()
    assert resolved.name.startswith("python")
