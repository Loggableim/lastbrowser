"""Provider role compatibility must not rewrite durable user turns."""
import ast
import copy
import inspect
import textwrap

from run_agent import AIAgent
from web.api.streaming import _merge_display_messages_after_agent_result


def test_stop_recovery_provider_repair_preserves_clean_transcript():
    stop = "P004-FIX-STOP-1 interrupted synthetic request"
    recovery = "P004-FIX-RECOVERY-1 reply RECOVERED"
    history = [{"role": "user", "content": stop}]
    messages = copy.deepcopy(history) + [{
        "role": "user", "content": "[Workspace::v1:/synthetic/workspace]\n" + recovery,
    }]
    agent = AIAgent.__new__(AIAgent)
    agent._persist_user_message_idx = 1
    agent._persist_user_message_override = recovery

    # Execute the actual request-copy and role-repair statements from the
    # conversation loop, without a provider, credentials, or agent startup.
    tree = ast.parse(textwrap.dedent(inspect.getsource(AIAgent.run_conversation)))
    copy_loop = next(node for node in ast.walk(tree) if isinstance(node, ast.For)
                     and isinstance(node.target, ast.Tuple)
                     and [getattr(item, "id", None) for item in node.target.elts] == ["idx", "msg"]
                     and any(isinstance(child, ast.Name) and child.id == "api_msg"
                             for child in ast.walk(node)))
    repair = next(node for node in ast.walk(tree) if isinstance(node, ast.Assign)
                  and any(isinstance(target, ast.Name) and target.id == "repaired_seq"
                          for target in node.targets))
    agent._copy_reasoning_content_for_api = lambda *_: None
    agent._should_sanitize_tool_calls = lambda: False
    namespace = {"self": agent, "messages": messages, "api_messages": [],
                 "copy": copy, "current_turn_user_idx": 1,
                 "_ext_prefetch_cache": None, "_plugin_user_context": None}
    code = ast.fix_missing_locations(ast.Module(body=[copy_loop, repair], type_ignores=[]))
    exec(compile(code, "actual_request_preparation", "exec"), namespace)
    provider_messages = namespace["api_messages"]
    assert namespace["repaired_seq"] == 1
    assert len(provider_messages) == 1
    assert stop in provider_messages[0]["content"]
    assert recovery in provider_messages[0]["content"]
    assert len(messages) == 2
    assert messages[0] == history[0]

    agent._apply_persist_user_message_override(messages)
    messages.append({"role": "assistant", "content": "RECOVERED"})
    display = history + [{"role": "user", "content": recovery}]
    merged = _merge_display_messages_after_agent_result(display, history, messages, recovery)
    assert merged == display + [{"role": "assistant", "content": "RECOVERED"}]
    assert all("Workspace::v1" not in row["content"] for row in messages + merged)


def test_provider_copy_has_no_nested_aliases_to_authoritative_history():
    agent = AIAgent.__new__(AIAgent)
    messages = [{"role": "user", "content": [{"type": "text", "text": "synthetic"}]}]
    provider_messages = copy.deepcopy(messages)
    agent._repair_message_sequence(provider_messages)
    provider_messages[0]["content"][0]["text"] = "provider-only"
    assert messages[0]["content"][0]["text"] == "synthetic"
