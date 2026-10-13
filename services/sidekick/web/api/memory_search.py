"""Hybrid memory results retain their source and real document identity."""
from pathlib import Path
import re


def search_local_notes(memory_dir: Path, query: str) -> list[dict]:
    hits = []
    for section, filename in (("memory", "MEMORY.md"), ("user", "USER.md")):
        path = memory_dir / filename
        if not path.exists():
            continue
        for line_number, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if query.casefold() not in line.casefold():
                continue
            tag = re.search(r"#tag:\s*([\w-]+)", line, re.IGNORECASE)
            hits.append({
                "id": f"local:{section}:{line_number}", "source": "local", "section": section,
                "title": filename, "content": line.strip(), "line": line_number,
                "category": tag.group(1) if tag else "", "score": 1.0,
            })
    return hits


def merge_memory_hits(local: list[dict], documents: list[dict], limit: int) -> list[dict]:
    # Never truncate document IDs or conflate different documents sharing a prefix.
    seen = set()
    hits = []
    for item in sorted(local + documents, key=lambda item: float(item.get("score", 0)), reverse=True):
        identity = (item.get("source"), item.get("id"))
        if identity in seen:
            continue
        seen.add(identity)
        hits.append(item)
    return hits[:limit]
