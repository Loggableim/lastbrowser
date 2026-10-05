"""Exercise real delegate orchestration with a controlled provider runner."""
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from types import SimpleNamespace
from uuid import uuid4
import pytest
from runtime.chat_modes import ChatExecutionPolicy
from runtime.independent.child_contracts import ChildParentContext
from runtime.independent.contracts import Scope
from runtime._compat.shim_state import SessionDB
from web.api.subagent_history import scoped_child_history


def setup_parent(tmp_path, monkeypatch, mode='action', iterations=8):
    import run_agent
    from tools import delegate_tool as d
    (tmp_path/'config.yaml').write_text('delegation:\n  max_iterations: 4\n  max_concurrent_children: 3\n')
    binding = ChildParentContext(Scope(backend_profile_id='a'*32, space_id='b'*32, browser_profile_id='default'), tmp_path, 'A', tmp_path/'sessions', 'parent', 'turn')
    db = SessionDB(tmp_path/'state.db')
    db.create_session('parent')
    events, parent_text = [], []
    parent = SimpleNamespace(_child_parent_context=binding, _delegate_depth=0,
        _credential_pool=None, _session_db=db, session_id='parent', platform='webui',
        provider='own-provider', model='own-model', base_url='https://example.invalid/v1',
        api_key='fixture', api_mode='chat_completions', enabled_toolsets=['terminal'],
        _active_children=[], _active_children_lock=threading.Lock(),
        iteration_budget=run_agent.IterationBudget(iterations),
        tool_progress_callback=lambda kind, *args, **kw: events.append((kind, kw)),
        stream_delta_callback=parent_text.append,
        _chat_execution_policy=ChatExecutionPolicy(mode, 3))
    monkeypatch.setenv('SIDEKICK_HOME', str(tmp_path/'foreign'))
    monkeypatch.setenv('DELEGATION_MAX_CONCURRENT_CHILDREN', '1000')
    return d, parent, events, parent_text


class ControlledChild:
    gate = None
    started = None
    instances = []
    def __init__(self, **kw):
        from run_agent import IterationBudget
        vars(self).update(kw)
        self._session_db = kw['session_db']
        self.session_id = uuid4().hex
        self.iteration_budget = IterationBudget(kw['max_iterations'])
        self._credential_pool = None
        self._interrupted = False
        self._active_children = []
        self.session_estimated_cost_usd = 0
        self.instances.append(self)
    def run_conversation(self, user_message, task_id, stream_callback):
        self._session_db.create_session(self.session_id, parent_session_id=self.parent_session_id)
        self._session_db.append_message(self.session_id, 'user', user_message)
        assert self.iteration_budget.consume()
        stream_callback(user_message+'-one')
        if self.started: self.started.wait(timeout=5)
        if self.gate: assert self.gate.wait(5)
        stream_callback('-two')
        answer = user_message+'-one-two'
        self._session_db.append_message(self.session_id, 'assistant', answer)
        return {'completed': not self._interrupted, 'interrupted': self._interrupted,
                'final_response': answer, 'api_calls': 1, 'messages': []}
    def get_activity_summary(self): return {'api_call_count': 1}
    def interrupt(self, *args): self._interrupted = True
    def close(self): self._session_db.close()


@pytest.fixture
def controlled(monkeypatch):
    import run_agent
    ControlledChild.instances = []
    ControlledChild.gate = ControlledChild.started = None
    monkeypatch.setattr(run_agent, 'AIAgent', ControlledChild)
    return ControlledChild


def test_real_parallel_delegate_stream_and_scoped_interrupt(tmp_path, monkeypatch, controlled):
    d, parent, events, parent_text = setup_parent(tmp_path, monkeypatch)
    controlled.started = threading.Barrier(3)
    controlled.gate = threading.Event()
    with ThreadPoolExecutor(1) as pool:
        result = pool.submit(d.delegate_task, tasks=[{'goal':'A'},{'goal':'B'}], parent_agent=parent)
        controlled.started.wait(timeout=5)
        active = d.list_active_subagents(parent_context=parent._child_parent_context)
        assert len(active) == 2
        assert d.list_active_subagents() == []
        foreign = replace(parent._child_parent_context, parent_turn_id='foreign')
        assert not d.interrupt_subagent(active[0]['subagent_id'], parent_context=foreign)
        assert d.interrupt_subagent(active[0]['subagent_id'], parent_context=parent._child_parent_context)
        controlled.gate.set()
        outcome = json.loads(result.result(timeout=10))
    history = scoped_child_history(parent._child_parent_context)
    assert len(history['runs']) == 2
    assert {r['status'] for r in history['runs']} == {'completed','interrupted'}
    assert {r['messages'][-1]['content'] for r in history['runs']} == {'A-one-two','B-one-two'}
    assert all(r['messages'][-1]['id'].startswith(r['childSessionId']+':') and r['messages'][-1]['at'] for r in history['runs'])
    assert all(child._chat_execution_policy is parent._chat_execution_policy for child in controlled.instances)
    assert parent_text == []
    assert parent.iteration_budget.used == 2
    assert len([e for kind,e in events if kind == 'subagent.answer_delta']) == 4
    assert d.list_active_subagents(parent_context=parent._child_parent_context) == []
    # The parent's DB remains usable after every child independently closes.
    parent._session_db.append_message('parent', 'assistant', 'parent own answer')
    assert not (tmp_path/'foreign'/'subagents.db').exists()
    parent._session_db.close()


