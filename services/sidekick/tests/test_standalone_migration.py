"""Tests for standalone-install migration endpoints (onboarding.py)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Ensure the services/sidekick root is importable regardless of cwd.
REPO_ROOT = Path(__file__).resolve().parents[2]
SIDKICK_ROOT = REPO_ROOT / "services" / "sidekick"
if str(SIDKICK_ROOT) not in sys.path:
    sys.path.insert(0, str(SIDKICK_ROOT))

from web.api.onboarding import (  # noqa: E402
    _validate_migration_source,
    detect_standalone_install,
    migrate_standalone_install,
)


@pytest.fixture()
def standalone_home(tmp_path: Path) -> Path:
    home = tmp_path / ".sidekick"
    (home / "spaces" / "work").mkdir(parents=True)
    (home / "spaces" / "work" / "note.md").write_text("hello", encoding="utf-8")
    (home / "supermemory.db").write_bytes(b"fake-db")
    (home / "config.yaml").write_text("model: test\n", encoding="utf-8")
    return home


@pytest.fixture()
def destination_home(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    dest = tmp_path / "lastbrowser-home"
    dest.mkdir()
    import web.api.onboarding as onboarding_module

    monkeypatch.setattr(onboarding_module, "_get_active_profile_home", lambda: dest)
    return dest


class TestValidateMigrationSource:
    def test_accepts_existing_sidekick_home(self, standalone_home: Path) -> None:
        assert _validate_migration_source(str(standalone_home)) == standalone_home.resolve()

    def test_accepts_parent_containing_sidekick(self, standalone_home: Path) -> None:
        parent = standalone_home.parent
        assert _validate_migration_source(str(parent)) == standalone_home.resolve()

    def test_rejects_missing_home(self, tmp_path: Path) -> None:
        with pytest.raises(ValueError, match="does not exist"):
            _validate_migration_source(str(tmp_path / "nope"))

    def test_rejects_empty(self) -> None:
        with pytest.raises(ValueError, match="required"):
            _validate_migration_source("")

    def test_rejects_relative_path(self) -> None:
        with pytest.raises(ValueError, match="absolute"):
            _validate_migration_source("relative/path")

    def test_rejects_traversal(self, tmp_path: Path) -> None:
        with pytest.raises(ValueError, match=r"\.\."):
            _validate_migration_source(str(tmp_path / ".." / "escape"))


class TestDetectStandaloneInstall:
    def test_reports_components(self, standalone_home: Path) -> None:
        report = detect_standalone_install({"source_home": str(standalone_home)})
        assert report["found"] is True
        assert report["components"]["spaces"] is True
        assert report["components"]["supermemory"] is True
        assert report["components"]["profiles"] is False
        assert report["components"]["config"] is True


class TestMigrateStandaloneInstall:
    def test_copies_selected_items(self, standalone_home: Path, destination_home: Path) -> None:
        report = migrate_standalone_install({
            "source_home": str(standalone_home),
            "items": {"spaces": True, "supermemory": True, "profiles": False},
        })
        assert report["copied"] == ["spaces", "supermemory.db"]
        # Deselected items are not touched at all — neither copied nor skipped.
        assert "profiles" not in report["copied"]
        assert "profiles" not in report["skipped"]
        assert report["errors"] == []
        assert (destination_home / "spaces" / "work" / "note.md").read_text(encoding="utf-8") == "hello"
        assert (destination_home / "supermemory.db").read_bytes() == b"fake-db"
        assert not (destination_home / "profiles").exists()

    def test_backs_up_existing_destination(
        self, standalone_home: Path, destination_home: Path
    ) -> None:
        (destination_home / "spaces" / "old").mkdir(parents=True)
        (destination_home / "spaces" / "old" / "old.txt").write_text("old", encoding="utf-8")

        report = migrate_standalone_install({
            "source_home": str(standalone_home),
            "items": {"spaces": True, "supermemory": False, "profiles": False},
        })

        assert report["copied"] == ["spaces"]
        # New content in place, old content preserved under .bak
        assert (destination_home / "spaces" / "work" / "note.md").exists()
        assert (destination_home / "spaces.bak" / "old" / "old.txt").read_text(encoding="utf-8") == "old"

    def test_skips_missing_components(self, standalone_home: Path, destination_home: Path) -> None:
        report = migrate_standalone_install({
            "source_home": str(standalone_home),
            "items": {"spaces": False, "supermemory": False, "profiles": True},
        })
        assert report["copied"] == []
        assert report["skipped"] == ["profiles"]

    def test_rejects_traversal_source(self, destination_home: Path) -> None:
        with pytest.raises(ValueError):
            migrate_standalone_install({
                "source_home": "C:/../etc",
                "items": {"spaces": True, "supermemory": False, "profiles": False},
            })