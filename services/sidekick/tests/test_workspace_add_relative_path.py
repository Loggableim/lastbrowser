from pathlib import Path
from tempfile import TemporaryDirectory


def test_relative_space_path_resolves_under_active_sidekick_home_not_repo(monkeypatch, tmp_path):
    from web.api import routes

    repository = Path(__file__).resolve().parents[3]
    with TemporaryDirectory(prefix="lastbrowser-sidekick-home-") as isolated_root:
        sidekick_home = Path(isolated_root) / "home"
        sidekick_home.mkdir()
        monkeypatch.chdir(repository / "services" / "sidekick")
        monkeypatch.setattr(routes, "get_active_webui_home", lambda: sidekick_home)

        candidate = routes._resolve_workspace_add_candidate("spaces/audit-project")

        assert candidate == (sidekick_home / "spaces" / "audit-project").resolve()
        assert candidate.is_relative_to(sidekick_home.resolve())
        assert not candidate.is_relative_to(repository.resolve())


def test_relative_space_path_cannot_escape_active_sidekick_home(monkeypatch, tmp_path):
    from web.api import routes

    sidekick_home = tmp_path / "isolated-sidekick-home"
    sidekick_home.mkdir()
    monkeypatch.setattr(routes, "get_active_webui_home", lambda: sidekick_home)

    try:
        routes._resolve_workspace_add_candidate("../../outside-repo")
    except ValueError as exc:
        assert "inside the Sidekick data home" in str(exc)
    else:
        raise AssertionError("relative traversal must not escape the Sidekick data home")


def test_absolute_space_path_remains_an_explicit_user_selected_location(monkeypatch, tmp_path):
    from web.api import routes

    sidekick_home = tmp_path / "isolated-sidekick-home"
    explicit_root = tmp_path / "chosen-workspace"
    sidekick_home.mkdir()
    monkeypatch.setattr(routes, "get_active_webui_home", lambda: sidekick_home)

    assert routes._resolve_workspace_add_candidate(str(explicit_root)) == explicit_root.resolve()
