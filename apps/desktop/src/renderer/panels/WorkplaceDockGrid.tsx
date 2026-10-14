import React, { useEffect, useRef, useState } from 'react';
import { GripVertical, Settings2, ArrowUp, ArrowDown } from 'lucide-react';
import type { WorkplaceState } from './workplace-widgets.js';
import { moveWorkplaceWidget, type WorkplaceWidgetId, type WorkplaceDock, type WorkplaceSize } from './workplace-layout.js';

export function WorkplaceDockGrid({ state, update, labels, widgets, german }: {
  state: WorkplaceState; update: (change: (previous: WorkplaceState) => WorkplaceState) => void;
  labels: Record<WorkplaceWidgetId, string>; widgets: Partial<Record<WorkplaceWidgetId, React.ReactNode>>; german: boolean;
}): JSX.Element {
  const [dragged, setDragged] = useState<WorkplaceWidgetId | null>(null);
  const [message, setMessage] = useState('');
  const focusAfterMove = useRef<WorkplaceWidgetId | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusAfterMove.current) return;
    gridRef.current?.querySelector<HTMLElement>(`[data-widget="${focusAfterMove.current}"] summary`)?.focus();
    focusAfterMove.current = null;
  }, [state.layout]);
  const dockNames: Record<WorkplaceDock, string> = { top: german ? 'Oben angedockt' : 'Docked at top', main: german ? 'Arbeitsfläche' : 'Workspace', bottom: german ? 'Unten angedockt' : 'Docked at bottom' };
  const sizes: Record<WorkplaceSize, string> = { compact: german ? 'Klein' : 'Small', medium: german ? 'Mittel' : 'Medium', wide: german ? 'Breit' : 'Wide' };
  const move = (id: WorkplaceWidgetId, target: WorkplaceWidgetId | null, dock: WorkplaceDock, restoreFocus = false) => {
    if (restoreFocus) focusAfterMove.current = id;
    update(previous => ({ ...previous, layout: moveWorkplaceWidget(previous.layout, id, target, dock) }));
    setDragged(null); setMessage(`${labels[id]} · ${dockNames[dock]}`);
  };
  const drop = (event: React.DragEvent, target: WorkplaceWidgetId | null, dock: WorkplaceDock) => {
    if (!dragged) return;
    event.preventDefault(); event.stopPropagation();
    const id = event.dataTransfer.getData('application/x-lastbrowser-widget');
    if (dragged && id === dragged) move(dragged, target, dock);
  };
  const step = (id: WorkplaceWidgetId, direction: -1 | 1) => {
    const dock = state.layout.tiles[id].dock;
    const sameDock = state.layout.order.filter(item => state.layout.tiles[item].dock === dock && widgets[item]);
    const index = sameDock.indexOf(id), adjacent = sameDock[index + direction];
    if (!adjacent) return;
    move(id, direction === -1 ? adjacent : sameDock[index + 2] || null, dock, true);
  };
  return <div ref={gridRef} className={`workplace-dock-layout ${dragged ? 'is-dragging' : ''}`}>
    <span className="workplace-layout-announcement" role="status">{message}</span>
    {(['top', 'main', 'bottom'] as const).map(dock => <div key={dock} className="workplace-dock-zone" data-dock={dock}
      onDragOver={event => { if (dragged) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }} onDrop={event => drop(event, null, dock)}>
      {dragged && <span className="workplace-drop-label">{dockNames[dock]}</span>}
      {state.layout.order.filter(id => state.layout.tiles[id].dock === dock && widgets[id]).map(id => {
        const sameDock = state.layout.order.filter(item => state.layout.tiles[item].dock === dock && widgets[item]);
        return <article key={id} className={`workplace-dock-tile ${dragged === id ? 'is-moving' : ''}`} data-widget={id} data-size={state.layout.tiles[id].size}
          aria-label={labels[id]} onDragOver={event => { if (dragged) { event.preventDefault(); event.stopPropagation(); } }} onDrop={event => drop(event, id, dock)}>
          <header className="workplace-dock-controls">
            <button type="button" draggable className="workplace-drag-handle" aria-label={`${labels[id]} · ${german ? 'Ziehen zum Verschieben' : 'Drag to move'}`}
              onDragStart={event => { event.dataTransfer.setData('application/x-lastbrowser-widget', id); event.dataTransfer.effectAllowed = 'move'; setDragged(id); }} onDragEnd={() => setDragged(null)}><GripVertical size={14}/><span>{labels[id]}</span></button>
            <details className="workplace-tile-options"><summary aria-label={`${labels[id]} · ${german ? 'Anordnung und Größe' : 'Layout and size'}`}><Settings2 size={14}/></summary>
              <div className="workplace-tile-options-content">
                <div className="workplace-move-buttons"><button type="button" disabled={sameDock[0] === id} onClick={() => step(id, -1)}><ArrowUp size={14}/>{german ? 'Vorher' : 'Earlier'}</button><button type="button" disabled={sameDock.at(-1) === id} onClick={() => step(id, 1)}><ArrowDown size={14}/>{german ? 'Nachher' : 'Later'}</button></div>
                <label>{german ? 'Größe' : 'Size'}<select value={state.layout.tiles[id].size} onChange={event => { const size = event.target.value as WorkplaceSize; update(previous => ({ ...previous, layout: { ...previous.layout, tiles: { ...previous.layout.tiles, [id]: { ...previous.layout.tiles[id], size } } } })); }}>
                  {(Object.keys(sizes) as WorkplaceSize[]).map(size => <option key={size} value={size}>{sizes[size]}</option>)}</select></label>
                <label>{german ? 'Andocken' : 'Dock'}<select value={dock} onChange={event => move(id, null, event.target.value as WorkplaceDock, true)}>{(Object.keys(dockNames) as WorkplaceDock[]).map(value => <option key={value} value={value}>{dockNames[value]}</option>)}</select></label>
              </div>
            </details>
          </header>
          <div className="workplace-dock-content">{widgets[id]}</div>
        </article>;
      })}
    </div>)}
  </div>;
}
