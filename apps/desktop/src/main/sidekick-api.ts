import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type WebuiRequestMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type WebuiRequest = {
  method?: WebuiRequestMethod;
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
};

export type CloudSetupRequest = {
  provider: string;
  model: string;
  apiKey?: string;
};

export type OnboardingOAuthResponse = {
  ok?: boolean;
  provider?: string;
  flow_id?: string;
  status?: 'pending' | 'success' | 'expired' | 'cancelled' | 'error' | string;
  verification_uri?: string;
  user_code?: string;
  expires_at?: number;
  poll_interval_seconds?: number;
  error?: string;
};

export type SidekickMessageRequest = {
  sessionId?: string | null;
  message: string;
  model?: string;
  modelProvider?: string | null;
  profile?: string;
  workspace?: string;
  mode?: 'action' | 'plan';
  chatMode?: string;
  sandboxDisabled?: boolean;
};

export type SidekickMessageResponse = {
  sessionId: string;
  streamId: string;
  assistantMessage: string;
  session: Record<string, unknown>;
};

export type DesktopSessionSummary = {
  session_id: string;
  title?: string;
  workspace?: string;
  updated_at?: string | number;
  last_message_at?: string | number;
  message_count?: number;
  source_label?: string;
  profile?: string;
};

export type DesktopChatMessage = {
  role?: string;
  content?: string;
  timestamp?: string | number;
  tool_calls?: unknown[];
  pending?: boolean;
};

export type ComposerDraft = {
  text?: string;
  files?: unknown[];
};

export type DesktopSessionDetail = DesktopSessionSummary & {
  model?: string;
  model_provider?: string | null;
  active_stream_id?: string | null;
  pending_user_message?: string | null;
  messages?: DesktopChatMessage[];
  composer_draft?: ComposerDraft;
};

export type ChatRunState = 'idle' | 'starting' | 'streaming' | 'cancelling' | 'error';

export type WorkspaceTreeEntry = {
  name: string;
  path?: string;
  type?: string;
  size?: number;
  modified?: string | number;
  is_dir?: boolean;
};

export type WorkspaceFilePreview = {
  path?: string;
  content?: string;
  mime?: string;
  language?: string;
  size?: number;
  truncated?: boolean;
};

export type SpaceSummary = {
  path: string;
  name?: string;
  emoji?: string;
  color?: string;
};

export type CreateSessionRequest = {
  workspace?: string;
  model?: string;
  modelProvider?: string | null;
  profile?: string;
};

