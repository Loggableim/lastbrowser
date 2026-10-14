import { Children, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Every unit is mounted once. Inactive units retain form state and are inert. */
export function SettingsPageDeck({ children, resetKey, label = 'Seiten' }: {
  children: ReactNode; resetKey: string; label?: string;
}): JSX.Element {
  const units = Children.toArray(children);
  const viewport = useRef<HTMLDivElement>(null);
  const unitRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [groups, setGroups] = useState<number[][]>([units.map((_, index) => index)]);
  const [page, setPage] = useState(0);
  const [oversized, setOversized] = useState<number[]>([]);
  useLayoutEffect(() => { setPage(0); }, [resetKey]);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      const capacity = Math.max(120, element.clientHeight - 4);
      const next: number[][] = []; const large: number[] = []; let current: number[] = []; let used = 0;
      unitRefs.current.slice(0, units.length).forEach((unit, index) => {
        if (!unit) return;
        const height = Math.ceil(unit.getBoundingClientRect().height);
        if (height > capacity) large.push(index);
        if (current.length && used + height + 10 > capacity) { next.push(current); current = []; used = 0; }
        current.push(index); used += height + (current.length > 1 ? 10 : 0);
      });
      if (current.length) next.push(current);
      if (!next.length) next.push([]);
      setGroups(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      setOversized(previous => JSON.stringify(previous) === JSON.stringify(large) ? previous : large);
      const focused = unitRefs.current.findIndex(unit => unit?.contains(document.activeElement));
      setPage(previous => focused >= 0 ? Math.max(0, next.findIndex(group => group.includes(focused))) : Math.min(previous, next.length - 1));
    };
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); });
    observer.observe(element);
    unitRefs.current.slice(0, units.length).forEach(unit => { if (unit) observer.observe(unit); });
    measure();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [children, units.length]);
  const current = Math.min(page, groups.length - 1);
  const visible = groups[current] || [];
  const numbers = [...new Set([0, ...Array.from({ length: 5 }, (_, index) => current + index - 2), groups.length - 1])]
    .filter(index => index >= 0 && index < groups.length).sort((a, b) => a - b);
  function select(next: number): void {
    setPage(Math.min(groups.length - 1, Math.max(0, next)));
    viewport.current?.focus();
  }
  return <div className="settings-page-deck">
    <div className={`settings-page-viewport${visible.some(index => oversized.includes(index)) ? ' settings-page-emergency-overflow' : ''}`} ref={viewport} tabIndex={-1}>
      {units.map((unit, index) => <div key={typeof unit === 'object' && unit && 'key' in unit ? String(unit.key) : index}
        ref={node => { unitRefs.current[index] = node; }}
        className={`settings-page-unit${visible.includes(index) ? ' visible' : ''}`}
        aria-hidden={!visible.includes(index)} inert={!visible.includes(index)}>{unit}</div>)}
    </div>
    <nav className="settings-page-navigation" aria-label={label} onKeyDown={event => {
      const next = event.key === 'ArrowRight' || event.key === 'PageDown' ? current + 1
        : event.key === 'ArrowLeft' || event.key === 'PageUp' ? current - 1
          : event.key === 'Home' ? 0 : event.key === 'End' ? groups.length - 1 : null;
      if (next !== null) { event.preventDefault(); select(next); }
    }}>
      <button type="button" aria-label={`${label}: ←`} disabled={current === 0} onClick={() => select(current - 1)}>‹</button>
      {numbers.map((number, index) => <span key={number} className="settings-page-number">
        {index > 0 && number > numbers[index - 1] + 1 && <span aria-hidden="true">…</span>}
        <button type="button" aria-label={`${label} ${number + 1}`} aria-current={number === current ? 'page' : undefined}
          onClick={() => select(number)}>{number + 1}</button>
      </span>)}
      <button type="button" aria-label={`${label}: →`} disabled={current === groups.length - 1} onClick={() => select(current + 1)}>›</button>
      <span className="settings-page-count" role="status" aria-live="polite">{current + 1} / {groups.length}</span>
    </nav>
  </div>;
}
