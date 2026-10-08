"""Redacted, read-only source diagnosis for ProfileHub.get's identity gate.

No Sidekick module is imported and no profile connection is opened. SQLite
reads only a disposable, bounded local copy of state.db and its existing
WAL/SHM. Source size/hash checks reject a copy made during a concurrent write.
Only fixed reasons, counts, schema version and a Home equality boolean leave
this process. This tool neither migrates nor repairs the configured profile.
The result describes the copy whose source was stable around copying. Later
backend writes, including writes during inspection, are outside that snapshot;
the output is not a continuing live-state or execution-authorization claim.
"""
from __future__ import annotations

from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile


LIMITS = {"state.db": 128 * 1024 * 1024, "state.db-wal": 64 * 1024 * 1024,
          "state.db-shm": 2 * 1024 * 1024}
CHUNK_BYTES = 1024 * 1024


class Unavailable(Exception):
    def __init__(self, reason):
        self.reason = reason


def _result(reason, *, schema=None, count=None, matches=None):
    return {"diagnosticVersion": 1, "schemaVersion": schema, "refCount": count,
            "homeMatches": matches, "reason": reason}


def _hash_file(path, limit):
    digest, size = hashlib.sha256(), 0
    with path.open("rb") as source:
        while block := source.read(CHUNK_BYTES):
            size += len(block)
            if size > limit:
                raise Unavailable("snapshot_too_large")
            digest.update(block)
    return size, digest.digest()


def _manifest(home):
    journal = home / "state.db-journal"
    if journal.exists() and journal.stat().st_size:
        # A hot rollback journal requires SQLite recovery. Never recover the
        # original, and never diagnose an unrecovered copy as current state.
        raise Unavailable("rollback_journal_present")
    result = {}
    for name, limit in LIMITS.items():
        path = home / name
        if not path.exists():
            result[name] = None
            continue
        if path.is_symlink() or not path.is_file() or path.resolve(strict=True).parent != home:
            raise Unavailable("snapshot_source_unavailable")
        before = path.stat()
        size, digest = _hash_file(path, limit)
        after = path.stat()
        identity = lambda stat: (stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns)
        if identity(before) != identity(after) or size != after.st_size:
            raise Unavailable("snapshot_changed")
        result[name] = (identity(after), digest)
    if result["state.db"] is None:
        raise Unavailable("database_missing")
    return result


def _copy_snapshot(home, destination, before):
    for name, limit in LIMITS.items():
        expected = before[name]
        if expected is None:
            continue
        digest, size = hashlib.sha256(), 0
        with (home / name).open("rb") as source, (destination / name).open("xb") as target:
            while block := source.read(CHUNK_BYTES):
                size += len(block)
                if size > limit:
                    raise Unavailable("snapshot_too_large")
                digest.update(block)
                target.write(block)
        if size != expected[0][2] or digest.digest() != expected[1]:
            raise Unavailable("snapshot_changed")


def _inspect_snapshot(destination, home):
    # Any SQLite recovery/index writes are confined to this temporary copy.
    database = destination / "state.db"
    with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=1)) as connection:
        connection.execute("PRAGMA query_only=ON")
        connection.execute("BEGIN")
        tables = {row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ia_profile_refs','ia_schema_migrations')")}
        schema = None
        if "ia_schema_migrations" in tables:
            schema = connection.execute("SELECT MAX(version) FROM ia_schema_migrations").fetchone()[0]
            if schema is not None and (type(schema) is not int or schema < 1):
                return _result("schema_marker_invalid")
        if "ia_profile_refs" not in tables:
            return _result("unregistered", schema=schema, count=0)
        count = connection.execute("SELECT COUNT(*) FROM ia_profile_refs").fetchone()[0]
        if count > 1:
            # Match ProfileHub's short circuit: no Home is selected when more
            # than one durable identity inhabits the same profile database.
            return _result("ambiguous", schema=schema, count=count)
        if not count:
            return _result("unregistered", schema=schema, count=0)
        captured = connection.execute("SELECT canonical_home FROM ia_profile_refs LIMIT 1").fetchone()[0]
        try:
            path = Path(captured).expanduser()
            if not path.is_absolute():
                raise ValueError
            resolved = path.resolve(strict=True)
        except (TypeError, ValueError, OSError, RuntimeError):
            return _result("home_unavailable", schema=schema, count=1)
        matches = os.path.normcase(str(resolved)) == os.path.normcase(str(home))
        return _result("matched" if matches else "moved", schema=schema, count=1, matches=matches)


def diagnose(profile_home):
    """Return public facts only. No paths, IDs, SQL data or exception strings."""
    try:
        home = Path(profile_home).expanduser()
        if not home.is_absolute():
            return _result("profile_home_unavailable")
        home = home.resolve(strict=True)
        if not home.is_dir():
            return _result("profile_home_unavailable")
        before = _manifest(home)
        with tempfile.TemporaryDirectory(prefix="lastbrowser-profile-diagnostic-") as temporary:
            destination = Path(temporary).resolve()
            _copy_snapshot(home, destination, before)
            if _manifest(home) != before:
                raise Unavailable("snapshot_changed")
            result = _inspect_snapshot(destination, home)
        return result
    except Unavailable as error:
        return _result(error.reason)
    except sqlite3.Error:
        return _result("database_unreadable")
    except (TypeError, ValueError, OSError, RuntimeError):
        return _result("snapshot_source_unavailable")


def main(argv=None):
    values = sys.argv[1:] if argv is None else argv
    if len(values) != 2 or values[0] != "--profile-home":
        result = _result("invalid_arguments")
    else:
        result = diagnose(values[1])
    print(json.dumps(result, ensure_ascii=True, separators=(",", ":")))
    return 0 if result["reason"] in {"matched", "unregistered", "ambiguous", "moved", "home_unavailable"} else 2


if __name__ == "__main__":
    raise SystemExit(main())
