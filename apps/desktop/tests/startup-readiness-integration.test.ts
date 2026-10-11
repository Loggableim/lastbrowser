import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveStartupPhase, getStartupFailureStage, isStartupReady, type StartupReadinessSignals } from '../src/renderer/startup/startup-screen-state.js';

const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');
const preloadPath = path.resolve(process.cwd(), 'src/main/preload.ts');
const typesPath = path.resolve(process.cwd(), 'src/renderer/global.d.ts');

describe('startup readiness App and Main IPC integration contract', () => {
  it('wires Main policy through preload and consumes it in the real App shell gate', () => {
    const main = readFileSync(mainPath, 'utf8');
    const preload = readFileSync(preloadPath, 'utf8');
    const types = readFileSync(typesPath, 'utf8');
    const app = readFileSync(appPath, 'utf8');

    expect(main).toContain("'lastbrowser:sidekick:getAccessAuthStartupPolicy'");
    expect(main).toContain('isAccessAuthPreflightCurrent(resultContext, currentContext)');
    expect(preload).toContain("ipcRenderer.invoke('lastbrowser:sidekick:getAccessAuthStartupPolicy', requestId)");
    expect(types).toContain('getAccessAuthStartupPolicy: (requestId: number)');
    expect(app).toContain('getAccessAuthStartupPolicy(requestId)');
    expect(app).toContain('result.requestId !== requestId');
    expect(app).toContain('priorScopeId !== result.scopeId');
    expect(app).toContain('canReleaseAccessGateFromStartupPreflight(policy)');
    expect(app).toContain("deriveStartupPhase(startupReadinessSignals, startupAuthPolicy)");
    expect(app).toContain("if (!startupAuthAllowsShell || startupPhase !== 'ready' || !startupReadyAcknowledged)");
    expect(app).toContain('getStartupBackgroundPhase(startupReadinessSignals, startupAuthPolicy)');
  });

  it('allows only Main-confirmed disabled auth to release browser startup while Python is offline', () => {
    const offline: StartupReadinessSignals = {
      engine: 'error', profile: 'complete', spaces: 'error', connections: 'error',
      models: 'error', sidekick: 'error', session: 'complete'
    };
    expect(isStartupReady(offline, 'disabled')).toBe(true);
    expect(deriveStartupPhase(offline, 'disabled')).toBe('ready');
    expect(getStartupFailureStage(offline, 'disabled')).toBeNull();
  });

  it('keeps enabled and unknown policy fail-closed when the auth service cannot be reached', () => {
    const offline: StartupReadinessSignals = {
      engine: 'error', profile: 'complete', spaces: 'pending', connections: 'pending',
      models: 'pending', sidekick: 'error', session: 'pending'
    };
    expect(isStartupReady(offline, 'enabled')).toBe(false);
    expect(isStartupReady(offline, 'unknown')).toBe(false);
    expect(getStartupFailureStage(offline, 'unknown')).toBe('engine');

    const authFailed = { ...offline, engine: 'complete' as const, sidekick: 'complete' as const, session: 'error' as const };
    expect(isStartupReady(authFailed, 'disabled')).toBe(false);
    expect(getStartupFailureStage(authFailed, 'disabled')).toBe('session');
  });

  it('does not make optional Spaces, onboarding, model, network, or schema failures a shell gate', () => {
    const coreReadyWithDiscoveryFailures: StartupReadinessSignals = {
      engine: 'complete', profile: 'complete', spaces: 'error', connections: 'error',
      models: 'error', sidekick: 'complete', session: 'complete'
    };
    for (const policy of ['disabled', 'enabled', 'unknown'] as const) {
      expect(isStartupReady(coreReadyWithDiscoveryFailures, policy)).toBe(true);
      expect(getStartupFailureStage(coreReadyWithDiscoveryFailures, policy)).toBeNull();
    }
    expect(isStartupReady({ ...coreReadyWithDiscoveryFailures, profile: 'error' }, 'enabled')).toBe(false);
  });
});
