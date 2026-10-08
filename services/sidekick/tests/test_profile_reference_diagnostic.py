"""Synthetic proof of the Guest diagnostic's exact gate and redaction."""
import importlib.util
import json
from pathlib import Path
import sqlite3

import pytest


SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "diagnose-profile-reference.py"
spec = importlib.util.spec_from_file_location("profile_reference_diagnostic", SCRIPT)
diagnostic = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diagnostic)


def seed(home, captured_home=None, *, wal=False):
    home.mkdir()
    connection = sqlite3.connect(home / "state.db")
    if wal:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA wal_autocheckpoint=0")
    connection.execute("CREATE TABLE ia_schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT,migration_digest TEXT)")
    connection.execute("INSERT INTO ia_schema_migrations VALUES(4,'synthetic','synthetic')")
    connection.execute("CREATE TABLE ia_profile_refs(backend_profile_id TEXT PRIMARY KEY,canonical_home TEXT UNIQUE,name TEXT,revision INTEGER,status TEXT,data_json TEXT)")
    connection.execute("INSERT INTO ia_profile_refs VALUES(?,?,?,?,?,?)",
        ("private-identity-not-for-output", str(captured_home or home), "private-name-not-for-output", 1, "active", "private-json-not-for-output"))
    connection.commit()
    return connection


def contents(home):
    return {path.name: path.read_bytes() for path in home.iterdir() if path.is_file()}


@pytest.mark.parametrize("case", ["matched", "moved", "ambiguous"])
def test_exact_gate_cases_redact_private_metadata_and_leave_source_unchanged(tmp_path, capsys, case):
    home, other = tmp_path / "private-home-not-for-output", tmp_path / "private-other-not-for-output"
    other.mkdir()
    connection = seed(home, other if case == "moved" else None)
    if case == "ambiguous":
        connection.execute("INSERT INTO ia_profile_refs VALUES(?,?,?,?,?,?)",
            ("private-second-identity", str(other), "second-private-name", 1, "active", "private-json"))
        connection.commit()
    connection.close()
    before = contents(home)
    assert diagnostic.main(["--profile-home", str(home)]) == 0
    output = capsys.readouterr().out
    result = json.loads(output)
    assert result == {"diagnosticVersion": 1, "schemaVersion": 4,
        "refCount": 2 if case == "ambiguous" else 1,
        "homeMatches": None if case == "ambiguous" else case == "matched", "reason": case}
    assert "private" not in output and str(tmp_path) not in output
    assert contents(home) == before
    if case in {"moved", "ambiguous"}:
        # Prove both facts correspond to the actual current Guest gate, not
        # merely the diagnostic's own reproduction of its conditional.
        from runtime.independent.scope import ScopeError
        from runtime.independent.scope_binding import ProfileHub
        hub = ProfileHub(home)
        try:
            with pytest.raises(ScopeError, match="Profile reference is ambiguous or has moved"):
                hub.get("default")
            assert contents(home) == before
        finally:
            hub.close()


def test_live_wal_committed_identity_is_read_using_sqlite_only_on_temporary_copy(tmp_path, monkeypatch):
    home = tmp_path / "profile"
    connection = seed(home, wal=True)
    temporary_dirs = []
    original = diagnostic.tempfile.TemporaryDirectory
    def temporary(**kwargs):
        owner = original(dir=tmp_path, **kwargs)
        temporary_dirs.append(Path(owner.name))
        return owner
    monkeypatch.setattr(diagnostic.tempfile, "TemporaryDirectory", temporary)
    before = contents(home)
    assert (home / "state.db-wal").stat().st_size > 0
    try:
        result = diagnostic.diagnose(home)
        assert result["reason"] == "matched" and result["refCount"] == 1 and result["schemaVersion"] == 4
        assert contents(home) == before
        assert temporary_dirs and all(not path.exists() for path in temporary_dirs)
    finally:
        connection.close()


def test_concurrent_source_change_is_reported_unavailable_not_a_false_identity(tmp_path, monkeypatch):
    home = tmp_path / "profile"
    connection = seed(home)
    connection.close()
    original = diagnostic._copy_snapshot
    def changed(source, destination, before):
        original(source, destination, before)
        with sqlite3.connect(source / "state.db") as writer:
            writer.execute("UPDATE ia_profile_refs SET name='synthetic-concurrent-update'")
    monkeypatch.setattr(diagnostic, "_copy_snapshot", changed)
    assert diagnostic.diagnose(home) == {"diagnosticVersion": 1, "schemaVersion": None,
        "refCount": None, "homeMatches": None, "reason": "snapshot_changed"}


