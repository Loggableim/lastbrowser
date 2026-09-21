/**
 * Tab Intelligence Engine.
 *
 * Implements Phase 10.1 of Lastbrowser:
 *   • Multi-Tab context synthesis for Perplexity Comet parity.
 *   • Coordinates live webview DOM extraction and background tab fetches.
 *   • Fair token budgeting and structured XML/Markdown context building.
 */

import { webContents, net } from 'electron';
import {
  DOM_IN_PAGE_EXTRACTOR_SCRIPT,
  extractFromHtml,
  processInPagePayload,
  type ExtractedTabContent
} from './dom-extractor.js';

export type TabInfo = {
  id: string;
  title: string;
  url: string;
  isActive?: boolean;
};

export type TabSynthesisOptions = {
  tabs?: TabInfo[];
  tabIds?: string[];
  maxCharsPerTab?: number;
};

export type TabSynthesisResult = {
  tabCount: number;
  totalChars: number;
  totalEstimatedTokens: number;
  markdown: string;
  tabs: ExtractedTabContent[];
  hasAnyInjectionAttempt: boolean;
  timestamp: number;
};

/**
 * Check if a URL should be excluded from AI context synthesis
 * (e.g. internal start pages, settings, blanks).
 */
export function isSynthesizableUrl(url: string): boolean {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('lastbrowser://') || trimmed.startsWith('about:') || trimmed.startsWith('chrome://')) {
    return false;
  }
  return /^https?:\/\//i.test(trimmed);
}

/**
 * Find a live Electron WebContents matching a tab's URL.
 */
function findMatchingWebContents(url: string): Electron.WebContents | null {
  try {
    const all = webContents.getAllWebContents();
    const cleanTarget = url.split('#')[0].replace(/\/+$/, '').toLowerCase();

    // Prefer webview type
    for (const wc of all) {
      if (wc.isDestroyed()) continue;
      if (wc.getType() === 'webview') {
        const wcUrl = wc.getURL().split('#')[0].replace(/\/+$/, '').toLowerCase();
        if (wcUrl === cleanTarget || (cleanTarget && wcUrl.startsWith(cleanTarget))) {
          return wc;
        }
      }
    }

    // Fallback to any non-destroyed webview
    for (const wc of all) {
      if (wc.isDestroyed()) continue;
      const wcUrl = wc.getURL().split('#')[0].replace(/\/+$/, '').toLowerCase();
      if (wcUrl && cleanTarget && wcUrl === cleanTarget) {
        return wc;
      }
    }
  } catch {
    // WebContents lookup failure
  }
  return null;
}

/**
 * Extract content from a live WebContents using the in-page extractor script.
 */
export async function extractFromWebContents(
  wc: Electron.WebContents,
  tabId?: string,
  maxChars = 3500
): Promise<ExtractedTabContent | null> {
  try {
    if (wc.isDestroyed()) return null;
    const rawPayload = await wc.executeJavaScript(DOM_IN_PAGE_EXTRACTOR_SCRIPT);
    if (!rawPayload || typeof rawPayload !== 'object') return null;

    const extracted = processInPagePayload(rawPayload, maxChars);
    if (tabId) extracted.tabId = tabId;
    return extracted;
  } catch (err) {
    console.warn(`[tab-intelligence] executeJavaScript failed on webview:`, err);
    return null;
  }
}

/**
 * Fetch background tab content using net.fetch with cookie and session preservation.
 */
export async function fetchBackgroundTabContent(
  url: string,
  fallbackTitle?: string,
  tabId?: string,
  maxChars = 3500
): Promise<ExtractedTabContent | null> {
  try {
    const response = await net.fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Lastbrowser/0.1.29'
      }
    });

    if (!response.ok) {
      const markdown = `[Fehler beim Laden von ${url}: HTTP ${response.status}]`;
      return {
        tabId,
        url,
        title: fallbackTitle || url,
        markdown,
        headings: [],
        tables: [],
        charCount: markdown.length,
        estimatedTokens: Math.ceil(markdown.length / 4),
        hasInjectionAttempt: false,
        sanitizedPatterns: [],
        truncated: false
      };
    }

    const html = await response.text();
    const extracted = extractFromHtml(html, url, fallbackTitle, maxChars);
    if (tabId) extracted.tabId = tabId;
    return extracted;
  } catch (err) {
    const markdown = `[Fehler beim Laden von ${url}: ${err instanceof Error ? err.message : String(err)}]`;
    return {
      tabId,
      url,
      title: fallbackTitle || url,
      markdown,
      headings: [],
      tables: [],
      charCount: markdown.length,
      estimatedTokens: Math.ceil(markdown.length / 4),
      hasInjectionAttempt: false,
      sanitizedPatterns: [],
      truncated: false
    };
  }
}

