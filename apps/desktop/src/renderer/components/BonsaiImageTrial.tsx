import React from 'react';
import { ArrowRight, Image as ImageIcon } from 'lucide-react';
import { useTabStore } from '../stores/useTabStore.js';
import { usePanelStore } from '../stores/usePanelStore.js';

export const BONSAI_IMAGE_DEMO_URL = 'https://huggingface.co/spaces/webml-community/bonsai-image-webgpu';

/** User navigation only: no model fetches, injected scripts or inference permissions. */
export function openBonsaiImageTrial(): void {
  const store = useTabStore.getState();
  store.addTab(BONSAI_IMAGE_DEMO_URL);
  const tabId = useTabStore.getState().activeTabId;
  store.setTabs(tabs => tabs.map(tab => tab.id === tabId ? { ...tab, title: 'Bonsai Image · WebGPU-Test' } : tab));
  usePanelStore.getState().setActivePanel('browser');
}

export function BonsaiImageTrial(): React.JSX.Element {
  return <section className="local-model-detail-section" aria-label="Bonsai Image ausprobieren">
    <h4><ImageIcon size={17} aria-hidden="true"/> Bonsai Image · experimentell</h4>
    <p>Teste den Bildgenerator der WebML Community in einem LastBrowser-Tab. Die Demo nutzt WebGPU; die Ausführung auf deinem PC ist noch ungeprüft.</p>
    <p>Du öffnest eine externe Hugging-Face-Seite. Dort wählst und lädst du das Modell selbst; mehrere GB Download und ein Hugging-Face-Zugangstoken können erforderlich sein. Es gelten die Bedingungen und Datenschutzhinweise der Demo.</p>
    <p>Beginne mit 512 × 512 und 4 Schritten. Falls WebGPU fehlt oder die Demo unsichere Browser-Flags verlangt, ist dieser Testweg auf deinem Gerät noch nicht freigegeben.</p>
    <button type="button" className="local-model-secondary" onClick={openBonsaiImageTrial}>
      WebGPU-Demo im Browser öffnen <ArrowRight size={15} aria-hidden="true"/>
    </button>
  </section>;
}
