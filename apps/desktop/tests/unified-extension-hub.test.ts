import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchBrowserShortcut } from '../src/main/shortcuts.js';
import { usePanelStore } from '../src/renderer/stores/usePanelStore.js';
import {
  BUILTIN_MCP_SKILLS,
  MCP_PERMISSION_LABELS
} from '../src/renderer/components/UnifiedExtensionHub.js';

function readRendererFile(fileName: string): string {
  return readFileSync(path.resolve(process.cwd(), 'src/renderer', fileName), 'utf8');
}

describe('Phase 14: Unified Extension & Skill Hub (Zwei-Säulen-Architektur)', () => {
  describe('1. Globaler Shortcut & Central Entry Point', () => {
    it('maps Ctrl+Shift+X and Cmd+Shift+X to open-extensions action', () => {
      expect(matchBrowserShortcut({ type: 'keyDown', key: 'x', control: true, shift: true })).toEqual({
        action: 'open-extensions'
      });
      expect(matchBrowserShortcut({ type: 'keyDown', key: 'X', meta: true, shift: true })).toEqual({
        action: 'open-extensions'
      });
    });

    it('manages extensionHubOpen and extensionHubTab in usePanelStore', () => {
      const store = usePanelStore.getState();

      expect(store.extensionHubOpen).toBe(false);
      expect(store.extensionHubTab).toBe('webextensions');

      // Open and toggle hub
      store.setExtensionHubOpen(true);
      expect(usePanelStore.getState().extensionHubOpen).toBe(true);

      store.toggleExtensionHub();
      expect(usePanelStore.getState().extensionHubOpen).toBe(false);

      // Switch pillar tabs
      store.setExtensionHubTab('skills');
      expect(usePanelStore.getState().extensionHubTab).toBe('skills');

      store.setExtensionHubTab('webextensions');
      expect(usePanelStore.getState().extensionHubTab).toBe('webextensions');
    });

    it('integrates UnifiedExtensionHub into App.tsx and listens to open-extensions', () => {
      const source = readRendererFile('App.tsx');
      expect(source).toContain('UnifiedExtensionHub');
      expect(source).toContain("case 'open-extensions':");
      expect(source).toContain('toggleExtensionHub()');
      expect(source).toContain('setExtensionHubOpen(true)');
      expect(source).toContain('open={extensionHubOpen}');
    });

    it('integrates Extension & Skill Hub into SidekickSidebar.tsx drawer and shortcuts', () => {
      const source = readRendererFile('components/SidekickSidebar.tsx');
      expect(source).toContain('Extension & Skill Hub');
      expect(source).toContain('Ctrl+Shift+X');
      expect(source).toContain('onOpenExtensions');
    });
  });

  describe('2. Säule 1: Chrome MV3 WebExtensions & CRX3 Engine', () => {
    it('implements Pillar 1 UI with CWS installer, presets, and unpacked loader', () => {
      const source = readRendererFile('components/UnifiedExtensionHub.tsx');

      // Pillar 1 header & showcase
      expect(source).toContain('Web-Erweiterungen (Chrome MV3)');
      expect(source).toContain('Kuratierter 1-Klick Showcase');
      expect(source).toContain('handleInstallPreset');

      // Chrome Web Store direct install & Unpacked
      expect(source).toContain('handleInstallCws');
      expect(source).toContain('cws-url-form');
      expect(source).toContain('handleInstallUnpacked');
      expect(source).toContain('Entpackte Erweiterung laden...');

      // Management switches
      expect(source).toContain('handleToggleExtension');
      expect(source).toContain('handleToggleIncognito');
      expect(source).toContain('handleRemoveExtension');
      expect(source).toContain('ext-workspace-select');
    });
  });

  describe('3. Säule 2: Nova AI Skills & Model Context Protocol (MCP)', () => {
    it('defines curated built-in MCP skills with security permissions and workspace scopes', () => {
      expect(BUILTIN_MCP_SKILLS.length).toBeGreaterThanOrEqual(6);

      const skillIds = BUILTIN_MCP_SKILLS.map((s) => s.id);
      expect(skillIds).toContain('mcp-terminal');
      expect(skillIds).toContain('mcp-supermemory');
      expect(skillIds).toContain('mcp-scraper');
      expect(skillIds).toContain('mcp-devtools');
      expect(skillIds).toContain('mcp-comfyui');
      expect(skillIds).toContain('mcp-fs');

      // Terminal executor permissions & scope
      const terminalSkill = BUILTIN_MCP_SKILLS.find((s) => s.id === 'mcp-terminal');
      expect(terminalSkill?.permissions).toContain('terminal_execute');
      expect(terminalSkill?.permissions).toContain('filesystem_write');
      expect(terminalSkill?.workspaceScope).toBe('coding');
      expect(terminalSkill?.autoApprove).toBe(false); // Security-first: Human-in-the-loop

      // Supermemory permissions & scope
      const memorySkill = BUILTIN_MCP_SKILLS.find((s) => s.id === 'mcp-supermemory');
      expect(memorySkill?.permissions).toContain('read_only');
      expect(memorySkill?.permissions).toContain('filesystem_write');
      expect(memorySkill?.workspaceScope).toBe('recherche');

      // ComfyUI permissions & scope
      const comfySkill = BUILTIN_MCP_SKILLS.find((s) => s.id === 'mcp-comfyui');
      expect(comfySkill?.permissions).toContain('network_outbound');
      expect(comfySkill?.permissions).toContain('agent_autonomy');
      expect(comfySkill?.workspaceScope).toBe('design');
    });

    it('defines transparent permission classifications across all 5 categories', () => {
      expect(MCP_PERMISSION_LABELS.read_only.level).toBe('safe');
      expect(MCP_PERMISSION_LABELS.filesystem_write.level).toBe('warn');
      expect(MCP_PERMISSION_LABELS.terminal_execute.level).toBe('danger');
      expect(MCP_PERMISSION_LABELS.network_outbound.level).toBe('warn');
      expect(MCP_PERMISSION_LABELS.agent_autonomy.level).toBe('warn');
    });

    it('implements Pillar 2 UI with MCP servers config, search, and sandboxing toggles', () => {
      const source = readRendererFile('components/UnifiedExtensionHub.tsx');

      expect(source).toContain('Nova AI Skills & Tools (MCP)');
      expect(source).toContain('mcp_servers.json');
      expect(source).toContain('mcp-json-editor');
      expect(source).toContain('Granulares Sandboxing & Berechtigungsmanagement');
      expect(source).toContain('auto-approve-toggle');
      expect(source).toContain('Interaktiv bestätigen');
      expect(source).toContain('Immer vertrauen (Auto-Approve)');
      expect(source).toContain('skills-scope-chips');
    });
  });
});
