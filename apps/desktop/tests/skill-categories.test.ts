import { describe, expect, it } from 'vitest';
import { normalizeSkillCategories, normalizeSkillCategory } from '../src/renderer/panels/skill-categories.js';

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
