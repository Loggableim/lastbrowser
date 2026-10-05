"""Server-captured immutable bindings for ordinary delegated chat children."""
from dataclasses import dataclass
from pathlib import Path
import re
from .contracts import Scope

def _id(value: str) -> None:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", value):
        raise ValueError("invalid child/session identity")

def _path(value: Path) -> None:
    if not isinstance(value, Path) or not value.is_absolute():
        raise ValueError("captured paths must be absolute")
    if any(p.is_symlink() for p in (value, *value.parents)):
        raise ValueError("symlinked captured path")

@dataclass(frozen=True)
class ChildParentContext:
    scope: Scope
    profile_home: Path
    profile_name: str
    sessions_dir: Path
    parent_session_id: str
    parent_turn_id: str
    parent_subagent_id: str | None = None
    process_generation: str | None = None

    def __post_init__(self):
        if not isinstance(self.scope, Scope):
            raise ValueError("actual Scope required")
        _path(self.profile_home)
        _path(self.sessions_dir)
        if not self.sessions_dir.resolve().is_relative_to(self.profile_home.resolve()):
            raise ValueError("sessions outside captured profile")
        _id(self.profile_name)
        _id(self.parent_session_id)
        _id(self.parent_turn_id)
        if self.parent_subagent_id is not None:
            _id(self.parent_subagent_id)
        if self.process_generation is not None:
            _id(self.process_generation)

@dataclass(frozen=True)
class ChildRunContext:
    parent: ChildParentContext
    subagent_id: str
    child_session_id: str
    depth: int
    model: str
    model_provider: str
    session_db_path: Path | None = None
    session_parent_id: str | None = None

    def __post_init__(self):
        if not isinstance(self.parent, ChildParentContext):
            raise ValueError("captured parent required")
        _id(self.subagent_id)
        _id(self.child_session_id)
        if self.session_parent_id is not None:
            _id(self.session_parent_id)
        if self.session_db_path is not None:
            _path(self.session_db_path)
            if not self.session_db_path.resolve().is_relative_to(self.parent.profile_home.resolve()):
                raise ValueError("session DB outside captured profile")
        if type(self.depth) is not int or not 1 <= self.depth <= 32:
            raise ValueError("invalid depth")
        for value in (self.model, self.model_provider):
            if not isinstance(value, str) or len(value) > 200 or any(ord(c) < 32 for c in value):
                raise ValueError("invalid model metadata")
