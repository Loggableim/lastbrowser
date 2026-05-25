import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type SetupState = {
  cloudSetupComplete: boolean;
  provider: string;
  model: string;
};

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
  return {
    cloudSetupComplete: data.cloudSetupComplete === true,
    provider: String(data.provider || '').trim(),
    model: String(data.model || '').trim()
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

export async function saveSetupState(userDataDir: string, state: SetupState): Promise<SetupState> {
  const normalized = normalizeSetupState(state);
  await mkdir(userDataDir, { recursive: true });
  await writeFile(setupStatePath(userDataDir), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}
