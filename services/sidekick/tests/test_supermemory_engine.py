"""Unit tests for turnkey Supermemory vector engine with automatic fallback."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

from runtime.supermemory_engine import (
    MODEL_BM25,
    TIER_GEMINI,
    TIER_LOCAL_BM25,
    TIER_OLLAMA,
    SupermemoryEngine,
    cosine_similarity,
    tokenize_text,
)


def test_tokenize_text() -> None:
    tokens = tokenize_text("Hello World! This is Lastbrowser Nova AI (v0.1.31).")
    assert "hello" in tokens
    assert "world" in tokens
    assert "lastbrowser" in tokens
    assert "nova" in tokens


def test_cosine_similarity() -> None:
    v1 = [1.0, 0.0, 0.0]
    v2 = [1.0, 0.0, 0.0]
    assert round(cosine_similarity(v1, v2), 4) == 1.0

    v3 = [0.0, 1.0, 0.0]
    assert round(cosine_similarity(v1, v3), 4) == 0.0

    v4 = [1.0, 1.0, 0.0]
    assert round(cosine_similarity(v1, v4), 4) == 0.7071


def test_supermemory_crud_and_bm25_search(tmp_path: Path) -> None:
    db_file = tmp_path / "test_supermemory.db"
    engine = SupermemoryEngine(db_file)

    # 1. Status initially
    status = engine.status()
    assert status["configured"] is True
    assert status["connected"] is True
    assert status["tier"] == TIER_LOCAL_BM25
    assert status["model"] == MODEL_BM25
    assert status["document_count"] == 0

    # 2. Add documents
    doc1 = engine.add_document(
        title="Electron Architekur",
        content="Lastbrowser nutzt Electron mit einem React 19 Frontend und Python Sidekick Backend.",
        tags=["Architektur"],
    )
    assert doc1["ok"] is True
    assert doc1["tier"] == TIER_LOCAL_BM25

    doc2 = engine.add_document(
        title="Supermemory Notiz",
        content="Supermemory bietet persistente Vektor-Einbettung und semantische Suche über SQLite.",
        tags=["Memory"],
    )
    assert doc2["ok"] is True

    # Check status count
    assert engine.status()["document_count"] == 2

    # 3. List documents
    docs = engine.list_documents()
    assert len(docs) == 2
    doc_ids = [d["id"] for d in docs]
    assert doc1["id"] in doc_ids
    assert doc2["id"] in doc_ids

    # 4. Search BM25 (Tier 3 fallback)
    hits = engine.search("Electron Frontend", limit=5)
    assert len(hits) >= 1
    assert hits[0]["id"] == doc1["id"]
    assert hits[0]["score"] > 0.0
    assert hits[0]["category"] == "Architektur"

    hits_mem = engine.search("Vektor semantische Suche", limit=5)
    assert len(hits_mem) >= 1
    assert hits_mem[0]["id"] == doc2["id"]

    # 5. Get document by ID
    retrieved = engine.get_document(doc1["id"])
    assert retrieved is not None
    assert retrieved["title"] == "Electron Architekur"

    # 6. Reindex
    reindex_res = engine.reindex()
    assert reindex_res["ok"] is True
    assert reindex_res["reindexed_count"] == 2

    # 7. Dump
    dump_data = engine.dump()
    assert dump_data["total_documents"] == 2
    assert len(dump_data["documents"]) == 2

    # 8. Forget document
    deleted = engine.forget_document(doc1["id"])
    assert deleted is True
    assert engine.status()["document_count"] == 1
    assert engine.get_document(doc1["id"]) is None


def test_supermemory_tier1_gemini_fallback(tmp_path: Path) -> None:
    db_file = tmp_path / "test_gemini.db"
    engine = SupermemoryEngine(db_file)

    fake_vector = [0.1] * 768

    with patch.object(engine, "_try_gemini_embedding") as mock_gemini:
        from runtime.supermemory_engine import EmbeddingResult
        mock_gemini.return_value = EmbeddingResult(
            vector=fake_vector,
            tier=TIER_GEMINI,
            model="text-embedding-004",
            tokens=["gemini", "embedding"],
        )

        doc = engine.add_document("Gemini Cloud Vector Document", title="Gemini Doc")
        assert doc["tier"] == TIER_GEMINI
        assert doc["model"] == "text-embedding-004"

        search_res = engine.search("Gemini Query")
        assert len(search_res) == 1
        assert search_res[0]["tier"] == TIER_GEMINI


def test_supermemory_tier2_ollama_fallback(tmp_path: Path) -> None:
    db_file = tmp_path / "test_ollama.db"
    engine = SupermemoryEngine(db_file)

    fake_vector = [0.2] * 384

    with patch.object(engine, "_try_gemini_embedding", return_value=None):
        with patch.object(engine, "_try_ollama_embedding") as mock_ollama:
            from runtime.supermemory_engine import EmbeddingResult
            mock_ollama.return_value = EmbeddingResult(
                vector=fake_vector,
                tier=TIER_OLLAMA,
                model="nomic-embed-text",
                tokens=["ollama", "local"],
            )

            doc = engine.add_document("Local Ollama Embedding Document", title="Ollama Doc")
            assert doc["tier"] == TIER_OLLAMA
            assert doc["model"] == "nomic-embed-text"

            search_res = engine.search("Ollama Query")
            assert len(search_res) == 1
            assert search_res[0]["tier"] == TIER_OLLAMA
