// Intelligenter Webview Smart-Invert (docs/visionimpaired.md §7.2, Feature 20).
// Invertiert die Seite, re-invertiert aber Medien (img/video/canvas/svg mit
// Hintergrundbildern), damit Gesichter und Fotos keine Negative werden.
// Muss bei jedem dom-ready erneut injiziert werden — insertCSS überlebt keine
// Navigation.

export const smartInvertWebviewCss = `
  html {
    filter: invert(1) hue-rotate(180deg) !important;
    background-color: #000 !important;
  }
  img,
  video,
  canvas,
  svg:not(.icon),
  [style*="background-image"] {
    filter: invert(1) hue-rotate(180deg) !important;
  }
`;

const insertedCssKeys = new WeakMap<Electron.WebviewTag, string>();

/** Injects the smart-invert stylesheet into a webview guest. Best-effort. */
export async function applySmartInvertToWebview(webview: Electron.WebviewTag | null): Promise<void> {
  if (!webview || typeof webview.insertCSS !== 'function') return;
  if (insertedCssKeys.has(webview)) return;
  try {
    const key = await webview.insertCSS(smartInvertWebviewCss);
    if (key) insertedCssKeys.set(webview, key);
  } catch {
    // Guest not ready or CSP blocked — retry happens on the next dom-ready.
  }
}

/** Remove the injected stylesheet from an existing guest when the user toggles the feature off. */
export async function removeSmartInvertFromWebview(webview: Electron.WebviewTag | null): Promise<void> {
  if (!webview || typeof webview.removeInsertedCSS !== 'function') return;
  const key = insertedCssKeys.get(webview);
  if (!key) return;
  insertedCssKeys.delete(webview);
  try {
    await webview.removeInsertedCSS(key);
  } catch {
    // The document may have navigated and discarded the key already.
  }
}

/** Reconcile the current document after dom-ready, including navigation while disabled. */
export async function refreshSmartInvertForWebview(
  webview: Electron.WebviewTag | null,
  enabled: boolean
): Promise<void> {
  await removeSmartInvertFromWebview(webview);
  if (enabled) await applySmartInvertToWebview(webview);
}