export type WorkspaceRequest = {
  sessionId: string;
  path?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type LocalSkillRecord = {
  name: string;
  description?: string;
  category?: string;
  path: string;
  source: 'bundled';
  linked_files: Record<string, true>;
};

export type WorkspaceWriteRequest = WorkspaceRequest & {
  content?: string;
};

export type WorkspaceRenameRequest = WorkspaceRequest & {
  newName: string;
};

export type WorkspaceDeleteRequest = WorkspaceRequest & {
  recursive?: boolean;
};

export type AddSpaceRequest = {
  path: string;
  name?: string;
  create?: boolean;
};

export type RenameSpaceRequest = {
  path: string;
  name: string;
};

export type RemoveSpaceRequest = {
  path: string;
};

export type ReorderSpacesRequest = {
  paths: string[];
};

export type CronJobSummary = {
  id: string;
  name?: string;
  prompt?: string;
  schedule?: string | { expression?: string };
  schedule_display?: string;
  enabled?: boolean;
  state?: string;
  next_run_at?: string | number | null;
  last_run_at?: string | number | null;
  last_status?: string | null;
  last_error?: string | null;
  profile?: string | null;
  deliver?: string | null;
};

export type CronJobRequest = {
  jobId: string;
};

export type CreateCronRequest = {
  name?: string;
  prompt: string;
  schedule: string;
  deliver?: string;
  profile?: string;
  toastNotifications?: boolean;
};

export type UpdateCronRequest = Partial<CreateCronRequest> & {
  jobId: string;
};

export type KanbanTaskSummary = {
  id: string;
  title?: string;
  summary?: string;
  body?: string;
  description?: string;
  prompt?: string;
  status?: string;
  assignee?: string;
  tenant?: string;
  priority?: number | string;
  comment_count?: number;
  link_counts?: Record<string, number>;
  age_seconds?: number;
};

export type KanbanColumnSummary = {
  name: string;
  tasks?: KanbanTaskSummary[];
};

export type KanbanBoardResponse = {
  columns?: KanbanColumnSummary[];
  read_only?: boolean;
  assignees?: string[];
  tenants?: string[];
  latest_event_id?: number;
  [key: string]: unknown;
};

export type CreateKanbanTaskRequest = {
  title: string;
  body?: string;
  status?: string;
  assignee?: string;
  tenant?: string;
  priority?: number | string;
};

export type UpdateKanbanTaskRequest = Partial<CreateKanbanTaskRequest> & {
  taskId: string;
};

export type SkillPathRequest = {
  path?: string;
  name?: string;
  file?: string;
};

export type SaveSkillRequest = SkillPathRequest & {
  content: string;
  category?: string;
};

export type AgentSlugRequest = {
  slug: string;
};

export type AgentSessionRequest = AgentSlugRequest & {
  sessionId?: string;
  path?: string;
};

export type AgentChatRequest = AgentSlugRequest & {
  sessionId?: string;
  message: string;
};

export type AgentWorkspaceCommandRequest = {
  sessionId: string;
  command?: string;
};

export type CreateAgentRequest = {
  slug?: string;
  name?: string;
  prompt?: string;
  model?: string;
  workspace?: string;
  tools?: string[];
  [key: string]: unknown;
};

export type UpdateAgentRequest = AgentSlugRequest & {
  patch: Record<string, unknown>;
};

export type SetCurrentAgentRequest = AgentSlugRequest;

export type AgentSplashCompleteRequest = {
  activated?: string[];
};

export type AgentSplashQuestionRequest = {
  answers?: unknown[];
};

export type AgentActivitiesRequest = {
  limit?: number;
};

export type SaveAgentProfileRequest = AgentSlugRequest & {
  profile: Record<string, unknown>;
};

export type ProfileNameRequest = {
  name: string;
};

export type CreateProfileRequest = ProfileNameRequest & {
  model?: string;
  provider?: string;
  workspace?: string;
  gateway?: string;
  [key: string]: unknown;
};

export type MemoryWriteRequest = {
  section: string;
  content: string;
};

export type MemorySearchRequest = {
  query: string;
  limit?: number;
};

export type SupermemoryDocumentRequest = {
  id?: string;
  title?: string;
  content?: string;
  metadata?: Record<string, unknown>;
};

export type InsightsRequest = {
  days?: number;
};

export type LogsRequest = {
  file?: string;
  tail?: number;
};

export type AppstoreQuery = {
  category?: string;
  query?: string;
  page?: string | number;
};

export type AppstoreAppRequest = {
  appId: string;
};

export type AppstoreSubmitRequest = {
  manifest: Record<string, unknown>;
};

export type SettingsSaveRequest = {
  settings: Record<string, unknown>;
};

export type GmailListRequest = {
  folder?: string;
  limit?: number;
  max?: number;
  account?: string;
};

export type GmailMessageRequest = {
  id?: string;
  messageId?: string;
  threadId?: string;
  account?: string;
};

export type GmailSearchRequest = {
  query: string;
  max?: number;
};

export type GmailDraftRequest = GmailMessageRequest & {
  instruction?: string;
  variants?: number;
};

export type GmailSendRequest = {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
  threadId?: string;
};

export type GmailMoveRequest = GmailMessageRequest & {
  folder: string;
};

export type GmailTaskRequest = GmailMessageRequest & {
  title?: string;
};

export type DiscordMembersRequest = {
  query?: string;
};

export type DiscordMessagesRequest = {
  channelId: string;
  limit?: number;
  before?: string;
};

export type DiscordSendRequest = {
  channelId: string;
  content: string;
};

export type DiscordModerationRequest = {
  memberId?: string;
  userId?: string;
  reason?: string;
  minutes?: number;
  deleteDays?: number;
};

export type DiscordPurgeRequest = {
  channelId: string;
  limit?: number;
  amount?: number;
};

export type DiscordMemberRequest = {
  userId: string;
};

export type DiscordConfigRequest = {
  action: 'get' | 'save' | string;
  values?: Record<string, unknown>;
};

export type GetSessionRequest = {
  sessionId: string;
  messages?: boolean;
  msgLimit?: number;
};

export type RenameSessionRequest = {
  sessionId: string;
  title: string;
};

export type SessionIdRequest = {
  sessionId: string;
};

export type SaveDraftRequest = {
  sessionId: string;
  text?: string;
  files?: unknown[];
};

export type SessionShape = {
  session_id?: string;
  title?: string;
  model?: string;
  model_provider?: string | null;
  workspace?: string;
  active_stream_id?: string | null;
  pending_user_message?: string;
  messages?: DesktopChatMessage[];
  profile?: string;
  composer_draft?: ComposerDraft;
};

function urlFor(webuiUrl: string, path: string): string {
  return new URL(path, webuiUrl.endsWith('/') ? webuiUrl : `${webuiUrl}/`).toString();
}

async function jsonRequest<T>(webuiUrl: string, path: string, init: RequestInit = {}, fetchImpl: FetchLike = fetch): Promise<T> {
  const response = await fetchImpl(urlFor(webuiUrl, path), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(String(payload.error || payload.message || `HTTP ${response.status}`));
  }
  return payload as T;
}

function assertLocalWebuiApiPath(path: string): void {
  const invalid = !path
    || !path.startsWith('/')
    || path.startsWith('//')
    || /^[a-z][a-z0-9+.-]*:/i.test(path)
    || path.includes('\\')
    || path.includes('..')
    || /[\u0000-\u001f\u007f]/.test(path)
    || (!path.startsWith('/api/') && path !== '/health');
  if (invalid) throw new Error('Only local WebUI API paths are allowed');
}

function appendQuery(url: URL, query: WebuiRequest['query']): void {
  if (!query) return;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
}

export async function requestWebui(
  webuiUrl: string,
  request: WebuiRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  const method = request.method || 'GET';
  const path = String(request.path || '');
  assertLocalWebuiApiPath(path);
  const url = new URL(path, webuiUrl.endsWith('/') ? webuiUrl : `${webuiUrl}/`);
  appendQuery(url, request.query);

  const headers: Record<string, string> = { ...(request.headers || {}) };
  const init: RequestInit = { method, headers };
  if (method !== 'GET' && request.body !== undefined) {
    headers['content-type'] = headers['content-type'] || 'application/json';
    init.body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  }

  const response = await fetchImpl(url.toString(), init);
  const raw = await response.text();
  let payload: Record<string, unknown>;
  try {
    payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    payload = { text: raw };
  }
  if (!response.ok) {
    throw new Error(String(payload.error || payload.message || `HTTP ${response.status}`));
  }
  return payload;
}

export function extractLastAssistantMessage(session: { messages?: Array<{ role?: string; content?: string }> }): string {
  const messages = Array.isArray(session.messages) ? session.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'assistant') {
      const content = String(message.content || '').trim();
      if (content) return content;
    }
  }
  return '';
}

export function getOnboardingStatus(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/onboarding/status', {}, fetchImpl);
}

export function applyCloudSetup(webuiUrl: string, request: CloudSetupRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  const body: Record<string, string> = {
    provider: request.provider,
    model: request.model
  };
  if (request.apiKey?.trim()) body.api_key = request.apiKey.trim();
  return jsonRequest(webuiUrl, '/api/onboarding/setup', {
    method: 'POST',
    body: JSON.stringify(body)
  }, fetchImpl);
}

export function setDefaultModel(webuiUrl: string, model: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/default-model', {
    method: 'POST',
    body: JSON.stringify({ model })
  }, fetchImpl);
}

export function completeCloudSetup(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/onboarding/complete', {
    method: 'POST',
    body: '{}'
  }, fetchImpl);
}

export function startOnboardingOAuth(
  webuiUrl: string,
  provider: string,
  fetchImpl: FetchLike = fetch
): Promise<OnboardingOAuthResponse> {
  return jsonRequest(webuiUrl, '/api/onboarding/oauth/start', {
    method: 'POST',
    body: JSON.stringify({ provider })
  }, fetchImpl);
}

export function pollOnboardingOAuth(
  webuiUrl: string,
  flowId: string,
  fetchImpl: FetchLike = fetch
): Promise<OnboardingOAuthResponse> {
  return jsonRequest(webuiUrl, `/api/onboarding/oauth/poll?flow_id=${encodeURIComponent(flowId)}`, {}, fetchImpl);
}

export function cancelOnboardingOAuth(
  webuiUrl: string,
  flowId: string,
  provider = 'openai-codex',
  fetchImpl: FetchLike = fetch
): Promise<OnboardingOAuthResponse> {
  return jsonRequest(webuiUrl, '/api/onboarding/oauth/cancel', {
    method: 'POST',
    body: JSON.stringify({ flow_id: flowId, provider })
  }, fetchImpl);
}

export function listSessions(
  webuiUrl: string,
  fetchImpl: FetchLike = fetch
): Promise<{ sessions: DesktopSessionSummary[]; [key: string]: unknown }> {
  return jsonRequest(webuiUrl, '/api/sessions', {}, fetchImpl);
}

