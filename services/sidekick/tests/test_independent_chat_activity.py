"""Actual native activity is bounded, owner-bound, and parent-stream-backed."""
import json
import os
from pathlib import Path

import pytest

from runtime.independent.chat_activity import snapshot_native_chats


SCOPE = {"backendProfileId": "a" * 32, "spaceId": "b" * 32, "browserProfileId": "default"}
NOW = "2026-10-04T12:00:00Z"


def save(root, session_id="chat-1", **updates):
    root.mkdir(parents=True, exist_ok=True)
    meta = {"session_id": session_id, "title": "Actual chat", "model": "local-model",
            "model_provider": "local", "profile": "actor-A", "active_stream_id": "parent-whatever",
            "space_scope": SCOPE, "messages": [{"role": "user", "content": "PRIVATE HISTORY"}]}
    meta.update(updates)
    path = root / f"{session_id}.json"
    path.write_text(json.dumps(meta), encoding="utf-8")
    return path


def observe(root, **kwargs):
    return snapshot_native_chats(resolved_scope=SCOPE, actor_profile_name="actor-A", sessions_dir=root,
                                 active_stream_ids={"parent-whatever"}, observed_at=NOW, **kwargs)


def test_actual_parent_id_only_and_public_output_no_history(tmp_path):
    save(tmp_path)
    result = observe(tmp_path)
    assert result.source_actuality == "live" and len(result.rows) == 1
    row = result.rows[0].as_dict()
    assert row["activeStreamId"] == "parent-whatever" and row["state"] == "streaming"
    assert row["observedAt"] == NOW and row["modelProvider"] == "local"
    assert "PRIVATE" not in str(row) and "messages" not in row and "profile" not in row


def test_same_session_id_in_distinct_owner_directories_never_leaks(tmp_path):
    first, second = tmp_path / "A", tmp_path / "B"
    save(first, title="A")
    save(second, title="B", space_scope={**SCOPE, "spaceId": "c" * 32})
    assert observe(first).rows[0].title == "A"
    assert not observe(second).rows


@pytest.mark.parametrize("updates", [
    {"profile": "actor-B"}, {"space_scope": None}, {"space_scope": {"spaceId": SCOPE["spaceId"]}},
    {"space_scope": {**SCOPE, "backendProfileId": "c" * 32}},
    {"space_scope": {**SCOPE, "browserProfileId": "foreign"}},
    {"active_stream_id": "expired"}, {"active_stream_id": None, "pending_user_message": "pending"},
])
def test_foreign_missing_forged_scope_and_orphan_pending_do_not_count(tmp_path, updates):
    save(tmp_path, **updates)
    assert not observe(tmp_path).rows


def test_large_history_is_not_decoded_or_read_in_full(tmp_path):
    path = save(tmp_path)
    raw = path.read_text(encoding="utf-8")
    metadata = raw[:raw.index('"messages"')]
    # Deliberately unparseable transcript proves there is no full JSON load.
    path.write_bytes((metadata + '"messages": [').encode() + b"!" * (2 * 1024 * 1024))
    result = observe(tmp_path)
    assert len(result.rows) == 1 and result.bytes_read == 65536


def test_explicit_read_bound_is_respected(tmp_path, monkeypatch):
    save(tmp_path)
    reads = []
    original = os.fdopen
    class Reader:
        def __init__(self, handle): self.handle = handle
        def __enter__(self): return self
        def __exit__(self, *args): self.handle.close()
        def fileno(self): return self.handle.fileno()
        def read(self, size):
            reads.append(size)
            return self.handle.read(size)
    monkeypatch.setattr(os, "fdopen", lambda *a, **kw: Reader(original(*a, **kw)))
    assert observe(tmp_path, max_prefix_bytes=1024).rows
    assert reads == [1024]


def test_metadata_after_messages_is_not_a_valid_binding(tmp_path):
    path = save(tmp_path)
    path.write_text(json.dumps({"session_id": "chat-1", "messages": [], "profile": "actor-A",
        "space_scope": SCOPE, "active_stream_id": "parent-whatever", "title": "late"}), encoding="utf-8")
    assert not observe(tmp_path).rows


def test_missing_directory_and_relative_root_fail_closed(tmp_path):
    assert observe(tmp_path / "absent").source_actuality == "unavailable"
    assert observe(Path("relative")).source_actuality == "unavailable"


def test_path_escaping_session_id_is_rejected(tmp_path):
    save(tmp_path, session_id="chat-1")
    path = tmp_path / "chat-1.json"
    meta = json.loads(path.read_text())
    meta["session_id"] = "../chat-1"
    path.write_text(json.dumps(meta))
    result = observe(tmp_path)
    assert not result.rows and result.source_actuality == "partial"


def test_symlink_file_and_directory_fail_closed(tmp_path):
    actual = tmp_path / "actual"
    save(actual)
    owner = tmp_path / "owner"
    owner.mkdir()
    try:
        (owner / "chat-1.json").symlink_to(actual / "chat-1.json")
        link = tmp_path / "linked-directory"
        link.symlink_to(actual, target_is_directory=True)
    except OSError:
        pytest.skip("Host does not permit creating symlinks")
    assert not observe(owner).rows
    assert observe(link).source_actuality == "unavailable"


def test_bounds_are_partial_and_cannot_be_relaxed(tmp_path):
    save(tmp_path, "one")
    save(tmp_path, "two")
    assert observe(tmp_path, max_files=1).source_actuality == "partial"
    with pytest.raises(ValueError): observe(tmp_path, max_files=257)
    with pytest.raises(ValueError): observe(tmp_path, max_prefix_bytes=65537)


def test_existing_independent_rows_keep_priority(tmp_path):
    save(tmp_path)
    assert not observe(tmp_path, existing_session_ids={"chat-1"}).rows


def test_duplicate_metadata_key_is_fail_closed(tmp_path):
    path = save(tmp_path)
    raw = path.read_text()
    path.write_text(raw.replace('"messages":', '"profile": "actor-B", "messages":'))
    assert not observe(tmp_path).rows


def test_no_actual_stream_ids_means_no_activity(tmp_path):
    save(tmp_path)
    result = snapshot_native_chats(resolved_scope=SCOPE, actor_profile_name="actor-A", sessions_dir=tmp_path,
                                  active_stream_ids=set(), observed_at=NOW)
    assert not result.rows


def test_oversized_metadata_is_partial_and_read_only(tmp_path):
    path = save(tmp_path, title="x" * 70000)
    original = path.read_bytes()
    result = observe(tmp_path)
    assert not result.rows and result.source_actuality == "partial"
    assert result.bytes_read == 65536 and path.read_bytes() == original


def test_stream_prefix_or_similarity_is_not_actual_identity(tmp_path):
    save(tmp_path, active_stream_id="parent-whatever-copy")
    assert not observe(tmp_path).rows


def test_resolved_scope_model_is_supported_without_session_imports(tmp_path):
    save(tmp_path)
    class TrustedScope:
        def model_dump(self, *, by_alias=False):
            assert by_alias
            return SCOPE.copy()
    result = snapshot_native_chats(resolved_scope=TrustedScope(), actor_profile_name="actor-A",
        sessions_dir=tmp_path, active_stream_ids={"parent-whatever"}, observed_at=NOW)
    assert len(result.rows) == 1
