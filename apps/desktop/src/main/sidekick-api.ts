import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import type { NativeStreamReadProof } from './native-chat-stream-controller.js';
import { isQuickChatBackendErrorCode, SidekickApiError } from './quick-chat-errors.js';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

/** Added by trusted Main after looking up the saved browser/profile binding. */
export type NativeSpaceScope = Readonly<{ backendProfileId: string; spaceId: string; browserProfileId: string }>;
export type IndependentRunState = 'queued' | 'running' | 'waiting_for_user' | 'waiting_for_approval' | 'pausing' | 'paused' | 'cancelling' | 'cancelled' | 'completed' | 'failed' | 'interrupted';

/** Native-only independent broker operations. No caller supplies a route. */
export const INDEPENDENT_OPERATIONS = new Set([
  'resolveScope', 'assistantSnapshot', 'assistantTurn', 'cancelAssistantTurn', 'assistantReset', 'assistantControl',
  'interviewStart', 'interviewAnswer', 'interviewReview', 'interviewContinue', 'interviewConfirm', 'interviewSkip',
  'activity', 'globalActivity', 'modelSelection', 'definitions', 'connectionSetup', 'connectionConfigure', 'dispatch', 'runControl', 'permissions', 'approve', 'capabilities', 'bindings', 'events',
  'selectedContext', 'browser.spacePaths', 'browser.backendProfiles', 'backendProfiles', 'browser.handshake', 'browser.heartbeat', 'browser.event', 'browser.shutdown', 'browser.nativeValidate', 'browser.nativeView', 'browser.nativeTakeover',
  'browser.connectionStart', 'browser.connectionOpened', 'browser.connectionPoll', 'browser.connectionConfirm',
  'browser.connectionCancel', 'browser.connectionBeginLogout', 'browser.connectionCompleteLogout',
  'browser.connectionAuthorize', 'browser.connectionInvalidate',
  'localAi.catalog', 'localAi.hardwareBind', 'localAi.hardwareRead', 'localAi.recommend', 'localAi.setup', 'localAi.runtime', 'localAi.roleProfile', 'localAi.bootstrap'
]);

export async function independentApiRequest(
  webuiUrl: string,
  operation: string,
  scope: Readonly<{ backendProfileId: string; spaceId: string; browserProfileId: string }> | null,
  payload: unknown,
  backendProfileName: string,
  privateBridgeNonce: string,
  fetchImpl: FetchLike = globalThis.fetch
): Promise<unknown> {
  if (!INDEPENDENT_OPERATIONS.has(operation) || !privateBridgeNonce) throw new Error('Independent operation unavailable.');
  let response: Response;
  try {
    response = await sendJson(webuiUrl, `/api/independent/v1/${operation}`, {
      method: 'POST',
      headers: { ...profileScopeHeaders(backendProfileName), 'x-lastbrowser-bridge-token': privateBridgeNonce },
      body: JSON.stringify({ schemaVersion: 1, scope, payload: payload ?? {} }),
      signal: AbortSignal.timeout(WEBUI_REQUEST_TIMEOUT_MS)
    }, fetchImpl);
  } catch (cause) {
    // A refused loopback connection means the local server has not accepted
    // this request yet. Preserve that distinction for bounded startup recovery.
    let current: unknown = cause;
    const seen = new Set<object>();
    for (let depth = 0; depth < 5 && current && typeof current === 'object' && !seen.has(current); depth++) {
      seen.add(current);
      if ('code' in current && (current as { code?: unknown }).code === 'ECONNREFUSED') {
        const error = Object.assign(new Error('The local Sidekick service is starting.'), {
          code: 'sidekick_not_ready', retryable: true, cause
        });
        throw error;
      }
      current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
    }
    throw cause;
  }
  const value: unknown = await response.json();
  if (!response.ok) {
    const detail = isRecord(value) && isRecord(value.error) ? value.error : null;
    const error = new Error(detail && typeof detail.message === 'string' ? detail.message : 'Independent broker request failed.');
    Object.assign(error, { code: detail?.code ?? 'independent_request_failed', status: response.status,
      retryable: detail?.retryable ?? false, currentRevision: detail?.currentRevision });
    throw error;
  }
  return value;
}

export type WebuiRequestMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type WebuiRequest = {
  method?: WebuiRequestMethod;
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Internal Main binding, never accepted directly from the renderer. */
  profile?: string;
};

export const WEBUI_REQUEST_TIMEOUT_MS = 30_000;

export type CloudSetupRequest = {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  /**
   * Acknowledge overwriting an existing config.yaml. The setup endpoint
   * refuses with "config_exists" otherwise, which silently prevents switching
   * providers on an already-configured install.
   */
  confirmOverwrite?: boolean;
};

export type OnboardingOAuthResponse = {
  ok?: boolean;
  provider?: string;
  flow_id?: string;
  status?: 'pending' | 'success' | 'expired' | 'cancelled' | 'error' | string;
  verification_uri?: string;
  /** Antigravity browser flow publishes the sign-in URL here. */
  auth_url?: string;
  user_code?: string;
  action_required?: string;
  expires_at?: number;
  poll_interval_seconds?: number;
  /** Antigravity flow reports the connected account email on success. */
  email?: string;
  error?: string;
};

