from pathlib import Path

from web.api import models


def test_delete_removes_the_space_session_file(monkeypatch, tmp_path):
    request_dir = tmp_path / "request"
    space_dir = tmp_path / "space"
    request_dir.mkdir()
    space_dir.mkdir()
    sid = "abc123"
    leftover = space_dir / f"{sid}.json"
    leftover.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(models, "get_session_dir", lambda: request_dir)

    class Workspace:
        sessions_dir = space_dir

    monkeypatch.setattr(
        "web.api.space_engine.get_all_workspaces",
        lambda: [Workspace()],
    )

    assert models.unlink_owned_session_files(sid) is True
    assert not leftover.exists()


def test_delete_reports_failure_when_the_session_file_stays(monkeypatch, tmp_path):
    sid = "abc123"
    stuck = tmp_path / f"{sid}.json"
    stuck.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(models, "get_session_dir", lambda: tmp_path)

    def refuse(self, missing_ok=False):
        return None

    monkeypatch.setattr(Path, "unlink", refuse)
    assert models.unlink_owned_session_files(sid) is False
    assert stuck.exists()
