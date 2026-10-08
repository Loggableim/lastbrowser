import { describe, expect, it } from 'vitest';
import type { StoreModel } from '../src/renderer/model-store-contracts.js';
import { filterStoreModels, formatStoreBytes, storeEmptyState, storeModelStatus, storeNextAction, summarizeStoreHardware } from '../src/renderer/components/model-store-presentation.js';
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
    expect(filterStoreModels(models,filters).map(model=>model.id)).toEqual(['small']);
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
