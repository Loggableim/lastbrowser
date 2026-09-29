import { useEffect, useRef, useState } from 'react';
import { ZoomIn } from 'lucide-react';
import { useDesktopI18n } from '../i18n.js';

/**
 * Split-Screen Magnifier (docs/visionimpaired.md §6, Feature 18).
 * Untere 35% des Browser-Fensters: 2.5× vergrößerte, synchron mitscrollende
 * Ansicht des aktiven Absatzes (max. 70 Zeichen/Zeile). Der aktive Absatz
 * wird im Original (oben) mit einem leuchtenden Rahmen hervorgehoben.
 *
 * Textquelle: executeJavaScript im Webview-Guest — holt den Absatz unter
 * dem Viewport-Zentrum plus Scroll-Offset, damit die Lupe synchron ist.
 */

const SPLIT_MAGNIFIER_JS = `(function() {
  try {
    var paragraphs = Array.prototype.slice.call(document.querySelectorAll('p, li, h1, h2, h3, blockquote'));
    if (!paragraphs.length) return JSON.stringify({ text: '', scrollY: 0, activeIndex: -1 });
    var viewportCenter = window.innerHeight / 2;
    var active = paragraphs[0];
    var activeIndex = 0;
    var bestDistance = Infinity;
    for (var i = 0; i < paragraphs.length; i++) {
      var rect = paragraphs[i].getBoundingClientRect();
      if (rect.height === 0) continue;
      var center = rect.top + rect.height / 2;
      var distance = Math.abs(center - viewportCenter);
      if (distance < bestDistance) { bestDistance = distance; active = paragraphs[i]; activeIndex = i; }
    }
    if (active) {
      var outline = active.style.outline;
      active.style.outline = '3px solid #FFD700';
      active.style.outlineOffset = '2px';
      window.setTimeout(function() {
        try { active.style.outline = outline; active.style.outlineOffset = ''; } catch (e) {}
      }, 1200);
    }
    return JSON.stringify({ text: (active && active.textContent || '').trim().slice(0, 4000), scrollY: window.scrollY, activeIndex: activeIndex });
  } catch (e) {
    return JSON.stringify({ text: '', scrollY: 0, activeIndex: -1 });
  }
})()`;

export type SplitScreenMagnifierProps = {
  webview: Electron.WebviewTag | null;
  /** Re-render trigger: bump when the page scrolls or navigates. */
  syncKey?: string | number;
};

export function SplitScreenMagnifier({ webview, syncKey }: SplitScreenMagnifierProps): React.JSX.Element | null {
  const { t } = useDesktopI18n();
  const [paragraph, setParagraph] = useState<{ text: string; scrollY: number }>({ text: '', scrollY: 0 });
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!webview || typeof webview.executeJavaScript !== 'function') return undefined;
    let cancelled = false;

    const sample = async () => {
      if (cancelled) return;
      try {
        const raw = await webview.executeJavaScript(SPLIT_MAGNIFIER_JS);
        if (cancelled) return;
        const parsed = JSON.parse(raw) as { text: string; scrollY: number };
        setParagraph({ text: parsed.text || '', scrollY: parsed.scrollY || 0 });
      } catch {
        // Guest not ready or cross-origin — keep the last sample.
      }
    };

    void sample();
    const interval = window.setInterval(sample, 800);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [webview, syncKey]);

  if (!webview) return null;

  return (
    <div className="lb-split-magnifier" role="region" aria-label={t('visionImpaired.splitMagnifier.region')}>
      <div className="lb-split-magnifier-header">
        <ZoomIn size={16} />
        <span>{t('visionImpaired.splitMagnifier.position', { position: Math.round(paragraph.scrollY) })}</span>
      </div>
      <div className="lb-split-magnifier-body" ref={bodyRef}>
        {paragraph.text
          ? paragraph.text.split(/\n+/).map((chunk, index) => <p key={index}>{chunk}</p>)
          : <p>{t('visionImpaired.splitMagnifier.empty')}</p>}
      </div>
    </div>
  );
}
