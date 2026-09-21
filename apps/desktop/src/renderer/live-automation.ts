import { create } from 'zustand';

export type AutomationActionType = 'click' | 'fill' | 'paginate' | 'scroll' | 'discover-forms';

export interface VisualAction {
  type: AutomationActionType;
  selector?: string;
  text?: string;
  value?: string;
  label?: string;
  x?: number;
  y?: number;
}

export interface DiscoveredFormField {
  tag: string;
  type: string;
  name: string;
  id: string;
  placeholder: string;
  label: string;
  currentValue: string;
  required: boolean;
  selector: string;
}

export interface FormDiscoveryResult {
  title: string;
  url: string;
  fields: DiscoveredFormField[];
  hasSubmitButton: boolean;
  submitButtonText: string;
}

export interface LiveAutomationState {
  running: boolean;
  actionLabel: string;
  stepDescription?: string;
  aborted: boolean;
  lastError?: string | null;
}

export interface LiveAutomationStore extends LiveAutomationState {
  discoveredForm: FormDiscoveryResult | null;
  startAction: (label: string, stepDescription?: string) => void;
  updateStep: (stepDescription: string) => void;
  abortAction: () => void;
  finishAction: (error?: string | null) => void;
  setDiscoveredForm: (form: FormDiscoveryResult | null) => void;
}

export const useLiveAutomationStore = create<LiveAutomationStore>((set) => ({
  running: false,
  actionLabel: '',
  stepDescription: '',
  aborted: false,
  lastError: null,
  discoveredForm: null,

  startAction: (actionLabel, stepDescription = '') => {
    set({
      running: true,
      actionLabel,
      stepDescription,
      aborted: false,
      lastError: null
    });
  },

  updateStep: (stepDescription) => {
    set({ stepDescription });
  },

  abortAction: () => {
    set({
      running: false,
      aborted: true,
      lastError: 'Automatisierung durch Nutzer abgebrochen'
    });
  },

  finishAction: (error = null) => {
    set({
      running: false,
      lastError: error
    });
  },

  setDiscoveredForm: (discoveredForm) => {
    set({ discoveredForm });
  }
}));

/**
 * Creates an in-page script that injects an animated visual interaction beacon
 * (glowing reticle + pulsing aura + badge) over the target element and executes the action.
 */
export function createVisualMarkerScript(action: VisualAction): string {
  const payloadJson = JSON.stringify(action);

  return `(function() {
  const action = ${payloadJson};
  if (!action) return { ok: false, error: 'No action provided' };

  // 1. Locate element
  function findElement() {
    if (action.selector) {
      try {
        const found = document.querySelector(action.selector);
        if (found) return found;
      } catch (_) {}
    }

    if (action.text) {
      const search = action.text.trim().toLowerCase();
      // Look in interactive elements first
      const candidates = Array.from(document.querySelectorAll('button, a, input[type="submit"], input[type="button"], [role="button"], label'));
      for (const el of candidates) {
        const txt = (el.innerText || el.textContent || el.getAttribute('value') || el.getAttribute('aria-label') || '').trim().toLowerCase();
        if (txt === search || txt.includes(search)) {
          return el;
        }
      }
    }

    if (typeof action.x === 'number' && typeof action.y === 'number') {
      return document.elementFromPoint(action.x, action.y);
    }

    return null;
  }

  const el = findElement();
  if (!el) {
    return { ok: false, error: 'Element not found for ' + (action.selector || action.text || action.type) };
  }

  // 2. Scroll into view
  try {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (_) {
    el.scrollIntoView();
  }

  // 3. Remove old beacon if present
  const oldBeacon = document.getElementById('lastbrowser-visual-beacon');
  if (oldBeacon) oldBeacon.remove();

  // 4. Inject animated beacon
  const rect = el.getBoundingClientRect();
  const beacon = document.createElement('div');
  beacon.id = 'lastbrowser-visual-beacon';
  beacon.style.cssText = \`
    position: fixed;
    top: \${rect.top - 6}px;
    left: \${rect.left - 6}px;
    width: \${rect.width + 12}px;
    height: \${rect.height + 12}px;
    border: 2px solid #00d9ff;
    border-radius: 8px;
    box-shadow: 0 0 0 3px rgba(0, 217, 255, 0.4), 0 0 24px rgba(0, 217, 255, 0.7);
    pointer-events: none;
    z-index: 2147483647;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    animation: lbBeaconPulse 1.2s infinite alternate;
  \`;

  const badge = document.createElement('div');
  badge.style.cssText = \`
    position: absolute;
    top: -26px;
    left: 0;
    background: #0d1224;
    color: #00d9ff;
    border: 1px solid rgba(0, 217, 255, 0.5);
    border-radius: 6px;
    padding: 2px 8px;
    font-size: 11px;
    font-family: sans-serif;
    font-weight: 600;
    white-space: nowrap;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  \`;
  badge.innerText = action.label || (action.type === 'click' ? '🤖 Klickt...' : action.type === 'fill' ? '✍️ Füllt aus...' : '⚡ Aktion');
  beacon.appendChild(badge);

  // Inject keyframe animation if not present
  if (!document.getElementById('lastbrowser-beacon-keyframes')) {
    const style = document.createElement('style');
    style.id = 'lastbrowser-beacon-keyframes';
    style.textContent = \`
      @keyframes lbBeaconPulse {
        from { box-shadow: 0 0 0 2px rgba(0, 217, 255, 0.4), 0 0 16px rgba(0, 217, 255, 0.5); }
        to { box-shadow: 0 0 0 5px rgba(0, 217, 255, 0.8), 0 0 32px rgba(0, 217, 255, 0.9); }
      }
    \`;
    document.head.appendChild(style);
  }

  document.body.appendChild(beacon);

  // 5. Execute action
  if (action.type === 'click' || action.type === 'paginate') {
    el.focus();
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    el.click();
  } else if (action.type === 'fill' && typeof action.value === 'string') {
    el.focus();
    const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    if (isInput) {
      const prototype = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (setter) {
        setter.call(el, action.value);
      } else {
        el.value = action.value;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      el.textContent = action.value;
    }
  }

  // Fade out beacon
  setTimeout(() => {
    beacon.style.opacity = '0';
    setTimeout(() => beacon.remove(), 300);
  }, 1600);

  return {
    ok: true,
    tag: el.tagName.toLowerCase(),
    id: el.id,
    className: el.className
  };
})();`;
}

