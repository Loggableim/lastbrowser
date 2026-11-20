export type NavigationStep = 'navigate' | 'in-page';

export interface NavigationRecording {
  readonly scope: string;
  readonly steps: readonly NavigationStep[];
}

export const MAX_NAVIGATION_DEMO_STEPS = 30;

export function navigationStep(event: {
  readonly type: string;
  readonly url?: unknown;
  readonly isMainFrame?: boolean;
}): NavigationStep | null {
  if (event.type !== 'did-navigate' && event.type !== 'did-navigate-in-page') return null;
  if (event.isMainFrame === false || (event.type === 'did-navigate-in-page' && event.isMainFrame !== true)) return null;
  if (typeof event.url !== 'string') return null;
  try {
    const { protocol, hostname } = new URL(event.url);
    if (protocol !== 'https:' && protocol !== 'http:') return null;
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '[::1]' || hostname.startsWith('127.')) return null;
  } catch {
    return null;
  }
  // URLs are used only to classify the event and never retained or exported.
  return event.type === 'did-navigate' ? 'navigate' : 'in-page';
}

export function appendNavigationStep(
  recording: NavigationRecording | null,
  scope: string,
  step: NavigationStep,
): NavigationRecording | null {
  if (recording?.scope !== scope || recording.steps.length >= MAX_NAVIGATION_DEMO_STEPS) return recording;
  return { scope, steps: [...recording.steps, step] };
}

export function serializeNavigationDemo(steps: readonly NavigationStep[]): string {
  return JSON.stringify({ format: 'lastbrowser-navigation-demo', version: 1, steps });
}
