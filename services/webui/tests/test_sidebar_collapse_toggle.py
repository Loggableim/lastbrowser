"""Regression tests for the primary rail expand/collapse behavior."""

import pathlib
import re

REPO = pathlib.Path(__file__).parent.parent
HTML = (REPO / "static" / "index.html").read_text(encoding="utf-8")
CSS = (REPO / "static" / "style.css").read_text(encoding="utf-8")
SPACES_CSS = (REPO / "static" / "spaces.css").read_text(encoding="utf-8")
BOOT_JS = (REPO / "static" / "boot.js").read_text(encoding="utf-8")
PANELS_JS = (REPO / "static" / "panels.js").read_text(encoding="utf-8")


def _function_body(src: str, name: str) -> str:
    idx = src.index(f"function {name}")
    end = src.find("\nfunction ", idx + 1)
    return src[idx:] if end == -1 else src[idx:end]


class TestPrimaryRailCSS:
    def test_expanded_rail_rule_exists(self):
        assert ".layout.rail-expanded .rail" in CSS
        assert 'html[data-rail-expanded="1"] .rail' in CSS

    def test_expanded_rail_shows_tooltip_titles_as_labels(self):
        compact = CSS.replace(" ", "")
        assert "content:attr(data-tooltip)" in compact
        assert "position:static" in compact
        assert "opacity:1" in compact
        assert ".layout.rail-expanded.rail-btn.nav-tab::after" in compact

    def test_old_sidebar_hiding_rule_is_not_used(self):
        assert ".layout.sidebar-collapsed .sidebar" not in CSS
        assert 'html[data-sidebar-collapsed="1"] .sidebar' not in CSS

    def test_toggle_icon_uses_rail_expanded_state(self):
        compact = CSS.replace(" ", "")
        assert "#railSidebarTogglesvg{transform:rotate(180deg)" in compact
        assert ".layout.rail-expanded#railSidebarTogglesvg," in compact
        assert "html[data-rail-expanded=\"1\"]#railSidebarTogglesvg{transform:rotate(0deg)" in compact
        assert ".layout.rail-expanded #railSidebarToggle svg" in CSS
        assert ".layout.sidebar-collapsed #railSidebarToggle svg" not in SPACES_CSS

    def test_legacy_sidebar_nav_does_not_open_second_sidebar(self):
        spaces_js = (REPO / "static" / "spaces.js").read_text(encoding="utf-8")
        assert "document.documentElement.dataset.sidebarNav =" not in spaces_js
        assert '[data-sidebar-nav="expanded"] .sidebar > .sidebar-nav { display: flex !important; }' not in spaces_js
        assert ".sidebar > .sidebar-nav { display: none !important; }" in SPACES_CSS

    def test_css_breakpoint_matches_js_isdesktopwidth(self):
        js_bp = re.search(
            r"function\s+_isDesktopWidth[^}]*?matchMedia\('([^']+)'\)",
            BOOT_JS,
            re.DOTALL,
        )
        assert js_bp, "Could not locate _isDesktopWidth matchMedia query in boot.js"
        assert "@media(min-width:641px)" in CSS.replace(" ", "")


class TestPrimaryRailBootJS:
    def test_localstorage_key_constant(self):
        m = re.search(r"const\s+_RAIL_EXPANDED_KEY\s*=\s*'([^']*)'", BOOT_JS)
        assert m, "_RAIL_EXPANDED_KEY constant missing from boot.js"
        assert m.group(1) == "hermes-webui-rail-expanded"

    def test_toggle_sidebar_expands_rail_not_content_sidebar(self):
        body = _function_body(BOOT_JS, "toggleSidebar")
        assert "_isDesktopWidth()" in body
        assert "rail-expanded" in body
        assert "classList.toggle('sidebar-collapsed'" not in body
        assert "localStorage.setItem(_RAIL_EXPANDED_KEY" in body

    def test_restore_on_boot_promotes_rail_expanded_marker(self):
        idx = BOOT_JS.index("_restoreSidebarState")
        body = BOOT_JS[idx : BOOT_JS.index("})();", idx)]
        assert "data-rail-expanded" in body
        assert "layout.classList.add('rail-expanded')" in body
        assert "_syncSidebarAria()" in body

    def test_bfcache_pageshow_resyncs_rail_state(self):
        idx = BOOT_JS.index("window.addEventListener('pageshow'")
        block = BOOT_JS[idx : BOOT_JS.index("});", idx) + 3]
        assert "hermes-webui-rail-expanded" in block
        assert "_syncSidebarAria" in block


class TestSwitchPanelRailBehavior:
    def test_from_rail_click_guard(self):
        assert "opts.fromRailClick" in PANELS_JS

    def test_same_panel_toggles_primary_rail(self):
        idx = PANELS_JS.index("opts.fromRailClick")
        block = PANELS_JS[idx : idx + 1200]
        assert "_isDesktopWidth" in block
        assert "toggleSidebar(!_isSidebarCollapsed())" in block

    def test_different_panel_does_not_expand_content_sidebar(self):
        idx = PANELS_JS.index("opts.fromRailClick")
        block = PANELS_JS[idx : idx + 1600]
        assert "expandSidebar()" not in block

    def test_aria_sync_after_panel_switch(self):
        assert "_syncSidebarAria" in PANELS_JS


class TestRailButtonsPassFromRailClick:
    def _rail_section(self):
        start = HTML.index('<nav class="rail"')
        end = HTML.index("</nav>", start)
        return HTML[start:end]

    def test_all_rail_buttons_pass_from_rail_click(self):
        section = self._rail_section()
        calls = re.findall(r"switchPanel\('(\w+)'(?:\s*,\s*([^)]*))?\)", section)
        assert calls
        for panel, args in calls:
            assert args and "fromRailClick:true" in args, panel

    def test_dashboard_button_unchanged(self):
        assert "openHermesDashboard(event)" in HTML
        dash_idx = HTML.index("openHermesDashboard(event)")
        assert "fromRailClick" not in HTML[dash_idx - 200 : dash_idx + 50]


class TestFlashPreventionScript:
    def test_inline_script_uses_rail_expanded_key(self):
        assert "hermes-webui-rail-expanded" in HTML
        script_idx = HTML.index("hermes-webui-rail-expanded")
        css_idx = HTML.index('href="static/style.css')
        assert script_idx < css_idx
        open_tag = HTML.rfind("<script>", 0, script_idx)
        close_tag = HTML.index("</script>", script_idx)
        block = HTML[open_tag:close_tag]
        assert "dataset.railExpanded" in block
