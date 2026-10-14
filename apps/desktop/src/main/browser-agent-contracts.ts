import { createHash } from 'node:crypto';

export const AGENT_BROWSER_SCHEMA_VERSION = 2;
export const AGENT_BROWSER_SNAPSHOT_TTL_MS = 30_000;
export const AGENT_BROWSER_MAX_ELEMENTS = 300;
export const AGENT_BROWSER_MAX_FRAMES = 100;
export const AGENT_BROWSER_MAX_TEXT_BYTES = 256 * 1024;
export const AGENT_BROWSER_MAX_NAME_CHARS = 256;

const EXPECTATIONS = new Set(['navigation', 'element_visible', 'element_hidden', 'dialog_open', 'text_changed']);

export type AgentBrowserCapabilities = {
  schemaVersion: 2;
  enabled: boolean;
  operations: readonly string[];
  frames: {
    sameOrigin: false;
    crossOrigin: false;
    openShadow: false;
    closedShadow: 'closed_shadow_unsupported';
  };
  limits: {
    snapshotTtlMs: number;
    maxElements: number;
    maxFrames: number;
    maxTextBytes: number;
    maxNameChars: number;
  };
};

export class AgentBrowserContractError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'AgentBrowserContractError';
  }
}

/** Recursive canonical JSON matching Python canonical_json for plain objects. */
export function canonicalAgentJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new AgentBrowserContractError('invalid_number', 'Numbers must be finite');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(item => canonicalAgentJson(item)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalAgentJson(item)}`).join(',')}}`;
  }
  throw new AgentBrowserContractError('invalid_value', 'Unsupported contract value');
}

export function agentActionDigest(action: unknown): string {
  const validated = validateAgentBrowserAction(action);
  return createHash('sha256').update(canonicalAgentJson(validated)).digest('hex');
}

export function agentBrowserCapabilities(env: NodeJS.ProcessEnv = process.env): AgentBrowserCapabilities {
  return {
    schemaVersion: AGENT_BROWSER_SCHEMA_VERSION,
    enabled: env.LASTBROWSER_AGENT_BROWSER_V2 === '1',
    operations: [],
    frames: { sameOrigin: false, crossOrigin: false, openShadow: false, closedShadow: 'closed_shadow_unsupported' },
    limits: {
      snapshotTtlMs: AGENT_BROWSER_SNAPSHOT_TTL_MS,
      maxElements: AGENT_BROWSER_MAX_ELEMENTS,
      maxFrames: AGENT_BROWSER_MAX_FRAMES,
      maxTextBytes: AGENT_BROWSER_MAX_TEXT_BYTES,
      maxNameChars: AGENT_BROWSER_MAX_NAME_CHARS
    }
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AgentBrowserContractError('invalid_action', 'Action must be an object');
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new AgentBrowserContractError('unknown_field', `Unknown field ${key}`);
  }
}

function opaqueId(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(value))
    throw new AgentBrowserContractError(code, 'Identifier is not an opaque contract id');
  return value;
}

export function validateAgentBrowserAction(value: unknown): Record<string, unknown> {
  const action = record(value);
  if (action.schemaVersion !== AGENT_BROWSER_SCHEMA_VERSION)
    throw new AgentBrowserContractError('unsupported_version', 'Agent browser actions use schema version 2');
  if (typeof action.kind !== 'string') throw new AgentBrowserContractError('unknown_operation', 'Missing action kind');
  if (action.kind === 'agent_browser_observe') {
    exactKeys(action, ['schemaVersion', 'kind', 'includeElements', 'includeFrames', 'includeScreenshot']);
    for (const key of ['includeElements', 'includeFrames', 'includeScreenshot'])
      if (typeof action[key] !== 'boolean') throw new AgentBrowserContractError('invalid_flag', 'Observe flags must be booleans');
    return action;
  }
  if (action.kind === 'agent_browser_click') {
    exactKeys(action, ['schemaVersion', 'kind', 'snapshotId', 'elementRef', 'expectation']);
    opaqueId(action.snapshotId, 'invalid_snapshot');
    opaqueId(action.elementRef, 'invalid_element');
    if (action.expectation !== undefined) validateExpectation(action.expectation);
    return action;
  }
  if (action.kind === 'agent_browser_fill') {
    exactKeys(action, ['schemaVersion', 'kind', 'snapshotId', 'elementRef', 'text', 'clear']);
    opaqueId(action.snapshotId, 'invalid_snapshot');
    opaqueId(action.elementRef, 'invalid_element');
    if (typeof action.text !== 'string' || action.text.length > 8192)
      throw new AgentBrowserContractError('invalid_text', 'Fill text is invalid');
    if (typeof action.clear !== 'boolean') throw new AgentBrowserContractError('invalid_flag', 'Clear must be a boolean');
    return action;
  }
  throw new AgentBrowserContractError('unknown_operation', 'Operation is not offered');
}

function validateExpectation(value: unknown): void {
  const expectation = record(value);
  exactKeys(expectation, ['kind']);
  if (typeof expectation.kind !== 'string' || !EXPECTATIONS.has(expectation.kind))
    throw new AgentBrowserContractError('invalid_expectation', 'Expectation is not in the fixed set');
}

export function redactAgentActionForTrace(value: unknown): Record<string, unknown> {
  const action = validateAgentBrowserAction(value);
  if (action.kind !== 'agent_browser_fill') return action;
  return { ...action, text: '' };
}
