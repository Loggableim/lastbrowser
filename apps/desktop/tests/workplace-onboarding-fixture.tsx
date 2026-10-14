import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DesktopI18nProvider, desktopLocaleStorageKey } from '../src/renderer/i18n.js';
import { NativeBrowserStartPage } from '../src/renderer/panels/NativeBrowserStartPage.js';
import { FirstRunSetupPane } from '../src/renderer/components/FirstRunSetupPane.js';
import '../src/renderer/styles.css';

localStorage.setItem(desktopLocaleStorageKey, 'de');
const scope = { browserProfileId: 'fixture', backendProfileId: '9cc9ed75-7731-4da4-88f1-af453a3dfdc3', spaceId: '9cc9ed75-7731-4da4-88f1-af453a3dfdc4' };
const state = { completed: [] as unknown[], submitted: [] as unknown[], found: false };
Object.assign(window, { lastbrowser: {
  i18n: { setLocale: async () => {} },
  system: { discoverBrowserImport: async () => ({ defaultBrowser: null, defaultBrowserId: null, profiles: [], browsers: [] }), isDefaultBrowser: async () => true },
  sidekick: { detectExistingInstall: async () => ({ found: state.found, homeDir: 'fixture-only', components: { spaces: true, supermemory: true, profiles: true, config: true } }),
    requestWebui: async () => ({ providers: [{ id: 'openai-codex', oauth_connected: true, provider_available: true }] }) },
  independent: { request: async (request: any) => ({ ok: true, value: request.operation === 'resolveScope'
    ? { schemaVersion: 1, scope, spaceName: 'Fixture', workspacePath: null, bindingRevision: 1, setupStatus: 'confirmed', backendProfileName: 'default' }
    : { schemaVersion: 1, scope, revision: 1, model: 'fixture-model', provider: 'openai-codex', configured: true, supportsIndependent: true,
      groups: [{ provider: 'ChatGPT', provider_id: 'openai-codex', configured: true, models: [{ id: 'fixture-model', label: 'Fixture Model', supportsIndependent: true }] }] } }) }
} });
function Fixture() {
  const [view, setView] = useState<'home'|'wizard'>('home');
  const [profile, setProfile] = useState('fixture');
  const [space, setSpace] = useState('space-a');
  const [revision, setRevision] = useState(0);
  const [aiChoice, setAiChoice] = useState<'enabled'|'disabled'|null>(null);
  Object.assign(window, { __workplaceProbe: { state, setScope: (nextProfile: string, nextSpace: string) => { setProfile(nextProfile); setSpace(nextSpace); },
    show: (next: 'home'|'wizard', found=false) => { state.found=found;setView(next);setRevision(previous=>previous+1);setAiChoice(null); } } });
  return <DesktopI18nProvider>{view === 'home'
    ? <NativeBrowserStartPage activeProfileId={profile} activeSpacePath={space} bookmarks={[{ id: 'bookmark', title: 'Actual fixture bookmark', url: 'https://example.com' }]} visits={[]} onNavigate={()=>{}} spaces={[{ path: space, name: space }]} />
    : <FirstRunSetupPane key={revision} browserProfileId="fixture" backendProfileName="default" workspacePath="" initialSpaceName="Home" aiChoice={aiChoice}
      status={{ sidekick: 'ready', webuiHealth: 'ready', webuiUrl: 'http://fixture.invalid' } as any} onboardingStatus={{system:{chat_ready:true,current_provider:'openai-codex'},setup:{providers:[{id:'openai-codex',label:'ChatGPT',oauth_provider:'openai-codex'}]}}} setupLoading={false} error="" saving={false}
      onChooseAi={async choice=>{setAiChoice(choice);return true;}} onCompleteBrowserSetup={async name=>{state.completed.push(name);return true;}} onSubmit={async form=>{state.submitted.push(form);}} onDismiss={()=>{throw new Error('Unexpected setup dismissal');}} onRefreshOnboarding={async()=>{}} />}
  </DesktopI18nProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
