"""Bounded real owner reads preserve strict metadata before growing payloads."""
import json
from pathlib import Path

import pytest

from runtime.independent.model_policy_session import validate_native_session
from runtime.independent.scope import ScopeError, ScopeResolver
from test_native_chat_process import fixture_context


@pytest.mark.parametrize("fault", ["missing", "duplicate", "nested_duplicate", "invalid_escape", "truncated_owner"])
def test_bounded_native_owner_read_rejects_malformed_or_missing_owner_before_large_payload(tmp_path, fault):
    context, store = fixture_context(tmp_path, "a")
    resolver = ScopeResolver(store, profiles_provider=lambda: [{"name": "a", "path": context.profile_home}])
    resolved = resolver.resolve(context.scope, authenticated_profile_name="a")
    metadata = {"session_id": context.session_id, "workspace": context.workspace,
        "profile": "a", "space_scope": context.scope.model_dump(mode="json", by_alias=True)}
    prefix = json.dumps(metadata)[:-1]
    if fault == "missing":
        metadata.pop("profile")
        prefix = json.dumps(metadata)[:-1]
    elif fault == "duplicate":
        prefix += ',"profile":"a"'
    elif fault == "nested_duplicate":
        scope = json.dumps(metadata["space_scope"])
        prefix = prefix.replace(scope, scope[:-1] + ',"spaceId":' + json.dumps(context.scope.space_id) + '}')
    elif fault == "invalid_escape":
        prefix = prefix.replace('"profile": "a"', '"profile": "a\\q"')
    elif fault == "truncated_owner":
        prefix = prefix[:-12]
    payload = prefix + ',"pending_user_message":' + json.dumps("private large prompt " * 7000) + ',"messages":[]}'
    path = Path(context.sessions_dir) / (context.session_id + ".json")
    path.write_text(payload, "utf-8")
    try:
        with pytest.raises(ScopeError):
            validate_native_session(resolved, context.session_id, actor="a")
    finally:
        store.close()
