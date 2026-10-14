import { Children, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

type Slice = { unit: number; leaves: HTMLElement[]; branches: Map<HTMLElement, HTMLElement[]> };
type Page = Slice[];
const KEEP = 'header, legend, summary, thead, .settings-card-header';
const ATOMIC = 'button, input, select, textarea, label, tr, .settings-field, .settings-toggle, .local-model-card, [role="dialog"], details:not([open])';
const CONTAINERS = '.settings-card, .settings-card-body, .settings-field-grid, .settings-modern-layout-config, fieldset, .settings-theme-grid, .settings-skin-grid, .settings-size-grid';

/** Pagination changes visibility only: React retains controls and their drafts. */
export function SettingsPageDeck({ children, resetKey, label = 'Seiten', subsectionLabel }: {
  children: ReactNode; resetKey: string; label?: string; subsectionLabel?: string;
}): JSX.Element {
  const units = Children.toArray(children);
  const id = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const unitRefs = useRef<Array<HTMLDivElement | null>>([]);
  const plans = useRef<Page[]>([]);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [subsection, setSubsection] = useState(0);
  const [titles, setTitles] = useState<string[]>([]);
  const [oversized, setOversized] = useState(false);
  const currentPage = useRef(0);
  const subsectionNav = useRef<HTMLElement>(null);
  const tabStrip = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [showTabs, setShowTabs] = useState(false);
  const restoreSubsectionFocus = useRef(false);

  useLayoutEffect(() => {
    const nav = subsectionNav.current; const strip = tabStrip.current;
    if (!nav || !strip) return;
    const measure = () => {
      // Measure the intrinsic tab width in both modes. A flex-growing strip
      // measured its available width when visible, but its content width when
      // hidden, which continuously flipped the navigation mode.
      const occupied = Array.from(nav.children).filter(node => node !== strip && node.tagName !== 'LABEL')
        .reduce((width, node) => width + node.getBoundingClientRect().width, 0);
      const gap = Number.parseFloat(getComputedStyle(nav).columnGap) || 0;
      const available = nav.clientWidth - occupied - gap * 3;
      const required = strip.scrollWidth;
      setShowTabs(previous => {
        const fits = required <= available - (previous ? 0 : 8);
        if (!fits && strip.contains(document.activeElement)) restoreSubsectionFocus.current = true;
        if (fits && nav.querySelector('select') === document.activeElement) restoreSubsectionFocus.current = true;
        return previous === fits ? previous : fits;
      });
    };
    const observer = new ResizeObserver(measure); observer.observe(nav); observer.observe(strip); measure();
    return () => observer.disconnect();
  }, [titles, subsectionLabel]);
  useLayoutEffect(() => {
    if (restoreSubsectionFocus.current) {
      if (showTabs) tabRefs.current[subsection]?.focus();
      else subsectionNav.current?.querySelector('select')?.focus();
      restoreSubsectionFocus.current = false;
    }
  }, [showTabs, subsection]);

  useLayoutEffect(() => { setPage(0); setSubsection(0); currentPage.current = 0; }, [resetKey]);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    let frame = 0;
    const clear = () => unitRefs.current.forEach(unit => unit?.querySelectorAll('[data-settings-page-hidden]')
      .forEach(node => node.removeAttribute('data-settings-page-hidden')));
    const show = (plan: Page) => {
      clear();
      unitRefs.current.forEach((unit, index) => {
        if (!unit) return;
        const slice = plan.find(item => item.unit === index);
        unit.classList.toggle('visible', Boolean(slice)); unit.inert = !slice;
        unit.setAttribute('aria-hidden', String(!slice));
        if (slice) slice.branches.forEach((leaves, node) => {
          if (!leaves.some(leaf => slice.leaves.includes(leaf))) node.setAttribute('data-settings-page-hidden', '');
        });
      });
    };
    const measure = () => {
      const focused = document.activeElement;
      const capacity = Math.max(1, element.clientHeight - 4);
      const next: Page[] = [];
      const originals = new Map<HTMLElement, HTMLElement>();
      let current: Page = []; let used = 0; let tooLarge = false;
      const nextTitles: string[] = [];
      unitRefs.current.slice(0, units.length).forEach((originalUnit, index) => {
        if (!originalUnit) return;
        nextTitles.push(originalUnit.querySelector('.settings-card-header strong, h2, h3, strong')?.textContent?.trim() || `${subsectionLabel || label} ${index + 1}`);
        if (subsectionLabel && index !== Math.min(subsection, units.length - 1)) return;
        // Measure inert copies so probing page sizes cannot blur live fields or
        // run component effects. Neutralize media before attaching the copy.
        const unit = originalUnit.cloneNode(true) as HTMLDivElement;
        const sourceNodes = [originalUnit, ...Array.from(originalUnit.querySelectorAll<HTMLElement>('*'))];
        const copiedNodes = [unit, ...Array.from(unit.querySelectorAll<HTMLElement>('*'))];
        copiedNodes.forEach((node, nodeIndex) => {
          originals.set(node, sourceNodes[nodeIndex]); node.removeAttribute('data-settings-page-hidden'); node.removeAttribute('id');
          if (node.matches('iframe, img, video, audio, source, link')) {
            const bounds = sourceNodes[nodeIndex].getBoundingClientRect();
            if (bounds.width > 0) node.style.width = `${bounds.width}px`;
            if (bounds.height > 0) node.style.height = `${bounds.height}px`;
            ['src', 'srcset', 'srcdoc', 'poster', 'href'].forEach(attribute => node.removeAttribute(attribute));
          }
        });
        unit.classList.remove('visible'); unit.inert = true; unit.setAttribute('aria-hidden', 'true'); element.appendChild(unit);
        const branches = new Map<HTMLElement, HTMLElement[]>();
        function collect(node: HTMLElement): HTMLElement[] {
          if (node.matches(KEEP)) return [];
          const overflow = getComputedStyle(node).overflowY;
          if (!node.matches(ATOMIC) && (overflow === 'auto' || overflow === 'scroll')) {
            // Inventory/log containers become row sources instead of retaining
            // their former internal scrolling inside a paginated settings view.
            node.setAttribute('data-settings-page-container', '');
            originals.get(node)?.setAttribute('data-settings-page-container', '');
          }
          const children = Array.from(node.children).filter((child): child is HTMLElement => child instanceof HTMLElement && !child.matches(KEEP)
            && getComputedStyle(child).display !== 'none' && getComputedStyle(child).position !== 'fixed' && child.getBoundingClientRect().height > 0);
          // Fields and buttons remain indivisible. Split rows in explicit layout
          // containers, and descend into oversized component-owned wrappers.
          const split = !node.matches(ATOMIC) && children.length > 0 && (node === unit || node.matches(CONTAINERS) || node.getBoundingClientRect().height > capacity * 0.65);
          const leaves = split ? children.flatMap(collect) : [node];
          branches.set(node, leaves);
          return leaves;
        }
        const leaves = collect(unit);
        const measureSlice = (slice: Slice): number => {
          unit.querySelectorAll('[data-settings-page-hidden]').forEach(node => node.removeAttribute('data-settings-page-hidden'));
          branches.forEach((descendants, node) => {
            if (!descendants.some(leaf => slice.leaves.includes(leaf))) node.setAttribute('data-settings-page-hidden', '');
          });
          return Math.ceil(unit.getBoundingClientRect().height);
        };
        let slice: Slice = { unit: index, leaves: [], branches };
        for (const leaf of leaves) {
          const candidate = { ...slice, leaves: [...slice.leaves, leaf] };
          const height = measureSlice(candidate);
          if (slice.leaves.length && used + height + (current.length ? 10 : 0) > capacity) {
            current.push(slice); next.push(current); current = []; used = 0;
            slice = { unit: index, leaves: [leaf], branches };
          } else if (!slice.leaves.length && current.length && used + height + 10 > capacity) {
            next.push(current); current = []; used = 0; slice = candidate;
          } else slice = candidate;
          if (measureSlice(slice) > capacity) tooLarge = true;
        }
        if (slice.leaves.length) {
          used += measureSlice(slice) + (current.length ? 10 : 0);
          current.push(slice);
        }
        unit.remove();
      });
      if (current.length) next.push(current);
      if (!next.length) next.push([]);
      const mapped = next.map(plan => plan.map(slice => ({ ...slice,
        leaves: slice.leaves.map(leaf => originals.get(leaf)!),
        branches: new Map([...slice.branches].map(([node, leaves]) => [originals.get(node)!, leaves.map(leaf => originals.get(leaf)!)]))
      })));
      plans.current = mapped;
      const focusedPage = focused instanceof HTMLElement ? mapped.findIndex(plan => plan.some(slice => slice.leaves.some(leaf => leaf.contains(focused)))) : -1;
      const selected = focusedPage >= 0 ? focusedPage : Math.min(currentPage.current, mapped.length - 1);
      currentPage.current = selected; show(mapped[selected]);
      setPage(selected); setPageCount(mapped.length); setOversized(tooLarge);
      setTitles(previous => JSON.stringify(previous) === JSON.stringify(nextTitles) ? previous : nextTitles);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule); observer.observe(element);
    unitRefs.current.forEach(unit => { if (unit) observer.observe(unit); });
    // Exclude visibility attributes so pagination cannot observe itself.
    const mutations = new MutationObserver(schedule);
    unitRefs.current.forEach(unit => { if (unit) mutations.observe(unit, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['open', 'hidden', 'style'] }); });
    measure();
    return () => { observer.disconnect(); mutations.disconnect(); cancelAnimationFrame(frame); clear(); };
  }, [children, units.length, subsection, subsectionLabel, label, resetKey]);

  function select(next: number): void {
    const selected = Math.min(pageCount - 1, Math.max(0, next));
    currentPage.current = selected; setPage(selected);
    const plan = plans.current[selected] || [];
    unitRefs.current.forEach((unit, index) => {
      if (!unit) return;
      unit.querySelectorAll('[data-settings-page-hidden]').forEach(node => node.removeAttribute('data-settings-page-hidden'));
      const slice = plan.find(item => item.unit === index);
      unit.classList.toggle('visible', Boolean(slice)); unit.inert = !slice; unit.setAttribute('aria-hidden', String(!slice));
      if (slice) slice.branches.forEach((leaves, node) => {
        if (!leaves.some(leaf => slice.leaves.includes(leaf))) node.setAttribute('data-settings-page-hidden', '');
      });
    });
    viewport.current?.focus();
  }
  function selectSubsection(next: number): void {
    setSubsection(Math.max(0, Math.min(units.length - 1, next))); setPage(0); currentPage.current = 0;
  }
  return <div className="settings-page-deck">
    {subsectionLabel && <nav ref={subsectionNav} className="settings-subsection-navigation" aria-label={subsectionLabel}>
      <button type="button" aria-label={`${subsectionLabel}: ←`} disabled={subsection === 0} onClick={() => selectSubsection(subsection - 1)}>‹</button>
      <div ref={tabStrip} className={`settings-subsection-tabs${showTabs ? '' : ' measuring'}`} role="tablist" aria-label={subsectionLabel}
        aria-hidden={!showTabs} inert={!showTabs}>
        {units.map((_, index) => <button key={index} ref={node => { tabRefs.current[index] = node; }} type="button" role="tab"
          id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`}
          aria-selected={index === subsection} tabIndex={index === subsection ? 0 : -1} onClick={() => selectSubsection(index)}
          onKeyDown={event => {
            const next = event.key === 'ArrowRight' ? (index + 1) % units.length : event.key === 'ArrowLeft' ? (index + units.length - 1) % units.length
              : event.key === 'Home' ? 0 : event.key === 'End' ? units.length - 1 : null;
            if (next !== null) { event.preventDefault(); selectSubsection(next); tabRefs.current[next]?.focus(); }
          }}>{titles[index] || `${subsectionLabel} ${index + 1}`}</button>)}
      </div>
      {!showTabs && <label><span className="sr-only">{subsectionLabel}</span><select value={subsection} onChange={event => selectSubsection(Number(event.target.value))}>
        {units.map((_, index) => <option key={index} value={index}>{titles[index] || `${subsectionLabel} ${index + 1}`}</option>)}
      </select></label>}
      <span className="settings-subsection-counter">{Math.min(subsection + 1, units.length)} / {units.length}</span>
      <button type="button" aria-label={`${subsectionLabel}: →`} disabled={subsection >= units.length - 1} onClick={() => selectSubsection(subsection + 1)}>›</button>
    </nav>}
    <div className={`settings-page-viewport${oversized ? ' settings-page-emergency-overflow' : ''}`} ref={viewport} tabIndex={-1}>
      {units.map((unit, index) => <div key={typeof unit === 'object' && unit && 'key' in unit ? String(unit.key) : index}
        ref={node => { unitRefs.current[index] = node; }} className="settings-page-unit" id={`${id}-panel-${index}`}
        role={subsectionLabel ? 'tabpanel' : undefined} aria-labelledby={subsectionLabel && showTabs ? `${id}-tab-${index}` : undefined}
        aria-label={subsectionLabel && !showTabs ? titles[index] : undefined}>{unit}</div>)}
    </div>
    <nav className="settings-page-navigation" aria-label={label} onKeyDown={event => {
      const next = event.key === 'ArrowRight' || event.key === 'PageDown' ? page + 1
        : event.key === 'ArrowLeft' || event.key === 'PageUp' ? page - 1
          : event.key === 'Home' ? 0 : event.key === 'End' ? pageCount - 1 : null;
      if (next !== null) { event.preventDefault(); select(next); }
    }}>
      <button type="button" aria-label={`${label}: ←`} disabled={page === 0} onClick={() => select(page - 1)}>‹</button>
      <label><span className="sr-only">{label}</span><select value={page} onChange={event => select(Number(event.target.value))}>
        {Array.from({ length: pageCount }, (_, index) => <option key={index} value={index}>{label} {index + 1}</option>)}
      </select></label>
      <button type="button" aria-label={`${label}: →`} disabled={page === pageCount - 1} onClick={() => select(page + 1)}>›</button>
      <span className="settings-page-count" role="status" aria-live="polite">{page + 1} / {pageCount}</span>
    </nav>
  </div>;
}
