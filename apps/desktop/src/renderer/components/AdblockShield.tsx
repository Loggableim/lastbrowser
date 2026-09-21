import React, { useEffect, useRef, useState } from 'react';
import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react';

export type AdblockStatus = {
  enabled: boolean;
  blockedCount: number;
  state: 'idle' | 'loading' | 'ready' | 'error';
  lastError: string | null;
};

export function AdblockShield(): React.JSX.Element | null {
  const [status, setStatus] = useState<AdblockStatus | null>(null);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!window.lastbrowser?.adblock) return;
    const fetchStatus = async () => {
      try {
        const s = await window.lastbrowser.adblock?.status();
        if (s) setStatus(s);
      } catch {
        // ignore
      }
    };
    void fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const toggleEnabled = async () => {
    if (!window.lastbrowser?.adblock || !status) return;
    try {
      const next = await window.lastbrowser.adblock.setEnabled(!status.enabled);
      setStatus(next);
    } catch {
      // ignore
    }
  };

  if (!status) return null;

  return (
    <div className="adblock-shield-wrap" ref={popoverRef}>
      <button
        type="button"
        className={`adblock-shield-btn ${status.enabled ? 'shield-on' : 'shield-off'}`}
        title={`Adblock: ${status.enabled ? 'Active' : 'Disabled'} (${status.blockedCount} blocked)`}
        aria-label="Adblock shield"
        onClick={() => setOpen(!open)}
      >
        {status.enabled ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}
        {status.enabled && status.blockedCount > 0 && (
          <span className="adblock-badge">{status.blockedCount > 99 ? '99+' : status.blockedCount}</span>
        )}
      </button>

      {open && (
        <div className="adblock-popover" role="dialog" aria-label="Adblock details">
          <div className="adblock-popover-header">
            <div className="adblock-popover-title">
              <Shield size={16} />
              <strong>Shield Protection</strong>
            </div>
            <span className={`adblock-status-pill ${status.enabled ? 'active' : 'disabled'}`}>
              {status.enabled ? 'Protected' : 'Disabled'}
            </span>
          </div>

          <div className="adblock-popover-body">
            <div className="adblock-stat-row">
              <span>Blocked ads & trackers</span>
              <strong>{status.blockedCount}</strong>
            </div>
            <div className="adblock-stat-row">
              <span>Engine state</span>
              <span className="adblock-engine-state">{status.state}</span>
            </div>
          </div>

          <div className="adblock-popover-footer">
            <button
              type="button"
              className={`adblock-toggle-btn ${status.enabled ? 'danger' : 'primary'}`}
              onClick={() => void toggleEnabled()}
            >
              {status.enabled ? 'Disable for session' : 'Enable protection'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