export function listSpaces(
  webuiUrl: string,
  fetchImpl: FetchLike = fetch
): Promise<{ workspaces: SpaceSummary[]; last?: string; [key: string]: unknown }> {
  return jsonRequest(webuiUrl, '/api/workspaces', {}, fetchImpl);
}

export function createSidekickSession(
  webuiUrl: string,
  request: CreateSessionRequest = {},
  fetchImpl: FetchLike = fetch
): Promise<{ session: SessionShape }> {
  const body: Record<string, unknown> = {};
  if (request.workspace?.trim()) body.workspace = request.workspace.trim();
  if (request.model?.trim()) body.model = request.model.trim();
  if (request.modelProvider !== undefined) body.model_provider = request.modelProvider;
  if (request.profile?.trim()) body.profile = request.profile.trim();

  return jsonRequest(webuiUrl, '/api/session/new', {
    method: 'POST',
    body: JSON.stringify(body)
  }, fetchImpl);
}

export function getDesktopSession(
  webuiUrl: string,
  request: string | GetSessionRequest,
  fetchImpl: FetchLike = fetch
): Promise<{ session?: DesktopSessionDetail }> {
  const sessionId = typeof request === 'string' ? request : request.sessionId;
  const includeMessages = typeof request === 'string' ? true : request.messages !== false;
  const params = new URLSearchParams({
    session_id: sessionId,
    messages: includeMessages ? '1' : '0',
    resolve_model: '0'
  });
  if (typeof request !== 'string' && request.msgLimit !== undefined) {
    params.set('msg_limit', String(request.msgLimit));
  }
  return jsonRequest(
    webuiUrl,
    `/api/session?${params.toString()}`,
    {},
    fetchImpl
  );
}

export function renameSession(
  webuiUrl: string,
  request: RenameSessionRequest,
  fetchImpl: FetchLike = fetch
): Promise<{ session?: DesktopSessionDetail; [key: string]: unknown }> {
  return jsonRequest(webuiUrl, '/api/session/rename', {
    method: 'POST',
    body: JSON.stringify({
      session_id: request.sessionId,
      title: request.title
    })
  }, fetchImpl);
}

export function deleteSession(
  webuiUrl: string,
  request: SessionIdRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/session/delete', {
    method: 'POST',
    body: JSON.stringify({ session_id: request.sessionId })
  }, fetchImpl);
}

export function duplicateSession(
  webuiUrl: string,
  request: SessionIdRequest,
  fetchImpl: FetchLike = fetch
): Promise<{ session?: DesktopSessionDetail; [key: string]: unknown }> {
  return jsonRequest(webuiUrl, '/api/session/duplicate', {
    method: 'POST',
    body: JSON.stringify({ session_id: request.sessionId })
  }, fetchImpl);
}

export function getSessionDraft(
  webuiUrl: string,
  sessionId: string,
  fetchImpl: FetchLike = fetch
): Promise<{ draft?: ComposerDraft; [key: string]: unknown }> {
  return jsonRequest(
    webuiUrl,
    `/api/session/draft?session_id=${encodeURIComponent(sessionId)}`,
    {},
    fetchImpl
  );
}

export function saveSessionDraft(
  webuiUrl: string,
  request: SaveDraftRequest,
  fetchImpl: FetchLike = fetch
): Promise<{ draft?: ComposerDraft; [key: string]: unknown }> {
  return jsonRequest(webuiUrl, '/api/session/draft', {
    method: 'POST',
    body: JSON.stringify({
      session_id: request.sessionId,
      text: request.text || '',
      files: Array.isArray(request.files) ? request.files : []
    })
  }, fetchImpl);
}

export function listWorkspace(
  webuiUrl: string,
  request: WorkspaceRequest,
  fetchImpl: FetchLike = fetch
): Promise<{ entries: WorkspaceTreeEntry[]; path: string }> {
  return jsonRequest(
    webuiUrl,
    `/api/list?session_id=${encodeURIComponent(request.sessionId)}&path=${encodeURIComponent(request.path || '.')}`,
    {},
    fetchImpl
  );
}

export function readWorkspaceFile(
  webuiUrl: string,
  request: WorkspaceRequest,
  fetchImpl: FetchLike = fetch
): Promise<WorkspaceFilePreview> {
  return jsonRequest(
    webuiUrl,
    `/api/file?session_id=${encodeURIComponent(request.sessionId)}&path=${encodeURIComponent(request.path || '')}`,
    {},
    fetchImpl
  );
}

function workspaceBody(request: WorkspaceRequest): Record<string, unknown> {
  return {
    session_id: request.sessionId,
    path: request.path || ''
  };
}

export function createWorkspaceFile(
  webuiUrl: string,
  request: WorkspaceWriteRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/file/create', {
    method: 'POST',
    body: JSON.stringify({
      ...workspaceBody(request),
      content: request.content || ''
    })
  }, fetchImpl);
}

export function saveWorkspaceFile(
  webuiUrl: string,
  request: WorkspaceWriteRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/file/save', {
    method: 'POST',
    body: JSON.stringify({
      ...workspaceBody(request),
      content: request.content || ''
    })
  }, fetchImpl);
}

export function renameWorkspaceEntry(
  webuiUrl: string,
  request: WorkspaceRenameRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/file/rename', {
    method: 'POST',
    body: JSON.stringify({
      ...workspaceBody(request),
      new_name: request.newName
    })
  }, fetchImpl);
}

export function createWorkspaceDirectory(
  webuiUrl: string,
  request: WorkspaceRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/file/create-dir', {
    method: 'POST',
    body: JSON.stringify(workspaceBody(request))
  }, fetchImpl);
}

export function deleteWorkspaceEntry(
  webuiUrl: string,
  request: WorkspaceDeleteRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/file/delete', {
    method: 'POST',
    body: JSON.stringify({
      ...workspaceBody(request),
      recursive: request.recursive === true
    })
  }, fetchImpl);
}

export function addSpace(
  webuiUrl: string,
  request: AddSpaceRequest,
  fetchImpl: FetchLike = fetch
): Promise<{ workspaces?: SpaceSummary[]; [key: string]: unknown }> {
  return jsonRequest(webuiUrl, '/api/workspaces/add', {
    method: 'POST',
    body: JSON.stringify({
      path: request.path,
      name: request.name || '',
      create: request.create === true
    })
  }, fetchImpl);
}

export function removeSpace(
  webuiUrl: string,
  request: RemoveSpaceRequest,
  fetchImpl: FetchLike = fetch
): Promise<{ workspaces?: SpaceSummary[]; [key: string]: unknown }> {
  return jsonRequest(webuiUrl, '/api/workspaces/remove', {
    method: 'POST',
    body: JSON.stringify({ path: request.path })
  }, fetchImpl);
}

