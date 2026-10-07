/** Presentation contracts; Main and the broker resolve every authority. */
export type IndependentScope = Readonly<{ backendProfileId: string; spaceId: string; browserProfileId: string }>;
export type SetupStatus = 'legacy' | 'in_progress' | 'confirmed' | 'skipped';
export type InterviewTopic = 'purpose' | 'help' | 'style' | 'context' | 'connections' | 'background_work';
export type RunState = 'queued' | 'running' | 'waiting_for_user' | 'waiting_for_approval' | 'pausing' | 'paused' | 'cancelling' | 'cancelled' | 'completed' | 'failed' | 'interrupted';
export type ProfilePatch = Readonly<{ purpose?: string | null; requestedHelp?: readonly string[] | null; workingStyle?: string | null; backgroundPreferences?: string | null }>;
export type InterviewOption = Readonly<{ id: string; label: string; description?: string | null }>;
export type UnderstoodTopic = Readonly<{ topic: InterviewTopic; summary: string; answerIds: readonly string[] }>;
export type InterviewQuestion = Readonly<{
  schemaVersion: 1; kind: 'question'; basedOnRevision: number; topic: InterviewTopic; prompt: string;
  options: readonly InterviewOption[]; allowFreeText: true; selection: 'single' | 'multiple';
  explanation?: string | null; understood: readonly UnderstoodTopic[]; profilePatch: ProfilePatch;
}>;
export type InterviewReview = Readonly<{
  schemaVersion: 1; kind: 'review'; basedOnRevision: number; summary: string; missingTopics: readonly InterviewTopic[];
  completionReason: 'user_finished' | 'sufficient_context'; understood: readonly UnderstoodTopic[]; profilePatch: ProfilePatch;
}>;
export type InterviewAnswerRecord = Readonly<{
  schemaVersion: 1; answerId: string; questionId: string; topic: InterviewTopic; question: InterviewQuestion;
  selectedOptionIds: readonly string[]; freeText: string | null; text: string; clientRequestId: string;
  replacesAnswerId: string | null; at: string;
}>;
export type InterviewState = Readonly<{
  schemaVersion: 1; interviewId: string; scope: IndependentScope; revision: number;
  stage: 'interview' | 'review' | 'confirmed' | 'skipped'; locale: string;
  questionId: string | null; question: InterviewQuestion | null; answers: readonly InterviewAnswerRecord[];
  draft: ProfilePatch; understood: readonly UnderstoodTopic[]; unresolvedTopics: readonly InterviewTopic[];
  review: InterviewReview | null; modelError: string | null; manualFallback: boolean;
}>;
export type SpaceAssistantProfile = Readonly<{
  schemaVersion: 1; profileId: string; scope: IndependentScope; revision: number; status: 'confirmed' | 'skipped';
  values: ProfilePatch; recordedAt: string; confirmedAt: string | null; sourceAnswerIds: readonly string[];
}>;
export type AssistantMessage = Readonly<{
  id: string; role: 'user' | 'assistant' | 'system'; content: string; at: string;
  turnId?: string; clientRequestId?: string; dispatchId?: string; runId?: string; targetSessionId?: string; deliveryKey?: string; pending?: boolean;
  controlResolution?: AssistantControlResolution; controlStatus?: AssistantControlStatus; controlResults?: readonly RunView[];
}>;
export type AssistantControlStatus = 'choose_target' | 'completed' | 'rejected' | 'unknown' | 'unsupported_manager';
export type AssistantControlCandidate = Readonly<{ runId: string; dispatchId: string; title: string; state: RunState; expectedRevision: number; controlEpoch: number }>;
export type AssistantControlResolution = Readonly<{ kind: 'conversation' | 'clarification' | 'proposal' | 'unavailable'; scope: IndependentScope;
  humanTurnId: string; sourceMessageId: string; originalText: string; command: 'cancel' | 'pause' | 'resume' | null;
  candidates: readonly AssistantControlCandidate[]; requestDigest: string; reason: string }>;
export type AssistantControlRequest = Readonly<{ humanTurnId: string; sourceMessageId: string; runId: string;
  expectedRevision: number; controlEpoch: number; requestDigest: string; clientRequestId: string }>;