export type SidekickMessageRequest = {
  sessionId?: string | null;
  message: string;
  model?: string;
  modelProvider?: string | null;
  /** Optional per-turn override; omitted requests retain the profile setting. */
  reasoningEffort?: string | null;
  providerAccountEmail?: string | null;
  profile?: string;
  workspace?: string;
  spaceScope?: NativeSpaceScope;
  /** Private Main value, used only as an HTTP header. Never a renderer input. */
  nativeBridgeNonce?: string;
  mode?: 'action' | 'plan';
  chatMode?: string;
  sandboxDisabled?: boolean;
  groundingContext?: {
    url?: string;
    title?: string;
    snippet?: string;
  } | null;
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
  tool_call_id?: string;
  /** Assistant reasoning/thinking trace — persisted per message and rendered
   *  as a collapsible card by the desktop transcript (ChatComponents.tsx). */
  reasoning?: string;
  _turnTps?: number;
  pending?: boolean;
  teamwork?: unknown;
  smartTrack?: unknown;
  grill_question?: { questionId: string; revision: number };
  grill_fallback?: { reason: 'invalid_structured_question' | 'question_state_unavailable'; streamId: string; writerGeneration: string };
};

export type ComposerDraft = {
  text?: string;
  files?: unknown[];
};

export type DesktopSessionDetail = DesktopSessionSummary & {
  space_scope?: NativeSpaceScope | null;
  native_controls?: Record<string, unknown> | null;
  grill_state?: Record<string, unknown> | null;
  reasoning_selection?: { schemaVersion: 1; provider: string; model: string; effort: string } | null;
  model?: string;
  model_provider?: string | null;
  active_stream_id?: string | null;
  pending_user_message?: string | null;
  messages?: DesktopChatMessage[];
  composer_draft?: ComposerDraft;
  goal?: Record<string, unknown> | null;
  independent?: { runId: string; dispatchId: string; scope: NativeSpaceScope; state: IndependentRunState; stateRevision: number; assistantConversationId: string; deliveryKey?: string; writerOwner?: 'independent_run' | 'legacy_chat' } | null;
  goal_state_error?: { error?: string; message?: string; retryable?: boolean };
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
  scopeGoalsToWorkspace?: boolean;
  model?: string;
  modelProvider?: string | null;
  profile?: string;
  spaceScope?: NativeSpaceScope;
  nativeBridgeNonce?: string;
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
  browserProfileId?: string;
  /** Authority injected by Main after its read-only binding lookup. */
  profile?: string;
  spaceScope?: NativeSpaceScope;
  nativeBridgeNonce?: string;
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
  profile?: string;
  workspacePath?: string;
};

export type RenameSessionRequest = {
  sessionId: string;
  title: string;
  profile?: string;
  workspacePath?: string;
};

export type SessionListRequest = {
  profile?: string;
  workspacePath?: string;
};

export type SessionIdRequest = {
  sessionId: string;
  profile?: string;
  workspacePath?: string;
};

export type SaveDraftRequest = {
  sessionId: string;
  profile?: string;
  workspacePath?: string;
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
  const response = await sendJson(webuiUrl, path, init, fetchImpl);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const errorDetail = payload?.error;
    let message = '';
    if (typeof errorDetail === 'string' && errorDetail.trim()) {
      message = errorDetail;
    } else if (errorDetail && typeof errorDetail === 'object') {
      message = errorDetail.message || errorDetail.error || errorDetail.detail || JSON.stringify(errorDetail);
    } else if (typeof payload?.message === 'string' && payload.message.trim()) {
      message = payload.message;
    } else if (typeof payload?.detail === 'string' && payload.detail.trim()) {
      message = payload.detail;
    } else {
      message = `HTTP ${response.status}`;
    }
    const safeCode = isQuickChatBackendErrorCode(payload?.error_code) ? payload.error_code : undefined;
    throw new SidekickApiError(String(message), response.status, safeCode);
  }
  return payload as T;
}

/**
 * Send a JSON request, retrying once after refreshing the session token.
 *
 * The WebUI generates its session token fresh on every server start, so a
 * request made before the token was captured (or after a sidecar restart)
 * returns 401. Retrying once with a freshly fetched token makes the bridge
 * self-healing instead of permanently broken.
 */
async function sendJson(
  webuiUrl: string,
  path: string,
  init: RequestInit,
  fetchImpl: FetchLike
): Promise<Response> {
  const request = () => fetchImpl(urlFor(webuiUrl, path), {
    ...init,
    headers: (() => {
      const scopedCookie = (init.headers as Record<string, string> | undefined)?.cookie;
      const cookies = [_sidekickAuthCookie, scopedCookie]
        .filter((value): value is string => Boolean(value));
      return {
      'content-type': 'application/json',
      ...authHeader(),
      ...(init.headers || {}),
      ...(cookies.length ? { cookie: cookies.join('; ') } : {})
      };
    })()
  });
  const response = await request();
  captureSidekickAuthCookie(response);
  if (response.status !== 401) return response;
  const refreshed = await refreshWebuiAuth(webuiUrl, fetchImpl);
  if (!refreshed) {
    await signalAccessAuthRequired(response);
    return response;
  }
  const retried = await request();
  captureSidekickAuthCookie(retried);
  await signalAccessAuthRequired(retried);
  return retried;
}

function profileScopeHeaders(profile?: string): Record<string, string> {
  const normalized = String(profile || '').trim();
  if (!normalized) return {};
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(normalized)) {
    throw new Error('Invalid Sidekick profile identifier.');
  }
  return { cookie: `sidekick_profile=${encodeURIComponent(normalized)}` };
}

/**
 * Auth bridge for the bundled Sidekick WebUI.
 *
 * The live FastAPI WebUI gates every /api/* route behind an ephemeral session
 * token (`X-Sidekick-Session-Token`), generated fresh on each server start and
 * injected into the SPA HTML as `window.__SIDEKICK_SESSION_TOKEN__`. The
 * desktop shell is not the SPA, so it must fetch the token from the served
 * HTML once and send it on every API call — otherwise all native panels fail
 * with HTTP 401.
 */
