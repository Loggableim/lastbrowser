"""Restart an existing desktop profile through the actual API bootstrap."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys

import pytest
import yaml


@pytest.mark.parametrize("profile", ["default", "personal"])
def test_desktop_restart_preserves_provider_model_and_unknown_profile_fields(tmp_path, profile):
    base = tmp_path / "Lastbrowser" / "runtime"
    home = base if profile == "default" else base / "profiles" / profile
    home.mkdir(parents=True)
    # Pre-existing, older schema; startup must not rewrite or reset it.
    existing = {
        "_config_version": 11,
        "model": {"provider": "ollama", "default": "existing-model"},
        "providers": {"ollama": {"models": ["existing-model"], "future_setting": "keep",
                                  "api_key": "synthetic-credential"}},
        "future_extension": {"schema": 7, "enabled": True},
    }
    config_file = home / "config.yaml"
    config_file.write_text(yaml.safe_dump(existing), encoding="utf-8")
    (home / ".env").write_text("PROFILE_PERSISTENCE_MARKER=existing\n", encoding="utf-8")
    auth_file = home / "auth.json"
    auth_file.write_text(json.dumps({"providers": {"controlled-oauth": {"fixture": True}}}), encoding="utf-8")
    auth_before = auth_file.read_bytes()
    (base / "active_profile").write_text(profile, encoding="utf-8")
    if profile != "default":
        # Distinct root configuration catches silently selecting the wrong home.
        (base / "config.yaml").write_text("model: {provider: root-only, default: wrong}\n", encoding="utf-8")
    before = config_file.read_bytes()
    env = {key: value for key, value in os.environ.items()
           if not key.startswith(("SIDEKICK_", "HERMES_", "LASTBROWSER_"))}
    env.update({"SIDEKICK_HOME": str(base), "LASTBROWSER_HOME": str(base),
                "SIDEKICK_WEBUI_STATE_DIR": str(base / "webui"),
                "SIDEKICK_WEBUI_AGENT_DIR": str(Path(__file__).resolve().parents[1])})
    script = """
import json, os
from web.api import config, profiles, fastapi_bridge, oauth
fastapi_bridge._prepare_webui_runtime()
first = config.get_config()
fastapi_bridge._prepare_webui_runtime()
assert config.get_config() == first
print('PERSISTENCE_RESULT=' + json.dumps({
    'profile': profiles.get_active_profile_name(),
    'config': first,
    'path': str(config._get_config_path()),
    'env': os.environ.get('PROFILE_PERSISTENCE_MARKER'),
    'authPath': str(oauth.AUTH_JSON_PATH),
}))
"""
    # Two fresh interpreters model the first launch and the post-update restart.
    for _restart in range(2):
        result = subprocess.run([sys.executable, "-c", script], env=env,
                                cwd=Path(__file__).resolve().parents[1],
                                text=True, capture_output=True, timeout=45)
        assert result.returncode == 0, result.stderr
        payload = json.loads(next(line.removeprefix("PERSISTENCE_RESULT=")
                                  for line in result.stdout.splitlines()
                                  if line.startswith("PERSISTENCE_RESULT=")))
        assert payload["profile"] == profile
        assert Path(payload["path"]) == config_file
        assert payload["config"] == existing
        assert payload["env"] == "existing"
        assert Path(payload["authPath"]) == auth_file
        assert config_file.read_bytes() == before
        assert auth_file.read_bytes() == auth_before


def test_independent_bridge_does_not_load_interactive_profile_or_dotenv(tmp_path):
    base = tmp_path / "runtime"
    worker_home = base / "profiles" / "worker"
    interactive_home = base / "profiles" / "interactive"
    worker_home.mkdir(parents=True)
    interactive_home.mkdir(parents=True)
    (base / "active_profile").write_text("interactive", encoding="utf-8")
    (interactive_home / ".env").write_text("PROFILE_PERSISTENCE_MARKER=foreign\n", encoding="utf-8")
    env = {key: value for key, value in os.environ.items()
           if not key.startswith(("SIDEKICK_", "HERMES_", "LASTBROWSER_"))}
    env.update({"SIDEKICK_HOME": str(worker_home), "SIDEKICK_BASE_HOME": str(base),
                "LASTBROWSER_HOME": str(worker_home), "LASTBROWSER_INDEPENDENT_WORKER": "1",
                "SIDEKICK_WEBUI_STATE_DIR": str(worker_home / "webui"),
                "SIDEKICK_WEBUI_AGENT_DIR": str(Path(__file__).resolve().parents[1]),
                "PROFILE_PERSISTENCE_MARKER": "filtered"})
    script = """
import os
from web.api import profiles, fastapi_bridge
def forbidden_interactive_init():
    raise AssertionError('Independent worker must not reload interactive profile')
profiles.init_profile_state = forbidden_interactive_init
home_before = os.environ['SIDEKICK_HOME']
fastapi_bridge._prepare_webui_runtime()
assert os.environ['SIDEKICK_HOME'] == home_before
assert os.environ['PROFILE_PERSISTENCE_MARKER'] == 'filtered'
"""
    result = subprocess.run([sys.executable, "-c", script], env=env,
                            cwd=Path(__file__).resolve().parents[1], text=True,
                            capture_output=True, timeout=45)
    assert result.returncode == 0, result.stderr
