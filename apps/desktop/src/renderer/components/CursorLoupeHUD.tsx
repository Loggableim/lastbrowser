import { useCallback, useEffect, useRef, useState } from 'react';
import { usePanelStore } from '../stores/usePanelStore.js';
import type { LoupePosition } from '../stores/a11y-config.js';
import { getLoupeCaptureRect, getLoupePosition, getWebviewLoupeCaptureRect, hasLoupePointerMoved, isCursorShake, nextLoupeCaptureRetry, type LoupeCaptureRetryState } from '../utils/cursor-loupe.js';

/**
 * Maus-Begleitlupe & Shake-to-Locate Radar (docs/visionimpaired.md §4.2/§4.3).
 *
 * Die Lupe folgt dem Zeiger mit 18px Offset in der gewählten Richtung und
 * erfasst einen kleinen Ausschnitt des sichtbaren Browserfensters und skaliert
 * echte Seiten- oder Chrome-Pixel in die Lupe.
 * Shake-to-Locate: eine deutliche horizontale Hin-und-her-Bewegung löst die
 * konvergierende Radarwelle aus. Tastendrücke lösen sie nicht aus.
 */

const SHAKE_WINDOW_MS = 700;
const RADAR_LIFETIME_MS = 950;

function computeLoupeOffset(position: LoupePosition, size: number): { dx: number; dy: number } {
  const gap = 18;
  switch (position) {
    case 'left':
      return { dx: -(size + gap), dy: 0 };
    case 'right':
      return { dx: size + gap, dy: 0 };
    case 'top':
      return { dx: 0, dy: -(size + gap) };
    case 'bottom':
      return { dx: 0, dy: size + gap };
  }
}

/** Liest den Text unter dem Zeiger für die Lupenansicht (deepest element first). */
function readTextUnderPointer(x: number, y: number): string {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el) return '';
  // Webview-Inhalte sind nicht lesbar (Cross-Origin) — nur Shell-UI magnifizieren.
  if (el.tagName === 'WEBVIEW') return '';
  const own = Array.from(el.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => (n.textContent || '').trim())
    .join(' ');
  if (own) return own;
  return (el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 240);
}

