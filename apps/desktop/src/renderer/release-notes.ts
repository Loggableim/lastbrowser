export type ReleaseNoteSection = {
  title: string;
  items: string[];
};

export type ReleaseNoteEntry = {
  version: string;
  date: string;
  sections: ReleaseNoteSection[];
};

export type ReleaseNotesUpdate = {
  show: boolean;
  fromVersion: string | null;
  toVersion: string;
  entries: ReleaseNoteEntry[];
};

export const releaseNotesStorageKey = 'lastbrowser.releaseNotes.lastSeenVersion';

type Version = [number, number, number];

const versionPattern = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i;

export function parseVersion(value: string | null | undefined): Version | null {
  if (!value) return null;
  const match = versionPattern.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses the user-facing parts of `CHANGELOG.md`. Sections such as
 * "Verification" are kept by the parser and filtered by the dialog so the
 * changelog stays the single source of truth for release notes.
 */
export function parseReleaseNotes(markdown: string): ReleaseNoteEntry[] {
  const entries: ReleaseNoteEntry[] = [];
  let entry: ReleaseNoteEntry | null = null;
  let section: ReleaseNoteSection | null = null;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const release = /^##\s+\[([^\]]+)\]\s*-\s*(.+)$/.exec(line);
    if (release) {
      const version = release[1].trim();
      if (!parseVersion(version)) {
        entry = null;
        section = null;
        continue;
      }
      const dateText = release[2].trim();
      const date = /\d{4}-\d{2}-\d{2}/.exec(dateText)?.[0] ?? dateText;
      entry = { version, date, sections: [] };
      entries.push(entry);
      section = null;
      continue;
    }

    if (!entry) continue;

    const heading = /^###\s+(.+)$/.exec(line);
    if (heading) {
      section = { title: cleanInlineMarkdown(heading[1]), items: [] };
      entry.sections.push(section);
      continue;
    }

    const item = /^\s*[-*]\s+(.+)$/.exec(line);
    if (!item) continue;
    const text = cleanInlineMarkdown(item[1]);
    if (!text) continue;
    if (!section) {
      section = { title: '', items: [] };
      entry.sections.push(section);
    }
    section.items.push(text);
  }

  return entries;
}

export function selectReleaseNotesBetween(
  entries: ReleaseNoteEntry[],
  fromVersion: string,
  toVersion: string
): ReleaseNoteEntry[] {
  if (!parseVersion(fromVersion) || !parseVersion(toVersion)) return [];
  if (compareVersions(toVersion, fromVersion) <= 0) return [];

  return entries
    .filter((entry) => {
      if (!parseVersion(entry.version)) return false;
      return compareVersions(entry.version, fromVersion) > 0 && compareVersions(entry.version, toVersion) <= 0;
    })
    .sort((left, right) => compareVersions(right.version, left.version));
}

export function resolveReleaseNotesUpdate(options: {
  entries: ReleaseNoteEntry[];
  storedVersion: string | null;
  currentVersion: string;
}): ReleaseNotesUpdate {
  const { entries, storedVersion, currentVersion } = options;
  if (!storedVersion || !parseVersion(currentVersion)) {
    return { show: false, fromVersion: storedVersion, toVersion: currentVersion, entries: [] };
  }

  const selected = selectReleaseNotesBetween(entries, storedVersion, currentVersion);
  return {
    show: selected.length > 0,
    fromVersion: storedVersion,
    toVersion: currentVersion,
    entries: selected
  };
}

export function readLastSeenReleaseVersion(storage: Pick<Storage, 'getItem'>): string | null {
  try {
    const value = storage.getItem(releaseNotesStorageKey)?.trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

export function writeLastSeenReleaseVersion(storage: Pick<Storage, 'setItem'>, version: string): boolean {
  if (!parseVersion(version)) return false;
  try {
    storage.setItem(releaseNotesStorageKey, version);
    return true;
  } catch {
    return false;
  }
}
