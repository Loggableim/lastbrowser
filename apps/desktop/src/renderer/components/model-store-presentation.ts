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
export type StoreFilters = { query: string; publisher: string; showLarge: boolean; showUnknown: boolean; category?: 'text' | 'image' | 'video' };
export function filterStoreModels(models: StoreModel[], filters: StoreFilters, hardware?: unknown): StoreModel[] {
  const query = filters.query.trim().toLocaleLowerCase('de-DE');
  return models.filter((model) => (!filters.publisher || model.publisher === filters.publisher)
    && (!filters.category || storeModelCategory(model) === filters.category)
    && `${model.name} ${model.publisher} ${model.description} ${model.curation?.innovation || ''} ${model.curation?.useCases.join(' ') || ''}`.toLocaleLowerCase('de-DE').includes(query)
    && (model.installed || filters.showLarge || assessStoreGpuEstimate(model, hardware) === 'within'
      || !model.curation && filters.showUnknown && model.eligibility.state !== 'too_large'));
}
export function storeModelCategory(model: StoreModel): 'text' | 'image' | 'video' { return model.curation?.category || 'text'; }
export function formatStoreGiBRange(value?: [number, number]): string {
  if (!value) return 'Noch nicht angegeben';
  const format = (number: number) => number.toLocaleString('de-DE', { maximumFractionDigits: 1 });
  return value[0] === value[1] ? `${format(value[0])} GiB` : `${format(value[0])}–${format(value[1])} GiB`;
}
export function storeSourceUrl(value: string | undefined): string | null {
  try { const url = new URL(value || ''); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
/** Display-only estimate. It never grants runtime, license, download or installation permission. */
export function assessStoreGpuEstimate(model: StoreModel, value: unknown): 'unknown' | 'within' | 'outside' {
  if (!model.curation) return 'unknown';
  const hardware = record(value);
  const adapters = Array.isArray(hardware.adapters) ? hardware.adapters.map(record) : [];
  const measured = (value: unknown): number | null => {
    const entry = record(value);
    return entry.status === 'measured' && typeof entry.value === 'number' && Number.isFinite(entry.value) && entry.value > 0 ? entry.value : null;
  };
  const gib = 1024 ** 3;
  // Curation RAM already includes OS/browser reserve. Never add it a second time.
  const totalRam = measured(hardware.ramTotalBytes), disk = measured(hardware.diskFreeBytes);
  if (totalRam !== null && totalRam < model.curation.estimatedRamGiB[1] * gib) return 'outside';
  if (disk !== null && disk < model.curation.estimatedDownloadGiB[1] * gib * 2) return 'outside';
  if (totalRam === null || disk === null) return 'unknown';
  const dedicated = adapters.filter(adapter => adapter.sharedSystemMemory !== true);
  const budgets = dedicated.map(adapter => measured(adapter.processBudgetBytes) ?? measured(adapter.dedicatedBytes)).filter((item): item is number => item !== null);
  if (!budgets.length) return 'unknown';
  const peak = model.curation.estimatedVramGiB[1] * gib;
  return dedicated.some(adapter => {
    const capacity = measured(adapter.dedicatedBytes);
    const totalBudget = measured(adapter.processBudgetBytes) ?? capacity;
    const usage = measured(adapter.processUsageBytes);
    const budget = totalBudget === null ? null : Math.max(0, totalBudget - (usage ?? 0));
    return budget !== null && peak <= budget * 0.75 && (capacity === null || capacity >= model.curation!.recommendedGpuGiB * gib);
  }) ? 'within' : 'outside';
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
