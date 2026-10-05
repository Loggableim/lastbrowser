const { spawnSync } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');

// Reuse the existing isolated Electron fixture rather than rebuilding the app
// shell. The fixture mounts LocalAiSetupPane with deterministic hardware data.
const root = path.resolve(__dirname, '../../..');
const result = spawnSync(process.execPath, [path.join(__dirname, 'local-ai-setup-click-smoke.cjs')], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  timeout: 30000
});

if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  process.exit(result.status || 1);
}

const output = `${result.stdout || ''}${result.stderr || ''}`;
assert.match(output, /independent hardware inventory loaded while service readiness is false/);
assert.match(output, /DOM retry dispatched and rendered its decoded response/);
process.stdout.write('Mounted Local-AI pane: controlled inventory, explicit unknowns, and retry button verified.\n');
process.stdout.write('Scope limit: this fixture does not mount FirstRunSetupPane, NativeSettingsMain, or the application shell.\n');
