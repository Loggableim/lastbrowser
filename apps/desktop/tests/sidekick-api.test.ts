import { describe, expect, it } from 'vitest';
import {
  addSupermemoryDocument,
  activateAgent,
  answerAgentSplashQuestion,
  applyCloudSetup,
  banDiscordMember,
  cancelChatStream,
  cancelOnboardingOAuth,
  addSpace,
  completeAgentSplash,
  configureDiscord,
  createAgent,
  createCron,
  createGmailTask,
  createKanbanTask,
  createProfile,
  createWorkspaceDirectory,
  createWorkspaceFile,
  createSidekickSession,
  deleteAgent,
  deleteCron,
  deleteGmailMessage,
  deleteProfile,
  deleteSkill,
  deleteSession,
  deleteWorkspaceEntry,
  duplicateSession,
  extractLastAssistantMessage,
  forgetSupermemoryDocument,
  getActivatedAgents,
  getAgent,
  getAgentActivities,
  getAgentMemory,
  getAgentProfiles,
  getAgentSession,
  getAgentSoul,
  getAgentSplashStatus,
  getAgentStats,
  getActiveDispatches,
  getAgentWorkspaces,
  getAppstoreSdk,
  getChatStreamStatus,
  getCurrentAgent,
  getDesktopSession,
  getDiscordBotInfo,
  getDiscordGuild,
  getDiscordMember,
  getDiscordStats,
  getDiscordWarns,
  getKanbanBoard,
  getLogs,
  getMemory,
  getSessionDraft,
  getSettings,
  getSkillContent,
  getSupermemoryStatus,
  getSupermemoryDocument,
  getWikiStatus,
  getInsights,
  getAppstoreUpdates,
  hybridMemorySearch,
  installAppstoreApp,
  kickDiscordMember,
  listAgentSessions,
  listAgentWorkspace,
  listAgents,
  listAppstore,
  listCrons,
  listDiscordChannels,
  listDiscordChannelsTree,
  listDiscordMembers,
  listDiscordMessages,
  listDiscordRoles,
  listGmailAccounts,
  listGmailFolders,
  listGmailMessages,
  listProfiles,
  listSkills,
  listSpaces,
  listSessions,
  listWorkspace,
  moveGmailMessage,
  pauseCron,
  pollOnboardingOAuth,
  purgeDiscordChannel,
  readWorkspaceFile,
  readGmailMessage,
  removeSpace,
  renameSpace,
  renameWorkspaceEntry,
  reorderSpaces,
  renameSession,
  runDispatchOnce,
  resumeCron,
  runCron,
  requestWebui,
  saveSettings,
  saveAgentProfile,
  saveSkill,
  saveSessionDraft,
  saveWorkspaceFile,
  searchGmailMessages,
  searchSupermemory,
  sendAgentWorkspaceCommand,
  sendDiscordMessage,
  sendGmailMessage,
  setCurrentAgent,
  setDefaultModel,
  startAgentChat,
  startAgentWorkspaceProcess,
  startSidekickChat,
  startOnboardingOAuth,
  stopAgentWorkspace,
  submitAppstoreApp,
  summarizeGmailThread,
  draftGmailReply,
  getRelatedGmailMessages,
  switchProfile,
  timeoutDiscordMember,
  uninstallAppstoreApp,
  unbanDiscordMember,
  untimeoutDiscordMember,
  updateAgent,
  updateAllAppstore,
  updateCron,
  updateKanbanTask,
  warnDiscordMember,
  writeMemory
} from '../src/main/sidekick-api.js';

