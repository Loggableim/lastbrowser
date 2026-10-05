import { useEffect,useRef,useState,type ReactNode } from 'react';
import type { ChildRunIdentity, ChildRunSnapshot, ChildRunStatus } from '../child-run-contracts.js';
import type { ChildRunState } from '../child-run-controller.js';
import './child-run.css';
export type ChildRunLocale = 'en' | 'de' | 'es' | 'fr' | 'it' | 'pt' | 'ru' | 'ja';
export type ChildRunLabels = Readonly<{ children: string; child: string; resync: string; stale: string; truncated: string; overflow: string; statuses: Readonly<Record<ChildRunStatus, string>> }>;
function labels(children: string, child: string, resync: string, stale: string, truncated: string, overflow: string, statuses: readonly string[]): ChildRunLabels {
  return { children, child, resync, stale, truncated, overflow, statuses: Object.fromEntries(['queued', 'running', 'waiting_for_approval', 'paused', 'completed', 'failed', 'cancelled', 'interrupted'].map((key, i) => [key, statuses[i]])) as Record<ChildRunStatus, string> };
}
export const childRunLabels: Readonly<Record<ChildRunLocale, ChildRunLabels>> = {
  en: labels('Subagents', 'Subagent', 'Refresh', 'Updates missing', 'Display shortened', 'More runs require refresh', ['Queued', 'Running', 'Awaiting approval', 'Paused', 'Completed', 'Failed', 'Cancelled', 'Interrupted']),
  de: labels('Unteragenten', 'Unteragent', 'Aktualisieren', 'Aktualisierungen fehlen', 'Anzeige gekürzt', 'Weitere Läufe benötigen Aktualisierung', ['Wartend', 'Läuft', 'Wartet auf Freigabe', 'Pausiert', 'Abgeschlossen', 'Fehlgeschlagen', 'Abgebrochen', 'Unterbrochen']),
  es: labels('Subagentes', 'Subagente', 'Actualizar', 'Faltan actualizaciones', 'Vista abreviada', 'Más ejecuciones requieren actualización', ['En cola', 'En ejecución', 'Espera aprobación', 'En pausa', 'Completado', 'Fallido', 'Cancelado', 'Interrumpido']),
  fr: labels('Sous-agents', 'Sous-agent', 'Actualiser', 'Mises à jour manquantes', 'Affichage abrégé', 'Actualisation requise pour les autres exécutions', ['En attente', 'En cours', 'Attend une approbation', 'En pause', 'Terminé', 'Échec', 'Annulé', 'Interrompu']),
  it: labels('Sottoagenti', 'Sottoagente', 'Aggiorna', 'Aggiornamenti mancanti', 'Vista abbreviata', 'Altre esecuzioni richiedono un aggiornamento', ['In coda', 'In esecuzione', 'Attende approvazione', 'In pausa', 'Completato', 'Fallito', 'Annullato', 'Interrotto']),
  pt: labels('Subagentes', 'Subagente', 'Atualizar', 'Atualizações ausentes', 'Exibição abreviada', 'Mais execuções precisam de atualização', ['Na fila', 'Em execução', 'Aguarda aprovação', 'Pausado', 'Concluído', 'Falhou', 'Cancelado', 'Interrompido']),
  ru: labels('Субагенты', 'Субагент', 'Обновить', 'Пропущены обновления', 'Показ сокращён', 'Другие запуски требуют обновления', ['В очереди', 'Выполняется', 'Ожидает разрешения', 'Приостановлен', 'Завершён', 'Ошибка', 'Отменён', 'Прерван']),
  ja: labels('サブエージェント', 'サブエージェント', '更新', '更新が欠落しています', '表示を短縮しました', '他の実行には更新が必要です', ['待機中', '実行中', '承認待ち', '一時停止', '完了', '失敗', 'キャンセル済み', '中断']),
};
export type ChildRunBubblesProps = Readonly<{ state: ChildRunState; locale?: ChildRunLocale; localizedLabels?: ChildRunLabels; defaultOpen?: boolean; onResync: (identity: ChildRunIdentity) => void; renderContent?: (content: string) => ReactNode }>;
function ChildMessage({content,role,renderContent}:Readonly<{content:string;role:string;renderContent?: (content:string)=>ReactNode}>){
  const root=useRef<HTMLDivElement>(null),latest=useRef(content);latest.current=content;
  const [displayed,setDisplayed]=useState(content);
  useEffect(()=>{
    const refresh=()=>{const selected=document.getSelection();if(selected&&!selected.isCollapsed
      &&(root.current?.contains(selected.anchorNode)||root.current?.contains(selected.focusNode)))return;
      setDisplayed(latest.current);};
    refresh();document.addEventListener('selectionchange',refresh);return()=>document.removeEventListener('selectionchange',refresh);
  },[content]);
  return <div ref={root} className="child-run-message" data-role={role}>{renderContent?renderContent(displayed):<span className="child-run-plain">{displayed}</span>}</div>;
}
export function getSubagentColorIndex(subagentId: string): number {
  let hash = 0;
  for (let i = 0; i < subagentId.length; i++) {
    hash = (Math.imul(31, hash) + subagentId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 8;
}
function ChildRunBubbleItem({
  snapshot,
  requiresResync,
  truncated,
  text,
  defaultOpen,
  onResync,
  renderContent,
}: Readonly<{
  snapshot: ChildRunSnapshot;
  requiresResync: boolean;
  truncated?: boolean;
  text: ChildRunLabels;
  defaultOpen?: boolean;
  onResync: (identity: ChildRunIdentity) => void;
  renderContent?: (content: string) => ReactNode;
}>) {
  const isRunning = snapshot.status === 'running';
  const colorIndex = getSubagentColorIndex(snapshot.subagentId);
  const depthIndent = Math.max(0, (snapshot.depth || 1) - 1);
  const [isOpen, setIsOpen] = useState(defaultOpen ?? false);

  return (
    <details
      className="child-run-bubble"
      key={snapshot.subagentId}
      data-status={snapshot.status}
      data-color-index={colorIndex}
      data-depth={snapshot.depth}
      open={isOpen}
      onToggle={(e) => {
        setIsOpen(e.currentTarget.open);
      }}
      style={{
        '--child-depth': depthIndent,
      } as React.CSSProperties}
    >
      <summary>
        <span className="child-run-title">{snapshot.title || text.child}</span>
        <span className="child-run-status">
          {isRunning && <span className="child-run-streaming-dot" aria-hidden="true" />}
          {text.statuses[snapshot.status]}
        </span>
        <span className="child-run-model">{snapshot.model.provider} · {snapshot.model.model}</span>
      </summary>
      <div className="child-run-content">
        <small className="child-run-identity">{snapshot.subagentId}</small>
        {requiresResync && (
          <p role="status">
            {text.stale} <button type="button" onClick={() => onResync(snapshot)}>{text.resync}</button>
          </p>
        )}
        {snapshot.messages.map((message) => (
          <ChildMessage
            key={message.id}
            content={message.content}
            role={message.role}
            renderContent={renderContent}
          />
        ))}
        {truncated && <p role="status">{text.truncated}</p>}
      </div>
    </details>
  );
}
/** Native details keeps keyboard disclosure local; opening/closing has no control effect. */
export function ChildRunBubbles({ state, locale = 'en', localizedLabels, defaultOpen, onResync, renderContent }: ChildRunBubblesProps) {
  const text = localizedLabels ?? childRunLabels[locale];
  const entries = Object.values(state.children);
  if (!entries.length && !Object.keys(state.missing).length && !state.overflow) return null;
  return <section className="child-run-list" aria-label={text.children}>
    {entries.map(({ snapshot, requiresResync, truncated }) => (
      <ChildRunBubbleItem
        key={snapshot.subagentId}
        snapshot={snapshot}
        requiresResync={requiresResync}
        truncated={truncated}
        text={text}
        defaultOpen={defaultOpen}
        onResync={onResync}
        renderContent={renderContent}
      />
    ))}
    {Object.values(state.missing).map(identity => <p role="status" key={identity.subagentId}>{text.stale} · {identity.subagentId} <button type="button" onClick={() => onResync(identity)}>{text.resync}</button></p>)}
    {state.overflow && <p role="status">{text.overflow}</p>}
  </section>;
}
