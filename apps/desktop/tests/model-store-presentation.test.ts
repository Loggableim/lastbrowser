import { describe, expect, it } from 'vitest';
import type { StoreModel } from '../src/renderer/model-store-contracts.js';
import { assessStoreGpuEstimate, filterStoreModels, formatStoreBytes, storeEmptyState, storeModelStatus, storeNextAction, summarizeStoreHardware } from '../src/renderer/components/model-store-presentation.js';
import { readFileSync } from 'node:fs';
const model = (id: string, state: string, allowed = false) => ({ id, name: id, publisher: 'Test', description: 'Lokales Modell', installed: null, active: false, deviceConfirmed: false, eligibility: { state, reasons: [], allowed } }) as StoreModel;
const filters = { query: '', publisher: '', showLarge: false, showUnknown: false };
describe('model store presentation without changing eligibility authority', () => {
  it('keeps missing and estimated measurements unknown even when a number exists', () => {
    expect(summarizeStoreHardware(null)).toMatchObject({ scanned: false, cpu: 'Unbekannt', gpu: 'Unbekannt', ramAvailable: 'Unbekannt' });
    expect(summarizeStoreHardware({ ramAvailableBytes: { status: 'estimated', value: 9e9 }, ramTotalBytes: { status: 'unknown', value: 12e9 } })).toMatchObject({ ramAvailable: 'Unbekannt', ramTotal: 'Unbekannt' });
    expect(formatStoreBytes(NaN)).toBe('Unbekannt');
    expect(formatStoreBytes(-1)).toBe('Unbekannt');
  });
  it('summarizes measured CPU/RAM/GPU values without summing unrelated GPU memory', () => {
    expect(summarizeStoreHardware({ cpuName: 'Test CPU', logicalCores: 16, ramAvailableBytes: { status:'measured',value:12*1024**3 }, adapters:[{name:'Test GPU',dedicatedBytes:{status:'unknown',value:null}}] })).toMatchObject({ cpu:'Test CPU',cores:'16 logische Kerne',ramAvailable:'12 GiB',gpu:'Test GPU',gpuMemory:'Unbekannt' });
    expect(summarizeStoreHardware({adapters:[{name:'A',dedicatedBytes:{status:'measured',value:8e9}},{name:'B',dedicatedBytes:{status:'measured',value:8e9}}]}).gpuMemory).toBe('Unbekannt');
  });
  it('distinguishes missing scan, no search match, unresolved compatibility and unavailable catalog', () => {
    const models=[model('unknown','unknown')];
    expect(storeEmptyState(models,filters,null)).toBe('scan_missing');
    expect(storeEmptyState(models,{...filters,query:'no-match'},null)).toBe('filtered');
    expect(storeEmptyState(models,filters,{cpuName:null})).toBe('compatibility_unknown');
    expect(storeEmptyState([],filters,{cpuName:null})).toBe('catalog_empty');
  });
  it('lets people discover all models while preserving denied install eligibility', () => {
    const models=[model('small','likely_suitable',true),model('unknown','unknown'),model('large','too_large')];
    expect(filterStoreModels(models,filters).map(model=>model.id)).toEqual([]);
    expect(filterStoreModels(models,{...filters,showUnknown:true,showLarge:true})).toHaveLength(3);
    expect(models[1].eligibility.allowed).toBe(false);
    expect(models[2].eligibility.allowed).toBe(false);
  });
  it('keeps installed models discoverable and treats future eligibility states conservatively', () => {
    const installed={...model('installed','unknown'),installed:{artifactSha256:'a'.repeat(64),bytes:1,revision:'test',verifiedAt:0}};
    expect(filterStoreModels([installed],filters)).toEqual([installed]);
    expect(filterStoreModels([model('future','future_state')],{...filters,showUnknown:true})).toHaveLength(1);
    expect(storeModelStatus(model('future','future_state'))).toBe('Kompatibilität ungeklärt');
  });
  it('chooses actionable labels without calling installed or suitable models device-confirmed', () => {
    expect(storeNextAction(model('unknown','unknown'))).toBe('Voraussetzungen ansehen');
    expect(storeNextAction(model('small','likely_suitable',true))).toBe('Installation vorbereiten');
    expect(storeModelStatus(model('small','likely_suitable',true))).toBe('Voraussichtlich geeignet');
    expect(storeModelStatus({...model('installed','unknown'),installed:{} as StoreModel['installed']})).toBe('Installiert · noch nicht bestätigt');
  });
  it('searches case-insensitively and trims input without widening publisher filters', () => {
    const models=[model('Qwen','unknown'),{...model('Other','unknown'),publisher:'Other'}];
    expect(filterStoreModels(models,{...filters,showUnknown:true,query:' QWEN '})).toHaveLength(1);
    expect(filterStoreModels(models,{...filters,showUnknown:true,publisher:'Test'})).toHaveLength(1);
  });
});