@pytest.mark.parametrize("phase", ["manifest_hash", "snapshot_copy"])
def test_swapped_open_handle_is_rejected_before_reading_any_foreign_bytes(tmp_path, monkeypatch, phase):
    home, outside = tmp_path / "profile", tmp_path / "outside"
    connection = seed(home)
    connection.close()
    outside.mkdir()
    foreign = outside / "foreign-database"
    foreign.write_bytes(b"external-private-bytes-must-never-be-read")
    before = contents(home)
    opened, reads = [], []
    path_open = Path.open

    class ForeignHandle:
        def __init__(self):
            self.handle = path_open(foreign, "rb")
        def __enter__(self):
            return self
        def __exit__(self, *args):
            self.handle.close()
        def fileno(self):
            return self.handle.fileno()
        def read(self, *args):
            reads.append(True)
            return self.handle.read(*args)

    def swapped(path, *args, **kwargs):
        if path == home / "state.db" and args and args[0] == "rb":
            opened.append(True)
            return ForeignHandle()
        return path_open(path, *args, **kwargs)

    if phase == "manifest_hash":
        monkeypatch.setattr(Path, "open", swapped)
    else:
        copy = diagnostic._copy_snapshot
        def changed(source, destination, manifest):
            with monkeypatch.context() as patch:
                patch.setattr(Path, "open", swapped)
                return copy(source, destination, manifest)
        monkeypatch.setattr(diagnostic, "_copy_snapshot", changed)
    result = diagnostic.diagnose(home)
    assert result["reason"] == "snapshot_changed"
    assert result["refCount"] is None and result["homeMatches"] is None
    assert opened and reads == []
    # Read this comparison with the normal Path API, outside the injection.
    monkeypatch.setattr(Path, "open", path_open)
    assert contents(home) == before


def test_missing_database_and_missing_captured_home_do_not_create_or_echo_paths(tmp_path):
    home = tmp_path / "profile"
    home.mkdir()
    assert diagnostic.diagnose(home)["reason"] == "database_missing"
    assert list(home.iterdir()) == []
    home.rmdir()
    connection = seed(home, tmp_path / "absent-private-home")
    connection.close()
    before = contents(home)
    result = diagnostic.diagnose(home)
    assert result["reason"] == "home_unavailable" and result["homeMatches"] is None
    assert "private" not in json.dumps(result) and contents(home) == before


@pytest.mark.parametrize("sidecar", ["state.db-wal", "state.db-shm"])
def test_dangling_sidecar_symlink_is_unavailable_instead_of_absent(tmp_path, sidecar):
    home = tmp_path / "profile"
    connection = seed(home)
    connection.close()
    database_before = (home / "state.db").read_bytes()
    dangling = home / sidecar
    absent_target = tmp_path / "absent-private-sidecar"
    # Actual filesystem symlink, including Windows. Lack of permission fails
    # this proof rather than silently treating an unexecuted case as passed.
    dangling.symlink_to(absent_target)
    assert dangling.is_symlink() and not dangling.exists()
    result = diagnostic.diagnose(home)
    assert result == {"diagnosticVersion": 1, "schemaVersion": None,
        "refCount": None, "homeMatches": None, "reason": "snapshot_source_unavailable"}
    assert (home / "state.db").read_bytes() == database_before
    assert dangling.is_symlink() and not absent_target.exists()
    assert "private" not in json.dumps(result)


def test_invalid_cli_arguments_and_unreadable_sqlite_are_redacted(tmp_path, capsys):
    assert diagnostic.main(["--wrong", "private-value-not-for-output"]) == 2
    assert "private" not in capsys.readouterr().out
    home = tmp_path / "profile"
    home.mkdir()
    path = home / "state.db"
    path.write_bytes(b"private-unreadable-database-not-for-output")
    assert diagnostic.diagnose(home)["reason"] == "database_unreadable"
    assert path.read_bytes() == b"private-unreadable-database-not-for-output"
