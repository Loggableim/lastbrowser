"""Regression checks for the packaged VM's profile alias and Send starvation."""
import os
import threading
from types import SimpleNamespace

import pytest

from runtime.independent.scope import same_path


def test_filesystem_alias_is_same_home_but_other_directory_is_not(tmp_path):
    original = tmp_path / "original"
    alias = tmp_path / "alias"
    other = tmp_path / "other"
    original.write_text("identity")
    other.write_text("identity")
    os.link(original, alias)
    assert original.resolve() != alias.resolve()
    assert same_path(original, alias)
    assert not same_path(original, other)


@pytest.mark.parametrize("kind", ["model_policy", "chat_mode"])
def test_slow_settings_read_releases_session_lock_before_scope_probe(monkeypatch, kind):
    from web.api import routes, profiles, chat_modes, model_policy
    from runtime.independent import chat_binding

    lock = threading.Lock()
    session = SimpleNamespace(session_id="p004", messages=[], compact=lambda **_: {})
    monkeypatch.setattr(routes, "_get_session_agent_lock", lambda _: lock)
    monkeypatch.setattr(routes, "get_session", lambda _: session)
    monkeypatch.setattr(chat_binding, "require_native_scope_header", lambda *_: None)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "default")
    monkeypatch.setattr(routes, "j", lambda _handler, value, **_: value)
    calls = []

    def probe(snapshot, *_args, **_kwargs):
        acquired = lock.acquire(blocking=False)
        assert acquired, "settings scope probes must not block Send's mutation lock"
        lock.release()
        assert snapshot is not session
        snapshot.messages.append("snapshot only")
        calls.append(True)
        return {"ok": True}

    body = {"action": "get", "session_id": "p004", "space_scope": {"test": True}}
    if kind == "model_policy":
        monkeypatch.setattr(model_policy, "handle_model_policy", probe)
        result = routes._handle_model_policy(None, body)
    else:
        monkeypatch.setattr(chat_modes, "read_chat_mode", probe)
        result = routes._handle_chat_mode(None, body)
    assert result["ok"] is True and calls == [True]
    assert session.messages == []


def _inventory_database(home, *, canonical_home=None):
    import sqlite3

    home.mkdir(parents=True, exist_ok=True)
    path = home / "state.db"
    with sqlite3.connect(path) as connection:
        connection.execute("CREATE TABLE ia_profile_refs (backend_profile_id TEXT, name TEXT, canonical_home TEXT, status TEXT)")
        connection.execute("INSERT INTO ia_profile_refs VALUES (?, ?, ?, ?)",
                           ("test-profile", "default", str(canonical_home or home), "active"))
    return path


def test_inventory_accepts_msix_file_resolution_alias_of_same_home(tmp_path, monkeypatch):
    """Model Windows resolving state.db physically while its Home keeps an alias.

    The SQLite file is real; only the platform's asymmetric path resolution and
    samefile identity are simulated so this runs without symlink privileges.
    """
    from runtime.independent import scope_binding

    home = tmp_path / "appdata-alias"
    physical_home = tmp_path / "msix-physical"
    physical_home.mkdir()
    database = _inventory_database(home, canonical_home=physical_home)
    hub = scope_binding.ProfileHub(home)
    real_canonical_path = scope_binding.canonical_path
    real_samefile = os.path.samefile

    def resolve(value, **kwargs):
        if str(value) == str(database):
            return physical_home / "state.db"
        return real_canonical_path(value, **kwargs)

    def samefile(left, right):
        if {str(left), str(right)} == {str(home), str(physical_home)}:
            return True
        return real_samefile(left, right)

    monkeypatch.setattr(scope_binding, "canonical_path", resolve)
    monkeypatch.setattr(os.path, "samefile", samefile)
    assert hub.existing_store_paths() == (("test-profile", database),)


@pytest.mark.parametrize("destination", ["foreign", "nested"])
def test_inventory_rejects_database_resolved_outside_exact_home(tmp_path, monkeypatch, destination):
    from runtime.independent import scope_binding
    from runtime.independent.scope import ScopeError

    home = tmp_path / "registered"
    database = _inventory_database(home)
    resolved_home = tmp_path / "foreign" if destination == "foreign" else home / "nested"
    resolved_home.mkdir()
    # A hard link makes the database file itself genuinely identical. Ownership
    # must still come from the registered parent, not file identity or ancestry.
    linked_database = resolved_home / "state.db"
    os.link(database, linked_database)
    hub = scope_binding.ProfileHub(home)
    real_canonical_path = scope_binding.canonical_path

    def resolve(value, **kwargs):
        return linked_database if str(value) == str(database) else real_canonical_path(value, **kwargs)

    monkeypatch.setattr(scope_binding, "canonical_path", resolve)
    with pytest.raises(ScopeError, match="store escapes its registered Home"):
        hub.existing_store_paths()
