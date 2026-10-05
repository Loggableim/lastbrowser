#!/usr/bin/env node
// Controlled Electron DOM regression for the real SidekickSidebar at its 240px width.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const fixture = String.raw`
import React, {useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import './src/renderer/styles.css';
import {SidekickSidebar} from './src/renderer/components/SidekickSidebar';
import {DesktopI18nProvider,desktopLocaleStorageKey,useDesktopI18n} from './src/renderer/i18n';

window.lastbrowser={i18n:{setLocale:async()=>{}}};
localStorage.setItem(desktopLocaleStorageKey,'de');
const widthStyle=document.createElement('style');widthStyle.textContent='.sidekick-sidebar.expanded{width:234px!important}.sidekick-expanded-inner{width:234px!important}';document.head.append(widthStyle);
const selected=[];
function Harness(){const{locale,setLocale}=useDesktopI18n();useEffect(()=>{window.__sidebarLocale=locale;window.__setSidebarLocale=setLocale},[locale,setLocale]);return <div style={{width:234,height:'100vh'}}><SidekickSidebar mode="expanded" tabs={[]} activeTabId="" onActivateTab={()=>{}} onCloseTab={()=>{}} onNewTab={()=>{}} onCycleMode={()=>{}} onSetMode={()=>{}} activeSpacePath="C:/controlled" spaces={[]} onSelectSpace={()=>{}} onOpenSettings={()=>{}} onOpenApp={()=>{}} drawerTab="tabs" onSelectDrawerTab={(tab)=>selected.push(tab)} /></div>}
window.__selected=selected;
const nativeRaf=window.requestAnimationFrame.bind(window),nativeCancelRaf=window.cancelAnimationFrame.bind(window);
window.__pendingFrames=new Set();
window.requestAnimationFrame=(callback)=>{let id=0;id=nativeRaf((time)=>{window.__pendingFrames.delete(id);callback(time)});window.__pendingFrames.add(id);return id};
window.cancelAnimationFrame=(id)=>{window.__pendingFrames.delete(id);nativeCancelRaf(id)};
const root=createRoot(document.getElementById('root'));
root.render(<DesktopI18nProvider><Harness/></DesktopI18nProvider>);
window.__unmount=()=>root.unmount();
`;

async function main() {
  const projectRoot = path.resolve(__dirname, '../../..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-sidebar-tabs-'));
  try {
    require('esbuild').buildSync({
      stdin: { contents: fixture, loader: 'tsx', resolveDir: path.join(projectRoot, 'apps/desktop') },
      bundle: true, platform: 'browser', format: 'iife', target: 'chrome130',
      loader: { '.woff2': 'dataurl' }, outfile: path.join(temp, 'fixture.js')
    });
    fs.writeFileSync(path.join(temp, 'index.html'), '<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:"><link rel="stylesheet" href="fixture.css"></head><body style="margin:0"><div id="root"></div><script src="fixture.js"></script></body></html>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require('electron'), [__filename, '--child', temp], { cwd: projectRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (value) => stdout += value.toString());
    child.stderr.on('data', (value) => stderr += value.toString());
    const result = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
    assert.deepEqual(result, { code: 0, signal: null }, `Electron sidebar mount failed: ${stderr.slice(-4000)} ${stdout.slice(-1000)}`);
    process.stdout.write(stdout);
  } finally {
    const target = path.resolve(temp);
    assert(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith('lastbrowser-sidebar-tabs-'));
    fs.rmSync(target, { recursive: true, force: true });
  }
}

async function child(temp) {
  const { app, BrowserWindow } = require('electron');
  app.setPath('userData', path.join(temp, 'user-data'));
  await app.whenReady();
  const win = new BrowserWindow({ show: true, width: 280, height: 520, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  try {
    const rendererErrors = [];
    win.webContents.on('console-message', (event) => { if (event.level >= 2) rendererErrors.push(event.message); });
    await win.loadFile(path.join(temp, 'index.html'));
    const until = async (check, label) => {
      const end = Date.now() + 8000;
      while (Date.now() < end) {
        if (await win.webContents.executeJavaScript(check)) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`Timeout: ${label}`);
    };
    const pressKey = async (keyCode) => {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
      if (keyCode === 'Enter') win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
      await new Promise((resolve) => setTimeout(resolve, 35));
    };
    await until("document.querySelectorAll('.sidebar-drawer-tabs [role=tab]').length===4", 'all four drawer tabs mount');
    const initial = await win.webContents.executeJavaScript(`(()=>{const nav=document.querySelector('.sidebar-drawer-tabs'),tabs=[...nav.querySelectorAll('[role=tab]')],controls=[...document.querySelectorAll('.sidebar-drawer-scroll-control')];const n=nav.getBoundingClientRect(),t=tabs[3].getBoundingClientRect();return{clientWidth:nav.clientWidth,scrollWidth:nav.scrollWidth,scrollLeft:nav.scrollLeft,tools:{left:t.left,right:t.right},nav:{left:n.left,right:n.right},controls:controls.map((button)=>({disabled:button.disabled,label:button.getAttribute('aria-label')})),touchAction:getComputedStyle(nav).touchAction}})()`);
    assert(initial.clientWidth <= 200 && initial.scrollWidth > initial.clientWidth, `Expected a 234px sidebar with horizontal tab overflow: ${JSON.stringify(initial)}`);
    assert(initial.tools.right > initial.nav.right, `Tools tab should start clipped in the controlled narrow layout: ${JSON.stringify(initial)}`);
    assert.equal(initial.controls.length, 2, 'Both previous/next scroll controls are shown');
    assert(initial.controls[0].disabled && !initial.controls[1].disabled, 'Scroll controls reflect the current horizontal position');
    assert(initial.controls.every((button) => button.label?.length > 10), 'Scroll controls have descriptive accessible names');
    assert.equal(initial.touchAction, 'pan-x', 'Native horizontal touch panning remains enabled');

    const locales = ['de', 'en', 'it', 'es', 'fr', 'pt-BR', 'ru', 'ja'];
    const localeEvidence = [];
    let afterButton;
    for (const locale of locales) {
      await win.webContents.executeJavaScript(`window.__setSidebarLocale(${JSON.stringify(locale)})`);
      await until(`window.__sidebarLocale===${JSON.stringify(locale)}`, `${locale} sidebar translations`);
      await win.webContents.executeJavaScript("document.querySelector('.sidebar-drawer-tabs').scrollLeft=0;window.__selected.length=0");
      const labels = await win.webContents.executeJavaScript("[...document.querySelectorAll('.sidebar-drawer-scroll-control')].map(button=>button.getAttribute('aria-label'))");
      assert.equal(labels.length, 2, `${locale}: both scroll controls remain available`);
      assert(labels.every((label) => label && !label.startsWith('sidebar.')), `${locale}: scroll controls have localized accessible labels`);
      await win.webContents.executeJavaScript("document.querySelectorAll('.sidebar-drawer-scroll-control')[1].click()");
      await until("(()=>{const n=document.querySelector('.sidebar-drawer-tabs'),t=n.querySelectorAll('[role=tab]')[3].getBoundingClientRect(),r=n.getBoundingClientRect();return t.left>=r.left-1&&t.right<=r.right+1})()", `${locale}: next control reveals Tools`);
      afterButton = await win.webContents.executeJavaScript(`(()=>{const n=document.querySelector('.sidebar-drawer-tabs'),t=n.querySelectorAll('[role=tab]')[3].getBoundingClientRect(),r=n.getBoundingClientRect();return{scrollLeft:n.scrollLeft,toolsVisible:t.left>=r.left-1&&t.right<=r.right+1,rightDisabled:document.querySelectorAll('.sidebar-drawer-scroll-control')[1]?.disabled}})()`);
      assert(afterButton.scrollLeft > 0 && afterButton.toolsVisible, `${locale}: next control exposes Tools`);
      assert.deepEqual(await win.webContents.executeJavaScript('window.__selected'), [], `${locale}: scrolling does not activate a category`);
      await win.webContents.executeJavaScript("document.querySelectorAll('.sidebar-drawer-tabs [role=tab]')[3].focus()");
      await pressKey('Enter');
      await until("window.__selected.includes('tools')", `${locale}: keyboard activates Tools`);
      localeEvidence.push({locale,controls:labels,toolsVisible:afterButton.toolsVisible,keyboardActivation:true});
    }

    await win.webContents.executeJavaScript("window.__setSidebarLocale('de');document.querySelector('.sidebar-drawer-tabs').scrollLeft=0");
    await until("window.__sidebarLocale==='de'", 'restore German for pointer/wheel checks');
    await win.webContents.executeJavaScript("document.querySelector('.sidebar-drawer-tabs').scrollLeft=0");
    const navRect = await win.webContents.executeJavaScript("(()=>{const r=document.querySelector('.sidebar-drawer-tabs-shell').getBoundingClientRect();return{x:r.right-2,y:r.top+r.height/2}})()");
    win.webContents.sendInputEvent({ type: 'mouseMove', x: navRect.x, y: navRect.y });
    await until("document.querySelector('.sidebar-drawer-tabs').scrollLeft>0", 'hovering the right edge scrolls toward hidden sections');

    const navCenter = await win.webContents.executeJavaScript("(()=>{const r=document.querySelector('.sidebar-drawer-tabs').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()");
    win.webContents.sendInputEvent({ type: 'mouseMove', x: navCenter.x, y: navCenter.y });
    await win.webContents.executeJavaScript("document.querySelector('.sidebar-drawer-tabs').scrollLeft=0");
    win.webContents.sendInputEvent({ type: 'mouseWheel', x: navCenter.x, y: navCenter.y, deltaX: 100, deltaY: 0 });
    await until("document.querySelector('.sidebar-drawer-tabs').scrollLeft>0", 'horizontal wheel input scrolls the tab strip');

    await win.webContents.executeJavaScript("document.activeElement?.blur();document.querySelector('.sidebar-drawer-tabs').scrollLeft=0;document.querySelectorAll('.sidebar-drawer-tabs [role=tab]')[0].focus()");
    for (let index = 0; index < 3; index += 1) await pressKey('Tab');
    await until("(()=>{const n=document.querySelector('.sidebar-drawer-tabs'),t=n.querySelectorAll('[role=tab]')[3],r=t.getBoundingClientRect(),v=n.getBoundingClientRect();return document.activeElement===t&&r.left>=v.left-1&&r.right<=v.right+1})()", 'keyboard Tab reaches and reveals the final drawer tab');
    await pressKey('Enter');
    await until("window.__selected.includes('tools')", 'the revealed Tools tab is actionable');
    win.webContents.sendInputEvent({ type: 'mouseMove', x: navRect.x, y: navRect.y });
    await until("document.querySelector('.sidebar-drawer-tabs').scrollLeft>0", 'edge hover schedules a frame before unmount');
    await win.webContents.executeJavaScript("window.__unmount()");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const pendingFrames = await win.webContents.executeJavaScript('window.__pendingFrames.size');
    assert.equal(pendingFrames, 0, 'Unmount cancels all scheduled animation frames');
    assert.deepEqual(rendererErrors, [], 'No renderer errors');
    process.stdout.write(JSON.stringify({ phase: 'sidebar-drawer-navigation-smoke:passed', sidebarWidth: 234, locales: localeEvidence, initial, afterButton, hoverEdgeScroll: true, horizontalWheelScroll: true, keyboardFocusRevealsTools: true, touchPanX: initial.touchAction, toolsActivates: true, pendingFramesAfterUnmount: pendingFrames, rendererErrors }) + '\n');
    await app.exit(0);
  } catch (error) {
    console.error(error);
    await app.exit(1);
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

if (process.argv[2] === '--child') void child(process.argv[3]);
else void main().catch((error) => { console.error(error); process.exitCode = 1; });
