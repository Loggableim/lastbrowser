"""Native standard chat only advertises tools available to its bound worker."""
import json
from pathlib import Path

from run_agent import AIAgent
from model_tools import get_tool_definitions
from runtime.independent import native_chat_policy as policy
from runtime.independent.native_chat_host import build_native_environment
from test_native_chat_process import fixture_context
from web.api.config import _DEFAULT_TOOLSETS


def _prompt(agent) -> str:
    return "\n".join(agent._build_system_prompt_parts().values())


def test_native_standard_chat_prompt_matches_the_sandboxed_tool_list(tmp_path, monkeypatch):
    """Skills stay enabled in the desktop toolset config, but this turn cannot call them.

    The fixed native profile exposes only the sandboxed file tools. The prompt
    must not name skill_view or claim an MCP skill catalog unless that tool is
    actually in the list. Profile and runtime paths stay outside the file scope.
    """
    context, store = fixture_context(tmp_path, "prompt")
    catalog_calls = []

    def catalog(*args, **kwargs):
        catalog_calls.append((args, kwargs))
        return "MUST load it with skill_view(name) from <available_skills>"

    monkeypatch.setitem(
        AIAgent._build_system_prompt_parts.__globals__,
        "build_skills_system_prompt",
        catalog,
    )
    agent = AIAgent(
        model="gpt-4o-mini",
        provider="openai",
        api_key="test-key",
        base_url="https://api.openai.com/v1",
        enabled_toolsets=["file", "clarify"],
        quiet_mode=True,
        skip_context_files=True,
        load_soul_identity=False,
    )
    try:
        for key, value in build_native_environment(context).items():
            monkeypatch.setenv(key, value)
        monkeypatch.setattr(policy, "_context", None)
        policy.bind_native_policy(context)
        definitions = get_tool_definitions(
            enabled_toolsets=[*_DEFAULT_TOOLSETS, "mcp-foreign"],
            quiet_mode=True,
        )
        names = {row["function"]["name"] for row in definitions}
        assert names <= policy._SAFE_TOOLS
        assert {"read_file", "write_file", "patch", "search_files", "clarify"} <= names
        assert "skill_view" not in names
        assert "skills_list" not in names
        assert not any("mcp" in name.lower() for name in names)
        assert policy.native_tool_denial("skill_view", {"name": "sidekick-agent"}) == "native_chat_tool_requires_bound_broker"
        assert policy.native_tool_denial("read_file", {"path": str(Path(context.profile_home) / "auth.json")}) == "native_chat_file_scope_denied"
        assert policy.native_tool_denial("read_file", {"path": str(Path(context.profile_home).parent)}) == "native_chat_file_scope_denied"

        agent.valid_tool_names = set(names)
        prompt = _prompt(agent)
        assert "skill_view" not in prompt
        assert "<available_skills>" not in prompt
        assert "MCP" not in prompt
        assert catalog_calls == []

        agent.valid_tool_names = set(names) | {"skill_view"}
        enabled = _prompt(agent)
        assert "skill_view(name='sidekick-agent')" in enabled
        assert catalog_calls
    finally:
        policy.release_native_policy()
        store.close()


def test_native_chat_offers_terminal_only_when_enabled_for_bound_session(tmp_path, monkeypatch):
    context, store = fixture_context(tmp_path, "terminal-prompt")
    session_path = Path(context.sessions_dir) / f"{context.session_id}.json"
    session = json.loads(session_path.read_text("utf-8"))
    session["enabled_toolsets"] = ["terminal"]
    session_path.write_text(json.dumps(session), "utf-8")
    try:
        for key, value in build_native_environment(context).items():
            monkeypatch.setenv(key, value)
        monkeypatch.setattr(policy, "_context", None)
        policy.bind_native_policy(context)

        definitions = get_tool_definitions(enabled_toolsets=["terminal"], quiet_mode=True)
        names = {row["function"]["name"] for row in definitions}

        assert "terminal" in names
        assert policy.native_tool_denial("terminal", {"command": "printf approval-test"}) is None
    finally:
        policy.release_native_policy()
        store.close()
