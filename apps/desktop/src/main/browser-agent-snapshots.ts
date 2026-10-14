import { createHash, randomBytes } from 'node:crypto';
import {
  AGENT_BROWSER_MAX_ELEMENTS,
  AGENT_BROWSER_MAX_FRAMES,
  AGENT_BROWSER_MAX_NAME_CHARS,
  AGENT_BROWSER_MAX_TEXT_BYTES,
  AGENT_BROWSER_SNAPSHOT_TTL_MS
} from './browser-agent-contracts.js';

export type AgentSnapshotIdentity = {
  leaseId: string;
  targetId: string;
  mainGeneration: string;
  runnerGeneration: string;
  navigationEpoch: number;
  permissionEpoch: number;
  frameId: string;
  documentId: string;
};

export type AgentSnapshotElementInput = {
  backendNodeId: number;
  frameRef: string;
  role: string;
  name: string;
  tag: string;
  visible: boolean;
  enabled: boolean;
  rectCssPx: { x: number; y: number; width: number; height: number };
};

export type AgentSnapshotElement = AgentSnapshotElementInput & {
  elementRef: string;
  displayNumber: number;
  fingerprint: string;
  nameTruncated: boolean;
};

export type AgentSnapshot = {
  schemaVersion: 2;
  snapshotId: string;
  leaseId: string;
  observedAt: string;
  expiresAt: string;
  identity: AgentSnapshotIdentity;
  elements: AgentSnapshotElement[];
  truncated: boolean;
  truncatedReason?: 'element_budget' | 'text_budget' | 'name_limit';
};

export type AgentResolveResult =
  | { ok: true; element: AgentSnapshotElement }
  | { ok: false; code: 'stale_snapshot' | 'element_missing' | 'element_replaced' };

type StoredSnapshot = AgentSnapshot & { expiresAtMs: number };

export class BrowserAgentSnapshotRegistry {
  private readonly current = new Map<string, StoredSnapshot>();
  constructor(private readonly options: { now?: () => number; ttlMs?: number } = {}) {}

  observe(identity: AgentSnapshotIdentity, elements: readonly AgentSnapshotElementInput[]): AgentSnapshot {
    const now = this.options.now?.() ?? Date.now();
    const ttl = this.options.ttlMs ?? AGENT_BROWSER_SNAPSHOT_TTL_MS;
    const limited = elements.slice(0, AGENT_BROWSER_MAX_ELEMENTS);
    const projected = limited.map((element, index) => this.bindElement(element, index + 1));
    let truncated = elements.length > AGENT_BROWSER_MAX_ELEMENTS;
    let truncatedReason: AgentSnapshot['truncatedReason'] = truncated ? 'element_budget' : undefined;
    if (projected.some(element => element.nameTruncated)) {
      truncated = true;
      truncatedReason = truncatedReason ?? 'name_limit';
    }
    const frameCount = new Set(projected.map(element => element.frameRef)).size;
    if (frameCount > AGENT_BROWSER_MAX_FRAMES) {
      throw new Error('frame_budget');
    }
    const snapshotId = randomBytes(16).toString('hex');
    const snapshot: StoredSnapshot = {
      schemaVersion: 2,
      snapshotId,
      leaseId: identity.leaseId,
      observedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttl).toISOString(),
      expiresAtMs: now + ttl,
      identity: { ...identity },
      elements: projected,
      truncated,
      truncatedReason
    };
    const encoded = Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
    if (encoded > AGENT_BROWSER_MAX_TEXT_BYTES) {
      snapshot.elements = [];
      snapshot.truncated = true;
      snapshot.truncatedReason = 'text_budget';
    }
    this.current.set(identity.leaseId, snapshot);
    return this.copy(snapshot);
  }

  resolve(leaseId: string, snapshotId: string, elementRef: string, live: AgentSnapshotIdentity & { backendNodeId: number; fingerprint: string }): AgentResolveResult {
    const now = this.options.now?.() ?? Date.now();
    const snapshot = this.current.get(leaseId);
    if (!snapshot || snapshot.snapshotId !== snapshotId || now > snapshot.expiresAtMs || !sameIdentity(snapshot.identity, live))
      return { ok: false, code: 'stale_snapshot' };
    const element = snapshot.elements.find(item => item.elementRef === elementRef);
    if (!element) return { ok: false, code: 'element_missing' };
    if (element.backendNodeId !== live.backendNodeId || element.fingerprint !== live.fingerprint)
      return { ok: false, code: 'element_replaced' };
    return { ok: true, element: { ...element, rectCssPx: { ...element.rectCssPx } } };
  }

  invalidate(leaseId: string): void {
    this.current.delete(leaseId);
  }

  private bindElement(element: AgentSnapshotElementInput, displayNumber: number): AgentSnapshotElement {
    const name = element.name.slice(0, AGENT_BROWSER_MAX_NAME_CHARS);
    const bound: AgentSnapshotElement = {
      ...element,
      name,
      nameTruncated: element.name.length > AGENT_BROWSER_MAX_NAME_CHARS,
      rectCssPx: { ...element.rectCssPx },
      elementRef: randomBytes(12).toString('hex'),
      displayNumber,
      fingerprint: ''
    };
    bound.fingerprint = elementFingerprint(bound);
    return bound;
  }

  private copy(snapshot: StoredSnapshot): AgentSnapshot {
    return {
      ...snapshot,
      identity: { ...snapshot.identity },
      elements: snapshot.elements.map(element => ({ ...element, rectCssPx: { ...element.rectCssPx } }))
    };
  }
}

export function elementFingerprint(element: Pick<AgentSnapshotElementInput, 'tag' | 'role' | 'name' | 'visible' | 'enabled'>): string {
  return createHash('sha256').update(JSON.stringify([element.tag, element.role, element.name, element.visible, element.enabled])).digest('hex');
}

function sameIdentity(stored: AgentSnapshotIdentity, live: AgentSnapshotIdentity): boolean {
  return stored.leaseId === live.leaseId
    && stored.targetId === live.targetId
    && stored.mainGeneration === live.mainGeneration
    && stored.runnerGeneration === live.runnerGeneration
    && stored.navigationEpoch === live.navigationEpoch
    && stored.permissionEpoch === live.permissionEpoch
    && stored.frameId === live.frameId
    && stored.documentId === live.documentId;
}