export type AssistantControlResponse = AssistantSnapshot & Readonly<{ controlOutcome: Readonly<{ status: AssistantControlStatus; results: readonly RunView[] }> }>;
export type RunView = Readonly<{
  schemaVersion: 1; runId: string; dispatchId: string; scope: IndependentScope; definitionId: string;
  definitionRevision: number; state: RunState; stateRevision: number; reasonCode: string | null;
  createdAt: string; updatedAt: string; assistantProfileRevision: number | null; targetSessionId: string | null;
  checkpointId: string | null; resultRef: string | null; controlEpoch: number;
  counters: Readonly<{ toolCalls: number; providerRequests: number; activeSeconds: number; measuredTokens: number | null }>;
  waitingFor: Readonly<{ kind: 'login' | 'approval' | 'resource' | 'clarification'; resourceId: string | null; expiresAt: string | null }> | null;
}>;
export type RunProgress = Readonly<{ schemaVersion: 1; runId: string; scope: IndependentScope; targetSessionId: string | null;
  progressRevision: number; observedAt: string; runState: RunState; counters: RunView['counters']; budget: DefinitionBudget;
  text: string; textTruncated: boolean; source: 'sdk_output_text' }>;
export type TaskDispatchView = Readonly<{
  schemaVersion: 1; dispatchId: string; scope: IndependentScope; state: 'prepared' | 'materializing' | 'started' | 'failed';
  assistantConversationId: string; sourceMessageId: string; targetSessionId: string | null; runId: string | null;
  reasonCode: string | null; createdAt: string; updatedAt: string;
}>;
type ApprovalDetails = Readonly<{
  schemaVersion: 1; approvalId: string; scope: IndependentScope; actionDigest: string;
  effect: 'read' | 'write' | 'send' | 'delete' | 'purchase'; targetSummary: string; permissionRevision: number;
  navigationEpoch: number | null; connectionRevision: number | null; expiresAt: string;
  state: 'pending' | 'approved' | 'consumed' | 'revoked' | 'expired'; actorRef: string | null;
}>;
export type IndependentRunApproval = ApprovalDetails & Readonly<{runId:string;ownerKind?:'independent_run';ownerRef?:string|null}>;
export type NativeChatApproval = ApprovalDetails & Readonly<{runId:null;ownerKind:'native_chat';
  ownerRef:Readonly<{sessionId:string;streamId:string;writerGeneration:string;writerLeaseId:string}>;
  sessionId:string;streamId:string;writerGeneration:string;writerLeaseId:string;actionId:string;controlEpoch:number;
  connectionRevisions:Readonly<Record<string,number>>;leaseId?:string|null;targetId?:string|null;mainGeneration?:string|null;runnerGeneration?:string|null}>;
export type ApprovalView=IndependentRunApproval|NativeChatApproval;
export type IndependentWaitingQuestion = Readonly<{
  schemaVersion: 1; scope: IndependentScope; runId: string; questionIdentity: string;
  question: string; expectedRevision: number; controlEpoch: number;
}>;
export type IndependentAnswerSubmission = Readonly<{
  command: 'answer'; runId: string; questionIdentity: string; expectedRevision: number;
  controlEpoch: number; clientRequestId: string; answer: string;
}>;
export type AssistantResetAction = 'clear_interview_history' | 'reset_assistant';
export type AssistantResetPreview = Readonly<{
  schemaVersion: 1; scope: IndependentScope; action: AssistantResetAction; expectedRevision: number; conversationId: string; previewDigest: string;
  removedInterviewMessages: number; removedConversationMessages: number; removedAnswerRecords: number; clearedCachedStates: number;
  removedProfileFields: readonly string[]; removedDraftFields: readonly string[]; preservedProfileFields: readonly string[]; confirmedProfileId: string | null;
  preservedSnapshotCount: number; preservedSnapshotEvidenceCount: number;
  preservedDefinitions: readonly Readonly<{ definitionId: string; title: string; revision: number; enabled: boolean; scheduled: boolean }>[];
  preservedRuns: readonly Readonly<{ runId: string; definitionId: string; state: string; stateRevision: number; controlEpoch: number }>[];
  preservedConnections: readonly Readonly<{ bindingId: string; connectionId: string; capabilityId: string; revision: number; status: string }>[];
  preservedSchedules: readonly Readonly<{ jobId: string; definitionId: string; enabled: boolean; nextRunAt: string | null }>[];
  permissionRevision: number; permissionControlEpoch: number; browserBindingRevision: number;
}>;
export type AssistantResetResult = Readonly<{ schemaVersion: 1; scope: IndependentScope; action: AssistantResetAction; revision: number;
  interviewRevision: number; conversationId: string; confirmedProfileId: string | null; previewDigest: string }>;