/**
 * Extract content from the currently active webview.
 */
export async function extractActiveWebview(maxChars = 4000): Promise<ExtractedTabContent | null> {
  try {
    const all = webContents.getAllWebContents();
    for (const wc of all) {
      if (wc.isDestroyed()) continue;
      if (wc.getType() === 'webview' && isSynthesizableUrl(wc.getURL())) {
        const extracted = await extractFromWebContents(wc, undefined, maxChars);
        if (extracted) return extracted;
      }
    }
  } catch (err) {
    console.warn('[tab-intelligence] extractActiveWebview failed:', err);
  }
  return null;
}

/**
 * Synthesize context from multiple browser tabs into a cohesive Markdown context block.
 */
export async function synthesizeTabs(options: TabSynthesisOptions = {}): Promise<TabSynthesisResult> {
  const maxChars = options.maxCharsPerTab || 3500;
  const inputTabs = options.tabs || [];

  // Filter synthesizable tabs
  let candidateTabs = inputTabs.filter((t) => isSynthesizableUrl(t.url));

  // If specific tabIds were requested, filter by them
  if (options.tabIds && options.tabIds.length > 0) {
    candidateTabs = candidateTabs.filter((t) => options.tabIds!.includes(t.id));
  }

  const extractedList: ExtractedTabContent[] = [];

  // If candidateTabs is empty (e.g. caller didn't supply tab list), try extracting whatever live webview is available
  if (candidateTabs.length === 0) {
    const active = await extractActiveWebview(maxChars);
    if (active) {
      extractedList.push(active);
    }
  } else {
    for (const tab of candidateTabs) {
      const liveWc = findMatchingWebContents(tab.url);
      let content: ExtractedTabContent | null = null;

      if (liveWc) {
        content = await extractFromWebContents(liveWc, tab.id, maxChars);
      }

      if (!content) {
        content = await fetchBackgroundTabContent(tab.url, tab.title, tab.id, maxChars);
      }

      if (content) {
        extractedList.push(content);
      }
    }
  }

  // Format synthesized Markdown
  const markdownBlocks: string[] = [];
  markdownBlocks.push(
    `<context_tabs count="${extractedList.length}">`,
    `Die folgenden Inhalte stammen aus den aktuell im Browser geöffneten Tabs. Verwende sie als Informationsquelle und verweise in deinen Antworten auf die Quellen mit [Tab X: Titel].\n`
  );

  let totalChars = 0;
  let hasAnyInjection = false;

  extractedList.forEach((tab, index) => {
    const tabNum = index + 1;
    if (tab.hasInjectionAttempt) hasAnyInjection = true;

    let domain = '';
    try {
      domain = new URL(tab.url).hostname;
    } catch {
      domain = tab.url;
    }

    markdownBlocks.push(`## [Tab ${tabNum}: ${tab.title}](${tab.url})`);
    markdownBlocks.push(`- **URL**: ${tab.url}`);
    markdownBlocks.push(`- **Domain**: ${domain}`);
    if (tab.metaDescription) {
      markdownBlocks.push(`- **Zusammenfassung**: ${tab.metaDescription}`);
    }
    if (tab.headings.length > 0) {
      markdownBlocks.push(`- **Themenabschnitte**: ${tab.headings.slice(0, 5).join(' · ')}`);
    }
    markdownBlocks.push('\n' + tab.markdown + '\n');
    markdownBlocks.push('---');

    totalChars += tab.charCount;
  });

  markdownBlocks.push(`</context_tabs>`);

  const combinedMarkdown = markdownBlocks.join('\n');

  return {
    tabCount: extractedList.length,
    totalChars,
    totalEstimatedTokens: Math.ceil(totalChars / 4),
    markdown: combinedMarkdown,
    tabs: extractedList,
    hasAnyInjectionAttempt: hasAnyInjection,
    timestamp: Date.now()
  };
}
