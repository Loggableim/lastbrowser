import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Clock, Users, AlertCircle, Sparkles } from 'lucide-react';
import { useDesktopI18n } from '../i18n.js';
import type { TeamworkMetadata, TeamworkStage } from '../teamwork-live-stream.js';
import type { DesktopLocaleId } from '../i18n/keys.js';

export type { TeamworkDraft, TeamworkMetadata } from '../teamwork-live-stream.js';

const stageCopy: Record<DesktopLocaleId, Record<TeamworkStage, string>> = {
  en: { grounding: 'Context', planning: 'Planning', debate: 'Parallel contributions', critic: 'Review', synthesizing: 'Combining', single_provider: 'One model' },
  de: { grounding: 'Kontext', planning: 'Planung', debate: 'Parallele Beiträge', critic: 'Prüfung', synthesizing: 'Zusammenführen', single_provider: 'Ein Modell' },
  it: { grounding: 'Contesto', planning: 'Pianificazione', debate: 'Contributi paralleli', critic: 'Revisione', synthesizing: 'Sintesi', single_provider: 'Un modello' },
  es: { grounding: 'Contexto', planning: 'Planificación', debate: 'Aportaciones paralelas', critic: 'Revisión', synthesizing: 'Síntesis', single_provider: 'Un modelo' },
  fr: { grounding: 'Contexte', planning: 'Planification', debate: 'Contributions parallèles', critic: 'Vérification', synthesizing: 'Synthèse', single_provider: 'Un modèle' },
  'pt-BR': { grounding: 'Contexto', planning: 'Planejamento', debate: 'Contribuições paralelas', critic: 'Revisão', synthesizing: 'Síntese', single_provider: 'Um modelo' },
  ru: { grounding: 'Контекст', planning: 'Планирование', debate: 'Параллельные ответы', critic: 'Проверка', synthesizing: 'Объединение', single_provider: 'Одна модель' },
  ja: { grounding: 'コンテキスト', planning: '計画', debate: '並行する回答', critic: 'レビュー', synthesizing: '統合', single_provider: '単一モデル' },
};

