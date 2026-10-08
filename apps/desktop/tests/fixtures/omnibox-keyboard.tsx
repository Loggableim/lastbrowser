import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AddressBar } from '../../src/renderer/components/AddressBar.js';
import { DesktopI18nProvider } from '../../src/renderer/i18n.js';
import type { BrowserVisit } from '../../src/renderer/history.js';
import type { OmniboxPrivacyContext } from '../../src/renderer/omnibox-suggestions.js';
import '../../src/renderer/styles.css';

const google: BrowserVisit = { url: 'https://www.google.com/', title: 'Google', count: 10, lastVisited: 100, profileId: 'profile-a' };
const goats: BrowserVisit = { url: 'https://goats.example/', title: 'Goats', count: 1, lastVisited: 200, profileId: 'profile-a' };
const query: BrowserVisit = { ...google, url: 'https://www.google.com/search?q=gardening+tips', title: 'Search' };
function Proof() {
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [caseId, setCaseId] = useState('initial');
  const [visits, setVisits] = useState<BrowserVisit[]>([]);
  const [privacyContext, setPrivacyContext] = useState<OmniboxPrivacyContext>({ profileId: 'profile-a' });
  const [engine, setEngine] = useState('google');
  (window as unknown as { setupOmniboxProof: (name: string) => void }).setupOmniboxProof = name => {
    setCaseId(name); setValue(''); setSubmitted(''); setEngine(name === 'query' ? 'duckduckgo' : 'google');
    setVisits(name === 'empty' ? [] : name === 'query' ? [query] : name.startsWith('legacy') ? [{ ...google, profileId: undefined }] : [google, goats]);
    setPrivacyContext({ profileId: name === 'other-profile' ? 'profile-b' : 'profile-a', incognito: name === 'private', allowLegacyHistory: name === 'legacy-single' });
  };
  return <main style={{ padding: 30, width: 760, background: '#161d2a', color: '#f8fafc', minHeight: 450 }}>
    <h1 style={{ fontSize: 20 }}>Local address completion</h1>
    <AddressBar key={caseId} value={value} onChange={setValue} onSubmit={setSubmitted} visits={visits} bookmarks={[]} searchEngineId={engine} privacyContext={privacyContext} activeBookmarkable={false} activeBookmarked={false} onToggleBookmark={() => {}} />
    <output id="submitted" style={{ display: 'block', marginTop: 20 }}>{submitted}</output>
  </main>;
}
createRoot(document.getElementById('root')!).render(<DesktopI18nProvider><Proof /></DesktopI18nProvider>);
