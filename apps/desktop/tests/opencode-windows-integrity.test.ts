import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyOpenCodeBinary, verifyOptionalOpenCodeBinary } from '../scripts/opencode-windows-integrity.mjs';

describe('Windows OpenCode binary verification', () => {
  it('accepts the expected bytes and rejects changed or missing files', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'lb-opencode-integrity-'));
    try {
      const file = path.join(dir, 'opencode.exe');
      const bytes = Buffer.from('local fixture');
      const digest = createHash('sha256').update(bytes).digest('hex');
      writeFileSync(file, bytes);
      await expect(verifyOpenCodeBinary(file, digest)).resolves.toBeUndefined();
      writeFileSync(file, 'changed fixture');
      await expect(verifyOpenCodeBinary(file, digest)).rejects.toThrow(/SHA-256/);
      await expect(verifyOpenCodeBinary(path.join(dir, 'missing.exe'), digest)).rejects.toThrow();
      await expect(verifyOptionalOpenCodeBinary(path.join(dir, 'missing.exe'), digest)).resolves.toBe(false);
      await expect(verifyOptionalOpenCodeBinary(file, digest)).rejects.toThrow(/SHA-256/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
