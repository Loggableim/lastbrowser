"""Private bindings for managed Store SDK clients, never renderer authority."""
from contextvars import ContextVar
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from runtime.independent.native_provider_capture import NativeLocalRuntimeCapture


@dataclass(frozen=True)
class _LiveRuntime:
    context: object
    capture: NativeLocalRuntimeCapture
    endpoint: str
    credential: str = field(repr=False)


_live_runtime = ContextVar('lastbrowser_native_store_runtime', default=None)


def capture_from_capability(capability):
    if not isinstance(capability, dict) or capability.get('state') != 'ready':
        raise PermissionError('local_runtime_device_proof_required')
    return NativeLocalRuntimeCapture.model_validate({
        key: capability[key] for key in ('artifactId', 'artifactRevision', 'bundleDigest',
            'backend', 'runtimeBuild', 'runtimeDigest', 'evidenceRef', 'toolCallingQualified',
            'contextTokens', 'maxOutputTokens', 'parallelRequests')})


def _private_bridge(context):
    from runtime.independent.native_sdk_broker import get_bound_native_sdk_bridge
    bridge = get_bound_native_sdk_bridge()
    if bridge is None or bridge.context != context:
        raise PermissionError('local_runtime_private_bridge_required')
    bridge._require_private()
    return bridge


def bind_store_runtime(context, endpoint, credential):
    """Called only by the bound worker builder on a private Parent RPC result.

    The returned ContextVar token must be reset when that builder closes. No
    private endpoint or key is put in the saved provider capture or catalog.
    """
    _private_bridge(context)
    capture = getattr(context.provider_capture, 'local_runtime', None)
    if not isinstance(capture, NativeLocalRuntimeCapture):
        raise PermissionError('local_runtime_capture_required')
    try:
        parsed = urlsplit(endpoint)
        port = parsed.port
    except (TypeError, ValueError):
        raise PermissionError('local_runtime_endpoint_invalid') from None
    if (parsed.scheme != 'http' or parsed.hostname != '127.0.0.1'
            or not isinstance(port, int) or not 1 <= port <= 65535
            or parsed.path != '/v1' or parsed.username or parsed.password
            or parsed.query or parsed.fragment):
        raise PermissionError('local_runtime_endpoint_invalid')
    if (not isinstance(credential, str) or not 16 <= len(credential) <= 256
            or any(ord(character) < 33 or ord(character) > 126 for character in credential)):
        raise PermissionError('local_runtime_credential_invalid')
    return _live_runtime.set(_LiveRuntime(context, capture, endpoint, credential))


def reset_store_runtime(token):
    _live_runtime.reset(token)


def get_bound_store_runtime(*, model, provider, base_url, api_key):
    """Return secret-free context limits only for the exact live SDK binding."""
    if provider != 'local-store':
        return None
    binding = _live_runtime.get()
    if binding is None:
        raise PermissionError('local_runtime_binding_required')
    _private_bridge(binding.context)
    if (binding.context.provider_capture.local_runtime != binding.capture
            or model != binding.capture.artifact_id
            or base_url != binding.endpoint or api_key != binding.credential):
        raise PermissionError('local_runtime_binding_changed')
    return binding.capture


def private_store_connection(context):
    """SDK builder access only; this result must never cross the public API."""
    binding = _live_runtime.get()
    if binding is None or binding.context != context:
        raise PermissionError('local_runtime_binding_required')
    get_bound_store_runtime(model=binding.capture.artifact_id, provider='local-store',
                            base_url=binding.endpoint, api_key=binding.credential)
    return binding.endpoint, binding.credential


def scoped_store(scope, actor):
    """Resolve through the authenticated profile hub, never renderer paths."""
    from pathlib import Path
    from web.api import independent as api
    from .model_store import get_store
    if api._local_ai_cache_root is None:
        return None
    _, resolver = api.hub().by_scope(scope, actor)
    resolver.resolve(scope, authenticated_profile_name=actor)
    return get_store(api._local_ai_cache_root, scope, Path(__file__).resolve().parents[4])


def store_catalog_group(store):
    """Fresh installed text inventory; discovery does not load any model."""
    rows = []
    with store.lock:
        for identity in sorted(store.state['installed']):
            entry = store.entries.get(identity)
            artifact = entry.get('artifactManifest') if entry else None
            if not artifact or artifact.get('category') != 'text':
                continue
            capability = store.provider_capability(identity)
            ready = capability.get('state') == 'ready'
            # Tool qualification is distinct from merely returning a text
            # answer. The existing native context gate remains authoritative.
            rows.append({'id': identity, 'label': entry.get('name') or identity,
                         'provider_id': 'local-store', 'modelSource': 'local_catalog',
                         'contextLength': capability.get('contextTokens') if ready else None,
                         'contextLengthSource': 'local_catalog' if ready else 'unknown',
                         'supportsIndependent': ready and capability.get('toolCallingQualified') is True,
                         'localRuntime': capability,
                         'deploymentKind': 'local'})
    return {'provider_id': 'local-store', 'provider': 'LastBrowser Local AI',
            'configured': bool(rows), 'deploymentKind': 'local', 'models': rows, 'extra_models': []}


def with_store_catalog(catalog, scope, actor):
    """Overlay after the remote catalog cache; local state is never cached there."""
    from copy import deepcopy
    store = scoped_store(scope, actor)
    if store is None:
        return catalog
    group = store_catalog_group(store)
    result = deepcopy(catalog)
    result['groups'] = [item for item in result.get('groups', []) if item.get('provider_id') != 'local-store']
    result['groups'].append(group)
    result['providers'] = [item for item in result.get('providers', []) if item.get('id') != 'local-store']
    result['providers'].append({'id': 'local-store', 'display_name': 'LastBrowser Local AI',
                                'provider_available': True, 'configuration_present': group['configured'],
                                'deploymentKind': 'local'})
    return result


def has_installed_store_text(scope, actor):
    store = scoped_store(scope, actor)
    if store is None:
        return False
    with store.lock:
        return any((store.entries.get(identity, {}).get('artifactManifest') or {}).get('category') == 'text'
                   for identity in store.state['installed'])
