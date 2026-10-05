/** Real panel entry for the Main/API/SDK probe. The preload owns the transport. */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SpaceAssistantPanel } from '../src/renderer/components/SpaceAssistantPanel.js';
import { IndependentActivityOverview } from '../src/renderer/components/IndependentActivityOverview.js';
import { DesktopI18nProvider } from '../src/renderer/i18n.js';
import { IndependentAssistantClient } from '../src/renderer/independent-assistant-client.js';
import { IndependentAssistantController } from '../src/renderer/independent-assistant-controller.js';
import type { IndependentScope, ResolvedAssistantScope, ScopeSelectionRequest } from '../src/renderer/independent-contracts.js';

type PipelineSelection = ScopeSelectionRequest & Readonly<{ backendProfileName: string }>;
type PipelineEvidence = {
  selection: ResolvedAssistantScope | null; resolving: boolean; error: string | null;
  closeCount: number; enterCount: number; workChats: Array<Readonly<{ sessionId: string; scope: IndependentScope }>>;
};
declare global {
  interface Window {
    pipelineSelectScope: (selection: PipelineSelection) => Promise<void>;
    pipelineEvidence: PipelineEvidence;
    pipelineDispose: () => void;
  }
}

const bridge = new IndependentAssistantClient(window.lastbrowser.independent);
const controller = new IndependentAssistantController(bridge);
const evidence: PipelineEvidence = { selection: null, resolving: false, error: null, closeCount: 0, enterCount: 0, workChats: [] };
window.pipelineEvidence = evidence;
let setSelection: (selection: ResolvedAssistantScope | null) => void = () => {};
let setError: (error: string) => void = () => {};
let generation = 0;
let initialized = false, activeBackendProfileName = document.body.dataset.backendProfileName || 'default';
window.pipelineSelectScope = async input => {
  const captured = ++generation; evidence.resolving = true; evidence.error = null;
  setSelection(null); setError('');
  const result = await bridge.request({ schemaVersion: 1, operation: 'resolveScope', backendProfileName: input.backendProfileName,
    payload: { browserProfileId: input.browserProfileId, workspacePath: input.workspacePath, ...(input.nativeSpaceId ? { nativeSpaceId: input.nativeSpaceId } : {}) } });
  if (captured !== generation) return;
  evidence.resolving = false;
  if (result.ok) { activeBackendProfileName = input.backendProfileName; evidence.selection = result.value; setSelection(result.value); }
  else { evidence.error = result.error.code; evidence.selection = null; setError(result.error.message); }
};
window.pipelineDispose = () => { ++generation; controller.dispose(); };

function PipelineFixture(): React.JSX.Element {
  const [selection, select] = useState<ResolvedAssistantScope | null>(null);
  const [error, showError] = useState('');
  const [open, setOpen] = useState(true), [overview, setOverview] = useState(false);
  setSelection = value => { select(value); setOpen(true); setOverview(false); };
  setError = showError;
  useEffect(() => {
    if (initialized) return; initialized = true;
    void window.pipelineSelectScope({ workspacePath: document.body.dataset.workspacePath || null,
      browserProfileId: document.body.dataset.browserProfileId || 'pipeline-browser', backendProfileName: activeBackendProfileName });
  }, []);
  return <DesktopI18nProvider><main>
    <h1>Lastbrowser Main/API/SDK pipeline probe</h1>
    <p>Actual mounted panel and purpose bridge. Controlled provider and workspaces.</p>
    {error && <p role="alert">{error}</p>}
    {!selection && !error && <p role="status">Resolving the actual bound Space…</p>}
    {selection && open && <SpaceAssistantPanel selection={selection} controller={controller} beginSetup={false}
      onClose={() => { evidence.closeCount++; setOpen(false); }} onEnterSpace={() => { evidence.enterCount++; }}
      onOpenWorkChat={(sessionId, scope) => { evidence.workChats.push({ sessionId, scope }); }}
      onOpenGlobalOverview={() => setOverview(true)} onOpenProviderSettings={() => {}} />}
    {selection && overview && <IndependentActivityOverview scope={selection.scope} controller={controller} onClose={() => setOverview(false)}
      onOpenSpace={async (space, sessionId) => {
        if (sessionId) evidence.workChats.push({ sessionId, scope: space.scope });
        await window.pipelineSelectScope({ workspacePath: space.workspacePath ?? null, browserProfileId: space.scope.browserProfileId,
          backendProfileName: activeBackendProfileName });
      }} />}
  </main></DesktopI18nProvider>;
}
const target = document.getElementById('root');
if (!target) throw new Error('Pipeline root is missing');
const root = createRoot(target);
root.render(<React.StrictMode><PipelineFixture /></React.StrictMode>);
