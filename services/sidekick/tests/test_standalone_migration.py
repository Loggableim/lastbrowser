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

    def test_accepts_appdata_sidekick_home_and_its_parent(self, tmp_path: Path) -> None:
        sidekick_home = tmp_path / "AppData" / "Roaming" / "sidekick"
        sidekick_home.mkdir(parents=True)
        assert _validate_migration_source(str(sidekick_home)) == sidekick_home.resolve()
        assert _validate_migration_source(str(sidekick_home.parent)) == sidekick_home.resolve()

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

    def test_rejects_arbitrary_directory(self, tmp_path: Path) -> None:
        arbitrary = tmp_path / "documents"
        arbitrary.mkdir()
        (arbitrary / "spaces").mkdir()
        with pytest.raises(ValueError, match="sidekick data directory"):
            _validate_migration_source(str(arbitrary))

    def test_rejects_symlinked_source_home(self, standalone_home: Path, tmp_path: Path) -> None:
        link = tmp_path / "sidekick"
        try:
            link.symlink_to(standalone_home, target_is_directory=True)
        except (OSError, NotImplementedError):
            pytest.skip("symlink creation is not available")
        with pytest.raises(ValueError, match="symlink or junction"):
            _validate_migration_source(str(link))


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

    def test_copy_failure_keeps_existing_destination_in_place(
        self, standalone_home: Path, destination_home: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import shutil

        existing = destination_home / "spaces"
        existing.mkdir()
        (existing / "keep.txt").write_text("existing", encoding="utf-8")
        real_copytree = shutil.copytree

        def fail_copytree(*args, **kwargs):
            raise OSError("simulated disk full")

        monkeypatch.setattr(shutil, "copytree", fail_copytree)
        report = migrate_standalone_install({
            "source_home": str(standalone_home),
            "items": {"spaces": True, "supermemory": False, "profiles": False},
        })

        monkeypatch.setattr(shutil, "copytree", real_copytree)
        assert report["copied"] == []
        assert len(report["errors"]) == 1
        assert (destination_home / "spaces" / "keep.txt").read_text(encoding="utf-8") == "existing"
        assert not (destination_home / "spaces.bak").exists()
        assert not list(destination_home.glob(".spaces.migration-*"))

    def test_rejects_symlinks_inside_selected_tree_without_copying(
        self, standalone_home: Path, destination_home: Path
    ) -> None:
        outside = destination_home.parent / "outside-secret.txt"
        outside.write_text("must not be imported", encoding="utf-8")
        link = standalone_home / "spaces" / "work" / "external.txt"
        try:
            link.symlink_to(outside)
        except (OSError, NotImplementedError):
            pytest.skip("symlink creation is not available")

        report = migrate_standalone_install({
            "source_home": str(standalone_home),
            "items": {"spaces": True, "supermemory": False, "profiles": False},
        })

        assert report["copied"] == []
        assert any("symlink or junction" in error for error in report["errors"])
        assert not (destination_home / "spaces").exists()
        assert outside.read_text(encoding="utf-8") == "must not be imported"
        assert not list(destination_home.glob(".spaces.migration-*"))

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
