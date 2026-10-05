from dataclasses import replace
import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor
import pytest
from runtime.independent.contracts import Scope
from runtime.independent.child_contracts import ChildParentContext, ChildRunContext
from web.api.subagent_history import emit_child_event, scoped_history, scoped_child_history, child_event_view, record


def parent(tmp_path, **kw):
    return ChildParentContext(scope=Scope(backend_profile_id='a'*32,space_id='b'*32,browser_profile_id='default'),profile_home=tmp_path,profile_name='A',sessions_dir=tmp_path/'sessions',parent_session_id='parent',parent_turn_id='turn',**kw)

def child(p, sid='child'):
    return ChildRunContext(p,sid,'session-'+sid,1,'model-A','provider-A')

def emit(c, kind='started', **payload):
    return emit_child_event(c,event_type=kind,payload=payload)

def test_parallel_children_parent_buffer_and_reload(tmp_path):
    p=parent(tmp_path)
    a,b=child(p,'a'),child(p,'b')
    emit(a);emit(b)
    with ThreadPoolExecutor(4) as pool:
        list(pool.map(lambda c:emit(c,'answer_delta',delta='same'),[a,b,a,b]))
    result=scoped_history(p)
    assert {r['subagentId'] for r in result['runs']} == {'a','b'}
    for sid in ('a','b'):
        events=[e for e in result['events'] if e['subagentId']==sid]
        assert [e['sequence'] for e in events]==[1,2,3]
        assert [e['payload']['delta'] for e in events[1:]]==['same','same']
    assert all(r['transcript']['messages']==[] for r in result['runs'])
    assert scoped_history(p)==result


def test_private_worker_reconcile_requires_confirmed_exit_or_older_root_generation(tmp_path):
    from web.api.subagent_history import reconcile_stale
    p = parent(tmp_path, process_generation="current-root")
    c = child(p)
    emit(c); emit(c, "answer_delta", delta="actual partial")
    assert reconcile_stale(tmp_path) == 0
    assert reconcile_stale(tmp_path, generation="current-root") == 0
    assert scoped_history(p)["runs"][0]["status"] == "running"
    assert reconcile_stale(tmp_path, generation="new-root") == 1
    assert scoped_history(p)["runs"][0]["status"] == "interrupted"


def test_private_worker_confirmed_turn_exit_reconcile_preserves_other_live_turn(tmp_path):
    from web.api.subagent_history import reconcile_stale
    p = parent(tmp_path, process_generation="current-root")
    other = replace(p, parent_turn_id="other-turn")
    emit(child(p, "a")); emit(child(other, "b"))
    assert reconcile_stale(tmp_path, generation="current-root", confirmed_worker_turns=(p.parent_turn_id,)) == 1
    assert scoped_history(p)["runs"][0]["status"] == "interrupted"
    assert scoped_history(other)["runs"][0]["status"] == "running"

def test_scope_profile_turn_and_legacy_are_excluded(tmp_path):
    p=parent(tmp_path);emit(child(p))
    record(tmp_path,subagent_id='legacy',session_id='parent',space_slug='x',status='running')
    assert len(scoped_history(p)['runs'])==1
    for foreign in (replace(p,profile_name='B'),replace(p,parent_turn_id='foreign'),replace(p,scope=replace_scope(p.scope))):
        assert scoped_history(foreign)['runs']==[]
    with pytest.raises(ValueError,match='binding'):
        emit(child(replace(p,profile_name='B')))

def replace_scope(scope):
    return Scope(backend_profile_id=scope.backend_profile_id,space_id='c'*32,browser_profile_id=scope.browser_profile_id)

def test_terminal_race_and_duplicate_completed(tmp_path):
    c=child(parent(tmp_path));emit(c)
    emit(c,'completed',status='completed')
    assert emit(c,'answer_delta',delta='late') is None
    assert emit(c,'completed',status='failed') is None
    result=scoped_history(c.parent)
    assert result['runs'][0]['status']=='completed'
    assert len(result['events'])==2

def test_bounded_replay_gap(tmp_path):
    c=child(parent(tmp_path));emit(c)
    for _ in range(520): emit(c,'answer_delta',delta='x')
    result=scoped_history(c.parent)
    assert result['resyncNeeded']
    assert len(result['events'])==512
    assert not scoped_history(c.parent,after_sequence={'child':520})['resyncNeeded']
    assert scoped_history(c.parent,after_sequence={'child':999})['resyncNeeded']

