export type ComposerEnterAction = 'send' | 'queue' | 'ignore';

export function composerEnterAction(input: {
  ready: boolean;
  text: string;
  running: boolean;
  busy: boolean;
  sendBlocked: boolean;
}): ComposerEnterAction {
  if (!input.ready || !input.text.trim()) return 'ignore';
  if (input.running || input.busy) return 'queue';
  if (input.sendBlocked) return 'ignore';
  return 'send';
}

export type ComposerQueueMessage = {
  text: string;
  model?: string;
  profile?: string;
  reasoningEffort?: string;
};

export type SessionQueues = Record<string, ComposerQueueMessage[]>;

export function sessionQueue(store: SessionQueues, sessionId: string | null | undefined): ComposerQueueMessage[] {
  const key = sessionId?.trim();
  if (!key) return [];
  return store[key] ?? [];
}

export function enqueueSessionMessage(
  store: SessionQueues,
  sessionId: string | null | undefined,
  message: ComposerQueueMessage,
): SessionQueues | null {
  const key = sessionId?.trim();
  const text = message.text;
  if (!key || !text.trim()) return null;
  return { ...store, [key]: [...(store[key] ?? []), { ...message, text }] };
}

export function dequeueSessionMessage(
  store: SessionQueues,
  sessionId: string | null | undefined,
): { store: SessionQueues; message?: ComposerQueueMessage } {
  const key = sessionId?.trim();
  if (!key) return { store };
  const list = store[key] ?? [];
  if (!list.length) return { store };
  const [message, ...rest] = list;
  const next = { ...store };
  if (rest.length) next[key] = rest;
  else delete next[key];
  return { store: next, message };
}

export function removeSessionMessage(
  store: SessionQueues,
  sessionId: string | null | undefined,
  index: number,
): SessionQueues {
  const key = sessionId?.trim();
  if (!key) return store;
  const list = store[key] ?? [];
  if (index < 0 || index >= list.length) return store;
  const nextList = list.filter((_, itemIndex) => itemIndex !== index);
  const next = { ...store };
  if (nextList.length) next[key] = nextList;
  else delete next[key];
  return next;
}
