import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const renderer = (fileName: string): string =>
  readFileSync(path.resolve(process.cwd(), 'src/renderer', fileName), 'utf8');

describe('Sparkles flyout browser tools', () => {
  it('moves the existing DevTools and permission actions into the topbar flyout', () => {
    const app = renderer('App.tsx');
    const actionBar = renderer('components/InPageActionBar.tsx');

    expect(app).toContain('overlayTools={(');
    expect(app).toContain('onClick={toggleDevTools}');
    expect(app).toContain('<SitePermissionButton url={activeTab.url} />');
    expect(app).toContain('setPermissionsOpen(!usePanelStore.getState().permissionsOpen)');
    expect(app).not.toContain('browser-page-corner-actions');
    expect(actionBar).toContain('overlayTools?: React.ReactNode');
    expect(actionBar).toContain('className="action-strip-overlay-tools"');
    expect(actionBar).toContain('aria-label="Browser and site permissions"');
  });

  it('keeps keyboard dismissal, focus return, and bounded flyout sizing', () => {
    const actionBar = renderer('components/InPageActionBar.tsx');
    const css = renderer('styles.css');

    expect(actionBar).toContain("if (e.key === 'Escape')");
    expect(actionBar).toContain('sparklesTriggerRef.current?.focus()');
    expect(actionBar).toContain('onBlur={(event) =>');
    expect(css).toContain('width: max-content;');
    expect(css).toContain('max-width: min(90vw, 820px);');
    expect(css).toContain('.action-strip-overlay-tools');
    expect(css).not.toContain('.browser-page-corner-actions');
  });
});
