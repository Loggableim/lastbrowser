export type SidekickActionId = 'summarize-page' | 'explain-selection' | 'research-page';

export type BrowserContextPayload = {
  url: string;
  title: string;
  selectedText: string;
  pageText: string;
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
