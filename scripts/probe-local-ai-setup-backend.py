"""Actual private API/installer probe with a pinned tiny synthetic manifest.

Only trusted catalog and download transport constructor dependencies differ.
Requests, consent, SQLite leases, background IO and FD cleanup remain native.
"""
from __future__ import annotations
import hashlib
import http.client
import json
import os
import socket
import sys
import threading
import time
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'services' / 'sidekick'))
TEMP = Path(sys.argv[1]).resolve(strict=True)
HOME = TEMP / 'backend-home'
HOME.mkdir(exist_ok=True)
BOOT = json.loads((TEMP / 'bootstrap.json').read_text('utf-8'))
os.environ.update(SIDEKICK_HOME=str(HOME), SIDEKICK_BASE_HOME=str(HOME), LASTBROWSER_HOME=str(HOME),
                  LASTBROWSER_BRIDGE_TOKEN=BOOT['privateBridgeNonce'], PYTHONDONTWRITEBYTECODE='1')
PHASES = TEMP / 'backend-phases.jsonl'
LOCK = threading.Lock()
RELEASE = threading.Event()
IO = {'active': 0, 'reads': 0, 'offsets': [], 'externalAttempts': 0, 'closed': 0}
DATA = {'tiny.gguf': bytes(range(256)) * 2800, 'LICENSE': b'Controlled synthetic license for the local installer test.'}

def phase(name, **fields):
    with LOCK:
        with PHASES.open('a', encoding='utf-8') as output:
            output.write(json.dumps({'phase': name, **fields}) + '\n')

class DownloadFixture(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/stats':
            raw = json.dumps(IO).encode(); self.send_response(200); self.send_header('Content-Length', str(len(raw)))
            self.end_headers(); self.wfile.write(raw); return
        if parsed.path == '/release':
            RELEASE.set(); self.send_response(200); self.send_header('Content-Length', '0'); self.end_headers(); return
        name = parsed.path.removeprefix('/file/')
        if name not in DATA:
            self.send_response(404); self.end_headers(); return
        offset = 0
        value = self.headers.get('Range')
        if value: offset = int(value.removeprefix('bytes=').removesuffix('-'))
        content = DATA[name][offset:]
        self.send_response(206 if value else 200)
        self.send_header('Content-Length', str(len(content)))
        if value: self.send_header('Content-Range', f'bytes {offset}-{len(DATA[name]) - 1}/{len(DATA[name])}')
        self.end_headers()
        try:
            if name == 'tiny.gguf' and not RELEASE.is_set():
                self.wfile.write(content[:262144]); self.wfile.flush()
                if not RELEASE.wait(30): return
                content = content[262144:]
            self.wfile.write(content); self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError): pass

SERVER = ThreadingHTTPServer(('127.0.0.1', 0), DownloadFixture)
SERVER.daemon_threads = True
threading.Thread(target=SERVER.serve_forever, daemon=True).start()
ORIGIN = 'http://127.0.0.1:' + str(SERVER.server_port)
for name, profile_home in (('A', HOME), ('B', HOME / 'profiles' / 'other')):
    workspace = profile_home / 'workspace'; workspace.mkdir(parents=True, exist_ok=True)
    (profile_home / 'config.yaml').write_text('workspace: ' + json.dumps(str(workspace)) + '\nmodel:\n  provider: custom:controlled\n  default: controlled\n', 'utf-8')
    state = profile_home / ('state/webui' if name == 'A' else 'webui_state'); state.mkdir(parents=True, exist_ok=True)
    (state / 'workspaces.json').write_text(json.dumps([{'path': str(workspace), 'name': 'Controlled ' + name}]), 'utf-8')

def audit(event, args):
    if event == 'socket.getaddrinfo' and args[0] not in {'127.0.0.1', 'localhost', '::1', None}:
        IO['externalAttempts'] += 1; phase('external_attempt', kind='dns'); raise PermissionError('controlled_network_denied')
    if event == 'socket.connect' and isinstance(args[1], tuple) and args[1][0] not in {'127.0.0.1', 'localhost', '::1'}:
        IO['externalAttempts'] += 1; phase('external_attempt', kind='connect'); raise PermissionError('controlled_network_denied')
sys.addaudithook(audit)

