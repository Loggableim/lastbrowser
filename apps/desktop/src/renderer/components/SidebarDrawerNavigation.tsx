import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { createEdgeScroller } from '../sidebar-edge-scroll.js';

type Props = {
  children: React.ReactNode;
  label: string;
  selected: string;
  previousLabel: string;
  nextLabel: string;
  className?: string;
};

export function SidebarDrawerNavigation({ children, label, selected, previousLabel, nextLabel, className = '' }: Props): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const scroller = useRef<ReturnType<typeof createEdgeScroller> | null>(null);
  const [edges, setEdges] = useState({ overflow: false, left: false, right: false });

  function measure() {
    const view = viewport.current;
    if (!view || !root.current || !track.current) return;
    const overflow = track.current.scrollWidth > root.current.clientWidth - 20 + 1;
    const maximum = Math.max(0, view.scrollWidth - view.clientWidth);
    const next = { overflow, left: overflow && view.scrollLeft > 1, right: overflow && view.scrollLeft < maximum - 1 };
    setEdges((old) => old.overflow === next.overflow && old.left === next.left && old.right === next.right ? old : next);
    if (!overflow) scroller.current?.stop();
  }

  function reveal(button: HTMLElement) {
    const view = viewport.current;
    if (!view) return;
    const bounds = view.getBoundingClientRect();
    const item = button.getBoundingClientRect();
    if (item.left < bounds.left) view.scrollLeft += item.left - bounds.left;
    else if (item.right > bounds.right) view.scrollLeft += item.right - bounds.right;
    measure();
  }

  useLayoutEffect(() => {
    const view = viewport.current;
    const list = track.current;
    if (!view || !list || !root.current) return;
    const observer = new ResizeObserver(() => {
      measure();
      const active = list.querySelector<HTMLElement>('[aria-selected="true"]');
      if (active) reveal(active);
    });
    observer.observe(root.current);
    observer.observe(view);
    observer.observe(list);
    measure();
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    scroller.current?.stop();
    const active = track.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (active) reveal(active);
  }, [selected, edges.overflow]);

  useEffect(() => {
    const controller = createEdgeScroller((pixels) => {
      const view = viewport.current;
      if (!view) return false;
      const maximum = view.scrollWidth - view.clientWidth;
      view.scrollLeft = Math.max(0, Math.min(maximum, view.scrollLeft + pixels));
      measure();
      return pixels < 0 ? view.scrollLeft > 1 : view.scrollLeft < maximum - 1;
    }, {
      delay: (callback, milliseconds) => window.setTimeout(callback, milliseconds),
      cancelDelay: (id) => window.clearTimeout(id),
      frame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (id) => window.cancelAnimationFrame(id)
    });
    scroller.current = controller;
    const stop = () => controller.stop();
    window.addEventListener('blur', stop);
    const onVisibility = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      scroller.current = null;
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  function page(direction: -1 | 1) {
    scroller.current?.stop();
    const view = viewport.current;
    if (view) view.scrollLeft += direction * view.clientWidth * 0.9;
    measure();
  }

  return (
    <div ref={root} className={`sidebar-drawer-navigation ${edges.overflow ? 'is-overflowing' : ''} ${edges.left ? 'has-left' : ''} ${edges.right ? 'has-right' : ''}`}
      onPointerLeave={() => scroller.current?.stop()} onPointerCancel={() => scroller.current?.stop()}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) scroller.current?.stop(); }}>
      <button type="button" className="drawer-edge drawer-edge-left" aria-label={`${label}: ${previousLabel}`} disabled={!edges.left}
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') scroller.current?.start(-1); }}
        onPointerLeave={() => scroller.current?.stop()} onClick={() => page(-1)}><ChevronLeft size={16} /></button>
      <div ref={viewport} className="drawer-nav-viewport" onScroll={measure}>
        <div ref={track} className={className} role="tablist" aria-label={label}
          onClick={() => scroller.current?.stop()}
          onFocus={(event) => { const tab = (event.target as HTMLElement).closest<HTMLElement>('[role="tab"]'); if (tab) reveal(tab); }}
          onKeyDown={(event) => {
            const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
            const index = tabs.indexOf(event.target as HTMLButtonElement);
            if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            scroller.current?.stop();
            tabs[next].focus({ preventScroll: true });
            tabs[next].click();
            reveal(tabs[next]);
          }}>{children}</div>
      </div>
      <button type="button" className="drawer-edge drawer-edge-right" aria-label={`${label}: ${nextLabel}`} disabled={!edges.right}
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') scroller.current?.start(1); }}
        onPointerLeave={() => scroller.current?.stop()} onClick={() => page(1)}><ChevronRight size={16} /></button>
    </div>
  );
}
