import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DesktopI18nProvider} from '../src/renderer/i18n.js';
import {SidekickSidebar} from '../src/renderer/components/SidekickSidebar.js';
import {WindowTitlebar,ProfileSwitcher} from '../src/renderer/components/HeaderComponents.js';
import {NovaDock} from '../src/renderer/components/NovaDock.js';
import {usePinnedAppStore} from '../src/renderer/stores/usePinnedAppStore.js';
import {usePanelStore} from '../src/renderer/stores/usePanelStore.js';
import {createInitialTab} from '../src/renderer/tabs.js';
import '../src/renderer/styles.css';

const tabs=[
  {...createInitialTab('https://guest.localhost:8877/alpha'),id:'root',title:'Guest Root - Full Source Title Preserved After Reload'},
  {...createInitialTab('https://docs.guest.localhost:8877/docs'),id:'docs',title:'Guest Docs - Independent Subdomain'},
  {...createInitialTab('https://www.guest.localhost:8877/second'),id:'www',title:'Guest WWW - Same Canonical Host'},
];
const seed={id:'seed',name:'Existing local app',url:'https://existing.localhost/',color:'#38bdf8',bg:'#183040',letter:'E',domain:'existing.localhost'};
const fixtureWindow=window as typeof window & {pinProfileFixture:Record<string,unknown>};
usePanelStore.getState().setDockSettings({...usePanelStore.getState().dockSettings,position:'left',autoHide:false,animation:'none'});
if(!localStorage.getItem('pin-profile-initialized')){usePinnedAppStore.getState().setApps([seed]);localStorage.setItem('pin-profile-initialized','1');}
function Fixture(){
  const dockPosition=usePanelStore(state=>state.dockSettings.position);
  const [dragged,setDragged]=useState<string|null>(null),[mode,setMode]=useState<'expanded'|'slim'>('expanded');
  const [floating,setFloating]=useState(false),[active,setActive]=useState('root'),[created,setCreated]=useState<string[]>([]);
  const [profiles,setProfiles]=useState([{id:'default',name:'Default',icon:'🌐',color:'#2563ff',createdAt:1,isDefault:true}]);
  const [profile,setProfile]=useState('default');
  const pin=(id:string)=>{const tab=tabs.find(tab=>tab.id===id);if(tab)usePinnedAppStore.getState().pinTabAsApp(tab,'fixture-space');setDragged(null);};
  const shared={draggedTabId:dragged,tabs,onPinTabAsApp:pin};
  fixtureWindow.pinProfileFixture={...fixtureWindow.pinProfileFixture,apps:()=>usePinnedAppStore.getState().apps,created:()=>created,profile:()=>profile,dragged:()=>dragged,
    reset:()=>usePinnedAppStore.getState().setApps([seed]),mode:(value:'expanded'|'slim',overlay=false)=>{setMode(value);setFloating(overlay);},
    dock:(position:'left'|'right'|'top'|'bottom'|'floating')=>usePanelStore.getState().setDockSettings({...usePanelStore.getState().dockSettings,position,autoHide:false,animation:'none'})};
  return <><div className="fixture-topbar"><WindowTitlebar tabs={tabs} activeTabId={active} draggedTabId={dragged} onActivateTab={setActive}
    onCloseTab={()=>{}} onNewTab={()=>{}} onDragStartTab={setDragged} onDragEndTab={()=>setDragged(null)}/></div>
    <div className="fixture-shell"><SidekickSidebar mode={mode} isFloatingOverlay={floating} {...shared} activeTabId={active} onActivateTab={setActive}
      onCloseTab={()=>{}} onNewTab={()=>{}} onDragStartTab={setDragged} onDragEndTab={()=>setDragged(null)} onCycleMode={()=>{}}
      onSetMode={setMode} activeSpacePath="fixture-space" spaces={[]} onSelectSpace={()=>{}} onOpenSettings={()=>{}}
      onOpenApp={()=>{}} onAddPinnedApp={()=>{}} drawerTab="tabs" activePanel="browser"/>
      <main className="fixture-settings settings-panel-scroll">
        <section className="settings-card"><h2>Browser profiles</h2><ProfileSwitcher profiles={profiles} activeProfileId={profile}
          onSelect={setProfile} onCreate={name=>{const id='profile-'+(profiles.length+1);setProfiles(previous=>[...previous,{id,name,icon:'🌐',color:'#a78bfa',createdAt:1,isDefault:false}]);setProfile(id);setCreated(previous=>[...previous,name]);}}
          onRename={(id,name)=>setProfiles(previous=>previous.map(row=>row.id===id?{...row,name}:row))} onDelete={id=>setProfiles(previous=>previous.filter(row=>row.id!==id))}/></section>
        <section className="settings-card overlay-card"><h2>Backend profile card</h2><button type="button">Underlying card action</button></section>
        <section className="settings-card overlay-card"><h2>Preferences</h2><button type="button">Underlying preference action</button></section>
        <div style={{height:500}}/>
      </main>
    </div>
    {mode==='slim'&&dockPosition!=='left'&&<NovaDock {...shared} botName="Fixture" spacePath="fixture-space" onOpenApp={()=>{}}
      onOpenSettings={()=>{}} onNewTab={()=>{}} onExpandSidebar={()=>setMode('expanded')} onAddPinnedApp={()=>{}}/>}
  </>;
}
const events:unknown[]=[];
for(const type of ['dragstart','dragover','drop','dragend'])document.addEventListener(type,event=>{const drag=event as DragEvent;
  if(type==='dragover'&&events.length>100)return;const row={type,trusted:event.isTrusted,target:(event.target as HTMLElement).className,types:Array.from(drag.dataTransfer?.types??[]),prevented:false,allowed:'',effect:'',dragged:null as unknown};
  events.push(row);row.prevented=event.defaultPrevented;row.allowed=drag.dataTransfer?.effectAllowed??'';row.effect=drag.dataTransfer?.dropEffect??'';const getter=fixtureWindow.pinProfileFixture.dragged;row.dragged=typeof getter==='function'?getter():null;},true);
fixtureWindow.pinProfileFixture={events};
localStorage.setItem('lastbrowser.locale','en');
createRoot(document.getElementById('root')!).render(<DesktopI18nProvider><Fixture/></DesktopI18nProvider>);
