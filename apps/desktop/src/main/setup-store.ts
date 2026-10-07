import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type SetupState = {
  cloudSetupComplete: boolean;
  provider: string;
  model: string;
  botName?: string;
  personality?: string;
  aiChoice?: 'enabled' | 'disabled';
  browserSetupComplete?: boolean;
};

const saveQueues = new Map<string, Promise<void>>();

export const defaultSetupState: SetupState = {
  cloudSetupComplete: false,
  provider: '',
  model: ''
};

export function setupStatePath(userDataDir: string): string {
  return path.join(userDataDir, 'setup-state.json');
}

export function normalizeSetupState(raw: unknown): SetupState {
  if (!raw || typeof raw !== 'object') return defaultSetupState;
  const data = raw as Partial<SetupState>;
  const botName = typeof data.botName === 'string' ? data.botName.trim() : '';
  const personality = typeof data.personality === 'string' ? data.personality.trim() : '';
  const aiChoice = data.aiChoice === 'enabled' || data.aiChoice === 'disabled' ? data.aiChoice : undefined;
  const browserSetupComplete = typeof data.browserSetupComplete === 'boolean' ? data.browserSetupComplete : undefined;
  return {
    cloudSetupComplete: data.cloudSetupComplete === true,
    provider: String(data.provider || '').trim(),
    model: String(data.model || '').trim(),
    ...(botName ? { botName } : {}),
    ...(personality ? { personality } : {}),
    ...(aiChoice ? { aiChoice } : {}),
    ...(browserSetupComplete !== undefined ? { browserSetupComplete } : {})
  };
}

export async function loadSetupState(userDataDir: string): Promise<SetupState> {
  try {
    const raw = await readFile(setupStatePath(userDataDir), 'utf8');
    return normalizeSetupState(JSON.parse(raw));
  } catch {
    return defaultSetupState;
  }
}

export async function saveSetupState(userDataDir: string, state: Partial<SetupState>): Promise<SetupState> {
  if (state.aiChoice !== undefined && state.aiChoice !== 'enabled' && state.aiChoice !== 'disabled') {
    throw new TypeError('Invalid aiChoice in setup state.');
  }
  if (state.browserSetupComplete !== undefined && typeof state.browserSetupComplete !== 'boolean') {
    throw new TypeError('Invalid browserSetupComplete in setup state.');
  }

  const previousSave = saveQueues.get(userDataDir) ?? Promise.resolve();
  const save = previousSave.catch(() => undefined).then(async () => {
    const previous = await loadSetupState(userDataDir);
    const normalized = normalizeSetupState({
      ...previous,
      ...state,
      ...(state.cloudSetupComplete === undefined ? { cloudSetupComplete: previous.cloudSetupComplete } : {}),
      ...(state.provider === undefined ? { provider: previous.provider } : {}),
      ...(state.model === undefined ? { model: previous.model } : {}),
      ...(state.botName === undefined && previous.botName !== undefined ? { botName: previous.botName } : {}),
      ...(state.personality === undefined && previous.personality !== undefined ? { personality: previous.personality } : {}),
      ...(state.aiChoice === undefined && previous.aiChoice !== undefined ? { aiChoice: previous.aiChoice } : {}),
      ...(state.browserSetupComplete === undefined && previous.browserSetupComplete !== undefined
        ? { browserSetupComplete: previous.browserSetupComplete }
        : {})
    });
    await mkdir(userDataDir, { recursive: true });
    await writeFile(setupStatePath(userDataDir), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    return normalized;
  });
  const queueEntry = save.then(() => undefined, () => undefined);
  saveQueues.set(userDataDir, queueEntry);
  try {
    return await save;
  } finally {
    if (saveQueues.get(userDataDir) === queueEntry) saveQueues.delete(userDataDir);
  }
}
