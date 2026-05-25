export {};

type LastbrowserSetupState = {
  cloudSetupComplete: boolean;
  provider: string;
  model: string;
};

type DesktopSessionSummary = {
  session_id: string;
  title?: string;
  workspace?: string;
  updated_at?: string | number;
  last_message_at?: string | number;
  message_count?: number;
  source_label?: string;
  profile?: string;
};

type DesktopChatMessage = {
  role?: string;
  content?: string;
  timestamp?: string | number;
  tool_calls?: unknown[];
  pending?: boolean;
};

type ComposerDraft = {
  text?: string;
  files?: unknown[];
};

type DesktopSessionDetail = DesktopSessionSummary & {
  model?: string;
  model_provider?: string | null;
  active_stream_id?: string | null;
  pending_user_message?: string | null;
  messages?: DesktopChatMessage[];
  composer_draft?: ComposerDraft;
};

type WorkspaceTreeEntry = {
  name: string;
  path?: string;
  type?: string;
  size?: number;
  modified?: string | number;
  is_dir?: boolean;
};

type WorkspaceFilePreview = {
  path?: string;
  content?: string;
  mime?: string;
  language?: string;
  size?: number;
  truncated?: boolean;
};

type SpaceSummary = {
  path: string;
  name?: string;
  emoji?: string;
  color?: string;
};

