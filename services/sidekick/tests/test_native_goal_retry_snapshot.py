"""Judge retry reads one exact paused Goal and its durable human receipt."""
import json
import sqlite3
from pathlib import Path
import pytest
from runtime.independent.contracts import digest_json, new_id
from runtime.independent.native_goal_retry import NativeGoalRetryRequest, read_retry_goal, goal_retry_ingress_authorization
from runtime.independent.policy import PolicyDenied
from test_native_chat_process import fixture_context
from test_native_goal_ingress import _authorization


@pytest.fixture
def retry_snapshot(tmp_path):
    context, store = fixture_context(tmp_path, 'a')
    run, command = new_id(), 'native-goal-human:' + context_id(context)
    raw = {'status': 'paused', 'continuation_owner': 'legacy_chat', 'owner_run_id': None,
        '_goal_run_id': run, 'revision': 3, 'pending_judge_response': 'Controlled previous result', 'goal': 'Controlled goal'}
    receipt = {'state': 'committed', 'digest': digest_json('controlled-command'),
        'humanAuthorization': _authorization(context), 'goal': {'_goal_run_id': run}}
    path = Path(context.space_root) / 'goals.db'
    def write(goal=raw, proof=receipt):
        with sqlite3.connect(path) as connection:
            connection.execute('CREATE TABLE IF NOT EXISTS state_meta(key TEXT PRIMARY KEY, value TEXT)')
            connection.execute('INSERT OR REPLACE INTO state_meta VALUES(?,?)', ('goal:' + context.session_id, json.dumps(goal)))
            connection.execute('INSERT OR REPLACE INTO state_meta VALUES(?,?)', (command, json.dumps(proof)))
    write()
    request = NativeGoalRetryRequest(request_id=new_id(), scope=context.scope, session_id=context.session_id,
        stream_id=context.stream_id, goal_run_id=run, goal_revision=3, goal_digest=digest_json(raw),
        human_command_ref=command, human_command_digest=receipt['digest'])
    try: yield context, store, request, raw, receipt, write, path
    finally: store.close()


def context_id(context): return context.session_id + ':' + new_id()


def test_retry_ingress_is_readonly_and_bound_to_exact_durable_snapshot(retry_snapshot):
    context, _, request, raw, _, _, path = retry_snapshot
    before = path.read_bytes()
    assert read_retry_goal(context, request) == raw
    proof = goal_retry_ingress_authorization(context, request.model_dump(mode='json', by_alias=True))
    assert proof['authorizationRef'] == request.human_command_ref
    assert proof['authorizationDigest'] == digest_json(request)
    assert path.read_bytes() == before


@pytest.mark.parametrize('change', ['cleared', 'resumed', 'different_run', 'revision', 'response', 'actor', 'scope', 'profile', 'receipt_state', 'receipt_digest'])
def test_clear_resume_replacement_or_changed_human_authority_denies_retry(retry_snapshot, change):
    context, _, request, raw, receipt, write, _ = retry_snapshot
    raw, receipt = json.loads(json.dumps(raw)), json.loads(json.dumps(receipt))
    if change == 'cleared': raw['pending_judge_response'] = None
    elif change == 'resumed': raw['status'] = 'active'
    elif change == 'different_run': raw['_goal_run_id'] = new_id()
    elif change == 'revision': raw['revision'] += 1
    elif change == 'response': raw['pending_judge_response'] += ' changed'
    elif change == 'actor': receipt['humanAuthorization']['actorRef'] = 'agent'
    elif change == 'scope': receipt['humanAuthorization']['scope']['spaceId'] = new_id()
    elif change == 'profile': receipt['humanAuthorization']['backendProfileName'] = 'foreign'
    elif change == 'receipt_state': receipt['state'] = 'pending'
    elif change == 'receipt_digest': receipt['digest'] = digest_json('foreign')
    write(raw, receipt)
    with pytest.raises(PolicyDenied, match='snapshot_changed'): read_retry_goal(context, request)


def test_changed_stream_or_released_writer_cannot_use_retry_receipt(retry_snapshot):
    context, store, request, _, _, _, _ = retry_snapshot
    with pytest.raises(PolicyDenied, match='owner_changed'):
        read_retry_goal(context, request.model_copy(update={'stream_id': 'foreign-stream'}))
    store.release_lease(context.writer_lease_id, owner_generation=context.writer_generation)
    with pytest.raises(PermissionError): read_retry_goal(context, request)
