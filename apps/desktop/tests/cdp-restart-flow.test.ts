import { describe, expect, it, vi } from 'vitest';
import { createCdpRestartHandler } from '../src/main/cdp-restart-flow.js';

describe('CDP preference restart flow', () => {
  it('installs a fully downloaded update and lets the updater perform the only relaunch', () => {
    const events: string[] = [];
    const restart = createCdpRestartHandler({
      installDownloadedUpdate: () => { events.push('install'); return { state: 'downloaded' }; },
      relaunch: () => events.push('relaunch'),
      quit: () => events.push('quit'),
    });

    expect(restart()).toEqual({ ok: true, restarting: true, updateInstalling: true });
    expect(events).toEqual(['install']);
  });

  it.each([null, { state: 'idle' }, { state: 'available' }, { state: 'downloading' }])(
    'relaunches and performs a normal quit when no update is fully downloaded (%s)',
    (status) => {
      const events: string[] = [];
      const restart = createCdpRestartHandler({
        installDownloadedUpdate: () => status,
        relaunch: () => events.push('relaunch'),
        quit: () => events.push('quit'),
      });

      expect(restart()).toEqual({ ok: true, restarting: true, updateInstalling: false });
      expect(events).toEqual(['relaunch', 'quit']);
    },
  );

  it('ignores duplicate restart requests after beginning updater shutdown', () => {
    const install = vi.fn(() => ({ state: 'downloaded' }));
    const restart = createCdpRestartHandler({
      installDownloadedUpdate: install,
      relaunch: vi.fn(),
      quit: vi.fn(),
    });

    expect(restart()).toMatchObject({ updateInstalling: true });
    expect(restart()).toMatchObject({ updateInstalling: true });

    expect(install).toHaveBeenCalledTimes(1);
  });

  it('allows retry if starting the updater throws before shutdown begins', () => {
    const install = vi.fn()
      .mockImplementationOnce(() => { throw new Error('updater-start-failed'); })
      .mockReturnValueOnce({ state: 'downloaded' });
    const restart = createCdpRestartHandler({
      installDownloadedUpdate: install,
      relaunch: vi.fn(),
      quit: vi.fn(),
    });

    expect(restart).toThrow('updater-start-failed');
    expect(restart()).toMatchObject({ updateInstalling: true });
    expect(install).toHaveBeenCalledTimes(2);
  });
});
