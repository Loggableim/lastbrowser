import { isProviderSettingsScopeCurrent, type ProviderScopeSelection, type ProviderSettingsRequester } from './provider-settings.js';

export function validatedOpenCodeVerificationUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('opencode_device_url_invalid');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('opencode_device_url_invalid'); }
  if (!value.startsWith('https://opencode.ai/') || url.protocol !== 'https:' || url.hostname !== 'opencode.ai' || url.username || url.password
    || url.port || url.hash || url.pathname !== '/console/device'
    || [...url.searchParams.keys()].some(key => key !== 'user_code' && key !== 'client_id')
    || url.searchParams.getAll('user_code').length !== 1 || url.searchParams.getAll('client_id').length > 1
    || (url.searchParams.has('client_id') && url.searchParams.get('client_id') !== 'lastbrowser')
    || !/^[A-Za-z0-9-]{1,64}$/.test(url.searchParams.get('user_code') ?? ''))
    throw new Error('opencode_device_url_invalid');
  return url.href;
}

export type OpenCodeDeviceLogin = { loginId: string; verificationUrl: string; userCode: string; interval: number };
export type OpenCodeFailureKey = 'openCodeLoginFinishFailed' | 'openCodeLoginDenied' | 'openCodeWorkspaceFailed' | 'openCodeConnectionFailed';
const openCodeFailureKeys: Record<string, OpenCodeFailureKey> = {
  access_denied: 'openCodeLoginDenied', invalid_grant: 'openCodeLoginFinishFailed',
  unsupported_workspace_gateway: 'openCodeWorkspaceFailed', unsupported_workspace_header: 'openCodeWorkspaceFailed',
  workspace_provider_unavailable: 'openCodeWorkspaceFailed', workspace_model_unavailable: 'openCodeWorkspaceFailed',
  invalid_workspace_config: 'openCodeWorkspaceFailed', workspace_binding_changed: 'openCodeWorkspaceFailed',
  device_request_failed: 'openCodeConnectionFailed', credential_refresh_busy: 'openCodeConnectionFailed',
  invalid_token_response: 'openCodeLoginFinishFailed', invalid_device_response: 'openCodeLoginFinishFailed',
  invalid_verification_url: 'openCodeLoginFinishFailed', device_login_required: 'openCodeLoginFinishFailed'
};
/** Never render arbitrary provider error strings, URLs, or credential payloads. */
export function readOpenCodeFailure(value: unknown): { key: OpenCodeFailureKey; diagnostic?: string } {
  const code = value && typeof value === 'object' ? (value as Record<string, unknown>).error_code : null;
  return typeof code === 'string' && Object.hasOwn(openCodeFailureKeys, code)
    ? { key: openCodeFailureKeys[code], diagnostic: code } : { key: 'openCodeLoginFinishFailed' };
}
export async function cancelOpenCodeDeviceLogin(request: ProviderSettingsRequester, loginId: string, scope: ProviderScopeSelection): Promise<void> {
  const result = await request({ method: 'POST', path: '/api/providers/opencode-auth/cancel', body: { login_id: loginId }, scopeSelection: scope });
  if (!result || typeof result !== 'object' || (result as Record<string, unknown>).ok !== true
    || (result as Record<string, unknown>).status !== 'cancelled') throw new Error('opencode_cancel_failed');
}
export function readOpenCodeDeviceStatus(value: unknown): 'running' | 'connected' | 'expired' | 'cancelled' | 'failed' | null {
  if (!value || typeof value !== 'object') return null;
  const response = value as Record<string, unknown>;
  if (response.ok !== true) return null;
  if (response.status === 'connected') return response.configured === true ? 'connected' : null;
  return ['running', 'expired', 'cancelled', 'failed'].includes(String(response.status))
    ? response.status as 'running' | 'expired' | 'cancelled' | 'failed' : null;
}
export async function startOpenCodeDeviceLogin(options: {
  request: ProviderSettingsRequester; provider: string; scope: ProviderScopeSelection;
  isCurrent: () => boolean; openBrowser: (url: string) => Promise<boolean>;
}): Promise<OpenCodeDeviceLogin | null> {
  const result = await options.request({ method: 'POST', path: '/api/providers/opencode-auth/login',
    body: { provider: options.provider }, scopeSelection: options.scope });
  const response = result && typeof result === 'object' ? result as Record<string, unknown> : {};
  if (response.ok !== true || typeof response.login_id !== 'string' || !/^[a-f0-9]{32}$/.test(response.login_id))
    throw new Error('opencode_device_start_failed');
  const cancel = () => options.request({ method: 'POST', path: '/api/providers/opencode-auth/cancel',
    body: { login_id: response.login_id }, scopeSelection: options.scope });
  try {
    if (!options.isCurrent()) { await cancel(); return null; }
    const verificationUrl = validatedOpenCodeVerificationUrl(response.verification_url);
    if (typeof response.user_code !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(response.user_code))
      throw new Error('opencode_device_start_failed');
    if (new URL(verificationUrl).searchParams.get('user_code') !== response.user_code) throw new Error('opencode_device_url_invalid');
    if (!await options.openBrowser(verificationUrl)) throw new Error('opencode_device_browser_failed');
    if (!options.isCurrent()) { await cancel(); return null; }
    return { loginId: response.login_id, verificationUrl, userCode: response.user_code,
      interval: typeof response.interval === 'number' && Number.isFinite(response.interval) ? Math.max(1, Math.min(30, response.interval)) : 5 };
  } catch (error) { await cancel().catch(() => null); throw error; }
}

export function isOpenCodeDeviceFlowCurrent(captured: ProviderScopeSelection, current: ProviderScopeSelection,
  capturedGeneration: number, generation: number): boolean {
  return isProviderSettingsScopeCurrent(captured, current, capturedGeneration, generation);
}
