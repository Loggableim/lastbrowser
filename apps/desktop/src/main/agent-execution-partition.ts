import { createHash } from 'node:crypto';
import type { BrowserScope } from './independent-browser-host.js';

const prefix = 'persist:independent_agent_v1_';

/** A storage boundary derived from the existing Scope, never a second profile identity. */
export function computeAgentExecutionPartition(scope: BrowserScope): string {
  return prefix + createHash('sha256').update(JSON.stringify([
    scope.backendProfileId, scope.spaceId, scope.browserProfileId
  ])).digest('hex');
}

export function isAgentExecutionPartition(partition: string): boolean {
  return partition.startsWith(prefix) && /^[a-f0-9]{64}$/.test(partition.slice(prefix.length));
}

/** Renderer guests must never join the reserved execution storage namespace. */
export function isReservedAgentPartition(partition: unknown): boolean {
  return typeof partition === 'string' && partition.startsWith(prefix);
}
