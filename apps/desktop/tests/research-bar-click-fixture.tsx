import React from 'react';
import { createRoot } from 'react-dom/client';
import { InPageActionBar } from '../src/renderer/components/InPageActionBar.js';
import { dispatchSidekickAction, type SidekickActionId } from '../src/renderer/bridge.js';

const webview = { executeJavaScript: async () => ({ selectedText: 'selected controlled excerpt', pageText: 'controlled visible page text' }), getURL: () => 'https://controlled.invalid/page', getTitle: () => 'Controlled page' } as unknown as Electron.WebviewTag;
const activeTab = { url: 'https://fallback.invalid', title: 'Fallback' };
createRoot(document.getElementById('root')!).render(<InPageActionBar variant="topbar" dockMode="topbar" onAction={(action: SidekickActionId) => {
  void dispatchSidekickAction(action, webview, activeTab, async (prompt, title) => {
    document.body.dataset.lastAction = action;
    document.body.dataset.lastTitle = title;
    document.body.dataset.lastPrompt = prompt;
  });
}} zoomFactor={1} onResetZoom={() => {}} onFindOpen={() => {}} downloadsOpen={false} onToggleDownloads={() => {}} historyOpen={false} onToggleHistory={() => {}} onToggleMute={() => {}} />);
