"""Turnkey Local Supermemory Vector Engine with Automatic 3-Tier Fallback.

Provides persistent vector embedding, semantic search, and document memory without
manual API key barriers or cloud vendor lock-in.

3-Tier Automatic Fallback Pipeline:
1. Primary: Google Gemini CLI Embedding (`text-embedding-004`) when Google login is active.
2. Secondary: Local Ollama Embedding (`nomic-embed-text` / `all-minilm`) if Ollama is reachable.
3. Tertiary: Turnkey local BM25 & SQLite vector scoring (100% offline, zero setup, pure Python).
"""

from __future__ import annotations

import datetime
import json
import logging
import math
import os
import re
import sqlite3
import threading
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.error import URLError
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

TIER_GEMINI = "gemini"
TIER_OLLAMA = "ollama"
TIER_LOCAL_BM25 = "local_bm25"

MODEL_GEMINI = "text-embedding-004"
MODEL_OLLAMA = "nomic-embed-text"
MODEL_BM25 = "bm25"


@dataclass
class EmbeddingResult:
    """Result of an embedding calculation."""
    vector: Optional[List[float]]
    tier: str
    model: str
    tokens: List[str] = field(default_factory=list)


@dataclass
class SupermemoryDoc:
    """Document stored in Supermemory."""
    id: str
    title: str
    content: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    tags: List[str] = field(default_factory=lambda: ["Allgemein"])
    embedding: Optional[List[float]] = None
    tokens: List[str] = field(default_factory=list)
    tier: str = TIER_LOCAL_BM25
    created_at: float = field(default_factory=lambda: datetime.datetime.now().timestamp())
    updated_at: float = field(default_factory=lambda: datetime.datetime.now().timestamp())


