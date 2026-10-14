"""Process-local, scope-bound socket pools; SDK/admission clients stay per-turn.

No credentials, headers, cookies or request bodies are retained in pool entries.
Keys are salted in-memory HMACs; nothing here is persisted or logged.
"""
from __future__ import annotations

import atexit
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import threading
import time
from urllib.parse import urlsplit
from urllib.request import getproxies, proxy_bypass

import httpx

_IDLE_TTL = 120.0
_MAX_POOLS = 32
_LOCK = threading.RLock()
_SALT = secrets.token_bytes(32)
_POOLS = {}
_STOP = threading.Event()
_JANITOR = None


def _digest(value):
    return hmac.new(_SALT, json.dumps(value, sort_keys=True, default=str).encode(), hashlib.sha256).digest()


class _Entry:
    def __init__(self, identity):
        self.identity = identity
        self.transport = httpx.HTTPTransport(retries=0, limits=httpx.Limits(
            max_connections=16, max_keepalive_connections=8, keepalive_expiry=60))
        self.leases = 0
        self.touched = time.monotonic()
        self.retired = False


def _evict_locked(now):
    for key, entry in tuple(_POOLS.items()):
        if entry.leases == 0 and (entry.retired or now - entry.touched >= _IDLE_TTL):
            _POOLS.pop(key, None)
            entry.transport.close()


def _janitor():
    while not _STOP.wait(30):
        with _LOCK:
            _evict_locked(time.monotonic())


class _LeaseBody(httpx.SyncByteStream):
    def __init__(self, stream, owner):
        self.stream, self.owner = stream, owner
        self.closed = False

    def __iter__(self):
        try:
            yield from self.stream
        finally:
            self.close()

    def close(self):
        with self.owner.lock:
            if self.closed:
                return
            self.closed = True
            self.owner.streams.discard(self)
        self.stream.close()


class _LeaseTransport(httpx.BaseTransport):
    def __init__(self, entry):
        self.entry = entry
        self.lock = threading.RLock()
        self.closed = False
        self.streams = set()
        self.pending = 0
        self.released = False

    def handle_request(self, request):
        with self.lock:
            if self.closed or self.entry.retired:
                raise httpx.TransportError('Provider transport lease is no longer current.')
            self.pending += 1
        try:
            response = self.entry.transport.handle_request(request)
            body = _LeaseBody(response.stream, self)
            with self.lock:
                if self.closed:
                    body.close()
                    raise httpx.TransportError('Provider request was cancelled.')
                self.streams.add(body)
            response.stream = body
            return response
        finally:
            with self.lock:
                self.pending -= 1
                self._release_if_closed()

    def _release_if_closed(self):
        if self.closed and not self.pending and not self.released:
            self.released = True
            with _LOCK:
                self.entry.leases -= 1
                self.entry.touched = time.monotonic()
                _evict_locked(self.entry.touched)

    def close(self):
        with self.lock:
            if self.closed:
                return
            self.closed = True
            streams = tuple(self.streams)
        for stream in streams:
            try:
                stream.close()
            except Exception:
                pass
        with self.lock:
            self._release_if_closed()


def _lease(context, provider, api_mode, kwargs):
    global _JANITOR
    endpoint = str(kwargs.get('base_url') or ('https://api.anthropic.com' if api_mode == 'anthropic_messages' else 'https://api.openai.com/v1'))
    parsed = urlsplit(endpoint)
    if parsed.scheme not in {'http', 'https'} or not parsed.hostname:
        return None
    # Preserve the existing SDK proxy behavior rather than accidentally bypass
    # a mandatory proxy with an explicitly injected shared transport.
    proxies = getproxies()
    if not proxy_bypass(parsed.hostname) and (proxies.get(parsed.scheme) or proxies.get('all')):
        return None
    scope = context.scope.model_dump(mode='json', by_alias=True)
    identity = _digest([str(Path(context.profile_home).resolve()), str(Path(context.space_root).resolve()),
                        scope, str(provider), str(api_mode), endpoint,
                        kwargs.get('default_headers'), kwargs.get('organization'), kwargs.get('project'),
                        os.getenv('SSL_CERT_FILE', ''), os.getenv('SSL_CERT_DIR', '')])
    key = _digest([identity.hex(), kwargs.get('api_key'), kwargs.get('auth_token')])
    with _LOCK:
        if _STOP.is_set():
            return None
        now = time.monotonic()
        # Retire sockets from the previous credential/header identity. Active
        # responses may drain, but no new request can reuse that old lease.
        for previous_key, previous in tuple(_POOLS.items()):
            if previous.identity == identity and previous_key != key:
                previous.retired = True
        _evict_locked(now)
        entry = _POOLS.get(key)
        if entry is None:
            if len(_POOLS) >= _MAX_POOLS:
                idle = [(value.touched, existing) for existing, value in _POOLS.items() if value.leases == 0]
                if not idle:
                    return None  # Live requests must not be evicted.
                _, oldest = min(idle)
                _POOLS.pop(oldest).transport.close()
            entry = _Entry(identity)
            _POOLS[key] = entry
        if entry.retired:
            return None
        entry.leases += 1
        entry.touched = now
        if _JANITOR is None:
            _JANITOR = threading.Thread(target=_janitor, name='provider-transport-idle', daemon=True)
            _JANITOR.start()
        return _LeaseTransport(entry)


def pooled_sdk_kwargs(kwargs, *, context, provider, api_mode):
    """Return fresh kwargs; never mutate a saved SDK configuration dictionary."""
    result = dict(kwargs)
    if context is None or result.get('http_client') is not None:
        return result
    lease = _lease(context, provider, api_mode, result)
    if lease is not None:
        try:
            # Each SDK wrapper gets private header/cookie/auth state. Only the
            # low-level connection transport is shared with other leases.
            result['http_client'] = httpx.Client(transport=lease,
                timeout=result.get('timeout', 60), follow_redirects=True)
        except BaseException:
            lease.close()
            raise
    return result


def bound_sdk_kwargs(kwargs, *, provider, api_mode):
    """Use only a purpose-owned native bridge; no ambient/global profile fallback."""
    from runtime.independent.native_chat_auto import get_bound_native_auto_bridge
    from runtime.independent.native_sdk_broker import get_bound_native_sdk_bridge
    bridge = get_bound_native_auto_bridge() or get_bound_native_sdk_bridge()
    decision = getattr(bridge, 'decision', None)
    selected = getattr(decision, 'selected_model', None)
    provider = getattr(selected, 'provider', None) or provider
    return pooled_sdk_kwargs(kwargs, context=bridge.context if bridge else None,
                             provider=provider, api_mode=api_mode)


def create_pooled_sdk(factory, kwargs, *, provider, api_mode, context=None):
    options = (pooled_sdk_kwargs(kwargs, context=context, provider=provider, api_mode=api_mode)
               if context is not None else bound_sdk_kwargs(kwargs, provider=provider, api_mode=api_mode))
    try:
        return factory(**options)
    except BaseException:
        owned = options.get('http_client')
        if owned is not None and owned is not kwargs.get('http_client'):
            owned.close()
        raise


def close_provider_client_pools():
    """Worker/process shutdown closes every socket, including active requests."""
    _STOP.set()
    with _LOCK:
        entries = tuple(_POOLS.values())
        _POOLS.clear()
    for entry in entries:
        try:
            entry.transport.close()
        except Exception:
            pass


atexit.register(close_provider_client_pools)
