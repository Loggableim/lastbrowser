"""Lazy imports cannot overwrite a worker Home or rewrite its user's .env."""
import os

import pytest


@pytest.mark.parametrize("flag", ["LASTBROWSER_NATIVE_CHAT_WORKER", "LASTBROWSER_INDEPENDENT_WORKER"])
def test_fixed_worker_dotenv_is_readonly_and_has_no_shared_project_fallback(tmp_path, monkeypatch, flag):
    from cli.env_loader import load_sidekick_dotenv
    home, project = tmp_path / "own", tmp_path / "project"
    home.mkdir(); project.mkdir()
    own_env, project_env = home / ".env", project / ".env"
    own_env.write_text("SIDEKICK_HOME=foreign\nCUSTOM_API_KEY=own-fixture\u200bSIDEKICK_SECRET=corrupted\n", "utf-8")
    project_env.write_text("CUSTOM_API_KEY=project-fixture\nLASTBROWSER_BRIDGE_TOKEN=project-private\n", "utf-8")
    before_files = (own_env.read_bytes(), project_env.read_bytes())
    monkeypatch.setenv(flag, "1")
    monkeypatch.setenv("SIDEKICK_HOME", str(home))
    monkeypatch.setenv("CUSTOM_API_KEY", "already-parsed-own-fixture")
    before_env = dict(os.environ)
    assert load_sidekick_dotenv(sidekick_home=home, project_env=project_env) == []
    assert dict(os.environ) == before_env
    assert (own_env.read_bytes(), project_env.read_bytes()) == before_files


def test_ordinary_dotenv_keeps_explicit_home_precedence(tmp_path, monkeypatch):
    from cli.env_loader import load_sidekick_dotenv
    for flag in ("LASTBROWSER_NATIVE_CHAT_WORKER", "LASTBROWSER_INDEPENDENT_WORKER", "PYTHON_DOTENV_DISABLED"):
        monkeypatch.delenv(flag, raising=False)
    monkeypatch.setenv("CUSTOM_API_KEY", "shell-fixture")
    env = tmp_path / ".env"
    env.write_text("CUSTOM_API_KEY=own-fixture\n", "utf-8")
    assert load_sidekick_dotenv(sidekick_home=tmp_path) == [env]
    assert os.environ["CUSTOM_API_KEY"] == "own-fixture"
