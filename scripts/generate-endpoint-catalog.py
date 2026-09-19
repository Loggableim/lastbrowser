"""Generate the Lastbrowser endpoint catalog from the live Sidekick source.

The live WebUI serves endpoints from two places:
  1. Native FastAPI routes in cli/web_server.py  -> published via /openapi.json
  2. Legacy bridge routes in web/api/*.py        -> matched by string comparison

Neither source alone is complete, so this script merges both:
  - /openapi.json gives authoritative method + path for native routes
  - a static scan of web/api/*.py finds the legacy routes

Usage:
  python scripts/generate-endpoint-catalog.py [--url http://127.0.0.1:8795]
                                              [--source services/sidekick]
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / 'apps' / 'desktop' / 'src' / 'renderer' / 'webui-endpoint-catalog.ts'

AREA_TO_PANEL = {
    'agents': 'agents', 'appstore': 'appstore', 'browser': 'browser',
    'chat': 'chat', 'session': 'chat', 'sessions': 'chat', 'clarify': 'chat',
    'approval': 'chat', 'btw': 'chat',
    'crons': 'tasks', 'cron': 'tasks', 'kanban': 'kanban', 'dispatch': 'tasks',
    'claude-jobs': 'tasks',
    'skills': 'skills', 'memory': 'memory', 'supermemory': 'memory',
    'workspaces': 'workspaces', 'workspace': 'workspaces', 'space': 'workspaces',
    'projects': 'workspaces', 'file': 'workspaces', 'upload': 'workspaces',
    'profiles': 'profiles', 'profile': 'profiles',
    'todos': 'todos', 'insights': 'insights', 'analytics': 'insights',
    'logs': 'logs', 'errors': 'logs', 'events': 'logs', 'csp-report': 'logs',
    'gmail': 'gmail', 'mail': 'gmail', 'discord': 'discord',
    'settings': 'settings', 'config': 'settings', 'models': 'settings',
    'providers': 'settings', 'auth': 'settings', 'updates': 'settings',
    'system': 'settings', 'mcp': 'settings', 'cast': 'settings',
    'dashboard': 'settings', 'oauth': 'settings', 'background': 'settings',
    'rollback': 'settings', 'evey': 'settings', 'codex': 'settings',
    'cockpit': 'settings', 'game-mode': 'settings', 'admin': 'settings',
    'terminal': 'terminal', 'commands': 'terminal', 'execute_code': 'terminal',
    'swarm': 'agents', 'nova': 'agents', 'subagents': 'agents',
}

DANGEROUS_HINTS = (
    'delete', 'remove', 'purge', 'ban', 'kick', 'shutdown', 'restart',
    'rollback', 'clear', 'cleanup', 'force', 'apply', 'install', 'uninstall',
)


def fetch_openapi(url: str) -> dict:
    try:
        with urllib.request.urlopen(f'{url.rstrip("/")}/openapi.json', timeout=20) as response:
            return json.load(response)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f'warning: could not fetch OpenAPI spec ({exc}); using source scan only', file=sys.stderr)
        return {}


def scan_source(source: Path) -> set[tuple[str, str]]:
    """Find legacy bridge routes by scanning the route modules."""
    found: set[tuple[str, str]] = set()
    api_dir = source / 'web' / 'api'
    if not api_dir.exists():
        return found

    # `if path == '/api/x':` / `if parsed.path == "/api/x":`
    exact = re.compile(r'''path\s*==\s*["'](/api/[a-z0-9/_-]+)["']''')
    # `path.startswith('/api/x/')`
    prefix = re.compile(r'''path\.startswith\(\s*["'](/api/[a-z0-9/_-]+)["']''')
    # FastAPI decorators
    decorator = re.compile(r'''@\w+\.(get|post|put|delete|patch)\(\s*["'](/api/[a-z0-9/_-]+)''')

    for py in api_dir.rglob('*.py'):
        if '__pycache__' in str(py):
            continue
        try:
            text = py.read_text(encoding='utf-8', errors='replace')
        except OSError:
            continue
        for match in exact.finditer(text):
            found.add(('*', match.group(1)))
        for match in prefix.finditer(text):
            found.add(('*', match.group(1).rstrip('/')))
        for match in decorator.finditer(text):
            found.add((match.group(1).upper(), match.group(2)))
    return found


def panel_for(path: str) -> str:
    parts = [p for p in path.split('/') if p]
    area = parts[1] if len(parts) > 1 else 'settings'
    return AREA_TO_PANEL.get(area, 'settings')


def label_for(method: str, path: str) -> str:
    clean = path.replace('/api/', '').strip('/')
    pretty = clean.replace('/', ' · ').replace('-', ' ').replace('_', ' ')
    prefix = '' if method == '*' else f'{method} '
    return f'{prefix}{pretty}'


def is_dangerous(method: str, path: str) -> bool:
    if method == 'DELETE':
        return True
    lowered = path.lower()
    return any(hint in lowered for hint in DANGEROUS_HINTS)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8795')
    parser.add_argument('--source', default=str(REPO / 'services' / 'sidekick'))
    args = parser.parse_args()

    entries: dict[tuple[str, str], dict] = {}

    # 1. Native FastAPI routes from the OpenAPI spec.
    spec = fetch_openapi(args.url)
    for path, operations in (spec.get('paths') or {}).items():
        if not path.startswith('/api/'):
            continue
        for method in operations:
            upper = method.upper()
            if upper not in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE'):
                continue
            entries[(upper, path)] = {'method': upper, 'path': path}

    # 2. Legacy bridge routes from the source scan.
    for method, path in scan_source(Path(args.source)):
        key = (method, path)
        if key not in entries:
            entries[key] = {'method': method, 'path': path}

    if not entries:
        print('No endpoints found.', file=sys.stderr)
        return 1

    rows = []
    for entry in entries.values():
        method = entry['method']
        path = entry['path']
        rows.append({
            'method': method,
            'path': path,
            'panel': panel_for(path),
            'label': label_for(method, path),
            'dangerous': is_dangerous(method, path),
        })
    rows.sort(key=lambda r: (r['panel'], r['path'], r['method']))

    lines = [
        '/**',
        ' * GENERATED FILE — do not edit by hand.',
        ' *',
        ' * Source: the live Sidekick WebUI (OpenAPI spec + legacy route scan).',
        ' * Regenerate with: python scripts/generate-endpoint-catalog.py',
        ' *',
        f' * Endpoints: {len(rows)}',
        ' */',
        "import type { LastbrowserPanelId } from './shell-state.js';",
        '',
        'export type CatalogEndpoint = {',
        "  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | '*';",
        '  path: string;',
        '  panel: LastbrowserPanelId;',
        '  label: string;',
        '  dangerous: boolean;',
        '};',
        '',
        'export const webuiEndpointCatalog: CatalogEndpoint[] = [',
    ]
    for row in rows:
        lines.append(
            '  { method: %s, path: %s, panel: %s, label: %s, dangerous: %s },'
            % (
                json.dumps(row['method']),
                json.dumps(row['path']),
                json.dumps(row['panel']),
                json.dumps(row['label']),
                'true' if row['dangerous'] else 'false',
            )
        )
    lines.append('];')
    lines.append('')
    lines.append('/** Endpoints for one panel, for the endpoint explorer. */')
    lines.append('export function catalogEndpointsForPanel(panel: LastbrowserPanelId): CatalogEndpoint[] {')
    lines.append('  return webuiEndpointCatalog.filter((entry) => entry.panel === panel);')
    lines.append('}')
    lines.append('')

    OUT.write_text('\n'.join(lines), encoding='utf-8')
    print(f'wrote {OUT} ({len(rows)} endpoints)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
