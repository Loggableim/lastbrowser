import React, { useId, useState } from 'react';
import { Target, ChevronDown, ChevronUp, Cpu, Zap, ShieldCheck, Clock, FileText, CheckCircle2 } from 'lucide-react';
import { useDesktopI18n } from '../i18n.js';

export interface SmartTrackMetadata {
  effort?: 'low' | 'medium' | 'high' | string;
  intent?: 'coding' | 'web' | 'reasoning' | 'general' | string;
  model?: string;
  provider?: string;
  name?: string;
  tags?: string[];
  preplan?: string | null;
  preplan_ms?: number;
  execution_ms?: number;
  total_ms?: number;
}

interface SmartTrackProcessCardProps {
  metadata?: unknown;
}

export const SmartTrackProcessCard: React.FC<SmartTrackProcessCardProps> = ({ metadata }) => {
  const { t } = useDesktopI18n();
  const [expanded, setExpanded] = useState(false);
  const [preplanOpen, setPreplanOpen] = useState(false);
  const detailsId = useId();

  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const meta = metadata as SmartTrackMetadata;
  const effort = (meta.effort || 'medium').toLowerCase();
  const intent = (meta.intent || 'general').toLowerCase();

  const effortColors = {
    low: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)', text: '#10b981', label: t('smartTrack.effort.low') },
    medium: { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)', text: '#3b82f6', label: t('smartTrack.effort.medium') },
    high: { bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.3)', text: '#a855f7', label: t('smartTrack.effort.high') },
  }[effort as 'low' | 'medium' | 'high'] || {
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.3)',
    text: '#3b82f6',
    label: effort.toUpperCase(),
  };

  const intentLabels: Record<string, string> = {
    coding: t('smartTrack.intent.coding'),
    web: t('smartTrack.intent.web'),
    reasoning: t('smartTrack.intent.reasoning'),
    general: t('smartTrack.intent.general'),
  };

  const totalTime = meta.total_ms || meta.execution_ms || 0;

  return (
    <div
      className="smart-track-process-card"
      style={{
        margin: '0.4rem 0 0.6rem 0',
        borderRadius: '8px',
        border: `1px solid ${effortColors.border}`,
        background: 'var(--bg-secondary, rgba(255, 255, 255, 0.03))',
        fontSize: '0.8rem',
        overflow: 'hidden',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Header Pill Bar */}
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`${detailsId}-details`}
        style={{
          width: '100%',
          border: 0,
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.4rem 0.65rem',
          cursor: 'pointer',
          userSelect: 'none',
          gap: '0.5rem',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: effortColors.bg,
              color: effortColors.text,
              fontWeight: 600,
              fontSize: '0.72rem',
              letterSpacing: '0.02em',
            }}
          >
            <Target size={12} />
            {effortColors.label}
          </span>

          <span style={{ color: 'var(--text-muted, #888)', fontSize: '0.75rem' }}>→</span>

          <span style={{ fontWeight: 600, color: 'var(--text-primary, #eee)' }}>
            {meta.name || meta.model || t('smartTrack.model.none')}
          </span>

          <span
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'rgba(255, 255, 255, 0.06)',
              color: 'var(--text-secondary, #aaa)',
              fontSize: '0.7rem',
            }}
          >
            {intentLabels[intent] || intent}
          </span>
        </span>

        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {totalTime > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                color: 'var(--text-muted, #777)',
                fontSize: '0.72rem',
              }}
            >
              <Clock size={11} />
              {totalTime}ms
            </span>
          )}

          <span
            style={{
              padding: '2px 5px',
              borderRadius: '4px',
              background: 'rgba(16, 185, 129, 0.1)',
              color: '#10b981',
              fontSize: '0.68rem',
              fontWeight: 500,
            }}
            title={t('smartTrack.singleTrack')}
          >
            {t('smartTrack.singleTrack')}
          </span>

          {expanded ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
        </span>
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div
          id={`${detailsId}-details`}
          style={{
            padding: '0.5rem 0.65rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            background: 'rgba(0, 0, 0, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            <span><strong>{t('smartTrack.modelId')}</strong> <code>{meta.model}</code> ({meta.provider})</span>
            <span><strong>{t('smartTrack.executionTime')}</strong> {meta.execution_ms || totalTime}ms</span>
          </div>

          {/* High Tier Preplan Accordion */}
          {meta.preplan && (
            <div
              style={{
                marginTop: '0.3rem',
                borderRadius: '6px',
                border: '1px solid rgba(168, 85, 247, 0.25)',
                background: 'rgba(168, 85, 247, 0.05)',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                aria-expanded={preplanOpen}
                aria-controls={`${detailsId}-preplan`}
                style={{
                  width: '100%',
                  border: 0,
                  background: 'transparent',
                  font: 'inherit',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.35rem 0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.74rem',
                  color: '#c084fc',
                  fontWeight: 500,
                }}
                onClick={() => setPreplanOpen(!preplanOpen)}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <FileText size={12} />
                  🔍 {t('smartTrack.preplan')}
                  {meta.preplan_ms ? ` (${meta.preplan_ms}ms)` : ''}
                </span>
                {preplanOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              {preplanOpen && (
                <div
                  id={`${detailsId}-preplan`}
                  style={{
                    padding: '0.5rem',
                    borderTop: '1px solid rgba(168, 85, 247, 0.15)',
                    whiteSpace: 'pre-wrap',
                    fontSize: '0.75rem',
                    color: 'var(--text-primary)',
                    lineHeight: '1.45',
                  }}
                >
                  {meta.preplan}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
