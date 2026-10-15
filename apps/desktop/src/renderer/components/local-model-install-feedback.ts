import { shellText } from '../i18n/shell-text.js';

/** Visible install phases. Persisted so a remount can show the same status. */
export type InstallPhase = 'starting' | 'downloading' | 'installing' | 'ready' | 'error' | 'cancelled';

export type InstallFeedback = {
  modelId: string;
  phase: InstallPhase;
  startedAt: number;
  updatedAt: number;
  downloadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
  remainingMs: number | null;
  error: string | null;
  jobId: string | null;
  requestId: string | null;
  /** Terminal jobs already on screen when this attempt started. */
  ignoredJobIds: string[];
};

export type InstallModelHint = {
  id: string;
  downloadBytes: number | null;
  active?: boolean;
  installed?: unknown;
};

export type InstallJobHint = {
  id: string;
  operation: string;
  modelId: string;
  state: string;
  progress: number;
  total: number;
  downloadedBytes: number;
  error: string | null;
};

const STORAGE_KEY = 'lastbrowser.local-model-install.v1';
const ACTIVE_JOB_STATES = new Set(['pending', 'running', 'downloading', 'verifying', 'stopping']);
const PHASES = new Set<InstallPhase>(['starting', 'downloading', 'installing', 'ready', 'error', 'cancelled']);

const memory = new Map<string, InstallFeedback>();
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
}

function persist(): void {
  try { storage()?.setItem(STORAGE_KEY, JSON.stringify([...memory.values()])); } catch { /* private mode or quota */ }
}

function emit(): void {
  persist();
  listeners.forEach(listener => listener());
}

function isFeedback(value: unknown): value is InstallFeedback {
  if (!value || typeof value !== 'object') return false;
  const item = value as InstallFeedback;
  return typeof item.modelId === 'string' && PHASES.has(item.phase) && typeof item.startedAt === 'number';
}

/** Drop in-memory status and restore the last session snapshot. */
export function reloadInstallFeedbackFromSession(): void {
  memory.clear();
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    if (!Array.isArray(parsed)) return;
    parsed.filter(isFeedback).forEach(item => memory.set(item.modelId, {
      ...item,
      ignoredJobIds: Array.isArray(item.ignoredJobIds) ? item.ignoredJobIds.filter(id => typeof id === 'string') : [],
      jobId: item.jobId ?? null,
      requestId: item.requestId ?? null,
      error: item.error ?? null,
      totalBytes: item.totalBytes ?? null,
      percent: item.percent ?? null,
      remainingMs: item.remainingMs ?? null,
      downloadedBytes: item.downloadedBytes || 0,
      updatedAt: item.updatedAt || item.startedAt,
    }));
  } catch { /* ignore broken session data */ }
}

