import asyncio
from pathlib import Path
from types import SimpleNamespace


def test_browser_space_listing_omits_projectless_and_duplicate_space_engine_rows(monkeypatch, tmp_path):
    from cli import web_server
    from web.api import space_engine

    existing_project = tmp_path / "audio-smoke"
    existing_project.mkdir()
    second_project = tmp_path / "research"
    second_project.mkdir()

    monkeypatch.setattr(web_server, "load_workspaces", lambda: [
        {"path": str(existing_project), "name": "Audio Smoke"}
    ])
    monkeypatch.setattr(web_server, "get_last_workspace", lambda: str(existing_project))
    monkeypatch.setattr(space_engine, "get_all_workspaces", lambda: [
        SimpleNamespace(slug="audio-smoke", name="Audio Smoke", get_project_dir=lambda: str(existing_project)),
        SimpleNamespace(slug="nova", name="nova", get_project_dir=lambda: None),
        SimpleNamespace(slug="research", name="Research", get_project_dir=lambda: str(second_project)),
    ])

    result = asyncio.run(web_server.list_workspaces())

    assert [workspace["name"] for workspace in result["workspaces"]] == ["Audio Smoke", "Research"]
    assert result["workspaces"][1]["path"] == str(second_project.resolve())
