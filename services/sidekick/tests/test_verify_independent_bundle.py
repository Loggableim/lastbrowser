from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "verify-independent-bundle.py"
SOURCE_SIDEKICK = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("verify_independent_bundle", SCRIPT)
assert SPEC and SPEC.loader
VERIFIER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIER)


class VerifyIndependentBundleTests(unittest.TestCase):
    def test_snapshot_contains_required_modules(self) -> None:
        snapshot = VERIFIER.module_snapshot(SOURCE_SIDEKICK)

        self.assertEqual(tuple(snapshot), VERIFIER.MODULE_PATHS)
        self.assertTrue(all(len(digest) == 64 for digest in snapshot.values()))

    def test_snapshot_rejects_missing_module(self) -> None:
        with self.assertRaisesRegex(FileNotFoundError, "runtime/chat_modes.py"):
            VERIFIER.module_snapshot(SOURCE_SIDEKICK / "missing-probe-tree")
