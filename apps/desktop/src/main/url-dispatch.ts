import path from 'node:path';

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
    // Skip executable binaries
    if (/\.(exe|bin)$/i.test(raw) || /(?:^|[/\\])(?:electron|node)(?:\.exe)?$/i.test(raw)) continue;
    // Skip runner script files
    if (raw.endsWith('.js') || raw.endsWith('.mjs') || raw.endsWith('.ts')) continue;
    // Standard web schemes
    if (/^https?:\/\//i.test(raw)) {
      return raw;
    }
    // File scheme
    if (/^file:\/\//i.test(raw)) {
      return raw;
    }
    // Local HTML files
    if (/\.(html?|xhtml)$/i.test(raw)) {
      try {
        const resolved = path.resolve(raw);
        return `file:///${resolved.replace(/\\/g, '/')}`;
      } catch {
        return raw;
      }
    }
  }
  return null;
}
