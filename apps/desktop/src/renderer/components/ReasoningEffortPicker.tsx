import React from 'react';
import { normalizeReasoningEfforts, REASONING_EFFORT_LABELS } from '../chat-reasoning-effort.js';
import { useDesktopI18n } from '../i18n.js';

export function ReasoningEffortPicker({
  value,
  efforts: advertisedEfforts,
  disabled,
  onChange,
}: {
  value: string;
  efforts: string[];
  disabled: boolean;
  onChange: (effort: string) => void;
}): React.JSX.Element {
  const { t } = useDesktopI18n();
  const efforts = normalizeReasoningEfforts(advertisedEfforts);
  const unavailable = efforts.length === 0;
  const selectedValue = efforts.includes(value) ? value : '';
  return (
    <label
      className="composer-model composer-reasoning-effort"
      title={unavailable ? t('chat.reasoningEffortUnavailable') : t('chat.reasoningEffort')}
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
          ? <option value="">{t('chat.reasoningEffortUnavailable')}</option>
          : <>
              <option value="">{t('chat.reasoningEffortDefault')}</option>
              {efforts.map((effort) => (
                <option key={effort} value={effort}>{REASONING_EFFORT_LABELS[effort] || effort}</option>
              ))}
            </>}
      </select>
    </label>
  );
}
