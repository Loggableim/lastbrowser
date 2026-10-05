import type { IndependentScope } from './independent-contracts';
export type ChildRunStatus = 'queued' | 'running' | 'waiting_for_approval' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type ChildRunIdentity = Readonly<{ scope: IndependentScope; parentSessionId: string; parentTurnId: string; subagentId: string; parentSubagentId: string | null; childSessionId: string | null; depth: number; model: Readonly<{ provider: string; model: string }> }>;
export type ChildRunMessage = Readonly<{ id: string; role: string; content: string; at: string }>;
export type ChildRunSnapshot = ChildRunIdentity & Readonly<{ schemaVersion: 1; status: ChildRunStatus; revision: number; watermark: number; observedAt: string; messages: readonly ChildRunMessage[]; title?: string; truncated?: boolean; sourceActuality?: 'persisted' | 'partial' | 'unavailable' }>;
export type ChildRunEvent = ChildRunIdentity & Readonly<{ schemaVersion: 1; sequence: number; kind: 'started' | 'answer_delta' | 'tool' | 'status' | 'completed'; payload: Readonly<Record<string, unknown>>; at: string }>;
export type ChildRunBinding = Readonly<{ scope: IndependentScope; parentSessionId: string; parentTurnId: string }>;
