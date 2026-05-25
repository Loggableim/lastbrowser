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
