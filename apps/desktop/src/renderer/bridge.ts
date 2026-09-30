export type SidekickActionId = 'summarize-page' | 'explain-selection' | 'research-page';

export type ExtensionSource = 'store' | 'unpacked' | 'preset';

export type ExtensionRecord = {
  id: string;
  name: string;
  version: string;
  description: string;
  iconDataUrl?: string;
  path: string;
  enabled: boolean;
  manifestVersion: number;
  source: ExtensionSource;
  installTime: number;
  allowInIncognito: boolean;
  permissions?: string[];
  homepageUrl?: string;
};

export type ExtensionPreset = {
  id: string;
  name: string;
  cwsId: string;
  category: string;
  description: string;
  author: string;
  badge?: string;
  icon: string;
  homepageUrl?: string;
};

export type BrowserContextPayload = {
  url: string;
  title: string;
  selectedText: string;
  pageText: string;
};

export type TeamworkGroundingContext = {
  url: string;
  title: string;
  snippet: string;
};

export type SidekickPromptResult =
  | { ok: true; prompt: string; title: string }
  | { ok: false; reason: string };

export const sidekickActionLabels: Record<SidekickActionId, string> = {
  'summarize-page': 'Summarize Page',
  'explain-selection': 'Explain Selection',
  'research-page': 'Research This Page'
};

export function clampContextText(text: string, maxLength = 6000): string {
  const normalized = String(text || '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}…`;
}

/** Build a compact Teamwork context record without URL query/fragment data or full-page text. */
export function createTeamworkGroundingContext(
  url: string,
  title: string,
  snippet: string,
): TeamworkGroundingContext {
  let safeUrl = '';
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      parsed.username = '';
      parsed.password = '';
      parsed.search = '';
      parsed.hash = '';
      safeUrl = parsed.toString().slice(0, 2000);
    }
  } catch {
    safeUrl = '';
  }
  return {
    url: safeUrl,
    title: clampContextText(String(title || '').replace(/[\u0000-\u001f\u007f]/g, ' '), 240),
    snippet: clampContextText(String(snippet || '').replace(/[\u0000-\u001f\u007f]/g, ' '), 1800),
  };
}

/** Read only the selected text or a short excerpt from visible viewport paragraphs. */
export async function collectTeamworkGroundingContext(
  webview: Electron.WebviewTag | null,
  activeTab: { url: string; title: string },
): Promise<TeamworkGroundingContext> {
  const url = webview && typeof webview.getURL === 'function' ? webview.getURL() : activeTab.url;
  const title = webview && typeof webview.getTitle === 'function' ? webview.getTitle() : activeTab.title;
  if (!webview) return createTeamworkGroundingContext(url, title, '');

  const visibleExcerpt = `(() => {
    const selected = String(window.getSelection ? window.getSelection().toString() : '').trim();
    if (selected) return selected.slice(0, 1800);
    const viewportCenter = window.innerHeight / 2;
    const items = Array.from(document.querySelectorAll('h1,h2,h3,p,li,blockquote'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0
          || rect.bottom <= 0 || rect.top >= window.innerHeight || rect.width <= 0 || rect.height <= 0) return null;
        const text = String(element.innerText || '').replace(/\\s+/g, ' ').trim();
        if (!text) return null;
        return { text, distance: Math.abs((rect.top + rect.bottom) / 2 - viewportCenter) };
      })
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance);
    let excerpt = '';
    for (const item of items) {
      const part = item.text.slice(0, 420);
      const next = excerpt ? excerpt + '\\n' + part : part;
      if (next.length > 1800) {
        excerpt = next.slice(0, 1800);
        break;
      }
      excerpt = next;
      if (excerpt.length >= 1400) break;
    }
    return excerpt;
  })()`;
  const result = await webview.executeJavaScript(visibleExcerpt, true).catch(() => '');
  return createTeamworkGroundingContext(url, title, String(result || ''));
}

