import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { conversationCompanionAppearance, personalityAvatar } from '../src/renderer/personality-avatar.js';

const source = (file: string) => readFileSync(path.resolve(process.cwd(), 'src/renderer', file), 'utf8');

describe('conversation persona snapshot', () => {
  it('leaves a legacy conversation without a snapshot on the global persona', () => {
    expect(conversationCompanionAppearance(undefined)).toBeNull();
    expect(conversationCompanionAppearance(null)).toBeNull();
    expect(conversationCompanionAppearance({ personality: 'developer' })).toBeNull();
  });

  it('names the persona stored at the start of the conversation', () => {
    expect(conversationCompanionAppearance({ personality: 'developer', botName: ' Patch ' })).toEqual({
      personality: 'developer',
      botName: 'Patch',
      avatar: personalityAvatar('developer'),
    });
  });

  it('ignores snapshots the header cannot show safely', () => {
    expect(conversationCompanionAppearance({ personality: 'unknown', botName: 'Ghost' })).toBeNull();
    expect(conversationCompanionAppearance({ personality: 'mentor', botName: 'bad\u0007name' })).toBeNull();
    expect(conversationCompanionAppearance({ personality: 'mentor', botName: 'x'.repeat(81) })).toBeNull();
  });
});

describe('conversation persona wiring', () => {
  it('saves the sidebar choice through the header save call, not only the local mirror', () => {
    const sidebar = source('components/SidekickSidebar.tsx');
    expect(sidebar).toContain('await companion.setSelection(personality, companionDefaultNames[personality])');
    expect(sidebar).not.toContain('writeStandardChatCompanion');
  });

  it('names the open conversation in the native header and the composer', () => {
    const nativeChat = source('panels/NativeChatMain.tsx');
    expect(nativeChat).toContain('conversationCompanionAppearance(activeSession?.companion)');
    expect(nativeChat).toContain('conversationCompanion={conversationCompanion}');
  });
});
