import React from 'react';
import { connectionNoticeCopy, type ConnectionNotice } from '../../connection-notice.js';
import type { DesktopLocaleId } from '../../i18n/keys.js';
import { ProviderBetaCatalogToggle } from '../../components/ProviderBetaCatalogToggle.js';

export interface ComposerNoticesProps {
  locale: DesktopLocaleId;
  connectionNotice?: ConnectionNotice | null;
  modelCatalogLoading?: boolean;
  modelCatalogSlow?: boolean;
  modelCatalogError?: boolean;
  hideQualificationNotice?: boolean;
  qualificationNoticeHidden?: boolean;
  betaSelectionBlocked?: boolean;
  emptyQualifiedCatalog?: boolean;
  multiAgentBetaBlocked?: boolean;
  showUntestedBetas: boolean;
  onRetryModelCatalog?: () => void;
  t: (key: string) => string;
}

export type ResolvedComposerNotice =
  | {
      kind: 'connection';
      role: 'alert';
      message: string;
      showRetry: boolean;
      showBetaToggle: false;
    }
  | {
      kind: 'catalog-error';
      role: 'alert';
      message: string;
      showRetry: boolean;
      showBetaToggle: false;
    }
  | {
      kind: 'qualification-beta';
      role: 'status';
      message: string;
      showRetry: boolean;
      showBetaToggle: boolean;
    }
  | {
      kind: 'catalog-slow';
      role: 'status';
      message: string;
      showRetry: boolean;
      showBetaToggle: false;
    }
  | {
      kind: 'catalog-loading';
      role: 'status';
      message: string;
      showRetry: false;
      showBetaToggle: false;
    };

/**
 * Resolves overlapping notice states into a single, strictly prioritized banner.
 * Priority:
 *  1. Connection error (OpenCode unreachable / sign-in expired)
 *  2. Catalog load error
 *  3. Beta/qualification block or empty qualified catalog
 *  4. Slow catalog discovery
 *  5. Initial catalog loading
 */
export function resolveComposerNotice(props: ComposerNoticesProps): ResolvedComposerNotice | null {
  const {
    locale,
    connectionNotice = null,
    modelCatalogLoading = false,
    modelCatalogSlow = false,
    modelCatalogError = false,
    hideQualificationNotice = false,
    qualificationNoticeHidden = false,
    betaSelectionBlocked = false,
    emptyQualifiedCatalog = false,
    multiAgentBetaBlocked = false,
    showUntestedBetas,
    onRetryModelCatalog,
    t,
  } = props;

  if (connectionNotice) {
    return {
      kind: 'connection',
      role: 'alert',
      message: connectionNoticeCopy[locale][connectionNotice],
      showRetry: connectionNotice === 'opencode-unreachable' && Boolean(onRetryModelCatalog),
      showBetaToggle: false,
    };
  }

  if (modelCatalogError) {
    return {
      kind: 'catalog-error',
      role: 'alert',
      message: t('chat.modelCatalogUnavailable'),
      showRetry: Boolean(onRetryModelCatalog),
      showBetaToggle: false,
    };
  }

  if (
    !hideQualificationNotice &&
    !qualificationNoticeHidden &&
    (betaSelectionBlocked || emptyQualifiedCatalog) &&
    !modelCatalogLoading
  ) {
    return {
      kind: 'qualification-beta',
      role: 'status',
      message: multiAgentBetaBlocked
        ? t('settings.panels.providers.multiAgentBetaRequired')
        : t('settings.panels.providers.betaCatalogEmpty'),
      showBetaToggle: !showUntestedBetas,
      showRetry: showUntestedBetas && Boolean(onRetryModelCatalog),
    };
  }

  if (modelCatalogSlow) {
    return {
      kind: 'catalog-slow',
      role: 'status',
      message: t('chat.modelCatalogSlow'),
      showRetry: Boolean(onRetryModelCatalog),
      showBetaToggle: false,
    };
  }

  if (modelCatalogLoading) {
    return {
      kind: 'catalog-loading',
      role: 'status',
      message: t('settings.panels.providers.loadingModels'),
      showRetry: false,
      showBetaToggle: false,
    };
  }

  return null;
}

export function ComposerNotices(props: ComposerNoticesProps): React.JSX.Element | null {
  const notice = resolveComposerNotice(props);
  if (!notice) return null;

  return (
    <div className="composer-model-notice" role={notice.role}>
      <span>{notice.message}</span>
      {notice.showBetaToggle && <ProviderBetaCatalogToggle />}
      {notice.showRetry && props.onRetryModelCatalog && (
        <button type="button" className="secondary-action compact" onClick={props.onRetryModelCatalog}>
          {props.t('chat.retryModels')}
        </button>
      )}
    </div>
  );
}