const SESSION_HEADER = 'X-Sidekick-Session-Token';
let _sessionToken: string | null = null;
let _authAttempted = false;
let _sidekickAuthCookie: string | null = null;
let _accessAuthRequiredHandler: (() => void) | null = null;

/** Install the main-process callback used to lock every browser window on a protected-route 401. */
export function setAccessAuthRequiredHandler(handler: (() => void) | null): void {
  _accessAuthRequiredHandler = handler;
}

export async function signalAccessAuthRequired(response: Response): Promise<void> {
  if (response.status !== 401 || !_accessAuthRequiredHandler) return;
  let payload: Record<string, unknown> | null = null;
  try {
    payload = await response.clone().json() as Record<string, unknown>;
  } catch {
    return;
  }
  const error = payload.error;
  const message = typeof error === 'string'
    ? error
    : error && typeof error === 'object'
      ? String((error as Record<string, unknown>).message || (error as Record<string, unknown>).detail || '')
      : String(payload.message || payload.detail || '');
  if (message.trim().toLowerCase() !== 'authentication required') return;
  _sidekickAuthCookie = null;
  _accessAuthRequiredHandler();
}

function captureSidekickAuthCookie(response: Response): void {
  const setCookie = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie().join(', ')
    : response.headers.get('set-cookie') || '';
  const cookieMatch = setCookie.match(/(?:^|,\s*)sidekick_session=([^;,\s]+)/i);
  if (cookieMatch?.[1]) _sidekickAuthCookie = `sidekick_session=${cookieMatch[1]}`;
  else if (/sidekick_session=;|sidekick_session=""/i.test(setCookie)) _sidekickAuthCookie = null;
}

export function setWebuiSessionToken(token: string | null): void {
  _sessionToken = token;
  _authAttempted = token !== null;
}

export function getWebuiSessionToken(): string | null {
  return _sessionToken;
}

function authHeader(): Record<string, string> {
  return _sessionToken ? { [SESSION_HEADER]: _sessionToken } : {};
}

/**
 * Fetch the ephemeral session token from the served SPA HTML.
 * Safe to call repeatedly — it only attempts once per process.
 */
export async function ensureWebuiAuth(
  webuiUrl: string,
  _password = '',
  fetchImpl: FetchLike = fetch
): Promise<boolean> {
  if (_authAttempted) return _sessionToken !== null;
  _authAttempted = true;
  return refreshWebuiAuth(webuiUrl, fetchImpl);
}

/**
 * (Re)fetch the session token. Unlike `ensureWebuiAuth` this always tries,
 * which is what the 401 retry path needs after a sidecar restart.
 */
export async function refreshWebuiAuth(
  webuiUrl: string,
  fetchImpl: FetchLike = fetch,
  signal?: AbortSignal
): Promise<boolean> {
  try {
    const response = await fetchImpl(urlFor(webuiUrl, '/'), signal ? { signal } : undefined);
    if (signal?.aborted) return false;
    if (!response.ok) return false;
    const html = await response.text();
    if (signal?.aborted) return false;
    const match = html.match(/__SIDEKICK_SESSION_TOKEN__\s*=\s*["']([^"']+)["']/);
    if (match?.[1]) {
      _sessionToken = match[1];
      _authAttempted = true;
      return true;
    }
    return false;
  } catch {
    return false;
  }
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

  const headers: Record<string, string> = { ...authHeader(), ...(request.headers || {}) };
  if (request.profile !== undefined) {
    for (const key of Object.keys(headers)) if (key.toLowerCase() === 'cookie') delete headers[key];
    const profileCookie = profileScopeHeaders(request.profile).cookie;
    headers.cookie = [_sidekickAuthCookie, profileCookie].filter(Boolean).join('; ');
  } else if (_sidekickAuthCookie && !headers.cookie) headers.cookie = _sidekickAuthCookie;
  const init: RequestInit = { method, headers };
  if (method !== 'GET' && request.body !== undefined) {
    headers['content-type'] = headers['content-type'] || 'application/json';
    init.body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  }

  const timeoutMs = WEBUI_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  init.signal = controller.signal;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutError = () => new Error(`Sidekick API request timed out after ${timeoutMs} ms.`);
  const deadline = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      const error = timeoutError();
      controller.abort();
      reject(error);
    }, timeoutMs);
  });

  const operation = (async () => {
    const fetchSafely = async (requestUrl: string, requestInit?: RequestInit): Promise<Response> => {
      try {
        const result = await fetchImpl(requestUrl, requestInit);
        if (controller.signal.aborted) throw timeoutError();
        return result;
      } catch (error) {
        if (controller.signal.aborted) throw timeoutError();
        // Native fetch errors can include request URLs. Keep bridge failures
        // useful without reflecting potentially sensitive query details.
        if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) {
          throw new Error('Sidekick API request failed.');
        }
        throw error;
      }
    };

    let response = await fetchSafely(url.toString(), init);
    if (response.status === 401) {
      // The session token is regenerated on every sidecar start; refresh once.
      const refreshed = await refreshWebuiAuth(webuiUrl, fetchImpl, controller.signal);
      if (controller.signal.aborted) throw timeoutError();
      if (refreshed) {
        headers[SESSION_HEADER] = _sessionToken as string;
        response = await fetchSafely(url.toString(), init);
      }
    }
    if (controller.signal.aborted) throw timeoutError();
    await signalAccessAuthRequired(response);
    let raw: string;
    try {
      raw = await response.text();
    } catch (error) {
      if (controller.signal.aborted) throw timeoutError();
      if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) {
        throw new Error('Sidekick API request failed.');
      }
      throw error;
    }
    if (controller.signal.aborted) throw timeoutError();
    let payload: Record<string, unknown>;
    try {
      payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    } catch {
      payload = { text: raw };
    }
    if (!response.ok) {
      throw new Error(String(payload.error || payload.message || `HTTP ${response.status}`));
    }
    if (path === '/api/auth/logout') _sidekickAuthCookie = null;
    return payload;
  })();

  try {
    return await Promise.race([operation, deadline]);
  } catch (error) {
    if (controller.signal.aborted) throw timeoutError();
    throw error;
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}

