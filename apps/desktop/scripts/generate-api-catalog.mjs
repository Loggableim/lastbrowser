#!/usr/bin/env node
/**
 * Automatically generates webui-endpoint-catalog.ts from Sidekick's web_server.py route definitions.
 *
 * Usage:
 *   node scripts/generate-api-catalog.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, '../../..');
const WEB_SERVER_PY = resolve(REPO_ROOT, 'services/sidekick/cli/web_server.py');
const CATALOG_TS = resolve(__dirname, '../src/renderer/webui-endpoint-catalog.ts');

if (!existsSync(WEB_SERVER_PY)) {
  console.error(`Error: Could not find web_server.py at ${WEB_SERVER_PY}`);
  process.exit(1);
}

const content = readFileSync(WEB_SERVER_PY, 'utf8');

// Regex patterns to capture routes from FastAPI decorators
// Examples:
// @app.get("/api/models")
// @app.post('/api/session/create')
// @app.api_route("/api/path", methods=["GET", "POST"])
const ROUTE_REGEX = /@(?:app|router)\.(get|post|put|delete|patch|api_route)\s*\(\s*(['"])([^'"]+)\2(?:[^\)]*methods\s*=\s*\[([^\]]+)\])?/g;

/**
 * Maps an API path to a LastbrowserPanelId
 */
function assignPanel(path) {
  const p = path.toLowerCase();
  if (p.includes('/agent') || p.includes('/nova') || p.includes('/swarm') || p.includes('/subagent') || p.includes('/evey')) return 'agents';
  if (p.includes('/appstore') || p.includes('/app-store')) return 'appstore';
  if (p.includes('/skill')) return 'skills';
  if (p.includes('/task') || p.includes('/cron')) return 'tasks';
  if (p.includes('/kanban')) return 'kanban';
  if (p.includes('/memory')) return 'memory';
  if (p.includes('/profile')) return 'profiles';
  if (p.includes('/todo')) return 'todos';
  if (p.includes('/insight') || p.includes('/cost') || p.includes('/metric')) return 'insights';
  if (p.includes('/log')) return 'logs';
  if (p.includes('/gmail')) return 'gmail';
  if (p.includes('/discord')) return 'discord';
  if (p.includes('/terminal') || p.includes('/pty')) return 'terminal';
  if (p.includes('/browser') || p.includes('/search')) return 'browser';
  if (p.includes('/workspace') || p.includes('/space') || p.includes('/file') || p.includes('/fs') || p.includes('/git') || p.includes('/rollback') || p.includes('/checkpoint') || p.includes('/project')) return 'workspaces';
  if (p.includes('/session') || p.includes('/chat') || p.includes('/approval') || p.includes('/command')) return 'chat';
  return 'settings';
}

/**
 * Determines if an endpoint should be flagged as dangerous
 */
function isDangerous(method, path) {
  if (method === 'DELETE') return true;
  const p = path.toLowerCase();
  const dangerousKeywords = [
    '/delete', '/remove', '/purge', '/destroy', '/drop',
    '/install', '/shutdown', '/restart', '/ban', '/kick',
    '/restore', '/apply', '/reset', '/kill', '/rollback'
  ];
  return dangerousKeywords.some((kw) => p.includes(kw));
}

/**
 * Creates human-friendly label from path
 */
function formatLabel(method, path) {
  const clean = path.replace(/^\/api\//, '').replace(/^\//, '');
  const parts = clean.split('/').filter(Boolean);
  const base = parts.join(' · ').replace(/-/g, ' ');
  return method === '*' ? base : `${method} ${base}`;
}

const endpointsMap = new Map();

// Read existing catalog to preserve any manual additions or wildcard routes
if (existsSync(CATALOG_TS)) {
  const existingContent = readFileSync(CATALOG_TS, 'utf8');
  const existingMatch = existingContent.match(/webuiEndpointCatalog:\s*CatalogEndpoint\[\]\s*=\s*\[([\s\S]*?)\];/);
  if (existingMatch) {
    const itemRegex = /{\s*method:\s*"([^"]+)",\s*path:\s*"([^"]+)",\s*panel:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*dangerous:\s*(true|false)\s*}/g;
    let match;
    while ((match = itemRegex.exec(existingMatch[1])) !== null) {
      const [, method, path, panel, label, dangerous] = match;
      const key = `${method}:${path}`;
      endpointsMap.set(key, {
        method,
        path,
        panel,
        label,
        dangerous: dangerous === 'true'
      });
    }
  }
}

// Extract routes from Python code
let match;
while ((match = ROUTE_REGEX.exec(content)) !== null) {
  const [, decoratorType, , path, methodsList] = match;
  if (!path.startsWith('/api')) continue;

  let methods = [];
  if (decoratorType === 'api_route') {
    if (methodsList) {
      methods = methodsList.split(',').map((m) => m.trim().replace(/['"]/g, '').toUpperCase()).filter(Boolean);
    } else {
      methods = ['*'];
    }
  } else {
    methods = [decoratorType.toUpperCase()];
  }

  for (const method of methods) {
    const key = `${method}:${path}`;
    const panel = assignPanel(path);
    const dangerous = isDangerous(method, path);
    const label = formatLabel(method, path);

    endpointsMap.set(key, {
      method,
      path,
      panel,
      label,
      dangerous
    });
  }
}

// Sort endpoints deterministically: by panel first, then path, then method
const sortedEndpoints = Array.from(endpointsMap.values()).sort((a, b) => {
  if (a.panel !== b.panel) return a.panel.localeCompare(b.panel);
  if (a.path !== b.path) return a.path.localeCompare(b.path);
  return a.method.localeCompare(b.method);
});

console.log(`Discovered ${sortedEndpoints.length} unique API endpoints.`);

// Generate output file
const output = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: the live Sidekick WebUI (FastAPI routes scan).
 * Regenerate with: npm --workspace apps/desktop run catalog:generate
 *
 * Endpoints: ${sortedEndpoints.length}
 */
import type { LastbrowserPanelId } from './shell-state.js';

export type CatalogEndpoint = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | '*';
  path: string;
  panel: LastbrowserPanelId;
  label: string;
  dangerous: boolean;
};

export const webuiEndpointCatalog: CatalogEndpoint[] = [
${sortedEndpoints
  .map(
    (ep) =>
      `  { method: ${JSON.stringify(ep.method)}, path: ${JSON.stringify(ep.path)}, panel: ${JSON.stringify(ep.panel)}, label: ${JSON.stringify(ep.label)}, dangerous: ${ep.dangerous} },`
  )
  .join('\n')}
];

/** Endpoints for one panel, for the endpoint explorer. */
export function catalogEndpointsForPanel(panel: LastbrowserPanelId): CatalogEndpoint[] {
  return webuiEndpointCatalog.filter((entry) => entry.panel === panel);
}
`;

writeFileSync(CATALOG_TS, output, 'utf8');
console.log(`Successfully generated ${CATALOG_TS}`);
