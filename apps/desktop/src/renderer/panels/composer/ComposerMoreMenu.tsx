import React from 'react';
import {
  FolderGit2,
  Layers,
  ListFilter,
  MoreHorizontal,
  SlidersHorizontal,
  UserCheck,
} from 'lucide-react';
import { ReasoningEffortPicker } from '../../components/ReasoningEffortPicker.js';
import { getComposerMoreUxCopy } from '../../i18n/sidekick-ux-translations.js';

export interface ComposerMoreMenuProps {
  locale: string;
  moreOpen: boolean;
  onToggleMoreOpen: (open: boolean) => void;
  moreContainerRef: React.RefObject<HTMLDetailsElement | null>;
  moreSummaryRef: React.RefObject<HTMLElement | null>;
  manualModelTriggerRef: React.RefObject<HTMLButtonElement | null>;
  isTabsActive: boolean;
  onToggleTabs: () => void;
  showManualModels: boolean;
  onToggleManualModels: () => void;
  reasoningEffort: string;
  reasoningEfforts: string[];
  reasoningCapabilityState?: 'loading' | 'unknown' | 'ready';
  reasoningHelp: string;
  ready: boolean;
  running: boolean;
  onReasoningEffort: (effort: string) => void;
  profile: string;
  workspaceDisplay: string;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  moreLabel: string;
  t: (key: string) => string;
}

export function ComposerMoreMenu({
  locale,
  moreOpen,
  onToggleMoreOpen,
  moreContainerRef,
  moreSummaryRef,
  manualModelTriggerRef,
  isTabsActive,
  onToggleTabs,
  showManualModels,
  onToggleManualModels,
  reasoningEffort,
  reasoningEfforts,
  reasoningCapabilityState,
  reasoningHelp,
  ready,
  running,
  onReasoningEffort,
  profile,
  workspaceDisplay,
  onKeyDown,
  moreLabel,
  t,
}: ComposerMoreMenuProps): React.JSX.Element {
  const uxCopy = getComposerMoreUxCopy(locale);
  const hasActiveCustomization = isTabsActive || Boolean(reasoningEffort) || showManualModels;

  return (
    <details
      ref={moreContainerRef}
      className="composer-more"
      open={moreOpen}
      onToggle={(event) => onToggleMoreOpen(event.currentTarget.open)}
      onKeyDown={onKeyDown}
    >
      <summary
        ref={moreSummaryRef}
        aria-expanded={moreOpen}
        aria-controls="composer-more-content"
        aria-label={moreLabel}
        title={uxCopy.moreMenuAria}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
        <span>{moreLabel}</span>
        {hasActiveCustomization && (
          <span className="composer-more-active-dot" aria-hidden="true" />
        )}
      </summary>

      <div
        id="composer-more-content"
        className="composer-more-content"
        role="group"
        aria-label={uxCopy.moreMenuAria}
      >
        {/* 1. Sektion: Kontext (@tabs) */}
        <div className="composer-more-section">
          <span className="composer-more-section-title">{uxCopy.sectionContext}</span>
          <button
            type="button"
            className="composer-tab-btn"
            onClick={onToggleTabs}
            aria-pressed={isTabsActive}
            title={`@tabs · ${t('browser.chrome.tabs')}`}
          >
            <Layers size={14} aria-hidden="true" />
            <span className="composer-more-btn-copy">
              <strong>{t('browser.chrome.tabs')}</strong>
              <small>{uxCopy.tabsHint}</small>
            </span>
          </button>
        </div>

        {/* 2. Sektion: Manuelle Modellauswahl */}
        <div className="composer-more-section">
          <span className="composer-more-section-title">{uxCopy.sectionModel}</span>
          <button
            ref={manualModelTriggerRef}
            type="button"
            className="composer-command-button composer-model-trigger"
            aria-expanded={showManualModels}
            aria-label={t('chat.chooseModelManually')}
            title={t('chat.chooseModelManually')}
            aria-controls="composer-manual-models"
            onClick={onToggleManualModels}
          >
            <ListFilter size={14} aria-hidden="true" />
            <span className="composer-more-btn-copy">
              <strong>{t('chat.chooseModelManually')}</strong>
              <small>{uxCopy.manualModelHint}</small>
            </span>
          </button>
        </div>

        {/* 3. Sektion: Denkaufwand (ohne verschachteltes <details>) */}
        <div className="composer-more-section composer-reasoning-disclosure">
          <div
            className="composer-more-section-header"
            title={reasoningHelp}
            aria-label={t('chat.reasoningEffort')}
            data-testid="composer-reasoning-toggle"
          >
            <SlidersHorizontal size={13} aria-hidden="true" />
            <span className="composer-more-section-title">{t('chat.reasoningEffort')}</span>
          </div>
          <ReasoningEffortPicker
            value={reasoningEffort}
            efforts={reasoningEfforts}
            capabilityState={reasoningCapabilityState}
            disabled={!ready || running}
            onChange={onReasoningEffort}
          />
        </div>

        {/* 4. Sektion: Scope (Profil · Workspace) */}
        <div className="composer-more-section composer-more-scope-section">
          <span className="composer-more-section-title">{uxCopy.sectionScope}</span>
          <div
            className="composer-scope"
            aria-label={`${profile} · ${workspaceDisplay}`}
          >
            <span className="composer-scope-chip" title={`${uxCopy.profileLabel}: ${profile}`}>
              <UserCheck size={12} aria-hidden="true" />
              <span>{profile}</span>
            </span>
            <span className="composer-scope-chip" title={`${uxCopy.workspaceLabel}: ${workspaceDisplay}`}>
              <FolderGit2 size={12} aria-hidden="true" />
              <span>{workspaceDisplay}</span>
            </span>
          </div>
        </div>
      </div>
    </details>
  );
}
