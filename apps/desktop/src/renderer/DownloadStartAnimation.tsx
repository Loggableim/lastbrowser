import { useEffect, useRef } from 'react';
import './download-start-animation.css';

/** Decorative start feedback. Never changes transfer state or keyboard focus. */
export function DownloadStartAnimation({ onOpen }: { onOpen: () => void }): null {
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  useEffect(() => {
    const elements = new Set<HTMLElement>();
    const frames = new Set<number>();
    const animations = new Set<Animation>();
    const unsubscribe = window.lastbrowser.downloads.onStarted((entry) => {
      openRef.current();
      const frame = requestAnimationFrame(() => {
        frames.delete(frame);
        const target = Array.from(document.querySelectorAll<HTMLElement>('[data-download-id]')).find((element) => element.dataset.downloadId === entry.id)
          ?? document.querySelector<HTMLElement>('[data-download-arrival-target]');
        if (!target || !target.getClientRects().length) return;
        const pulse = target.animate([{ opacity: 0.65 }, { opacity: 1 }], { duration: 220 });
        animations.add(pulse); void pulse.finished.catch(() => undefined).finally(() => animations.delete(pulse));
        const origin = entry.origin;
        if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)
          || origin.x < 0 || origin.y < 0 || origin.x > window.innerWidth || origin.y > window.innerHeight
          || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const rect = target.getBoundingClientRect();
        const x = rect.left + Math.min(24, rect.width / 2), y = rect.top + rect.height / 2;
        const token = document.createElement('span');
        token.className = 'download-start-token'; token.setAttribute('aria-hidden', 'true');
        token.textContent = '↓'; document.body.append(token); elements.add(token);
        const flight = token.animate([
          { transform: `translate(${origin.x - 14}px, ${origin.y - 14}px) scale(1)`, opacity: 1 },
          { transform: `translate(${(origin.x + x) / 2 - 14}px, ${Math.max(4, Math.min(origin.y, y) - 64)}px) scale(.9)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${x - 14}px, ${y - 14}px) scale(.5)`, opacity: 0 }
        ], { duration: 500, easing: 'cubic-bezier(.22,.61,.36,1)' });
        animations.add(flight);
        void flight.finished.catch(() => undefined).finally(() => { token.remove(); elements.delete(token); animations.delete(flight); });
      });
      frames.add(frame);
    });
    return () => { unsubscribe(); frames.forEach(cancelAnimationFrame); animations.forEach((animation) => animation.cancel()); elements.forEach((element) => element.remove()); };
  }, []);
  return null;
}
