import { describe, expect, it } from 'vitest';
import { canCallSidekickApi, serviceReadinessLabel } from '../src/renderer/runtime-readiness.js';

describe('renderer interaction readiness', () => {
  it('allows native panel actions once the sidekick runtime has a local API URL', () => {
    expect(canCallSidekickApi({
      sidekick: 'ready',
      webuiHealth: 'checking',
      webuiUrl: 'http://127.0.0.1:8788',
      port: 8788,
      lastError: null
    })).toBe(true);
  });

  it('keeps native panel actions disabled until a callable runtime exists', () => {
    expect(canCallSidekickApi({
      sidekick: 'starting',
      webuiHealth: 'checking',
      webuiUrl: 'http://127.0.0.1:8788',
      port: 8788,
      lastError: null
    })).toBe(false);

    expect(canCallSidekickApi({
      sidekick: 'ready',
      webuiHealth: 'checking',
      webuiUrl: '',
      port: null,
      lastError: null
    })).toBe(false);
  });

  it('reports a useful label while the backend health endpoint is still warming up', () => {
    expect(serviceReadinessLabel({
      sidekick: 'ready',
      webuiHealth: 'checking',
      webuiUrl: 'http://127.0.0.1:8788',
      port: 8788,
      lastError: null
    })).toBe('Sidekick online');
  });
});
