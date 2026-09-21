/**
 * Renderer-side Tab Intelligence helper.
 *
 * Integrates useTabStore with window.lastbrowser.tabIntelligence.
 */

import { useTabStore } from './stores/useTabStore.js';

export function hasTabsMention(text: string): boolean {
  return /@tabs\b/i.test(text) || /@tab:\d+\b/i.test(text);
}

export function extractTargetTabNumbers(text: string): number[] {
  const matches = text.match(/@tab:(\d+)\b/gi) || [];
  return matches.map((m) => {
    const num = m.replace(/@tab:/i, '');
    return parseInt(num, 10);
  }).filter((n) => !isNaN(n) && n > 0);
}

/**
 * Synthesize context from the currently open tabs in useTabStore.
 */
export async function synthesizeTabsContext(options?: {
  maxCharsPerTab?: number;
  specificTabIndices?: number[];
}): Promise<TabSynthesisResult | null> {
  if (typeof window === 'undefined' || !window.lastbrowser?.tabIntelligence) {
    return null;
  }

  const { tabs, activeTabId } = useTabStore.getState();

  // Map tabs to lightweight info
  let mappedTabs = tabs.map((t) => ({
    id: t.id,
    title: t.title,
    url: t.url,
    isActive: t.id === activeTabId
  }));

  // If specific tab numbers were requested (e.g. @tab:1 @tab:2)
  if (options?.specificTabIndices && options.specificTabIndices.length > 0) {
    mappedTabs = mappedTabs.filter((_, idx) => options.specificTabIndices!.includes(idx + 1));
  }

  return await window.lastbrowser.tabIntelligence.synthesizeContext({
    tabs: mappedTabs,
    maxCharsPerTab: options?.maxCharsPerTab || 3500
  });
}

/**
 * Attach synthesized tab context to a user prompt.
 */
export function buildPromptWithTabContext(userPrompt: string, contextResult: TabSynthesisResult): string {
  // If user included @tabs, replace with a clean directive
  const cleanPrompt = userPrompt
    .replace(/@tabs\b/gi, '')
    .replace(/@tab:\d+\b/gi, '')
    .trim();

  return `${cleanPrompt}\n\n${contextResult.markdown}`;
}

/**
 * Detect citation pills like [Tab 1: ...] or [Tab 2: ...] in model responses.
 */
export function parseTabCitations(text: string): Array<{
  raw: string;
  tabNumber: number;
  label: string;
}> {
  const regex = /\[Tab\s+(\d+)(?::\s*([^\]]+))?\]/gi;
  const citations: Array<{ raw: string; tabNumber: number; label: string }> = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const tabNumber = parseInt(match[1], 10);
    const label = match[2]?.trim() || `Tab ${tabNumber}`;
    citations.push({
      raw: match[0],
      tabNumber,
      label
    });
  }
  return citations;
}

import { jumpToTabAnchor, createHighlightScript, getActiveWebview } from './grounding-anchors.js';
export { jumpToTabAnchor, createHighlightScript, getActiveWebview };

/**
 * Switch active browser tab by 1-based index (for citation clicking),
 * with optional smooth scroll & highlight grounding anchor.
 */
export function switchTabByIndex(tabNumber: number, snippet?: string): boolean {
  if (snippet) {
    void jumpToTabAnchor(tabNumber, snippet);
    return true;
  }
  const { tabs, setActiveTabId } = useTabStore.getState();
  const target = tabs[tabNumber - 1];
  if (target) {
    setActiveTabId(target.id);
    return true;
  }
  return false;
}
