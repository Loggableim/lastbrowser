import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { moduleDirname } from '../src/main/module-path.js';

describe('main module paths', () => {
  it('derives a directory from an ESM import.meta.url file URL', () => {
    const mainPath = path.join(process.cwd(), 'dist', 'main', 'main.js');

    expect(moduleDirname(pathToFileURL(mainPath).href)).toBe(path.dirname(mainPath));
  });
});
