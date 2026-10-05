"""Private worker transport only; it cannot mint browser authority."""
import json
import os
import threading
import uuid
from runtime.chat_modes import ChatExecutionPolicy, tool_denial
from .contracts import canonical_json, new_id
from .native_browser_contracts import NATIVE_BROWSER_TOOLS, validate_browser_payload
from .native_chat_protocol import verify_native_context
from .policy import PolicyDenied

_bound_bridge = None
_lock = threading.Lock()


class NativeBrowserBridge:
    def __init__(self, context, rpc):
        self.context, self.rpc = context, rpc

    def execute(self, name, arguments, policy, *, tool_call_id=None, task_id=None):
        if not isinstance(policy, ChatExecutionPolicy):
            raise PolicyDenied("native_browser_captured_policy_required")
        denied = tool_denial(policy, name, arguments)
        if denied:
            raise PolicyDenied(denied)
        verify_native_context(self.context)
        operation_id = uuid.uuid5(uuid.NAMESPACE_URL,
            canonical_json([self.context.stream_id, task_id, tool_call_id])).hex if tool_call_id else new_id()
        payload = {"operationId": operation_id, "toolName": name, "arguments": arguments,
            "executionMode": policy.mode, "executionPolicyRevision": policy.revision}
        try:
            validate_browser_payload(payload)
        except (ValueError, TypeError) as exc:
            raise PolicyDenied("native_browser_request_invalid") from exc
        response = self.rpc.call("browser_execute", payload, timeout=60)
        if (not isinstance(response, dict) or response.get("operationId") != operation_id
                or response.get("acknowledged") is not True):
            raise PolicyDenied("native_browser_effect_unacknowledged")
        verify_native_context(self.context)
        return json.dumps(response.get("result"), ensure_ascii=False)


def install_native_browser_bridge(context, rpc):
    global _bound_bridge
    with _lock:
        if os.getenv("LASTBROWSER_NATIVE_CHAT_WORKER") != "1":
            raise PolicyDenied("native_browser_private_worker_required")
        verify_native_context(context)
        if _bound_bridge is not None and (_bound_bridge.context != context or _bound_bridge.rpc is not rpc):
            raise PolicyDenied("native_browser_worker_rebind_denied")
        if _bound_bridge is None:
            _bound_bridge = NativeBrowserBridge(context, rpc)
        return _bound_bridge


def has_bound_native_browser_bridge(context):
    from .native_chat_policy import get_bound_native_context
    return (_bound_bridge is not None and _bound_bridge.context == context
        and get_bound_native_context() == context)


def native_browser_dispatch(name, arguments, policy, *, tool_call_id=None, task_id=None):
    if os.getenv("LASTBROWSER_NATIVE_CHAT_WORKER") != "1" or name not in NATIVE_BROWSER_TOOLS:
        return None
    if _bound_bridge is None or not has_bound_native_browser_bridge(_bound_bridge.context):
        raise PolicyDenied("native_browser_parent_broker_required")
    return _bound_bridge.execute(name, arguments, policy, tool_call_id=tool_call_id, task_id=task_id)