def tokenize_text(text: str) -> List[str]:
    """Tokenize and normalize text into clean words for BM25 and sparse vectors."""
    clean = text.lower()
    return re.findall(r"\b[a-zA-Z0-9_\u00C0-\u017F]{2,}\b", clean)


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Calculate cosine similarity between two dense vectors."""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = 0.0
    norm1 = 0.0
    norm2 = 0.0
    for a, b in zip(v1, v2):
        dot += a * b
        norm1 += a * a
        norm2 += b * b
    if norm1 <= 0.0 or norm2 <= 0.0:
        return 0.0
    return dot / (math.sqrt(norm1) * math.sqrt(norm2))


class SupermemoryEngine:
    """Turnkey local SQLite vector store and semantic search engine."""

    def __init__(self, db_path: Optional[Union[str, Path]] = None):
        self.lock = threading.Lock()
        if db_path:
            self.db_path = Path(db_path).resolve()
        else:
            self.db_path = self._resolve_default_db_path()

        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _resolve_default_db_path(self) -> Path:
        """Resolve database path in active profile or state directory."""
        state_dir = os.environ.get("LASTBROWSER_WEBUI_STATE_DIR") or os.environ.get("SIDEKICK_STATE_DIR")
        if state_dir:
            return Path(state_dir) / "supermemory.db"

        home_dir = os.environ.get("SIDEKICK_HOME") or os.environ.get("LASTBROWSER_HOME")
        if home_dir:
            return Path(home_dir) / "supermemory.db"

        appdata = os.environ.get("APPDATA") or os.environ.get("LOCALAPPDATA") or str(Path.home())
        return Path(appdata) / "Lastbrowser" / "webui" / "supermemory.db"

    def _init_db(self) -> None:
        """Initialize database schema with documents and FTS/metadata tables."""
        with self.lock:
            conn = sqlite3.connect(str(self.db_path))
            try:
                cur = conn.cursor()
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS documents (
                        id TEXT PRIMARY KEY,
                        title TEXT,
                        content TEXT,
                        metadata TEXT,
                        tags TEXT,
                        embedding TEXT,
                        tokens TEXT,
                        tier TEXT,
                        created_at REAL,
                        updated_at REAL
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS meta (
                        key TEXT PRIMARY KEY,
                        value TEXT
                    )
                """)
                cur.execute("CREATE INDEX IF NOT EXISTS idx_docs_updated ON documents(updated_at DESC)")
                conn.commit()
            finally:
                conn.close()

    # -------------------------------------------------------------------------
    # Embedding Providers with Automatic Fallback
    # -------------------------------------------------------------------------

    def get_embedding(self, text: str) -> EmbeddingResult:
        """Compute embedding with automatic 3-tier fallback."""
        tokens = tokenize_text(text)

        # Tier 1: Google Gemini CLI
        gemini_res = self._try_gemini_embedding(text, tokens)
        if gemini_res is not None:
            return gemini_res

        # Tier 2: Local Ollama
        ollama_res = self._try_ollama_embedding(text, tokens)
        if ollama_res is not None:
            return ollama_res

        # Tier 3: Local BM25
        return EmbeddingResult(
            vector=None,
            tier=TIER_LOCAL_BM25,
            model=MODEL_BM25,
            tokens=tokens,
        )

    def _try_gemini_embedding(self, text: str, tokens: List[str]) -> Optional[EmbeddingResult]:
        """Tier 1: Request embedding from Google Gemini API (text-embedding-004)."""
        api_key = (
            os.environ.get("GEMINI_API_KEY")
            or os.environ.get("GOOGLE_API_KEY")
            or os.environ.get("GOOGLE_GENAI_API_KEY")
        )
        oauth_token = None
        if not api_key:
            try:
                from runtime.google_oauth import get_valid_access_token
                oauth_token = get_valid_access_token()
            except Exception:
                oauth_token = None

        if not api_key and not oauth_token:
            return None

        if api_key:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_GEMINI}:embedContent?key={api_key}"
            req_headers = {"Content-Type": "application/json", "User-Agent": "Lastbrowser-Supermemory/0.1.31"}
        else:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_GEMINI}:embedContent"
            req_headers = {
                "Content-Type": "application/json",
                "User-Agent": "Lastbrowser-Supermemory/0.1.31",
                "Authorization": f"Bearer {oauth_token}",
            }

        payload = json.dumps({"content": {"parts": [{"text": text[:8000]}]}}).encode("utf-8")

        req = Request(
            url,
            data=payload,
            headers=req_headers,
            method="POST",
        )
        try:
            with urlopen(req, timeout=5.0) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    values = data.get("embedding", {}).get("values")
                    if isinstance(values, list) and values:
                        return EmbeddingResult(
                            vector=[float(v) for v in values],
                            tier=TIER_GEMINI,
                            model=MODEL_GEMINI,
                            tokens=tokens,
                        )
        except Exception as e:
            logger.debug("Gemini embedding fallback: %s", e)

        return None

    def _try_ollama_embedding(self, text: str, tokens: List[str]) -> Optional[EmbeddingResult]:
        """Tier 2: Request embedding from local Ollama daemon (nomic-embed-text or all-minilm)."""
        ollama_host = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
        ollama_url = f"{ollama_host}/api/embeddings"

        for model in [MODEL_OLLAMA, "all-minilm"]:
            payload = json.dumps({"model": model, "prompt": text[:8000]}).encode("utf-8")
            req = Request(
                ollama_url,
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urlopen(req, timeout=0.8) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode("utf-8"))
                        embedding = data.get("embedding")
                        if isinstance(embedding, list) and embedding:
                            return EmbeddingResult(
                                vector=[float(v) for v in embedding],
                                tier=TIER_OLLAMA,
                                model=model,
                                tokens=tokens,
                            )
            except (URLError, TimeoutError, OSError) as e:
                logger.debug("Ollama embedding probe (%s) failed: %s", model, e)
                # If host is unreachable/connection refused, break immediately
                break
            except Exception as e:
                logger.debug("Ollama embedding error: %s", e)
                break

        return None

    # -------------------------------------------------------------------------
    # Public Supermemory API
    # -------------------------------------------------------------------------

    def status(self) -> Dict[str, Any]:
        """Get status of Supermemory, active tier, and document count."""
        probe = self.get_embedding("probe connection status")
        with self.lock:
            conn = sqlite3.connect(str(self.db_path))
            try:
                cur = conn.cursor()
                cur.execute("SELECT COUNT(*) FROM documents")
                count = cur.fetchone()[0]
            finally:
                conn.close()

        return {
            "configured": True,
            "connected": True,
            "tier": probe.tier,
            "model": probe.model,
            "document_count": count,
            "db_path": str(self.db_path),
            "timestamp": datetime.datetime.now().isoformat(),
        }

    def add_document(
        self,
        content: str,
        title: str = "",
        metadata: Optional[Dict[str, Any]] = None,
        tags: Optional[List[str]] = None,
        doc_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Store or update a document in Supermemory with computed embedding."""
        content = content.strip()
        if not content:
            raise ValueError("Document content cannot be empty.")

        clean_title = title.strip() or content[:50].split("\n")[0]
        meta_dict = metadata or {}
        tag_list = tags or (meta_dict.get("tags") if isinstance(meta_dict.get("tags"), list) else ["Allgemein"])
        doc_id_val = doc_id or f"sm-{uuid.uuid4().hex[:8]}"

        embed_res = self.get_embedding(f"{clean_title}\n{content}")
        now = datetime.datetime.now().timestamp()

        embedding_json = json.dumps(embed_res.vector) if embed_res.vector else None
        tokens_json = json.dumps(embed_res.tokens)
        meta_json = json.dumps(meta_dict)
        tags_json = json.dumps(tag_list)

        with self.lock:
            conn = sqlite3.connect(str(self.db_path))
            try:
                cur = conn.cursor()
                cur.execute("""
                    INSERT OR REPLACE INTO documents
                    (id, title, content, metadata, tags, embedding, tokens, tier, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    doc_id_val,
                    clean_title,
                    content,
                    meta_json,
                    tags_json,
                    embedding_json,
                    tokens_json,
                    embed_res.tier,
                    now,
                    now,
                ))
                conn.commit()
            finally:
                conn.close()

        return {
            "id": doc_id_val,
            "title": clean_title,
            "content": content,
            "category": tag_list[0] if tag_list else "Allgemein",
            "tier": embed_res.tier,
            "model": embed_res.model,
            "ok": True,
        }

    def search(
        self,
        query: str,
        limit: int = 10,
        container_tag: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Semantic search with cosine similarity (dense) and BM25 ranking (fallback)."""
        q = query.strip()
        if not q:
            return []

        embed_res = self.get_embedding(q)
        q_tokens = embed_res.tokens or tokenize_text(q)

        with self.lock:
            conn = sqlite3.connect(str(self.db_path))
            conn.row_factory = sqlite3.Row
            try:
                cur = conn.cursor()
                cur.execute("SELECT * FROM documents")
                rows = cur.fetchall()
            finally:
                conn.close()

        if not rows:
            return []

        scored_results: List[Tuple[float, Dict[str, Any]]] = []

        # Dense Cosine Similarity Path (if query produced a dense vector)
        if embed_res.vector:
            q_vec = embed_res.vector
            for row in rows:
                raw_emb = row["embedding"]
                if raw_emb:
                    try:
                        doc_vec = json.loads(raw_emb)
                        sim = cosine_similarity(q_vec, doc_vec)
                    except Exception:
                        sim = 0.0
                else:
                    sim = 0.0

                item = self._row_to_dict(row)
                scored_results.append((sim, item))

        # Turnkey Local BM25 Path (Tier 3 fallback or hybrid ranking)
        else:
            scored_results = self._bm25_rank(q_tokens, rows)

        # Sort descending by score
        scored_results.sort(key=lambda x: x[0], reverse=True)
        results: List[Dict[str, Any]] = []

        for score, item in scored_results[:limit]:
            norm_score = max(0.0, min(1.0, float(score)))
            item["score"] = round(norm_score, 4)
            results.append(item)

        return results

    def _bm25_rank(self, q_tokens: List[str], rows: List[Any]) -> List[Tuple[float, Dict[str, Any]]]:
        """Compute Okapi BM25 scores over documents."""
        N = len(rows)
        if N == 0 or not q_tokens:
            return [(0.0, self._row_to_dict(r)) for r in rows]

        k1 = 1.5
        b = 0.75

        # Document frequencies for query terms
        doc_token_lists: List[List[str]] = []
        doc_lens: List[int] = []

        for row in rows:
            raw_tokens = row["tokens"]
            tokens = json.loads(raw_tokens) if raw_tokens else tokenize_text(f"{row['title']} {row['content']}")
            doc_token_lists.append(tokens)
            doc_lens.append(len(tokens))

        avgdl = sum(doc_lens) / N if N > 0 else 1.0

        df: Dict[str, int] = {}
        for token in set(q_tokens):
            df[token] = sum(1 for tokens in doc_token_lists if token in tokens)

        scored: List[Tuple[float, Dict[str, Any]]] = []
        for i, row in enumerate(rows):
            tokens = doc_token_lists[i]
            dl = doc_lens[i]
            score = 0.0

            # Term frequencies
            tf: Dict[str, int] = {}
            for t in tokens:
                tf[t] = tf.get(t, 0) + 1

            for token in q_tokens:
                if token in tf:
                    n_q = df.get(token, 0)
                    idf = math.log((N - n_q + 0.5) / (n_q + 0.5) + 1.0)
                    freq = tf[token]
                    tf_norm = (freq * (k1 + 1.0)) / (freq + k1 * (1.0 - b + b * (dl / avgdl)))
                    score += idf * tf_norm

            # Normalize BM25 score approximately into [0, 1]
            norm_score = 1.0 - (1.0 / (1.0 + max(0.0, score)))
            scored.append((norm_score, self._row_to_dict(row)))

        return scored

    def list_documents(self, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """List documents stored in Supermemory."""
        with self.lock:
            conn = sqlite3.connect(str(self.db_path))
            conn.row_factory = sqlite3.Row
            try:
                cur = conn.cursor()
                cur.execute(
                    "SELECT * FROM documents ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                    (limit, offset),
                )
                rows = cur.fetchall()
            finally:
                conn.close()

        return [self._row_to_dict(r) for r in rows]

    def get_document(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """Get a document by its ID."""
        with self.lock:
            conn = sqlite3.connect(str(self.db_path))
            conn.row_factory = sqlite3.Row
            try:
                cur = conn.cursor()
                cur.execute("SELECT * FROM documents WHERE id = ?", (doc_id,))
                row = cur.fetchone()
            finally:
                conn.close()

        return self._row_to_dict(row) if row else None

    def forget_document(self, doc_id: str) -> bool:
        """Remove a document from Supermemory."""
        with self.lock:
            conn = sqlite3.connect(str(self.db_path))
            try:
                cur = conn.cursor()
                cur.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
                conn.commit()
                deleted = cur.rowcount > 0
            finally:
                conn.close()

        return deleted

    def reindex(self) -> Dict[str, Any]:
        """Re-embed all stored documents with the currently active tier."""
        docs = self.list_documents(limit=10000)
        updated_count = 0
        current_probe = self.get_embedding("probe active tier")

        for d in docs:
            embed_res = self.get_embedding(f"{d['title']}\n{d['content']}")
            embed_json = json.dumps(embed_res.vector) if embed_res.vector else None
            tokens_json = json.dumps(embed_res.tokens)

            with self.lock:
                conn = sqlite3.connect(str(self.db_path))
                try:
                    cur = conn.cursor()
                    cur.execute(
                        "UPDATE documents SET embedding = ?, tokens = ?, tier = ?, updated_at = ? WHERE id = ?",
                        (embed_json, tokens_json, embed_res.tier, datetime.datetime.now().timestamp(), d["id"]),
                    )
                    conn.commit()
                    updated_count += 1
                finally:
                    conn.close()

        return {
            "ok": True,
            "reindexed_count": updated_count,
            "active_tier": current_probe.tier,
            "active_model": current_probe.model,
        }

    def dump(self) -> Dict[str, Any]:
        """Dump complete Supermemory state and documents for backup / inspection."""
        stat = self.status()
        docs = self.list_documents(limit=10000)
        return {
            "status": stat,
            "documents": docs,
            "total_documents": len(docs),
            "dumped_at": datetime.datetime.now().isoformat(),
        }

    def _row_to_dict(self, row: Any) -> Dict[str, Any]:
        """Convert a SQLite row to a standardized dictionary."""
        tags = []
        if row["tags"]:
            try:
                tags = json.loads(row["tags"])
            except Exception:
                tags = ["Allgemein"]

        meta = {}
        if row["metadata"]:
            try:
                meta = json.loads(row["metadata"])
            except Exception:
                meta = {}

        return {
            "id": row["id"],
            "title": row["title"],
            "content": row["content"],
            "category": tags[0] if tags else "Allgemein",
            "tags": tags,
            "metadata": meta,
            "tier": row["tier"],
            "source": "supermemory",
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }


# Global singleton instance accessor
_ENGINE_INSTANCE: Optional[SupermemoryEngine] = None
_ENGINE_LOCK = threading.Lock()


def get_supermemory_engine() -> SupermemoryEngine:
    """Get or instantiate the global Supermemory engine singleton."""
    global _ENGINE_INSTANCE
    with _ENGINE_LOCK:
        if _ENGINE_INSTANCE is None:
            _ENGINE_INSTANCE = SupermemoryEngine()
        return _ENGINE_INSTANCE