describe('sidekick api client', () => {
  it('posts cloud setup using the existing onboarding API shape', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ system: { chat_ready: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };

    await applyCloudSetup(
      'http://127.0.0.1:8787',
      { provider: 'openrouter', model: 'openai/gpt-5.4-mini', apiKey: 'sk-test' },
      fetchImpl
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://127.0.0.1:8787/api/onboarding/setup');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      provider: 'openrouter',
      model: 'openai/gpt-5.4-mini',
      api_key: 'sk-test'
    });
  });

  it('falls back to bundled skills when the WebUI skill catalog is empty', async () => {
    const fetchImpl = async (url: string | URL) => {
      const href = String(url);
      if (href.endsWith('/api/skills')) {
        return new Response(JSON.stringify({ skills: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      throw new Error(`Unexpected fetch: ${href}`);
    };

    const payload = await listSkills('http://127.0.0.1:8787', fetchImpl);
    const skills = Array.isArray(payload.skills) ? payload.skills : [];

    expect(payload.source).toBe('bundled');
    expect(skills.length).toBeGreaterThan(10);
    expect(skills.some((skill: Record<string, unknown>) => String(skill.name || '').includes('kanban'))).toBe(true);
  });

  it('reads bundled skill content when the WebUI lookup is unavailable', async () => {
    const fetchImpl = async (url: string | URL) => {
      const href = String(url);
      if (href.includes('/api/skills/content')) {
        return new Response(JSON.stringify({ error: 'not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' }
        });
      }
      throw new Error(`Unexpected fetch: ${href}`);
    };

    const payload = await getSkillContent(
      'http://127.0.0.1:8787',
      { name: 'kanban-worker' },
      fetchImpl
    );

    expect(String(payload.content || '')).toContain('Kanban Worker');
    expect(String(payload.path || '')).toContain('services');
    expect(payload.source).toBe('bundled');
  });

  it('exposes the dispatcher endpoints used by Tasks and Kanban', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ active: [{ board: 'default' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };

    await runDispatchOnce('http://127.0.0.1:8787', { dryRun: true }, fetchImpl);
    await getActiveDispatches('http://127.0.0.1:8787', fetchImpl);

    expect(calls[0].url).toBe('http://127.0.0.1:8787/api/dispatch/run');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ dry_run: true });
    expect(calls[1].url).toBe('http://127.0.0.1:8787/api/dispatch/active');
    expect(calls[1].init?.method).toBeUndefined();
  });

  it('extracts the last non-empty assistant message from a completed session', () => {
    expect(extractLastAssistantMessage({
      messages: [
        { role: 'assistant', content: '' },
        { role: 'user', content: 'Question' },
        { role: 'assistant', content: 'Answer' }
      ]
    })).toBe('Answer');
  });

  it('starts the onboarding OAuth flow for OpenAI Codex', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        ok: true,
        provider: 'openai-codex',
        flow_id: 'flow-1',
        status: 'pending',
        verification_uri: 'https://auth.openai.com/codex/device',
        user_code: 'ABCD-EFGH',
        poll_interval_seconds: 5
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    const result = await startOnboardingOAuth('http://127.0.0.1:8787', 'openai-codex', fetchImpl);

    expect(result.flow_id).toBe('flow-1');
    expect(calls[0].url).toBe('http://127.0.0.1:8787/api/onboarding/oauth/start');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ provider: 'openai-codex' });
  });

  it('polls and cancels onboarding OAuth flows', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, provider: 'openai-codex', flow_id: 'flow-1', status: 'success' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };

    await pollOnboardingOAuth('http://127.0.0.1:8787', 'flow-1', fetchImpl);
    await cancelOnboardingOAuth('http://127.0.0.1:8787', 'flow-1', 'openai-codex', fetchImpl);

    expect(calls[0].url).toBe('http://127.0.0.1:8787/api/onboarding/oauth/poll?flow_id=flow-1');
    expect(calls[0].init?.method).toBeUndefined();
    expect(calls[1].url).toBe('http://127.0.0.1:8787/api/onboarding/oauth/cancel');
    expect(calls[1].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ flow_id: 'flow-1', provider: 'openai-codex' });
  });

  it('sets Codex as the default model using provider context', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, model: 'gpt-5.5' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };

    await setDefaultModel('http://127.0.0.1:8787', '@openai-codex:gpt-5.5', fetchImpl);

    expect(calls[0].url).toBe('http://127.0.0.1:8787/api/default-model');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ model: '@openai-codex:gpt-5.5' });
  });

  it('lists sessions through the existing WebUI sessions endpoint', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        sessions: [{ session_id: 's1', title: 'lernen mit camofox', workspace: 'C:/work' }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    const result = await listSessions('http://127.0.0.1:8787', fetchImpl);

    expect(result.sessions[0].session_id).toBe('s1');
    expect(calls[0].url).toBe('http://127.0.0.1:8787/api/sessions');
    expect(calls[0].init?.method).toBeUndefined();
  });

  it('lists spaces through the existing WebUI workspaces endpoint', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        workspaces: [{ path: 'C:/work/portfolio', name: 'portfolio' }],
        last: 'C:/work/portfolio'
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    const result = await listSpaces('http://127.0.0.1:8787', fetchImpl);

    expect(result.workspaces[0].path).toBe('C:/work/portfolio');
    expect(result.last).toBe('C:/work/portfolio');
    expect(calls[0].url).toBe('http://127.0.0.1:8787/api/workspaces');
    expect(calls[0].init?.method).toBeUndefined();
  });

  it('creates and loads sessions for the native left sidebar', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        session: { session_id: 's2', title: 'New chat', workspace: 'C:/work', messages: [] }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    await createSidekickSession('http://127.0.0.1:8787', { workspace: 'C:/work' }, fetchImpl);
    await getDesktopSession('http://127.0.0.1:8787', 's2', fetchImpl);

    expect(calls[0].url).toBe('http://127.0.0.1:8787/api/session/new');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ workspace: 'C:/work' });
    expect(calls[1].url).toBe('http://127.0.0.1:8787/api/session?session_id=s2&messages=1&resolve_model=0');
  });

  it('loads workspace tree entries and file previews for the native right panel', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const payload = calls.length === 1
        ? { path: '.', entries: [{ name: 'README.md', path: 'README.md', type: 'file', size: 123 }] }
        : { path: 'README.md', content: '# Lastbrowser', mime: 'text/markdown' };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };

    await listWorkspace('http://127.0.0.1:8787', { sessionId: 's2', path: '.' }, fetchImpl);
    await readWorkspaceFile('http://127.0.0.1:8787', { sessionId: 's2', path: 'README.md' }, fetchImpl);

    expect(calls[0].url).toBe('http://127.0.0.1:8787/api/list?session_id=s2&path=.');
    expect(calls[1].url).toBe('http://127.0.0.1:8787/api/file?session_id=s2&path=README.md');
  });

  it('writes workspace files and folders through native workspace commands', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, path: 'README.md' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };

    await createWorkspaceFile('http://127.0.0.1:8787', { sessionId: 's2', path: 'notes.md', content: '# Notes' }, fetchImpl);
    await saveWorkspaceFile('http://127.0.0.1:8787', { sessionId: 's2', path: 'notes.md', content: '# Updated' }, fetchImpl);
    await renameWorkspaceEntry('http://127.0.0.1:8787', { sessionId: 's2', path: 'notes.md', newName: 'README.md' }, fetchImpl);
    await createWorkspaceDirectory('http://127.0.0.1:8787', { sessionId: 's2', path: 'docs' }, fetchImpl);
    await deleteWorkspaceEntry('http://127.0.0.1:8787', { sessionId: 's2', path: 'docs', recursive: true }, fetchImpl);

    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:8787/api/file/create',
      'http://127.0.0.1:8787/api/file/save',
      'http://127.0.0.1:8787/api/file/rename',
      'http://127.0.0.1:8787/api/file/create-dir',
      'http://127.0.0.1:8787/api/file/delete'
    ]);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ session_id: 's2', path: 'notes.md', content: '# Notes' });
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ session_id: 's2', path: 'notes.md', content: '# Updated' });
    expect(JSON.parse(String(calls[2].init?.body))).toEqual({ session_id: 's2', path: 'notes.md', new_name: 'README.md' });
    expect(JSON.parse(String(calls[3].init?.body))).toEqual({ session_id: 's2', path: 'docs' });
    expect(JSON.parse(String(calls[4].init?.body))).toEqual({ session_id: 's2', path: 'docs', recursive: true });
  });

  it('adds, removes, renames, and reorders spaces through workspace management APIs', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        ok: true,
        workspaces: [{ path: 'C:/work/portfolio', name: 'Portfolio' }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    await addSpace('http://127.0.0.1:8787', { path: 'C:/work/portfolio', name: 'Portfolio', create: true }, fetchImpl);
    await renameSpace('http://127.0.0.1:8787', { path: 'C:/work/portfolio', name: 'Client work' }, fetchImpl);
    await reorderSpaces('http://127.0.0.1:8787', { paths: ['C:/work/portfolio', 'C:/work/default'] }, fetchImpl);
    await removeSpace('http://127.0.0.1:8787', { path: 'C:/work/portfolio' }, fetchImpl);

    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:8787/api/workspaces/add',
      'http://127.0.0.1:8787/api/workspaces/rename',
      'http://127.0.0.1:8787/api/workspaces/reorder',
      'http://127.0.0.1:8787/api/workspaces/remove'
    ]);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ path: 'C:/work/portfolio', name: 'Portfolio', create: true });
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ path: 'C:/work/portfolio', name: 'Client work' });
    expect(JSON.parse(String(calls[2].init?.body))).toEqual({ paths: ['C:/work/portfolio', 'C:/work/default'] });
    expect(JSON.parse(String(calls[3].init?.body))).toEqual({ path: 'C:/work/portfolio' });
  });

  it('uses existing cron endpoints for the native Tasks panel', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        ok: true,
        jobs: [{ id: 'job-1', name: 'Daily review', schedule_display: '0 9 * * *' }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    await listCrons('http://127.0.0.1:8787', fetchImpl);
    await createCron('http://127.0.0.1:8787', { name: 'Daily review', prompt: 'summarize', schedule: '0 9 * * *' }, fetchImpl);
    await updateCron('http://127.0.0.1:8787', { jobId: 'job-1', prompt: 'updated', schedule: '0 10 * * *' }, fetchImpl);
    await runCron('http://127.0.0.1:8787', { jobId: 'job-1' }, fetchImpl);
    await pauseCron('http://127.0.0.1:8787', { jobId: 'job-1' }, fetchImpl);
    await resumeCron('http://127.0.0.1:8787', { jobId: 'job-1' }, fetchImpl);
    await deleteCron('http://127.0.0.1:8787', { jobId: 'job-1' }, fetchImpl);

    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:8787/api/crons',
      'http://127.0.0.1:8787/api/crons/create',
      'http://127.0.0.1:8787/api/crons/update',
      'http://127.0.0.1:8787/api/crons/run',
      'http://127.0.0.1:8787/api/crons/pause',
      'http://127.0.0.1:8787/api/crons/resume',
      'http://127.0.0.1:8787/api/crons/delete'
    ]);
    expect(JSON.parse(String(calls[1].init?.body))).toMatchObject({
      name: 'Daily review',
      prompt: 'summarize',
      schedule: '0 9 * * *',
      deliver: 'local'
    });
    expect(JSON.parse(String(calls[2].init?.body))).toEqual({
      job_id: 'job-1',
      prompt: 'updated',
      schedule: '0 10 * * *'
    });
    expect(JSON.parse(String(calls[6].init?.body))).toEqual({ job_id: 'job-1' });
  });

  it('uses existing kanban endpoints for the native Kanban panel', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        columns: [{ name: 'ready', tasks: [{ id: 'T-1', title: 'Ship shell' }] }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    await getKanbanBoard('http://127.0.0.1:8787', { workspace: 'C:/work' }, fetchImpl);
    await createKanbanTask('http://127.0.0.1:8787', { title: 'Ship shell', body: 'Native board', status: 'ready', priority: 1 }, fetchImpl);
    await updateKanbanTask('http://127.0.0.1:8787', { taskId: 'T-1', status: 'done' }, fetchImpl);

    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:8787/api/kanban/board?workspace=C%3A%2Fwork',
      'http://127.0.0.1:8787/api/kanban/tasks',
      'http://127.0.0.1:8787/api/kanban/tasks/T-1'
    ]);
    expect(calls[2].init?.method).toBe('PATCH');
    expect(JSON.parse(String(calls[1].init?.body))).toMatchObject({
      title: 'Ship shell',
      body: 'Native board',
      status: 'ready',
      priority: 1
    });
    expect(JSON.parse(String(calls[2].init?.body))).toEqual({ status: 'done' });
  });

  it('renames, deletes, and duplicates sessions through native session commands', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        ok: true,
        session: { session_id: 's2', title: 'Renamed chat' }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    await renameSession('http://127.0.0.1:8787', { sessionId: 's2', title: 'Renamed chat' }, fetchImpl);
    await deleteSession('http://127.0.0.1:8787', { sessionId: 's2' }, fetchImpl);
    await duplicateSession('http://127.0.0.1:8787', { sessionId: 's2' }, fetchImpl);

    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:8787/api/session/rename',
      'http://127.0.0.1:8787/api/session/delete',
      'http://127.0.0.1:8787/api/session/duplicate'
    ]);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ session_id: 's2', title: 'Renamed chat' });
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ session_id: 's2' });
    expect(JSON.parse(String(calls[2].init?.body))).toEqual({ session_id: 's2' });
  });

  it('loads and saves composer drafts for the native composer', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, draft: { text: 'continue here', files: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };

    await getSessionDraft('http://127.0.0.1:8787', 's2', fetchImpl);
    await saveSessionDraft('http://127.0.0.1:8787', { sessionId: 's2', text: 'continue here', files: [] }, fetchImpl);

    expect(calls[0].url).toBe('http://127.0.0.1:8787/api/session/draft?session_id=s2');
    expect(calls[0].init?.method).toBeUndefined();
    expect(calls[1].url).toBe('http://127.0.0.1:8787/api/session/draft');
    expect(calls[1].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ session_id: 's2', text: 'continue here', files: [] });
  });

  it('starts, checks, and cancels chat streams for the native composer', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const payload = calls.length === 1
        ? { stream_id: 'stream-1', session_id: 's2' }
        : calls.length === 2
          ? { active: true, stream_id: 'stream-1' }
          : { ok: true, cancelled: true, stream_id: 'stream-1' };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };

    await startSidekickChat('http://127.0.0.1:8787', {
      sessionId: 's2',
      message: 'Hallo Sidekick',
      mode: 'plan',
      model: 'gpt-5.5',
      workspace: 'C:/work'
    }, fetchImpl);
    await getChatStreamStatus('http://127.0.0.1:8787', 'stream-1', fetchImpl);
    await cancelChatStream('http://127.0.0.1:8787', 'stream-1', fetchImpl);

    expect(calls[0].url).toBe('http://127.0.0.1:8787/api/chat/start');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      session_id: 's2',
      message: 'Hallo Sidekick',
      mode: 'plan',
      model: 'gpt-5.5',
      workspace: 'C:/work'
    });
    expect(calls[1].url).toBe('http://127.0.0.1:8787/api/chat/stream/status?stream_id=stream-1');
    expect(calls[2].url).toBe('http://127.0.0.1:8787/api/chat/cancel?stream_id=stream-1');
  });

  it('uses skills and profile APIs for native editor panels', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, skills: [], profiles: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };

    await listSkills('http://127.0.0.1:8787', fetchImpl);
    await getSkillContent('http://127.0.0.1:8787', { path: 'browser/SKILL.md' }, fetchImpl);
    await saveSkill('http://127.0.0.1:8787', { path: 'browser/SKILL.md', content: '# Skill' }, fetchImpl);
    await deleteSkill('http://127.0.0.1:8787', { path: 'browser/SKILL.md' }, fetchImpl);
    await listProfiles('http://127.0.0.1:8787', fetchImpl);
    await switchProfile('http://127.0.0.1:8787', { name: 'default' }, fetchImpl);
    await createProfile('http://127.0.0.1:8787', { name: 'research', model: 'gpt-5.5' }, fetchImpl);
    await deleteProfile('http://127.0.0.1:8787', { name: 'research' }, fetchImpl);

    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:8787/api/skills',
      'http://127.0.0.1:8787/api/skills/content?path=browser%2FSKILL.md',
      'http://127.0.0.1:8787/api/skills/save',
      'http://127.0.0.1:8787/api/skills/delete',
      'http://127.0.0.1:8787/api/profiles',
      'http://127.0.0.1:8787/api/profile/switch',
      'http://127.0.0.1:8787/api/profile/create',
      'http://127.0.0.1:8787/api/profile/delete'
    ]);
    expect(JSON.parse(String(calls[2].init?.body))).toEqual({ path: 'browser/SKILL.md', content: '# Skill' });
    expect(JSON.parse(String(calls[5].init?.body))).toEqual({ name: 'default' });
    expect(JSON.parse(String(calls[6].init?.body))).toEqual({ name: 'research', model: 'gpt-5.5' });
  });

  it('uses agents and workspace command APIs for native Agents', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, agents: [], sessions: [], events: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };

    await listAgents('http://127.0.0.1:8787', fetchImpl);
    await getActivatedAgents('http://127.0.0.1:8787', fetchImpl);
    await getCurrentAgent('http://127.0.0.1:8787', fetchImpl);
    await getAgent('http://127.0.0.1:8787', { slug: 'researcher' }, fetchImpl);
    await listAgentSessions('http://127.0.0.1:8787', { slug: 'researcher' }, fetchImpl);
    await getAgentSession('http://127.0.0.1:8787', { slug: 'researcher', sessionId: 'a1' }, fetchImpl);
    await startAgentChat('http://127.0.0.1:8787', { slug: 'researcher', sessionId: 'a1', message: 'hello' }, fetchImpl);
    await listAgentWorkspace('http://127.0.0.1:8787', { slug: 'researcher', sessionId: 'a1', path: '.' }, fetchImpl);
    await startAgentWorkspaceProcess('http://127.0.0.1:8787', { slug: 'researcher', sessionId: 'a1' }, fetchImpl);
    await sendAgentWorkspaceCommand('http://127.0.0.1:8787', { sessionId: 'a1', command: 'npm test' }, fetchImpl);
    await stopAgentWorkspace('http://127.0.0.1:8787', { sessionId: 'a1' }, fetchImpl);
    await createAgent('http://127.0.0.1:8787', { slug: 'researcher', name: 'Researcher' }, fetchImpl);
    await updateAgent('http://127.0.0.1:8787', { slug: 'researcher', patch: { name: 'Lead Researcher' } }, fetchImpl);
    await deleteAgent('http://127.0.0.1:8787', { slug: 'researcher' }, fetchImpl);

    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:8787/api/agents/list',
      'http://127.0.0.1:8787/api/agents/activated',
      'http://127.0.0.1:8787/api/agents/current',
      'http://127.0.0.1:8787/api/agents/researcher',
      'http://127.0.0.1:8787/api/agents/researcher/sessions',
      'http://127.0.0.1:8787/api/agents/researcher/sessions/a1',
      'http://127.0.0.1:8787/api/agents/researcher/chat',
      'http://127.0.0.1:8787/api/agents/researcher/workspace?session_id=a1&path=.',
      'http://127.0.0.1:8787/api/agents/researcher/workspace/process',
      'http://127.0.0.1:8787/api/agents/workspace/a1/command',
      'http://127.0.0.1:8787/api/agents/workspace/a1/stop',
      'http://127.0.0.1:8787/api/agents/create',
      'http://127.0.0.1:8787/api/agents/researcher',
      'http://127.0.0.1:8787/api/agents/researcher'
    ]);
    expect(calls[12].init?.method).toBe('PATCH');
    expect(calls[13].init?.method).toBe('DELETE');
    expect(JSON.parse(String(calls[6].init?.body))).toEqual({ session_id: 'a1', message: 'hello' });
    expect(JSON.parse(String(calls[9].init?.body))).toEqual({ command: 'npm test' });
  });

  it('uses memory, insights, logs, appstore, and settings APIs for native panels', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, entries: [], apps: [], settings: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };

    await getMemory('http://127.0.0.1:8787', fetchImpl);
    await writeMemory('http://127.0.0.1:8787', { section: 'memory', content: 'remember this' }, fetchImpl);
    await getSupermemoryStatus('http://127.0.0.1:8787', fetchImpl);
    await searchSupermemory('http://127.0.0.1:8787', { query: 'browser', limit: 5 }, fetchImpl);
    await addSupermemoryDocument('http://127.0.0.1:8787', { title: 'Doc', content: 'Text' }, fetchImpl);
    await forgetSupermemoryDocument('http://127.0.0.1:8787', { id: 'doc-1' }, fetchImpl);
    await hybridMemorySearch('http://127.0.0.1:8787', { query: 'browser' }, fetchImpl);
    await getInsights('http://127.0.0.1:8787', { days: 14 }, fetchImpl);
    await getWikiStatus('http://127.0.0.1:8787', fetchImpl);
    await getLogs('http://127.0.0.1:8787', { file: 'agent', tail: 200 }, fetchImpl);
    await listAppstore('http://127.0.0.1:8787', { category: 'browser' }, fetchImpl);
    await getAppstoreUpdates('http://127.0.0.1:8787', fetchImpl);
    await getAppstoreSdk('http://127.0.0.1:8787', fetchImpl);
    await installAppstoreApp('http://127.0.0.1:8787', { appId: 'gmail' }, fetchImpl);
    await uninstallAppstoreApp('http://127.0.0.1:8787', { appId: 'gmail' }, fetchImpl);
    await updateAllAppstore('http://127.0.0.1:8787', fetchImpl);
    await submitAppstoreApp('http://127.0.0.1:8787', { manifest: { name: 'Tool' } }, fetchImpl);
    await getSettings('http://127.0.0.1:8787', fetchImpl);
    await saveSettings('http://127.0.0.1:8787', { settings: { theme: 'dark' } }, fetchImpl);

    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:8787/api/memory',
      'http://127.0.0.1:8787/api/memory/write',
      'http://127.0.0.1:8787/api/memory/supermemory/status',
      'http://127.0.0.1:8787/api/memory/supermemory/search',
      'http://127.0.0.1:8787/api/memory/supermemory/add',
      'http://127.0.0.1:8787/api/memory/supermemory/forget',
      'http://127.0.0.1:8787/api/memory/hybrid/search',
      'http://127.0.0.1:8787/api/insights?days=14',
      'http://127.0.0.1:8787/api/wiki/status',
      'http://127.0.0.1:8787/api/logs?file=agent&tail=200',
      'http://127.0.0.1:8787/api/appstore?category=browser',
      'http://127.0.0.1:8787/api/appstore/updates',
      'http://127.0.0.1:8787/api/appstore/sdk',
      'http://127.0.0.1:8787/api/appstore/install',
      'http://127.0.0.1:8787/api/appstore/uninstall',
      'http://127.0.0.1:8787/api/appstore/update-all',
      'http://127.0.0.1:8787/api/appstore/submit',
      'http://127.0.0.1:8787/api/settings',
      'http://127.0.0.1:8787/api/settings'
    ]);
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ section: 'memory', content: 'remember this' });
    expect(JSON.parse(String(calls[13].init?.body))).toEqual({ app_id: 'gmail' });
    expect(calls[18].init?.method).toBe('POST');
  });

  it('uses Gmail and Discord integration APIs for native panels', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, messages: [], channels: [], members: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };

    await listGmailAccounts('http://127.0.0.1:8787', fetchImpl);
    await listGmailMessages('http://127.0.0.1:8787', { folder: 'inbox', limit: 25 }, fetchImpl);
    await readGmailMessage('http://127.0.0.1:8787', { messageId: 'm1' }, fetchImpl);
    await searchGmailMessages('http://127.0.0.1:8787', { query: 'from:openai' }, fetchImpl);
    await listGmailFolders('http://127.0.0.1:8787', fetchImpl);
    await summarizeGmailThread('http://127.0.0.1:8787', { threadId: 't1' }, fetchImpl);
    await draftGmailReply('http://127.0.0.1:8787', { threadId: 't1', instruction: 'short' }, fetchImpl);
    await getRelatedGmailMessages('http://127.0.0.1:8787', { messageId: 'm1' }, fetchImpl);
    await sendGmailMessage('http://127.0.0.1:8787', { to: 'a@example.com', subject: 'Hi', body: 'Text' }, fetchImpl);
    await deleteGmailMessage('http://127.0.0.1:8787', { messageId: 'm1' }, fetchImpl);
    await moveGmailMessage('http://127.0.0.1:8787', { messageId: 'm1', folder: 'archive' }, fetchImpl);
    await createGmailTask('http://127.0.0.1:8787', { messageId: 'm1', title: 'Follow up' }, fetchImpl);
    await getDiscordGuild('http://127.0.0.1:8787', fetchImpl);
    await listDiscordChannels('http://127.0.0.1:8787', fetchImpl);
    await listDiscordMembers('http://127.0.0.1:8787', { query: 'dominik' }, fetchImpl);
    await listDiscordMessages('http://127.0.0.1:8787', { channelId: 'c1', limit: 50 }, fetchImpl);
    await sendDiscordMessage('http://127.0.0.1:8787', { channelId: 'c1', content: 'hello' }, fetchImpl);
    await warnDiscordMember('http://127.0.0.1:8787', { memberId: 'u1', reason: 'spam' }, fetchImpl);
    await timeoutDiscordMember('http://127.0.0.1:8787', { memberId: 'u1', minutes: 10, reason: 'spam' }, fetchImpl);
    await kickDiscordMember('http://127.0.0.1:8787', { memberId: 'u1', reason: 'spam' }, fetchImpl);
    await banDiscordMember('http://127.0.0.1:8787', { memberId: 'u1', reason: 'spam' }, fetchImpl);
    await purgeDiscordChannel('http://127.0.0.1:8787', { channelId: 'c1', limit: 10 }, fetchImpl);

    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:8787/api/gmail/accounts',
      'http://127.0.0.1:8787/api/gmail/list?folder=inbox&limit=25',
      'http://127.0.0.1:8787/api/gmail/read?message_id=m1',
      'http://127.0.0.1:8787/api/gmail/search?q=from%3Aopenai',
      'http://127.0.0.1:8787/api/gmail/folders',
      'http://127.0.0.1:8787/api/gmail/ai/summary',
      'http://127.0.0.1:8787/api/gmail/ai/draft',
      'http://127.0.0.1:8787/api/gmail/ai/related?message_id=m1',
      'http://127.0.0.1:8787/api/gmail/send',
      'http://127.0.0.1:8787/api/gmail/delete',
      'http://127.0.0.1:8787/api/gmail/move',
      'http://127.0.0.1:8787/api/gmail/ai/task',
      'http://127.0.0.1:8787/api/discord/guild',
      'http://127.0.0.1:8787/api/discord/channels',
      'http://127.0.0.1:8787/api/discord/members?q=dominik',
      'http://127.0.0.1:8787/api/discord/channel/c1/messages?limit=50',
      'http://127.0.0.1:8787/api/discord/send',
      'http://127.0.0.1:8787/api/discord/warn',
      'http://127.0.0.1:8787/api/discord/timeout',
      'http://127.0.0.1:8787/api/discord/kick',
      'http://127.0.0.1:8787/api/discord/ban',
      'http://127.0.0.1:8787/api/discord/purge'
    ]);
    expect(JSON.parse(String(calls[16].init?.body))).toEqual({ channel_id: 'c1', content: 'hello' });
    expect(JSON.parse(String(calls[18].init?.body))).toEqual({ member_id: 'u1', minutes: 10, reason: 'spam' });
  });

  it('matches WebUI-native Skills, Agents, and Memory endpoints beyond the shallow panel subset', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, agents: [], activities: [], stats: {}, document: { id: 'doc-1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };

    await getSkillContent('http://127.0.0.1:8787', { name: 'browser', file: 'references/usage.md' }, fetchImpl);
    await saveSkill('http://127.0.0.1:8787', { name: 'browser', category: 'Browsing', content: '# Browser' }, fetchImpl);
    await deleteSkill('http://127.0.0.1:8787', { name: 'browser' }, fetchImpl);
    await getAgentSplashStatus('http://127.0.0.1:8787', fetchImpl);
    await completeAgentSplash('http://127.0.0.1:8787', { activated: ['researcher'] }, fetchImpl);
    await answerAgentSplashQuestion('http://127.0.0.1:8787', { answers: [{ key: 'goal', value: 'research' }] }, fetchImpl);
    await setCurrentAgent('http://127.0.0.1:8787', { slug: 'researcher' }, fetchImpl);
    await activateAgent('http://127.0.0.1:8787', { slug: 'researcher' }, fetchImpl);
    await getAgentStats('http://127.0.0.1:8787', fetchImpl);
    await getAgentActivities('http://127.0.0.1:8787', { limit: 50 }, fetchImpl);
    await getAgentProfiles('http://127.0.0.1:8787', fetchImpl);
    await getAgentWorkspaces('http://127.0.0.1:8787', fetchImpl);
    await getAgentMemory('http://127.0.0.1:8787', { slug: 'researcher' }, fetchImpl);
    await getAgentSoul('http://127.0.0.1:8787', { slug: 'researcher' }, fetchImpl);
    await saveAgentProfile('http://127.0.0.1:8787', { slug: 'researcher', profile: { tone: 'calm' } }, fetchImpl);
    await getSupermemoryDocument('http://127.0.0.1:8787', { id: 'doc-1' }, fetchImpl);

    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:8787/api/skills/content?name=browser&file=references%2Fusage.md',
      'http://127.0.0.1:8787/api/skills/save',
      'http://127.0.0.1:8787/api/skills/delete',
      'http://127.0.0.1:8787/api/agents/splash/status',
      'http://127.0.0.1:8787/api/agents/splash/complete',
      'http://127.0.0.1:8787/api/agents/splash/question',
      'http://127.0.0.1:8787/api/agents/current',
      'http://127.0.0.1:8787/api/agents/researcher/activate',
      'http://127.0.0.1:8787/api/agents/stats',
      'http://127.0.0.1:8787/api/agents/activities?limit=50',
      'http://127.0.0.1:8787/api/agents/profiles',
      'http://127.0.0.1:8787/api/agents/workspaces',
      'http://127.0.0.1:8787/api/agents/researcher/memory',
      'http://127.0.0.1:8787/api/agents/researcher/soul',
      'http://127.0.0.1:8787/api/agents/researcher/profile',
      'http://127.0.0.1:8787/api/memory/supermemory/document?id=doc-1'
    ]);
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ name: 'browser', category: 'Browsing', content: '# Browser' });
    expect(JSON.parse(String(calls[2].init?.body))).toEqual({ name: 'browser' });
    expect(JSON.parse(String(calls[4].init?.body))).toEqual({ activated: ['researcher'] });
    expect(JSON.parse(String(calls[6].init?.body))).toEqual({ slug: 'researcher' });
    expect(JSON.parse(String(calls[14].init?.body))).toEqual({ profile: { tone: 'calm' } });
  });

  it('matches WebUI-native Gmail and Discord advanced endpoint shapes', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, roles: [], warns: [], channels: [], messages: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };

    await listGmailMessages('http://127.0.0.1:8787', { folder: 'inbox', max: 25, account: 'primary' }, fetchImpl);
    await readGmailMessage('http://127.0.0.1:8787', { id: 'm1', account: 'primary' }, fetchImpl);
    await searchGmailMessages('http://127.0.0.1:8787', { query: 'from:openai', max: 25 }, fetchImpl);
    await draftGmailReply('http://127.0.0.1:8787', { id: 'm1', variants: 3, instruction: 'short' }, fetchImpl);
    await getRelatedGmailMessages('http://127.0.0.1:8787', { id: 'm1' }, fetchImpl);
    await listDiscordRoles('http://127.0.0.1:8787', fetchImpl);
    await getDiscordStats('http://127.0.0.1:8787', fetchImpl);
    await getDiscordMember('http://127.0.0.1:8787', { userId: 'u1' }, fetchImpl);
    await getDiscordBotInfo('http://127.0.0.1:8787', fetchImpl);
    await getDiscordWarns('http://127.0.0.1:8787', fetchImpl);
    await listDiscordChannelsTree('http://127.0.0.1:8787', fetchImpl);
    await listDiscordMessages('http://127.0.0.1:8787', { channelId: 'c1', limit: 50, before: 'm0' }, fetchImpl);
    await warnDiscordMember('http://127.0.0.1:8787', { userId: 'u1', reason: 'spam' }, fetchImpl);
    await timeoutDiscordMember('http://127.0.0.1:8787', { userId: 'u1', minutes: 10, reason: 'spam' }, fetchImpl);
    await kickDiscordMember('http://127.0.0.1:8787', { userId: 'u1', reason: 'spam' }, fetchImpl);
    await banDiscordMember('http://127.0.0.1:8787', { userId: 'u1', reason: 'spam', deleteDays: 1 }, fetchImpl);
    await untimeoutDiscordMember('http://127.0.0.1:8787', { userId: 'u1' }, fetchImpl);
    await unbanDiscordMember('http://127.0.0.1:8787', { userId: 'u1' }, fetchImpl);
    await purgeDiscordChannel('http://127.0.0.1:8787', { channelId: 'c1', amount: 10 }, fetchImpl);
    await configureDiscord('http://127.0.0.1:8787', { action: 'save', values: { auto_mod_enabled: true } }, fetchImpl);

    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:8787/api/gmail/list?folder=inbox&max=25&account=primary',
      'http://127.0.0.1:8787/api/gmail/read?id=m1&account=primary',
      'http://127.0.0.1:8787/api/gmail/search?query=from%3Aopenai&max=25',
      'http://127.0.0.1:8787/api/gmail/ai/draft',
      'http://127.0.0.1:8787/api/gmail/ai/related?id=m1',
      'http://127.0.0.1:8787/api/discord/roles',
      'http://127.0.0.1:8787/api/discord/stats',
      'http://127.0.0.1:8787/api/discord/member/u1',
      'http://127.0.0.1:8787/api/discord/bot/info',
      'http://127.0.0.1:8787/api/discord/warns',
      'http://127.0.0.1:8787/api/discord/channels/tree',
      'http://127.0.0.1:8787/api/discord/channel/c1/messages?limit=50&before=m0',
      'http://127.0.0.1:8787/api/discord/warn',
      'http://127.0.0.1:8787/api/discord/timeout',
      'http://127.0.0.1:8787/api/discord/kick',
      'http://127.0.0.1:8787/api/discord/ban',
      'http://127.0.0.1:8787/api/discord/untimeout',
      'http://127.0.0.1:8787/api/discord/unban',
      'http://127.0.0.1:8787/api/discord/purge',
      'http://127.0.0.1:8787/api/discord/config'
    ]);
    expect(JSON.parse(String(calls[3].init?.body))).toEqual({ id: 'm1', variants: 3, instruction: 'short' });
    expect(JSON.parse(String(calls[12].init?.body))).toEqual({ user_id: 'u1', reason: 'spam' });
    expect(JSON.parse(String(calls[15].init?.body))).toEqual({ user_id: 'u1', reason: 'spam', delete_days: 1 });
    expect(JSON.parse(String(calls[18].init?.body))).toEqual({ channel_id: 'c1', amount: 10 });
    expect(JSON.parse(String(calls[19].init?.body))).toEqual({ action: 'save', values: { auto_mod_enabled: true } });
  });

  it('provides a safe generic bridge for WebUI endpoints not yet specialized', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, result: 'done' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };

    await requestWebui('http://127.0.0.1:8787', {
      method: 'GET',
      path: '/api/session/export',
      query: { session_id: 's1' }
    }, fetchImpl);
    await requestWebui('http://127.0.0.1:8787', {
      method: 'POST',
      path: '/api/session/branch',
      body: { session_id: 's1', message_index: 2 }
    }, fetchImpl);

    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:8787/api/session/export?session_id=s1',
      'http://127.0.0.1:8787/api/session/branch'
    ]);
    expect(calls[0].init?.method).toBe('GET');
    expect(calls[1].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ session_id: 's1', message_index: 2 });

    await expect(requestWebui('http://127.0.0.1:8787', { path: 'https://example.com/api/session' }, fetchImpl))
      .rejects.toThrow('Only local WebUI API paths are allowed');
    await expect(requestWebui('http://127.0.0.1:8787', { path: '/admin' }, fetchImpl))
      .rejects.toThrow('Only local WebUI API paths are allowed');
  });
});
