import { pathToFileURL } from 'node:url';

/**
 * Extracts a target web URL or local HTML file path from command line arguments.
 * Used for Single-Instance URL forwarding and cold-start link handling.
 */
export function extractUrlFromArgs(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const raw = args[i]?.trim();
    if (!raw || raw === '%1' || raw === '%L') continue;
    // Skip electron/chromium switches and flags
    if (raw.startsWith('-')) continue;
    // Recognize explicit URLs before filtering local launcher filenames. A URL
    // can legitimately end in .js, .exe, or another launcher-like suffix.
    if (/^(?:https?|file):\/\//i.test(raw)) return raw;
    // Skip executable binaries
    if (/\.(exe|bin)$/i.test(raw) || /(?:^|[/\\])(?:electron|node)(?:\.exe)?$/i.test(raw)) continue;
    // Skip runner script files
    if (raw.endsWith('.js') || raw.endsWith('.mjs') || raw.endsWith('.ts')) continue;
    // Local HTML files
    if (/\.(html?|shtml|xhtml)$/i.test(raw)) {
      try {
        return pathToFileURL(raw).href;
      } catch {
        return raw;
      }
    }
  }
  return null;
}
