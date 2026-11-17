"""Write a synthetic message using the production Sidekick session store."""

import hashlib
import json
from pathlib import Path
import sys
import traceback
import uuid


def main():
    # The mounted WinFsp drive is usable even when GetFinalPathNameByHandle
    # cannot resolve its volume. Use its drive-letter path.
    root = Path(sys.argv[1]).absolute()
    receipt = root / "storage-probe.json"
    if root.name != "profile" or not receipt.is_file():
        raise ValueError("Run the Chromium fixture before the Sidekick fixture")

    package = Path(__file__).resolve().parents[3] / "services" / "sidekick"
    sys.path.insert(0, str(package))
    from runtime._compat.shim_state import SessionDB

    profile_home = root / "runtime" / "profiles" / "synthetic"
    profile_home.mkdir(parents=True, exist_ok=False)
    database_path = profile_home / "state.db"
    marker = str(uuid.uuid4())
    store = SessionDB(database_path)
    try:
        store.append_message("synthetic-smoke", "user", marker)
        assert store.get_messages("synthetic-smoke")[0]["content"] == marker
        wal = database_path.with_suffix(".db-wal")
        if not wal.is_file() or marker.encode("ascii") not in wal.read_bytes():
            raise RuntimeError("The Sidekick fixture did not exercise SQLite WAL")
    finally:
        store.close()

    values = json.loads(receipt.read_text(encoding="utf-8"))
    values["sidekick"] = hashlib.sha256(marker.encode("ascii")).hexdigest()
    receipt.write_text(json.dumps(values), encoding="utf-8")
    print("Sidekick session and SQLite WAL verified")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        frame = traceback.extract_tb(error.__traceback__)[-1]
        print(
            f"The synthetic Sidekick storage probe failed in {Path(frame.filename).name}:{frame.lineno} "
            f"({type(error).__name__}, errno={getattr(error, 'errno', None)}, "
            f"winerror={getattr(error, 'winerror', None)})",
            file=sys.stderr,
        )
        sys.exit(1)
