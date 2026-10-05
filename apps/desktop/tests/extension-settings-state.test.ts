import { describe, expect, it, vi } from 'vitest';
import { loadExtensionSettingsData } from '../src/renderer/extension-settings-state.js';

describe('extension settings IPC boundary', () => {
  it.each([undefined, null])('treats missing %s lists as empty without enabling or persisting anything', async (missing) => {
    const api = {
      list: vi.fn().mockResolvedValue(missing),
      presets: vi.fn().mockResolvedValue(missing)
    };

    await expect(loadExtensionSettingsData(api)).resolves.toEqual({ extensions: [], presets: [] });
    expect(api.list).toHaveBeenCalledOnce();
    expect(api.presets).toHaveBeenCalledOnce();
  });

  it('preserves valid IPC records and discards malformed array entries', async () => {
    const extension = { id: 'reader', name: 'Reader', enabled: false };
    const preset = { id: 'dark-mode', cwsId: 'a'.repeat(32) };

    await expect(loadExtensionSettingsData({
      list: vi.fn().mockResolvedValue([extension, null, 'broken']),
      presets: vi.fn().mockResolvedValue([preset, undefined])
    })).resolves.toEqual({ extensions: [extension], presets: [preset] });
  });

  it('reports a malformed non-array IPC response instead of hiding it as an empty inventory', async () => {
    await expect(loadExtensionSettingsData({
      list: vi.fn().mockResolvedValue({ plugins: [] }),
      presets: vi.fn().mockResolvedValue([])
    })).rejects.toThrow('Invalid extensions response: expected an array');
  });
});