export type ActivitySnapshot = Readonly<{
  schemaVersion: 1; scope: IndependentScope; observedAt: string; watermark: number;
  sourceState: 'live' | 'stale' | 'unavailable'; lastSuccessfulAt: string | null;
  nativeChatObservation?: Readonly<{ sourceState: 'live' | 'partial' | 'unavailable'; observedAt: string }> | null;
  runs: readonly RunView[]; dispatches: readonly TaskDispatchView[];
  activeChats: readonly Readonly<{ sessionId: string; dispatchId?: string; observedAt: string;
    activeStreamId?: string; sourceActuality?: 'live'; state?: 'streaming'; title?: string; model?: string | null; modelProvider?: string | null }>[];
  schedules: readonly Readonly<{ definitionId: string; enabled: boolean; scheduleRevision?: number; nextRunAt?: string | null }>[];
  approvals: readonly IndependentRunApproval[];
  nativeApprovals?:readonly NativeChatApproval[];
  clarificationQuestions?: readonly IndependentWaitingQuestion[];
  runProgress?: readonly RunProgress[];
}>;
export type GlobalActivitySpace = Readonly<{ spaceName: string; scope: IndependentScope; activity: ActivitySnapshot; workspacePath?: string | null }>;
export type GlobalActivitySnapshot = Readonly<{ schemaVersion: 1; backendProfileId: string; observedAt: string; spaces: readonly GlobalActivitySpace[] }>;
export type AssistantSnapshot = Readonly<{
  schemaVersion: 1; scope: IndependentScope; conversationId: string; revision: number;
  messages: readonly AssistantMessage[]; interview: InterviewState | null; confirmedProfile: SpaceAssistantProfile | null;
  providerReady: boolean; provider: string; model: string; activity: ActivitySnapshot;
}>;
export type ResolvedAssistantScope = Readonly<{
  schemaVersion: 1; scope: IndependentScope; spaceName: string; workspacePath: string | null;
  bindingRevision: number; setupStatus: SetupStatus; backendProfileName?: string;
}>;
export type BackendProfileEntry = Readonly<{ name: string; isDefault: boolean }>;
export type BackendProfilesResponse = Readonly<{ schemaVersion: 1; profiles: readonly BackendProfileEntry[] }>;
export type ProfileBindingEntry = Readonly<{
  scope: IndependentScope; browserProfileId: string; backendProfileName: string;
  workspacePath: string | null; spaceName: string; partitionKey: string; bindingRevision: number;
}>;
export type ProfileBindingsResponse = Readonly<{ schemaVersion: 1; bindings: readonly ProfileBindingEntry[] }>;
export type CapabilityCatalogEntry = Readonly<{
  schemaVersion?: 1; capabilityId: string; scope?: IndependentScope; title?: string; supportedTasks: readonly string[];
  startUrl?: string;
  connectionKind: 'provider' | 'connector' | 'browser_account' | 'none'; connectionId?: string | null;
  status: 'not_configured' | 'configured' | 'connected' | 'reauth_required' | 'unavailable' | 'restricted';
  requiredPermissions?: readonly string[]; verifiedAt?: string | null; reasonCode?: string; connections?: readonly CapabilityConnection[];
  evidenceKind: 'configuration' | 'credential_probe' | 'model_inference' | 'read_action' | 'explicit_user_confirmation';
}>;
export type CapabilityConnection = Readonly<{ connectionId: string; providerId?: string; title?: string; revision: number;
  status: 'configured' | 'connected' | 'not_configured' | 'reauth_required' | 'unavailable' | 'restricted';
  configurationStatus: 'configured' | 'not_configured' | 'disabled' | 'unknown'; authenticationStatus: 'credential_present' | 'required' | 'unknown' | 'user_confirmed';
  origin?:string;accountLabel?:string|null;partitionKind?:'dedicated_agent';accountSource?:'explicit_agent_login';
  healthStatus: 'unknown' | 'not_checked'; installed: boolean; adapterAvailable: boolean;
  setupActions: readonly Readonly<{ kind: 'oauth' | 'settings'; availability: 'available' | 'unavailable'; providerId?: string; reasonCode?: string }>[] }>;
