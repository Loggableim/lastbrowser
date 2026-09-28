import React, { useEffect, useState, type CSSProperties } from 'react';
import { useDesktopI18n } from '../i18n.js';
import { usePanelStore } from '../stores/usePanelStore.js';
import { toBionicSegments } from '../utils/bionic-reading.js';
import type { HighContrastPalette } from '../stores/a11y-config.js';

/**
 * Interaktive Seh-Testkarte (docs/visionimpaired.md §9, Feature 57).
 * Live-Vorschau: Fließtext, Überschrift, Codezeile, Button + Input,
 * Slider für Schriftgröße (14–28px) und Zeilenabstand (1.2–2.0×),
 * Palette-Umschalter mit Sofort-Feedback.
 */
export function AccessibilityTestCard(): React.JSX.Element {
  const { t } = useDesktopI18n();
  const config = usePanelStore((s) => s.visionImpaired);
  const setVisionImpaired = usePanelStore((s) => s.setVisionImpaired);

  const [fontSize, setFontSize] = useState(18);
  const [lineHeight, setLineHeight] = useState(1.5);
  const [inputValue, setInputValue] = useState('');
  const [previewPalette, setPreviewPalette] = useState<HighContrastPalette>(config.palette);

  useEffect(() => {
    setPreviewPalette(config.palette);
  }, [config.palette]);

  const paletteTokens: Record<HighContrastPalette, CSSProperties> = {
    'ambra-matte': { '--lb-vi-bg': '#111827', '--lb-vi-text': '#F3F4F6', '--lb-vi-accent': '#F59E0B' } as CSSProperties,
    'onyx-cyan': { '--lb-vi-bg': '#000000', '--lb-vi-text': '#FFFFFF', '--lb-vi-accent': '#00E5FF' } as CSSProperties,
    'ivory-navy': { '--lb-vi-bg': '#FAF0CA', '--lb-vi-text': '#0B132B', '--lb-vi-accent': '#1D4ED8' } as CSSProperties,
    'monochrom-high': { '--lb-vi-bg': '#000000', '--lb-vi-text': '#FFFFFF', '--lb-vi-accent': '#FFD700' } as CSSProperties
  };

  const palettes: Array<{ id: HighContrastPalette; label: string }> = [
    { id: 'ambra-matte', label: t('settings.panels.appearance.viPaletteAmbra') },
    { id: 'onyx-cyan', label: t('settings.panels.appearance.viPaletteOnyx') },
    { id: 'ivory-navy', label: t('settings.panels.appearance.viPaletteIvory') },
    { id: 'monochrom-high', label: t('settings.panels.appearance.viPaletteMonochrom') }
  ];

  const flowText = t('settings.panels.appearance.viTestFlow');

  return (
    <div className="a11y-test-card" data-testid="a11y-test-card" data-preview-palette={previewPalette} style={paletteTokens[previewPalette]}>
      <div className="a11y-test-heading" style={{ fontSize: `${Math.min(28, fontSize + 4)}px` }}>
        {t('settings.panels.appearance.viTestHeading')}
      </div>
      <p
        className={`a11y-test-flow ${config.bionicReading ? 'bionic-text' : ''}`}
        style={{ fontSize: `${fontSize}px`, lineHeight }}
      >
        {config.bionicReading
          ? toBionicSegments(flowText).map((seg, i) =>
              seg.bold ? <b key={i}>{seg.text}</b> : <span key={i}>{seg.text}</span>
            )
          : flowText}
      </p>
      <code className="a11y-test-code">{t('settings.panels.appearance.viTestCode')}</code>
      <div className="a11y-test-controls">
        <button type="button">{t('settings.panels.appearance.viTestButton')}</button>
        <input
          type="text"
          placeholder={t('settings.panels.appearance.viTestInput')}
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          aria-label={t('settings.panels.appearance.viTestInput')}
        />
      </div>
      <div className="a11y-test-sliders">
        <label>
          <span>{t('settings.panels.appearance.viTestFontSize')}: {fontSize}px</span>
          <input
            type="range"
            min={14}
            max={28}
            step={1}
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
            aria-label={t('settings.panels.appearance.viTestFontSize')}
          />
        </label>
        <label>
          <span>{t('settings.panels.appearance.viTestLineHeight')}: {lineHeight.toFixed(1)}×</span>
          <input
            type="range"
            min={1.2}
            max={2.0}
            step={0.1}
            value={lineHeight}
            onChange={(event) => setLineHeight(Number(event.target.value))}
            aria-label={t('settings.panels.appearance.viTestLineHeight')}
          />
        </label>
      </div>
      <div className="a11y-test-palettes" role="group" aria-label={t('settings.panels.appearance.viPalette')}>
        {palettes.map((palette) => (
          <button
            key={palette.id}
            type="button"
            className={`a11y-test-palette-btn ${previewPalette === palette.id ? 'active' : ''}`}
            aria-pressed={previewPalette === palette.id}
            onClick={() => setPreviewPalette(palette.id)}
          >
            {palette.label}
          </button>
        ))}
      </div>
      <div className="a11y-test-apply-row">
        <span>{t('settings.panels.appearance.viTestPreview')}</span>
        {previewPalette !== config.palette && (
          <button type="button" onClick={() => setVisionImpaired({ palette: previewPalette })}>
            {t('settings.panels.appearance.viTestApply')}
          </button>
        )}
      </div>
    </div>
  );
}