export async function getAccessAuthStatus(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<{ auth_enabled: boolean; logged_in: boolean }> {
  return requestWebui(webuiUrl, { method: 'GET', path: '/api/auth/status' }, fetchImpl) as Promise<{ auth_enabled: boolean; logged_in: boolean }>;
}

export async function loginAccessPassword(webuiUrl: string, password: string, fetchImpl: FetchLike = fetch): Promise<{ ok: boolean }> {
  const response = await fetchImpl(urlFor(webuiUrl, '/api/auth/login'), {
    method: 'POST',
    headers: { ...authHeader(), 'content-type': 'application/json' },
    body: JSON.stringify({ password })
  });
  captureSidekickAuthCookie(response);
  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  try { payload = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch {}
  if (!response.ok) throw new Error(String(payload.error || payload.message || `HTTP ${response.status}`));
  return { ok: payload.ok === true };
}

export function clearAccessAuthCookie(): void {
  _sidekickAuthCookie = null;
}

/** Cookie accessor for main-process streaming bridges; never exposed in preload. */
export function getAccessAuthCookie(): string | null {
  return _sidekickAuthCookie;
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
  const body: Record<string, string | boolean> = {
    provider: request.provider,
    model: request.model
  };
  if (request.apiKey?.trim()) body.api_key = request.apiKey.trim();
  if (request.baseUrl?.trim()) body.base_url = request.baseUrl.trim();
  if (request.confirmOverwrite) body.confirm_overwrite = true;
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

/**
 * Read the fallback model — the one the agent switches to when the primary
 * model hits a rate limit.
 */
export function getFallbackModel(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/fallback-model', {}, fetchImpl);
}

/** Set (or clear, with an empty model) the fallback model. */
export function setFallbackModel(
  webuiUrl: string,
  request: { model: string; provider?: string; baseUrl?: string },
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  const body: Record<string, string> = { model: request.model };
  if (request.provider) body.provider = request.provider;
  if (request.baseUrl) body.base_url = request.baseUrl;
  return jsonRequest(webuiUrl, '/api/fallback-model', {
    method: 'POST',
    body: JSON.stringify(body)
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
  requestOrFetch: SessionListRequest | FetchLike = {},
  fetchImpl: FetchLike = fetch
): Promise<{ sessions: DesktopSessionSummary[]; [key: string]: unknown }> {
  const request = typeof requestOrFetch === 'function' ? {} : requestOrFetch;
  const selectedFetch = typeof requestOrFetch === 'function' ? requestOrFetch : fetchImpl;
  const params = new URLSearchParams();
  if (request.workspacePath?.trim()) params.set('workspace_path', request.workspacePath.trim());
  const query = params.size ? `?${params.toString()}` : '';
  return jsonRequest(webuiUrl, `/api/sessions${query}`, {
    headers: profileScopeHeaders(request.profile)
  }, selectedFetch);
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
  if (request.scopeGoalsToWorkspace === true) body.scope_goals_to_workspace = true;
  if (request.model?.trim()) body.model = request.model.trim();
  if (request.modelProvider !== undefined) body.model_provider = request.modelProvider;
  if (request.profile?.trim()) body.profile = request.profile.trim();
  if (request.spaceScope) body.space_scope = request.spaceScope;

  return jsonRequest(webuiUrl, '/api/session/new', {
    method: 'POST',
    headers: { ...profileScopeHeaders(request.profile), ...(request.spaceScope && request.nativeBridgeNonce ? { 'X-Lastbrowser-Bridge-Token': request.nativeBridgeNonce } : {}) },
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
  if (typeof request !== 'string' && request.workspacePath?.trim()) {
    params.set('workspace_path', request.workspacePath.trim());
  }
  return jsonRequest(
    webuiUrl,
    `/api/session?${params.toString()}`,
    { headers: typeof request === 'string' ? {} : profileScopeHeaders(request.profile) },
    fetchImpl
  );
}

export function renameSession(
  webuiUrl: string,
  request: RenameSessionRequest,
  fetchImpl: FetchLike = fetch
): Promise<{ session?: DesktopSessionDetail; [key: string]: unknown }> {
  const params = new URLSearchParams();
  if (request.workspacePath?.trim()) params.set('workspace_path', request.workspacePath.trim());
  const query = params.size ? `?${params.toString()}` : '';
  return jsonRequest(webuiUrl, `/api/session/rename${query}`, {
    method: 'POST',
    headers: profileScopeHeaders(request.profile),
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
    headers: profileScopeHeaders(request.profile),
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
    headers: profileScopeHeaders(request.profile),
    body: JSON.stringify({ session_id: request.sessionId })
  }, fetchImpl);
}

export function getSessionDraft(
  webuiUrl: string,
  requestOrId: string | SessionIdRequest,
  fetchImpl: FetchLike = fetch
): Promise<{ draft?: ComposerDraft; [key: string]: unknown }> {
  const request = typeof requestOrId === 'string' ? { sessionId: requestOrId } : requestOrId;
  return jsonRequest(
    webuiUrl,
    `/api/session/draft?session_id=${encodeURIComponent(request.sessionId)}`,
    { headers: profileScopeHeaders(request.profile) },
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
    headers: profileScopeHeaders(request.profile),
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
    headers: {
      ...profileScopeHeaders(request.profile),
      ...(request.spaceScope && request.nativeBridgeNonce
        ? { 'X-Lastbrowser-Bridge-Token': request.nativeBridgeNonce } : {})
    },
    body: JSON.stringify({ path: request.path, ...(request.spaceScope ? { space_scope: request.spaceScope } : {}) })
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

export async function getKanbanBoard(
  webuiUrl: string,
  options: { workspace?: string; board?: string } = {},
  fetchImpl: FetchLike = fetch
): Promise<KanbanBoardResponse> {
  try {
    return await jsonRequest(webuiUrl, `/api/kanban/board${kanbanQuery(options)}`, {}, fetchImpl);
  } catch (error) {
    if (options.workspace) {
      try {
        return await jsonRequest(webuiUrl, `/api/kanban/board${kanbanQuery({ board: options.board })}`, {}, fetchImpl);
      } catch {
        // fallback below
      }
    }
    return {
      columns: [
        { name: 'triage', tasks: [] },
        { name: 'todo', tasks: [] },
        { name: 'ready', tasks: [] },
        { name: 'running', tasks: [] },
        { name: 'blocked', tasks: [] },
        { name: 'done', tasks: [] }
      ]
    };
  }
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

export async function listSupermemoryDocuments(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  try {
    return await jsonRequest(webuiUrl, '/api/memory/supermemory/list', {}, fetchImpl);
  } catch (error) {
    return { ok: false, configured: false, results: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getSupermemoryDocument(
  webuiUrl: string,
  request: SupermemoryDocumentRequest,
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  try {
    return await jsonRequest(webuiUrl, `/api/memory/supermemory/document${queryString({ id: request.id })}`, {}, fetchImpl);
  } catch (error) {
    return { ok: false, configured: false, document: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function searchSupermemory(webuiUrl: string, request: MemorySearchRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  try {
    return await jsonRequest(webuiUrl, '/api/memory/supermemory/search', {
      method: 'POST',
      body: JSON.stringify({ query: request.query, limit: request.limit })
    }, fetchImpl);
  } catch (error) {
    return { ok: false, configured: false, results: [], error: error instanceof Error ? error.message : String(error) };
  }
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

export function reindexSupermemory(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/memory/supermemory/index', {
    method: 'POST',
    body: JSON.stringify({})
  }, fetchImpl);
}

export function dumpSupermemory(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/memory/supermemory/dump', {}, fetchImpl);
}

export function listMcpServers(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/mcp/servers', {}, fetchImpl);
}

export function saveMcpServers(webuiUrl: string, config: unknown, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/mcp/servers', {
    method: 'POST',
    body: JSON.stringify(config)
  }, fetchImpl);
}

export function listMcpTools(webuiUrl: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/mcp/tools', {}, fetchImpl);
}

export function callMcpTool(
  webuiUrl: string,
  request: { server: string; tool: string; arguments?: unknown },
  fetchImpl: FetchLike = fetch
): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/mcp/tools/call', {
    method: 'POST',
    body: JSON.stringify(request)
  }, fetchImpl);
}

export async function hybridMemorySearch(webuiUrl: string, request: MemorySearchRequest, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  try {
    return await jsonRequest(webuiUrl, '/api/memory/hybrid/search', {
      method: 'POST',
      body: JSON.stringify({ query: request.query, limit: request.limit })
    }, fetchImpl);
  } catch (error) {
    return { ok: false, configured: false, results: [], error: error instanceof Error ? error.message : String(error) };
  }
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

function sessionCreationScope(request: SidekickMessageRequest): CreateSessionRequest {
  const workspace = request.workspace?.trim() || '';
  return {
    ...(workspace ? { workspace, scopeGoalsToWorkspace: true } : {}),
    ...(request.model?.trim() ? { model: request.model.trim() } : {}),
    ...(request.modelProvider !== undefined ? { modelProvider: request.modelProvider } : {}),
    ...(request.profile?.trim() ? { profile: request.profile.trim() } : {}),
    ...(request.spaceScope ? { spaceScope: request.spaceScope } : {}),
    ...(request.nativeBridgeNonce ? { nativeBridgeNonce: request.nativeBridgeNonce } : {}),
  };
}

async function createSession(
  webuiUrl: string,
  request: CreateSessionRequest,
  fetchImpl: FetchLike
): Promise<SessionShape> {
  const response = await createSidekickSession(webuiUrl, request, fetchImpl);
  if (!response.session?.session_id) throw new Error('Sidekick could not create a chat session.');
  return response.session;
}

async function getSession(
  webuiUrl: string,
  sessionId: string,
  scope: Pick<SidekickMessageRequest, 'profile' | 'workspace'>,
  fetchImpl: FetchLike
): Promise<SessionShape> {
  const params = new URLSearchParams({ session_id: sessionId });
  if (scope.workspace?.trim()) params.set('workspace_path', scope.workspace.trim());
  const response = await jsonRequest<{ session?: SessionShape }>(
    webuiUrl,
    `/api/session?${params.toString()}`,
    { headers: profileScopeHeaders(scope.profile) },
    fetchImpl
  );
  if (!response.session?.session_id) throw new Error('Sidekick session was not found.');
  return response.session;
}

async function startChat(webuiUrl: string, session: SessionShape, request: SidekickMessageRequest, fetchImpl: FetchLike): Promise<{ stream_id: string; session_id?: string; space_scope?: NativeSpaceScope | null }> {
  // Omit `model` entirely when nothing is configured. Sending '' made the
  // backend resolve a stale catalog entry instead of the provider default
  // (observed: "Ring-2.6-1T is no longer available as a free model").
  const resolvedModel = request.model || session.model || '';
  const body: Record<string, unknown> = {
    session_id: session.session_id,
    message: request.message,
    workspace: request.workspace || session.workspace || '',
    model_provider: request.modelProvider ?? session.model_provider ?? null,
    profile: request.profile || 'default',
    chat_mode: request.chatMode || 'chat',
    sandbox_disabled: request.sandboxDisabled ?? false
  };
  if (request.mode) body.mode = request.mode;
  if (request.providerAccountEmail?.trim()) body.provider_account_email = request.providerAccountEmail.trim().toLowerCase();
  if (request.spaceScope) body.space_scope = request.spaceScope;
  if (request.reasoningEffort?.trim()) body.reasoning_effort = request.reasoningEffort.trim();
  if (request.groundingContext && typeof request.groundingContext === 'object') {
    body.grounding_context = {
      url: request.groundingContext.url || '',
      title: request.groundingContext.title || '',
      snippet: request.groundingContext.snippet || '',
    };
  }
  if (resolvedModel) body.model = resolvedModel;
  return jsonRequest(webuiUrl, '/api/chat/start', {
    method: 'POST',
    headers: { ...profileScopeHeaders(request.profile), ...(request.spaceScope && request.nativeBridgeNonce ? { 'X-Lastbrowser-Bridge-Token': request.nativeBridgeNonce } : {}) },
    body: JSON.stringify(body)
  }, fetchImpl);
}

export interface ChatModeRequest {
  action: 'get' | 'set';
  sessionId: string;
  workspacePath?: string;
  browserProfileId?: string;
  profile?: string;
  spaceScope?: Record<string, unknown>;
  nativeBridgeNonce?: string;
  mode?: 'action' | 'plan' | 'grill_me' | 'boost';
  lifetime?: 'chat' | 'next_turn';
  expectedRevision?: number;
  clientRequestId?: string;
}

export interface GrillRequest extends Omit<ChatModeRequest, 'action' | 'mode' | 'lifetime'> {
  action: 'get' | 'start' | 'answer' | 'skip' | 'review' | 'resume' | 'finish';
  objective?: string;
  topics?: Array<{ id: string; label: string }>;
  questionId?: string;
  questionRevision?: number;
  choiceId?: string;
  text?: string;
}

export interface GoalMigrationRequest extends Omit<ChatModeRequest, 'action' | 'mode' | 'lifetime' | 'expectedRevision'> {
  action: 'review' | 'migrate';
  expectedSourceRevision?: number;
  expectedSourceDigest?: string;
}

export interface NativeChatControlRequest {
  sessionId: string;
  streamId: string;
  command: 'cancel' | 'pause' | 'approval' | 'clarify';
  workspacePath?: string;
  browserProfileId?: string;
  profile?: string;
  spaceScope?: NativeSpaceScope;
  nativeBridgeNonce?: string;
  requestId?: string;
  choice?: 'once' | 'session' | 'always' | 'deny';
  response?: string;
}

export function controlNativeChat(webuiUrl: string, request: NativeChatControlRequest,
  fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  if (!request.sessionId || !request.streamId || !request.spaceScope || !request.nativeBridgeNonce
    || !['cancel', 'pause', 'approval', 'clarify'].includes(request.command)) {
    throw new Error('Native chat controls require the accepted chat, stream and scope.');
  }
  return jsonRequest(webuiUrl, '/api/chat/control', { method: 'POST', headers: nativeChatHeaders(request),
    body: JSON.stringify({ session_id: request.sessionId, stream_id: request.streamId, space_scope: request.spaceScope,
      command: request.command, ...(request.requestId ? { request_id: request.requestId } : {}),
      ...(request.choice ? { choice: request.choice } : {}),
      ...(request.response !== undefined ? { response: request.response } : {}) }) }, fetchImpl);
}

export interface ModelPolicyRequest {
  action: 'get' | 'set';
  sessionId: string;
  workspacePath?: string;
  browserProfileId?: string;
  profile?: string;
  spaceScope?: NativeSpaceScope;
  nativeBridgeNonce?: string;
  draft?: Record<string, unknown>;
  expectedRevision?: number;
  clientRequestId?: string;
}

export function nativeChatReadHeaders(request: { profile?: string; workspacePath?: string; nativeBridgeNonce?: string }): Record<string, string> {
  return { ...profileScopeHeaders(request.profile), ...(request.nativeBridgeNonce ? { 'X-Lastbrowser-Bridge-Token': request.nativeBridgeNonce } : {}),
    ...(request.workspacePath ? { 'X-Sidekick-Workspace': request.workspacePath } : {}) };
}
const nativeChatHeaders = nativeChatReadHeaders;

export function readNativeChatContext(webuiUrl: string,
  request: Omit<NativeChatControlRequest, 'command'>, fetchImpl: FetchLike = fetch): Promise<NativeStreamReadProof> {
  if (!request.sessionId || !request.streamId || !request.spaceScope || !request.nativeBridgeNonce) {
    throw new Error('Native stream reads require their original Main-owned binding.');
  }
  return jsonRequest(webuiUrl, '/api/chat/read-context', { method: 'POST', headers: nativeChatHeaders(request),
    body: JSON.stringify({ session_id: request.sessionId, stream_id: request.streamId, space_scope: request.spaceScope }) }, fetchImpl);
}

export function controlModelPolicy(webuiUrl: string, request: ModelPolicyRequest,
  fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  if (!['get', 'set'].includes(request.action) || !request.sessionId || !request.spaceScope || !request.nativeBridgeNonce) {
    throw new Error('Model policy requires the original native chat binding.');
  }
  if (request.action === 'set' && (!request.draft || !Number.isSafeInteger(request.expectedRevision)
    || request.expectedRevision! < 0 || !request.clientRequestId)) {
    throw new Error('Model policy save requires a draft, revision and request identity.');
  }
  return jsonRequest(webuiUrl, '/api/chat/model-policy', {
    method: 'POST',
    headers: nativeChatHeaders(request),
    body: JSON.stringify({ action: request.action, session_id: request.sessionId, space_scope: request.spaceScope,
      ...(request.action === 'set' ? { draft: request.draft, expectedRevision: request.expectedRevision,
        clientRequestId: request.clientRequestId } : {}) })
  }, fetchImpl);
}

export interface PersistentGoalRequest {
  sessionId: string;
  args: string;
  workspacePath?: string;
  browserProfileId?: string;
  profile?: string;
  spaceScope?: NativeSpaceScope;
  nativeBridgeNonce?: string;
  model?: string;
  modelProvider?: string | null;
  reasoningEffort?: string;
  expectedRevision?: number;
  clientRequestId?: string;
}

export interface ChildHistoryRequest {
  sessionId: string;
  workspacePath?: string;
  browserProfileId?: string;
  profile?: string;
  spaceScope?: NativeSpaceScope;
  nativeBridgeNonce?: string;
  parentTurnId?: string;
  afterSequence?: Record<string, number>;
}

export function readChildHistory(webuiUrl: string, request: ChildHistoryRequest,
  fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  if (!request.sessionId || !request.spaceScope || !request.nativeBridgeNonce) {
    throw new Error('Child recovery requires the original native chat binding.');
  }
  return jsonRequest(webuiUrl, '/api/chat/children', {
    method: 'POST',
    headers: nativeChatHeaders(request),
    body: JSON.stringify({ session_id: request.sessionId, space_scope: request.spaceScope,
      ...(request.parentTurnId ? { parent_turn_id: request.parentTurnId } : {}),
      ...(request.afterSequence ? { after_sequence: request.afterSequence } : {}) })
  }, fetchImpl);
}

export function controlPersistentGoal(webuiUrl: string, request: PersistentGoalRequest,
  fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  if (!request.sessionId || !request.spaceScope || !request.nativeBridgeNonce) {
    throw new Error('Goal controls require the existing native chat binding.');
  }
  return jsonRequest(webuiUrl, '/api/goal', {
    method: 'POST',
    headers: nativeChatHeaders(request),
    body: JSON.stringify({ session_id: request.sessionId, args: request.args,
      profile: request.profile, space_scope: request.spaceScope,
      ...(request.workspacePath ? { workspace: request.workspacePath, scope_goals_to_workspace: true } : {}),
      ...(request.model ? { model: request.model } : {}),
      ...(request.modelProvider ? { model_provider: request.modelProvider } : {}),
      ...(request.reasoningEffort ? { reasoning_effort: request.reasoningEffort } : {}),
      ...(request.expectedRevision !== undefined ? { expected_revision: request.expectedRevision } : {}),
      ...(request.clientRequestId ? { client_request_id: request.clientRequestId } : {}) })
  }, fetchImpl);
}

export function controlChatMode(webuiUrl: string, request: ChatModeRequest,
  fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  if (!['get', 'set'].includes(request.action) || !request.sessionId || !request.spaceScope || !request.nativeBridgeNonce) {
    throw new Error('Chat modes require a bound native chat and a purpose action.');
  }
  return jsonRequest(webuiUrl, '/api/chat/mode', {
    method: 'POST',
    headers: nativeChatHeaders(request),
    body: JSON.stringify({ action: request.action, session_id: request.sessionId,
      space_scope: request.spaceScope,
      ...(request.action === 'set' ? { mode: request.mode, lifetime: request.lifetime,
        expected_revision: request.expectedRevision, client_request_id: request.clientRequestId } : {}) })
  }, fetchImpl);
}

export function controlGrill(webuiUrl: string, request: GrillRequest,
  fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  if (!['get', 'start', 'answer', 'skip', 'review', 'resume', 'finish'].includes(request.action)
    || !request.sessionId || !request.spaceScope || !request.nativeBridgeNonce) {
    throw new Error('Clarification requires an existing native chat and a purpose action.');
  }
  return jsonRequest(webuiUrl, '/api/chat/grill', {
    method: 'POST', headers: nativeChatHeaders(request),
    body: JSON.stringify({ action: request.action, session_id: request.sessionId,
      space_scope: request.spaceScope,
      ...(request.action !== 'get' ? { expected_revision: request.expectedRevision,
        client_request_id: request.clientRequestId,
        ...(request.objective !== undefined ? { objective: request.objective } : {}),
        ...(request.topics !== undefined ? { topics: request.topics } : {}),
        ...(request.questionId !== undefined ? { questionId: request.questionId } : {}),
        ...(request.questionRevision !== undefined ? { questionRevision: request.questionRevision } : {}),
        ...(request.choiceId !== undefined ? { choiceId: request.choiceId } : {}),
        ...(request.text !== undefined ? { text: request.text } : {}) } : {}) })
  }, fetchImpl);
}

export async function controlGoalMigration(webuiUrl: string, request: GoalMigrationRequest,
  fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  if (!['review', 'migrate'].includes(request.action) || !request.sessionId || !request.spaceScope || !request.nativeBridgeNonce) {
    throw new Error('Goal migration requires its original native chat and a purpose action.');
  }
  const response = await sendJson(webuiUrl, '/api/chat/goal-migration', {
    method: 'POST', headers: nativeChatHeaders(request),
    body: JSON.stringify({ action: request.action, session_id: request.sessionId, space_scope: request.spaceScope,
      ...(request.action === 'migrate' ? { expected_source_revision: request.expectedSourceRevision,
        expected_source_digest: request.expectedSourceDigest, client_request_id: request.clientRequestId } : {}) })
  }, fetchImpl);
  const value: unknown = await response.json();
  if (!isRecord(value)) throw new Error('Invalid goal migration response.');
  if (!response.ok && (value.ok !== false || typeof value.error_code !== 'string')) {
    throw new Error('Goal migration request failed.');
  }
  return value;
}

export async function startSidekickChat(
  webuiUrl: string,
  request: SidekickMessageRequest,
  fetchImpl: FetchLike = fetch
): Promise<{ sessionId: string; streamId: string; spaceScope?: NativeSpaceScope | null }> {
  const message = request.message.trim();
  if (!message) throw new Error('Sidekick needs a message before it can respond.');
  const session = request.sessionId
    ? {
      session_id: request.sessionId,
      model: request.model,
      model_provider: request.modelProvider,
      workspace: request.workspace
    }
    : await createSession(webuiUrl, sessionCreationScope(request), fetchImpl);
  const started = await startChat(webuiUrl, session, { ...request, message }, fetchImpl);
  const sessionId = String(started.session_id || session.session_id || request.sessionId || '');
  if (!sessionId || !started.stream_id) throw new Error('Sidekick did not return a chat stream.');
  return {
    sessionId,
    streamId: String(started.stream_id),
    ...(Object.hasOwn(started, 'space_scope') ? { spaceScope: started.space_scope } : {})
  };
}

export type QuickChatBackendRequest = Readonly<{
  quickChatId: string; scope: NativeSpaceScope; profile: string; workspacePath: string | null;
  nativeBridgeNonce: string; prompt: string; context?: Readonly<Record<string, string>>;
  model?: string; modelProvider?: string | null;
}>;
export type QuickChatBackendStreamRequest = Omit<QuickChatBackendRequest, 'prompt' | 'context' | 'model' | 'modelProvider'> & { streamId: string };

/** Quickchat uses a private, explicitly tagged Sidekick transcript, never /api/chat/start. */
export function startQuickChat(webuiUrl: string, request: QuickChatBackendRequest,
  fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  if (!request.nativeBridgeNonce || !request.quickChatId || !request.prompt.trim()) throw new Error('Quickchat requires its Main-bound scope and prompt.');
  return jsonRequest(webuiUrl, '/api/quickchat/start', {
    method: 'POST', headers: nativeChatReadHeaders({ profile: request.profile, workspacePath: request.workspacePath ?? undefined,
      nativeBridgeNonce: request.nativeBridgeNonce }),
    body: JSON.stringify({ quick_chat_id: request.quickChatId, space_scope: request.scope, profile: request.profile,
      workspace: request.workspacePath, prompt: request.prompt, context: request.context,
      ...(request.model ? { model: request.model } : {}), ...(request.modelProvider ? { model_provider: request.modelProvider } : {}) })
  }, fetchImpl);
}

export function cancelQuickChat(webuiUrl: string, request: QuickChatBackendStreamRequest,
  fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/quickchat/cancel', {
    method: 'POST', headers: nativeChatReadHeaders({ profile: request.profile, workspacePath: request.workspacePath ?? undefined,
      nativeBridgeNonce: request.nativeBridgeNonce }),
    body: JSON.stringify({ quick_chat_id: request.quickChatId, stream_id: request.streamId,
      space_scope: request.scope, profile: request.profile, workspace: request.workspacePath })
  }, fetchImpl);
}

/** Stop the response but retain the private transcript for a later turn. */
export function stopQuickChat(webuiUrl: string, request: QuickChatBackendStreamRequest,
  fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>> {
  return jsonRequest(webuiUrl, '/api/quickchat/stop', {
    method: 'POST', headers: nativeChatReadHeaders({ profile: request.profile, workspacePath: request.workspacePath ?? undefined,
      nativeBridgeNonce: request.nativeBridgeNonce }),
    body: JSON.stringify({ quick_chat_id: request.quickChatId, stream_id: request.streamId,
      space_scope: request.scope, profile: request.profile, workspace: request.workspacePath })
  }, fetchImpl);
}

export function getChatStreamStatus(
  webuiUrl: string,
  streamId: string,
  fetchImpl: FetchLike = fetch,
  readHeaders: Readonly<Record<string, string>> = {}
): Promise<Record<string, unknown>> {
  return jsonRequest(
    webuiUrl,
    `/api/chat/stream/status?stream_id=${encodeURIComponent(streamId)}`,
    { headers: readHeaders },
    fetchImpl
  );
}

export function cancelChatStream(
  webuiUrl: string,
  streamId: string,
  fetchImpl: FetchLike = fetch,
  profile?: string
): Promise<Record<string, unknown>> {
  return jsonRequest(
    webuiUrl,
    `/api/chat/cancel?stream_id=${encodeURIComponent(streamId)}`,
    { headers: profileScopeHeaders(profile) },
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
    ? await getSession(webuiUrl, request.sessionId, request, fetchImpl)
    : await createSession(webuiUrl, sessionCreationScope(request), fetchImpl);

  const started = await startChat(webuiUrl, session, { ...request, message }, fetchImpl);
  const intervalMs = poll.intervalMs ?? 1000;
  const timeoutMs = poll.timeoutMs ?? 120000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await delay(intervalMs);
    const latest = await getSession(webuiUrl, String(session.session_id), request, fetchImpl);
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
