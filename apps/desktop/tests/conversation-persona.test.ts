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
    expect(sidebar).not.toContain('writeQuickChatCompanion');
    expect(sidebar).not.toContain('lastbrowser.quickChatCompanion.v1');
  });

  it('writes a quickchat persona only to the quickchat key', () => {
    const picker = source('components/CompanionPicker.tsx');
    expect(picker).toContain("const QUICK_CHAT_COMPANION_KEY = 'lastbrowser.quickChatCompanion.v1';");
    expect(picker).toContain('export function readQuickChatCompanion');
    expect(picker).toContain('export function writeQuickChatCompanion');
    expect(picker).toContain('export function useQuickChatCompanion');
    expect(picker).toContain("target = 'standard'");
    const save = picker.slice(picker.indexOf("if (target === 'quickchat')"));
    expect(save.startsWith("if (target === 'quickchat') writeQuickChatCompanion(draft.personality, botNameToSave);")).toBe(true);
    expect(save).toContain('else void companion.setSelection(draft.personality, botNameToSave);');
    expect(picker).not.toContain('writeStandardChatCompanion(draft');
    const split = source('components/CopilotSplitView.tsx');
    expect(split).toContain('<CompanionSwitch target="quickchat" conversation={conversationCompanion} />');
    expect(split).toContain('useQuickChatCompanion()');
    expect(split).toContain('conversationCompanion ?? quickCompanion');
    const app = source('App.tsx');
    expect(app).toContain('const quickCompanion = readQuickChatCompanion();');
    expect(app).toContain('companion: { personality: quickCompanion.personality, botName: quickCompanion.botName }');
  });

  it('names the active sidekick at the top of the AI drawer', () => {
    const sidebar = source('components/SidekickSidebar.tsx');
    const drawer = sidebar.slice(sidebar.indexOf('{/* AI Drawer Items */}'));
    const sidekick = drawer.indexOf('className="sidebar-active-sidekick"');
    expect(sidekick).toBeGreaterThan(-1);
    expect(sidekick).toBeLessThan(drawer.indexOf("t('sidebar.drawer.recentSessions')"));
    expect(sidekick).toBeLessThan(drawer.indexOf('className="drawer-cards-list"'));
    expect(drawer).toContain("t('sidebar.companion.active')");
    expect(drawer).toContain('<div className="sidebar-active-sidekick-name">{activeChatName}</div>');
    expect(drawer).toContain('label={activeChatName}');
    expect(drawer).not.toContain('{activeChatName} AI');
  });

  it('names the open conversation in the native header and the composer', () => {
    const nativeChat = source('panels/NativeChatMain.tsx');
    expect(nativeChat).toContain('conversationCompanionAppearance(activeSession?.companion)');
    expect(nativeChat).toContain('conversationCompanion={conversationCompanion}');
  });
});
