/**
 * Native chat panel for Lastbrowser.
 *
 * Extracted from App.tsx. Renders the full chat interface:
 *   • Header with session title, status, queue, compression, control center, developer toggle
 *   • ChatTranscript (scrollable message list)
 *   • ApprovalPollManager / ApprovalCard
 *   • ChatComposer with model switcher, queue indicator, context usage
 *   • ControlCenter drawer
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Plus, Settings } from 'lucide-react';
import { brandAssets } from '../brand.js';
import { canCallSidekickApi } from '../runtime-readiness.js';
import { partitionChatMessages } from '../chat-display.js';
import { useChatQueue, CompressButton, QueueIndicator } from '../NativeCompressQueue.js';
import { ChatTranscript, ChatComposer } from './ChatComponents.js';
import { ApprovalPollManager, ApprovalCard } from '../NativeApproval.js';
import { ContextUsageIndicator } from '../NativeContextUsage.js';
import { ControlCenter } from '../NativeControlCenter.js';
import {
  sessionTitle,
  shortSessionId,
  type DesktopSessionDetail,
  type DesktopChatMessage,
  type ChatRunState
} from '../shell-state.js';
import {
  hasTabsMention,
  extractTargetTabNumbers,
  synthesizeTabsContext,
  buildPromptWithTabContext
} from '../tab-intelligence.js';
import { useGeminiAccountStore } from '../stores/useGeminiAccountStore.js';
import { useChatStore } from '../stores/useChatStore.js';
import { saveSpaceModel } from '../space-models.js';
import { resolveLiteralCatalogModelSelection, resolveCatalogModelSelection, resolvePreferredChatModel } from '../provider-model-selection.js';
import { IndependentAssistantClient } from '../independent-assistant-client.js';
import { assistantScopeKey, sameAssistantScope, newIndependentRequestId, type ScopedModelSelection } from '../independent-contracts.js';
import { useSpaceAssistantStore } from '../stores/useSpaceAssistantStore.js';
import type { NativeChatTurnUsage } from '../chat-usage.js';
import { useDesktopI18n } from '../i18n.js';
import { loadChatReasoningEffort, normalizeReasoningEfforts, resolveReasoningModel, resolveSessionReasoningEffort, saveChatReasoningEffort } from '../chat-reasoning-effort.js';
import { mapScopedModelPickerOptions } from '../model-picker-options.js';
import { isIndependentOwnedSession, isIndependentWriterProtected, readIndependentSessionRun } from '../independent-work-chat.js';
import { captureCommandContext,isCommandContextCurrent,type CommandAction,type CommandCapabilities,type CommandContext } from '../CommandActionContracts.js';
import { CHAT_COMMANDS } from '../chat-command-registry.js';
import { chatCommandCopy } from '../chat-command-copy.js';
import { GoalControls, shouldRenderPersistentGoalControls } from './GoalControls.js';
import { ChatModeControls } from './ChatModeControls.js';
import { requestChatMode,type ChatModeResponse } from '../chat-mode-client.js';
import type { IndependentScope } from '../independent-contracts.js';
import { readNativeGoalStatus,type NativeGoalStatus } from '../native-goal-client.js';
import { isNativeGoalMigrationRequired,nativeGoalErrorCopy } from '../native-goal-errors.js';
import { shouldAcceptPersistentGoalCommand } from '../persistent-goal-command.js';
import { NativeGoalMigrationControls } from '../components/NativeGoalMigrationControls.js';
import { useChildRunHistory } from '../useChildRunHistory.js';
import { canExecuteAutomaticPolicy,requestModelPolicy,type ModelPolicyDraft,type ModelPolicyResponse } from '../model-policy-client.js';
import { modelPolicyCopy,modelPolicyReason } from '../i18n/model-policy-copy.js';
import { NativeChatPendingControls } from '../components/NativeChatPendingControls.js';
import { readNativeControlSnapshot,recoverNativeControls,useNativeChatControls } from '../native-chat-control.js';
import { isIndependentRecord, isIndependentScope } from '../independent-assistant-client.js';
import { requestNativeGrill,readNativeGrillEvent,readNativeGrillFallbackMarker,NativeGrillError,type NativeGrillState,type NativeGrillMutation } from '../native-grill-client.js';
import { NativeGrillControls } from '../components/NativeGrillControls.js';
import { NativeChatBrowserActivity } from '../components/NativeChatBrowserView.js';
import { nativeGrillCopy } from '../i18n/native-grill-copy.js';

const noCommandCapabilities:CommandCapabilities={plan:false,grill_me:false,boost:false,goal:false,gquota:false,plugins:false};

type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;
export type ComposerMode = 'action' | 'plan';

export type NativeChatMainProps = {
  commandCapabilities?:CommandCapabilities;
  onCommandAction?:(action:CommandAction)=>Promise<void>|void;
  activeSession: DesktopSessionDetail | null;
  activeSessionId: string | null;
  busy: boolean;
  chatError: string;
  messages: DesktopChatMessage[];
  runState: ChatRunState;
  composerMode: ComposerMode;
  composerText: string;
  serviceStatus: ServiceStatus | null;
  sessionLoading: boolean;
  setupModel: string;
  activeSpacePath: string;
  activeBrowserProfileId: string;
  activeBackendProfileName?: string;
  showTokenUsage: boolean;
  showTps: boolean;
  showThinking: boolean;
  simplifiedToolCalling: boolean;
  latestTurnUsage: NativeChatTurnUsage | null;
  onComposerMode: (mode: ComposerMode) => void;
  onComposerText: (text: string) => void;
  onCreateSession: () => void;
  onSend: (message: string, reasoningEffort?: string) => void;
  onStop: () => void;
};

export function NativeChatMain({
  commandCapabilities=noCommandCapabilities,
  onCommandAction,
  activeSession,
  activeSessionId,
  busy,
  chatError,
  messages,
  runState,
  composerMode,
  composerText,
  serviceStatus,
  sessionLoading,
  setupModel,
  activeSpacePath,
  activeBrowserProfileId,
  activeBackendProfileName,
  showTokenUsage,
  showTps,
  showThinking,
  simplifiedToolCalling,
  latestTurnUsage,
  onComposerMode,
  onComposerText,
  onCreateSession,
  onSend,
  onStop
}: NativeChatMainProps): React.JSX.Element {
  const { t,locale } = useDesktopI18n();
  const independentRun = isIndependentOwnedSession(activeSession) ? readIndependentSessionRun(activeSession) : null;
  const independentRunState = useSpaceAssistantStore(state => {
    if (!independentRun) return undefined;
    const activity = state.entries[assistantScopeKey(independentRun.scope)]?.activity;
    return activity?.sourceState === 'live' ? activity.runs.find(run => run.runId === independentRun.runId)?.state : undefined;
  });
  const writerProtected = isIndependentWriterProtected(activeSession);
  const running = runState === 'starting' || runState === 'streaming' || runState === 'cancelling';
  const ready = canCallSidekickApi(serviceStatus);
  const [showDeveloperTools, setShowDeveloperTools] = useState(false);
  const [showControlCenter, setShowControlCenter] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const { queue, enqueue, dequeue, clearQueue, removeAt } = useChatQueue();
  const { visible: visibleMessages, developer: developerMessages } = useMemo(
    () => partitionChatMessages(messages),
    [messages]
  );
  const profile = activeSession?.profile || 'default';
  const workspace = activeSession?.workspace || activeSpacePath || 'default';
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);
  const setSelectedModelProvider = useChatStore((state) => state.setSelectedModelProvider);
  const modelViewKey = JSON.stringify([activeBrowserProfileId, activeSpacePath]);
  const modelViewKeyRef = useRef(modelViewKey); modelViewKeyRef.current = modelViewKey;
  const modelClient = useMemo(() => new IndependentAssistantClient(window.lastbrowser.independent), []);
  const [scopedModel, setScopedModel] = useState<{ viewKey: string; selection: ScopedModelSelection } | null>(null);
  const spaceModelSelection = scopedModel?.viewKey === modelViewKey ? scopedModel.selection : null;
  const [catalogDefaultModel, setCatalogDefaultModel] = useState('');
  const model = resolvePreferredChatModel(
    spaceModelSelection?.model,
    spaceModelSelection ? '' : activeSession?.model,
    catalogDefaultModel,
    'default'
  );
  const reasoningPreferenceKey = activeSessionId || `draft:${profile}:${workspace}`;
  const editedReasoningKey = useRef<string | null>(null);
  const [reasoningEffort, setReasoningEffort] = useState(() => loadChatReasoningEffort(reasoningPreferenceKey, window.localStorage));
  useEffect(() => {
    editedReasoningKey.current = null;
    setReasoningEffort(loadChatReasoningEffort(reasoningPreferenceKey, window.localStorage));
  }, [activeSessionId, reasoningPreferenceKey]);

  // Discovery runs in the captured profile worker. No global model default is written.
  const [modelCatalog, setModelCatalog] = useState<Array<{ provider: string; providerId: string; configured: boolean; disabledReason?: string; models: Array<{ id: string; label: string; reasoningEfforts: string[];supportsIndependent:boolean }> }>>([]);
  const [modelCatalogLoaded, setModelCatalogLoaded] = useState(false);
  const [modelCatalogError, setModelCatalogError] = useState(false);
  const [modelCatalogRetry, setModelCatalogRetry] = useState(0);
  const modelProvider = spaceModelSelection?.provider
    || resolveCatalogModelSelection(activeSession?.model || model, modelCatalog).provider
    || modelCatalog.find((group) => group.models.some((entry) => entry.id === model))?.providerId
    || '';
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setModelCatalogError(false);
    setModelCatalogLoaded(false); setModelCatalog([]); setScopedModel(null); setCatalogDefaultModel('');
    const load = async () => {
      try {
        const resolved = await modelClient.request({ schemaVersion: 1, operation: 'resolveScope', payload: {
          browserProfileId: activeBrowserProfileId, workspacePath: activeSpacePath || null
        }, backendProfileName: activeBackendProfileName || (activeSession as any)?.profile || undefined });
        if (!resolved.ok) throw new Error(resolved.error.message);
        const result = await modelClient.request({ schemaVersion: 1, operation: 'modelSelection', scope: resolved.value.scope, payload: { action: 'get' } });
        if (!result.ok) throw new Error(result.error.message);
        if (!alive) return;
        const data = result.value;
        if (!data.groups) throw new Error('Model catalog is missing.');
        const rawParsed = mapScopedModelPickerOptions(data).map(group=>({...group,models:group.models.map(entry=>({...entry,reasoningEfforts:normalizeReasoningEfforts(entry.reasoningEfforts)}))}));
        setScopedModel({ viewKey: modelViewKey, selection: data });
        setCatalogDefaultModel(data.model);
        if (data.model && activeSpacePath) saveSpaceModel(activeSpacePath, data.model, window.localStorage, data.provider);
        setModelCatalog(rawParsed);
        setModelCatalogLoaded(true);
      } catch {
        if (alive) {
          setCatalogDefaultModel('');
          setModelCatalog([]);
          setModelCatalogLoaded(false);
          setModelCatalogError(true);
        }
      }
    };
    void load();
    return () => { alive = false; };
  }, [ready, activeSpacePath, activeBrowserProfileId, modelViewKey, modelClient, modelCatalogRetry]);

  /** Change only this bound Space preference; executing runs keep their captured model. */
  const commitComposerModelChoice = useCallback((selection: string) => {
    if (!selection || !spaceModelSelection) return;
    const candidate = resolveLiteralCatalogModelSelection(selection, modelCatalog);
    if (!candidate) return;
    const nextModel = candidate.model, provider = candidate.provider ?? '';
    if (nextModel === model && provider === modelProvider) return;
    const capturedKey = modelViewKey;
    void modelClient.request({ schemaVersion: 1, operation: 'modelSelection', scope: spaceModelSelection.scope, payload: {
      action: 'set', model: nextModel, provider, expectedRevision: spaceModelSelection.revision, clientRequestId: newIndependentRequestId()
    } }).then(result => {
        if (!result.ok) throw new Error(result.error.message);
        if (modelViewKeyRef.current !== capturedKey) return;
        setScopedModel({ viewKey: capturedKey, selection: result.value });
        if (activeSpacePath) {
          saveSpaceModel(activeSpacePath, nextModel, window.localStorage, provider);
        }
        setSelectedModel(nextModel);
        setSelectedModelProvider(provider);
        setStatusMessage(`${t('chat.model')}: ${nextModel}`);
      })
      .catch((error: unknown) => {
        if (modelViewKeyRef.current === capturedKey) setStatusMessage(`${t('common.error')}: ${error instanceof Error ? error.message : String(error)}`);
      });
  }, [activeSpacePath, model, modelCatalog, modelProvider, setSelectedModel, setSelectedModelProvider, spaceModelSelection, modelViewKey, modelClient, t]);

  const reasoningModel = resolveReasoningModel(model, modelProvider, modelCatalog);
  const modelReasoningEfforts = reasoningModel?.reasoningEfforts || [];
  const sessionReasoningEffort = resolveSessionReasoningEffort(activeSession?.reasoning_selection, model, modelProvider);
  useEffect(() => {
    if (!activeSessionId || activeSession?.session_id !== activeSessionId || sessionReasoningEffort === null
      || editedReasoningKey.current === reasoningPreferenceKey) return;
    setReasoningEffort(sessionReasoningEffort);
    saveChatReasoningEffort(reasoningPreferenceKey, sessionReasoningEffort, window.localStorage);
  }, [activeSessionId, activeSession?.session_id, sessionReasoningEffort, reasoningPreferenceKey]);
  const effectiveReasoningEffort = modelCatalogLoaded && modelReasoningEfforts.includes(reasoningEffort) ? reasoningEffort : '';
  const commandContext=captureCommandContext({sessionId:activeSessionId,profileId:activeBrowserProfileId,spacePath:activeSpacePath,
    browserProfileId:activeBrowserProfileId,model,modelProvider,reasoningEffort:effectiveReasoningEffort||undefined});
  const currentCommandContext=useRef<CommandContext>(commandContext);currentCommandContext.current=commandContext;
  const autoRouteState=useNativeChatControls(state=>state.autoRoute);
  const actualAutoSelection=autoRouteState&&activeSessionId&&activeSession?.session_id===activeSessionId
    &&autoRouteState.binding.sessionId===activeSessionId&&autoRouteState.binding.browserProfileId===activeBrowserProfileId
    &&autoRouteState.binding.workspacePath===activeSpacePath&&isIndependentScope(activeSession.space_scope)
    &&sameAssistantScope(autoRouteState.binding.scope,activeSession.space_scope)?autoRouteState.receipt:null;
  const chatSection=useRef<HTMLElement>(null);
  const modeViewKey=JSON.stringify([activeSessionId,activeBrowserProfileId,activeSpacePath]);
  const policyScopeIdentity=JSON.stringify([modeViewKey,activeBackendProfileName||(activeSession as any)?.profile||'']);
  const policyEpochRef=useRef({identity:policyScopeIdentity,epoch:0});
  if(policyEpochRef.current.identity!==policyScopeIdentity)policyEpochRef.current={identity:policyScopeIdentity,epoch:policyEpochRef.current.epoch+1};
  const policyOperationKey=`${modeViewKey}:${policyEpochRef.current.epoch}`;
  const [modeGate,setModeGate]=useState<{viewKey:string;scope:IndependentScope;response:ChatModeResponse}|null>(null);
  const [modePending,setModePending]=useState<string|null>(null);
  const [modeRefresh,setModeRefresh]=useState(0);
  const modeLock=useRef(new Set<string>()),modeRetry=useRef<{signature:string;requestId:string}|null>(null);
  const currentModeGate=modeGate?.viewKey===modeViewKey?modeGate:null;
  useEffect(()=>{
    if(!activeSessionId||!isIndependentScope(activeSession?.space_scope)||activeSession.space_scope.browserProfileId!==activeBrowserProfileId)return;
    const snapshot=readNativeControlSnapshot(activeSession.native_controls,activeSession.space_scope,activeSessionId);
    if(snapshot)recoverNativeControls(snapshot,{scope:snapshot.scope,sessionId:activeSessionId,streamId:snapshot.streamId,browserProfileId:activeBrowserProfileId,workspacePath:activeSpacePath});
  },[modeViewKey,activeSession?.native_controls]);
  const [goalGate,setGoalGate]=useState<{viewKey:string;status:NativeGoalStatus}|null>(null);
  const [goalMigrationRequired,setGoalMigrationRequired]=useState<string|null>(null);
  const currentGoalGate=goalGate?.viewKey===modeViewKey?goalGate:null;
  const children=useChildRunHistory(activeSessionId,activeSpacePath,activeBrowserProfileId,ready,activeBackendProfileName||(activeSession as any)?.profile);
  const [policyGate,setPolicyGate]=useState<{viewKey:string;scope:IndependentScope;response:ModelPolicyResponse}|null>(null);
  const [policyPending,setPolicyPending]=useState<string|null>(null);
  const [policyError,setPolicyError]=useState(''),[policyRefresh,setPolicyRefresh]=useState(0);
  const policyLocks=useRef(new Set<string>()),policyRetry=useRef<{signature:string;requestId:string}|null>(null);
  const currentPolicy=policyGate?.viewKey===policyOperationKey?policyGate:null;
  const automaticSelected=Boolean(currentPolicy?.response.policy.mode==='auto');
  const automaticAvailable=currentPolicy?canExecuteAutomaticPolicy(currentPolicy.response):false;
  const automaticBlocked=Boolean(automaticSelected&&!automaticAvailable);
  const availableCommands=writerProtected?noCommandCapabilities:currentModeGate?.response.capabilities??commandCapabilities;
  const commandCopy=chatCommandCopy(locale);
  const [goalEditorToken,setGoalEditorToken]=useState(0),[goalEditorViewKey,setGoalEditorViewKey]=useState<string|null>(null);
  useEffect(()=>{setGoalEditorViewKey(current=>current===modeViewKey?current:null);},[modeViewKey]);
  const [goalPending,setGoalPending]=useState<string|null>(null),goalLocks=useRef(new Set<string>()),goalControlLocks=useRef(new Set<string>());
  const goalRetry=useRef<{signature:string;requestId:string}|null>(null);
  const [grillGate,setGrillGate]=useState<{viewKey:string;scope:IndependentScope;grill:NativeGrillState|null;history:readonly NativeGrillState[]}|null>(null);
  const [grillRefresh,setGrillRefresh]=useState(0),[grillLoading,setGrillLoading]=useState<string|null>(null),[grillPending,setGrillPending]=useState<string|null>(null);
  const [grillError,setGrillError]=useState<{viewKey:string;code:'unavailable'|'conflict'}|null>(null),[grillFallback,setGrillFallback]=useState<string|null>(null);
  const [grillSeed,setGrillSeed]=useState<{viewKey:string;objective:string}|null>(null);
  const grillLocks=useRef(new Set<string>()),grillRetry=useRef<{signature:string;requestId:string}|null>(null);
  const currentGrill=grillGate?.viewKey===modeViewKey?grillGate:null,grillCopy=nativeGrillCopy(locale);
  const lastGrillMessage=[...messages].reverse().find(message=>message.role==='assistant'&&(message.grill_question||message.grill_fallback));
  const savedGrillFallback=Boolean(currentModeGate&&activeSession?.session_id===activeSessionId&&isIndependentScope(activeSession.space_scope)
    &&assistantScopeKey(activeSession.space_scope)===assistantScopeKey(currentModeGate.scope)&&lastGrillMessage&&readNativeGrillFallbackMarker(lastGrillMessage.grill_fallback));
  useEffect(()=>{
    if(!ready||!activeSessionId||typeof window.lastbrowser.sidekick.chatMode!=='function'){setModeGate(null);return;}
    let current=true;
    const captured=commandContext;
    void(async()=>{
      try{
        const resolved=await modelClient.request({schemaVersion:1,operation:'resolveScope',payload:{browserProfileId:captured.browserProfileId,workspacePath:captured.spacePath||null},backendProfileName:activeBackendProfileName||(activeSession as any)?.profile||undefined});
        if(!resolved.ok)throw new Error('chat_mode_unavailable');
        const response=await requestChatMode(request=>window.lastbrowser.sidekick.chatMode(request),{action:'get',sessionId:activeSessionId,
          browserProfileId:captured.browserProfileId,workspacePath:captured.spacePath},resolved.value.scope);
        if(current&&isCommandContextCurrent(captured,currentCommandContext.current))setModeGate({viewKey:modeViewKey,scope:resolved.value.scope,response});
      }catch{if(current)setModeGate(null);}
    })();
    return()=>{current=false;};
  },[modeViewKey,ready,modeRefresh,activeSession?.chat_execution_mode?.revision,activeSession?.goal?.revision,busy,running]);
  useEffect(()=>{
    if(!ready||!activeSessionId||!currentModeGate?.response.capabilities.goal||typeof window.lastbrowser.sidekick.goalCommand!=='function'){setGoalGate(null);return;}
    let current=true;const captured=commandContext;
    void window.lastbrowser.sidekick.goalCommand({sessionId:activeSessionId,args:'status',workspacePath:captured.spacePath,browserProfileId:captured.browserProfileId})
      .then(value=>{const status=readNativeGoalStatus(value,activeSessionId);if(current&&isCommandContextCurrent(captured,currentCommandContext.current)){
        setGoalGate({viewKey:modeViewKey,status});
        const oldNamespace=typeof status.goal?.space==='string'&&/^lbws-[a-f\d]{32}$/.test(status.goal.space);
        setGoalMigrationRequired(previous=>oldNamespace&&(status.goal?.status==='paused'||previous===modeViewKey)?modeViewKey:previous===modeViewKey?null:previous);
      }})
      .catch(error=>{if(current&&isCommandContextCurrent(captured,currentCommandContext.current)){setGoalGate(null);if(isNativeGoalMigrationRequired(error))setGoalMigrationRequired(modeViewKey);}});
    return()=>{current=false;};
  },[modeViewKey,ready,currentModeGate?.response.mode.revision,activeSession?.goal?.revision,busy,running,modeRefresh]);
  useEffect(()=>{
    if(!ready||!activeSessionId||!currentModeGate||currentModeGate.response.mode.mode!=='grill_me')return;
    if(typeof window.lastbrowser.sidekick.grill!=='function'){setGrillError({viewKey:modeViewKey,code:'unavailable'});return;}
    let current=true;const captured=commandContext,scope=currentModeGate.scope;setGrillLoading(modeViewKey);
    void requestNativeGrill(request=>window.lastbrowser.sidekick.grill(request),{action:'get',sessionId:activeSessionId,workspacePath:captured.spacePath,browserProfileId:captured.browserProfileId},scope)
      .then(value=>{if(current&&isCommandContextCurrent(captured,currentCommandContext.current)){setGrillGate(previous=>previous?.viewKey===modeViewKey&&previous.grill&&value.grill&&previous.grill.revision>value.grill.revision?previous:{viewKey:modeViewKey,scope,grill:value.grill,history:value.grillHistory??[]});}})
      .catch(()=>{if(current)setGrillError({viewKey:modeViewKey,code:'unavailable'});})
      .finally(()=>{if(current)setGrillLoading(value=>value===modeViewKey?null:value);});
    return()=>{current=false;};
  },[modeViewKey,ready,currentModeGate?.response.mode.revision,grillRefresh,busy,running]);
  useEffect(()=>{
    if(!currentModeGate||currentModeGate.response.mode.mode!=='grill_me')return;
    const captured=commandContext,scope=currentModeGate.scope,modeRevision=currentModeGate.response.mode.revision;
    return window.lastbrowser.sidekick.onChatStreamEvent(payload=>{
      if(!isCommandContextCurrent(captured,currentCommandContext.current))return;
      const event=readNativeGrillEvent(payload,scope,captured.sessionId??'');if(!event)return;
      const streamId=typeof payload==='object'&&payload!==null&&'streamId'in payload&&typeof payload.streamId==='string'?payload.streamId:'';
      const accepted=useNativeChatControls.getState().records[streamId];
      if(!accepted||accepted.processExited===true||accepted.binding.sessionId!==captured.sessionId||assistantScopeKey(accepted.binding.scope)!==assistantScopeKey(scope))return;
      if(event.kind==='grill'){
        if(event.grill.modeRevision!==modeRevision)return;
        setGrillGate(previous=>previous?.viewKey===modeViewKey&&previous.grill&&previous.grill.revision>=event.grill.revision?previous:{viewKey:modeViewKey,scope,grill:event.grill,history:previous?.viewKey===modeViewKey?previous.history:[]});setGrillFallback(null);
      }else setGrillFallback(modeViewKey);
    });
  },[modeViewKey,currentModeGate?.response.mode.revision]);
  async function mutateGrill(action:NativeGrillMutation):Promise<NativeGrillState|null>{
    const gate=currentGrill,captured=commandContext;
    if(!gate||!captured.sessionId||busy||running||writerProtected||grillLocks.current.has(modeViewKey))return null;
    grillLocks.current.add(modeViewKey);setGrillPending(modeViewKey);setGrillError(null);
    const expectedRevision=gate.grill?.revision??0,signature=JSON.stringify([modeViewKey,expectedRevision,action]);
    if(grillRetry.current?.signature!==signature)grillRetry.current={signature,requestId:newIndependentRequestId()};
    try{
      const value=await requestNativeGrill(request=>window.lastbrowser.sidekick.grill(request),{...action,sessionId:captured.sessionId,workspacePath:captured.spacePath,
        browserProfileId:captured.browserProfileId,expectedRevision,clientRequestId:grillRetry.current.requestId},gate.scope);
      if(!isCommandContextCurrent(captured,currentCommandContext.current))return null;
      setGrillGate({viewKey:modeViewKey,scope:gate.scope,grill:value.grill,history:value.grillHistory??gate.history});
      setGrillRefresh(value=>value+1);
      return value.replayed===true?null:value.grill;
    }catch(error){if(isCommandContextCurrent(captured,currentCommandContext.current)){setGrillError({viewKey:modeViewKey,code:error instanceof NativeGrillError&&error.code==='grill_revision_conflict'?'conflict':'unavailable'});setGrillRefresh(value=>value+1);}return null;}
    finally{grillLocks.current.delete(modeViewKey);setGrillPending(value=>value===modeViewKey?null:value);}
  }
  useEffect(()=>{
    if(!ready||!activeSessionId||typeof window.lastbrowser.sidekick.modelPolicy!=='function'){setPolicyGate(null);return;}
    let current=true;const captured=commandContext,requestEpoch=policyEpochRef.current.epoch,requestKey=policyOperationKey;
    void(async()=>{
      try{
        const resolved=await modelClient.request({schemaVersion:1,operation:'resolveScope',payload:{browserProfileId:captured.browserProfileId,workspacePath:captured.spacePath||null},backendProfileName:activeBackendProfileName||(activeSession as any)?.profile||undefined});
        if(!resolved.ok)throw Error('model_policy_scope_unavailable');
        const response=await requestModelPolicy(request=>window.lastbrowser.sidekick.modelPolicy(request),{action:'get',sessionId:activeSessionId,workspacePath:captured.spacePath,browserProfileId:captured.browserProfileId},resolved.value.scope);
        if(current&&policyEpochRef.current.epoch===requestEpoch&&isCommandContextCurrent(captured,currentCommandContext.current)){setPolicyGate({viewKey:requestKey,scope:resolved.value.scope,response});setPolicyError('');}
      }catch{if(current&&policyEpochRef.current.epoch===requestEpoch){setPolicyGate(null);setPolicyError('model_policy_unavailable');}}
    })();return()=>{current=false;};
  },[policyScopeIdentity,policyOperationKey,ready,policyRefresh,busy,running]);
  async function saveModelPolicy(draft:ModelPolicyDraft):Promise<boolean> {
    const gate=currentPolicy,captured=commandContext,requestEpoch=policyEpochRef.current.epoch,requestKey=policyOperationKey;
    if(!gate||!captured.sessionId||busy||running||writerProtected||policyLocks.current.has(requestKey))return false;
    policyLocks.current.add(requestKey);setPolicyPending(requestKey);setPolicyError('');
    const signature=JSON.stringify([policyScopeIdentity,requestEpoch,gate.response.policy.revision,draft]);
    if(policyRetry.current?.signature!==signature)policyRetry.current={signature,requestId:newIndependentRequestId()};
    try{
      const response=await requestModelPolicy(request=>window.lastbrowser.sidekick.modelPolicy(request),{action:'set',sessionId:captured.sessionId,
        workspacePath:captured.spacePath,browserProfileId:captured.browserProfileId,draft,expectedRevision:gate.response.policy.revision,clientRequestId:policyRetry.current.requestId},gate.scope);
      if(policyEpochRef.current.epoch!==requestEpoch||!isCommandContextCurrent(captured,currentCommandContext.current))return false;
      setPolicyGate({viewKey:requestKey,scope:gate.scope,response});return true;
    }catch(error){if(policyEpochRef.current.epoch===requestEpoch&&isCommandContextCurrent(captured,currentCommandContext.current))setPolicyError(error instanceof Error?error.message:'model_policy_unavailable');return false;}
    finally{policyLocks.current.delete(requestKey);setPolicyPending(value=>value===requestKey?null:value);}
  }
  function handleComposerModelChange(selection:string):void {
    if(selection==='__lastbrowser_auto_policy__'){
      if(!currentPolicy){setStatusMessage(modelPolicyCopy(locale).unavailable);return;}
      if(!automaticAvailable){setStatusMessage(modelPolicyReason(locale,currentPolicy.response.executionAvailability.reasonCode));return;}
      const policy=currentPolicy.response.policy;
      if(!policy.allowedModels.length){setStatusMessage(modelPolicyCopy(locale).choose);return;}
      void saveModelPolicy({mode:'auto',allowedModels:policy.allowedModels,orchestrator:policy.orchestrator,cloudPolicy:policy.cloudPolicy,
        allowedCloudDataClasses:policy.allowedCloudDataClasses,budget:policy.budget});
      return;
    }
    if(!resolveLiteralCatalogModelSelection(selection,modelCatalog))return;
    if(automaticSelected&&currentPolicy){const policy=currentPolicy.response.policy;
      void saveModelPolicy({mode:'fixed',allowedModels:policy.allowedModels,orchestrator:policy.orchestrator,cloudPolicy:policy.cloudPolicy,
        allowedCloudDataClasses:policy.allowedCloudDataClasses,budget:policy.budget}).then(saved=>{if(saved)commitComposerModelChoice(selection);});return;}
    commitComposerModelChoice(selection);
  }
  useEffect(() => {
    if (modelCatalogLoaded && modelReasoningEfforts.length && reasoningEffort && !modelReasoningEfforts.includes(reasoningEffort)) {
      setReasoningEffort('');
      saveChatReasoningEffort(reasoningPreferenceKey, '', window.localStorage);
    }
  }, [modelCatalogLoaded, modelReasoningEfforts, reasoningEffort, reasoningPreferenceKey]);
  const handleReasoningEffortChange = useCallback((effort: string) => {
    editedReasoningKey.current = reasoningPreferenceKey;
    setReasoningEffort(effort);
    saveChatReasoningEffort(reasoningPreferenceKey, effort, window.localStorage);
  }, [reasoningPreferenceKey]);

  // Wrap onSend to synthesize @tabs context and enqueue when busy instead of losing the message
  const handleSend = async (text: string, queuedEffort?: string): Promise<void> => {
    if (writerProtected) { setStatusMessage(t('spaceAssistant.writerProtected')); return; }
    if(automaticBlocked||policyPending===policyOperationKey){setStatusMessage(modelPolicyReason(locale,currentPolicy?.response.executionAvailability.reasonCode));return;}
    const requestedEffort = queuedEffort === undefined ? effectiveReasoningEffort : queuedEffort;
    const sendEffort = modelReasoningEfforts.includes(requestedEffort) ? requestedEffort : '';
    if(currentModeGate?.response.mode.mode==='grill_me'&&currentGrill?.grill?.status==='asking'){
      const question=currentGrill.grill.questions.find(question=>question.answer===null);
      if(question){
        if(!text.trim()||running||busy||grillPending===modeViewKey)return;
        const captured=commandContext;
        const actual=await mutateGrill({action:'answer',questionId:question.questionId,questionRevision:question.revision,text:text.trim()});
        if(actual&&isCommandContextCurrent(captured,currentCommandContext.current)){
          onComposerText('');
          if(actual.status==='asking'&&!actual.questions.some(question=>question.answer===null))onSend(grillCopy.nextPrompt,sendEffort||undefined);
        }
        return;
      }
    }
    if (text.trim().toLowerCase() === '/gquota') {
      onComposerText('');
      setStatusMessage('Checking quota for connected Antigravity accounts…');
      try {
        const result = await window.lastbrowser.sidekick.requestWebui({
          method: 'GET',
          path: '/api/provider/quota?provider=antigravity',
        });
        const quotaRows = Array.isArray(result?.quota) ? result.quota : [];
        const lines = quotaRows.map((entry: unknown) => {
          const account = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
          const buckets = Array.isArray(account.buckets) ? account.buckets : [];
          const details = buckets.map((bucket: unknown) => {
            const row = bucket && typeof bucket === 'object' ? bucket as Record<string, unknown> : {};
            const remaining = Number(row.remaining_fraction);
            const percent = Number.isFinite(remaining) ? ` ${Math.round(remaining * 100)}% remaining` : '';
            return `  ${String(row.model_id || 'Model')}${row.token_type ? ` (${String(row.token_type)})` : ''}:${percent}`;
          });
          return [`${String(account.account || 'Google account')}: ${String(account.message || account.status || '')}`, ...details].join('\n');
        });
        const summary = String(result?.message || 'Quota status returned.');
        setStatusMessage([summary, ...lines].join('\n'));
      } catch (error) {
        setStatusMessage(`Antigravity quota check failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    let messageToSend = text;
    if (hasTabsMention(text)) {
      setStatusMessage('Synthesizing open tabs context…');
      try {
        const specificNumbers = extractTargetTabNumbers(text);
        const synth = await synthesizeTabsContext({ specificTabIndices: specificNumbers });
        if (synth && synth.tabCount > 0) {
          messageToSend = buildPromptWithTabContext(text, synth);
          setStatusMessage(`Context attached: ${synth.tabCount} tab(s), ~${synth.totalEstimatedTokens} tokens`);
        }
      } catch (err) {
        console.warn('[tab-intelligence] Failed to synthesize tabs context:', err);
      }
    }

    if (running) {
      enqueue({ text: messageToSend, model, profile, reasoningEffort: sendEffort });
      setStatusMessage(`Queued: "${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"`);
      return;
    }
    onSend(messageToSend, sendEffort || undefined);
  };

  async function setChatMode(action:Extract<CommandAction,{kind:'set_mode'}>) {
    const gate=currentModeGate;
    if(!gate||busy||running||writerProtected||modeLock.current.has(modeViewKey)||!action.context.sessionId
      ||(action.expectedRevision!==undefined&&action.expectedRevision!==gate.response.mode.revision)) {setStatusMessage(commandCopy.unavailable);return;}
    const capability=action.mode==='action'?'plan':action.mode;
    if(!gate.response.capabilities[capability]){setStatusMessage(commandCopy.unavailable);return;}
    modeLock.current.add(modeViewKey);setModePending(modeViewKey);
    const signature=JSON.stringify([modeViewKey,action.mode,action.lifetime,gate.response.mode.revision]);
    if(modeRetry.current?.signature!==signature)modeRetry.current={signature,requestId:newIndependentRequestId()};
    try{
      const response=await requestChatMode(request=>window.lastbrowser.sidekick.chatMode(request),{action:'set',sessionId:action.context.sessionId,
        workspacePath:action.context.spacePath,browserProfileId:action.context.browserProfileId,mode:action.mode,lifetime:action.lifetime,
        expectedRevision:gate.response.mode.revision,clientRequestId:modeRetry.current.requestId},gate.scope);
      if(isCommandContextCurrent(action.context,currentCommandContext.current)){
        setModeGate({viewKey:modeViewKey,scope:gate.scope,response});
        if(action.mode==='grill_me')setGrillSeed({viewKey:modeViewKey,objective:action.objective??''});
        onComposerMode(response.mode.mode==='plan'?'plan':'action');
        setStatusMessage('');
      }
    }catch{if(isCommandContextCurrent(action.context,currentCommandContext.current)){setStatusMessage(commandCopy.unavailable);setModeRefresh(value=>value+1);}}
    finally{modeLock.current.delete(modeViewKey);setModePending(value=>value===modeViewKey?null:value);}
  }

  function handleCommandAction(action:CommandAction):boolean {
    if(!isCommandContextCurrent(action.context,currentCommandContext.current))return true;
    if(action.kind==='goal_command'&&!shouldAcceptPersistentGoalCommand(`/goal ${action.args}`,busy||running)){
      setStatusMessage(nativeGoalErrorCopy(locale,new Error('command_in_progress')));
      return false;
    }
    if(action.kind==='unavailable'){setStatusMessage(commandCopy.unavailable);return true;}
    if(action.kind==='open_model_picker'){const select=chatSection.current?.querySelector<HTMLSelectElement>('.composer-model select');if(select){select.focus();try{(select as HTMLSelectElement & {showPicker?:()=>void}).showPicker?.();}catch{}}return true;}
    if(action.kind==='open_help'){
      setStatusMessage(CHAT_COMMANDS.map(command=>`/${command.name} · ${commandCopy.commands[command.id]}`).join('\n'));return true;
    }
    if(action.kind==='new_session'){if(!ready){setStatusMessage(commandCopy.unavailable);return true;}onCreateSession();return true;}
    if(action.kind==='stop_turn'){onStop();return true;}
    if(action.kind==='open_goal_editor'){
      if(!availableCommands.goal){setStatusMessage(commandCopy.unavailable);return true;}
      setGoalEditorViewKey(modeViewKey);setGoalEditorToken(token=>token+1);return true;
    }
    if(action.kind==='set_mode'){void setChatMode(action);return true;}
    if(!onCommandAction){setStatusMessage(commandCopy.unavailable);return true;}
    if(action.kind==='goal_command'){
      if(goalLocks.current.has(modeViewKey)){
        const shortControl=action.args.trim().toLowerCase();
        if(!['pause','clear','stop','done'].includes(shortControl)||goalControlLocks.current.has(modeViewKey)){
          setStatusMessage(nativeGoalErrorCopy(locale,new Error('command_in_progress')));
          return false;
        }
        const captured=action.context,sessionId=captured.sessionId;
        if(!sessionId){setStatusMessage(commandCopy.unavailable);return false;}
        goalControlLocks.current.add(modeViewKey);setGoalPending(modeViewKey);
        void Promise.resolve().then(async()=>{
          const value=await window.lastbrowser.sidekick.goalCommand({sessionId,args:'status',
            browserProfileId:captured.browserProfileId,workspacePath:captured.spacePath});
          const status=readNativeGoalStatus(value,sessionId);
          if(!isCommandContextCurrent(captured,currentCommandContext.current))return;
          setGoalGate({viewKey:modeViewKey,status});
          await onCommandAction({...action,expectedRevision:status.revision});
        }).catch(error=>{if(isCommandContextCurrent(captured,currentCommandContext.current)){
          if(isNativeGoalMigrationRequired(error))setGoalMigrationRequired(modeViewKey);
          setStatusMessage(nativeGoalErrorCopy(locale,error));
        }}).finally(()=>{
          goalControlLocks.current.delete(modeViewKey);
          setGoalPending(value=>value===modeViewKey?null:value);
          if(isCommandContextCurrent(captured,currentCommandContext.current))setModeRefresh(value=>value+1);
        });
        return true;
      }
      if(action.args.trim().toLowerCase()!=='status'&&!currentGoalGate){setStatusMessage(commandCopy.unavailable);return false;}
      const expectedRevision=action.expectedRevision??currentGoalGate?.status.revision;
      const signature=JSON.stringify([modeViewKey,action.args,expectedRevision]);
      if(goalRetry.current?.signature!==signature)goalRetry.current={signature,requestId:action.clientRequestId};
      goalLocks.current.add(modeViewKey);setGoalPending(modeViewKey);
      const requestId=goalRetry.current.requestId;
      void Promise.resolve().then(()=>onCommandAction({...action,expectedRevision,clientRequestId:requestId}))
        .catch(error=>{if(isCommandContextCurrent(action.context,currentCommandContext.current)){if(isNativeGoalMigrationRequired(error))setGoalMigrationRequired(modeViewKey);setStatusMessage(nativeGoalErrorCopy(locale,error));}})
        .finally(()=>{goalLocks.current.delete(modeViewKey);setGoalPending(value=>value===modeViewKey?null:value);
          if(isCommandContextCurrent(action.context,currentCommandContext.current))setModeRefresh(value=>value+1);});return true;
    }
    onCommandAction(action);
    return true;
  }

  const goalControlsSession=currentGoalGate&&activeSession?{...activeSession,goal:currentGoalGate.status.goal}:currentModeGate?.response.session??activeSession;
  const showGoalControls=shouldRenderPersistentGoalControls(goalControlsSession,commandContext,goalEditorViewKey,modeViewKey);

  return (
    <section ref={chatSection} className="browser-main native-chat-main">
      <div className="native-chat-header">
        <div className="native-chat-title">
          <img src={brandAssets.sidekickAvatar} alt="" />
          <div>
            <span>{activeSessionId ? shortSessionId(activeSessionId) : t('chat.newSession')}</span>
            <h1>{activeSession ? sessionTitle(activeSession) : 'Sidekick'}</h1>
          </div>
        </div>
        <div className="native-chat-header-actions">
          <button
            type="button"
            className="secondary-action compact new-chat-btn"
            onClick={onCreateSession}
            title={`${t('chat.newSession')} (+)`}
          >
            <Plus size={14} />
            <span>{t('chat.newSession')}</span>
          </button>
          <CompressButton activeSessionId={activeSessionId} ready={ready && !writerProtected} onResult={setStatusMessage} />
          <QueueIndicator queue={queue} onDrain={() => {
            if (running || writerProtected) { setStatusMessage(t('spaceAssistant.writerProtected')); return; }
              const msg = dequeue();
              if (msg) handleSend(msg.text, msg.reasoningEffort);
          }} onClear={clearQueue} onRemoveAt={removeAt} busy={running || writerProtected} />
          <button
            type="button"
            className="secondary-action compact"
            onClick={() => setShowControlCenter(true)}
            title={t('settings.title')}
          >
            <Settings size={14} />
            <span>{t('settings.title')}</span>
          </button>
          <button
            type="button"
            className={`secondary-action compact developer-toggle ${showDeveloperTools ? 'active' : ''}`}
            onClick={() => setShowDeveloperTools((current) => !current)}
          >
            {showDeveloperTools ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>{t('settings.panels.system.developerApiTools')}</span>
          </button>
          <div className={`native-chat-status ${ready ? 'ready' : 'starting'}`}>
            <span className={ready ? 'status-dot ready' : 'status-dot'} />
            <span>{t(ready ? 'common.online' : 'common.starting')}</span>
          </div>
        </div>
      </div>
      {actualAutoSelection&&<div className="chat-status-message native-auto-route-hint" role="status" aria-live="off">
        {modelPolicyCopy(locale).actualDecision}: {actualAutoSelection.provider} · {actualAutoSelection.model}
      </div>}
      {independentRun && <div className="chat-status-message" role="status">
        <span>{t(`spaceAssistant.${independentRun.state}`)}{writerProtected ? ` · ${t('spaceAssistant.writerProtected')}` : ''}</span>
        {writerProtected && <button type="button" disabled={independentRun.state === 'cancelling'} onClick={onStop}>{t('chat.stop')}</button>}
      </div>}
      {!writerProtected&&ready&&currentModeGate&&activeSessionId&&activeSession?.session_id===activeSessionId&&isIndependentScope(activeSession.space_scope)
        &&assistantScopeKey(activeSession.space_scope)===assistantScopeKey(currentModeGate.scope)&&<NativeChatBrowserActivity key={modeViewKey}
          scope={currentModeGate.scope} sessionId={activeSessionId} client={modelClient}/>}
      <ChatTranscript
        childGroups={children.groups} childParentTurns={children.parentTurns} childHistoryUnavailable={children.unavailable} childHistoryResyncNeeded={children.resyncNeeded} onChildResync={children.onResync}
        independentRunState={independentRunState}
        activeSession={activeSession}
        error={chatError}
        developerMessages={developerMessages}
        loading={sessionLoading}
        messages={visibleMessages}
        pendingUserMessage={activeSession?.active_stream_id?.trim() ? activeSession.pending_user_message || '' : ''}
        ready={ready}
        showDeveloperTools={showDeveloperTools}
        showTokenUsage={showTokenUsage}
        showTps={showTps}
        showThinking={showThinking}
        simplifiedToolCalling={simplifiedToolCalling}
        latestTurnUsage={latestTurnUsage}
        onCreateSession={onCreateSession}
        serviceStatus={serviceStatus}
      />
      <ApprovalPollManager
        activeSessionId={writerProtected||isIndependentScope(activeSession?.space_scope)||currentModeGate ? null : activeSessionId}
        serviceStatus={serviceStatus}
        busy={busy || running || writerProtected}
      >
        {({ pending, respond }) => (
          <>
            {pending && <ApprovalCard entry={pending} onRespond={respond} />}
            {!writerProtected&&activeSessionId&&(isIndependentScope(activeSession?.space_scope)||currentModeGate)&&<NativeChatPendingControls
              key={modeViewKey} scope={isIndependentScope(activeSession?.space_scope)?activeSession.space_scope:currentModeGate!.scope}
              sessionId={activeSessionId} browserProfileId={activeBrowserProfileId} workspacePath={activeSpacePath}/>}
            <div className="composer-with-usage">
            <ChatModeControls value={currentModeGate?{...currentModeGate.response.mode,sessionId:activeSessionId!}:null} context={commandContext}
              locale={locale} pending={modePending===modeViewKey||busy||running||writerProtected} onAction={handleCommandAction}/>
            {currentModeGate?.response.mode.mode==='grill_me'&&<NativeGrillControls key={modeViewKey} state={currentGrill?.grill??null}
              history={currentGrill?.history??[]}
              initialObjective={grillSeed?.viewKey===modeViewKey?grillSeed.objective:''} modeRevision={currentModeGate.response.mode.revision}
              busy={busy||running||writerProtected||grillPending===modeViewKey} loading={grillLoading===modeViewKey||!currentGrill}
              error={grillError?.viewKey===modeViewKey?grillCopy[grillError.code]:''} fallback={grillFallback===modeViewKey||savedGrillFallback} onMutation={mutateGrill} onRefresh={()=>{setGrillError(null);setGrillRefresh(value=>value+1);}}
              onAsk={message=>{
                if(!isCommandContextCurrent(commandContext,currentCommandContext.current)||busy||running||writerProtected)return false;
                if(automaticBlocked||policyPending===policyOperationKey){setStatusMessage(modelPolicyReason(locale,currentPolicy?.response.executionAvailability.reasonCode));return false;}
                onSend(message,effectiveReasoningEffort||undefined);return true;
              }}/>}
            {goalMigrationRequired===modeViewKey&&currentModeGate&&activeSessionId&&<NativeGoalMigrationControls key={modeViewKey}
              scope={currentModeGate.scope} sessionId={activeSessionId} workspacePath={commandContext.spacePath} browserProfileId={commandContext.browserProfileId}
              locale={locale} blocked={busy||running||writerProtected||sessionLoading} onComplete={()=>{
                if(!isCommandContextCurrent(commandContext,currentCommandContext.current))return;
                setModeRefresh(value=>value+1);
                handleCommandAction({kind:'goal_command',args:'status',context:commandContext,clientRequestId:newIndependentRequestId()});
              }}/>}
            {showGoalControls&&<GoalControls key={modeViewKey} session={goalControlsSession}
              authoritativeRevision={currentGoalGate?.status.revision} stateLoaded={Boolean(currentGoalGate)} context={commandContext} locale={locale} busy={busy||running}
              pending={sessionLoading||modePending===modeViewKey||goalPending===modeViewKey} available={ready&&availableCommands.goal}
              migrationRequired={goalMigrationRequired===modeViewKey} editorOpenToken={goalEditorViewKey===modeViewKey?goalEditorToken:0}
              onDismissEmpty={()=>setGoalEditorViewKey(current=>current===modeViewKey?null:current)} onAction={handleCommandAction}/>}
            <ChatComposer
        automaticPolicy={{active:automaticSelected,available:automaticAvailable}}
        sendBlocked={automaticBlocked||policyPending===policyOperationKey}
        commandContext={commandContext}
        commandCapabilities={availableCommands}
        onCommandAction={handleCommandAction}
        busy={busy || running || writerProtected}
        mode={currentModeGate?currentModeGate.response.mode.mode==='plan'?'plan':'action':composerMode}
        model={model}
        modelProvider={modelProvider}
        modelOptions={modelCatalog}
        modelCatalogError={modelCatalogError}
        onRetryModelCatalog={()=>setModelCatalogRetry(value=>value+1)}
        reasoningEffort={effectiveReasoningEffort}
        reasoningEfforts={modelReasoningEfforts}
        reasoningCapabilityState={modelCatalogError || (modelCatalogLoaded && !modelReasoningEfforts.length) ? 'unknown' : modelCatalogLoaded ? 'ready' : 'loading'}
        profile={profile}
        ready={ready}
        runState={runState}
        text={composerText}
        workspace={workspace}
        onMode={mode=>handleCommandAction({kind:'set_mode',mode,lifetime:'chat',context:commandContext})}
        onModelChange={handleComposerModelChange}
        onReasoningEffort={handleReasoningEffortChange}
        onSend={handleSend}
        onStop={onStop}
        onText={onComposerText}
      />
            {statusMessage && <div className="chat-status-message" onClick={() => setStatusMessage('')}>{statusMessage}</div>}
          {spaceModelSelection?.reasonCode === 'independent_orchestration_not_supported' && <p className="chat-status-message">{t('spaceAssistant.independent_orchestration_not_supported')}</p>}
            {modelCatalogError && (
              <div className="chat-status-message" role="alert">
                <span>{t('chat.modelCatalogUnavailable')}</span>
                <button type="button" className="secondary-action compact" onClick={() => setModelCatalogRetry((value) => value + 1)}>{t('chat.retryModels')}</button>
              </div>
            )}
            <ContextUsageIndicator activeSessionId={activeSessionId} ready={ready} />
            </div>
      </>
      )}
    </ApprovalPollManager>
    <ControlCenter
        open={showControlCenter}
        serviceStatus={serviceStatus}
        activeSessionId={activeSessionId}
        onClose={() => setShowControlCenter(false)}
      />
    </section>
  );
}
