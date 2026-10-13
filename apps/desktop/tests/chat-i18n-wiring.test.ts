import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('chat localization wiring', () => {
  it('renders localized Nova empty-state copy instead of fixed German text', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/renderer/components/CopilotSplitView.tsx'), 'utf8');
    expect(source).toContain("t('copilot.emptyTitle', { botName })");
    expect(source).toContain("t('copilot.quickChatDescription')");
    expect(source).not.toContain('Frag {botName} zur aktuellen Seite');
    expect(source).not.toContain('Erhalte Zusammenfassungen, Übersetzungen');
  });

  it('uses the active locale for the native chat composer and startup placeholder', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/renderer/panels/ChatComponents.tsx'), 'utf8');
    expect(source).toContain("placeholder={ready ? t('chat.composerPlaceholder') : t('chat.runtimeStarting')}");
    expect(source).not.toContain("placeholder={ready ? 'Message Sidekick...");
  });
});