/**
 * Creates an in-page script that discovers all form inputs, select boxes, textareas,
 * and submit buttons on the active page.
 */
export function createFormDiscoveryScript(): string {
  return `(function() {
  const fields = [];
  const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'));

  for (const el of inputs) {
    let label = '';
    if (el.id) {
      const labelEl = document.querySelector('label[for="' + el.id + '"]');
      if (labelEl) label = labelEl.innerText.trim();
    }
    if (!label) {
      const parentLabel = el.closest('label');
      if (parentLabel) label = parentLabel.innerText.trim();
    }
    if (!label) {
      label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '';
    }

    let selector = el.tagName.toLowerCase();
    if (el.id) selector += '#' + el.id;
    else if (el.getAttribute('name')) selector += '[name="' + el.getAttribute('name') + '"]';

    fields.push({
      tag: el.tagName.toLowerCase(),
      type: (el.getAttribute('type') || (el.tagName === 'TEXTAREA' ? 'textarea' : 'text')).toLowerCase(),
      name: el.getAttribute('name') || '',
      id: el.id || '',
      placeholder: el.getAttribute('placeholder') || '',
      label,
      currentValue: (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) ? el.value : '',
      required: el.hasAttribute('required'),
      selector
    });
  }

  const submitBtn = document.querySelector('button[type="submit"], input[type="submit"], button.submit, form button:not([type="button"])');
  const submitButtonText = submitBtn ? (submitBtn.innerText || submitBtn.getAttribute('value') || 'Absenden').trim() : '';

  return {
    title: document.title,
    url: window.location.href,
    fields,
    hasSubmitButton: Boolean(submitBtn),
    submitButtonText
  };
})();`;
}

/**
 * Creates an in-page script that searches for common "Next page" / pagination elements
 * and triggers navigation with a visual beacon.
 */