from fastapi import FastAPI
from web.api import independent, profiles
from web.api.helpers import get_profile_cookie
from web.api.local_ai_setup import LocalAiInstallJobs, register_local_ai_setup_runner
from runtime.local_ai.setup import LocalAiSetup
from runtime.local_ai.installer import LocalAiInstaller
from runtime.local_ai.contracts import ArtifactFile, ModelArtifact, CatalogSnapshot
import uvicorn

def catalog():
    revision, repo = 'a' * 40, 'Controlled/Tiny-GGUF'
    files = tuple(ArtifactFile(relative_path=name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(),
        source_url=f'https://huggingface.co/{repo}/resolve/{revision}/{name}', kind='license' if name == 'LICENSE' else 'weights') for name, data in DATA.items())
    model = ModelArtifact(artifact_id=repo + ':q4', provider='controlled', model_id=repo, revision=revision,
        format='gguf', quantization='q4', architecture=None, roles=('extract',), files=files, manifest_complete=True,
        license_ref=files[1].source_url, license_digest=files[1].sha256)
    return CatalogSnapshot(revision='controlled-local-ai-probe-v1', observed_at='2026-10-04T01:00:00Z', artifacts=(model,))

class LocalFixtureTransport:
    @contextmanager
    def open(self, url, offset):
        file = next((file for model in catalog().artifacts for file in model.files if file.source_url == url), None)
        if file is None: raise ValueError('controlled_manifest_url_required')
        connection = http.client.HTTPConnection('127.0.0.1', SERVER.server_port, timeout=20)
        IO['offsets'].append(offset)
        connection.request('GET', '/file/' + file.relative_path, headers={'Range': f'bytes={offset}-'} if offset else {})
        response = connection.getresponse()
        original_read = response.read
        def read(size):
            IO['reads'] += 1
            return original_read(size)
        response.read = read
        IO['active'] += 1; phase('real_download_io_open', offset=offset)
        try: yield response
        finally:
            response.close(); connection.close(); IO['active'] -= 1; IO['closed'] += 1
            phase('real_download_io_closed', active=IO['active'])

APP = FastAPI()
APP.include_router(independent.router)
@APP.middleware('http')
async def profile_context(request, call_next):
    token = profiles.set_request_profile(get_profile_cookie(request))
    try:
        response = await call_next(request)
        if request.url.path.startswith('/api/independent/'):
            phase('actual_private_api', operation=request.url.path.rsplit('/', 1)[-1], status=response.status_code)
        return response
    finally: profiles.clear_request_profile(token)

@APP.get('/health')
def health(): return {'ok': True}

@APP.on_event('startup')
def startup():
    independent.startup()
    profile_hub = independent.hub()
    setup = LocalAiSetup(profile_hub, catalog_provider=catalog)
    runner = LocalAiInstallJobs(setup, None, installer_factory=lambda service, resolver: LocalAiInstaller(service, resolver, transport=LocalFixtureTransport()))
    register_local_ai_setup_runner(profile_hub, runner)

@APP.on_event('shutdown')
def shutdown():
    RELEASE.set()
    assert independent.shutdown() is True
    assert IO['active'] == 0
    SERVER.shutdown(); SERVER.server_close()
    phase('actual_backend_shutdown', activeIO=IO['active'], externalAttempts=IO['externalAttempts'])

listener = socket.socket(); listener.bind(('127.0.0.1', 0)); listener.listen(128)
server = uvicorn.Server(uvicorn.Config(APP, log_level='error', access_log=False))
def control():
    while sys.stdin.readline(): server.should_exit = True; return
threading.Thread(target=control, daemon=True).start()
(TEMP / 'ready.json').write_text(json.dumps({'apiUrl': 'http://127.0.0.1:' + str(listener.getsockname()[1]), 'fixtureOrigin': ORIGIN,
    'workspaceA': str(HOME / 'workspace'), 'workspaceB': str(HOME / 'profiles' / 'other' / 'workspace'),
    'artifactId': catalog().artifacts[0].artifact_id, 'totalBytes': sum(map(len, DATA.values()))}), 'utf-8')
phase('backend_ready', python=sys.version.split()[0], manifestBytes=sum(map(len, DATA.values())))
server.run(sockets=[listener])
