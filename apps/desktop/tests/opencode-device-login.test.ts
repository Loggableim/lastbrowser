import { describe, expect, it, vi } from 'vitest';
import { isOpenCodeDeviceFlowCurrent, startOpenCodeDeviceLogin, cancelOpenCodeDeviceLogin, validatedOpenCodeVerificationUrl, readOpenCodeDeviceStatus } from '../src/renderer/opencode-device-login.js';

const scope = { browserProfileId: 'home', workspacePath: null, backendProfileName: 'default' };
const response = { ok: true, login_id: 'a'.repeat(32), verification_url: 'https://opencode.ai/console/device?user_code=ABCD-EFGH', user_code: 'ABCD-EFGH', interval: 5 };
function fixture() {
  const request = vi.fn(async (input: { path: string }) => input.path.endsWith('/login') ? response : { ok: true });
  const openBrowser = vi.fn(async () => true);
  return { request, openBrowser, provider: 'opencode-go', scope, isCurrent: () => true };
}
describe('OpenCode browser device login', () => {
  it.each(['http://opencode.ai/console/device?user_code=A', 'https://opencode.ai.evil/console/device?user_code=A',
    'https://user@opencode.ai/console/device?user_code=A', 'https://opencode.ai:443/console/device?user_code=A',
    'https://opencode.ai/console/device?user_code=A&user_code=B', 'https://opencode.ai/console/device?user_code=A&token=B',
    'https://opencode.ai/console/device?user_code=A&client_id=other', 'https://opencode.ai/console/device?user_code=A&client_id=lastbrowser&client_id=lastbrowser',
    'https://opencode.ai/console/device?user_code=A#token', 'https://opencode.ai/console/other?user_code=A', 'javascript:alert(1)'])(
    'rejects untrusted verification URL %s', value => expect(() => validatedOpenCodeVerificationUrl(value)).toThrow());
  it('opens only the official page and returns only public fields', async () => {
    const f = fixture(); const flow = await startOpenCodeDeviceLogin(f);
    expect(f.openBrowser).toHaveBeenCalledExactlyOnceWith(response.verification_url);
    expect(flow).toEqual({ loginId: response.login_id, verificationUrl: response.verification_url, userCode: response.user_code, interval: 5 });
    expect(f.request).toHaveBeenCalledWith(expect.objectContaining({ scopeSelection: scope, body: { provider: 'opencode-go' } }));
  });
  it('opens the official live device URL with its exact LastBrowser client ID', async () => {
    const f = fixture();
    const verification_url = `${response.verification_url}&client_id=lastbrowser`;
    f.request.mockImplementationOnce(async () => ({ ...response, verification_url }));
    const flow = await startOpenCodeDeviceLogin(f);
    expect(f.openBrowser).toHaveBeenCalledExactlyOnceWith(verification_url);
    expect(flow?.verificationUrl).toBe(verification_url);
    expect(flow?.userCode).toBe(response.user_code);
  });
  it('cancels a late start after scope switching without opening a browser', async () => {
    const f = fixture(); f.isCurrent = () => false;
    expect(await startOpenCodeDeviceLogin(f)).toBeNull();
    expect(f.openBrowser).not.toHaveBeenCalled();
    expect(f.request).toHaveBeenLastCalledWith(expect.objectContaining({ path: '/api/providers/opencode-auth/cancel', scopeSelection: scope }));
  });
  it('cancels if scope switches while the browser opens', async () => {
    const f = fixture(); let current = true; f.isCurrent = () => current;
    f.openBrowser.mockImplementation(async () => { current = false; return true; });
    expect(await startOpenCodeDeviceLogin(f)).toBeNull();
    expect(f.request).toHaveBeenLastCalledWith(expect.objectContaining({ path: '/api/providers/opencode-auth/cancel' }));
  });
  it('cancels a device flow if browser opening fails', async () => {
    const f = fixture(); f.openBrowser.mockResolvedValue(false);
    await expect(startOpenCodeDeviceLogin(f)).rejects.toThrow('opencode_device_browser_failed');
    expect(f.request).toHaveBeenLastCalledWith(expect.objectContaining({ path: '/api/providers/opencode-auth/cancel' }));
  });
  it.each(['https://opencode.ai.evil/console/device?user_code=ABCD-EFGH', 'https://opencode.ai/console/device?user_code=OTHER'])(
    'cancels malformed or mismatched start URLs before browser navigation %s', async verification_url => {
      const f = fixture(); f.request.mockImplementationOnce(async () => ({ ...response, verification_url }));
      await expect(startOpenCodeDeviceLogin(f)).rejects.toThrow('opencode_device_url_invalid');
      expect(f.openBrowser).not.toHaveBeenCalled();
      expect(f.request).toHaveBeenLastCalledWith(expect.objectContaining({ path: '/api/providers/opencode-auth/cancel' }));
    });
  it('does not deliver stale status after cancellation or switching profiles', () => {
    expect(isOpenCodeDeviceFlowCurrent(scope, scope, 1, 1)).toBe(true);
    expect(isOpenCodeDeviceFlowCurrent(scope, scope, 1, 2)).toBe(false);
    expect(isOpenCodeDeviceFlowCurrent(scope, { ...scope, backendProfileName: 'other' }, 1, 1)).toBe(false);
  });
  it('requires saved credentials before reporting connection success and excludes unknown status', () => {
    expect(readOpenCodeDeviceStatus({ ok: true, status: 'connected', configured: true })).toBe('connected');
    expect(readOpenCodeDeviceStatus({ ok: true, status: 'connected', configured: false })).toBeNull();
    expect(readOpenCodeDeviceStatus({ ok: true, status: 'private-auth-data' })).toBeNull();
    expect(readOpenCodeDeviceStatus({ ok: true, status: 'expired' })).toBe('expired');
    expect(readOpenCodeDeviceStatus({ ok: true, status: 'cancelled' })).toBe('cancelled');
  });
  it('requires explicit cancellation acknowledgement in the original scope', async () => {
    const request = vi.fn(async () => ({ ok: true, status: 'cancelled' }));
    await cancelOpenCodeDeviceLogin(request, response.login_id, scope);
    expect(request).toHaveBeenCalledExactlyOnceWith({ method: 'POST', path: '/api/providers/opencode-auth/cancel', body: { login_id: response.login_id }, scopeSelection: scope });
  });
  it.each([{ ok: false }, { ok: true, status: 'running' }, { ok: true, status: 'connected' }, null])(
    'never reports cancellation from a rejected or raced response %j', async value => {
      await expect(cancelOpenCodeDeviceLogin(async () => value, response.login_id, scope)).rejects.toThrow('opencode_cancel_failed');
    });
});