export type CapabilityBinding = Readonly<{
  bindingId: string; scope: IndependentScope; capabilityId: string; connectionId: string | null;
  revision: number; status: 'active' | 'revoking' | 'revoked'; permittedUse: readonly string[];
  connectionRevision?: number; connectionKind?: 'provider' | 'connector' | 'browser_account' | null; updatedAt?: string;
}>;
export type ConnectionSetupFlow = Readonly<{ schemaVersion: 1; scope: IndependentScope; flowId: string; connectionId: string; providerId?: string;
  setupStatus: 'starting' | 'awaiting_user' | 'connected' | 'settings_required' | 'unavailable' | 'cancelled' | 'expired' | 'interrupted' | 'failed';
  revision: number; createdAt: string; updatedAt: string; expiresAt: string; reasonCode?: string;
  evidence: Readonly<{ source: 'capability_catalog' | 'profile_auth_store' | 'setup_worker'; configurationStatus: 'configured' | 'not_configured' | 'unknown';
    authenticationStatus: 'connected' | 'not_connected' | 'pending' | 'unknown'; healthStatus: 'not_checked'; observedAt: string }>;
  nextStep?: Readonly<{ kind: 'oauth'; authorizationUrl?: string; requiresUserNavigation: true }>
    | Readonly<{ kind: 'settings'; section: 'providers' | 'plugins'; backendProfileId: string; connectionId: string; providerId?: string }>
    | Readonly<{ kind: 'human_form'; providerId: string; connectionId: string; backendProfileId: string; expectedConnectionRevision: number;
        fields: readonly ('apiKey' | 'baseUrl' | 'model')[] }> }>;
export type ConnectionConfigureAck = Readonly<{ schemaVersion: 1; scope: IndependentScope; connectionId: string; providerId: string; applied: true;
  connectionRevision: number; configurationStatus: 'configured' | 'not_configured'; authenticationStatus: 'credential_present' | 'unknown'; healthStatus: 'not_checked' }>;
export type BrowserAccountFlow=Readonly<{schemaVersion:1;scope:IndependentScope;flowId:string;connectionId:string;origin:string;revision:number;
  setupStatus:'starting'|'awaiting_user'|'user_confirmed'|'cancelled'|'expired'|'interrupted'|'revoking'|'revoked';permissionRevision:number;permissionEpoch:number;
  createdAt:string;updatedAt:string;expiresAt:string;accountLabel?:string;reasonCode?:string;
  partitionKind:'dedicated_agent';accountSource:'explicit_agent_login';authenticationStatus:'user_confirmed'|'unknown';healthStatus:'unknown';
  evidenceKind:'explicit_user_confirmation'|'owned_login_target'}>;
