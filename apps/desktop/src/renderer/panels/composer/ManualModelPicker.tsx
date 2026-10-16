import React from 'react';
import { Check, Search, X } from 'lucide-react';
import { qualifyModelForProvider } from '../../provider-model-selection.js';
import { getComposerMoreUxCopy } from '../../i18n/sidekick-ux-translations.js';
import {
  formatModelEvidence,
  type ComposerModelGroup,
} from './model-evidence.js';

export interface ManualModelPickerProps {
  groups: readonly ComposerModelGroup[];
  model: string;
  modelProvider?: string;
  browserProfileId: string;
  profile: string;
  backendProfileName: string;
  ready: boolean;
  running: boolean;
  locale: string;
  searchQuery: string;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onSearchChange: (value: string) => void;
  onSelectModel: (qualifiedModelId: string) => void;
  onClose: (restoreFocus?: boolean) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  onRetryModelCatalog?: () => void;
  t: (key: string) => string;
}

export function ManualModelPicker({
  groups,
  model,
  modelProvider,
  browserProfileId,
  profile,
  backendProfileName,
  ready,
  running,
  locale,
  searchQuery,
  searchInputRef,
  onSearchChange,
  onSelectModel,
  onClose,
  onKeyDown,
  onRetryModelCatalog,
  t,
}: ManualModelPickerProps): React.JSX.Element {
  const uxCopy = getComposerMoreUxCopy(locale);
  const hasVisibleModels = groups.some((group) => group.models.length > 0);

  return (
    <section
      id="composer-manual-models"
      className="composer-manual-models"
      role="region"
      aria-label={t('chat.chooseModelManually')}
      onKeyDown={onKeyDown}
    >
      <div className="composer-manual-models-header">
        <strong className="composer-manual-models-title">{t('chat.chooseModelManually')}</strong>
        <button
          type="button"
          className="composer-manual-models-close secondary-action compact"
          aria-label={uxCopy.closeMenu}
          title={uxCopy.closeMenu}
          onClick={() => onClose(true)}
        >
          <X size={14} aria-hidden="true" />
          <span>{uxCopy.closeMenu}</span>
        </button>
      </div>

      <label className="composer-manual-search-label">
        <span className="composer-manual-search-caption">
          <Search size={13} aria-hidden="true" />
          <span>{t('chat.modelSearch')}</span>
        </span>
        <input
          ref={searchInputRef}
          type="search"
          value={searchQuery}
          placeholder={t('chat.modelSearch')}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>

      {groups.map((group) => {
        const groupKey = `${group.providerId || 'virtual'}:${group.provider}`;
        const providerDisabledSuffix =
          group.configured === false
            ? ` · ${t(
                group.disabledReason === 'unavailable'
                  ? 'chat.modelProviderUnavailable'
                  : 'chat.modelProviderNotConfigured'
              )}`
            : '';

        return (
          <fieldset key={groupKey} disabled={group.configured === false}>
            <legend>
              {group.provider}
              {providerDisabledSuffix}
            </legend>
            {group.models.map((entry) => {
              const evidence = formatModelEvidence({
                group,
                entry,
                locale,
                browserProfileId,
                profile,
                backendProfileName,
                ready,
                running,
                t,
              });
              const lunaDefault = group.providerId === 'openai-codex' && entry.id === 'gpt-6-luna';
              const displayTitle = lunaDefault
                ? `GPT-6 Luna · ${t('settings.panels.providers.requestedChatDefault')}`
                : evidence.displayTitle;
              const isSelected = model === entry.id && modelProvider === group.providerId;

              return (
                <button
                  key={`${group.providerId || group.provider}:${entry.id}`}
                  type="button"
                  className={`composer-manual-model-btn${isSelected ? ' is-selected' : ''}`}
                  disabled={evidence.isDisabled}
                  title={evidence.tooltipText}
                  aria-pressed={isSelected}
                  onClick={() => {
                    onSelectModel(qualifyModelForProvider(entry.id, group.providerId));
                    onClose(true);
                  }}
                >
                  <span className="composer-manual-model-row">
                    <span className="composer-manual-model-name">{displayTitle}</span>
                    <span
                      className={`composer-model-qualification ${
                        evidence.badgeTone === 'qualified'
                          ? 'qualified'
                          : evidence.badgeTone === 'unavailable'
                            ? 'unavailable'
                            : 'beta'
                      }`}
                    >
                      {isSelected && <Check size={11} aria-hidden="true" />}
                      <span>
                        {evidence.badgeTone === 'qualified'
                          ? 'OK'
                          : evidence.badgeTone === 'unavailable'
                            ? '—'
                            : 'Beta'}
                      </span>
                    </span>
                  </span>
                  <small>{evidence.summaryText}</small>
                </button>
              );
            })}
          </fieldset>
        );
      })}

      {!hasVisibleModels && (
        <p className="composer-manual-empty" role="status">
          <span>{t('chat.noManualModels')}</span>{' '}
          {searchQuery.trim() ? (
            <button
              type="button"
              className="secondary-action compact"
              onClick={() => {
                onSearchChange('');
                searchInputRef.current?.focus();
              }}
            >
              {uxCopy.clearSearch}
            </button>
          ) : (
            onRetryModelCatalog && (
              <button
                type="button"
                className="secondary-action compact"
                onClick={onRetryModelCatalog}
              >
                {t('chat.retryModels')}
              </button>
            )
          )}
        </p>
      )}
    </section>
  );
}
