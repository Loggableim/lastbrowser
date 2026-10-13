import hashlib
import json
import secrets
from types import SimpleNamespace

import pytest
from web.api.local_inference import connection, space_configuration, fallback_for_space, is_owned_runtime
from cli.runtime_provider import resolve_runtime_provider
from run_agent import AIAgent


@pytest.fixture
def local_home(tmp_path, monkeypatch):
    catalog = tmp_path / "models.json"
    catalog.write_text(json.dumps([{"id": "tiny"}]), encoding="utf-8")
    (tmp_path / "runtime.key").write_text(secrets.token_hex(32), encoding="utf-8")
    monkeypatch.setenv("LASTBROWSER_LOCAL_AI_HOME", str(tmp_path))
    monkeypatch.setenv("LASTBROWSER_LOCAL_AI_CATALOG", str(catalog))
    return tmp_path


def test_dedicated_provider_ignores_cloud_key_and_endpoint(local_home, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "cloud-fixture")
    result = resolve_runtime_provider(requested="lastbrowser-local", target_model="tiny",
                                      explicit_api_key="untrusted-fixture", explicit_base_url="https://example.invalid")
    assert result["base_url"] == "http://127.0.0.1:11435/v1"
    assert result["api_key"] == (local_home / "runtime.key").read_text()
    assert result["provider"] == "custom"
    with pytest.raises(ValueError, match="Unknown"):
        connection("other")
    assert is_owned_runtime('tiny', result['base_url'], result['api_key'])
    assert not is_owned_runtime('tiny', 'https://example.invalid', result['api_key'])
    assert not is_owned_runtime('tiny', result['base_url'], 'untrusted-fixture')


def test_space_configuration_never_crosses_spaces(local_home):
    workspace = "space-one"
    filename = hashlib.sha256(workspace.encode()).hexdigest() + ".json"
    (local_home / filename).write_text(json.dumps({"workspace": workspace, "modelId": "tiny", "allowFallback": False}), encoding="utf-8")
    assert space_configuration(workspace)["modelId"] == "tiny"
    assert space_configuration("space-two") is None
    assert fallback_for_space(workspace) is None


@pytest.mark.parametrize("flag", ["_local_fallback_tools_started", "_local_fallback_response_started"])
def test_local_fallback_refuses_replay_after_tools_or_output(flag):
    agent = AIAgent.__new__(AIAgent)
    agent._fallback_chain = [{"provider": "custom", "model": "tiny", "safe_before_tools": True}]
    agent._fallback_index = 0
    setattr(agent, flag, True)
    messages = []
    agent._emit_status = messages.append
    assert agent._try_activate_fallback() is False
    assert "No action is replayed" in messages[0]


def test_uncertain_tool_failure_still_prevents_fallback(monkeypatch):
    import run_agent
    agent = AIAgent.__new__(AIAgent)
    monkeypatch.setattr(run_agent, "_should_parallelize_tool_batch", lambda calls: False)
    def fail(*args):
        raise RuntimeError("Unknown tool outcome")
    agent._execute_tool_calls_sequential = fail
    with pytest.raises(RuntimeError):
        agent._execute_tool_calls(SimpleNamespace(tool_calls=[object()]), [], "task")
    assert agent._local_fallback_tools_started is True


def test_unterminated_file_is_not_reported_as_zero_lines():
    from tools.file_operations import ShellFileOperations, ExecuteResult
    operations = ShellFileOperations(SimpleNamespace(cwd='.'))
    replies = iter(['13', 'Prüfwert: 73', 'Prüfwert: 73', '0'])
    operations._exec = lambda *args, **kwargs: ExecuteResult(next(replies), 0)
    result = operations.read_file('fixture.txt')
    assert result.total_lines == 1
    assert '73' in result.content
