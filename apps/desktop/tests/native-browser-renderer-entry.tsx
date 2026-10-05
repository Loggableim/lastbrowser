/** Actual native browser activity/buttons, backed by the genuine preload. */
import React from 'react';
import {createRoot} from 'react-dom/client';
import {DesktopI18nProvider} from '../src/renderer/i18n.js';
import {NativeChatBrowserActivity} from '../src/renderer/components/NativeChatBrowserView.js';
import type {IndependentScope} from '../src/renderer/independent-contracts.js';

declare global {
  interface Window {
    mountNativeBrowserProbe: (scope: IndependentScope, sessionId: string) => void;
    unmountNativeBrowserProbe: () => void;
  }
}
const root=createRoot(document.getElementById('native-browser-root')!);
window.mountNativeBrowserProbe=(scope,sessionId)=>root.render(
  <DesktopI18nProvider><NativeChatBrowserActivity scope={scope} sessionId={sessionId}
    client={window.lastbrowser.independent}/></DesktopI18nProvider>);
window.unmountNativeBrowserProbe=()=>root.unmount();
