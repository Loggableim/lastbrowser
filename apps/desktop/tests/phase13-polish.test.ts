import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOP_64_PINNED_APPS } from '../src/renderer/pinned-apps-catalog.js';
import { AVAILABLE_MODELS } from '../src/renderer/components/CopilotSplitView.js';
import { WORKFLOW_TEMPLATES } from '../src/renderer/workflow-templates.js';
import { useChatStore } from '../src/renderer/stores/useChatStore.js';

function readRendererFile(fileName: string): string {
  return readFileSync(path.resolve(process.cwd(), 'src/renderer', fileName), 'utf8');
}

describe('Phase 13 In-App UI Polish: Top-64 Pinned Apps & Universal Model Picker', () => {
  describe('1. Pinned-Apps Top-64 Katalog Integration', () => {
    it('verifies TOP_64_PINNED_APPS contains exactly 64 curated web apps', () => {
      expect(TOP_64_PINNED_APPS.length).toBe(64);

      // Verify category distribution
      const commApps = TOP_64_PINNED_APPS.filter((a) => a.category === 'communication');
      const prodApps = TOP_64_PINNED_APPS.filter((a) => a.category === 'productivity');
      const devApps = TOP_64_PINNED_APPS.filter((a) => a.category === 'developer');
      const mediaApps = TOP_64_PINNED_APPS.filter((a) => a.category === 'media');

      expect(commApps.length).toBe(13);
      expect(prodApps.length).toBe(17);
      expect(devApps.length).toBe(17);
      expect(mediaApps.length).toBe(17);

      // Check key apps mentioned by user
      const appIds = TOP_64_PINNED_APPS.map((a) => a.id);
      expect(appIds).toContain('whatsapp');
      expect(appIds).toContain('discord');
      expect(appIds).toContain('signal');
      expect(appIds).toContain('gmail');
      expect(appIds).toContain('telegram');
      expect(appIds).toContain('github');
      expect(appIds).toContain('chatgpt');
      expect(appIds).toContain('notion');
    });

    it('verifies PinnedAppModal implements category tabs, live search, and custom app tab', () => {
      const source = readRendererFile('components/PinnedAppModal.tsx');

      // Top view tabs
      expect(source).toContain('Top 64 Katalog');
      expect(source).toContain('Benutzerdefinierte App');

      // Category filter tabs matching exact user wording
      expect(source).toContain('Alle (64)');
      expect(source).toContain('Kommunikation (13)');
      expect(source).toContain('Produktivität (17)');
      expect(source).toContain('Entwickler & KI (17)');
      expect(source).toContain('Medien & Social (17)');

      // Live search input
      expect(source).toContain('catalog-search-input');
      expect(source).toContain('searchQuery');
      expect(source).toContain('item.domain.toLowerCase().includes(q)');
      expect(source).toContain('item.description.toLowerCase().includes(q)');

      // Visual badge & 1-click toggling
      expect(source).toContain('catalog-pinned-status-badge');
      expect(source).toContain('Angepinnt');
      expect(source).toContain('handleToggleCatalogApp');

      // Custom app section with name, url, and color palette
      expect(source).toContain('COLOR_PALETTE');
      expect(source).toContain('extractAppDomain');
      expect(source).toContain('getFaviconUrl');
    });
  });

  describe('2. Universeller Modell-Picker in Nova AI', () => {
    it('verifies AVAILABLE_MODELS contains all requested models and categories', () => {
      const modelIds = AVAILABLE_MODELS.map((m) => m.id);

      // Google Gemini CLI models
      expect(modelIds).toContain('gemini-3.8-flash');
      expect(modelIds).toContain('gemini-1.5-pro');
      expect(modelIds).toContain('gemini-1.5-flash');

      // Anthropic models
      expect(modelIds).toContain('claude-3-5-sonnet');
      expect(modelIds).toContain('claude-3-opus');

      // OpenAI models
      expect(modelIds).toContain('gpt-4o');
      expect(modelIds).toContain('gpt-4o-mini');

      // Local models
      expect(modelIds).toContain('ollama-local');

      // Verify default model
      const defaultModel = AVAILABLE_MODELS.find((m) => m.isDefault);
      expect(defaultModel?.id).toBe('gemini-3.8-flash');
      expect(defaultModel?.provider).toBe('Google');
    });

    it('verifies CopilotSplitView unlocks model picker in Header and shows active Gemini account', () => {
      const source = readRendererFile('components/CopilotSplitView.tsx');

      // Header model button
      expect(source).toContain('copilot-header-model-btn');
      expect(source).toContain('copilot-header-model-name');
      expect(source).toContain('renderModelDropdown(\'header\')');

      // Active Gemini account integration
      expect(source).toContain('useGeminiAccountStore');
      expect(source).toContain('currentGeminiAccount');
      expect(source).toContain('gemini-account-badge');

      // Model categories in dropdown
      expect(source).toContain('Google Gemini CLI');
      expect(source).toContain('Anthropic');
      expect(source).toContain('OpenAI');
      expect(source).toContain('Lokale Modelle');

      // Reactive selection
      expect(source).toContain('useChatStore');
      expect(source).toContain('setSelectedModel');
      expect(source).toContain('onSelectModel');
    });

    it('verifies useChatStore manages selectedModel reactively with persistence', () => {
      const store = useChatStore.getState();
      expect(store.selectedModel).toBeDefined();

      store.setSelectedModel('claude-3-5-sonnet');
      expect(useChatStore.getState().selectedModel).toBe('claude-3-5-sonnet');

      store.setSelectedModel('gpt-4o');
      expect(useChatStore.getState().selectedModel).toBe('gpt-4o');

      store.setSelectedModel('gemini-3.8-flash');
      expect(useChatStore.getState().selectedModel).toBe('gemini-3.8-flash');
    });
  });

  describe('3. Workflow-Templates Dropdown', () => {
    it('verifies 48+ curated workflow templates are present and categorized', () => {
      expect(WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(48);

      const categories = new Set(WORKFLOW_TEMPLATES.map((w) => w.category));
      expect(categories.has('research')).toBe(true);
      expect(categories.has('content')).toBe(true);
      expect(categories.has('code')).toBe(true);
      expect(categories.has('data')).toBe(true);
      expect(categories.has('audit')).toBe(true);
    });

    it('verifies CopilotSplitView renders categorized workflow tabs and search', () => {
      const source = readRendererFile('components/CopilotSplitView.tsx');

      expect(source).toContain('copilot-workflows-btn');
      expect(source).toContain('copilot-workflows-dropdown');
      expect(source).toContain('workflow-search-box');
      expect(source).toContain('workflow-search-input');
      expect(source).toContain('workflow-category-tabs');
      expect(source).toContain('Engineering');
      expect(source).toContain('Recherche');
      expect(source).toContain('Content');
      expect(source).toContain('Daten');
    });
  });
});