def test_actual_sqlite_transcript_only_bound_child(tmp_path):
    c=child(parent(tmp_path));emit(c)
    with sqlite3.connect(tmp_path/'state.db') as db:
        db.execute('CREATE TABLE sessions(session_id TEXT,parent_session_id TEXT)')
        db.execute('CREATE TABLE messages(id INTEGER,session_id TEXT,role TEXT,content TEXT)')
        db.execute('INSERT INTO sessions VALUES(?,?)',(c.child_session_id,'parent'))
        db.execute('INSERT INTO messages VALUES(1,?,?,?)',(c.child_session_id,'assistant','actual answer'))
    run=scoped_history(c.parent)['runs'][0]
    assert run['transcript']=={'sourceActuality':'persisted','messages':[{'role':'assistant','content':'actual answer', 'id':'session-child:1', 'at':''}]}
    with sqlite3.connect(tmp_path/'state.db') as db: db.execute("UPDATE sessions SET parent_session_id='foreign'")
    assert scoped_history(c.parent)['runs'][0]['transcript']['messages']==[]

def test_path_escape_missing_start_and_payload(tmp_path):
    p=parent(tmp_path)
    with pytest.raises(ValueError): replace(p,sessions_dir=tmp_path.parent/'foreign')
    with pytest.raises(ValueError): replace(child(p),session_db_path=tmp_path.parent/'foreign.db')
    with pytest.raises(ValueError): emit(child(p),'answer_delta',delta='first')
    emit(child(p))
    with pytest.raises(ValueError): emit(child(p),'answer_delta',delta=12)
    with pytest.raises(ValueError): emit(child(p),'answer_delta',delta='x'*65537)
    with pytest.raises(ValueError): emit(child(p),'status',status='completed')

def test_home_isolation_same_child_identity(tmp_path):
    a,b=tmp_path/'A',tmp_path/'B';a.mkdir();b.mkdir()
    ca,cb=child(parent(a)),child(replace(parent(b),profile_name='B'))
    emit(ca);emit(cb);emit(ca,'answer_delta',delta='only A')
    assert len(scoped_history(cb.parent)['events'])==1
    assert len(scoped_history(ca.parent)['events'])==2

def test_simultaneous_first_start_and_terminal_delta_race(tmp_path):
    p=parent(tmp_path)
    with ThreadPoolExecutor(2) as pool:
        list(pool.map(emit,[child(p,'first'),child(p,'second')]))
    c=child(p,'first')
    with ThreadPoolExecutor(2) as pool:
        complete=pool.submit(emit,c,'completed',status='completed')
        delta=pool.submit(emit,c,'answer_delta',delta='racing')
        complete.result();delta.result()
    events=[e for e in scoped_history(p)['events'] if e['subagentId']=='first']
    assert events[-1]['type']=='completed'
    assert emit(c,'answer_delta',delta='after') is None


def test_renderer_wire_and_partial_recovery_use_actual_answer_buffer(tmp_path):
    c=child(parent(tmp_path)); started=child_event_view(emit(c))
    assert started['schemaVersion']==1 and started['kind']=='started'
    assert started['model']=={'provider':'provider-A','model':'model-A'}
    assert started['parentSessionId']=='parent' and started['parentTurnId']=='turn'
    assert started['payload']['snapshot']['watermark']==1
    emit(c,'answer_delta',delta='actual streamed ')
    emit(c,'answer_delta',delta='answer')
    wire=scoped_child_history(c.parent)
    snapshot=wire['runs'][0]
    assert snapshot['watermark']==3 and snapshot['sourceActuality']=='partial'
    assert snapshot['messages'][0]['id']=='answer:child'
    assert snapshot['messages'][0]['content']=='actual streamed answer'
    assert snapshot['observedAt'] and snapshot['messages'][0]['at']
    assert [event['kind'] for event in wire['events']]==['started','answer_delta','answer_delta']


def test_server_truncation_is_explicit_and_partial_answer_survives_retention(tmp_path):
    c=child(parent(tmp_path));emit(c)
    emit(c,'answer_delta',delta='A'*40000);emit(c,'answer_delta',delta='B'*40000)
    snapshot=scoped_child_history(c.parent)['runs'][0]
    assert snapshot['truncated'] and len(snapshot['messages'][0]['content'])==65536
    emit(c,'completed',status='failed')
    final=scoped_child_history(c.parent)['runs'][0]
    assert final['status']=='failed' and final['sourceActuality']=='partial'
    assert final['messages'][0]['content']==snapshot['messages'][0]['content']


def test_explicit_restart_reconciles_only_orphans_with_actual_partial_text(tmp_path):
    from web.api.subagent_history import reconcile_stale
    from tools.delegate_tool import _register_subagent, _unregister_subagent
    c=child(parent(tmp_path));emit(c);emit(c,'answer_delta',delta='real partial')
    _register_subagent({'subagent_id':c.subagent_id,'context':c})
    try: assert reconcile_stale(tmp_path)==0
    finally: _unregister_subagent(c.subagent_id)
    assert reconcile_stale(tmp_path)==1
    assert reconcile_stale(tmp_path)==0
    snapshot=scoped_child_history(c.parent)['runs'][0]
    assert snapshot['status']=='interrupted' and snapshot['messages'][0]['content']=='real partial'
    assert emit(c,'answer_delta',delta='late') is None
