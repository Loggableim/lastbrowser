import type { StoreModel } from '../model-store-contracts.js';

/** Capability decisions come from the scoped backend, never from catalog estimates. */
export function storeModelActions(model: StoreModel, readOnly: boolean) {
  const execution = model.execution;
  const available = !readOnly && !!execution;
  return {
    download: available && execution?.downloadAllowed === true && model.installQualified && !!model.licenseDigest && !model.installed,
    benchmark: available && execution?.benchmarkAllowed === true && !!model.installed,
    activate: available && execution?.activateAllowed === true && !!model.installed,
    execute: available && execution?.executeAllowed === true && !!model.installed,
    kind: execution?.kind ?? model.curation?.category ?? 'text',
    state: execution?.state ?? 'browse_only',
    reasons: [...new Set([...(execution?.reasonCodes ?? []), ...model.eligibility.reasons])],
  };
}

export function storeConsentKey(model: StoreModel): string {
  return JSON.stringify([model.id, model.revision, model.licenseDigest]);
}

export function storeExecutionLabel(model: StoreModel): string {
  const state = model.execution?.state;
  if (state === 'chat_or_media_qualified') return model.execution?.kind === 'text' ? 'Für lokalen Chat geprüft' : 'Für lokale Erstellung geprüft';
  if (state === 'device_runtime_verified') return 'Ausführung auf diesem PC geprüft';
  if (state === 'installed_verified') return 'Installiert · bereit für den Gerätetest';
  if (state === 'download_qualified') return 'Download verfügbar · Gerätetest folgt';
  return 'Im Katalog · Ausführung noch nicht verfügbar';
}

export function storeJobLabel(state: string): string {
  return ({ pending: 'Wartet', running: 'Wird ausgeführt', downloading: 'Wird heruntergeladen', verifying: 'Dateien werden geprüft',
    stopping: 'Wird beendet', complete: 'Abgeschlossen', completed: 'Abgeschlossen', failed: 'Fehlgeschlagen', cancelled: 'Abgebrochen' } as Record<string, string>)[state] ?? 'Status wird aktualisiert';
}

/** Read results are data, never a backend-selected file or remote URL. */
export function decodeStoreMedia(value: unknown): { mimeType: string; bytes: Uint8Array } {
  if (!value || typeof value !== 'object') throw new Error('Das Ergebnis ist nicht verfügbar.');
  const { mimeType, dataBase64 } = value as Record<string, unknown>;
  if (typeof mimeType !== 'string' || !['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'].includes(mimeType)
    || typeof dataBase64 !== 'string' || !dataBase64.length || dataBase64.length > Math.ceil(16 * 1024 * 1024 / 3) * 4
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64) || dataBase64.length % 4 !== 0) throw new Error('Das Ergebnisformat ist ungültig oder zu groß für die Vorschau.');
  let decoded: string;
  try { decoded = atob(dataBase64); } catch { throw new Error('Das Ergebnis konnte nicht gelesen werden.'); }
  if (decoded.length > 16 * 1024 * 1024) throw new Error('Das Ergebnis ist zu groß für die Vorschau.');
  const bytes = Uint8Array.from(decoded, character => character.charCodeAt(0));
  return { mimeType, bytes };
}

export type StoreSelectedInput = { assetId: string; name: string; mimeType: string; width?: number; height?: number; durationMs?: number };
export function decodeStoreInput(value: unknown, kind: 'reference_image' | 'audio_wav'): StoreSelectedInput {
  if (!value || typeof value !== 'object') throw new Error('Die ausgewählte Datei ist nicht verfügbar.');
  const data = value as Record<string, unknown>;
  if (typeof data.assetId !== 'string' || !data.assetId || data.assetId.length > 128 || /[\u0000-\u001f/\\]/.test(data.assetId)
    || typeof data.name !== 'string' || !data.name || data.name.length > 1000
    || typeof data.mimeType !== 'string' || !(kind === 'reference_image' ? ['image/png', 'image/jpeg'] : ['audio/wav', 'audio/x-wav']).includes(data.mimeType)) {
    throw new Error(kind === 'reference_image' ? 'Bitte ein gültiges PNG- oder JPEG-Bild auswählen.' : 'Bitte eine gültige PCM-WAV-Datei auswählen.');
  }
  for (const field of ['width', 'height', 'durationMs']) {
    if (data[field] !== undefined && (typeof data[field] !== 'number' || !Number.isFinite(data[field]) || Number(data[field]) <= 0)) throw new Error('Die Dateiinformationen sind ungültig.');
  }
  if (kind === 'audio_wav' && typeof data.durationMs === 'number' && data.durationMs > 120_000) throw new Error('Die WAV-Datei darf höchstens zwei Minuten lang sein.');
  return { assetId: data.assetId, name: data.name, mimeType: data.mimeType,
    ...(typeof data.width === 'number' ? { width: data.width } : {}), ...(typeof data.height === 'number' ? { height: data.height } : {}),
    ...(typeof data.durationMs === 'number' ? { durationMs: data.durationMs } : {}) };
}
