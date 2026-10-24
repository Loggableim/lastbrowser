import changelogMarkdown from '../../../../CHANGELOG.md?raw';
import { parseReleaseNotes, type ReleaseNoteEntry } from './release-notes.js';

/** Release notes bundled from the repository changelog at build time. */
export const releaseNotes: ReleaseNoteEntry[] = parseReleaseNotes(changelogMarkdown);
