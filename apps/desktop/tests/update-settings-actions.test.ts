import React, { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createDesktopI18n, desktopLocaleIds } from '../src/renderer/i18n.js';
import { UpdateNowButton } from '../src/renderer/components/UpdateNowButton.js';
import { installDownloadedUpdate, observeDesktopUpdateStatus, type DesktopUpdateStatus } from '../src/renderer/update-settings-actions.js';

function status(state: DesktopUpdateStatus['state']): DesktopUpdateStatus {
  return {
    state,
    currentVersion: '0.1.45',
    availableVersion: state === 'downloaded' ? '0.1.46' : null,
    percent: state === 'downloaded' ? 100 : null,
    lastCheckedAt: null,
    message: null
  };
}

function buttonMarkup(updateStatus: DesktopUpdateStatus, pending = false): string {
  return renderToStaticMarkup(createElement(UpdateNowButton, {
    status: updateStatus, pending, label: 'Update now', onInstall: () => {}
  }));
}

function installer(getStatus: () => DesktopUpdateStatus | null, install: () => Promise<DesktopUpdateStatus>) {
  const pending = { current: false };
  const setPending = vi.fn((value: boolean) => { pending.current = value; });
  const setError = vi.fn();
  return {
    pending,
    setPending,
    setError,
    run: () => installDownloadedUpdate({
      getStatus, install, pending, setPending, setError,
      formatError: (error) => `Installer failed: ${error instanceof Error ? error.message : String(error)}`,
      formatUnavailable: () => 'The downloaded update is no longer ready.'
    })
  };
}

describe('settings update status and install action', () => {
  it('provides all visible update-button and error copy in all eight shipped locales', () => {
    for (const locale of desktopLocaleIds) {
      const i18n = createDesktopI18n(locale);
      expect(i18n.t('settings.panels.system.updateNow'), locale).not.toBe('settings.panels.system.updateNow');
      expect(i18n.t('settings.panels.system.updateInstallFailed'), locale).not.toBe('settings.panels.system.updateInstallFailed');
      expect(i18n.t('settings.panels.system.updateInstallUnavailable'), locale).not.toBe('settings.panels.system.updateInstallUnavailable');
      expect(i18n.t('settings.panels.system.updateStatusLoading'), locale).not.toBe('settings.panels.system.updateStatusLoading');
      expect(i18n.t('settings.panels.system.updateStatusUnavailable'), locale).not.toBe('settings.panels.system.updateStatusUnavailable');
    }
  });

  it('wires the settings action to the desktop install IPC without a Sidekick readiness gate', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/panels/SystemPanels.tsx'), 'utf8');
    expect(source).toContain("install: () => window.lastbrowser.updates.install()");
    expect(source).toContain("getStatus: () => updateStatusRef.current");
    expect(source).toContain('<UpdateNowButton status={updateStatus}');
    expect(source).not.toContain('disabled={!ready || updateInstallPending}');
  });

  it('renders a primary action only when the desktop updater says the update is downloaded', () => {
    for (const state of ['idle', 'available', 'downloading', 'error', 'not-available', 'disabled'] as const) {
      expect(buttonMarkup(status(state))).toBe('');
    }
    const html = buttonMarkup(status('downloaded'));
    expect(html).toContain('primary-action');
    expect(html).toContain('Update now');
    expect(html).not.toContain('disabled=""');
  });

  it('disables the downloaded action while the install request is pending', () => {
    const html = buttonMarkup(status('downloaded'), true);
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
  });

  it('calls the desktop install IPC once for a downloaded update and keeps the action busy', async () => {
    const install = vi.fn(async () => status('downloaded'));
    const action = installer(() => status('downloaded'), install);
    await expect(action.run()).resolves.toBe('started');
    await expect(action.run()).resolves.toBe('busy');
    expect(install).toHaveBeenCalledTimes(1);
    expect(action.pending.current).toBe(true);
  });

  it.each(['idle', 'available', 'downloading', 'error', 'not-available', 'disabled'] as const)(
    'does not invoke install while updater state is %s', async (state) => {
      const install = vi.fn(async () => status('downloaded'));
      const action = installer(() => status(state), install);
      await expect(action.run()).resolves.toBe('not-downloaded');
      expect(install).not.toHaveBeenCalled();
      expect(action.pending.current).toBe(false);
    }
  );

  it('shows the actual IPC failure and releases the busy guard for retry', async () => {
    const action = installer(() => status('downloaded'), async () => { throw new Error('updater channel closed'); });
    await expect(action.run()).resolves.toBe('failed');
    expect(action.setError).toHaveBeenLastCalledWith('Installer failed: updater channel closed');
    expect(action.pending.current).toBe(false);
    expect(action.setPending).toHaveBeenLastCalledWith(false);
  });

  it('reports a live status change instead of acting on a stale downloaded snapshot', async () => {
    let current = status('downloaded');
    const action = installer(() => current, async () => {
      current = status('available');
      return current;
    });
    await expect(action.run()).resolves.toBe('status-changed');
    expect(action.setError).toHaveBeenLastCalledWith('The downloaded update is no longer ready.');
    expect(action.pending.current).toBe(false);
  });

  it('subscribes before reading the initial status and never overwrites a newer live event', async () => {
    let resolveInitial!: (value: DesktopUpdateStatus) => void;
    let emit!: (value: DesktopUpdateStatus) => void;
    const seen: DesktopUpdateStatus[] = [];
    const api = {
      status: vi.fn(() => new Promise<DesktopUpdateStatus>((resolve) => { resolveInitial = resolve; })),
      onStatus: vi.fn((callback: (value: DesktopUpdateStatus) => void) => { emit = callback; return vi.fn(); })
    };
    const unsubscribe = observeDesktopUpdateStatus(api, (value) => seen.push(value), vi.fn());
    emit(status('downloaded'));
    resolveInitial(status('available'));
    await Promise.resolve();
    emit(status('error'));
    expect(seen.map((value) => value.state)).toEqual(['downloaded', 'error']);
    unsubscribe();
  });

  it('uses the current desktop updater snapshot when no live transition has arrived', async () => {
    const seen: DesktopUpdateStatus[] = [];
    const api = {
      status: vi.fn(async () => status('downloaded')),
      onStatus: vi.fn(() => vi.fn())
    };
    observeDesktopUpdateStatus(api, (value) => seen.push(value), vi.fn());
    await Promise.resolve();
    expect(seen.map((value) => value.state)).toEqual(['downloaded']);
  });

  it('keeps the Hub skill cards visible while hiding the ineffective auto-approve control', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/components/UnifiedExtensionHub.tsx'), 'utf8');
    expect(source).toContain('filteredSkills.map((skill)');
    expect(source).toContain('skill.name');
    expect(source).not.toContain('auto-approve-toggle');
    expect(source).not.toContain('Immer vertrauen (Auto-Approve)');
    expect(source).toContain("localStorage.setItem('lastbrowser.mcp_skills.v1', JSON.stringify(next))");
    expect(source).toContain("(s.id === id ? { ...s, ...updates } : s)");
    expect(source).not.toContain("localStorage.removeItem('lastbrowser.mcp_skills.v1')");
  });
});