export type PermissionView = Readonly<{
  revision: number; browserOrigins: readonly string[]; networkOrigins: readonly string[];
  connectorBindings: readonly string[]; allowedWorkspaceRoots: readonly string[];
  allowedEffects: readonly ('read' | 'write' | 'send' | 'delete' | 'purchase')[];
  rawCdp: false; terminal: false; desktop: false;
}>;
export type RunEvent = Readonly<{
  schemaVersion: 1; eventId: string; scope: IndependentScope; seq: number; at: string;
  kind: 'run_state' | 'run_progress' | 'checkpoint' | 'approval' | 'dispatch' | 'result' | 'connection_changed' | 'connection_setup_changed' | 'assistant_control' | 'schedule' | 'activity_changed' | 'assistant' | 'interview' | 'control' | 'action';
  payload: Readonly<Record<string, unknown>>;
}>;
export type EventRecovery = Readonly<{ events: readonly RunEvent[]; snapshot: ActivitySnapshot | null; watermark: number; resyncRequired: boolean }>;
export type ApiError = Readonly<{ schemaVersion: 1; code: string; message: string; retryable: boolean; currentRevision?: number | null; requestId?: string | null }>;
export type IndependentResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: ApiError }>;
export type Mutation = Readonly<{ clientRequestId: string; expectedRevision: number }>;
export type InterviewAnswerRequest = Readonly<{ questionId: string; selectedOptionIds: readonly string[]; freeText: string | null; replacesAnswerId: string | null }> & Mutation;
export type AssistantTurnRequest = Readonly<{ message: string; selectedContextRefs: readonly string[] }> & Mutation;
export type CapabilityCatalog = Readonly<{ schemaVersion: 1; scope: IndependentScope; entries: readonly CapabilityCatalogEntry[]; observedAt: string }>;
export type SpaceBindingsView = Readonly<{ scope: IndependentScope; permissions: PermissionView; connectionBindings?: readonly CapabilityBinding[]; browser: Readonly<{ schemaVersion: 1; scope: IndependentScope; nativeSlug: string; partitionKey: string; revision: number; workspaceLocator: string | null; tombstonedAt: string | null }> | null }>;
export type DispatchRequest = Readonly<{
  schemaVersion: 1; clientRequestId: string; assistantConversationId: string; sourceMessageId: string;
  kind: 'prepare_chat' | 'start_chat' | 'start_agent'; title: string; instruction: string; desiredResult: string | null;
  selectedContextRefs: readonly string[]; expectedPermissionRevision: number; definitionId?: string; definitionRevision?: number;
}>;
export type ScopeSelectionRequest = Readonly<{ browserProfileId: string; workspacePath: string | null; nativeSpaceId?: string }>;
export type NativeAvailabilityReason = 'adapter_unsupported' | 'provider_unconfigured' | 'pair_absent' | 'independent_unsupported'
  | 'context_missing' | 'cloud_denied' | 'binding_mismatch';
export type NativeModelAvailability = Readonly<{ schemaVersion: 1; supported: boolean; available: boolean;
  reasonCode: NativeAvailabilityReason | null; provider: string; model: string; scope: IndependentScope; selectionRevision: number }>;
export type NativeModelResolution = Readonly<{ schemaVersion: 1; scope: IndependentScope; streamId: string;
  requested: Readonly<{ provider: string; model: string }>; effective: Readonly<{ provider: string; model: string }>;
  fallbackApplied: boolean; fallbackReasonCode: 'ollama_subscription_required' | null; fallbackAttempts: 0 | 1 }>;
export type ScopedModelEntry = Readonly<{ id: string; label: string; supportsIndependent: boolean; reasoning_efforts?: readonly string[];
  nativeAvailability?: NativeModelAvailability }>;
export type ScopedModelGroup = Readonly<{ provider: string; provider_id: string; configured: boolean; models: readonly ScopedModelEntry[]; extra_models?: readonly ScopedModelEntry[] }>;
export type ScopedModelProvider = Readonly<{id:string;display_name:string;has_key:boolean;oauth_connected:boolean;auth_state:string;provider_available:boolean;models:readonly string[]}>;
export type ScopedModelSelection = Readonly<{ schemaVersion: 1; scope: IndependentScope; revision: number; model: string; provider: string; configured: boolean;
  supportsIndependent: boolean; reasonCode?: string; groups?: readonly ScopedModelGroup[];providers?:readonly ScopedModelProvider[] }>;
