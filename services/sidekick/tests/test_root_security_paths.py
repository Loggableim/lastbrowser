"""Temporary-root and junction escape probes for independent file authority."""
from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

from runtime.independent.native_chat_policy import _canonical_tool_path
from runtime.independent.policy import PolicyDenied, read_authorized_file


def _make_directory_link(link: Path, target: Path) -> None:
    if os.name == "nt":
        quote = lambda value: "'" + str(value).replace("'", "''") + "'"
        script = f"New-Item -ItemType Junction -Path {quote(link)} -Target {quote(target)} -ErrorAction Stop | Out-Null"
        subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
            check=True, capture_output=True, timeout=15)
    else:
        link.symlink_to(target, target_is_directory=True)


def test_root_security_workspace_junction_cannot_escape_to_sibling_tree(tmp_path):
    workspace = tmp_path / "authorized-workspace"
    outside = tmp_path / "private-sibling"
    workspace.mkdir(); outside.mkdir()
    secret = outside / "marker.txt"
    secret.write_text("outside sentinel", encoding="utf-8")
    link = workspace / "redirected"
    _make_directory_link(link, outside)

    with pytest.raises(PermissionError):
        _canonical_tool_path(str(link / "marker.txt"), workspace)
    with pytest.raises(PolicyDenied):
        read_authorized_file(str(link / "marker.txt"), (str(workspace),))
    assert secret.read_text("utf-8") == "outside sentinel"


@pytest.mark.skipif(os.name != "nt", reason="UNC path syntax is Windows-specific")
def test_root_security_unc_path_is_rejected_before_network_or_file_access(tmp_path):
    workspace = tmp_path / "authorized-workspace"
    workspace.mkdir()
    raw_unc = r"\\controlled-invalid-host.invalid\sensitive\fixture.txt"
    with pytest.raises(PermissionError):
        _canonical_tool_path(raw_unc, workspace)
