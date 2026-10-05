"""Parent-ordered native file effects, durable receipts and confirmed exit."""
from __future__ import annotations
from dataclasses import asdict
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
import uuid

from runtime.chat_modes import ChatExecutionPolicy, tool_denial
from .contracts import canonical_json, digest_json, new_id, utc_now
from .native_file_contracts import FILE_TOOLS, MAX_FILE_RESULT_BYTES, validate_file_payload
from .native_chat_protocol import verify_native_context
from .policy import PolicyDenied
from .store import ResourceBusy


def _bind_paths(context, request, policy):
    from .native_chat_policy import _canonical_tool_path, _protected_tool_path
    denied = tool_denial(policy, request.tool_name, request.arguments)
    if denied: raise PolicyDenied(denied)
    arguments = dict(request.arguments)
    path = _canonical_tool_path(arguments.get("path", context.workspace if request.tool_name == "search_files" else ""), Path(context.workspace))
    if not arguments.get("path") and request.tool_name != "search_files":
        raise PolicyDenied("native_file_path_required")
    if _protected_tool_path(path, context, mutation=request.tool_name in {"patch", "write_file"}, recursive=request.tool_name == "search_files"):
        raise PolicyDenied("native_chat_control_path_denied")
    arguments["path"] = str(path)
    if request.tool_name == "patch" and arguments.get("mode", "replace") != "replace":
        raise PolicyDenied("native_chat_multifile_patch_requires_broker")
    if request.tool_name == "search_files" and arguments.get("context", 0) != 0:
        raise PolicyDenied("native_file_search_context_unsupported")
    return request.model_copy(update={"arguments": arguments})


