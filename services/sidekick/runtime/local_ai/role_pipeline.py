"""Product task routes using the existing scoped model manager, never bootstrap.

Bindings are supplied by the authenticated backend profile resolver, not IPC.
Results are data only: no tool effects, memory writes or provider switching.
"""
from __future__ import annotations
import threading
import time
import contextvars
from typing import Annotated, Literal
from pydantic import Field, model_validator
from runtime.independent.contracts import Contract, Scope, Ref, Id
from runtime.independent.store import ResourceBusy
from .model_manager import ModelLoadRequest
from .role_adapters import RoleRequest

Task = Literal['chat.answer', 'browser.extract', 'browser.vision', 'memory.embed', 'memory.query', 'retrieval.query',
               'retrieval.document', 'task.extract', 'agent', 'encoder']
TASK_ROLES = {'chat.answer':'chat', 'browser.extract':'extract', 'browser.vision':'vision', 'memory.embed':'embed', 'memory.query':'embed',
              'retrieval.query':'retrieve', 'retrieval.document':'retrieve',
              'task.extract':'extract', 'agent':'agent', 'encoder':'encoder'}


class RoleTaskRequest(Contract):
    operation: Literal['executeRole']
    client_request_id: Id
    task: Task
    profile_revision: Ref
    input: RoleRequest
    budget_seconds: Annotated[int, Field(ge=1, le=30)] = 20

    @model_validator(mode='after')
    def task_binding(self):
        if self.input.role != TASK_ROLES[self.task]:
            raise ValueError('local_task_role_mismatch')
        kind = {'retrieval.query':'query', 'retrieval.document':'document', 'memory.embed':'document', 'memory.query':'query'}.get(self.task)
        if self.input.input_kind != kind:
            raise ValueError('local_task_input_kind_mismatch')
        if self.task == 'chat.answer' and self.input.max_output_tokens > 48:
            raise ValueError('local_chat_output_budget_exceeded')
        return self


class ScopedRoleBinding(Contract):
    """Host-only snapshot of a current profile's installed approved role."""
    actor: Ref
    profile_revision: Ref
    task: Task
    load: ModelLoadRequest

    @model_validator(mode='after')
    def exact_role(self):
        if self.load.role != TASK_ROLES[self.task] or self.load.parallel_requests != 1:
            raise ValueError('local_profile_role_binding_invalid')
        if self.task == 'chat.answer' and (self.load.context_tokens > 1024 or self.load.parallel_requests != 1):
            raise ValueError('bounded_chat_context_or_parallelism_exceeded')
        if self.task not in ('agent','chat.answer') and self.load.context_tokens > 4096:
            raise ValueError('bounded_task_context_exceeded')
        return self


class BackendRolePipeline:
    """Sequential product requests; caller keeps its Core owner until cleanup ACK.

    resolve(scope, actor, task) must read current persisted profile revision and
    return ScopedRoleBinding (or raise). It may not manufacture runtime proof.
    """
    def __init__(self, manager, resolve):
        self.manager, self.resolve = manager, resolve
        self._lock = threading.Lock()
        self._active = None
        self._closed = False

    def _binding(self, scope, actor, request):
        binding = self.resolve(scope, actor, request.task)
        if not isinstance(binding, ScopedRoleBinding):
            raise ValueError('typed_local_role_binding_required')
        if (binding.actor != actor or binding.load.scope != scope or binding.task != request.task
                or binding.profile_revision != request.profile_revision):
            raise PermissionError('local_role_profile_scope_or_revision_changed')
        return binding

    def execute(self, scope: Scope, actor, request: RoleTaskRequest, *, cancel=None):
        if self.manager.fixture_only:
            raise PermissionError('synthetic_manager_forbidden_in_product_pipeline')
        if not self._lock.acquire(blocking=False):
            raise ResourceBusy('local_role_pipeline_busy')
        handle = None
        watcher = None
        stop_watch = threading.Event()
        cancelled = threading.Event()
        deadline = time.monotonic() + request.budget_seconds
        try:
            if self._closed: raise ResourceBusy('local_role_pipeline_closed')
            if self._active is not None: raise ResourceBusy('local_role_cleanup_pending')
            if cancel is not None and cancel.is_set(): raise RuntimeError('local_role_task_cancelled')
            binding = self._binding(scope, actor, request)
            # Normal acquire requires installed SHA, approved plan, operation and
            # memory proof, exact adapter, scan, generation and existing owner.
            view = self.manager.acquire(binding.load, actor=actor)
            handle = view.handle_id
            self._active = (scope, actor, request.client_request_id, handle, cancelled)

            def watch():
                while not stop_watch.wait(.05):
                    if time.monotonic() >= deadline or cancel is not None and cancel.is_set():
                        cancelled.set()
                        self.manager.unload(handle, scope, timeout=2)
                        return
                    try:
                        if self._binding(scope, actor, request) != binding:
                            raise PermissionError('local_role_binding_changed')
                    except Exception:
                        cancelled.set()
                        self.manager.unload(handle, scope, timeout=2)
                        return

            bound_context = contextvars.copy_context()
            watcher = threading.Thread(target=lambda:bound_context.run(watch), name='local-role-cancel', daemon=True)
            watcher.start()
            view = self.manager.wait(handle, scope, timeout=min(20, max(0, deadline-time.monotonic())))
            if cancelled.is_set() or time.monotonic() >= deadline: raise RuntimeError('local_role_task_cancelled')
            if view.state != 'ready' or not view.available or view.synthetic:
                raise ResourceBusy('local_role_not_product_ready')
            if self._binding(scope, actor, request) != binding: raise PermissionError('local_role_binding_changed')
            self.manager.refresh(handle, scope)
            result = self.manager.execute(handle, scope, request.input)
            if cancelled.is_set() or time.monotonic() >= deadline: raise RuntimeError('local_role_task_cancelled')
            if self._binding(scope, actor, request) != binding: raise PermissionError('local_role_binding_changed')
            self.manager.refresh(handle, scope)
            return {'operation':'executeRole', 'clientRequestId':request.client_request_id,
                    'task':request.task, 'profileRevision':binding.profile_revision,
                    'result':{k:v for k,v in result.items() if k not in ('handleId','synthetic')}}
        finally:
            stop_watch.set()
            if watcher is not None: watcher.join(timeout=3)
            try:
                if handle is not None:
                    if not self.manager.unload(handle, scope, timeout=5):
                        # Retain the active identity; caller must retain compute
                        # admission and retry cleanup. Never acknowledge release.
                        raise ResourceBusy('local_role_cleanup_pending')
                    self._active = None
            finally:
                self._lock.release()

    def cancel(self, scope, actor, client_request_id):
        active = self._active
        if active is None: return True
        if active[:3] != (scope, actor, client_request_id):
            raise PermissionError('local_role_cancel_scope_mismatch')
        active[4].set()
        stopped = self.manager.unload(active[3], scope, timeout=5)
        if stopped: self._active = None
        return stopped

    def close(self):
        self._closed = True
        active = self._active
        return active is None or self.cancel(*active[:3])
