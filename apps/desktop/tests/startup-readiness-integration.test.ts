import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canRenderBrowserForAccessAuth } from '../src/renderer/access-auth.js';
import { createAccessAuthGateConsumer, isVerifiedAccessAuthLogin } from '../src/renderer/access-auth-gate.js';
import { deriveStartupPhase, getStartupFailureStage, isStartupReady, type StartupReadinessSignals } from '../src/renderer/startup/startup-screen-state.js';

const appPath = path.resolve(process.cwd(), 'src/renderer/App.tsx');
const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');
const preloadPath = path.resolve(process.cwd(), 'src/main/preload.ts');
const typesPath = path.resolve(process.cwd(), 'src/renderer/global.d.ts');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

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
    expect(app).toContain('createAccessAuthGateConsumer()');
    expect(app).toContain("dispatch({ type: 'preflight'");
    expect(app).toContain("dispatch({ type: 'lock' })");
    expect(app).toContain("dispatch({ type: 'status'");
    expect(app).toContain("dispatch({ type: 'login-success'");
    expect(app).toContain('isVerifiedAccessAuthLogin(auth)');
    expect(app).toContain('const generation = accessAuthGateRef.current!.state.generation');
    expect(app).toContain("deriveStartupPhase(startupReadinessSignals, startupAuthPolicy)");
    expect(app).toContain("if (!startupAuthAllowsShell || startupPhase !== 'ready' || !startupReadyAcknowledged)");
    expect(app).toContain("type: 'verified-password-login'");
    expect(app).toContain('passwordProtectedAtSubmit && auth.auth_enabled === true');
    expect(app).toContain("ready: startupPhase === 'ready' && startupReadyAcknowledged");
    expect(app).toContain("type: 'readiness'");
    expect(app).toContain("setStartupOpeningState((current) => reduceStartupOpeningState(current, { type: 'lock' }))");
    expect(app).toContain("setStartupOpeningState((current) => reduceStartupOpeningState(current, { type: 'scope-change' }))");
    expect(app).toContain('}, [activeProfileId]);');
    expect(app).toContain('inert={startupOpeningState === \'opening\'}');
    expect(app).toContain('onOpeningComplete={completeStartupOpening}');
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
    const consumer = createAccessAuthGateConsumer();
    const authState = consumer.dispatch({
      type: 'preflight', generation: consumer.state.generation, scopeId: 'main-scope-a', policy: 'disabled'
    });
    expect(canRenderBrowserForAccessAuth(authState.checked, {
      auth_enabled: false,
      logged_in: false
    })).toBe(true);
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

  it('keeps the real App auth consumer locked when a pending disabled preflight resolves after a same-scope lock', async () => {
    const consumer = createAccessAuthGateConsumer();
    const response = deferred<{ policy: 'disabled'; scopeId: string }>();
    const requestGeneration = consumer.state.generation;
    const resolvingPreflight = response.promise.then((result) => consumer.dispatch({
      type: 'preflight', generation: requestGeneration, scopeId: result.scopeId, policy: result.policy
    }));

    consumer.dispatch({ type: 'lock' });
    response.resolve({ policy: 'disabled', scopeId: 'main-scope-a' });
    await resolvingPreflight;

    const lockedAuthStatus = {
      auth_enabled: consumer.state.required,
      logged_in: !consumer.state.required
    };
    expect(consumer.state).toMatchObject({ checked: true, required: true, scopeId: null });
    expect(canRenderBrowserForAccessAuth(consumer.state.checked, lockedAuthStatus)).toBe(false);
  });

  it('rejects stale scope, status, and login results while allowing a current retry and verified login', () => {
    const consumer = createAccessAuthGateConsumer();
    const preflightGeneration = consumer.state.generation;
    consumer.dispatch({ type: 'scope-change', scopeId: 'main-scope-a' });
    const beforeStaleScope = consumer.state;
    const staleScope = consumer.dispatch({
      type: 'preflight', generation: preflightGeneration, scopeId: 'main-scope-a', policy: 'disabled'
    });
    expect(staleScope).toMatchObject({ checked: false, required: true, scopeId: 'main-scope-a' });
    expect(staleScope).toBe(beforeStaleScope);

    const statusGeneration = consumer.state.generation;
    consumer.dispatch({ type: 'lock' });
    const staleStatus = consumer.dispatch({
      type: 'status', generation: statusGeneration, auth: { auth_enabled: false, logged_in: false }
    });
    expect(staleStatus).toMatchObject({ checked: true, required: true });

    const retry = consumer.dispatch({ type: 'retry' });
    const loginGeneration = retry.generation;
    consumer.dispatch({ type: 'lock' });
    expect(consumer.dispatch({ type: 'login-success', generation: loginGeneration }))
      .toMatchObject({ checked: true, required: true });

    const freshRetry = consumer.dispatch({ type: 'retry' });
    const verified = consumer.dispatch({ type: 'login-success', generation: freshRetry.generation });
    expect(verified).toMatchObject({ checked: true, required: false });
    expect(canRenderBrowserForAccessAuth(verified.checked, { auth_enabled: true, logged_in: true })).toBe(true);
  });

  it('fails closed for an explicit auth status with a missing policy field', () => {
    const consumer = createAccessAuthGateConsumer();
    const result = consumer.dispatch({
      type: 'status', generation: consumer.state.generation, auth: { logged_in: true }
    });
    expect(result).toMatchObject({ checked: true, required: true });
    expect(canRenderBrowserForAccessAuth(result.checked, { auth_enabled: undefined, logged_in: true })).toBe(false);
  });

  it('requires explicit auth policy and a verified login status before accepting a login result', () => {
    expect(isVerifiedAccessAuthLogin({ auth_enabled: true, logged_in: true })).toBe(true);
    expect(isVerifiedAccessAuthLogin({ auth_enabled: false, logged_in: true })).toBe(true);
    expect(isVerifiedAccessAuthLogin({ logged_in: true })).toBe(false);
    expect(isVerifiedAccessAuthLogin({ auth_enabled: true, logged_in: false })).toBe(false);

    const consumer = createAccessAuthGateConsumer();
    const locked = consumer.dispatch({ type: 'lock' });
    const retry = consumer.dispatch({ type: 'retry' });
    const malformedResponse = { logged_in: true };
    const loginState = isVerifiedAccessAuthLogin(malformedResponse)
      ? consumer.dispatch({ type: 'login-success', generation: retry.generation })
      : consumer.dispatch({ type: 'status-error', generation: retry.generation, error: 'Incomplete auth status' });
    expect(loginState).toMatchObject({ checked: false, required: true, error: 'Incomplete auth status' });
    expect(canRenderBrowserForAccessAuth(loginState.checked, { auth_enabled: true, logged_in: false })).toBe(false);
    expect(locked.required).toBe(true);
  });
});
