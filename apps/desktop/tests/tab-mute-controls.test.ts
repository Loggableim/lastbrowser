import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { InPageActionBar } from '../src/renderer/components/InPageActionBar.js';
import { DesktopI18nProvider } from '../src/renderer/i18n.js';
import { createTabMuteControl, handleTabMuteShortcut, syncTabMuteToWebview } from '../src/renderer/tab-mute-controls.js';

const actionBarProps = {
  variant: 'topbar' as const,
  onAction: vi.fn(),
  zoomFactor: 1,
  onResetZoom: vi.fn(),
  onFindOpen: vi.fn(),
  downloadsOpen: false,
  onToggleDownloads: vi.fn(),
  historyOpen: false,
  onToggleHistory: vi.fn(),
  dockMode: 'topbar' as const,
  onSetDockMode: vi.fn()
};

describe('tab mute controls', () => {
  it('keeps the action bar, shortcut, and selected tab on one mute handler', () => {
    const toggleTabMute = vi.fn();
    const firstTab = createTabMuteControl({ id: 'tab-a', isMuted: false }, toggleTabMute);
    const markup = renderToStaticMarkup(
      React.createElement(DesktopI18nProvider, null, React.createElement(InPageActionBar, {
        ...actionBarProps,
        muted: firstTab.muted,
        onToggleMute: firstTab.onToggleMute
      }))
    );

    expect(markup).toContain('Tab stummschalten (Ctrl+M)');
    expect(markup).not.toContain('mute-trigger active');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('aria-label="Tab stummschalten"');
    firstTab.onToggleMute();
    expect(toggleTabMute).toHaveBeenCalledExactlyOnceWith('tab-a');

    const preventDefault = vi.fn();
    expect(handleTabMuteShortcut({ ctrlKey: true, metaKey: false, key: 'm', defaultPrevented: false, preventDefault }, firstTab.onToggleMute)).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(toggleTabMute).toHaveBeenCalledTimes(2);

    const secondTab = createTabMuteControl({ id: 'tab-b', isMuted: true }, toggleTabMute);
    expect(secondTab.muted).toBe(true);
    const mutedMarkup = renderToStaticMarkup(
      React.createElement(DesktopI18nProvider, null, React.createElement(InPageActionBar, {
        ...actionBarProps,
        muted: secondTab.muted,
        onToggleMute: secondTab.onToggleMute
      }))
    );
    expect(mutedMarkup).toContain('Tab entstummen (Ctrl+M)');
    expect(mutedMarkup).toContain('aria-pressed="true"');
    expect(mutedMarkup).toContain('mute-trigger active');
    const view = { setAudioMuted: vi.fn() };
    syncTabMuteToWebview(view, secondTab.muted);
    expect(view.setAudioMuted).toHaveBeenCalledExactlyOnceWith(true);
    secondTab.onToggleMute();
    expect(toggleTabMute).toHaveBeenLastCalledWith('tab-b');
  });

  it('ignores unrelated keys and supports the macOS command modifier', () => {
    const toggleMute = vi.fn();
    let defaultPrevented = false;
    const event = {
      ctrlKey: false,
      metaKey: true,
      key: 'M',
      get defaultPrevented() { return defaultPrevented; },
      preventDefault: vi.fn(() => { defaultPrevented = true; })
    };

    expect(handleTabMuteShortcut({ ...event, metaKey: false }, toggleMute)).toBe(false);
    expect(handleTabMuteShortcut(event, toggleMute)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(handleTabMuteShortcut(event, toggleMute)).toBe(false);
    expect(toggleMute).toHaveBeenCalledOnce();
  });

  it('keeps the WebView in the same state as each active tab', () => {
    const view = { setAudioMuted: vi.fn() };

    syncTabMuteToWebview(view, false);
    syncTabMuteToWebview(view, true);

    expect(view.setAudioMuted.mock.calls).toEqual([[false], [true]]);
  });

  it('wires the real browser consumers to the tab control and the same WebView state', () => {
    const app = readFileSync(path.resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
    const actionBar = readFileSync(path.resolve(process.cwd(), 'src/renderer/components/InPageActionBar.tsx'), 'utf8');
    const css = readFileSync(path.resolve(process.cwd(), 'src/renderer/styles.css'), 'utf8');

    expect(app).toContain('() => createTabMuteControl(activeTab, toggleTabMute)');
    expect(app.match(/tabMuteControl=\{tabMuteControl\}/g)).toHaveLength(2);
    expect(app).toContain('muted={tabMuteControl.muted}');
    expect(app).toContain('onToggleMute={tabMuteControl.onToggleMute}');
    expect(app).toContain('handleTabMuteShortcut(event, tabMuteControl.onToggleMute)');
    expect(app).toContain('syncTabMuteToWebview(webviewRef.current, nextMuted)');
    expect(app).toContain('syncTabMuteToWebview(view, activeTab.isMuted)');
    expect(app).not.toContain('muted={false}');
    expect(app).not.toContain('view.setAudioMuted(!view.isAudioMuted())');
    expect(actionBar).toContain('aria-pressed={muted}');
    expect(actionBar).toContain('className={`titlebar-tool-btn mute-trigger ${muted ? \'active\' : \'\'}`}');
    expect(css).toContain('.titlebar-tool-btn.mute-trigger.active');
  });
});