@pytest.mark.parametrize('mode', ['plan','grill_me'])
def test_policy_cannot_be_widened_by_role_or_tasks(tmp_path, monkeypatch, controlled, mode):
    d, parent, _, _ = setup_parent(tmp_path, monkeypatch, mode)
    result = json.loads(d.delegate_task(goal='write', role='orchestrator', parent_agent=parent))
    assert 'error' in result and not controlled.instances
    parent._session_db.close()


def test_budget_and_foreign_parent_db_fail_closed(tmp_path, monkeypatch, controlled):
    d, parent, _, _ = setup_parent(tmp_path, monkeypatch, iterations=1)
    with pytest.raises(ValueError, match='budget'):
        d.delegate_task(tasks=[{'goal':'A'},{'goal':'B'}], parent_agent=parent)
    assert parent.iteration_budget.used == 0 and not parent._active_children
    parent._session_db.db_path = tmp_path.parent/'foreign.db'
    with pytest.raises(ValueError, match='captured profile'):
        d.delegate_task(goal='A', parent_agent=parent)
    assert not controlled.instances
    parent._session_db.close()


def test_config_and_credentials_do_not_use_ambient_profile(tmp_path, monkeypatch):
    d, parent, _, _ = setup_parent(tmp_path, monkeypatch)
    from runtime.independent.child_runtime import delegation_config
    token = delegation_config.set({})
    try:
        assert d._get_max_concurrent_children() == 3
        assert d._get_subagent_approval_callback() is d._subagent_auto_deny
        assert d._resolve_child_credential_pool('foreign-provider', parent) is None
        with pytest.raises(ValueError, match='credential bundle'):
            d._resolve_delegation_credentials({'provider':'foreign-provider'}, parent)
        with pytest.raises(ValueError, match='own profile-configured'):
            d._resolve_delegation_credentials({'base_url':'https://foreign.invalid'}, parent)
    finally:
        delegation_config.reset(token)
        parent._session_db.close()


def test_native_auto_child_does_not_install_credential_rotation(monkeypatch):
    from types import SimpleNamespace
    from tools import delegate_tool as d
    pool = object()
    parent = SimpleNamespace(provider="controlled", _credential_pool=pool,
                             _native_auto_bridge=object())
    monkeypatch.setenv("LASTBROWSER_NATIVE_CHAT_WORKER", "1")
    assert d._resolve_child_credential_pool("controlled", parent) is None
    assert d._resolve_child_credential_pool(None, parent) is None
    parent._native_auto_bridge = None
    assert d._resolve_child_credential_pool("controlled", parent) is pool
    parent._native_sdk_bridge = object()
    assert d._resolve_child_credential_pool("controlled", parent) is None
    parent._native_sdk_bridge = None
    parent._native_auto_bridge = object()
    monkeypatch.delenv("LASTBROWSER_NATIVE_CHAT_WORKER")
    assert d._resolve_child_credential_pool("controlled", parent) is pool


def test_native_fixed_child_receives_only_actual_fixed_bridge(tmp_path,monkeypatch,controlled):
    d,parent,_,_=setup_parent(tmp_path,monkeypatch)
    bridge=object()
    parent._native_sdk_bridge=bridge
    parent._native_auto_bridge=bridge  # internal shared execution alias
    monkeypatch.setenv("LASTBROWSER_NATIVE_CHAT_WORKER","1")
    result=json.loads(d.delegate_task(goal="A",parent_agent=parent))
    assert controlled.instances and controlled.instances[0].native_sdk_bridge is bridge
    assert not hasattr(controlled.instances[0],"native_auto_bridge")
    parent._session_db.close()


def test_failed_child_is_not_relabelled_completed_by_cleanup(tmp_path, monkeypatch, controlled):
    d, parent, _, parent_text = setup_parent(tmp_path, monkeypatch)
    def fail(self, **kwargs): raise RuntimeError('controlled provider failure')
    monkeypatch.setattr(controlled, 'run_conversation', fail)
    outcome = json.loads(d.delegate_task(goal='A', parent_agent=parent))
    history = scoped_child_history(parent._child_parent_context)
    assert history['runs'][0]['status'] == 'failed'
    assert history['runs'][0]['messages'] == []
    assert history['runs'][0]['sourceActuality'] == 'unavailable'
    assert parent.iteration_budget.used == 0 and parent_text == []
    parent._session_db.close()
