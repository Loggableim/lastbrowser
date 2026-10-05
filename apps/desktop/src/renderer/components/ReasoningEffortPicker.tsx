import React from 'react';
import { normalizeReasoningEfforts, reasoningEffortLabel } from '../chat-reasoning-effort.js';
import { useDesktopI18n } from '../i18n.js';

export function ReasoningEffortPicker({
  value,
  efforts: advertisedEfforts,
  disabled,
  capabilityState = 'ready',
  onChange,
}: {
  value: string;
  efforts: string[];
  disabled: boolean;
  capabilityState?: 'loading' | 'unknown' | 'ready';
  onChange: (effort: string) => void;
}): React.JSX.Element {
  const { t, locale } = useDesktopI18n();
  const efforts = normalizeReasoningEfforts(advertisedEfforts);
  const unavailable = capabilityState !== 'ready' || efforts.length === 0;
  const selectedValue = efforts.includes(value) ? value : '';
  const explanation = capabilityState === 'loading' ? t('common.loading') : t('chat.reasoningEffortUnavailable');
  return (
    <label
      className="composer-model composer-reasoning-effort"
      title={unavailable ? explanation : t('chat.reasoningEffort')}
    >
      <span>{t('chat.reasoningEffort')}</span>
      <select
        aria-label={t('chat.reasoningEffort')}
        value={selectedValue}
        disabled={disabled || unavailable}
        onChange={(event) => onChange(event.target.value)}
        style={{ backgroundColor: '#0b1325', color: '#e8f2ff' }}
      >
        {unavailable
          ? <option value="">{explanation}</option>
          : <>
              <option value="">{t('chat.reasoningEffortDefault')}</option>
              {efforts.map((effort) => (
                <option key={effort} value={effort}>{reasoningEffortLabel(effort, locale)}</option>
              ))}
            </>}
      </select>
    </label>
  );
}
