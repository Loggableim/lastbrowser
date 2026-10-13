"""Execute the hybrid handler with isolated storage, without booting unrelated services."""
import ast
from pathlib import Path
from types import ModuleType, SimpleNamespace
import sys

import pytest

from runtime.supermemory_engine import SupermemoryEngine
from web.api.memory_search import search_local_notes, merge_memory_hits


def handler_function(name="_handle_hybrid_search"):
    # Compile the real handler, avoiding web-server startup/configuration side effects.
    source = Path(__file__).parents[1] / "web" / "api" / "routes.py"
    tree = ast.parse(source.read_text(encoding="utf-8"))
    function = next(item for item in tree.body if isinstance(item, ast.FunctionDef) and item.name == name)
    from web.api.helpers import require
    namespace = {
        "require": require,
        "j": lambda handler, payload: payload,
        "bad": lambda handler, error: {"ok": False, "error": error},
        "logger": SimpleNamespace(exception=lambda *args: None),
        "_redact_text": lambda content: content.replace("private-value", "[redacted]"),
    }
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), "exec"), namespace)
    return namespace[function.name]


@pytest.fixture
def memory_backend(monkeypatch, tmp_path):
    engine = SupermemoryEngine(tmp_path / "documents.db")
    monkeypatch.setattr(engine, "_try_gemini_embedding", lambda *args: None)
    monkeypatch.setattr(engine, "_try_ollama_embedding", lambda *args: None)
    import runtime.supermemory_engine as runtime
    monkeypatch.setattr(runtime, "get_supermemory_engine", lambda: engine)
    space = ModuleType("web.api.space_engine")
    space.resolve_active_space = lambda: SimpleNamespace(memory_dir=tmp_path / "notes")
    monkeypatch.setitem(sys.modules, "web.api.space_engine", space)
    notes = tmp_path / "notes"
    notes.mkdir()
    (notes / "MEMORY.md").write_text("Browser private-value #tag:Work\n", encoding="utf-8")
    (notes / "USER.md").write_text("Browser preference\n", encoding="utf-8")
    return engine, notes, handler_function()


@pytest.mark.parametrize("query_key", ["q", "query"])
def test_hybrid_accepts_renderer_query_and_legacy_q(memory_backend, query_key):
    engine, notes, handler = memory_backend
    doc = engine.add_document("Browser document", title="Stored document")
    result = handler(None, {query_key: "Browser", "limit": 20})
    assert result["ok"] is True
    assert result["results"] == result["hits"]
    assert {item["source"] for item in result["hits"]} == {"local", "supermemory"}
    assert {item["section"] for item in result["hits"] if item["source"] == "local"} == {"memory", "user"}
    document = next(item for item in result["hits"] if item["source"] == "supermemory")
    assert document["id"] == doc["id"]
    assert engine.get_document(document["id"])["content"] == "Browser document"
    assert "private-value" not in str(result)


def test_local_hits_are_stable_and_distinct_from_documents(memory_backend):
    engine, notes, _ = memory_backend
    assert search_local_notes(notes, "browser") == search_local_notes(notes, "browser")
    local = search_local_notes(notes, "browser")
    documents = [{"id": "long-document-a", "source": "supermemory", "content": "x" * 120 + suffix, "score": .5} for suffix in ["A", "B"]]
    documents[1]["id"] = "long-document-b"
    result = merge_memory_hits(local, documents, 20)
    assert len(result) == 4
    assert len(merge_memory_hits(local, documents, 1)) == 1


def test_no_keyword_match_returns_no_documents(memory_backend):
    engine, _, handler = memory_backend
    engine.add_document("Browser document", title="Stored document")
    assert engine.search("unmatchedword") == []
    assert handler(None, {"query": "unmatchedword"})["hits"] == []


@pytest.mark.parametrize("body", [{"query": " "}, {"query": 42}, {"query": "Browser", "limit": "bad"}])
def test_invalid_hybrid_input_returns_visible_error(memory_backend, body):
    _, _, handler = memory_backend
    assert handler(None, body)["ok"] is False


def test_engine_failure_is_not_reported_as_empty_success(memory_backend, monkeypatch):
    engine, _, handler = memory_backend
    def fail(*args, **kwargs):
        raise RuntimeError("storage unavailable")
    monkeypatch.setattr(engine, "search", fail)
    result = handler(None, {"query": "Browser"})
    assert result["ok"] is False
    assert "storage unavailable" in result["error"]


def test_local_note_can_be_cleared_without_accepting_invalid_content(memory_backend):
    _, notes, _ = memory_backend
    write = handler_function("_handle_memory_write")
    assert write(None, {"section": "memory", "content": ""})["ok"] is True
    assert (notes / "MEMORY.md").read_text(encoding="utf-8") == ""
    assert (notes / "USER.md").read_text(encoding="utf-8") == "Browser preference\n"
    for content in [None, 42, {}]:
        assert write(None, {"section": "memory", "content": content})["ok"] is False