export type LocalAiBootstrapRequest=Readonly<{action:'status'}>|Readonly<{action:'start'|'retry';clientRequestId:string}>|Readonly<{action:'cancel';jobId:string;clientRequestId:string}>;
export type LocalAiBootstrapState='idle'|'pending'|'downloading'|'verifying'|'cancelling'|'complete'|'cancelled'|'offline'|'failed';
export type LocalAiBootstrapStatus=Readonly<{schemaVersion:1;installKey:'router-lfm2.5-230m-qad-q4_0-v1';revision:number;state:LocalAiBootstrapState;jobId:string|null;attempt:number;
  downloadedBytes:number;verifiedBytes:number;totalBytes:149091630;artifactId:'LiquidAI/LFM2.5-230M-GGUF:LFM2.5-230M-QAD-Q4_0';artifactRevision:'b27f8147d98080b0d6f063ff41de6e381ea9a530';
  sha256:'e75f83268de11b2a1bcfab5f3b5c5c0c97569ddbbc0990aad88437e45b8ba292';licenseLabel:'LFM Open License v1.0';licenseUrl:string;commercialThresholdUsd:10000000;executionUnavailable:true;errorCode:string|null;updatedAt:string}>;
export type DefinitionBudget = Readonly<{ maxToolCalls: number; maxProviderRequests: number; maxActiveSeconds: number; maxMeasuredTokens: number;
  maxSafeReadRetries: number; providerTimeoutSeconds: number; toolTimeoutSeconds: number }>;
export type DefinitionSchedule = Readonly<{ cronExpression: string; timezone: string; gapPolicy: 'skip'; foldPolicy: 'first'; missedPolicy: 'skip' | 'one_catch_up'; revision: number }>;
export type DefinitionConnection = Readonly<{ connectionId: string; capabilityId: string; kind: 'provider' | 'connector' | 'browser_account'; revision: number; bindingId: string | null; connectionRevision: number | null }>;
export type AgentDefinitionView = Readonly<{ schemaVersion: 1; definitionId: string; scope: IndependentScope; revision: number; title: string; instruction: string;
  desiredResult: string | null; provider: Readonly<{ providerConfigRef: string; configRevision: number; model: string; provider: string; contextLength: number | null }>;
  permissionScope: Omit<PermissionView, 'revision'>; budget: DefinitionBudget; profileSnapshotRef: string | null; connectionBindings: readonly DefinitionConnection[];
  activationConversationId: string | null; activationMessageId: string | null; capabilityRefs: readonly string[]; enabled: boolean; schedule: DefinitionSchedule | null; createdAt: string; nextRunAt?: string | null }>;
export type DefinitionDraft = Readonly<{ definitionId?: string; title: string; instruction: string; desiredResult: string | null; provider: Readonly<{ provider: string; model: string }>;
  permissionScope: Omit<PermissionView, 'revision'>; budget: DefinitionBudget; connectionBindings: readonly DefinitionConnection[]; enabled: boolean; schedule: DefinitionSchedule | null }>;
export type DefinitionResult = Readonly<{ schemaVersion: 1; scope: IndependentScope; definitions: readonly AgentDefinitionView[];
  schedules: readonly Readonly<{ definitionId: string; definitionRevision: number; nextRunAt: string | null; enabled: boolean }>[]; observedAt: string }>
  | Readonly<{ schemaVersion: 1; scope: IndependentScope; definition: AgentDefinitionView }>
  | Readonly<{ schemaVersion: 1; scope: IndependentScope; dispatch: TaskDispatchView }>;
export type BrowserPreview = Readonly<{
  partitionKind?: 'dedicated_agent'; accountSource?: 'explicit_agent_login';
  schemaVersion: 1; kind: 'preview'; runId: string; leaseId: string; navigationEpoch: number;
  permissionEpoch: number; mimeType: 'image/png'; base64: string; observedAt: string;
}>;
export type BrowserLeaseView = Readonly<{
  partitionKind?: 'dedicated_agent'; accountSource?: 'explicit_agent_login';
  leaseId: string; runId: string; scope: IndependentScope; partitionKey: string; targetId: string; webContentsId: number;
  mainGeneration: string; runnerGeneration: string; navigationEpoch: number; permissionEpoch: number;
  state: 'ready' | 'pausing' | 'paused' | 'revoked' | 'lost' | 'closing' | 'closed'; url: string;
  observedAt: string; expiresAt: number; visible: boolean;
}>;
export type NativeBrowserOwner = Readonly<{ runId: null; ownerKind: 'native_chat'; sessionId: string; streamId: string; writerGeneration: string; writerLeaseId: string }>;
type NativeBrowserDetails = Readonly<{ schemaVersion: 1; scope: IndependentScope; owner: NativeBrowserOwner;
  controlRevision: number; permissionRevision: number; controlEpoch: number; navigationEpoch: number;
  writerAvailable: true; observedAt: string; visible: boolean;
  partitionKind: 'dedicated_agent'; accountSource: 'explicit_agent_login' }>;