export function buildSidekickPrompt(action: SidekickActionId, context: BrowserContextPayload): SidekickPromptResult {
  const title = context.title.trim() || 'Untitled page';
  const url = context.url.trim() || 'unknown';
  const selectedText = clampContextText(context.selectedText, 2400);
  const pageText = clampContextText(context.pageText, 6000);
  const header = `URL: ${url}\nTitle: ${title}`;

  if (action === 'explain-selection') {
    if (!selectedText) {
      return {
        ok: false,
        reason: 'Select text in the active tab before asking Sidekick to explain it.'
      };
    }
    return {
      ok: true,
      title: sidekickActionLabels[action],
      prompt: `Explain the selected text from the active browser page in clear, practical language.\n\n${header}\n\nSelected text:\n${selectedText}`
    };
  }

  if (action === 'research-page') {
    return {
      ok: true,
      title: sidekickActionLabels[action],
      prompt: `Research this active browser page. Use the page context to identify what matters, what might be missing, and useful next questions.\n\n${header}\n\nVisible page text:\n${pageText || '(No readable page text was available.)'}`
    };
  }

  return {
    ok: true,
    title: sidekickActionLabels[action],
    prompt: `Summarize the active browser page. Keep it concise, include key points, and call out anything actionable.\n\n${header}\n\nVisible page text:\n${pageText || '(No readable page text was available.)'}`
  };
}

/**
 * Pull the last assistant message out of a session payload.
 *
 * The chat UI needs this after a turn finishes: the pending placeholder must be
 * replaced with the real answer, not a fixed string. Returns '' when the session
 * has no assistant message yet.
 */
export function lastAssistantText(session: unknown): string {
  const record = (session || {}) as { messages?: Array<{ role?: string; content?: string; _error?: boolean }> };
  const messages = Array.isArray(record.messages) ? record.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && message.role === 'assistant' && message._error !== true &&
        typeof message.content === 'string' && message.content.trim()) {
      return message.content.trim();
    }
  }
  return '';
}

/**
 * Resolve a usable model id when nothing is configured in the setup state.
 *
 * The first-run wizard is skippable, so `setupState.model` is often empty. The
 * backend then picks a stale catalog entry instead of the provider default —
 * observed as "Ring-2.6-1T is no longer available as a free model". This asks
 * the WebUI for the configured default and falls back to the first model of the
 * active provider.
 */
export async function resolveConfiguredModel(
  requestWebui: (request: { method: 'GET'; path: string }) => Promise<unknown>
): Promise<string> {
  try {
    const data = (await requestWebui({ method: 'GET', path: '/api/models' })) as {
      default_model?: string;
      active_provider?: string;
      groups?: Array<{ provider?: string; provider_id?: string; models?: Array<{ id?: string }> }>;
    };
    const configured = typeof data?.default_model === 'string' ? data.default_model.trim() : '';
    if (configured) return configured;
    const groups = Array.isArray(data?.groups) ? data.groups : [];
    const activeProvider = typeof data?.active_provider === 'string'
      ? data.active_provider.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
      : '';
    const activeGroup = activeProvider
      ? groups.find((group) => [group?.provider_id, group?.provider].some((provider) => (
        typeof provider === 'string' && provider.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === activeProvider
      )))
      : undefined;
    // If the backend identifies an active provider, only use its models. An
    // unmatched provider intentionally yields no renderer fallback so the
    // backend can resolve its own default instead of receiving another
    // provider's model id.
    const fallbackGroups = activeProvider ? (activeGroup ? [activeGroup] : []) : groups;
    for (const group of fallbackGroups) {
      const models = Array.isArray(group?.models) ? group.models : [];
      const first = models.find((model) => typeof model?.id === 'string' && model.id.trim());
      if (first?.id) return first.id.trim();
    }
    return '';
  } catch {
    return '';
  }
}

export async function collectBrowserContext(
  webview: Electron.WebviewTag | null,
  activeTab: { url: string; title: string }
): Promise<BrowserContextPayload> {
  if (!webview) {
    return {
      url: activeTab.url,
      title: activeTab.title,
      selectedText: '',
      pageText: ''
    };
  }

  const page = await webview.executeJavaScript(`(() => {
    const selection = String(window.getSelection ? window.getSelection().toString() : '');
    const text = String(document.body && document.body.innerText ? document.body.innerText : '');
    return { selectedText: selection, pageText: text };
  })()`, true).catch(() => ({ selectedText: '', pageText: '' }));

  const getUrl = typeof webview.getURL === 'function' ? webview.getURL() : activeTab.url;
  const getTitle = typeof webview.getTitle === 'function' ? webview.getTitle() : activeTab.title;

  return {
    url: getUrl || activeTab.url,
    title: getTitle || activeTab.title,
    selectedText: clampContextText(String(page?.selectedText || ''), 2400),
    pageText: clampContextText(String(page?.pageText || ''), 9000)
  };
}
