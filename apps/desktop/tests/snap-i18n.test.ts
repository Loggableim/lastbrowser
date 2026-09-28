import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDesktopI18n, desktopLocaleCatalogs, desktopLocaleIds, desktopTranslationKeys } from '../src/renderer/i18n.js';
import { snapLayoutDescriptionKey, snapLayoutLabelKey, snapSlotNameKey } from '../src/renderer/snap-i18n.js';
import { SNAP_LAYOUT_DEFINITIONS, type SnapLayoutType } from '../src/renderer/types/snap-layouts.js';

const multiLayouts = Object.keys(SNAP_LAYOUT_DEFINITIONS).filter((layout) => layout !== 'single') as Exclude<SnapLayoutType, 'single'>[];

function readRendererFile(fileName: string): string {
  return readFileSync(resolve(process.cwd(), 'src/renderer', fileName), 'utf8');
}

describe('Snap and Multiview localization', () => {
  it('has non-empty translated labels, descriptions, and slot names in every locale', () => {
    const snapKeys = desktopTranslationKeys.filter((key) => key.startsWith('snap.'));
    expect(snapKeys.length).toBeGreaterThan(30);

    for (const locale of desktopLocaleIds) {
      const catalog = desktopLocaleCatalogs[locale];
      for (const key of snapKeys) {
        expect(catalog[key]?.trim(), `${locale}.${key}`).toBeTruthy();
        expect(catalog[key], `${locale}.${key}`).not.toBe(key);
      }

      const t = createDesktopI18n(locale).t;
      for (const layout of multiLayouts) {
        expect(t(snapLayoutLabelKey(layout))).not.toBe(snapLayoutLabelKey(layout));
        expect(t(snapLayoutDescriptionKey(layout))).not.toBe(snapLayoutDescriptionKey(layout));
        SNAP_LAYOUT_DEFINITIONS[layout].slots.forEach((_slot, index) => {
          const key = snapSlotNameKey(layout, index);
          expect(t(key), `${locale}.${layout}[${index}]`).not.toBe(key);
        });
      }
    }
  });

  it('wires translated strings to Snap flyout, Multiview controls, and BrowserMain drag hint', () => {
    const flyout = readRendererFile('components/SnapBarFlyout.tsx');
    const multiview = readRendererFile('components/MultiviewGridContainer.tsx');
    const app = readRendererFile('App.tsx');

    expect(flyout).toContain("import { useDesktopI18n } from '../i18n.js'");
    expect(flyout).toContain("t('snap.title')");
    expect(flyout).toContain('snapLayoutDescriptionKey(layoutKey)');
    expect(flyout).toContain('snapSlotNameKey(layoutKey, idx)');
    expect(flyout).toContain('onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); handleMouseEnter(); }}');
    expect(flyout).not.toContain('Tab in einen Bereich ziehen');

    expect(multiview).toContain("import { useDesktopI18n } from '../i18n.js'");
    for (const key of ['snap.dragToMoveOrDetach', 'snap.detachTab', 'snap.maximizePane', 'snap.removePane', 'snap.tabHere', 'snap.resizePane']) {
      expect(multiview).toContain(`t('${key}')`);
    }

    expect(app).toContain("import { snapLayoutLabelKey, snapSlotNameKey } from './snap-i18n.js'");
    expect(app).toContain("t('snap.dragHint')");
    expect(app).not.toContain('Am Rand ablegen oder oben ein Layout wählen');
  });

  it('labels asymmetric dual slots with their actual proportions', () => {
    expect(snapSlotNameKey('dual-50-50', 0)).toBe('snap.slot.left');
    expect(snapSlotNameKey('dual-66-33', 0)).toBe('snap.slot.left67');
    expect(snapSlotNameKey('dual-66-33', 1)).toBe('snap.slot.right33');
    expect(snapSlotNameKey('dual-33-66', 0)).toBe('snap.slot.left33');
    expect(snapSlotNameKey('dual-33-66', 1)).toBe('snap.slot.right67');
    expect(snapSlotNameKey('dual-75-25', 0)).toBe('snap.slot.left75');
    expect(snapSlotNameKey('dual-75-25', 1)).toBe('snap.slot.right25');
    expect(snapSlotNameKey('dual-25-75', 0)).toBe('snap.slot.left25');
    expect(snapSlotNameKey('dual-25-75', 1)).toBe('snap.slot.right75');
  });
});
