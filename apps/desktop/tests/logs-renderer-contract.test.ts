import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeLogLines } from '../src/renderer/log-lines.js';

describe('logs renderer response contract', () => {
  it('renders the current API lines array without coercing or discarding entries', () => {
    expect(normalizeLogLines({ file: 'webui', lines: ['INFO started', 'ERROR missing'] })).toEqual([
      'INFO started', 'ERROR missing'
    ]);
  });

  it('preserves legacy string response fields and ignores non-string line values', () => {
    expect(normalizeLogLines({ lines: ['ok', null, 4], text: 'legacy\nline' })).toEqual(['ok']);
    expect(normalizeLogLines({ text: 'legacy\nline' })).toEqual(['legacy', 'line']);
    expect(normalizeLogLines(null)).toEqual([]);
  });

  it('passes the response lines into the existing severity filter and visible log viewer', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/renderer/panels/SystemPanels.tsx'), 'utf8');
    expect(source).toContain('normalizeLogLines(logs.data)');
    expect(source).toContain("{lines.join('\\n') || t('logs.noLinesLoaded')}");
  });
});