export type NativeBrowserPreview = NativeBrowserDetails & Readonly<{ kind: 'native_browser_preview'; state: 'ready' | 'pausing' | 'paused'; automationPaused: boolean;
  preview: Readonly<{ mimeType: 'image/png'; base64: string; observedAt: string; navigationEpoch: number }> }>;
export type NativeBrowserTakeover = NativeBrowserDetails & Readonly<{ kind: 'native_browser_takeover'; state: 'paused'; automationPaused: true; visible: true }>;
export type IndependentOperations = {
  resolveScope: { payload: ScopeSelectionRequest; response: ResolvedAssistantScope };
  backendProfiles: { payload: Record<string, never>; response: BackendProfilesResponse };
  profileBindings: { payload: Readonly<{ browserProfileId?: string }>; response: ProfileBindingsResponse };
  assistantSnapshot: { payload: Record<string, never>; response: AssistantSnapshot };
  assistantTurn: { payload: AssistantTurnRequest; response: AssistantSnapshot };
  assistantControl: { payload: AssistantControlRequest; response: AssistantControlResponse };
  assistantReset: { payload: Readonly<{ mode: 'preview'; action: AssistantResetAction; expectedRevision: number }>
    | Readonly<{ mode: 'apply'; action: AssistantResetAction; expectedRevision: number; previewDigest: string; clientRequestId: string }>;
    response: AssistantResetPreview | AssistantResetResult };
  cancelAssistantTurn: { payload: Mutation & Readonly<{ turnId: string }>; response: Readonly<{ cancelled: boolean; turnId: string }> };
  interviewStart: { payload: Mutation & Readonly<{ locale: string; seed?: ProfilePatch }>; response: AssistantSnapshot };
  interviewAnswer: { payload: InterviewAnswerRequest; response: AssistantSnapshot };
  interviewReview: { payload: Mutation; response: AssistantSnapshot };
  interviewContinue: { payload: Mutation & Readonly<{ topic?: InterviewTopic }>; response: AssistantSnapshot };
  interviewConfirm: { payload: Mutation & Readonly<{ values?: ProfilePatch }>; response: AssistantSnapshot };
  interviewSkip: { payload: Mutation; response: AssistantSnapshot };
  activity: { payload: Record<string, never>; response: ActivitySnapshot };
  globalActivity: { payload: Record<string, never>; response: GlobalActivitySnapshot };
  modelSelection: { payload: Readonly<{ action: 'get'; includeCatalog?: boolean }> | (Mutation & Readonly<{ action: 'set'; model: string; provider: string }>); response: ScopedModelSelection };
  definitions: { payload: Readonly<{ action: 'list' }>
    | Readonly<{ action: 'save'; draft: DefinitionDraft; expectedRevision: number | null; clientRequestId: string; userIntent: string }>
    | Readonly<{ action: 'start'; definitionId: string; expectedRevision: number; expectedPermissionRevision: number; clientRequestId: string; userIntent: string }>
    | Readonly<{ action: 'disable'; definitionId: string; expectedRevision: number; clientRequestId: string }>; response: DefinitionResult };
  events: { payload: Readonly<{ after: number }>; response: EventRecovery };
  dispatch: { payload: DispatchRequest; response: TaskDispatchView };
  runControl: { payload: Readonly<{ runId: string; command: 'pause' | 'resume' | 'cancel'; expectedRevision: number; clientRequestId: string }> | IndependentAnswerSubmission; response: RunView };
  permissions: { payload: Readonly<{ action?: 'grant' | 'revoke'; permissions?: Omit<PermissionView, 'revision'>; clientRequestId?: string; expectedRevision?: number }>; response: PermissionView };
  approve: { payload: Readonly<{ approvalId: string; approved: boolean; actionDigest: string; expectedPermissionRevision: number; expectedControlEpoch?:number; clientRequestId: string }>; response: ApprovalView };
  capabilities: { payload: Readonly<{ refresh?: boolean }>; response: CapabilityCatalog };
  bindings: { payload: Readonly<{ action?: 'list' }>
    | Readonly<{ action: 'bind'; capabilityId: string; connectionId: string; permittedUse: readonly string[]; expectedRevision: number; clientRequestId: string }>
    | Readonly<{ action: 'revoke'; bindingId: string; expectedRevision: number; clientRequestId: string }>; response: SpaceBindingsView };
  connectionSetup: { payload: Readonly<{ action: 'start'; connectionId: string; clientRequestId: string }> | Readonly<{ action: 'poll' | 'cancel'; flowId: string }>; response: ConnectionSetupFlow };
  connectionConfigure: { payload: Readonly<{ connectionId: string; expectedConnectionRevision: number; clientRequestId: string;
    configuration: Readonly<{ apiKey?: string; baseUrl?: string; model?: string }> }>; response: ConnectionConfigureAck };
  browserConnection:{payload:Readonly<{action:'start';origin:string;clientRequestId:string}>|Readonly<{action:'poll'|'cancel';flowId:string}>
    |Readonly<{action:'confirm';flowId:string;expectedRevision:number;clientRequestId:string;accountLabel?:string}>
    |Readonly<{action:'logout';connectionId:string;expectedRevision:number;clientRequestId:string}>;response:BrowserAccountFlow};
  localAi:{payload:import('./local-ai-contracts.js').LocalAiPayload;response:import('./local-ai-contracts.js').LocalAiResponse};
  localAiHardwareInventory:{payload:Record<string,never>;response:import('./local-ai-contracts.js').LocalAiHardwareInventory};
  localAiBootstrap:{payload:LocalAiBootstrapRequest;response:LocalAiBootstrapStatus};
  openBrowser: { payload: Readonly<{ runId: string; clientRequestId: string }>; response: BrowserPreview };
  openNativeBrowser: { payload: Readonly<{ sessionId: string; streamId: string; clientRequestId: string }>; response: NativeBrowserPreview };
  takeoverNativeBrowser: { payload: Readonly<{ sessionId: string; streamId: string; writerGeneration: string; writerLeaseId: string;
    expectedControlRevision: number; expectedPermissionRevision: number; expectedControlEpoch: number; expectedNavigationEpoch: number; clientRequestId: string }>; response: NativeBrowserTakeover };
  takeover: { payload: Readonly<{ runId: string; clientRequestId: string }>; response: BrowserLeaseView };
  resumeBrowser: { payload: Readonly<{ runId: string; navigationEpoch: number; permissionEpoch: number; clientRequestId: string }>; response: BrowserLeaseView };
  selectedContext: { payload: Readonly<{ guestWebContentsId: number; includePage: boolean; maxChars?: number; clientRequestId: string }>; response: Readonly<{ ref: string; scope: IndependentScope; observedAt: string; expiresInSeconds: number }> };
};
export type IndependentOperation = keyof IndependentOperations;
export type IndependentRequest<K extends IndependentOperation = IndependentOperation> = Readonly<{
  schemaVersion: 1; operation: K; scope?: IndependentScope; payload: IndependentOperations[K]['payload']; backendProfileName?: string;
}>;
export interface IndependentBridge {
  request<K extends IndependentOperation>(request: IndependentRequest<K>): Promise<IndependentResult<IndependentOperations[K]['response']>>;
  onEvent?(callback: (event: RunEvent) => void): () => void;
}
export interface IndependentTransport {
  request(request: IndependentRequest): Promise<unknown>;
  onEvent?(callback: (event: unknown) => void): () => void;
}
export function assistantScopeKey(scope: IndependentScope): string { return JSON.stringify([scope.backendProfileId, scope.spaceId, scope.browserProfileId]); }
export function sameAssistantScope(left: IndependentScope, right: IndependentScope): boolean {
  return left.backendProfileId === right.backendProfileId && left.spaceId === right.spaceId && left.browserProfileId === right.browserProfileId;
}
export function newIndependentRequestId(): string { return crypto.randomUUID(); }
