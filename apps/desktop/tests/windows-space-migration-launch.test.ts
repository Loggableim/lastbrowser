import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { launchWindowsSpaceMigration } from '../src/main/windows-space-migration-launch.js';

it('accepts only a worker acknowledgment and clears the handed-off request', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lastbrowser-space-launch-'));
  const script = path.join(root, 'probe.cjs');
  try {
    await writeFile(script, `
      const { readFileSync, writeSync } = require('node:fs');
      const frame = readFileSync(0);
      if (frame.length === 3 && frame[0] === 7
        && process.argv[2] === '--lastbrowser-space-migration-worker=' + process.ppid) {
        writeSync(1, Buffer.from([1]));
      }
    `);
    const accepted = Buffer.from([7, 8, 9]);
    await launchWindowsSpaceMigration(process.execPath, [script], accepted);
    expect([...accepted]).toEqual([0, 0, 0]);
    const rejected = Buffer.from([9, 8, 7]);
    await expect(launchWindowsSpaceMigration(process.execPath, [script], rejected)).rejects.toThrow(/reserve/);
    expect([...rejected]).toEqual([0, 0, 0]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