export function renameSpace(
  webuiUrl: string,
  request: RenameSpaceRequest,
  fetchImpl: FetchLike = fetch
): Promise<{ workspaces?: SpaceSummary[]; [key: string]: unknown }> {
  return jsonRequest(webuiUrl, '/api/workspaces/rename', {
    method: 'POST',
    body: JSON.stringify({ path: request.path, name: request.name })
  }, fetchImpl);
}

export function reorderSpaces(
  webuiUrl: string,
  request: ReorderSpacesRequest,
  fetchImpl: FetchLike = fetch
): Promise<{ workspaces?: SpaceSummary[]; [key: string]: unknown }> {
  return jsonRequest(webuiUrl, '/api/workspaces/reorder', {
    method: 'POST',
    body: JSON.stringify({ paths: request.paths })
  }, fetchImpl);
}

export function listCrons(
  webuiUrl: string,
  fetchImpl: FetchLike = fetch
): Promise<{ jobs: CronJobSummary[]; [key: string]: unknown }> {
  return jsonRequest(webuiUrl, '/api/crons', {}, fetchImpl);
}

export function createCron(
  webuiUrl: string,
  request: CreateCronRequest,
  fetchImpl: FetchLike = fetch
): Promise<{ ok?: boolean; job?: CronJobSummary; [key: string]: unknown }> {
  return jsonRequest(webuiUrl, '/api/crons/create', {
    method: 'POST',
    body: JSON.stringify({
      name: request.name || '',
      prompt: request.prompt,
      schedule: request.schedule,
      deliver: request.deliver || 'local',
      profile: request.profile || '',
      toast_notifications: request.toastNotifications !== false
    })
  }, fetchImpl);
}

export function updateCron(
  webuiUrl: string,
  request: UpdateCronRequest,
  fetchImpl: FetchLike = fetch
): Promise<{ ok?: boolean; job?: CronJobSummary; [key: string]: unknown }> {
  const body: Record<string, unknown> = { job_id: request.jobId };
  if (request.name !== undefined) body.name = request.name;
  if (request.prompt !== undefined) body.prompt = request.prompt;
  if (request.schedule !== undefined) body.schedule = request.schedule;
  if (request.deliver !== undefined) body.deliver = request.deliver;
  if (request.profile !== undefined) body.profile = request.profile;
  if (request.toastNotifications !== undefined) body.toast_notifications = request.toastNotifications;
  return jsonRequest(webuiUrl, '/api/crons/update', {
    method: 'POST',
    body: JSON.stringify(body)
  }, fetchImpl);
}

export function deleteCron(
  webuiUrl: string,
  request: CronJobRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/crons/delete', {
    method: 'POST',
    body: JSON.stringify({ job_id: request.jobId })
  }, fetchImpl);
}

export function runCron(
  webuiUrl: string,
  request: CronJobRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/crons/run', {
    method: 'POST',
    body: JSON.stringify({ job_id: request.jobId })
  }, fetchImpl);
}

export function pauseCron(
  webuiUrl: string,
  request: CronJobRequest,
  fetchImpl: FetchLike = fetch
): Promise<{ job?: CronJobSummary; [key: string]: unknown }> {
  return jsonRequest(webuiUrl, '/api/crons/pause', {
    method: 'POST',
    body: JSON.stringify({ job_id: request.jobId })
  }, fetchImpl);
}

export function resumeCron(
  webuiUrl: string,
  request: CronJobRequest,
  fetchImpl: FetchLike = fetch
): Promise<{ job?: CronJobSummary; [key: string]: unknown }> {
  return jsonRequest(webuiUrl, '/api/crons/resume', {
    method: 'POST',
    body: JSON.stringify({ job_id: request.jobId })
  }, fetchImpl);
}

function kanbanQuery(params: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

function queryString(params: Record<string, string | number | undefined | null> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== '') query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

export function getKanbanBoard(
  webuiUrl: string,
  options: { workspace?: string; board?: string } = {},
  fetchImpl: FetchLike = fetch
): Promise<KanbanBoardResponse> {
  return jsonRequest(webuiUrl, `/api/kanban/board${kanbanQuery(options)}`, {}, fetchImpl);
}

export function createKanbanTask(
  webuiUrl: string,
  request: CreateKanbanTaskRequest,
  fetchImpl: FetchLike = fetch
): Promise<{ task?: KanbanTaskSummary; [key: string]: unknown }> {
  return jsonRequest(webuiUrl, '/api/kanban/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: request.title,
      body: request.body || '',
      status: request.status || 'todo',
      assignee: request.assignee || '',
      tenant: request.tenant || '',
      priority: request.priority || 0
    })
  }, fetchImpl);
}

