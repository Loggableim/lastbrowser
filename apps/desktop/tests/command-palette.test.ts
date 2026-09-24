import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchBrowserShortcut } from '../src/main/shortcuts.js';
import { usePanelStore } from '../src/renderer/stores/usePanelStore.js';
import { buildSidekickCliCommands } from '../src/renderer/components/CommandPalette.js';

describe('Universal Command Palette (Phase 7.3 & 10.4 & Paket 1.2)', () => {
  describe('shortcut matching', () => {
    it('matches Ctrl+K and Cmd+K to toggle-command-palette', () => {
      expect(matchBrowserShortcut({ type: 'keyDown', key: 'k', control: true })).toEqual({
        action: 'toggle-command-palette'
      });
      expect(matchBrowserShortcut({ type: 'keyDown', key: 'K', control: true })).toEqual({
        action: 'toggle-command-palette'
      });
      expect(matchBrowserShortcut({ type: 'keyDown', key: 'k', meta: true })).toEqual({
        action: 'toggle-command-palette'
      });
      expect(matchBrowserShortcut({ type: 'keyDown', key: 'K', meta: true })).toEqual({
        action: 'toggle-command-palette'
      });
    });

    it('does not trigger with Shift or Alt pressed', () => {
      expect(matchBrowserShortcut({ type: 'keyDown', key: 'k', control: true, shift: true })).toBeNull();
      expect(matchBrowserShortcut({ type: 'keyDown', key: 'k', control: true, alt: true })).toBeNull();
    });
  });

  describe('usePanelStore command palette state', () => {
    beforeEach(() => {
      usePanelStore.setState({ commandPaletteOpen: false });
    });

    it('toggles commandPaletteOpen state', () => {
      expect(usePanelStore.getState().commandPaletteOpen).toBe(false);

      usePanelStore.getState().toggleCommandPalette();
      expect(usePanelStore.getState().commandPaletteOpen).toBe(true);

      usePanelStore.getState().toggleCommandPalette();
      expect(usePanelStore.getState().commandPaletteOpen).toBe(false);
    });

    it('sets commandPaletteOpen explicitly', () => {
      usePanelStore.getState().setCommandPaletteOpen(true);
      expect(usePanelStore.getState().commandPaletteOpen).toBe(true);

      usePanelStore.getState().setCommandPaletteOpen(false);
      expect(usePanelStore.getState().commandPaletteOpen).toBe(false);

      usePanelStore.getState().setCommandPaletteOpen((prev) => !prev);
      expect(usePanelStore.getState().commandPaletteOpen).toBe(true);
    });
  });

  describe('buildSidekickCliCommands (Paket 1.2)', () => {
    it('generates at least 38 Sidekick CLI administrative subcommands', () => {
      const mockSetActivePanel = vi.fn();
      const commands = buildSidekickCliCommands(mockSetActivePanel);

      expect(commands.length).toBeGreaterThanOrEqual(38);

      for (const cmd of commands) {
        expect(cmd.id).toMatch(/^sidekick-cli-/);
        expect(cmd.category).toBe('Sidekick CLI');
        expect(cmd.title).toMatch(/^> Sidekick:/);
        expect(cmd.description).toBeTruthy();
        expect(cmd.icon).toBeDefined();
        expect(Array.isArray(cmd.keywords)).toBe(true);
        expect(cmd.keywords!.length).toBeGreaterThan(0);
        expect(typeof cmd.action).toBe('function');
      }
    });

    it('contains all required key commands: fix, doctor, supermemory index/dump, mcp, gateway, config, token count', () => {
      const mockSetActivePanel = vi.fn();
      const commands = buildSidekickCliCommands(mockSetActivePanel);
      const commandIds = new Set(commands.map((c) => c.id));

      const requiredIds = [
        'sidekick-cli-fix',
        'sidekick-cli-doctor',
        'sidekick-cli-supermemory-index',
        'sidekick-cli-supermemory-dump',
        'sidekick-cli-mcp-list',
        'sidekick-cli-mcp-tools',
        'sidekick-cli-config-show',
        'sidekick-cli-config-edit',
        'sidekick-cli-config-set',
        'sidekick-cli-gateway-start',
        'sidekick-cli-gateway-stop',
        'sidekick-cli-gateway-status',
        'sidekick-cli-gateway-restart',
        'sidekick-cli-gateway-install',
        'sidekick-cli-token-count',
        'sidekick-cli-rag-update',
        'sidekick-cli-model-list',
        'sidekick-cli-model-switch',
        'sidekick-cli-fallback-list',
        'sidekick-cli-sessions-list',
        'sidekick-cli-sessions-browse',
        'sidekick-cli-sessions-rename',
        'sidekick-cli-auth-status',
        'sidekick-cli-auth-list',
        'sidekick-cli-auth-reset',
        'sidekick-cli-auth-logout',
        'sidekick-cli-cron-list',
        'sidekick-cli-cron-status',
        'sidekick-cli-cron-pause',
        'sidekick-cli-cron-resume',
        'sidekick-cli-logs-tail',
        'sidekick-cli-logs-errors',
        'sidekick-cli-backup-create',
        'sidekick-cli-backup-restore',
        'sidekick-cli-checkpoints-list',
        'sidekick-cli-checkpoints-rollback',
        'sidekick-cli-skills-list',
        'sidekick-cli-kanban-diagnostics',
        'sidekick-cli-insights-report',
        'sidekick-cli-version'
      ];

      for (const id of requiredIds) {
        expect(commandIds.has(id)).toBe(true);
      }
    });

    it('executes actions without errors and routes to expected panels or events', () => {
      const mockSetActivePanel = vi.fn();
      const commands = buildSidekickCliCommands(mockSetActivePanel);

      const doctorCmd = commands.find((c) => c.id === 'sidekick-cli-doctor');
      expect(doctorCmd).toBeDefined();
      doctorCmd!.action();
      expect(mockSetActivePanel).toHaveBeenCalledWith('settings');

      const kanbanCmd = commands.find((c) => c.id === 'sidekick-cli-kanban-diagnostics');
      expect(kanbanCmd).toBeDefined();
      kanbanCmd!.action();
      expect(mockSetActivePanel).toHaveBeenCalledWith('kanban');

      const sessionsCmd = commands.find((c) => c.id === 'sidekick-cli-sessions-list');
      expect(sessionsCmd).toBeDefined();
      sessionsCmd!.action();
      expect(mockSetActivePanel).toHaveBeenCalledWith('chat');
    });
  });
});

