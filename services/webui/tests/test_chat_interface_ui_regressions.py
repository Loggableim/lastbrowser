import re
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
INDEX_HTML = (REPO / "static" / "index.html").read_text(encoding="utf-8")
STYLE_CSS = (REPO / "static" / "style.css").read_text(encoding="utf-8")
MESSAGES_JS = (REPO / "static" / "messages.js").read_text(encoding="utf-8")


def _tag_for(element_id: str) -> str:
    match = re.search(rf"<[^>]+\bid=\"{re.escape(element_id)}\"[^>]*>", INDEX_HTML)
    assert match, f"#{element_id} tag not found"
    return match.group(0)


def _function_body(name: str) -> str:
    start = MESSAGES_JS.index(f"function {name}")
    next_match = re.search(r"\n(?:async\s+)?function\s+", MESSAGES_JS[start + 1 :])
    end = start + 1 + next_match.start() if next_match else len(MESSAGES_JS)
    return MESSAGES_JS[start:end]


def test_inactive_clarify_card_is_hidden_from_ui_and_accessibility_tree():
    tag = _tag_for("clarifyCard")
    assert 'aria-hidden="true"' in tag
    assert "inert" in tag
    assert re.search(r"\.clarify-card\{[^}]*visibility:hidden", STYLE_CSS)
    assert re.search(r"\.clarify-card\.visible\{[^}]*visibility:visible", STYLE_CSS)


def test_clarify_show_hide_toggles_accessibility_state():
    show_body = _function_body("showClarifyCard")
    hide_body = _function_body("hideClarifyCard")
    ensure_body = _function_body("_ensureClarifyCardDom")
    assert 'card.setAttribute("aria-hidden", "true")' in ensure_body
    assert 'card.setAttribute("inert", "")' in ensure_body
    assert 'card.setAttribute("aria-hidden", "false")' in show_body
    assert 'card.removeAttribute("inert")' in show_body
    assert 'card.setAttribute("aria-hidden", "true")' in hide_body
    assert 'card.setAttribute("inert", "")' in hide_body


def test_icon_only_composer_buttons_have_accessible_names():
    expected = {
        "btnAttach": 'aria-label="Attach files"',
        "btnMic": 'aria-label="Dictate"',
        "btnVoiceMode": 'aria-label="Voice mode"',
    }
    for element_id, attr in expected.items():
        assert attr in _tag_for(element_id)


def test_action_chip_buttons_have_tooltips_and_names():
    for label in (
        "Review current state",
        "Run tests",
        "Install packages",
        "Deploy to production",
        "Create implementation plan",
    ):
        assert f'data-tooltip="{label}"' in INDEX_HTML
        assert f'aria-label="{label}"' in INDEX_HTML


def test_composer_mode_toggle_is_accessible_and_bound_globally():
    assert 'id="modeToggle"' in INDEX_HTML
    assert 'role="radiogroup"' in INDEX_HTML
    assert 'aria-label="Composer mode"' in INDEX_HTML
    assert 'aria-pressed="true"' in INDEX_HTML
    assert 'aria-pressed="false"' in INDEX_HTML

    ui = (REPO / "static" / "ui.js").read_text(encoding="utf-8")
    boot = (REPO / "static" / "boot.js").read_text(encoding="utf-8")

    assert "window.setComposerMode=setComposerMode;" in ui
    assert "window.syncComposerModeButtons=syncComposerModeButtons;" in ui
    assert "function syncComposerModeButtons(mode)" in ui
    assert "if(typeof syncComposerModeButtons==='function') syncComposerModeButtons(window._composerMode||'action');" in boot
    assert "if(window._composerMode&&typeof setComposerMode==='function') setComposerMode(window._composerMode);" not in boot
