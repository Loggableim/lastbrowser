export const hiddenWebviewScrollbarsCss = `
  html {
    scrollbar-width: none !important;
  }

  body {
    -ms-overflow-style: none !important;
  }

  ::-webkit-scrollbar {
    width: 0 !important;
    height: 0 !important;
    display: none !important;
  }
`;

export async function hideWebviewScrollbars(webview: Electron.WebviewTag | null): Promise<void> {
  if (!webview || typeof webview.insertCSS !== 'function') return;
  await webview.insertCSS(hiddenWebviewScrollbarsCss);
}

export async function annotateWebviewViewport(webview: Electron.WebviewTag | null): Promise<void> {
  if (!webview || typeof webview.executeJavaScript !== 'function') return;
  await webview.executeJavaScript(`(() => {
    try {
      const id = 'lastbrowser-webview-viewport-debug';
      const existing = document.getElementById(id);
      if (existing) existing.remove();
      const badge = document.createElement('div');
      badge.id = id;
      badge.textContent = window.innerWidth + ' x ' + window.innerHeight;
      badge.style.cssText = [
        'position: fixed',
        'right: 8px',
        'bottom: 8px',
        'z-index: 2147483647',
        'padding: 4px 8px',
        'border-radius: 999px',
        'background: rgba(7, 17, 31, 0.88)',
        'border: 1px solid rgba(0, 217, 255, 0.45)',
        'color: #00d9ff',
        'font: 12px/1 Inter, Segoe UI, sans-serif',
        'pointer-events: none'
      ].join(';');
      document.documentElement.appendChild(badge);
    } catch (error) {
      console.error(error);
    }
  })();`);
}