export function createPaginationScript(): string {
  return `(function() {
  const nextSelectors = [
    'a[rel="next"]',
    'link[rel="next"]',
    '.pagination .next a',
    '.pagination a.next',
    'li.active + li a',
    'a.page-link[aria-label*="next" i]',
    'button[aria-label*="next" i]',
    'a[aria-label*="next" i]',
    'a[aria-label*="weiter" i]',
    'button[aria-label*="weiter" i]'
  ];

  let nextEl = null;
  for (const sel of nextSelectors) {
    try {
      const found = document.querySelector(sel);
      if (found) {
        nextEl = found;
        break;
      }
    } catch (_) {}
  }

  if (!nextEl) {
    // Search text-based
    const candidates = Array.from(document.querySelectorAll('a, button'));
    for (const el of candidates) {
      const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
      if (/^(next|weiter|nächste seite|page suivante|siguiente|›|»|>)$/i.test(txt)) {
        nextEl = el;
        break;
      }
    }
  }

  if (!nextEl) {
    return { ok: false, error: 'Kein Pagination-Button gefunden' };
  }

  // Show beacon
  try {
    nextEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (_) {
    nextEl.scrollIntoView();
  }

  const rect = nextEl.getBoundingClientRect();
  const beacon = document.createElement('div');
  beacon.id = 'lastbrowser-visual-beacon';
  beacon.style.cssText = \`
    position: fixed;
    top: \${rect.top - 6}px;
    left: \${rect.left - 6}px;
    width: \${rect.width + 12}px;
    height: \${rect.height + 12}px;
    border: 2px solid #10b981;
    border-radius: 8px;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.4), 0 0 24px rgba(16, 185, 129, 0.7);
    pointer-events: none;
    z-index: 2147483647;
  \`;
  const badge = document.createElement('div');
  badge.style.cssText = \`
    position: absolute;
    top: -26px;
    left: 0;
    background: #0d1224;
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.5);
    border-radius: 6px;
    padding: 2px 8px;
    font-size: 11px;
    font-family: sans-serif;
    font-weight: 600;
  \`;
  badge.innerText = '📄 Nächste Seite...';
  beacon.appendChild(badge);
  document.body.appendChild(beacon);

  setTimeout(() => {
    nextEl.click();
  }, 400);

  return {
    ok: true,
    text: nextEl.innerText || nextEl.textContent || '',
    href: nextEl.getAttribute('href') || ''
  };
})();`;
}

/**
 * Creates an in-page script that instantly removes any active visual beacons from the webview.
 */
export function createAbortScript(): string {
  return `(function() {
  const beacon = document.getElementById('lastbrowser-visual-beacon');
  if (beacon) beacon.remove();
  const keyframes = document.getElementById('lastbrowser-beacon-keyframes');
  if (keyframes) keyframes.remove();
  return true;
})();`;
}

/**
 * Executes an automated action on the active webview with visual interaction marker.
 */
export async function executeLiveAction(
  webview: Electron.WebviewTag | null,
  action: VisualAction
): Promise<{ ok: boolean; error?: string }> {
  if (!webview) {
    return { ok: false, error: 'Keine aktive Webview vorhanden' };
  }

  const store = useLiveAutomationStore.getState();
  store.startAction(action.label || action.type, action.selector || action.text || '');

  try {
    const script = createVisualMarkerScript(action);
    const result = await webview.executeJavaScript(script);
    if (!result?.ok) {
      store.finishAction(result?.error || 'Aktion fehlgeschlagen');
      return { ok: false, error: result?.error };
    }
    store.finishAction(null);
    return { ok: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    store.finishAction(errorMsg);
    return { ok: false, error: errorMsg };
  }
}

/**
 * Discovers form fields in the active webview.
 */
export async function discoverActiveForm(
  webview: Electron.WebviewTag | null
): Promise<FormDiscoveryResult | null> {
  if (!webview) return null;
  try {
    const script = createFormDiscoveryScript();
    const result = (await webview.executeJavaScript(script)) as FormDiscoveryResult;
    useLiveAutomationStore.getState().setDiscoveredForm(result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Navigates to the next page using pagination detection.
 */
export async function triggerLivePagination(
  webview: Electron.WebviewTag | null
): Promise<{ ok: boolean; error?: string }> {
  if (!webview) return { ok: false, error: 'Keine aktive Webview' };

  const store = useLiveAutomationStore.getState();
  store.startAction('Nächste Seite aufrufen', 'Paginierung');

  try {
    const script = createPaginationScript();
    const result = await webview.executeJavaScript(script);
    if (!result?.ok) {
      store.finishAction(result?.error || 'Pagination fehlgeschlagen');
      return { ok: false, error: result?.error };
    }
    store.finishAction(null);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    store.finishAction(msg);
    return { ok: false, error: msg };
  }
}

/**
 * Aborts any ongoing automation immediately and removes visual markers.
 */
export function abortLiveAutomation(webview: Electron.WebviewTag | null): void {
  useLiveAutomationStore.getState().abortAction();
  if (webview) {
    try {
      void webview.executeJavaScript(createAbortScript());
    } catch {
      // ignore
    }
  }
}
