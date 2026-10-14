import { isIndependentRecord, isIndependentScope } from './independent-assistant-client.js';
import { sameAssistantScope } from './independent-contracts.js';
import type { NativeChatBinding } from './native-chat-control.js';

export type MemoryUsageSource = { id: string; title: string; source: 'document' | 'memory' | 'user'; excerpt?: string; space_id?: string };
export type MemoryUsage = { schema_version: 1; sources: MemoryUsageSource[] };

export function normalizeMemoryUsage(value: unknown): MemoryUsage | null {
  if (!isIndependentRecord(value) || value.schema_version !== 1 || !Array.isArray(value.sources)) return null;
  const sources: MemoryUsageSource[] = [];
  const seen = new Set<string>();
  for (const entry of value.sources.slice(0, 20)) {
    if (!isIndependentRecord(entry) || typeof entry.id !== 'string' || !entry.id.trim() || entry.id.length > 256
      || typeof entry.title !== 'string' || !entry.title.trim() || entry.title.length > 300
      || !['document', 'memory', 'user'].includes(String(entry.source))) continue;
    const key = `${entry.source}:${entry.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({ id: entry.id, title: entry.title, source: entry.source as MemoryUsageSource['source'],
      ...(typeof entry.excerpt === 'string' ? { excerpt: entry.excerpt.slice(0, 1200) } : {}),
      ...(typeof entry.space_id === 'string' ? { space_id: entry.space_id.slice(0, 256) } : {}) });
  }
  return sources.length ? { schema_version: 1, sources } : null;
}

export function readMemoryUsageEvent(value: unknown, binding: NativeChatBinding | undefined): MemoryUsage | null {
  if (!binding || !isIndependentRecord(value) || value.event !== 'memory_usage' || value.streamId !== binding.streamId) return null;
  const context = value.nativeContext;
  if (!isIndependentRecord(context) || context.schemaVersion !== 1 || context.sessionId !== binding.sessionId
    || context.streamId !== binding.streamId || typeof context.writerGeneration !== 'string' || !context.writerGeneration
    || !isIndependentScope(context.scope) || !sameAssistantScope(context.scope, binding.scope)) return null;
  if (value.sessionId !== undefined && value.sessionId !== binding.sessionId) return null;
  return normalizeMemoryUsage(value.data);
}

export function attachMemoryUsage<T extends { role?: string; chatStreamId?: string; chatStreamSessionId?: string; memory_usage?: unknown }>(messages: T[], streamId: string, sessionId: string, usage: MemoryUsage): T[] {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === 'assistant' && message.chatStreamId === streamId && message.chatStreamSessionId === sessionId) {
      return messages.map((item, itemIndex) => itemIndex === index ? { ...item, memory_usage: usage } : item);
    }
  }
  return messages;
}
