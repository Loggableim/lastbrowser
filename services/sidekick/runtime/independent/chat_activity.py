"""Bounded, read-only native chat observations from a caller-resolved owner.

No Session imports, profile switching, provider calls, or transcript decoding.
The parent must supply its actual live stream IDs and collection timestamp.
"""
from __future__ import annotations

import codecs
import json
import os
import re
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import Collection, Literal, Mapping, Protocol


class ResolvedScope(Protocol):
    def model_dump(self, *, by_alias: bool = False) -> dict: ...


@dataclass(frozen=True)
class NativeChatActivity:
    session_id: str
    title: str
    model: str | None
    model_provider: str | None
    active_stream_id: str
    observed_at: str
    state: Literal["streaming"] = "streaming"
    source_actuality: Literal["live"] = "live"

    def as_dict(self) -> dict:
        return {"sessionId": self.session_id, "title": self.title, "model": self.model,
                "modelProvider": self.model_provider, "state": self.state,
                "activeStreamId": self.active_stream_id, "observedAt": self.observed_at,
                "sourceActuality": self.source_actuality}


@dataclass(frozen=True)
class NativeChatSnapshot:
    rows: tuple[NativeChatActivity, ...]
    observed_at: str
    source_actuality: Literal["live", "partial", "unavailable"]
    inspected_files: int = 0
    bytes_read: int = 0


def _scope(value: Mapping[str, str] | ResolvedScope) -> dict[str, str] | None:
    raw = dict(value) if isinstance(value, Mapping) else value.model_dump(by_alias=True)
    keys = ("backendProfileId", "spaceId", "browserProfileId")
    if set(raw) != set(keys) or any(not isinstance(raw[k], str) or not raw[k] for k in keys):
        return None
    return {k: raw[k] for k in keys}


def _linked(path: Path) -> bool:
    info = path.lstat()
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, "st_file_attributes", 0) & 0x400)


def _safe_directory(path: Path) -> bool:
    return path.is_absolute() and all(not _linked(p) for p in (path, *path.parents)) and path.is_dir()


def _metadata(prefix: bytes, *, required_fields: Collection[str] = (),
              stop_before_fields: Mapping[str, tuple[str, ...]] | None = None) -> dict | None:
    """Decode complete metadata only; optional owner projection stops earlier.

    Default activity observations retain their messages boundary. A caller
    requesting an early boundary must already have every required field;
    only its known growing field's expected JSON opening token may stop it.
    Missing/duplicate/malformed owner fields never become a partial success.
    """
    text = prefix.decode("utf-8", errors="strict")
    required = frozenset(required_fields)
    stops = stop_before_fields or {}
    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("Duplicate native owner metadata field")
            result[key] = value
        return result
    decoder = json.JSONDecoder(object_pairs_hook=unique_object if required else None)
    length = len(text)
    def ws(pos):
        while pos < length and text[pos] in " \t\r\n":
            pos += 1
        return pos
    pos = ws(0)
    if pos >= length or text[pos] != "{":
        return None
    pos = ws(pos + 1)
    metadata = {}
    def complete():
        return metadata if required.issubset(metadata) else None
    while pos < length:
        if text[pos] == "}":
            return complete() if not text[pos + 1:].strip() else None
        key, pos = decoder.raw_decode(text, pos)
        if not isinstance(key, str) or key in metadata:
            return None
        pos = ws(pos)
        if pos >= length or text[pos] != ":":
            return None
        pos = ws(pos + 1)
        if key in stops and pos < length and text[pos] in stops[key]:
            return complete()
        if key == "messages":
            return complete() if pos < length and text[pos] == "[" else None
        value, pos = decoder.raw_decode(text, pos)
        metadata[key] = value
        pos = ws(pos)
        if pos >= length:
            return None
        if text[pos] == "}":
            return complete() if not text[pos + 1:].strip() else None
        if text[pos] != ",":
            return None
        pos = ws(pos + 1)
    return None


