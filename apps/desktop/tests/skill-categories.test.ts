import { describe, expect, it } from 'vitest';
import { extractLinkedFiles, normalizeSkillCategories, normalizeSkillCategory } from '../src/renderer/panels/skill-categories.js';
import { idOf, text, titleOf } from '../src/renderer/panels/RestPanelShared.js';

describe('skill category labels', () => {
  it('keeps string categories from the Sidekick API and extracts labels from object categories', () => {
    expect(normalizeSkillCategories(['research', { name: 'code' }, { title: 'design' }, {}, null]))
      .toEqual(['research', 'code', 'design']);
  });

  it('rejects nested objects rather than leaking object coercion into the UI or saved data', () => {
    expect(normalizeSkillCategory({ name: { value: 'bad' } })).toBe('');
    expect(normalizeSkillCategories([{ name: { value: 'bad' } }])).toEqual([]);
  });
});

describe('skill linked files normalization', () => {
  it('extracts linked files from boolean maps, category file lists, and plain arrays', () => {
    expect(extractLinkedFiles({ 'references/memo.md': true, 'scripts/run.py': true }))
      .toEqual(['references/memo.md', 'scripts/run.py']);

    expect(extractLinkedFiles({
      references: ['docs/guide.md', 'docs/api.md'],
      templates: ['template.json'],
      assets: []
    })).toEqual(['docs/guide.md', 'docs/api.md', 'template.json']);

    expect(extractLinkedFiles(['manual.md', 'spec.yaml']))
      .toEqual(['manual.md', 'spec.yaml']);

    expect(extractLinkedFiles([{ path: 'sub/tool.sh' }, { file: 'sub/helper.py' }]))
      .toEqual(['sub/tool.sh', 'sub/helper.py']);
  });

  it('safely handles empty, invalid, and nested structures without coercing to [object Object]', () => {
    expect(extractLinkedFiles(null)).toEqual([]);
    expect(extractLinkedFiles(undefined)).toEqual([]);
    expect(extractLinkedFiles({})).toEqual([]);
    expect(extractLinkedFiles([{ path: { nested: 'bad' } }])).toEqual([]);
    expect(extractLinkedFiles({ references: [{ path: { nested: 'bad' } }] })).toEqual([]);
  });
});

describe('rest panel text and identity helpers', () => {
  it('safely extracts display values from object-shaped items and never leaks [object Object]', () => {
    expect(text('hello')).toBe('hello');
    expect(text(42)).toBe('42');
    expect(text(null, 'default')).toBe('default');
    expect(text(undefined, 'default')).toBe('default');
    expect(text({ name: 'Hermes' })).toBe('Hermes');
    expect(text({ title: 'Claude Code' })).toBe('Claude Code');
    expect(text({ label: 'Automation' })).toBe('Automation');
    expect(text({}, 'fallback')).toBe('fallback');
    expect(text({ invalid: 'field' }, 'fallback')).toBe('fallback');
    expect(text({ name: { nested: 'bad' } }, 'fallback')).toBe('fallback');

    expect(titleOf({ name: 'apple-notes' })).toBe('apple-notes');
    expect(titleOf({ name: { title: 'apple-notes' } })).toBe('apple-notes');
    expect(titleOf({ name: {} })).toBe('Untitled');
    expect(titleOf({})).toBe('Untitled');

    expect(idOf({ slug: 'custom-skill' })).toBe('custom-skill');
    expect(idOf({ id: { name: 'custom-skill' } })).toBe('custom-skill');
    expect(idOf({})).toBe('Untitled');
  });
});
