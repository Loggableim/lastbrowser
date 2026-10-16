import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(desktop, 'package.json'));
const source = path.dirname(require.resolve('ms/package.json'));
const target = path.join(desktop, 'dist', 'main', 'vendor', 'ms');
rmSync(target, { recursive: true, force: true });
mkdirSync(path.dirname(target), { recursive: true });
cpSync(source, target, { recursive: true, dereference: true });
console.log(`[stage-packaged-ms] ${source} -> ${target}`);
