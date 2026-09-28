import { describe, expect, it, vi } from 'vitest';
import { startPrimaryInstanceStartup } from '../src/main/app-startup.js';

describe('single-instance application startup', () => {
  it('quits a secondary process without registering schemes or initializing services', () => {
    const registerSchemes = vi.fn();
    const whenReady = vi.fn(async () => undefined);
    const initialize = vi.fn();
    const quit = vi.fn();

    startPrimaryInstanceStartup(false, registerSchemes, whenReady, initialize, quit);

    expect(quit).toHaveBeenCalledOnce();
    expect(registerSchemes).not.toHaveBeenCalled();
    expect(whenReady).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('registers schemes before readiness and initializes only the primary process', async () => {
    const calls: string[] = [];
    const ready = Promise.resolve().then(() => { calls.push('ready'); });

    startPrimaryInstanceStartup(
      true,
      () => calls.push('schemes'),
      () => {
        calls.push('whenReady');
        return ready;
      },
      () => { calls.push('initialize'); },
      () => calls.push('quit')
    );

    expect(calls).toEqual(['schemes', 'whenReady']);
    await ready;
    await Promise.resolve();
    expect(calls).toEqual(['schemes', 'whenReady', 'ready', 'initialize']);
  });
});
