import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { canCallSidekickApi } from '../runtime-readiness.js';

export type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;
export type AnyRecord = Record<string, unknown>;
export type ApiState = {
  data: AnyRecord | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

export function useApiState(loader: () => Promise<AnyRecord>, deps: React.DependencyList, enabled = true): ApiState {
  const [data, setData] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    setLoading(true);
    try {
      setData(await loader());
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

export function isReady(serviceStatus: ServiceStatus | null): boolean {
  return canCallSidekickApi(serviceStatus);
}

export function arrayFrom(payload: AnyRecord | null, keys: string[]): AnyRecord[] {
  if (!payload) return [];
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  const firstArray = Object.values(payload).find(Array.isArray);
  return Array.isArray(firstArray) ? firstArray.filter(isRecord) : [];
}

export function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function text(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

export function titleOf(item: AnyRecord, fallback = 'Untitled'): string {
  return text(item.name || item.title || item.label || item.slug || item.id || item.path, fallback);
}

export function idOf(item: AnyRecord): string {
  return text(item.slug || item.id || item.name || item.path || titleOf(item));
}

export function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatCompactNumber(value: unknown, fallback = '—'): string {
  const parsed = toNumber(value, Number.NaN);
  if (!Number.isFinite(parsed)) return fallback;
  try {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(parsed);
  } catch {
    return String(parsed);
  }
}

export function formatMoney(value: unknown, fallback = '—'): string {
  const parsed = toNumber(value, Number.NaN);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed === 0) return '$0';
  return `$${parsed.toFixed(parsed < 1 ? 4 : 2)}`;
}

export function percentValue(part: unknown, total: unknown): string {
  const whole = toNumber(total, 0);
  if (!whole) return '0%';
  const ratio = Math.max(0, Math.min(100, Math.round((toNumber(part, 0) / whole) * 100)));
  return `${ratio}%`;
}

export function appstoreSettingType(value: unknown): 'checkbox' | 'number' | 'text' {
  if (typeof value === 'boolean') return 'checkbox';
  if (typeof value === 'number') return 'number';
  return 'text';
}

export function jsonPreview(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

export function NativeHeader({
  icon,
  title,
  kicker,
  detail,
  loading,
  ready,
  onRefresh
}: {
  icon: React.ReactNode;
  title: string;
  kicker: string;
  detail: string;
  loading?: boolean;
  ready: boolean;
  onRefresh?: () => Promise<void>;
}): JSX.Element {
  return (
    <header className="native-rest-header">
      <div className="native-rest-title">
        <div className="native-rest-icon">{icon}</div>
        <div>
          <span className="eyebrow">{kicker}</span>
          <h1>{title}</h1>
          <p>{detail}</p>
        </div>
      </div>
      <div className="native-rest-header-actions">
        <span className={`native-rest-pill ${ready ? 'ready' : 'starting'}`}>
          <span className={ready ? 'status-dot ready' : 'status-dot'} />
          {ready ? 'Online' : 'Starting'}
        </span>
        {onRefresh && (
          <button type="button" className="secondary-action compact" onClick={() => void onRefresh()} disabled={!ready || loading}>
            {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
            <span>Refresh</span>
          </button>
        )}
      </div>
    </header>
  );
}

export function ErrorLine({ error }: { error: string }): JSX.Element | null {
  return error ? <div className="workspace-error">{error}</div> : null;
}

export function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }): JSX.Element {
  return (
    <div className="native-rest-empty">
      {icon}
      <span>{label}</span>
    </div>
  );
}
