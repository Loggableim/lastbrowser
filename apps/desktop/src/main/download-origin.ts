import type { WebContents } from 'electron';

export type DownloadOrigin = { x: number; y: number; webContentsId: number };
type Gesture = { at: number; result: Promise<{ href: string; origin: DownloadOrigin } | undefined> };

/** Decorative provenance only: exact link + same guest + one short-lived gesture. */
export function createDownloadOriginTracker() {
  const gestures = new Map<number, Gesture>();
  return {
    observe(contents: WebContents): void {
      if (contents.getType() !== 'webview') return;
      contents.on('before-mouse-event', (_event, input) => {
        if (input.type !== 'mouseDown') return;
        gestures.delete(contents.id);
        if (input.button !== 'left') return;
        const host = contents.hostWebContents;
        if (!host || host.isDestroyed()) return;
        const zoom = contents.getZoomFactor();
        if (!Number.isFinite(input.x) || !Number.isFinite(input.y) || !(zoom > 0)) return;
        const x = input.x / zoom, y = input.y / zoom;
        // Isolated world avoids page monkey-patching of DOM methods. No preload,
        // event handler, or persistent page mutation is installed.
        const result = Promise.all([
          contents.executeJavaScriptInIsolatedWorld(1001, [{ code: `(() => { const a = document.elementFromPoint(${x}, ${y})?.closest('a[href]'); return a ? { href: a.href, width: innerWidth, height: innerHeight } : null; })()` }]),
          host.executeJavaScript(`(() => { for (const view of document.querySelectorAll('webview')) { try { if (view.getWebContentsId() === ${contents.id}) { const r = view.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, viewportWidth:innerWidth, viewportHeight:innerHeight }; } } catch {} } return null; })()`)
        ]).then(([link, rect]) => {
          if (!link || !rect || !(link.width > 0) || !(link.height > 0) || !(rect.width > 0) || !(rect.height > 0)) return undefined;
          const px = rect.x + x * rect.width / link.width;
          const py = rect.y + y * rect.height / link.height;
          if (!Number.isFinite(px) || !Number.isFinite(py) || px < 0 || py < 0 || px > rect.viewportWidth || py > rect.viewportHeight || x < 0 || y < 0 || x > link.width || y > link.height) return undefined;
          return { href: String(link.href), origin: { x: px, y: py, webContentsId: contents.id } };
        }).catch(() => undefined);
        gestures.set(contents.id, { at: Date.now(), result });
      });
      contents.once('destroyed', () => gestures.delete(contents.id));
      contents.on('did-navigate', () => gestures.delete(contents.id));
      contents.on('before-input-event', (_event, input) => {
        if (input.type === 'keyDown') gestures.delete(contents.id);
      });
    },
    async resolve(contents: unknown, urls: string[]): Promise<DownloadOrigin | undefined> {
      const id = (contents as { id?: number } | null)?.id;
      if (typeof id !== 'number') return;
      const gesture = gestures.get(id);
      gestures.delete(id);
      if (!gesture || Date.now() - gesture.at > 1200) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([gesture.result, new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), 250); })]);
        return result && urls.includes(result.href) ? result.origin : undefined;
      } finally { if (timer) clearTimeout(timer); }
    }
  };
}
