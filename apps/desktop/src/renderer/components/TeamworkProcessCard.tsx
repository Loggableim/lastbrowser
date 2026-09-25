/**
 * TeamworkProcessCard.tsx
 *
 * Renders an elegant collapsible accordion for messages created in Teamwork Mode.
 * Displays the consensus and debate process, parallel model drafts, and critic analysis,
 * keeping the conversation clean and readable while allowing full transparency.
 */

import React, { useState } from 'react';
import {
  Users,
  ChevronDown,
  ChevronUp,
  Brain,
  Zap,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  Search
} from 'lucide-react';

export interface TeamworkDraft {
  model: string;
  name: string;
  role: string;
  content: string;
  execution_ms: number;
  error?: string | null;
  swapped?: boolean;
}

export interface TeamworkMetadata {
  strategy?: string;
  models_used?: string[];
  drafts?: TeamworkDraft[];
  critic?: {
    model: string;
    review: string;
    execution_ms: number;
  };
  stats?: {
    duration_ms: number;
    drafts_count: number;
    auto_scaled: boolean;
  };
}

export function TeamworkProcessCard({
  metadata
}: {
  metadata: TeamworkMetadata;
}): JSX.Element | null {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'critic' | number>('critic');

  if (!metadata || (!metadata.drafts?.length && !metadata.critic)) {
    return null;
  }

  const drafts = metadata.drafts || [];
  const critic = metadata.critic;
  const stats = metadata.stats;
  const durationSec = stats ? (stats.duration_ms / 1000).toFixed(1) : null;
  const successfulDrafts = drafts.filter((d) => !d.error && d.content);

  const strategyLabel =
    metadata.strategy === 'cost'
      ? 'Kosten & Tempo'
      : metadata.strategy === 'quality'
      ? 'Maximale Qualität'
      : 'Ausgewogen';

  return (
    <div
      className="teamwork-process-card"
      style={{
        margin: '0.5rem 0 0.85rem 0',
        borderRadius: '8px',
        border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
        background: 'var(--card-bg, rgba(255, 255, 255, 0.025))',
        overflow: 'hidden',
        fontSize: '0.85rem',
        transition: 'all 0.2s ease'
      }}
    >
      {/* Accordion Header */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.6rem 0.85rem',
          background: isExpanded ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background 0.2s ease'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              background: 'rgba(99, 102, 241, 0.15)',
              color: 'var(--accent, #6366f1)'
            }}
          >
            <Users size={14} />
          </span>

          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            🤝 {successfulDrafts.length} {successfulDrafts.length === 1 ? 'Modell debattiert' : 'Modelle debattiert'}
          </span>

          {durationSec && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <Clock size={12} />
              {durationSec}s
            </span>
          )}

          <span
            style={{
              fontSize: '0.7rem',
              padding: '1px 6px',
              borderRadius: '4px',
              background: 'rgba(255, 255, 255, 0.06)',
              color: 'var(--text-secondary)'
            }}
          >
            {strategyLabel}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
          <span style={{ fontSize: '0.75rem' }}>
            {isExpanded ? 'Details verbergen' : 'Debatte & Kritik anzeigen'}
          </span>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Expanded Accordion Body */}
      {isExpanded && (
        <div style={{ borderTop: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', padding: '0.75rem 0.85rem' }}>
          {/* Tab Navigation */}
          <div
            style={{
              display: 'flex',
              gap: '0.4rem',
              borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.06))',
              paddingBottom: '0.5rem',
              marginBottom: '0.75rem',
              overflowX: 'auto'
            }}
          >
            {critic && (
              <button
                type="button"
                onClick={() => setActiveTab('critic')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.3rem 0.6rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeTab === 'critic' ? 'var(--accent, #6366f1)' : 'rgba(255, 255, 255, 0.05)',
                  color: activeTab === 'critic' ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: 500
                }}
              >
                <Sparkles size={13} />
                <span>Critic-Review</span>
              </button>
            )}

            {drafts.map((draft, idx) => (
              <button
                key={`${draft.model}-${idx}`}
                type="button"
                onClick={() => setActiveTab(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.3rem 0.6rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeTab === idx ? 'var(--accent, #6366f1)' : 'rgba(255, 255, 255, 0.05)',
                  color: activeTab === idx ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: 500
                }}
              >
                <span>{draft.name || draft.model}</span>
                {draft.role && (
                  <span style={{ opacity: 0.8, fontSize: '0.7rem' }}>
                    ({draft.role})
                  </span>
                )}
                {draft.error && <AlertCircle size={12} style={{ color: '#ef4444' }} />}
              </button>
            ))}
          </div>

          {/* Tab Content: Critic */}
          {activeTab === 'critic' && critic && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600, fontSize: '0.82rem' }}>
                  <Sparkles size={14} style={{ color: 'var(--accent, #6366f1)' }} />
                  <span>Cross-Review & Analyse ({critic.model})</span>
                </div>
                {critic.execution_ms > 0 && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {critic.execution_ms}ms
                  </span>
                )}
              </div>
              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: '6px',
                  background: 'rgba(99, 102, 241, 0.05)',
                  border: '1px solid rgba(99, 102, 241, 0.15)',
                  fontSize: '0.8rem',
                  lineHeight: 1.45,
                  whiteSpace: 'pre-wrap',
                  maxHeight: '260px',
                  overflowY: 'auto'
                }}
              >
                {critic.review}
              </div>
            </div>
          )}

          {/* Tab Content: Worker Draft */}
          {typeof activeTab === 'number' && drafts[activeTab] && (
            <div>
              {(() => {
                const draft = drafts[activeTab];
                return (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                          {draft.name || draft.model}
                        </span>
                        {draft.role && (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'rgba(99, 102, 241, 0.15)',
                              color: 'var(--accent, #6366f1)'
                            }}
                          >
                            Rolle: {draft.role}
                          </span>
                        )}
                        {draft.swapped && (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'rgba(234, 179, 8, 0.15)',
                              color: '#eab308'
                            }}
                          >
                            Hot-Swapped
                          </span>
                        )}
                      </div>
                      {draft.execution_ms > 0 && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                          {draft.execution_ms}ms
                        </span>
                      )}
                    </div>

                    {draft.error ? (
                      <div
                        style={{
                          padding: '0.6rem 0.8rem',
                          borderRadius: '6px',
                          background: 'rgba(239, 68, 68, 0.1)',
                          color: '#ef4444',
                          fontSize: '0.8rem'
                        }}
                      >
                        ⚠️ Ausfall / Fehler: {draft.error}
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: '0.75rem',
                          borderRadius: '6px',
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                          fontSize: '0.8rem',
                          lineHeight: 1.45,
                          whiteSpace: 'pre-wrap',
                          maxHeight: '260px',
                          overflowY: 'auto'
                        }}
                      >
                        {draft.content}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