export function TeamworkProcessCard({ metadata }: { metadata: TeamworkMetadata }): JSX.Element | null {
  const { locale, t } = useDesktopI18n();
  const [isExpanded, setIsExpanded] = useState(false);
  if (!metadata) return null;

  const drafts = metadata.drafts || [];
  const plannedWorkers = metadata.plannedWorkers || [];
  const successfulDrafts = drafts.filter((draft) => draft.status === 'complete' && !draft.error && draft.content);
  const failedDrafts = drafts.filter((draft) => draft.status === 'failed' || draft.status === 'skipped' || Boolean(draft.error));
  const explicitStatus = metadata.cancelled ? 'stopped' : metadata.status;
  const statusKey = explicitStatus === 'running' || explicitStatus === undefined
    ? 'teamwork.process.running'
    : explicitStatus === 'stopped'
    ? 'teamwork.process.stopped'
    : explicitStatus === 'failed' || (drafts.length > 0 && drafts.every((draft) => draft.status !== 'running') && successfulDrafts.length === 0 && failedDrafts.length > 0)
    ? 'teamwork.process.failed'
    : explicitStatus === 'partial' || (successfulDrafts.length > 0 && failedDrafts.length > 0)
    ? 'teamwork.process.partial'
    : explicitStatus === 'complete' ? 'teamwork.process.complete' : 'teamwork.process.running';

  if (!drafts.length && !plannedWorkers.length && !metadata.critic && !metadata.status && !metadata.stage && !metadata.cancelled) return null;
  const matchedDrafts = new Set<number>();
  const workerRows = plannedWorkers.map((planned) => {
    const matchIndex = drafts.findIndex((draft, index) => !matchedDrafts.has(index) && (
      Boolean(planned.workerId && draft.workerId === planned.workerId)
      || planned.workerIndex !== undefined && draft.workerIndex === planned.workerIndex
      || Boolean(planned.model && draft.model === planned.model && (!planned.role || draft.role === planned.role))
    ));
    if (matchIndex < 0) return planned;
    matchedDrafts.add(matchIndex);
    return { ...planned, ...drafts[matchIndex] };
  });
  drafts.forEach((draft, index) => { if (!matchedDrafts.has(index)) workerRows.push(draft); });
  const summaryCount = workerRows.length;
  const durationSec = metadata.stats ? (metadata.stats.duration_ms / 1000).toFixed(1) : null;
  const strategy = metadata.strategy === 'cost' ? 'cost' : metadata.strategy === 'quality' ? 'quality' : 'balanced';
  const providerNames: Record<string, string> = {
    openai: 'OpenAI', 'openai-codex': 'OpenAI', google: 'Google', gemini: 'Gemini', 'google-gemini-cli': 'Gemini',
    anthropic: 'Anthropic', ollama: 'Ollama', ollama_cloud: 'Ollama Cloud', 'ollama-cloud': 'Ollama Cloud',
  };

  return (
    <section className="teamwork-process-card" style={{ margin: '0.5rem 0 0.85rem', borderRadius: '8px', border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))', background: 'var(--card-bg, rgba(255,255,255,0.025))', overflow: 'hidden', fontSize: '0.85rem' }}>
      <button type="button" aria-expanded={isExpanded} onClick={() => setIsExpanded((value) => !value)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.65rem 0.85rem', background: isExpanded ? 'rgba(99,102,241,0.08)' : 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <Users size={15} aria-hidden="true" />
          <strong>{t('teamwork.process.summary', { count: summaryCount, status: t(statusKey) })}</strong>
          {durationSec && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}><Clock size={12} />{durationSec}s</span>}
          <span className="native-rest-pill">{t(`teamwork.strategy.${strategy}`)}</span>
          {metadata.stage && <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{stageCopy[locale][metadata.stage]}</span>}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
          {t('teamwork.process.details')}{isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>

      {!isExpanded && drafts.some((draft) => draft.status === 'running' && draft.content) && (
        <div aria-live="off" style={{ padding: '0 0.85rem 0.7rem', color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.4 }}>
          {drafts.filter((draft) => draft.status === 'running' && draft.content).slice(0, 2).map((draft) => (
            <div key={draft.workerId || `${draft.provider}-${draft.model}-${draft.role}`}>
              <strong>{draft.name || draft.role || t('teamwork.process.contributor')}:</strong> {draft.content.slice(-180)}
            </div>
          ))}
        </div>
      )}

      {isExpanded && (
        <div style={{ display: 'grid', gap: '0.65rem', borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.08))', padding: '0.75rem 0.85rem' }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{t('teamwork.process.final')}</p>
          {metadata.candidateDiagnostics?.length ? <section aria-label={t('teamwork.process.candidateDiagnostics', { count: metadata.candidateDiagnostics.length })} style={{ display: 'grid', gap: '0.4rem' }}>
            <strong>{t('teamwork.process.candidateDiagnostics', { count: metadata.candidateDiagnostics.length })}</strong>
            {metadata.candidateDiagnostics.map((diagnostic, index) => <div key={`${diagnostic.provider}-${diagnostic.model}-${index}`} style={{ display: 'grid', gap: '0.15rem', color: 'var(--text-secondary)' }}>
              <span>{diagnostic.provider} · {diagnostic.model}</span>
              <code>{t('teamwork.process.diagnostic', { code: diagnostic.code })}</code>
            </div>)}
          </section> : null}
          {workerRows.map((draft, index) => (
            <article key={`${draft.name || 'contribution'}-${index}`} style={{ padding: '0.7rem', borderRadius: '6px', border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <strong>{draft.name || (draft.role === 'single_provider' ? stageCopy[locale].single_provider : draft.role) || t('teamwork.process.contributor')}</strong>
                {draft.status === 'planned' ? <span style={{ color: 'var(--text-secondary)' }}>{t('teamwork.process.planned')}</span>
                  : draft.status === 'running' ? <span style={{ color: 'var(--text-secondary)' }}>{t('teamwork.process.running')}</span>
                  : draft.status === 'skipped' ? <span style={{ color: 'var(--text-secondary)' }}>{t('teamwork.process.skipped')}</span>
                  : draft.status === 'aborted' ? <span style={{ color: 'var(--text-secondary)' }}>{t('teamwork.process.aborted')}</span>
                  : draft.error || draft.status === 'failed' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#ef4444' }}><AlertCircle size={13} />{t('teamwork.process.failed')}</span>
                  : draft.execution_ms > 0 ? <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>{draft.execution_ms}ms</span> : null}
              </div>
              {draft.role && <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>{draft.role}</div>}
              {(draft.provider || draft.model) && <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginBottom: '0.35rem' }}>
                {[draft.provider ? (providerNames[draft.provider.toLowerCase()] || draft.provider) : '', draft.model].filter(Boolean).join(' · ')}
              </div>}
              {draft.error || draft.status === 'failed' ? <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{draft.error || t('teamwork.process.failed')}</p>
                : draft.content ? <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{draft.content}</div> : null}
              {draft.failureCode && <p style={{ margin: '0.35rem 0 0', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                <code>{t('teamwork.process.diagnostic', { code: draft.failureCode })}</code>
              </p>}
            </article>
          ))}
          {metadata.critic && (
            <article style={{ padding: '0.7rem', borderRadius: '6px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}><Sparkles size={14} />{t('teamwork.process.critic')}</strong>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{metadata.critic.review}</div>
            </article>
          )}
        </div>
      )}
    </section>
  );
}
