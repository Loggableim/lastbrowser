import { useTabStore } from './stores/useTabStore.js';

/**
 * Generates an in-page script to smoothly scroll to and highlight a snippet
 * with a glowing 2-second neon aura inside the guest webview.
 */
export function createHighlightScript(snippet: string): string {
  const sanitizedSnippet = JSON.stringify(snippet || '');

  return `(function() {
  const searchSnippet = ${sanitizedSnippet};
  if (!searchSnippet || typeof searchSnippet !== 'string') return false;
  const clean = searchSnippet.trim();
  if (!clean) return false;

  function findTargetElement() {
    // 1. Try finding by element containing text (case-insensitive)
    const lower = clean.toLowerCase();

    // Check headings, table elements, code and paragraph priority
    const candidates = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, th, td, p, li, blockquote, pre, code, article, section'));
    for (const el of candidates) {
      const text = el.textContent || '';
      if (text.toLowerCase().includes(lower)) {
        return el;
      }
    }

    // 2. TreeWalker fallback for arbitrary text nodes
    try {
      const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeValue && node.nodeValue.toLowerCase().includes(lower)) {
          return node.parentElement;
        }
      }
    } catch {
      // ignore
    }

    return null;
  }

  const target = findTargetElement();
  if (target) {
    try {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {
      target.scrollIntoView();
    }

    const origTransition = target.style.transition;
    const origBoxShadow = target.style.boxShadow;
    const origOutline = target.style.outline;
    const origBg = target.style.backgroundColor;
    const origRadius = target.style.borderRadius;

    target.setAttribute('data-lastbrowser-highlight', 'active');
    target.style.transition = 'all 0.35s ease-in-out';
    target.style.boxShadow = '0 0 0 4px rgba(56, 189, 248, 0.7), 0 0 24px rgba(56, 189, 248, 0.5)';
    target.style.outline = '2px solid #38bdf8';
    target.style.backgroundColor = 'rgba(56, 189, 248, 0.18)';
    target.style.borderRadius = '4px';

    setTimeout(() => {
      target.style.transition = 'all 0.6s ease-out';
      target.style.boxShadow = origBoxShadow;
      target.style.outline = origOutline;
      target.style.backgroundColor = origBg;
      target.style.borderRadius = origRadius;
      setTimeout(() => {
        target.style.transition = origTransition;
        target.removeAttribute('data-lastbrowser-highlight');
      }, 600);
    }, 2000);

    return true;
  } else if (typeof window.find === 'function') {
    // Fallback: window.find scrolls to text selection
    try {
      return window.find(clean, false, false, true, false, true, false);
    } catch {
      return false;
    }
  }

  return false;
})();`;
}

/**
 * Returns the currently mounted <webview> element in the renderer DOM.
 */
export function getActiveWebview(): Electron.WebviewTag | null {
  if (typeof document === 'undefined') return null;
  return (document.querySelector('webview.browser-view') || document.querySelector('webview')) as Electron.WebviewTag | null;
}

/**
 * Switches to a tab by its 1-based index and injects the smooth scroll & highlight
 * script into the webview.
 */
export async function jumpToTabAnchor(tabIndex: number, snippet?: string): Promise<boolean> {
  const { tabs, activeTabId, setActiveTabId } = useTabStore.getState();
  const targetTab = tabs[tabIndex - 1];
  if (!targetTab) return false;

  const needsTabSwitch = targetTab.id !== activeTabId;
  if (needsTabSwitch) {
    setActiveTabId(targetTab.id);
  }

  if (!snippet || !snippet.trim()) {
    return true;
  }

  const cleanSnippet = snippet.trim();
  const script = createHighlightScript(cleanSnippet);

  // If the tab was switched, give React and Electron a brief tick to mount/focus the webview
  const delay = needsTabSwitch ? 180 : 20;

  return new Promise<boolean>((resolve) => {
    setTimeout(() => {
      const webview = getActiveWebview();
      if (!webview) {
        resolve(false);
        return;
      }

      try {
        if (typeof webview.executeJavaScript === 'function') {
          webview.executeJavaScript(script)
            .then((result) => {
              // If in-page highlight didn't find the exact DOM node, trigger findInPage
              if (!result && typeof webview.findInPage === 'function') {
                try {
                  webview.findInPage(cleanSnippet, { forward: true, findNext: false });
                } catch {
                  // ignore
                }
              }
              resolve(Boolean(result));
            })
            .catch(() => {
              if (typeof webview.findInPage === 'function') {
                try {
                  webview.findInPage(cleanSnippet, { forward: true, findNext: false });
                } catch {
                  // ignore
                }
              }
              resolve(false);
            });
        } else if (typeof webview.findInPage === 'function') {
          webview.findInPage(cleanSnippet, { forward: true, findNext: false });
          resolve(true);
        } else {
          resolve(false);
        }
      } catch {
        resolve(false);
      }
    }, delay);
  });
}
