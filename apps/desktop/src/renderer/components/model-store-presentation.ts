import type { StoreModel } from '../model-store-contracts.js';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function formatStoreBytes(value: number | null): string {
  return value !== null && Number.isFinite(value) && value >= 0 ? `${(value / 1024 ** 3).toLocaleString('de-DE', { maximumFractionDigits: 1 })} GiB` : 'Unbekannt';
}
function measurement(value: unknown): string {
  const entry = record(value);
  return entry.status === 'measured' && typeof entry.value === 'number' ? formatStoreBytes(entry.value) : 'Unbekannt';
}
export function summarizeStoreHardware(value: unknown) {
  const hardware = record(value);
  const adapters = Array.isArray(hardware.adapters) ? hardware.adapters.map(record) : [];
  const names = adapters.map((adapter) => typeof adapter.name === 'string' && adapter.name.trim() ? adapter.name : 'Unbekannte GPU');
  return {
    scanned: Object.keys(hardware).length > 0,
    cpu: typeof hardware.cpuName === 'string' && hardware.cpuName.trim() ? hardware.cpuName : 'Unbekannt',
    cores: typeof hardware.logicalCores === 'number' && hardware.logicalCores > 0 ? `${hardware.logicalCores} logische Kerne` : 'Kernzahl unbekannt',
    ramAvailable: measurement(hardware.ramAvailableBytes),
    ramTotal: measurement(hardware.ramTotalBytes),
    diskFree: measurement(hardware.diskFreeBytes),
    gpu: names.length ? names.join(', ') : 'Unbekannt',
    gpuMemory: adapters.length === 1 ? measurement(adapters[0].dedicatedBytes) : 'Unbekannt',
    observedAt: typeof hardware.observedAt === 'string' && Number.isFinite(Date.parse(hardware.observedAt)) ? hardware.observedAt : null,
  };
}
export type StoreFilters = { query: string; publisher: string; showLarge: boolean; showUnknown: boolean };
export function filterStoreModels(models: StoreModel[], filters: StoreFilters): StoreModel[] {
  const query = filters.query.trim().toLocaleLowerCase('de-DE');
  return models.filter((model) => (!filters.publisher || model.publisher === filters.publisher)
    && `${model.name} ${model.publisher} ${model.description}`.toLocaleLowerCase('de-DE').includes(query)
    && (model.installed || model.eligibility.state === 'likely_suitable'
      || model.eligibility.state === 'too_large' && filters.showLarge
      || model.eligibility.state !== 'too_large' && model.eligibility.state !== 'likely_suitable' && filters.showUnknown));
}
export function storeEmptyState(models: StoreModel[], filters: StoreFilters, hardware: unknown): 'scan_missing' | 'filtered' | 'compatibility_unknown' | 'catalog_empty' {
  if (filters.query.trim() || filters.publisher || filters.showUnknown && !filters.showLarge && models.some((model) => model.eligibility.state === 'too_large')) return 'filtered';
  if (!models.length) return 'catalog_empty';
  if (!summarizeStoreHardware(hardware).scanned) return 'scan_missing';
  if (models.length) return 'compatibility_unknown';
  return 'catalog_empty';
}
export function storeModelStatus(model: StoreModel): string {
  if (model.active) return 'Im lokalen Chat aktiv';
  if (model.deviceConfirmed) return 'Auf diesem PC bestätigt';
  if (model.installed) return 'Installiert · noch nicht bestätigt';
  if (model.eligibility.state === 'likely_suitable') return 'Voraussichtlich geeignet';
  if (model.eligibility.state === 'too_large') return 'Speicher reicht nicht aus';
  return 'Kompatibilität ungeklärt';
}
export function storeNextAction(model: StoreModel): string {
  if (model.active) return 'Chat und Details';
  if (model.installed) return model.deviceConfirmed ? 'Aktivierung ansehen' : 'Testen und Details';
  return model.eligibility.allowed ? 'Installation vorbereiten' : 'Voraussetzungen ansehen';
}
