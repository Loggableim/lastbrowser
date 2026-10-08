import type React from 'react';
import { useDesktopI18n } from '../i18n.js';
import { setShowUntestedProviderBetas, useShowUntestedProviderBetas } from '../provider-beta-preferences.js';

export function ProviderBetaCatalogToggle(): React.JSX.Element {
  const { t } = useDesktopI18n();
  const enabled = useShowUntestedProviderBetas();
  return (
    <label className="settings-toggle-card" data-testid="provider-beta-catalog-toggle">
      <span className="settings-toggle-card-main">
        <span>{t('settings.panels.providers.betaCatalogToggle')}</span>
        <small>{t('settings.panels.providers.betaCatalogDescription')}</small>
      </span>
      <input
        type="checkbox"
        checked={enabled}
        onChange={event => setShowUntestedProviderBetas(event.currentTarget.checked)}
        aria-label={t('settings.panels.providers.betaCatalogToggle')}
      />
    </label>
  );
}
