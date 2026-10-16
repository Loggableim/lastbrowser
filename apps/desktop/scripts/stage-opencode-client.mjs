/**
 * Copy the official OpenCode client into the Sidekick tree before packaging.
 * The binary is not committed. A missing client leaves the OpenRouter free fallback.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fileName = process.platform === 'win32' ? 'opencode.exe' : 'opencode';
const destDir = path.resolve(here, '../../../services/sidekick/vendor/opencode');
const dest = path.join(destDir, fileName);
const candidates = [
  process.env.LASTBROWSER_OPENCODE_BIN,
  path.join(homedir(), '.opencode', 'bin', fileName),
  '/tmp/opencode-cli/opencode'
].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);

const source = candidates.find((candidate) => existsSync(candidate));
if (!source) {
  console.log('[opencode] Official client not found. Packaged free chat uses the OpenRouter fallback.');
  process.exit(0);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(source, dest);
chmodSync(dest, 0o755);
console.log('[opencode] Staged the official client for the package.');
