from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_appstore_frontend_has_no_dead_sdk_or_placeholder_actions():
    panels = (ROOT / "static" / "panels.js").read_text(encoding="utf-8")
    index = (ROOT / "static" / "index.html").read_text(encoding="utf-8")

    assert "/home/appstore/SDK.md" not in panels
    assert "/home/appstore/SDK.md" not in index
    assert "Test-Connection" not in panels
    assert "_renderAppstoreSdk" in panels
    assert "_renderAppstoreSubmit" in panels


def test_appstore_frontend_uses_dynamic_categories_and_i18n_fallbacks():
    panels = (ROOT / "static" / "panels.js").read_text(encoding="utf-8")

    assert "function _appstoreCategories()" in panels
    assert "function _appstoreText(" in panels
    assert "AI & LLM" in panels
    categories_body = panels.split("function _appstoreCategories()", 1)[1].split("function _appstoreNormalizeApp", 1)[0]
    assert "_appstoreCategories()" not in categories_body


def test_appstore_sdk_endpoint_is_registered():
    routes = (ROOT / "api" / "routes.py").read_text(encoding="utf-8")
    appstore = (ROOT / "api" / "appstore.py").read_text(encoding="utf-8")

    assert "get_sdk_docs" in routes
    assert 'parsed.path == "/api/appstore/sdk"' in routes
    assert "def get_sdk_docs()" in appstore
