import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LocalModelStore } from '../src/renderer/components/LocalModelStore.js';
import { IndependentAssistantClient } from '../src/renderer/independent-assistant-client.js';
import type { StoreModel, StoreView } from '../src/renderer/model-store-contracts.js';
import '../src/renderer/styles.css';

const scope = { backendProfileId: '9cc9ed75-7731-4da4-88f1-af453a3dfdc3', spaceId: '9cc9ed75-7731-4da4-88f1-af453a3dfdc4', browserProfileId: 'fixture-browser' };
const gib = 1024 ** 3;
const calls: unknown[] = [];
let scenario = 'missing';
const measured = (value: number) => ({ status: 'measured', value });
const unknown = { status: 'unknown', value: null };
function model(id: string, name: string, publisher: string, description: string, size: number | null): StoreModel {
  const allowed = scenario === 'measured' && id === 'fixture-small';
  return { id, name, publisher, description, tier: 'fixture', sourceUrl: 'https://example.com/model-license', revision: null,
    totalParameters: size ? 2.6e9 : null, contextLimit: 32768, recommendedContext: 4096, downloadBytes: size,
    recommendedRamBytes: size ? size + 3 * gib : null, recommendedVramBytes: null, memoryPolicy: 'Synthetische Schätzung für UI-Prüfung', quantization: 'Q4_0',
    runtimeStatus: 'unknown', runtimeReason: 'Synthetische Runtime-Prüfung', testStatus: 'ungetestet', historicalEvidence: null,
    licenseLabel: 'Testlizenz', licenseText: 'Synthetische Lizenz für UI-Tests. Keine tatsächliche Modellfreigabe.', licenseDigest: 'a'.repeat(64), gated: false,
    installQualified: allowed, commercialRequired: null, tasks: ['chat'], eligibility: { state: allowed ? 'likely_suitable' : id === 'fixture-large' ? 'too_large' : 'unknown', reasons: allowed ? [] : scenario==='stale'?['hardware_scan_stale','runtime_compatibility_unknown']:['runtime_compatibility_unknown'], allowed },
    installed: null, active: false, deviceConfirmed: false };
}
function view(): StoreView {
  const hardware = scenario === 'missing' ? null : { observedAt: '2026-10-08T14:30:00Z', cpuName: scenario === 'measured' ? 'Testprozessor · 16 Kerne' : null,
    logicalCores: scenario === 'measured' ? 16 : null, ramAvailableBytes: scenario === 'measured' ? measured(18*gib) : unknown,
    ramTotalBytes: scenario === 'measured' ? measured(32*gib) : unknown, diskFreeBytes: scenario === 'measured' ? measured(128*gib) : unknown,
    adapters: [{ name: 'Testgrafikkarte', dedicatedBytes: unknown }] };
  return { catalogRevision: 'synthetic-ui-only', hardware,
    models: [model('fixture-small','LFM2.5-2.6B','LiquidAI','Kompaktes Textmodell für lokale Gespräche. Die Eignung hängt von deinem PC und der Runtime ab.',1.6*gib),
      model('fixture-unknown','Qwen3-8B','Qwen','Ein vielseitiges Sprachmodell. Die konkrete Variante benötigt eine eigene Kompatibilitätsprüfung.',5*gib),
      model('fixture-large','DeepSeek-V3','DeepSeek','Großes Modell mit höherem Speicherbedarf. Zum Entdecken sichtbar, auf diesem Test-PC nicht freigegeben.',null)],
    jobs: [], history: [], entitlement: { largeModelsAllowed: true, status: 'fixture', threshold: 1e10 }, suite: { version: 'fixture', sha256: 'b'.repeat(64), cases: 16, quickCases: 6, standardRepeats: 3 } };
}
const client = new IndependentAssistantClient({ request: async (input: unknown) => {
  calls.push(input);
  const request = input as { payload: { request: { operation: string } } };
  if (request.payload.request.operation === 'scan') await new Promise(resolve => setTimeout(resolve, 120));
  return { ok: true, value: { schemaVersion: 1, scope, kind: 'model_store', operation: request.payload.request.operation, store: view(), storeResult: null } };
} });
function Fixture() {
  const [revision, setRevision] = useState(0);
  Object.assign(window, { __modelStoreUX: { calls, scenario: (next: string) => { scenario=next;setRevision(current=>current+1); } } });
  return <main style={{ maxWidth: 1120, margin: '0 auto', padding: '20px' }}>
    <p style={{ fontSize:12, color:'var(--lb-muted)' }}>Synthetische UI-Prüfung · keine Hardwaremessung, Installation oder Inferenz</p>
    <LocalModelStore key={revision} scope={scope} client={client} ready />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
