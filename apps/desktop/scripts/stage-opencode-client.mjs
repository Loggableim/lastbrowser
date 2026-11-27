/**
 * Copy the official OpenCode client into the Sidekick tree before packaging.
 * The binary is not committed. Without a client, users need to choose a provider.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyOpenCodeBinary } from './opencode-windows-integrity.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fileName = process.platform === 'win32' ? 'opencode.exe' : 'opencode';
const destDir = path.resolve(here, '../../../services/sidekick/vendor/opencode');
const dest = path.join(destDir, fileName);
const candidates = [
  process.env.LASTBROWSER_OPENCODE_BIN,
  path.join(homedir(), '.opencode', 'bin', fileName),
  '/tmp/opencode-cli/opencode'
].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);

if (process.platform === 'win32' && process.env.LASTBROWSER_OPENCODE_BIN && !existsSync(process.env.LASTBROWSER_OPENCODE_BIN)) {
  throw new Error('The explicitly specified OpenCode client was not found.');
}
const source = candidates.find((candidate) => existsSync(candidate));
if (!source) {
  if (process.platform === 'win32' && existsSync(dest)) {
    throw new Error('A stale staged OpenCode client exists; explicitly provide a verified client before packaging.');
  }
  console.log('[opencode] Official client not found. Free chat needs a configured provider.');
  process.exit(0);
}
if (process.platform === 'win32') await verifyOpenCodeBinary(source);
mkdirSync(destDir, { recursive: true });
copyFileSync(source, dest);
if (process.platform === 'win32') await verifyOpenCodeBinary(dest);
chmodSync(dest, 0o755);
console.log('[opencode] Staged the official client for the package.');
