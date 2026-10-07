import React from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { DesktopUpdateStatus } from '../update-settings-actions.js';

export function UpdateNowButton({ status, pending, label, onInstall }: {
  status: DesktopUpdateStatus | null;
  pending: boolean;
  label: string;
  onInstall: () => void;
}): React.JSX.Element | null {
  if (status?.state !== 'downloaded') return null;
  return (
    <button type="button" className="primary-action compact update-now-action" onClick={onInstall} disabled={pending} aria-busy={pending}>
      {pending ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
      <span>{label}</span>
    </button>
  );
}