describe('conservative scanned hardware recommendations', () => {
  const gib = 1024 ** 3;
  const measured = (value: number) => ({ status: 'measured', value: value * gib });
  const curated = { ...model('curated', 'unknown'), curated: true, curation: {
    modelId: 'fixture/model', name: 'Fixture', publisher: 'Test', category: 'text', vramClass: '8', quantization: 'Q4', estimatedVramGiB: [4, 6], estimatedRamGiB: [16, 24], estimatedDownloadGiB: [3, 4], recommendedGpuGiB: 8,
    engine: 'unverified', innovation: 'fixture', useCases: [], strengths: [], limitations: [], license: 'mit', sourceUrl: 'https://example.com', priority: true
  } } as StoreModel;
  const hardware = { ramTotalBytes: measured(32), diskFreeBytes: measured(128), adapters: [{ dedicatedBytes: measured(16) }] };
  it('hides editorial priority and unknown GPU models until explicit browse opt-in', () => {
    expect(filterStoreModels([curated], filters, null)).toEqual([]);
    expect(filterStoreModels([curated], { ...filters, showLarge: true }, null)).toEqual([curated]);
    expect(curated.eligibility.allowed).toBe(false);
  });
  it('requires measured RAM and disk as well as a GPU memory bound', () => {
    expect(assessStoreGpuEstimate(curated, { adapters: hardware.adapters })).toBe('unknown');
    expect(assessStoreGpuEstimate(curated, { ...hardware, adapters: [] })).toBe('unknown');
    expect(filterStoreModels([curated], filters, { ...hardware, adapters: [] })).toEqual([]);
  });
  it('shows only the conservative within-range estimate while keeping runtime denied', () => {
    expect(assessStoreGpuEstimate(curated, hardware)).toBe('within');
    expect(filterStoreModels([curated], filters, hardware)).toEqual([curated]);
    expect(curated.eligibility.allowed).toBe(false);
  });
  it('uses upper estimates and leaves25percent of the measured GPU budget free', () => {
    expect(assessStoreGpuEstimate(curated, { ...hardware, adapters: [{ dedicatedBytes: measured(8) }] })).toBe('within');
    expect(assessStoreGpuEstimate(curated, { ...hardware, adapters: [{ dedicatedBytes: measured(6) }] })).toBe('outside');
    expect(assessStoreGpuEstimate(curated, { ...hardware, adapters: [{ dedicatedBytes: measured(16), processBudgetBytes: measured(16), processUsageBytes: measured(10) }] })).toBe('outside');
  });
  it('uses total-machine RAM estimates exactly once and reserves staging disk', () => {
    expect(assessStoreGpuEstimate(curated, { ...hardware, ramTotalBytes: measured(24) })).toBe('within');
    expect(assessStoreGpuEstimate(curated, { ...hardware, ramTotalBytes: measured(16) })).toBe('outside');
    expect(assessStoreGpuEstimate(curated, { ...hardware, diskFreeBytes: measured(7) })).toBe('outside');
  });
  it('loads catalog then performs a guarded local scan and keeps explicit browse filters scoped', () => {
    const source = readFileSync(new URL('../src/renderer/components/LocalModelStore.tsx', import.meta.url), 'utf8');
    expect(source).toContain("await request({operation:'view'});");
    expect(source).toContain("generation.current===lifecycle&&currentScopeKey.current===scopeKey)await request({operation:'scan'})");
    expect(source).toContain('currentScopeKey.current!==scopeKey');
    expect(source).toContain('viewState?.key===scopeKey?viewState.value:null');
    expect(source).toContain('setShowLarge(false);setShowUnknown(false)');
    expect(source).toContain('Auch nicht empfohlene und ungeprüfte Modelle anzeigen');
  });
});
