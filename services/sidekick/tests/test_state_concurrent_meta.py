"""Shared goal-store reads must never mix bindings between request threads."""
from concurrent.futures import ThreadPoolExecutor

from runtime._compat.shim_state import SessionDB


def test_shared_connection_meta_reads_keep_each_threads_key(tmp_path):
    db = SessionDB(tmp_path / "state.db")
    try:
        for index in range(16):
            db.set_meta(f"goal:{index}", f"value:{index}")

        def read(index):
            for _ in range(200):
                assert db.get_meta(f"goal:{index}") == f"value:{index}"
                assert db.get_meta("goal:missing") is None

        with ThreadPoolExecutor(max_workers=16) as workers:
            list(workers.map(read, range(16)))
    finally:
        db.close()
