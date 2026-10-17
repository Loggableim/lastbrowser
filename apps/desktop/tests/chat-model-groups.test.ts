import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const chatComponents = readFileSync(
  path.resolve(__dirname, '../src/renderer/panels/ChatComponents.tsx'),
  'utf8'
);
const nativeChatMain = readFileSync(
  path.resolve(__dirname, '../src/renderer/panels/NativeChatMain.tsx'),
  'utf8'
);

describe('chat model picker groups (issue #172 Go / Go Free)', () => {
  it('renders one optgroup per catalog group keyed by the distinct group id', () => {
    // The backend can emit two groups that share a provider_id (Go / Go Free);
    // the renderer must key optgroups on the group id so React does not warn
    // about duplicate keys.
    expect(chatComponents).toContain('id?: string; provider: string; providerId?: string;');
    expect(chatComponents).toContain(
      '<optgroup key={group.id || group.providerId || group.provider} label={group.provider}'
    );
    expect(chatComponents).toContain('{modelOptions.map((group) => (');
  });

  it('preserves the backend group id when parsing /api/models', () => {
    expect(nativeChatMain).toContain(
      "id: String(record.id || record.provider_id || record.provider || '')"
    );
  });
});
