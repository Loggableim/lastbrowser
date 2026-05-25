"""Regression tests for chat sidebar filtering under space isolation.

The old All/Unassigned project-chip row is intentionally not visible anymore:
each active space owns its own chat list. Keeping a second visible project
filter in the chat sidebar made the UI duplicate state and could hide chats
behind an invisible filter after a space switch.
"""

from __future__ import annotations

import pathlib

JS = pathlib.Path(__file__).parent.parent / "static" / "sessions.js"
CSS = pathlib.Path(__file__).parent.parent / "static" / "style.css"


def _js() -> str:
    return JS.read_text(encoding="utf-8")


def _css() -> str:
    return CSS.read_text(encoding="utf-8")


def test_no_project_filter_sentinel_can_remain_for_legacy_menu_code():
    js = _js()
    assert "const NO_PROJECT_FILTER = '__none__';" in js


def test_space_isolation_clears_invisible_project_filter():
    js = _js()
    assert "if(_activeProject) _activeProject=null;" in js
    assert "const projectFiltered=profileFiltered;" in js
    assert "profileFiltered.filter(s=>!s.project_id)" not in js[js.index("function renderSessionListFromCache"):]


def test_project_chip_bar_is_not_rendered_in_chat_sidebar():
    js = _js()
    assert "if(false&&(_allProjects.length>0||hasUnprojected)){" in js
    assert "allChip.textContent='All';" in js
    assert "noneChip.textContent='Unassigned';" in js


def test_legacy_chip_css_is_harmless_when_not_rendered():
    css = _css()
    assert ".project-chip.no-project{border-style:dashed;}" in css
