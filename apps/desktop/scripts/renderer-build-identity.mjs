import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Hash the actual build inputs, including in source snapshots without Git metadata. */
export function rendererBuildIdentity(repositoryRoot) {
  const files = [];
  function visit(relative) {
    for (const entry of readdirSync(path.join(repositoryRoot, relative), { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) files.push(child);
    }
  }
  visit('apps/desktop/src');
  visit('brand');
  files.push('apps/desktop/package.json', 'apps/desktop/vite.config.ts');
  const hash = createHash('sha256');
  for (const relative of files.sort()) {
    hash.update(relative).update('\0').update(readFileSync(path.join(repositoryRoot, relative)));
  }
  return hash.digest('hex');
}
