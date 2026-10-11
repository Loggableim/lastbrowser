import type { DesktopChatMessage } from './shell-state.js';

// Public browser catalog plus native_browser_contracts' scoped aliases.
const browserTools = new Set([
  'browser_navigate', 'browser_snapshot', 'browser_click', 'browser_type',
  'browser_scroll', 'browser_back', 'browser_press', 'browser_action_v1',
  'browser_get_images', 'browser_vision', 'browser_console', 'browser_dialog', 'browser_cdp',
  'independent_browser_navigate', 'independent_browser_read', 'independent_browser_screenshot',
  'independent_browser_click', 'independent_browser_type',
]);

/** A live chat stream alone does not mean the agent is using a browser. */
export function hasCurrentTurnBrowserUse(messages: readonly DesktopChatMessage[]): boolean {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'user') break;
    if (message.role !== 'assistant' || !Array.isArray(message.tool_calls)) continue;
    if (message.tool_calls.some(call => {
      if (!call || typeof call !== 'object') return false;
      const record = call as Record<string, unknown>;
      const fn = record.function && typeof record.function === 'object' ? record.function as Record<string, unknown> : {};
      return typeof (fn.name ?? record.name) === 'string' && browserTools.has(String(fn.name ?? record.name));
    })) return true;
  }
  return false;
}
