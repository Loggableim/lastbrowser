// Fail closed before packaging if pinned Local-AI engines are not staged.
// Staging lives at apps/desktop/runtime/local-ai (extraResources from/to),
// not the obsolete apps/desktop/vendor/local-ai path used by older docs/workflows.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const registryPath = path.join(root, 'services/sidekick/runtime/local_ai/store-runtime-registry.json');
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
if (registry.schemaVersion !== 1 || !Array.isArray(registry.engines) || !registry.engines.length) {
  throw new Error('[verify:local-ai] Registry has no pinned engines');
}

const missing = [];
for (const engine of registry.engines) {
  const relative = engine?.manifest?.packageRelativeDir;
  if (typeof relative !== 'string' || !relative.startsWith('apps/desktop/runtime/local-ai/')) {
    throw new Error(`[verify:local-ai] Unexpected packageRelativeDir for ${engine?.id}: ${relative}`);
  }
  const dir = path.join(root, ...relative.split('/'));
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    missing.push(`${engine.id} -> ${relative}`);
    continue;
  }
  const sample = engine.manifest.files?.[0]?.relativePath;
  if (sample && !existsSync(path.join(dir, ...sample.split('/')))) {
    missing.push(`${engine.id} missing sample file ${sample}`);
  }
}

if (missing.length) {
  throw new Error(
    '[verify:local-ai] Staged Local-AI engines missing under apps/desktop/runtime/local-ai.\n' +
    'Run: npm run prepare:local-model-engines -- --source <verified-acquisition-dir>\n' +
    'Missing:\n- ' + missing.join('\n- ')
  );
}

console.log(`[verify:local-ai] ${registry.engines.length} pinned engines present under apps/desktop/runtime/local-ai`);
