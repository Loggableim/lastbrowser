import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadBetaChangelog,
  renderBetaChangelogMarkdown,
  validateBetaChangelog,
} from '../../../scripts/beta-changelog.mjs';

const repoRoot = path.resolve(__dirname, '..', '..', '..');

function load(): { data: Record<string, any>; schema: Record<string, any>; markdown: string } {
  return loadBetaChangelog(repoRoot);
}

describe('beta changelog schema', () => {
  it('validates changelog/betas.json against changelog/betas.schema.json', () => {
    const { data, schema } = load();

    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.$defs?.release?.required).toEqual(expect.arrayContaining([
      'version',
      'label',
      'date',
      'build',
      'commit',
      'signed',
      'sinceStable',
      'changes',
    ]));
    expect(validateBetaChangelog(data, schema)).toEqual([]);
  });

  it('documents Beta 0.1.57 with its build, commit and unsigned status', () => {
    const { data } = load();
    const release = data.releases.find((entry: Record<string, any>) => entry.label === 'Beta 0.1.57');

    expect(release).toBeTruthy();
    expect(release.version).toBe('0.1.57-demo.4');
    expect(release.build).toBe('demo4-final');
    expect(release.commit).toBe('ae4a367982c164facc12713329a1a3369769a81b');
    expect(release.signed).toBe(false);
    expect(release.sinceStable).toBe('0.1.56');
    expect(release.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'feature', title: 'F3-Modellwahl' }),
    ]));
    expect(release.notes).toEqual(expect.arrayContaining(['Unsignierter Tagesbeta-Build.']));
  });

  it('keeps the committed Markdown in sync with the JSON source', () => {
    const { data, markdown } = load();

    expect(markdown).toBe(renderBetaChangelogMarkdown(data));
    expect(markdown).toContain('## Beta 0.1.57 — 2026-10-16');
    expect(markdown).toContain('`demo4-final`');
    expect(markdown).toContain('`ae4a3679`');
    expect(markdown).toContain('Signiert: nein');
  });

  it('rejects entries that do not satisfy the schema', () => {
    const { data, schema } = load();
    const invalid = structuredClone(data);
    invalid.releases[0].signed = 'no';
    invalid.releases[0].commit = 'not-a-commit';
    delete invalid.releases[0].changes;
    invalid.releases[0].channel = 'stable';

    const errors = validateBetaChangelog(invalid, schema);

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('.signed: expected boolean'),
      expect.stringContaining('.commit: does not match'),
      expect.stringContaining('missing required property changes'),
      expect.stringContaining('unexpected property channel'),
    ]));
  });

  it('rejects duplicate versions and unordered release dates', () => {
    const { data, schema } = load();
    const invalid = structuredClone(data);
    invalid.releases.push({
      ...structuredClone(data.releases[0]),
      date: '2026-10-17',
    });

    const errors = validateBetaChangelog(invalid, schema);

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('duplicate version 0.1.57-demo.4'),
      expect.stringContaining('release dates must be ordered newest first'),
    ]));
  });
});
