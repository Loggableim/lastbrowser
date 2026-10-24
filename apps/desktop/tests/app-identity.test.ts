import { describe, expect, it, vi } from 'vitest';
import { applyAppUserModelId, LASTBROWSER_APP_USER_MODEL_ID } from '../src/main/app-identity.js';

describe('Lastbrowser app identity', () => {
  it('advertises the installer AppUserModelID so the Windows taskbar uses the branded icon', () => {
    const setAppUserModelId = vi.fn();

    applyAppUserModelId({ setAppUserModelId });

    expect(LASTBROWSER_APP_USER_MODEL_ID).toBe('com.lastbrowser.desktop');
    expect(setAppUserModelId).toHaveBeenCalledTimes(1);
    expect(setAppUserModelId).toHaveBeenCalledWith('com.lastbrowser.desktop');
  });

  it('does not crash on runtimes without setAppUserModelId', () => {
    expect(() => applyAppUserModelId({})).not.toThrow();
  });
});
