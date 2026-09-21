import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SPEED_DIAL_ITEMS
} from '../src/renderer/panels/NativeBrowserStartPage.js';

describe('speed dial items', () => {
  it('provides 8 curated quick-launch destinations', () => {
    expect(DEFAULT_SPEED_DIAL_ITEMS.length).toBe(8);
    const domains = DEFAULT_SPEED_DIAL_ITEMS.map((item) => item.domain);
    expect(domains).toContain('github.com');
    expect(domains).toContain('google.com');
    expect(domains).toContain('wikipedia.org');
    expect(domains).toContain('huggingface.co');
    expect(domains).toContain('openai.com');
  });

  it('ensures each speed dial item has valid URLs and accents', () => {
    for (const item of DEFAULT_SPEED_DIAL_ITEMS) {
      expect(item.url).toMatch(/^https:\/\//);
      expect(item.label).toBeTruthy();
      expect(item.iconText).toBeTruthy();
      expect(item.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
