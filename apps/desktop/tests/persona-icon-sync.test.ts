import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(path.resolve(process.cwd(), 'src/renderer', file), 'utf8');

describe('persona icon sync', () => {
  it('gives every persona a fresh animated host, because the engine never clears a host SVG', () => {
    const animated = source('components/AnimatedSidekick.tsx');
    expect(animated).toContain('key={mini ? `${persona}-mini` : persona}');
  });

  it('mirrors a companion save into the standard-chat selection and notifies the sidebar', () => {
    const avatar = source('personality-avatar.ts');
    expect(avatar).toContain("export const STANDARD_CHAT_COMPANION_EVENT = 'lastbrowser:standard-chat-companion';");
    expect(avatar).toContain('window.dispatchEvent(new CustomEvent(STANDARD_CHAT_COMPANION_EVENT, { detail: saved }));');
    expect(avatar).toContain('writeStandardChatCompanion(personality, trimmed);');
    expect(source('components/CompanionPicker.tsx')).toContain('export { STANDARD_CHAT_COMPANION_EVENT };');
  });
});