export function subscribeInstallFeedback(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function installFeedbackSnapshot(): InstallFeedback[] {
  return [...memory.values()];
}

export function readInstallFeedback(modelId: string): InstallFeedback | undefined {
  return memory.get(modelId);
}

export function beginInstallFeedback(model: InstallModelHint, requestId: string, ignoredJobIds: string[] = [], now = Date.now()): InstallFeedback {
  const previous = memory.get(model.id);
  const ignored = new Set(ignoredJobIds);
  if (previous?.jobId) ignored.add(previous.jobId);
  const feedback: InstallFeedback = {
    modelId: model.id,
    phase: 'starting',
    startedAt: now,
    updatedAt: now,
    downloadedBytes: 0,
    totalBytes: model.downloadBytes,
    percent: null,
    remainingMs: null,
    error: null,
    jobId: null,
    requestId,
    ignoredJobIds: [...ignored],
  };
  memory.set(model.id, feedback);
  emit();
  return feedback;
}

/** A lost or timed-out start reply is not proof the download stopped.
 * The store starts the job before it returns the catalog. */
export function installStartFailureKeepsWatching(code: string): boolean {
  return code === 'request_timeout' || code === 'independent_request_failed' || code === 'local_service_failed';
}

export function markInstallFailed(modelId: string, error: string, now = Date.now()): void {
  const current = memory.get(modelId);
  if (!current || current.phase === 'cancelled' || current.phase === 'ready') return;
  memory.set(modelId, { ...current, phase: 'error', error: error || 'install_failed', updatedAt: now, remainingMs: null });
  emit();
}

/** Returns a known job id so the caller can cancel it immediately. */
export function markInstallCancelled(modelId: string, now = Date.now()): string | null {
  const current = memory.get(modelId);
  if (!current || current.phase === 'ready') return null;
  memory.set(modelId, { ...current, phase: 'cancelled', error: null, updatedAt: now, remainingMs: null });
  emit();
  return current.jobId;
}

function percentFor(downloaded: number, total: number | null, progress: number, jobTotal: number): number | null {
  if (total && total > 0) return Math.max(0, Math.min(100, Math.round(downloaded / total * 100)));
  if (jobTotal > 0) return Math.max(0, Math.min(100, Math.round(progress / jobTotal * 100)));
  return null;
}

function remainingMs(startedAt: number, percent: number | null, now: number): number | null {
  if (percent === null || percent <= 0 || percent >= 100) return null;
  const elapsed = now - startedAt;
  if (elapsed < 1000) return null;
  return Math.round(elapsed * (100 - percent) / percent);
}

function phaseFor(job: InstallJobHint, percent: number | null, model: InstallModelHint | undefined): InstallPhase {
  if (job.state === 'failed') return 'error';
  if (job.state === 'cancelled') return 'cancelled';
  if (job.state === 'complete' || job.state === 'completed') return 'ready';
  if (model?.active && (job.state === 'verifying' || percent === 100)) return 'ready';
  if (job.state === 'verifying' || job.state === 'stopping' || percent === 100) return 'installing';
  return 'downloading';
}

/**
 * Fold the latest install jobs into the session status.
 * Returns job ids that the user already cancelled and that are still running.
 */
export function reconcileInstallFeedback(models: InstallModelHint[], jobs: InstallJobHint[], now = Date.now()): string[] {
  const cancels: string[] = [];
  const installJobs = jobs.filter(job => job.operation === 'install');
  for (const [modelId, feedback] of [...memory.entries()]) {
    const model = models.find(item => item.id === modelId);
    const related = installJobs.filter(job => job.modelId === modelId);
    const ignored = new Set(feedback.ignoredJobIds);
    if (feedback.phase === 'cancelled') {
      const live = related.find(job => ACTIVE_JOB_STATES.has(job.state));
      if (live) {
        cancels.push(live.id);
        if (feedback.jobId !== live.id) memory.set(modelId, { ...feedback, jobId: live.id, updatedAt: now });
      }
      continue;
    }
    const bound = feedback.jobId ? related.find(job => job.id === feedback.jobId) : undefined;
    const fresh = related.filter(job => !ignored.has(job.id));
    const job = bound
      || (feedback.phase === 'starting' ? fresh.find(item => ACTIVE_JOB_STATES.has(item.state)) : fresh[fresh.length - 1]);
    if (!job) {
      if ((feedback.phase === 'downloading' || feedback.phase === 'installing') && (model?.active || model?.installed)) {
        memory.set(modelId, { ...feedback, phase: 'ready', percent: 100, remainingMs: null, error: null, updatedAt: now });
      }
      continue;
    }
    const totalBytes = model?.downloadBytes ?? feedback.totalBytes;
    const percent = percentFor(job.downloadedBytes, totalBytes, job.progress, job.total);
    const phase = phaseFor(job, percent, model);
    memory.set(modelId, {
      ...feedback,
      phase,
      jobId: job.id,
      updatedAt: now,
      downloadedBytes: job.downloadedBytes,
      totalBytes,
      percent: phase === 'ready' ? 100 : percent,
      remainingMs: phase === 'downloading' ? remainingMs(feedback.startedAt, percent, now) : null,
      error: phase === 'error' ? (job.error || 'install_failed') : null,
    });
  }
  emit();
  return cancels;
}

export function formatInstallMegabytes(bytes: number, locale = 'de'): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 MB';
  const megabytes = bytes / (1024 * 1024);
  const rounded = megabytes >= 10 ? Math.round(megabytes) : Number(megabytes.toFixed(1));
  return `${rounded.toLocaleString(locale.startsWith('de') ? 'de-DE' : 'en-US', { maximumFractionDigits: 1 })} MB`;
}

export function formatInstallRemaining(locale: string, ms: number | null): string {
  if (ms === null) return shellText(locale, 'Zeit wird geschätzt…', 'Estimating time…');
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 90) return shellText(locale, `ca. ${seconds} s`, `about ${seconds} s`);
  const minutes = Math.max(1, Math.round(seconds / 60));
  return shellText(locale, `ca. ${minutes} min`, `about ${minutes} min`);
}

export function formatInstallStatus(locale: string, feedback: InstallFeedback): string {
  if (feedback.phase === 'starting') return shellText(locale, 'Download startet…', 'Download starting…');
  if (feedback.phase === 'downloading') return shellText(locale, 'Download läuft…', 'Downloading…');
  if (feedback.phase === 'installing') return shellText(locale, 'Installiere/Prüfe…', 'Installing/checking…');
  if (feedback.phase === 'ready') return shellText(locale, 'Fertig, Modell aktiv', 'Ready, model active');
  if (feedback.phase === 'cancelled') return shellText(locale, 'Abgebrochen', 'Cancelled');
  return feedback.error || shellText(locale, 'Download fehlgeschlagen', 'Download failed');
}

export function resetInstallFeedbackForTests(): void {
  memory.clear();
  listeners.clear();
  try { storage()?.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
