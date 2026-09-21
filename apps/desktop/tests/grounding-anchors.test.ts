import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHighlightScript,
  jumpToTabAnchor
} from '../src/renderer/grounding-anchors.js';
import {
  detectPageCategory,
  getQuickActionChips,
  executeQuickAction
} from '../src/renderer/quick-actions.js';
import { processRichText } from '../src/renderer/NativeRichText.js';
import { useTabStore } from '../src/renderer/stores/useTabStore.js';

describe('Grounding Anchors & Deep Linking (Phase 10.2)', () => {
  it('generates a robust in-page scroll & 2-second glow highlight script', () => {
    const script = createHighlightScript('M3 MacBook Pro Review');

    expect(script).toContain('(function()');
    expect(script).toContain('"M3 MacBook Pro Review"');
    expect(script).toContain('findTargetElement');
    expect(script).toContain("scrollIntoView({ behavior: 'smooth', block: 'center' })");
    expect(script).toContain('data-lastbrowser-highlight');
    expect(script).toContain('0 0 24px rgba(56, 189, 248, 0.5)');
    expect(script).toContain('2000'); // 2-second timeout before fading
    expect(script).toContain('window.find'); // fallback
  });

  it('handles empty or whitespace snippets safely in script generator', () => {
    const emptyScript = createHighlightScript('');
    expect(emptyScript).toContain('return false;');

    const blankScript = createHighlightScript('   ');
    expect(blankScript).toContain('return false;');
  });

  it('switches to target tab when jumpToTabAnchor is invoked', async () => {
    useTabStore.setState({
      tabs: [
        { id: 'tab-1', url: 'https://example.com/one', title: 'One', incognito: false, isLoading: false, canGoBack: false, canGoForward: false },
        { id: 'tab-2', url: 'https://example.com/two', title: 'Two', incognito: false, isLoading: false, canGoBack: false, canGoForward: false }
      ],
      activeTabId: 'tab-1'
    });

    const switched = await jumpToTabAnchor(2);
    expect(switched).toBe(true);
    expect(useTabStore.getState().activeTabId).toBe('tab-2');
  });

  it('rejects out-of-range tab indices', async () => {
    const switched = await jumpToTabAnchor(99);
    expect(switched).toBe(false);
  });
});

describe('Citation Badge In-Page Attributes', () => {
  it('embeds data-snippet and data-tab-index into rendered citation pills', () => {
    const textWithCitations = 'Details findest du in [Tab 1: Hardware & Performance] und vergleiche mit [Tab 2].';
    const { html } = processRichText(textWithCitations);

    expect(html).toContain('class="tab-citation-pill"');
    expect(html).toContain('data-tab-index="1"');
    expect(html).toContain('data-snippet="Hardware &amp; Performance"');
    expect(html).toContain('Tab 1: Hardware &amp; Performance');

    expect(html).toContain('data-tab-index="2"');
    expect(html).toContain('data-snippet=""');
    expect(html).toContain('Tab 2');
  });
});

describe('Contextual Quick-Action Chips (Phase 10.5)', () => {
  it('accurately classifies developer and code pages', () => {
    expect(detectPageCategory('https://github.com/torvalds/linux')).toBe('code');
    expect(detectPageCategory('https://gitlab.com/group/repo')).toBe('code');
    expect(detectPageCategory('https://developer.mozilla.org/en-US/docs/Web/API/Element')).toBe('code');
    expect(detectPageCategory('https://www.npmjs.com/package/zustand')).toBe('code');
    expect(detectPageCategory('https://example.com/api/v1/reference')).toBe('code');
    expect(detectPageCategory('https://example.com/tutorial', 'React Hooks Documentation')).toBe('code');
  });

  it('accurately classifies tabular, shopping, and data comparison pages', () => {
    expect(detectPageCategory('https://www.amazon.de/dp/B0CX23V25')).toBe('tabular');
    expect(detectPageCategory('https://geizhals.de/apple-macbook-pro')).toBe('tabular');
    expect(detectPageCategory('https://saas-service.com/pricing')).toBe('tabular');
    expect(detectPageCategory('https://benchmarks.example.com/gpu-compare')).toBe('tabular');
    expect(detectPageCategory('https://generic.com/item', 'M3 vs M2 Specs Vergleich')).toBe('tabular');
    expect(detectPageCategory('https://generic.com/data', 'Data', { hasTables: true })).toBe('tabular');
  });

  it('accurately classifies news, blogs, and review articles', () => {
    expect(detectPageCategory('https://www.theverge.com/reviews/m3-macbook-pro')).toBe('news');
    expect(detectPageCategory('https://techcrunch.com/2024/01/15/ai-announcements')).toBe('news');
    expect(detectPageCategory('https://www.spiegel.de/netzwelt/web/artikel-12345.html')).toBe('news');
    expect(detectPageCategory('https://newsletter.substack.com/p/ai-trends')).toBe('news');
    expect(detectPageCategory('https://somewhere.com/post/my-thoughts')).toBe('news');
  });

  it('returns general category for plain or unclassified URLs', () => {
    expect(detectPageCategory('https://example.com')).toBe('general');
    expect(detectPageCategory('')).toBe('general');
  });

  it('provides contextual quick-action chips for each category', () => {
    const codeChips = getQuickActionChips('code');
    expect(codeChips.some((c) => c.label.includes('Code extrahieren'))).toBe(true);
    expect(codeChips.some((c) => c.label.includes('TL;DR'))).toBe(true);

    const tableChips = getQuickActionChips('tabular');
    expect(tableChips.some((c) => c.label.includes('Tabellen exportieren'))).toBe(true);
    expect(tableChips.some((c) => c.label.includes('TL;DR'))).toBe(true);

    const newsChips = getQuickActionChips('news');
    expect(newsChips.some((c) => c.label.includes('TL;DR'))).toBe(true);
    expect(newsChips.some((c) => c.label.includes('Gegenargumente'))).toBe(true);

    const generalChips = getQuickActionChips('general');
    expect(generalChips.length).toBeGreaterThan(0);
    expect(generalChips[0].label).toContain('TL;DR');
  });

  it('executes quick-action and formats context block with prepared prompt', async () => {
    const sendPromptMock = vi.fn();
    const testTab = {
      id: 'tab-1',
      url: 'https://store.example.com/prices',
      title: 'Preisübersicht Notebooks'
    };

    const chip = {
      id: 'export-tables',
      category: 'tabular' as const,
      label: '📊 Tabellen exportieren',
      icon: '📊',
      tooltip: 'Export',
      promptTemplate: 'Extrahiere alle Tabellen und Zahlen als Markdown.'
    };

    // Mock window.lastbrowser.tabIntelligence
    const originalWindow = globalThis.window;
    (globalThis as any).window = {
      lastbrowser: {
        tabIntelligence: {
          extractActive: vi.fn().mockResolvedValue({
            markdown: '| Laptop | Preis |\n|---|---|\n| M3 | 1599€ |'
          })
        }
      }
    };

    await executeQuickAction(chip, testTab, sendPromptMock);

    expect(sendPromptMock).toHaveBeenCalledTimes(1);
    const sentPrompt = sendPromptMock.mock.calls[0][0];

    expect(sentPrompt).toContain('<context_tabs count="1">');
    expect(sentPrompt).toContain('## [Tab 1: Preisübersicht Notebooks](https://store.example.com/prices)');
    expect(sentPrompt).toContain('| Laptop | Preis |');
    expect(sentPrompt).toContain('</context_tabs>');
    expect(sentPrompt).toContain('Extrahiere alle Tabellen und Zahlen als Markdown.');

    globalThis.window = originalWindow;
  });
});