async function readWebviewTextUnderPointer(webview: Electron.WebviewTag, x: number, y: number): Promise<string> {
  if (typeof webview.executeJavaScript !== 'function') return '';
  const bounds = webview.getBoundingClientRect();
  const localX = Math.max(0, Math.round(x - bounds.left));
  const localY = Math.max(0, Math.round(y - bounds.top));
  try {
    const value = await webview.executeJavaScript(`(() => {
      const element = document.elementFromPoint(${localX}, ${localY});
      return (element?.innerText || element?.textContent || '').trim().slice(0, 240);
    })()`);
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

export function CursorLoupeHUD(): React.JSX.Element | null {
  const enabled = usePanelStore((s) => s.visionImpaired.enabled && s.visionImpaired.cursorLoupeEnabled);
  const shakeToLocate = usePanelStore((s) => s.visionImpaired.enabled && s.visionImpaired.shakeToLocate);
  const position = usePanelStore((s) => s.visionImpaired.cursorLoupePosition);
  const size = usePanelStore((s) => s.visionImpaired.cursorLoupeSize);
  const factor = usePanelStore((s) => s.visionImpaired.cursorLoupeFactor);

  const [loupeText, setLoupeText] = useState('');
  const [loupeImage, setLoupeImage] = useState('');
  const [radar, setRadar] = useState<{ x: number; y: number; id: number } | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const shakeWindowRef = useRef<Array<{ t: number; x: number }>>([]);
  const loupeElRef = useRef<HTMLDivElement | null>(null);
  const radarSeqRef = useRef(0);
  const loupeImageRef = useRef('');

  const recordShakePoint = useCallback((point: { x: number; y: number }) => {
    if (!shakeToLocate) return;
    const now = performance.now();
    const samples = shakeWindowRef.current;
    samples.push({ t: now, x: point.x });
    while (samples.length > 0 && now - samples[0]!.t > SHAKE_WINDOW_MS) samples.shift();
    if (isCursorShake(samples)) {
      radarSeqRef.current += 1;
      setRadar({ x: point.x, y: point.y, id: radarSeqRef.current });
      samples.length = 0;
    }
  }, [shakeToLocate]);

  // Webview guests are isolated renderers and do not forward their mouse events
  // to the embedder. Poll the main process for a window-local cursor position,
  // then capture only the small visible window crop at 8 Hz.
  useEffect(() => {
    if (!enabled && !shakeToLocate) return undefined;
    const loupeEl = loupeElRef.current;
    if (enabled && !loupeEl) return undefined;

    let cancelled = false;
    let pollInFlight = false;
    let captureInFlight = false;
    let captureUnavailable = false;
    let lastCaptureAt = 0;
    let previousPoint = { x: Number.NaN, y: Number.NaN };
    let failedCapture: LoupeCaptureRetryState = { point: null, attempts: 0 };
    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const update = async () => {
      if (cancelled || pollInFlight) return;
      pollInFlight = true;
      try {
        const point = await window.lastbrowser?.system?.getCursorPosition?.();
        if (cancelled || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
        pointerRef.current = point;
        recordShakePoint(point);
        if (!enabled || !loupeEl) return;
        const { dx, dy } = computeLoupeOffset(position, size);
        const loupePosition = getLoupePosition(point.x, point.y, window.innerWidth, window.innerHeight, size, dx, dy);
        if (!loupePosition) return;
        loupeEl.style.transform = `translate3d(${loupePosition.x}px, ${loupePosition.y}px, 0)`;

        const moved = hasLoupePointerMoved(point, previousPoint);
        if (!moved) return;

        const target = document.elementFromPoint(point.x, point.y) as HTMLElement | null;
        const webview = target?.tagName === 'WEBVIEW' ? target as Electron.WebviewTag : null;
        if (captureUnavailable) {
          previousPoint = point;
          const text = webview
            ? await readWebviewTextUnderPointer(webview, point.x, point.y)
            : readTextUnderPointer(point.x, point.y);
          if (!cancelled) setLoupeText(text);
          return;
        }

        const now = performance.now();
        if (now - lastCaptureAt < 125 || captureInFlight) return;
        const rect = getLoupeCaptureRect(
          point.x,
          point.y,
          window.innerWidth,
          window.innerHeight,
          size,
          factor
        );
        if (!rect) return;
        lastCaptureAt = now;
        captureInFlight = true;
        try {
          let dataUrl: string | null | undefined;
          const captureGuestRect = window.lastbrowser?.system?.captureGuestRect;
          if (webview && typeof captureGuestRect === 'function') {
            const bounds = webview.getBoundingClientRect();
            const pageRect = getWebviewLoupeCaptureRect(point.x, point.y, bounds, size, factor);
            if (pageRect) {
              try {
                const guestId = webview.getWebContentsId();
                if (Number.isInteger(guestId) && guestId > 0) {
                  dataUrl = await captureGuestRect(guestId, pageRect);
                }
              } catch {
                // Fall back to the visible shell crop below if the guest cannot
                // provide a frame during navigation or teardown.
              }
            }
          }
          if (!dataUrl) dataUrl = await window.lastbrowser?.system?.captureWindowRect?.(rect);
          if (cancelled) return;
          if (dataUrl) {
            previousPoint = point;
            failedCapture = { point: null, attempts: 0 };
            loupeImageRef.current = dataUrl;
            setLoupeText('');
            setLoupeImage(dataUrl);
          } else {
            const retry = nextLoupeCaptureRetry(point, failedCapture);
            failedCapture = { point: retry.point, attempts: retry.attempts };
            if (retry.exhausted) {
              previousPoint = point;
              loupeImageRef.current = '';
              setLoupeImage('');
              const text = webview
                ? await readWebviewTextUnderPointer(webview, point.x, point.y)
                : readTextUnderPointer(point.x, point.y);
              if (!cancelled) setLoupeText(text);
            }
          }
        } catch {
          captureUnavailable = true;
          if (!cancelled) {
            loupeImageRef.current = '';
            setLoupeImage('');
            setLoupeText(webview
              ? await readWebviewTextUnderPointer(webview, point.x, point.y)
              : readTextUnderPointer(point.x, point.y));
          }
        } finally {
          captureInFlight = false;
        }
      } catch {
        if (!cancelled) {
          loupeImageRef.current = '';
          setLoupeImage('');
        }
      } finally {
        pollInFlight = false;
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    void update();
    const positionTimer = window.setInterval(() => { void update(); }, 50);
    return () => {
      cancelled = true;
      window.removeEventListener('pointermove', onPointerMove);
      window.clearInterval(positionTimer);
    };
  }, [enabled, shakeToLocate, position, size, factor, recordShakePoint]);

  // Pointer events keep detection responsive in the shell. The position poll
  // above also feeds the same detector for isolated Electron WebView guests.
  useEffect(() => {
    if (!shakeToLocate) return undefined;
    const onPointerMove = (event: PointerEvent) => {
      recordShakePoint({ x: event.clientX, y: event.clientY });
    };
    window.addEventListener('pointermove', onPointerMove);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [shakeToLocate, recordShakePoint]);

  // Auto-dismiss the radar wave after its animation.
  useEffect(() => {
    if (!radar) return undefined;
    const timer = window.setTimeout(() => setRadar(null), RADAR_LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [radar]);

  if (!enabled && !shakeToLocate) return null;

  return (
    <>
      {enabled && (
        <div
          ref={loupeElRef}
          className="lb-cursor-loupe"
          style={{
            width: size,
            height: size,
            top: 0,
            left: 0,
            transform: 'translate3d(-9999px, -9999px, 0)'
          }}
          aria-hidden="true"
        >
          <div
            className={`lb-loupe-content${loupeImage ? ' has-capture' : ''}`}
            style={{ fontSize: `${Math.round(13 * factor)}px`, transform: loupeImage ? undefined : `scale(${factor})` }}
          >
            {loupeImage ? <img className="lb-loupe-capture" src={loupeImage} alt="" /> : (loupeText || '·')}
          </div>
        </div>
      )}
      {radar && (
        <div
          key={radar.id}
          className="lb-locate-radar"
          style={{ left: radar.x, top: radar.y }}
          aria-hidden="true"
        />
      )}
    </>
  );
}
