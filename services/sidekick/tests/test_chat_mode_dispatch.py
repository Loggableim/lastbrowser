"""Exercise the actual dispatch entrances, including concurrent tool threads."""
import json
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest

from runtime.chat_modes import ChatExecutionPolicy


@pytest.mark.parametrize("mode,reason", [("plan", "plan_mode_read_only"), ("grill_me", "grill_me_tools_disabled")])
def test_central_dispatch_denies_before_coercion_hooks_or_registry(monkeypatch, mode, reason):
    import model_tools
    calls = []
    monkeypatch.setattr(model_tools, "coerce_tool_args", lambda *a: calls.append(a))
    value = json.loads(model_tools.handle_function_call("write_file", {"path": "irrelevant"}, execution_policy=ChatExecutionPolicy(mode, 2)))
    assert value == {"error": reason, "denied": True}
    assert calls == []


def test_instance_policy_applies_to_plain_tool_threads_and_prechecked_invocation(monkeypatch):
    from run_agent import AIAgent
    from cli import plugins
    agent = AIAgent.__new__(AIAgent)
    agent._chat_execution_policy = ChatExecutionPolicy("plan", 3)
    calls = []
    monkeypatch.setattr(plugins, "get_pre_tool_call_block_message", lambda *a, **kw: calls.append(a))
    with ThreadPoolExecutor(max_workers=2) as pool:
        values = list(pool.map(lambda name: agent._invoke_tool(name, {}, "actual-session", pre_tool_block_checked=True), ["terminal", "delegate_task"]))
    assert all(json.loads(value) == {"error": "plan_mode_read_only", "denied": True} for value in values)
    assert agent._runtime_tool_block_message("write_file", {}) == "plan_mode_read_only"
    assert calls == []


@pytest.mark.parametrize("method", ["_execute_tool_calls_sequential", "_execute_tool_calls_concurrent"])
def test_denied_batch_has_no_checkpoint_callback_memory_or_activity_effects(method):
    from run_agent import AIAgent
    agent = AIAgent.__new__(AIAgent)
    agent._chat_execution_policy = ChatExecutionPolicy("grill_me", 1)
    agent._interrupt_requested = False
    tool_calls = [SimpleNamespace(id=str(i), function=SimpleNamespace(name=name, arguments="{}"))
                  for i, name in enumerate(["write_file", "memory", "delegate_task", "terminal"])]
    messages = []
    getattr(agent, method)(SimpleNamespace(tool_calls=tool_calls), messages, "actual-session")
    assert [item["tool_call_id"] for item in messages] == [str(i) for i in range(4)]
    assert all(json.loads(item["content"]) == {"error": "grill_me_tools_disabled", "denied": True} for item in messages)
    assert not hasattr(agent, "_turns_since_memory")


def test_plan_reads_and_ordinary_invocations_keep_existing_dispatch(monkeypatch):
    import model_tools
    from run_agent import AIAgent
    calls = []
    monkeypatch.setattr(model_tools, "coerce_tool_args", lambda *a: calls.append(a) or {})
    monkeypatch.setattr(model_tools, "_AGENT_LOOP_TOOLS", {"read_file"})
    assert "must be handled" in model_tools.handle_function_call("read_file", {}, execution_policy=ChatExecutionPolicy("plan", 0))
    assert "must be handled" in model_tools.handle_function_call("read_file", {})
    assert len(calls) == 2
    agent = AIAgent.__new__(AIAgent)
    agent._runtime_hooks_enabled = False
    agent._chat_execution_policy = ChatExecutionPolicy("plan", 0)
    assert agent._runtime_tool_block_message("read_file", {}) is None
