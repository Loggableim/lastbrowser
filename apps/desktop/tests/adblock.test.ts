import { describe, expect, it, vi } from 'vitest';
import { createAdblockController } from '../src/main/adblock.js';

type Listener = (...args: unknown[]) => void;

function fakeBlocker() {
  const listeners = new Map<string, Listener[]>();
  const enabled = new Set<unknown>();
  return {
    on: vi.fn((event: string, listener: Listener) => {
      const current = listeners.get(event) || [];
      current.push(listener);
      listeners.set(event, current);
    }),
    enableBlockingInSession: vi.fn((session: unknown) => {
      enabled.add(session);
    }),
    disableBlockingInSession: vi.fn((session: unknown) => {
      enabled.delete(session);
    }),
    emit(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) || []) listener(...args);
    },
    enabledSessions: enabled
  };
}

const fakeSession = () => ({ id: `session-${Math.random()}` }) as never;

describe('adblock controller', () => {
  it('starts in idle state and reports enabled by default', () => {
    const controller = createAdblockController({ loadBlocker: async () => fakeBlocker() as never });
    const status = controller.getStatus();
    expect(status.state).toBe('idle');
    expect(status.enabled).toBe(true);
    expect(status.blockedCount).toBe(0);
    expect(status.lastError).toBeNull();
  });

  it('loads the blocker and attaches it to a session', async () => {
    const blocker = fakeBlocker();
    const controller = createAdblockController({ loadBlocker: async () => blocker as never });
    const session = fakeSession();

    await controller.attach(session);

    expect(blocker.enableBlockingInSession).toHaveBeenCalledTimes(1);
    expect(controller.getStatus().state).toBe('ready');
  });

  it('is idempotent per session', async () => {
    const blocker = fakeBlocker();
    const controller = createAdblockController({ loadBlocker: async () => blocker as never });
    const session = fakeSession();

    await controller.attach(session);
    await controller.attach(session);
    await controller.attach(session);

    expect(blocker.enableBlockingInSession).toHaveBeenCalledTimes(1);
  });

  it('attaches separate sessions independently', async () => {
    const blocker = fakeBlocker();
    const controller = createAdblockController({ loadBlocker: async () => blocker as never });

    await controller.attach(fakeSession());
    await controller.attach(fakeSession());

    expect(blocker.enableBlockingInSession).toHaveBeenCalledTimes(2);
  });

  it('counts blocked requests', async () => {
    const blocker = fakeBlocker();
    const controller = createAdblockController({ loadBlocker: async () => blocker as never });
    await controller.attach(fakeSession());

    blocker.emit('request-blocked');
    blocker.emit('request-blocked');
    blocker.emit('request-blocked');

    expect(controller.getStatus().blockedCount).toBe(3);
  });

  it('does not count other events', async () => {
    const blocker = fakeBlocker();
    const controller = createAdblockController({ loadBlocker: async () => blocker as never });
    await controller.attach(fakeSession());

    blocker.emit('request-allowed');
    blocker.emit('request-whitelisted');

    expect(controller.getStatus().blockedCount).toBe(0);
  });

  it('captures load failures instead of throwing', async () => {
    const controller = createAdblockController({
      loadBlocker: async () => {
        throw new Error('network down');
      }
    });

    await expect(controller.attach(fakeSession())).resolves.toBeUndefined();

    const status = controller.getStatus();
    expect(status.state).toBe('error');
    expect(status.lastError).toBe('network down');
  });

  it('does not enable blocking when disabled at construction', async () => {
    const blocker = fakeBlocker();
    const controller = createAdblockController({
      enabled: false,
      loadBlocker: async () => blocker as never
    });

    await controller.attach(fakeSession());

    expect(blocker.enableBlockingInSession).not.toHaveBeenCalled();
    expect(controller.isEnabled()).toBe(false);
  });

  it('toggles blocking on attached sessions', async () => {
    const blocker = fakeBlocker();
    const controller = createAdblockController({ loadBlocker: async () => blocker as never });
    const session = fakeSession();
    await controller.attach(session);

    controller.setEnabled(false);
    expect(blocker.disableBlockingInSession).toHaveBeenCalledWith(session);
    expect(controller.isEnabled()).toBe(false);

    controller.setEnabled(true);
    expect(blocker.enableBlockingInSession).toHaveBeenCalledTimes(2);
    expect(controller.isEnabled()).toBe(true);
  });

  it('ignores redundant enable toggles', async () => {
    const blocker = fakeBlocker();
    const controller = createAdblockController({ loadBlocker: async () => blocker as never });
    await controller.attach(fakeSession());

    controller.setEnabled(true);
    controller.setEnabled(true);

    expect(blocker.enableBlockingInSession).toHaveBeenCalledTimes(1);
  });

  it('survives a session that throws on enable', async () => {
    const blocker = fakeBlocker();
    blocker.enableBlockingInSession.mockImplementation(() => {
      throw new Error('session destroyed');
    });
    const controller = createAdblockController({ loadBlocker: async () => blocker as never });

    await expect(controller.attach(fakeSession())).resolves.toBeUndefined();
    expect(controller.getStatus().state).toBe('error');
  });
});
