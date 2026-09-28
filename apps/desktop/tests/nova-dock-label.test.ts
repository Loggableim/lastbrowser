import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Nova Dock pinned app labels', () => {
  it('uses the same absolute item index for hover scaling and label wave', () => {
    const source = readFileSync(
      resolve(__dirname, '../src/renderer/components/NovaDock.tsx'),
      'utf8'
    );

    expect(source).toContain('onMouseEnter={() => setHoveredIndex(index)}');
    expect(source).toContain('style={getLabelStyle(index)}');
    expect(source).not.toContain('getLabelStyle(pinnedIndexes[index])');
  });
});
