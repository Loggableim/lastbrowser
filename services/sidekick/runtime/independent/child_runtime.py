"""Explicit bindings for delegate threads; no profile/environment switching."""
from contextvars import ContextVar
from functools import wraps
from inspect import signature
from pathlib import Path
from copy import deepcopy
import yaml
from .child_contracts import ChildParentContext, ChildRunContext

delegation_config = ContextVar('captured_child_delegation_config', default=None)
runtime_config = ContextVar('captured_child_runtime_config', default=None)

def captured_parent(agent):
    value = getattr(agent, '_child_parent_context', None)
    return value if isinstance(value, ChildParentContext) else None

def captured_child(agent):
    value = getattr(agent, '_child_run_context', None)
    return value if isinstance(value, ChildRunContext) else None

def same_parent_turn(left, right):
    if not isinstance(left, ChildParentContext) or not isinstance(right, ChildParentContext):
        return False
    return all(getattr(left, key) == getattr(right, key) for key in
               ('scope','profile_home','profile_name','sessions_dir','parent_session_id','parent_turn_id'))

def read_runtime_config(parent):
    parent.__post_init__()
    path = parent.profile_home / 'config.yaml'
    if path.is_symlink():
        raise ValueError('Profile config is symlinked')
    raw = yaml.safe_load(path.read_text(encoding='utf-8')) if path.is_file() else {}
    if raw is None: raw = {}
    if not isinstance(raw, dict) or not isinstance(raw.get('delegation', {}), dict):
        raise ValueError('Invalid captured delegation config')
    return deepcopy(raw)

def read_config(parent):
    return read_runtime_config(parent).get('delegation', {})

def with_captured_config(fn):
    sig = signature(fn)
    @wraps(fn)
    def bound(*args, **kwargs):
        values = sig.bind_partial(*args, **kwargs).arguments
        parent = values.get('parent_agent')
        child = values.get('child')
        context = captured_parent(parent)
        if context is None:
            return fn(*args, **kwargs)
        snapshot = getattr(child, '_delegate_config_snapshot', None) if child is not None else None
        if snapshot is None and captured_child(parent) is not None:
            snapshot = getattr(parent, '_delegate_config_snapshot', None)
        if snapshot is None:
            snapshot = delegation_config.get()
        full = vars(child).get('_delegate_runtime_config_snapshot') if child is not None else None
        if full is None and captured_child(parent) is not None:
            full = vars(parent).get('_delegate_runtime_config_snapshot')
        if full is None: full = runtime_config.get()
        if full is None: full = read_runtime_config(context)
        full_token = runtime_config.set(deepcopy(full))
        token = delegation_config.set(deepcopy(snapshot) if isinstance(snapshot, dict) else deepcopy(full.get('delegation', {})))
        try: return fn(*args, **kwargs)
        finally:
            delegation_config.reset(token)
            runtime_config.reset(full_token)
    return bound

def capture_native_parent(session, session_id, turn_id):
    """Resolve actual server-saved ownership, never latest UI selection."""
    from .contracts import Scope
    from web.api.independent import hub
    scope = Scope.model_validate(session.space_scope)
    _, resolver = hub().by_scope(scope, session.profile)
    resolved = resolver.resolve(scope, authenticated_profile_name=session.profile)
    import os
    return ChildParentContext(scope, resolved.profile_home, resolved.profile.name,
                              resolved.space.sessions_dir, session_id, turn_id,
                              process_generation=os.getenv('LASTBROWSER_NATIVE_GENERATION'))

def validate_session_db(parent, agent):
    db = getattr(agent, '_session_db', None)
    path = getattr(db, 'db_path', None)
    if not isinstance(path, (str, Path)):
        raise ValueError('Bound delegation requires its actual SessionDB')
    path = Path(path)
    if not path.is_absolute() or any(p.is_symlink() for p in (path, *path.parents)) or not path.resolve().is_relative_to(parent.profile_home.resolve()):
        raise ValueError('Parent SessionDB does not belong to captured profile')
    return db, path
