import { describe, expect, it, vi } from 'vitest';
import { submitSpaceSetup, type SpaceSetupData } from '../src/renderer/components/SpaceSetupModal.js';

const sampleSpace: SpaceSetupData = {
  path: 'spaces/audit',
  name: 'Audit',
  color: '#123456',
  model: 'smart-track',
  pinnedApps: [],
  startUrl: 'app://browser-home'
};

describe('Space setup failures', () => {
  it('shows the readiness error returned by the main process instead of generic storage copy', async () => {
    const close = vi.fn();
    const error = await submitSpaceSetup(
      sampleSpace,
      async () => 'Sidekick is still starting. Try again shortly.',
      close
    );

    expect(error?.message).toBe('Sidekick is still starting. Try again shortly.');
    expect(close).not.toHaveBeenCalled();
  });

  it('retains the generic validation message when the callback only returns false', async () => {
    const error = await submitSpaceSetup(sampleSpace, async () => false, vi.fn(), 'Could not create this Space.');

    expect(error?.message).toBe('Could not create this Space.');
  });
});
