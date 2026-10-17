# Third-party inventory (A-022 draft)

**Status: preliminary metadata overview. Not complete, not legally reviewed, and not approved as a final product inventory.**

This overview references the version-pinned snapshot in [`docs/legal/drafts/third-party-inventory-20261011.json`](docs/legal/drafts/third-party-inventory-20261011.json). It was generated with `scripts/generate-third-party-license-inventory.py` from `package-lock.json`, `apps/desktop/scripts/requirements-runtime.txt`, and the hashed Python interpreter recorded in that snapshot.

The snapshot lists 488 npm third-party lockfile entries, 51 pinned desktop Python runtime packages, and two additional installed distributions: `pip==25.0.1` and the in-tree package `sidekick==0.8.84`. Sidekick’s distribution metadata has no license field in that snapshot; npm license fields come from lockfile metadata only.

Each dependency still requires verification of origin and license text. This document does not assert GPL compatibility or commercial sublicensing rights. See [`docs/license-audit.md`](docs/license-audit.md).
