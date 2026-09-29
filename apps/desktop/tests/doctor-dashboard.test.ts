import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { copyDoctorOutput, runDoctorExclusively } from '../src/renderer/utils/doctor-dashboard.js';

describe('Sidekick Doctor dashboard', () => {
  it('reports a copy only after the clipboard write succeeds', async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };

    await expect(copyDoctorOutput('doctor report', clipboard)).resolves.toBe(true);
    expect(clipboard.writeText).toHaveBeenCalledWith('doctor report');
  });

  it('keeps clipboard failures observable and does not claim success', async () => {
    const clipboard = { writeText: vi.fn().mockRejectedValue(new Error('permission denied')) };

    await expect(copyDoctorOutput('doctor report', clipboard)).rejects.toThrow('permission denied');
  });

  it('does not request a clipboard write for an empty report', async () => {
    const clipboard = { writeText: vi.fn() };

    await expect(copyDoctorOutput('', clipboard)).resolves.toBe(false);
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it('serializes concurrent Doctor actions and releases the guard after completion', async () => {
    const lock = { current: false };
    let finish!: () => void;
    const operation = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));

    const first = runDoctorExclusively(lock, operation);
    const second = runDoctorExclusively(lock, operation);
    await expect(second).resolves.toBe(false);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(lock.current).toBe(true);

    finish();
    await expect(first).resolves.toBe(true);
    expect(lock.current).toBe(false);
    await expect(runDoctorExclusively(lock, async () => {})).resolves.toBe(true);
  });

  it('releases the guard after a Doctor action throws', async () => {
    const lock = { current: false };

    await expect(runDoctorExclusively(lock, async () => { throw new Error('doctor failed'); }))
      .rejects.toThrow('doctor failed');
    expect(lock.current).toBe(false);
  });

  it('allows long diagnostic details to wrap within the card', () => {
    const source = readFileSync(resolve(__dirname, '../src/renderer/panels/SystemPanels.tsx'), 'utf8');
    const dashboard = source.slice(source.indexOf('export function DoctorDashboard'), source.indexOf('export function ExtensionsSettingsSection'));

    expect(dashboard).toContain('runDoctorExclusively(doctorRunInProgress');
    expect(dashboard).toContain("overflowWrap: 'anywhere'");
    expect(dashboard).not.toContain("whiteSpace: 'nowrap'");
  });
});
