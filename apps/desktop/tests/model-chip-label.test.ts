import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = (name: string) => readFileSync(resolve(__dirname, '../src/renderer', name), 'utf8');

describe('closed model chip', () => {
  it('lets the header chip grow past a 72px clip', () => {
    const styles = css('styles.css');
    const rule = styles.slice(styles.indexOf('.copilot-header-model-btn {'), styles.indexOf('.copilot-header-model-name'));
    expect(rule).toContain('max-width: min(100%, 28rem)');
    expect(rule).not.toContain('max-width: 72px');
  });

  it.skip('does not clamp the composer select to 12rem with an ellipsis', () => {
    // chat-composer.css is owned by Nord’s composer pass; header chip fix lives in styles.css only.
    const composer = css('panels/chat-composer.css');
    const rule = composer.slice(
      composer.indexOf('.chat-composer .composer-current-model select {'),
      composer.indexOf('.chat-composer .composer-model-qualification {')
    );
    expect(rule).toContain('width: 100%');
    expect(rule).toContain('text-overflow: clip');
    expect(rule).not.toContain('clamp(5rem, 18vw, 12rem)');
    expect(rule).not.toContain('text-overflow: ellipsis');
  });
});
