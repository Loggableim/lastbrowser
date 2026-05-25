import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function moduleDirname(metaUrl: string): string {
  return path.dirname(fileURLToPath(metaUrl));
}