class NativeFileIOFence:
    """One actual turn. A pending/unknown write never receives replay authority."""
    def __init__(self, sdk_broker, execution_policy, *, python_executable=None):
        self.broker, self.context = sdk_broker, sdk_broker.context
        self.store = sdk_broker.service.store
        self.policy = execution_policy
        self.python_executable = str(python_executable or sys.executable)
        self._lock = threading.RLock()
        self._settled = threading.Condition(self._lock)
        self._stopping = threading.Event()
        self._active = {}
        with self.broker.service.manager._lock:
            self.broker.service.manager._native_file_fences[id(self)] = self

    def _validate(self, request):
        if self._stopping.is_set(): raise PolicyDenied("native_file_turn_stopping")
        if not isinstance(self.policy, ChatExecutionPolicy): raise PolicyDenied("native_file_captured_policy_required")
        if request.execution_mode != self.policy.mode or request.execution_policy_revision != self.policy.revision:
            raise PolicyDenied("native_file_execution_policy_changed")
        verify_native_context(self.context)
        self.broker._validate()
        decision = self.broker._decision
        if decision is None: raise PolicyDenied("native_file_bound_sdk_decision_required")
        self.broker.service.validate_decision(decision)
        authority = self.store.get_permission_state(self.context.scope)
        if authority["revision"] != decision.context.permission_revision or authority["controlEpoch"] != decision.context.control_epoch:
            raise PolicyDenied("native_file_authority_changed")
        managed = self.broker.service.manager._governance(decision.context, prepare=True)
        if managed:
            authorizer = getattr(self.broker.service.manager, "native_file_authorizer", None)
            if not callable(authorizer): authorizer = getattr(getattr(self.broker, "native_governance", None), "file_authorizer", None)
            if not callable(authorizer) or authorizer(self.context, request, self.policy) is not True:
                raise PolicyDenied("native_file_nova_action_adapter_required")
        return authority

    def execute(self, payload):
        governance = getattr(self.broker, "native_governance", None)
        request = validate_file_payload(payload)
        if governance is not None and governance.managed:
            bound = _bind_paths(self.context, request, self.policy)
            with governance.file_boundary(self.context, bound, self.policy):
                return self._execute(bound.model_dump(mode="json", by_alias=True))
        return self._execute(payload)

    def _execute(self, payload):
        request = validate_file_payload(payload)
        request_data = {"sessionId": self.context.session_id, "streamId": self.context.stream_id,
            "writerGeneration": self.context.writer_generation, "toolName": request.tool_name,
            "argumentsDigest": digest_json(request.arguments), "executionMode": request.execution_mode,
            "executionPolicyRevision": request.execution_policy_revision}
        scope, identity = self.context.scope, request.operation_id
        process = tree = lease = None
        confirmed = False
        # SQL authorization and launch commit precede IO dispatch. Revocation
        # cannot pass that transaction without becoming visible to the child.
        with self._lock, self.store.transaction():
            authority = self._validate(request)
            bound = _bind_paths(self.context, request, self.policy)
            result = self.store.get_request_result(scope, "native_file_result", identity, request_data)
            if result is not None:
                if result.get("effectKnown") is not True: raise PolicyDenied("native_file_unknown_effect_no_replay")
                return result
            if self.store.get_request_result(scope, "native_file_started", identity, request_data) is not None:
                raise PolicyDenied("native_file_unknown_effect_no_replay")
            if request.tool_name in {"write_file", "patch"}:
                unresolved = self.store._many("SELECT request_id FROM ia_request_results WHERE scope_key=? AND operation='native_file_started' AND request_digest=?", (scope.key, digest_json(request_data)))
                if any((self.store.get_request_result(scope, "native_file_result", row[0], request_data) or {}).get("effectKnown") is not True for row in unresolved):
                    raise PolicyDenied("native_file_unknown_effect_no_replay")
            if len(self._active) >= 2: raise ResourceBusy("Native file operation capacity is occupied")
            # Serialize IO across all chats/children of the same actual Space,
            # including a search that overlaps a writing target.
            from web.api.local_ai_setup import process_identity
            state, creation = process_identity(os.getpid())
            if state != "alive" or creation is None: raise PolicyDenied("native_file_host_identity_unknown")
            resource = "native_file:" + digest_json(scope.key)
            recover_native_file_leases(self.store, scope)
            existing = self.store._one("SELECT lease_id FROM ia_resource_leases WHERE resource_key=? AND state='active'", (resource,))
            if existing: raise ResourceBusy("This Space already has an active file effect")
            lease = {"leaseId": new_id(), "resourceKey": resource, "scope": scope.model_dump(mode="json", by_alias=True),
                "scopeKey": scope.key, "runId": None, "ownerKind": "native_file", "ownerRef": identity,
                "ownerGeneration": self.context.writer_generation, "state": "active", "revision": 1,
                "expiresAt": "2099-01-01T00:00:00Z", "hostPid": os.getpid(), "hostCreationIdentity": creation,
                "launchPending": True}
            self.store._conn.execute("INSERT INTO ia_resource_leases VALUES(?,?,?,?,?,?,?,?,?)", (lease["leaseId"], resource,
                self.store._scope(scope), None, self.context.writer_generation, 1, lease["expiresAt"], "active", canonical_json(lease)))
            self.store._remember(scope, "native_file_started", identity, request_data,
                {"state": "started", "at": utc_now(), "permissionRevision": authority["revision"],
                    "controlEpoch": authority["controlEpoch"], "leaseId": lease["leaseId"]})
            from .native_chat_host import build_native_environment
            from .worker_host import _ProcessTree
            root = str(Path(__file__).resolve().parents[2])
            bootstrap = "import runpy,sys;sys.path.insert(0,sys.argv[1]);runpy.run_module(sys.argv[2],run_name='__main__')"
            options = {"creationflags": subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
            # No profile .env/provider/plugin import in the IO executor.
            environment = build_native_environment(self.context, runtime_env={})
            try:
                process = subprocess.Popen([self.python_executable, "-I", "-B", "-u", "-c", bootstrap, root,
                    "runtime.independent.native_file_executor"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL, encoding="utf-8", errors="strict", text=True,
                    cwd=self.context.workspace, env=environment, close_fds=True, **options)
                tree = _ProcessTree(process)
                state, child_creation = process_identity(process.pid)
                if state != "alive" or child_creation is None: raise PolicyDenied("native_file_child_identity_unknown")
                lease.update(childPid=process.pid, childCreationIdentity=child_creation, launchPending=False)
                self.store._conn.execute("UPDATE ia_resource_leases SET data_json=? WHERE lease_id=?", (canonical_json(lease), lease["leaseId"]))
                self._active[identity] = (process, tree)
                initial = {"context": self.context.model_dump(mode="json", by_alias=True),
                    "request": bound.model_dump(mode="json", by_alias=True), "policy": asdict(self.policy),
                    "permissionRevision": authority["revision"], "controlEpoch": authority["controlEpoch"]}
            except BaseException:
                if process is not None:
                    process.kill(); process.wait(timeout=3)
                if tree is not None: tree.close()
                if process is not None:
                    for pipe in (process.stdin, process.stdout):
                        if pipe is not None: pipe.close()
                self._active.pop(identity, None)
                raise
        try:
            # The launch receipt/PID are durable before the executor can read
            # its command. A commit failure cannot leave an unjournalled write.
            with self._lock, self.store.transaction():
                self._validate(bound)
                process.stdin.write(canonical_json(initial) + "\n")
                process.stdin.flush()
                process.stdin.close()
                process.stdin = None
            # Child output is bounded independently of payload size. There is
            # no model token/compute reservation for a stdlib file effect.
            output, _ = process.communicate(timeout=12)
            confirmed = process.poll() is not None
            if process.returncode != 0 or len(output.encode("utf-8")) > MAX_FILE_RESULT_BYTES * 2:
                raise PolicyDenied("native_file_effect_unacknowledged")
            result = json.loads(output)
            if (not isinstance(result, dict) or result.get("operationId") != identity
                or result.get("acknowledged") is not True or not isinstance(result.get("result"), dict)):
                raise PolicyDenied("native_file_effect_ack_invalid")
            result.update(processExited=True, state="completed", effectKnown=True)
            with self.store.transaction():
                self.store._remember(scope, "native_file_result", identity, request_data, result)
            return result
        except (OSError, ValueError, subprocess.TimeoutExpired, PermissionError) as error:
            if process.poll() is None:
                process.kill()
                try: process.wait(timeout=3)
                except subprocess.TimeoutExpired: pass
            # Preserve the uncertainty itself. A confirmed process exit is an
            # ACK of shutdown, never proof that an interrupted write succeeded.
            unknown = {"operationId": identity, "acknowledged": False, "processExited": process.poll() is not None,
                "state": "unknown", "effectKnown": False, "result": {"error": "native_file_unknown_effect_no_replay"}}
            self.store.record_request_result(scope, "native_file_result", identity, request_data, unknown)
            raise PolicyDenied("native_file_unknown_effect_no_replay") from error
        finally:
            if process.poll() is None:
                process.kill()
                try: process.wait(timeout=3)
                except subprocess.TimeoutExpired: pass
            confirmed = process.poll() is not None
            if tree is not None: tree.close()
            for pipe in (process.stdin, process.stdout):
                if pipe is not None: pipe.close()
            with self._lock:
                if confirmed:
                    self._active.pop(identity, None)
                    self.store.release_lease(lease["leaseId"], owner_generation=self.context.writer_generation)
                    self._settled.notify_all()

    def request_stop(self, reason="cancel"):
        with self._lock:
            self._stopping.set()  # Ordered before inspecting/terminating IO.
            active = tuple(self._active.values())
        for process, tree in active:
            if process.poll() is None:
                process.kill()
            try: process.wait(timeout=3)
            except subprocess.TimeoutExpired: continue
            tree.close()
        deadline = time.monotonic() + 3
        with self._settled:
            while self._active and time.monotonic() < deadline:
                self._settled.wait(timeout=max(0.001, deadline - time.monotonic()))
            settled = not self._active
        exited = all(process.poll() is not None for process, _ in active)
        return {"acknowledged": exited and settled, "processesExited": exited, "reasonCode": reason}

    def decide_approval(self, approval_id, *, approved, actor_ref, action_digest,
            expected_permission_revision, expected_control_epoch, client_request_id):
        if self._stopping.is_set(): raise PolicyDenied("native_file_turn_stopping")
        governance = getattr(self.broker, "native_governance", None)
        if governance is None or not governance.managed:
            raise PolicyDenied("native_file_approval_not_found")
        return governance.decide_file_approval(approval_id, approved=approved, actor_ref=actor_ref,
            action_digest=action_digest, expected_permission_revision=expected_permission_revision,
            expected_control_epoch=expected_control_epoch, client_request_id=client_request_id)


class NativeFileBridge:
    def __init__(self, context, rpc): self.context, self.rpc = context, rpc

    def execute(self, name, arguments, policy, *, tool_call_id=None, task_id=None):
        if not isinstance(policy, ChatExecutionPolicy): raise PolicyDenied("native_file_captured_policy_required")
        identity = uuid.uuid5(uuid.NAMESPACE_URL, canonical_json([self.context.stream_id, task_id, tool_call_id])).hex if tool_call_id else new_id()
        from .worker_host import WorkerError
        try:
            response = self.rpc.call("file_execute", {"operationId": identity, "toolName": name, "arguments": arguments,
                "executionMode": policy.mode, "executionPolicyRevision": policy.revision}, timeout=25)
        except (WorkerError, TimeoutError, PermissionError) as error:
            raise PolicyDenied("native_file_parent_dispatch_denied") from error
        if (not isinstance(response, dict) or response.get("operationId") != identity
            or response.get("acknowledged") is not True or response.get("processExited") is not True):
            raise PolicyDenied("native_file_effect_unacknowledged")
        return json.dumps(response["result"], ensure_ascii=False)


_bound_bridge = None
_binding_lock = threading.Lock()


def install_native_file_bridge(context, rpc):
    global _bound_bridge
    with _binding_lock:
        if os.getenv("LASTBROWSER_NATIVE_CHAT_WORKER") != "1": raise PolicyDenied("native_file_private_worker_required")
        verify_native_context(context)
        if _bound_bridge is not None and (_bound_bridge.context != context or _bound_bridge.rpc is not rpc):
            raise PolicyDenied("native_file_worker_rebind_denied")
        if _bound_bridge is None: _bound_bridge = NativeFileBridge(context, rpc)
        return _bound_bridge


def native_file_dispatch(name, arguments, policy, *, tool_call_id=None, task_id=None):
    if os.getenv("LASTBROWSER_NATIVE_CHAT_WORKER") != "1" or name not in FILE_TOOLS: return None
    if _bound_bridge is None: raise PolicyDenied("native_file_parent_broker_required")
    return _bound_bridge.execute(name, arguments, policy, tool_call_id=tool_call_id, task_id=task_id)


def recover_native_file_leases(store, scope, *, identity_reader=None):
    """Old unknown effects stay journalled; only actual exited owners free IO."""
    if identity_reader is None:
        from web.api.local_ai_setup import process_identity
        identity_reader = process_identity
    released, blocked = [], []
    with store.transaction():
        for lease in store.list_leases():
            if lease.get("ownerKind") != "native_file" or lease.get("runId") is not None or lease.get("scope") != scope.model_dump(mode="json", by_alias=True):
                continue
            try:
                if lease.get("launchPending") is not False: raise ValueError("native_file_launch_unverified")
                dead = []
                for prefix in ("host", "child"):
                    pid, creation = lease.get(prefix + "Pid"), lease.get(prefix + "CreationIdentity")
                    if type(pid) is not int or pid <= 0 or not isinstance(creation, str): raise ValueError("native_file_identity_missing")
                    state, actual = identity_reader(pid)
                    dead.append(state == "dead" or state == "alive" and actual is not None and actual != creation)
                if not all(dead): raise ValueError("native_file_process_exit_unverified")
            except (OSError, TypeError, ValueError):
                blocked.append(lease["leaseId"])
                continue
            store.release_lease(lease["leaseId"], owner_generation=lease["ownerGeneration"])
            released.append(lease["leaseId"])
    return {"releasedLeaseIds": released, "blockedLeaseIds": blocked}