type CronJobSummary = {
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

type KanbanTaskSummary = {
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

type KanbanColumnSummary = {
  name: string;
  tasks?: KanbanTaskSummary[];
};

type KanbanBoardResponse = {
  columns?: KanbanColumnSummary[];
  read_only?: boolean;
  assignees?: string[];
  tenants?: string[];
  latest_event_id?: number;
  [key: string]: unknown;
};

type LastbrowserUpdateStatus = {
  state: 'idle' | 'disabled' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  availableVersion: string | null;
  percent: number | null;
  lastCheckedAt: string | null;
  message: string | null;
};

type WebuiBridgeRequest = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
};

declare global {
  interface Window {
    lastbrowser: {
      services: {
        status: () => Promise<{
          sidekick: 'starting' | 'ready' | 'stopped' | 'missing' | 'error';
          webuiHealth: 'unknown' | 'checking' | 'ready' | 'unreachable';
          webuiUrl: string;
          port: number | null;
          runtimeDir: string;
          lastError: string | null;
        }>;
        start: () => Promise<unknown>;
        stop: () => Promise<unknown>;
      };
      setup: {
        load: () => Promise<LastbrowserSetupState>;
        save: (state: LastbrowserSetupState) => Promise<LastbrowserSetupState>;
      };
      sidekick: {
        onboardingStatus: () => Promise<Record<string, unknown>>;
        applyCloudSetup: (request: { provider: string; model: string; apiKey?: string }) => Promise<Record<string, unknown>>;
        setDefaultModel: (request: { model: string }) => Promise<Record<string, unknown>>;
        completeCloudSetup: () => Promise<Record<string, unknown>>;
        startOAuth: (request: { provider: string }) => Promise<{
          ok?: boolean;
          provider?: string;
          flow_id?: string;
          status?: string;
          verification_uri?: string;
          user_code?: string;
          expires_at?: number;
          poll_interval_seconds?: number;
          error?: string;
        }>;
        pollOAuth: (flowId: string) => Promise<{
          ok?: boolean;
          provider?: string;
          flow_id?: string;
          status?: string;
          error?: string;
        }>;
        cancelOAuth: (request: { flowId: string; provider?: string }) => Promise<{
          ok?: boolean;
          provider?: string;
          flow_id?: string;
          status?: string;
          error?: string;
        }>;
        requestWebui: (request: WebuiBridgeRequest) => Promise<Record<string, unknown>>;
        listSessions: () => Promise<{ sessions: DesktopSessionSummary[]; [key: string]: unknown }>;
        listSpaces: () => Promise<{ workspaces: SpaceSummary[]; last?: string; [key: string]: unknown }>;
        createSession: (request?: {
          workspace?: string;
          model?: string;
          modelProvider?: string | null;
          profile?: string;
        }) => Promise<{ session?: DesktopSessionSummary & Record<string, unknown> }>;
        getSession: (request: string | { sessionId: string; messages?: boolean; msgLimit?: number }) => Promise<{ session?: DesktopSessionDetail }>;
        renameSession: (request: { sessionId: string; title: string }) => Promise<{ session?: DesktopSessionDetail; [key: string]: unknown }>;
        deleteSession: (request: { sessionId: string }) => Promise<Record<string, unknown>>;
        duplicateSession: (request: { sessionId: string }) => Promise<{ session?: DesktopSessionDetail; [key: string]: unknown }>;
        getDraft: (sessionId: string) => Promise<{ draft?: ComposerDraft; [key: string]: unknown }>;
        saveDraft: (request: { sessionId: string; text?: string; files?: unknown[] }) => Promise<{ draft?: ComposerDraft; [key: string]: unknown }>;
        startChat: (request: {
          sessionId?: string | null;
          message: string;
          model?: string;
          modelProvider?: string | null;
          profile?: string;
          workspace?: string;
          mode?: 'action' | 'plan';
          chatMode?: string;
          sandboxDisabled?: boolean;
        }) => Promise<{ sessionId: string; streamId: string }>;
        getStreamStatus: (streamId: string) => Promise<Record<string, unknown>>;
        cancelStream: (streamId: string) => Promise<Record<string, unknown>>;
        listWorkspace: (request: { sessionId: string; path?: string }) => Promise<{ entries: WorkspaceTreeEntry[]; path: string }>;
        readWorkspaceFile: (request: { sessionId: string; path?: string }) => Promise<WorkspaceFilePreview>;
        createWorkspaceFile: (request: { sessionId: string; path: string; content?: string }) => Promise<Record<string, unknown>>;
        saveWorkspaceFile: (request: { sessionId: string; path: string; content?: string }) => Promise<Record<string, unknown>>;
        renameWorkspaceEntry: (request: { sessionId: string; path: string; newName: string }) => Promise<Record<string, unknown>>;
        createWorkspaceDirectory: (request: { sessionId: string; path: string }) => Promise<Record<string, unknown>>;
        deleteWorkspaceEntry: (request: { sessionId: string; path: string; recursive?: boolean }) => Promise<Record<string, unknown>>;
        addSpace: (request: { path: string; name?: string; create?: boolean }) => Promise<{ workspaces?: SpaceSummary[]; [key: string]: unknown }>;
        removeSpace: (request: { path: string }) => Promise<{ workspaces?: SpaceSummary[]; [key: string]: unknown }>;
        renameSpace: (request: { path: string; name: string }) => Promise<{ workspaces?: SpaceSummary[]; [key: string]: unknown }>;
        reorderSpaces: (request: { paths: string[] }) => Promise<{ workspaces?: SpaceSummary[]; [key: string]: unknown }>;
        listCrons: () => Promise<{ jobs: CronJobSummary[]; [key: string]: unknown }>;
        createCron: (request: {
          name?: string;
          prompt: string;
          schedule: string;
          deliver?: string;
          profile?: string;
          toastNotifications?: boolean;
        }) => Promise<{ ok?: boolean; job?: CronJobSummary; [key: string]: unknown }>;
        updateCron: (request: {
          jobId: string;
          name?: string;
          prompt?: string;
          schedule?: string;
          deliver?: string;
          profile?: string;
          toastNotifications?: boolean;
        }) => Promise<{ ok?: boolean; job?: CronJobSummary; [key: string]: unknown }>;
        deleteCron: (request: { jobId: string }) => Promise<Record<string, unknown>>;
        runCron: (request: { jobId: string }) => Promise<Record<string, unknown>>;
        pauseCron: (request: { jobId: string }) => Promise<{ job?: CronJobSummary; [key: string]: unknown }>;
        resumeCron: (request: { jobId: string }) => Promise<{ job?: CronJobSummary; [key: string]: unknown }>;
        getKanbanBoard: (request?: { workspace?: string; board?: string }) => Promise<KanbanBoardResponse>;
        createKanbanTask: (request: {
          title: string;
          body?: string;
          status?: string;
          assignee?: string;
          tenant?: string;
          priority?: number | string;
        }) => Promise<{ task?: KanbanTaskSummary; [key: string]: unknown }>;
        updateKanbanTask: (request: {
          taskId: string;
          title?: string;
          body?: string;
          status?: string;
          assignee?: string;
          tenant?: string;
          priority?: number | string;
        }) => Promise<{ task?: KanbanTaskSummary; [key: string]: unknown }>;
        listSkills: () => Promise<Record<string, unknown>>;
        getSkillContent: (request: { path?: string; name?: string; file?: string }) => Promise<Record<string, unknown>>;
        saveSkill: (request: { path?: string; name?: string; category?: string; content: string }) => Promise<Record<string, unknown>>;
        deleteSkill: (request: { path?: string; name?: string }) => Promise<Record<string, unknown>>;
        listAgents: () => Promise<Record<string, unknown>>;
        getActivatedAgents: () => Promise<Record<string, unknown>>;
        getCurrentAgent: () => Promise<Record<string, unknown>>;
        setCurrentAgent: (request: { slug: string }) => Promise<Record<string, unknown>>;
        getAgentSplashStatus: () => Promise<Record<string, unknown>>;
        completeAgentSplash: (request: { activated?: string[] }) => Promise<Record<string, unknown>>;
        answerAgentSplashQuestion: (request: { answers?: unknown[] }) => Promise<Record<string, unknown>>;
        getAgentStats: () => Promise<Record<string, unknown>>;
        getAgentActivities: (request?: { limit?: number }) => Promise<Record<string, unknown>>;
        getAgentProfiles: () => Promise<Record<string, unknown>>;
        getAgentWorkspaces: () => Promise<Record<string, unknown>>;
        getAgent: (request: { slug: string }) => Promise<Record<string, unknown>>;
        getAgentMemory: (request: { slug: string }) => Promise<Record<string, unknown>>;
        getAgentSoul: (request: { slug: string }) => Promise<Record<string, unknown>>;
        saveAgentProfile: (request: { slug: string; profile: Record<string, unknown> }) => Promise<Record<string, unknown>>;
        activateAgent: (request: { slug: string }) => Promise<Record<string, unknown>>;
        listAgentSessions: (request: { slug: string }) => Promise<Record<string, unknown>>;
        getAgentSession: (request: { slug: string; sessionId: string }) => Promise<Record<string, unknown>>;
        startAgentChat: (request: { slug: string; sessionId?: string; message: string }) => Promise<Record<string, unknown>>;
        listAgentWorkspace: (request: { slug: string; sessionId?: string; path?: string }) => Promise<Record<string, unknown>>;
        startAgentWorkspaceProcess: (request: { slug: string; sessionId?: string }) => Promise<Record<string, unknown>>;
        sendAgentWorkspaceCommand: (request: { sessionId: string; command?: string }) => Promise<Record<string, unknown>>;
        stopAgentWorkspace: (request: { sessionId: string }) => Promise<Record<string, unknown>>;
        createAgent: (request: Record<string, unknown>) => Promise<Record<string, unknown>>;
        updateAgent: (request: { slug: string; patch: Record<string, unknown> }) => Promise<Record<string, unknown>>;
        deleteAgent: (request: { slug: string }) => Promise<Record<string, unknown>>;
        startAgentWorkspaceStream: (request: { sessionId: string }) => Promise<{ streamId: string }>;
        stopAgentWorkspaceStream: (request: { streamId: string }) => Promise<Record<string, unknown>>;
        onAgentWorkspaceEvent: (callback: (event: Record<string, unknown>) => void) => () => void;
        listProfiles: () => Promise<Record<string, unknown>>;
        switchProfile: (request: { name: string }) => Promise<Record<string, unknown>>;
        createProfile: (request: Record<string, unknown>) => Promise<Record<string, unknown>>;
        deleteProfile: (request: { name: string }) => Promise<Record<string, unknown>>;
        getMemory: () => Promise<Record<string, unknown>>;
        writeMemory: (request: { section: string; content: string }) => Promise<Record<string, unknown>>;
        getSupermemoryStatus: () => Promise<Record<string, unknown>>;
        listSupermemoryDocuments: () => Promise<Record<string, unknown>>;
        getSupermemoryDocument: (request: { id?: string }) => Promise<Record<string, unknown>>;
        searchSupermemory: (request: { query: string; limit?: number }) => Promise<Record<string, unknown>>;
        addSupermemoryDocument: (request: Record<string, unknown>) => Promise<Record<string, unknown>>;
        forgetSupermemoryDocument: (request: { id?: string }) => Promise<Record<string, unknown>>;
        hybridMemorySearch: (request: { query: string; limit?: number }) => Promise<Record<string, unknown>>;
        getInsights: (request?: { days?: number }) => Promise<Record<string, unknown>>;
        getWikiStatus: () => Promise<Record<string, unknown>>;
        getLogs: (request?: { file?: string; tail?: number }) => Promise<Record<string, unknown>>;
        listAppstore: (request?: { category?: string; query?: string; page?: string | number }) => Promise<Record<string, unknown>>;
        getAppstoreUpdates: () => Promise<Record<string, unknown>>;
        getAppstoreSdk: () => Promise<Record<string, unknown>>;
        installAppstoreApp: (request: { appId: string }) => Promise<Record<string, unknown>>;
        uninstallAppstoreApp: (request: { appId: string }) => Promise<Record<string, unknown>>;
        updateAllAppstore: () => Promise<Record<string, unknown>>;
        submitAppstoreApp: (request: { manifest: Record<string, unknown> }) => Promise<Record<string, unknown>>;
        getSettings: () => Promise<Record<string, unknown>>;
        saveSettings: (request: { settings: Record<string, unknown> }) => Promise<Record<string, unknown>>;
        listGmailAccounts: () => Promise<Record<string, unknown>>;
        listGmailMessages: (request?: { folder?: string; limit?: number; max?: number; account?: string }) => Promise<Record<string, unknown>>;
        readGmailMessage: (request: { id?: string; messageId?: string; threadId?: string; account?: string }) => Promise<Record<string, unknown>>;
        searchGmailMessages: (request: { query: string; max?: number }) => Promise<Record<string, unknown>>;
        listGmailFolders: () => Promise<Record<string, unknown>>;
        summarizeGmailThread: (request: { id?: string; messageId?: string; threadId?: string }) => Promise<Record<string, unknown>>;
        draftGmailReply: (request: { id?: string; messageId?: string; threadId?: string; instruction?: string; variants?: number }) => Promise<Record<string, unknown>>;
        getRelatedGmailMessages: (request: { id?: string; messageId?: string; threadId?: string }) => Promise<Record<string, unknown>>;
        sendGmailMessage: (request: Record<string, unknown>) => Promise<Record<string, unknown>>;
        deleteGmailMessage: (request: { id?: string; messageId?: string; threadId?: string }) => Promise<Record<string, unknown>>;
        moveGmailMessage: (request: { id?: string; messageId?: string; threadId?: string; folder: string }) => Promise<Record<string, unknown>>;
        createGmailTask: (request: { messageId?: string; threadId?: string; title?: string }) => Promise<Record<string, unknown>>;
        getDiscordGuild: () => Promise<Record<string, unknown>>;
        listDiscordChannels: () => Promise<Record<string, unknown>>;
        listDiscordRoles: () => Promise<Record<string, unknown>>;
        getDiscordStats: () => Promise<Record<string, unknown>>;
        getDiscordMember: (request: { userId: string }) => Promise<Record<string, unknown>>;
        getDiscordBotInfo: () => Promise<Record<string, unknown>>;
        getDiscordWarns: () => Promise<Record<string, unknown>>;
        listDiscordChannelsTree: () => Promise<Record<string, unknown>>;
        listDiscordMembers: (request?: { query?: string }) => Promise<Record<string, unknown>>;
        listDiscordMessages: (request: { channelId: string; limit?: number; before?: string }) => Promise<Record<string, unknown>>;
        sendDiscordMessage: (request: { channelId: string; content: string }) => Promise<Record<string, unknown>>;
        warnDiscordMember: (request: { memberId?: string; userId?: string; reason?: string }) => Promise<Record<string, unknown>>;
        timeoutDiscordMember: (request: { memberId?: string; userId?: string; minutes?: number; reason?: string }) => Promise<Record<string, unknown>>;
        kickDiscordMember: (request: { memberId?: string; userId?: string; reason?: string }) => Promise<Record<string, unknown>>;
        banDiscordMember: (request: { memberId?: string; userId?: string; reason?: string; deleteDays?: number }) => Promise<Record<string, unknown>>;
        purgeDiscordChannel: (request: { channelId: string; limit?: number; amount?: number }) => Promise<Record<string, unknown>>;
        untimeoutDiscordMember: (request: { memberId?: string; userId?: string }) => Promise<Record<string, unknown>>;
        unbanDiscordMember: (request: { memberId?: string; userId?: string }) => Promise<Record<string, unknown>>;
        configureDiscord: (request: { action: string; values?: Record<string, unknown> }) => Promise<Record<string, unknown>>;
        sendMessage: (request: {
          sessionId?: string | null;
          message: string;
          model?: string;
          modelProvider?: string | null;
          profile?: string;
        }) => Promise<{
          sessionId: string;
          streamId: string;
          assistantMessage: string;
          session: Record<string, unknown>;
        }>;
      };
      updates: {
        status: () => Promise<LastbrowserUpdateStatus>;
        check: () => Promise<LastbrowserUpdateStatus>;
        download: () => Promise<LastbrowserUpdateStatus>;
        install: () => Promise<LastbrowserUpdateStatus>;
        onStatus: (callback: (status: LastbrowserUpdateStatus) => void) => () => void;
      };
      window: {
        minimize: () => Promise<void>;
        toggleMaximize: () => Promise<boolean>;
        close: () => Promise<void>;
      };
    };
  }
}
