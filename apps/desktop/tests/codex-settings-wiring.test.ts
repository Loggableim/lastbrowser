import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/renderer/panels/SystemPanels.tsx', import.meta.url), 'utf8');

describe('Codex settings connection', () => {
  it('keeps device-code sign-in visible and polls the issued flow', () => {
    expect(source).toContain("setCodexConnect({ status: 'starting'");
    expect(source).toContain('window.lastbrowser.sidekick.pollOAuth(flowId)');
    expect(source).toContain('codexConnect.userCode');
    expect(source).toContain('window.lastbrowser.sidekick.cancelOAuth({ flowId');
    expect(source).toContain('role="status" aria-live="polite"');
  });
});