def snapshot_native_chats(*, resolved_scope: Mapping[str, str] | ResolvedScope,
                          actor_profile_name: str, sessions_dir: Path,
                          active_stream_ids: Collection[str], observed_at: str,
                          existing_session_ids: Collection[str] = (),
                          max_files: int = 256, max_prefix_bytes: int = 65536) -> NativeChatSnapshot:
    """Observe only exact owner metadata intersecting actual parent stream IDs.

    existing_session_ids lets callers retain IA rows while avoiding duplicates.
    `partial` means bounds or unreadable/invalid files prevented full coverage;
    it never means a pending persisted flag is evidence of an active stream.
    """
    if not 1 <= max_files <= 256 or not 1 <= max_prefix_bytes <= 65536:
        raise ValueError("observation bounds exceed hard limits")
    scope = _scope(resolved_scope)
    if scope is None or not actor_profile_name or not observed_at:
        return NativeChatSnapshot((), observed_at, "unavailable")
    root = Path(sessions_dir)
    streams = frozenset(s for s in active_stream_ids if isinstance(s, str) and s)
    seen = set(existing_session_ids)
    rows = []
    inspected = read_bytes = 0
    partial = False
    try:
        if not _safe_directory(root):
            return NativeChatSnapshot((), observed_at, "unavailable")
        with os.scandir(root) as entries:
            for index, entry in enumerate(entries):
                if index >= max_files:
                    partial = True
                    break
                if not re.fullmatch(r"[A-Za-z0-9_-]{1,200}\.json", entry.name) or entry.name.startswith("_"):
                    continue
                inspected += 1
                path = root / entry.name
                try:
                    if _linked(path) or not entry.is_file(follow_symlinks=False) or path.resolve().parent != root:
                        partial = True
                        continue
                    before = path.lstat()
                    fd = os.open(path, os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0))
                    with os.fdopen(fd, "rb") as handle:
                        actual = os.fstat(handle.fileno())
                        if not stat.S_ISREG(actual.st_mode) or (actual.st_dev, actual.st_ino) != (before.st_dev, before.st_ino) or not _safe_directory(root) or _linked(path):
                            partial = True
                            continue
                        prefix = handle.read(max_prefix_bytes)
                        read_bytes += len(prefix)
                        after = os.fstat(handle.fileno())
                        if (after.st_size, after.st_mtime_ns) != (actual.st_size, actual.st_mtime_ns):
                            partial = True
                            continue
                        # An incomplete UTF-8 character can belong to history
                        # after the metadata boundary; discard only that tail.
                        text = codecs.getincrementaldecoder("utf-8")().decode(prefix, final=False)
                        meta = _metadata(text.encode("utf-8"))
                    if meta is None:
                        partial = True
                        continue
                    session_id = meta.get("session_id")
                    stream_id = meta.get("active_stream_id")
                    if not isinstance(session_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", session_id) or path.name != f"{session_id}.json":
                        partial = True
                        continue
                    if meta.get("space_scope") != scope or meta.get("profile") != actor_profile_name:
                        continue
                    if not isinstance(stream_id, str) or stream_id not in streams or session_id in seen:
                        continue
                    title = meta.get("title")
                    model, provider = meta.get("model"), meta.get("model_provider")
                    if not isinstance(title, str) or len(title) > 500 or any(v is not None and (not isinstance(v, str) or len(v) > 500) for v in (model, provider)):
                        partial = True
                        continue
                    rows.append(NativeChatActivity(session_id, title, model, provider, stream_id, observed_at))
                    seen.add(session_id)
                except (OSError, ValueError, UnicodeError, RecursionError):
                    partial = True
    except OSError:
        return NativeChatSnapshot((), observed_at, "unavailable", inspected, read_bytes)
    return NativeChatSnapshot(tuple(sorted(rows, key=lambda r: r.session_id)), observed_at,
                              "partial" if partial else "live", inspected, read_bytes)