export function updateKanbanTask(
  webuiUrl: string,
  request: UpdateKanbanTaskRequest,
  fetchImpl: FetchLike = fetch
): Promise<{ task?: KanbanTaskSummary; [key: string]: unknown }> {
  const body: Record<string, unknown> = {};
  if (request.title !== undefined) body.title = request.title;
  if (request.body !== undefined) body.body = request.body;
  if (request.status !== undefined) body.status = request.status;
  if (request.assignee !== undefined) body.assignee = request.assignee;
  if (request.tenant !== undefined) body.tenant = request.tenant;
  if (request.priority !== undefined) body.priority = request.priority;
  return jsonRequest(webuiUrl, `/api/kanban/tasks/${encodeURIComponent(request.taskId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  }, fetchImpl);
}

export type DispatchRunRequest = {
  dryRun?: boolean;
};

export function runDispatchOnce(
  webuiUrl: string,
  request: DispatchRunRequest = {},
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/dispatch/run', {
    method: 'POST',
    body: JSON.stringify({ dry_run: Boolean(request.dryRun) })
  }, fetchImpl);
}

export function getActiveDispatches(
  webuiUrl: string,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/dispatch/active', {}, fetchImpl);
}

function getLocalSkillsRoots(): string[] {
  const roots = [
    resolve(process.resourcesPath || '', 'services', 'sidekick', 'skills'),
    resolve(process.resourcesPath || '', 'services', 'sidekick', 'optional-skills'),
    resolve(process.cwd(), '..', '..', 'services', 'sidekick', 'skills'),
    resolve(process.cwd(), '..', '..', 'services', 'sidekick', 'optional-skills'),
    resolve(process.cwd(), 'services', 'sidekick', 'skills'),
    resolve(process.cwd(), 'services', 'sidekick', 'optional-skills')
  ];
  return Array.from(new Set(roots.filter((root) => root && existsSync(root))));
}

function parseSkillFrontmatter(markdown: string): { name?: string; description?: string } {
  if (!markdown.startsWith('---')) return {};
  const end = markdown.indexOf('\n---', 3);
  if (end < 0) return {};
  const frontmatter = markdown.slice(3, end).split(/\r?\n/);
  const result: { name?: string; description?: string } = {};
  for (const line of frontmatter) {
    const match = line.match(/^\s*(name|description)\s*:\s*(.+?)\s*$/i);
    if (!match) continue;
    const key = match[1].toLowerCase() as 'name' | 'description';
    const value = match[2].replace(/^['"]|['"]$/g, '').trim();
    if (value) result[key] = value;
  }
  return result;
}

function collectSkillFiles(dir: string, baseDir: string, out: Record<string, true> = {}): Record<string, true> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      collectSkillFiles(fullPath, baseDir, out);
      continue;
    }
    if (entry.name === 'SKILL.md') continue;
    const rel = relative(baseDir, fullPath).split(sep).join('/');
    out[rel] = true;
  }
  return out;
}

function listLocalSkills(): LocalSkillRecord[] {
  const skills: LocalSkillRecord[] = [];
  for (const root of getLocalSkillsRoots()) {
    const stack = [root];
    while (stack.length) {
      const current = stack.pop()!;
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        if (entry.name.startsWith('.') && entry.name !== '.archive') continue;
        const fullPath = resolve(current, entry.name);
        if (!entry.isDirectory()) continue;
        const skillMd = resolve(fullPath, 'SKILL.md');
        if (existsSync(skillMd)) {
          const content = readFileSync(skillMd, 'utf8');
          const frontmatter = parseSkillFrontmatter(content);
          const rel = relative(root, fullPath).split(sep).filter(Boolean);
          const category = rel.length > 1 ? rel[0] : undefined;
          const name = frontmatter.name || entry.name;
          skills.push({
            name,
            description: frontmatter.description || content.split(/\r?\n/).find((line) => line.trim().length > 0 && !line.startsWith('---') && !line.startsWith('#'))?.trim() || '',
            category,
            path: fullPath,
            source: 'bundled',
            linked_files: collectSkillFiles(fullPath, fullPath)
          });
        }
        stack.push(fullPath);
      }
    }
  }
  const seen = new Set<string>();
  return skills.filter((skill) => {
    const key = skill.path.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveLocalSkillDir(request: SkillPathRequest): string | null {
  const candidateNames = [request.path, request.name].filter(Boolean).map((value) => String(value).trim()).filter(Boolean);
  if (!candidateNames.length) return null;
  const skills = listLocalSkills();
  for (const candidate of candidateNames) {
    const normalized = candidate.replace(/\\/g, '/').toLowerCase();
    const match = skills.find((skill) => {
      const skillPath = skill.path.replace(/\\/g, '/').toLowerCase();
      return skill.name.toLowerCase() === normalized
        || skillPath === normalized
        || skillPath.endsWith(`/${normalized}`)
        || skillPath.endsWith(normalized);
    });
    if (match) return match.path;
  }
  return null;
}

export function listSkills(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/skills', {}, fetchImpl).then((payload) => {
    const record = isRecord(payload) ? payload : {};
    const skills = Array.isArray(record.skills) ? record.skills : [];
    if (skills.length) return record;
    const localSkills = listLocalSkills();
    return localSkills.length ? { ...record, skills: localSkills, source: 'bundled' } : record;
  }).catch(() => {
    const localSkills = listLocalSkills();
    if (localSkills.length) return { skills: localSkills, source: 'bundled' };
    throw new Error('Unable to load skills from WebUI or local bundled catalog.');
  });
}

export function getSkillContent(
  webuiUrl: string,
  request: SkillPathRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(
    webuiUrl,
    `/api/skills/content${queryString({ path: request.path, name: request.name, file: request.file })}`,
    {},
    fetchImpl
  ).then((payload) => {
    const record = isRecord(payload) ? payload : {};
    const content = String(record.content || record.text || '');
    if (content.trim()) return record;
    const localSkillDir = resolveLocalSkillDir(request);
    if (!localSkillDir) return record;
    const skillFile = request.file ? resolve(localSkillDir, request.file) : resolve(localSkillDir, 'SKILL.md');
    const relativePath = request.file ? request.file.replace(/\\/g, '/') : 'SKILL.md';
    if (relativePath.split('/').includes('..')) return record;
    const normalizedSkillDir = resolve(localSkillDir);
    if (relative(normalizedSkillDir, skillFile).startsWith('..')) return record;
    if (!existsSync(skillFile)) return record;
    return {
      ...record,
      name: request.name || request.path || localSkillDir.split(/[\\/]/).pop(),
      path: localSkillDir,
      content: readFileSync(skillFile, 'utf8'),
      linked_files: collectSkillFiles(localSkillDir, localSkillDir),
      source: 'bundled',
      file: relativePath
    };
  }).catch(() => {
    const localSkillDir = resolveLocalSkillDir(request);
    if (!localSkillDir) throw new Error(`Skill '${request.name || request.path || request.file || ''}' not found.`);
    const skillFile = request.file ? resolve(localSkillDir, request.file) : resolve(localSkillDir, 'SKILL.md');
    if (relative(resolve(localSkillDir), skillFile).startsWith('..')) throw new Error('Invalid skill file path.');
    if (!existsSync(skillFile)) throw new Error('Skill file not found.');
    return {
      name: request.name || request.path || localSkillDir.split(/[\\/]/).pop(),
      path: localSkillDir,
      content: readFileSync(skillFile, 'utf8'),
      linked_files: collectSkillFiles(localSkillDir, localSkillDir),
      source: 'bundled',
      file: request.file || 'SKILL.md'
    };
  });
}

export function saveSkill(
  webuiUrl: string,
  request: SaveSkillRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = { content: request.content };
  if (request.path) body.path = request.path;
  if (request.name) body.name = request.name;
  if (request.category) body.category = request.category;
  return jsonRequest(webuiUrl, '/api/skills/save', {
    method: 'POST',
    body: JSON.stringify(body)
  }, fetchImpl);
}

export function deleteSkill(
  webuiUrl: string,
  request: SkillPathRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {};
  if (request.path) body.path = request.path;
  if (request.name) body.name = request.name;
  return jsonRequest(webuiUrl, '/api/skills/delete', {
    method: 'POST',
    body: JSON.stringify(body)
  }, fetchImpl);
}

export function listAgents(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/agents/list', {}, fetchImpl);
}

export function getActivatedAgents(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/agents/activated', {}, fetchImpl);
}

export function getCurrentAgent(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/agents/current', {}, fetchImpl);
}

export function setCurrentAgent(webuiUrl: string, request: SetCurrentAgentRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/agents/current', {
    method: 'POST',
    body: JSON.stringify({ slug: request.slug })
  }, fetchImpl);
}

export function getAgentSplashStatus(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/agents/splash/status', {}, fetchImpl);
}

export function completeAgentSplash(webuiUrl: string, request: AgentSplashCompleteRequest = {}, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/agents/splash/complete', {
    method: 'POST',
    body: JSON.stringify({ activated: Array.isArray(request.activated) ? request.activated : [] })
  }, fetchImpl);
}

export function answerAgentSplashQuestion(webuiUrl: string, request: AgentSplashQuestionRequest = {}, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/agents/splash/question', {
    method: 'POST',
    body: JSON.stringify({ answers: Array.isArray(request.answers) ? request.answers : [] })
  }, fetchImpl);
}

export function getAgentStats(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/agents/stats', {}, fetchImpl);
}

export function getAgentActivities(webuiUrl: string, request: AgentActivitiesRequest = {}, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, `/api/agents/activities${queryString({ limit: request.limit })}`, {}, fetchImpl);
}

export function getAgentProfiles(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/agents/profiles', {}, fetchImpl);
}

export function getAgentWorkspaces(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/agents/workspaces', {}, fetchImpl);
}

export function getAgent(webuiUrl: string, request: AgentSlugRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, `/api/agents/${encodeURIComponent(request.slug)}`, {}, fetchImpl);
}

export function getAgentMemory(webuiUrl: string, request: AgentSlugRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, `/api/agents/${encodeURIComponent(request.slug)}/memory`, {}, fetchImpl);
}

export function getAgentSoul(webuiUrl: string, request: AgentSlugRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, `/api/agents/${encodeURIComponent(request.slug)}/soul`, {}, fetchImpl);
}

export function saveAgentProfile(webuiUrl: string, request: SaveAgentProfileRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, `/api/agents/${encodeURIComponent(request.slug)}/profile`, {
    method: 'POST',
    body: JSON.stringify({ profile: request.profile })
  }, fetchImpl);
}

export function activateAgent(webuiUrl: string, request: AgentSlugRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, `/api/agents/${encodeURIComponent(request.slug)}/activate`, {
    method: 'POST',
    body: '{}'
  }, fetchImpl);
}

export function listAgentSessions(
  webuiUrl: string,
  request: AgentSlugRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, `/api/agents/${encodeURIComponent(request.slug)}/sessions`, {}, fetchImpl);
}

export function getAgentSession(
  webuiUrl: string,
  request: AgentSessionRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(
    webuiUrl,
    `/api/agents/${encodeURIComponent(request.slug)}/sessions/${encodeURIComponent(request.sessionId || '')}`,
    {},
    fetchImpl
  );
}

export function startAgentChat(
  webuiUrl: string,
  request: AgentChatRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, `/api/agents/${encodeURIComponent(request.slug)}/chat`, {
    method: 'POST',
    body: JSON.stringify({
      session_id: request.sessionId,
      message: request.message
    })
  }, fetchImpl);
}

export function listAgentWorkspace(
  webuiUrl: string,
  request: AgentSessionRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(
    webuiUrl,
    `/api/agents/${encodeURIComponent(request.slug)}/workspace${queryString({ session_id: request.sessionId, path: request.path || '.' })}`,
    {},
    fetchImpl
  );
}

export function startAgentWorkspaceProcess(
  webuiUrl: string,
  request: AgentSessionRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, `/api/agents/${encodeURIComponent(request.slug)}/workspace/process`, {
    method: 'POST',
    body: JSON.stringify({ session_id: request.sessionId })
  }, fetchImpl);
}

export function sendAgentWorkspaceCommand(
  webuiUrl: string,
  request: AgentWorkspaceCommandRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, `/api/agents/workspace/${encodeURIComponent(request.sessionId)}/command`, {
    method: 'POST',
    body: JSON.stringify({ command: request.command || '' })
  }, fetchImpl);
}

export function stopAgentWorkspace(
  webuiUrl: string,
  request: AgentWorkspaceCommandRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, `/api/agents/workspace/${encodeURIComponent(request.sessionId)}/stop`, {
    method: 'POST',
    body: JSON.stringify({})
  }, fetchImpl);
}

export function createAgent(webuiUrl: string, request: CreateAgentRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/agents/create', {
    method: 'POST',
    body: JSON.stringify(request)
  }, fetchImpl);
}

export function updateAgent(webuiUrl: string, request: UpdateAgentRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, `/api/agents/${encodeURIComponent(request.slug)}`, {
    method: 'PATCH',
    body: JSON.stringify(request.patch)
  }, fetchImpl);
}

export function deleteAgent(webuiUrl: string, request: AgentSlugRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, `/api/agents/${encodeURIComponent(request.slug)}`, {
    method: 'DELETE'
  }, fetchImpl);
}

export function listProfiles(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/profiles', {}, fetchImpl);
}

export function switchProfile(webuiUrl: string, request: ProfileNameRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/profile/switch', {
    method: 'POST',
    body: JSON.stringify({ name: request.name })
  }, fetchImpl);
}

export function createProfile(webuiUrl: string, request: CreateProfileRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/profile/create', {
    method: 'POST',
    body: JSON.stringify(request)
  }, fetchImpl);
}

export function deleteProfile(webuiUrl: string, request: ProfileNameRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/profile/delete', {
    method: 'POST',
    body: JSON.stringify({ name: request.name })
  }, fetchImpl);
}

export function getMemory(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/memory', {}, fetchImpl);
}

export function writeMemory(webuiUrl: string, request: MemoryWriteRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/memory/write', {
    method: 'POST',
    body: JSON.stringify({ section: request.section, content: request.content })
  }, fetchImpl);
}

export function getSupermemoryStatus(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/memory/supermemory/status', {}, fetchImpl);
}

export function listSupermemoryDocuments(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/memory/supermemory/list', {}, fetchImpl);
}

export function getSupermemoryDocument(
  webuiUrl: string,
  request: SupermemoryDocumentRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, `/api/memory/supermemory/document${queryString({ id: request.id })}`, {}, fetchImpl);
}

export function searchSupermemory(webuiUrl: string, request: MemorySearchRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/memory/supermemory/search', {
    method: 'POST',
    body: JSON.stringify({ query: request.query, limit: request.limit })
  }, fetchImpl);
}

export function addSupermemoryDocument(
  webuiUrl: string,
  request: SupermemoryDocumentRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/memory/supermemory/add', {
    method: 'POST',
    body: JSON.stringify(request)
  }, fetchImpl);
}

export function forgetSupermemoryDocument(
  webuiUrl: string,
  request: SupermemoryDocumentRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/memory/supermemory/forget', {
    method: 'POST',
    body: JSON.stringify({ id: request.id })
  }, fetchImpl);
}

export function hybridMemorySearch(webuiUrl: string, request: MemorySearchRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/memory/hybrid/search', {
    method: 'POST',
    body: JSON.stringify({ query: request.query, limit: request.limit })
  }, fetchImpl);
}

export function getInsights(webuiUrl: string, request: InsightsRequest = {}, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, `/api/insights${queryString({ days: request.days })}`, {}, fetchImpl);
}

export function getWikiStatus(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/wiki/status', {}, fetchImpl);
}

export function getLogs(webuiUrl: string, request: LogsRequest = {}, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, `/api/logs${queryString({ file: request.file, tail: request.tail })}`, {}, fetchImpl);
}

export function listAppstore(webuiUrl: string, request: AppstoreQuery = {}, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, `/api/appstore${queryString(request)}`, {}, fetchImpl);
}

export function getAppstoreUpdates(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/appstore/updates', {}, fetchImpl);
}

export function getAppstoreSdk(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/appstore/sdk', {}, fetchImpl);
}

export function installAppstoreApp(webuiUrl: string, request: AppstoreAppRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/appstore/install', {
    method: 'POST',
    body: JSON.stringify({ app_id: request.appId })
  }, fetchImpl);
}

export function uninstallAppstoreApp(webuiUrl: string, request: AppstoreAppRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/appstore/uninstall', {
    method: 'POST',
    body: JSON.stringify({ app_id: request.appId })
  }, fetchImpl);
}

export function updateAllAppstore(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/appstore/update-all', {
    method: 'POST',
    body: '{}'
  }, fetchImpl);
}

export function submitAppstoreApp(webuiUrl: string, request: AppstoreSubmitRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/appstore/submit', {
    method: 'POST',
    body: JSON.stringify(request)
  }, fetchImpl);
}

export function getSettings(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/settings', {}, fetchImpl);
}

export function saveSettings(webuiUrl: string, request: SettingsSaveRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/settings', {
    method: 'POST',
    body: JSON.stringify(request.settings)
  }, fetchImpl);
}

export function listGmailAccounts(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/gmail/accounts', {}, fetchImpl);
}

export function listGmailMessages(webuiUrl: string, request: GmailListRequest = {}, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  const params = request.max !== undefined
    ? { folder: request.folder, max: request.max, account: request.account }
    : { folder: request.folder, limit: request.limit, account: request.account };
  return jsonRequest(webuiUrl, `/api/gmail/list${queryString(params)}`, {}, fetchImpl);
}

export function readGmailMessage(webuiUrl: string, request: GmailMessageRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  const params = request.id
    ? { id: request.id, account: request.account }
    : { message_id: request.messageId, thread_id: request.threadId, account: request.account };
  return jsonRequest(webuiUrl, `/api/gmail/read${queryString(params)}`, {}, fetchImpl);
}

export function searchGmailMessages(webuiUrl: string, request: GmailSearchRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  const params = request.max !== undefined
    ? { query: request.query, max: request.max }
    : { q: request.query };
  return jsonRequest(webuiUrl, `/api/gmail/search${queryString(params)}`, {}, fetchImpl);
}

export function listGmailFolders(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/gmail/folders', {}, fetchImpl);
}

export function summarizeGmailThread(webuiUrl: string, request: GmailMessageRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/gmail/ai/summary', {
    method: 'POST',
    body: JSON.stringify(request.id
      ? { id: request.id }
      : { thread_id: request.threadId, message_id: request.messageId })
  }, fetchImpl);
}

export function draftGmailReply(webuiUrl: string, request: GmailDraftRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  const body = request.id
    ? { id: request.id, variants: request.variants, instruction: request.instruction || '' }
    : {
      thread_id: request.threadId,
      message_id: request.messageId,
      instruction: request.instruction || ''
    };
  return jsonRequest(webuiUrl, '/api/gmail/ai/draft', {
    method: 'POST',
    body: JSON.stringify(body)
  }, fetchImpl);
}

export function getRelatedGmailMessages(webuiUrl: string, request: GmailMessageRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  const params = request.id
    ? { id: request.id }
    : { message_id: request.messageId, thread_id: request.threadId };
  return jsonRequest(webuiUrl, `/api/gmail/ai/related${queryString(params)}`, {}, fetchImpl);
}

export function sendGmailMessage(webuiUrl: string, request: GmailSendRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/gmail/send', {
    method: 'POST',
    body: JSON.stringify({
      to: request.to,
      cc: request.cc,
      bcc: request.bcc,
      subject: request.subject,
      body: request.body,
      thread_id: request.threadId
    })
  }, fetchImpl);
}

export function deleteGmailMessage(webuiUrl: string, request: GmailMessageRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  const body = request.id
    ? { id: request.id }
    : { message_id: request.messageId, thread_id: request.threadId };
  return jsonRequest(webuiUrl, '/api/gmail/delete', {
    method: 'POST',
    body: JSON.stringify(body)
  }, fetchImpl);
}

export function moveGmailMessage(webuiUrl: string, request: GmailMoveRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  const body = request.id
    ? { id: request.id, folder: request.folder }
    : { message_id: request.messageId, thread_id: request.threadId, folder: request.folder };
  return jsonRequest(webuiUrl, '/api/gmail/move', {
    method: 'POST',
    body: JSON.stringify(body)
  }, fetchImpl);
}

export function createGmailTask(webuiUrl: string, request: GmailTaskRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/gmail/ai/task', {
    method: 'POST',
    body: JSON.stringify({ message_id: request.messageId, thread_id: request.threadId, title: request.title || '' })
  }, fetchImpl);
}

export function getDiscordGuild(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/discord/guild', {}, fetchImpl);
}

export function listDiscordChannels(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/discord/channels', {}, fetchImpl);
}

export function listDiscordRoles(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/discord/roles', {}, fetchImpl);
}

export function getDiscordStats(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/discord/stats', {}, fetchImpl);
}

export function getDiscordMember(webuiUrl: string, request: DiscordMemberRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, `/api/discord/member/${encodeURIComponent(request.userId)}`, {}, fetchImpl);
}

export function getDiscordBotInfo(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/discord/bot/info', {}, fetchImpl);
}

export function getDiscordWarns(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/discord/warns', {}, fetchImpl);
}

export function listDiscordChannelsTree(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/discord/channels/tree', {}, fetchImpl);
}

export function listDiscordMembers(webuiUrl: string, request: DiscordMembersRequest = {}, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, `/api/discord/members${queryString({ q: request.query })}`, {}, fetchImpl);
}

export function listDiscordMessages(webuiUrl: string, request: DiscordMessagesRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(
    webuiUrl,
    `/api/discord/channel/${encodeURIComponent(request.channelId)}/messages${queryString({ limit: request.limit, before: request.before })}`,
    {},
    fetchImpl
  );
}

export function sendDiscordMessage(webuiUrl: string, request: DiscordSendRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/discord/send', {
    method: 'POST',
    body: JSON.stringify({ channel_id: request.channelId, content: request.content })
  }, fetchImpl);
}

export function warnDiscordMember(webuiUrl: string, request: DiscordModerationRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  const body = request.userId
    ? { user_id: request.userId, reason: request.reason || '' }
    : { member_id: request.memberId, reason: request.reason || '' };
  return jsonRequest(webuiUrl, '/api/discord/warn', {
    method: 'POST',
    body: JSON.stringify(body)
  }, fetchImpl);
}

export function timeoutDiscordMember(webuiUrl: string, request: DiscordModerationRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  const body = request.userId
    ? { user_id: request.userId, minutes: request.minutes, reason: request.reason || '' }
    : { member_id: request.memberId, minutes: request.minutes, reason: request.reason || '' };
  return jsonRequest(webuiUrl, '/api/discord/timeout', {
    method: 'POST',
    body: JSON.stringify(body)
  }, fetchImpl);
}

export function kickDiscordMember(webuiUrl: string, request: DiscordModerationRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  const body = request.userId
    ? { user_id: request.userId, reason: request.reason || '' }
    : { member_id: request.memberId, reason: request.reason || '' };
  return jsonRequest(webuiUrl, '/api/discord/kick', {
    method: 'POST',
    body: JSON.stringify(body)
  }, fetchImpl);
}

export function banDiscordMember(webuiUrl: string, request: DiscordModerationRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  const body = request.userId
    ? { user_id: request.userId, reason: request.reason || '', delete_days: request.deleteDays || 0 }
    : { member_id: request.memberId, reason: request.reason || '' };
  return jsonRequest(webuiUrl, '/api/discord/ban', {
    method: 'POST',
    body: JSON.stringify(body)
  }, fetchImpl);
}

export function purgeDiscordChannel(webuiUrl: string, request: DiscordPurgeRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  const body = request.amount !== undefined
    ? { channel_id: request.channelId, amount: request.amount }
    : { channel_id: request.channelId, limit: request.limit };
  return jsonRequest(webuiUrl, '/api/discord/purge', {
    method: 'POST',
    body: JSON.stringify(body)
  }, fetchImpl);
}

export function untimeoutDiscordMember(webuiUrl: string, request: DiscordModerationRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  const body = request.userId
    ? { user_id: request.userId }
    : { member_id: request.memberId };
  return jsonRequest(webuiUrl, '/api/discord/untimeout', {
    method: 'POST',
    body: JSON.stringify(body)
  }, fetchImpl);
}

export function unbanDiscordMember(webuiUrl: string, request: DiscordModerationRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  const body = request.userId
    ? { user_id: request.userId }
    : { member_id: request.memberId };
  return jsonRequest(webuiUrl, '/api/discord/unban', {
    method: 'POST',
    body: JSON.stringify(body)
  }, fetchImpl);
}

export function configureDiscord(webuiUrl: string, request: DiscordConfigRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/discord/config', {
    method: 'POST',
    body: JSON.stringify(request)
  }, fetchImpl);
}

async function createSession(webuiUrl: string, fetchImpl: FetchLike): Promise<SessionShape> {
  const response = await jsonRequest<{ session?: SessionShape }>(webuiUrl, '/api/session/new', {
    method: 'POST',
    body: '{}'
  }, fetchImpl);
  if (!response.session?.session_id) throw new Error('Sidekick could not create a chat session.');
  return response.session;
}

async function getSession(webuiUrl: string, sessionId: string, fetchImpl: FetchLike): Promise<SessionShape> {
  const response = await jsonRequest<{ session?: SessionShape }>(
    webuiUrl,
    `/api/session?session_id=${encodeURIComponent(sessionId)}`,
    {},
    fetchImpl
  );
  if (!response.session?.session_id) throw new Error('Sidekick session was not found.');
  return response.session;
}

async function startChat(webuiUrl: string, session: SessionShape, request: SidekickMessageRequest, fetchImpl: FetchLike): Promise<{ stream_id: string; session_id?: string }> {
  return jsonRequest(webuiUrl, '/api/chat/start', {
    method: 'POST',
    body: JSON.stringify({
      session_id: session.session_id,
      message: request.message,
      model: request.model || session.model || '',
      workspace: request.workspace || session.workspace || '',
      model_provider: request.modelProvider ?? session.model_provider ?? null,
      profile: request.profile || 'default',
      mode: request.mode || 'action',
      chat_mode: request.chatMode || 'chat',
      sandbox_disabled: request.sandboxDisabled ?? false
    })
  }, fetchImpl);
}

export async function startSidekickChat(
  webuiUrl: string,
  request: SidekickMessageRequest,
  fetchImpl: FetchLike = fetch
): Promise<{ sessionId: string; streamId: string }> {
  const message = request.message.trim();
  if (!message) throw new Error('Sidekick needs a message before it can respond.');
  const session = request.sessionId
    ? {
      session_id: request.sessionId,
      model: request.model,
      model_provider: request.modelProvider,
      workspace: request.workspace
    }
    : await createSession(webuiUrl, fetchImpl);
  const started = await startChat(webuiUrl, session, { ...request, message }, fetchImpl);
  const sessionId = String(started.session_id || session.session_id || request.sessionId || '');
  if (!sessionId || !started.stream_id) throw new Error('Sidekick did not return a chat stream.');
  return {
    sessionId,
    streamId: String(started.stream_id)
  };
}

export function getChatStreamStatus(
  webuiUrl: string,
  streamId: string,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(
    webuiUrl,
    `/api/chat/stream/status?stream_id=${encodeURIComponent(streamId)}`,
    {},
    fetchImpl
  );
}

export function cancelChatStream(
  webuiUrl: string,
  streamId: string,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(
    webuiUrl,
    `/api/chat/cancel?stream_id=${encodeURIComponent(streamId)}`,
    {},
    fetchImpl
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendSidekickMessage(
  webuiUrl: string,
  request: SidekickMessageRequest,
  fetchImpl: FetchLike = fetch,
  poll: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<SidekickMessageResponse> {
  const message = request.message.trim();
  if (!message) throw new Error('Sidekick needs a message before it can respond.');

  const session = request.sessionId
    ? await getSession(webuiUrl, request.sessionId, fetchImpl)
    : await createSession(webuiUrl, fetchImpl);

  const started = await startChat(webuiUrl, session, { ...request, message }, fetchImpl);
  const intervalMs = poll.intervalMs ?? 1000;
  const timeoutMs = poll.timeoutMs ?? 120000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await delay(intervalMs);
    const latest = await getSession(webuiUrl, String(session.session_id), fetchImpl);
    if (!latest.active_stream_id && !latest.pending_user_message) {
      return {
        sessionId: String(latest.session_id),
        streamId: started.stream_id,
        assistantMessage: extractLastAssistantMessage(latest) || 'Sidekick finished without a readable response.',
        session: latest as Record<string, unknown>
      };
    }
  }

  throw new Error('Sidekick is still working. Try again in a moment.');
}
