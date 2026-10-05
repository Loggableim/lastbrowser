import json
import sqlite3
from pathlib import Path

import pytest

from runtime.independent.contracts import digest_json, new_id
from test_native_chat_process import fixture_context


def _authorization(context):
    return {"schemaVersion": 1, "actorRef": "user:desktop",
            "scope": context.scope.model_dump(mode="json", by_alias=True),
            "backendProfileName": context.profile_name,
            "spaceSlug": Path(context.space_root).name,
            "sessionId": context.session_id}


def test_native_goal_ingress_rejects_old_or_unclaimed_context(tmp_path):
    from web.api.goals import native_goal_ingress_authorization
    from runtime.independent.policy import PolicyDenied
    context, store = fixture_context(tmp_path, "a")
    try:
        with pytest.raises(PolicyDenied, match="native_goal_authorization_unavailable|native_goal_claim_not_current"):
            native_goal_ingress_authorization(context, claim_turn=0)
    finally:
        store.close()


def test_goal_command_payload_requires_human_authorization_and_durable_identity(tmp_path):
    from web.api.goals import goal_command_payload
    context, store = fixture_context(tmp_path, "a")
    try:
        auth = _authorization(context)
        with pytest.raises(ValueError):
            goal_command_payload(context.session_id, "Ship it", profile_home=context.profile_home,
                space_slug=Path(context.space_root).name, expected_revision=0,
                client_request_id=None, human_authorization=auth)
        denied = goal_command_payload(context.session_id, "Ship it", profile_home=context.profile_home,
            space_slug=Path(context.space_root).name, expected_revision=0,
            client_request_id=new_id(), source_actor="agent", human_authorization=auth)
        assert denied["error"] == "human_command_required"
    finally:
        store.close()


def test_goal_command_receipt_identity_conflict_does_not_kickoff_twice(tmp_path, monkeypatch):
    from web.api.goals import goal_command_payload
    from web.api import goals
    context, store = fixture_context(tmp_path, "a")
    # The fixture profile is registered in its real store, not the app's global
    # profile catalogue. Map only this exact owner to its actual SQLite path.
    def own_space_path(slug, *, profile_home=None):
        if slug == Path(context.space_root).name and Path(profile_home).resolve() == Path(context.profile_home).resolve():
            return Path(context.space_root) / "goals.db"
        return None
    monkeypatch.setattr(goals, "_space_goals_path", own_space_path)
    monkeypatch.setattr(goals, "_DB_CACHE", {})
    monkeypatch.setattr(goals, "_PENDING_CONTINUATIONS", {})
    monkeypatch.setattr(goals, "_CANCELLED_CONTINUATIONS", {})
    monkeypatch.setattr(goals, "_IN_FLIGHT_CONTINUATIONS", set())
    try:
        auth = _authorization(context)
        request_id = new_id()
        first = goal_command_payload(context.session_id, "Ship it", profile_home=context.profile_home,
            space_slug=Path(context.space_root).name, expected_revision=0,
            client_request_id=request_id, human_authorization=auth)
        assert first["ok"] is True
        assert isinstance(first.get("kickoff_prompt"), str) and first["kickoff_prompt"]
        db = Path(context.space_root) / "goals.db"
        assert db.is_file()
        with sqlite3.connect(db) as conn:
            rows = conn.execute("SELECT key, value FROM state_meta WHERE key LIKE ?",
                ("native-goal-human:" + context.session_id + ":%",)).fetchall()
            assert len(rows) == 1
            authority = json.loads(rows[0][1])
            assert authority["humanAuthorization"] == auth
            assert isinstance(authority["commandRef"], str)
        from web.api.goals import consume_goal_continuation, queue_goal_continuation
        prompt = goals._manager(context.session_id, profile_home=context.profile_home,
            space_slug=Path(context.space_root).name).next_continuation_prompt()
        assert isinstance(prompt, str) and "lastbrowser-goal-run:" in prompt
        assert queue_goal_continuation(context.session_id, prompt, profile_home=context.profile_home,
            space_slug=Path(context.space_root).name)
        assert consume_goal_continuation(context.session_id, prompt, profile_home=context.profile_home,
            space_slug=Path(context.space_root).name) == "active"
        from web.api.goals import native_goal_ingress_authorization
        proof = native_goal_ingress_authorization(context, claim_turn=0)
        assert proof["goalRunId"] and proof["authorizationRef"].startswith("native-goal-human:")
        second = goal_command_payload(context.session_id, "Different objective", profile_home=context.profile_home,
            space_slug=Path(context.space_root).name, expected_revision=0,
            client_request_id=request_id, human_authorization=auth)
        assert second["error"] == "request_identity_conflict"
    finally:
        for db in goals._DB_CACHE.values():
            db.close()
        store.close()
