import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AgentBrowserContractError,
  agentActionDigest,
  agentBrowserCapabilities,
  redactAgentActionForTrace,
  validateAgentBrowserAction
} from '../src/main/browser-agent-contracts.js';

const vectors = JSON.parse(readFileSync(new URL('./fixtures/agent-browser-digest-vectors.json', import.meta.url), 'utf8')) as Array<{ name: string; action: unknown; digest: string }>;

describe('agent browser v2 contracts', () => {
  it('matches the shared Python digest vectors', () => {
    for (const vector of vectors) expect(agentActionDigest(vector.action), vector.name).toBe(vector.digest);
  });

  it('offers no operations until an executor is registered', () => {
    expect(agentBrowserCapabilities({}).operations).toEqual([]);
    expect(agentBrowserCapabilities({ LASTBROWSER_AGENT_BROWSER_V2: '1' }).enabled).toBe(true);
    expect(agentBrowserCapabilities({ LASTBROWSER_AGENT_BROWSER_V2: '1' }).operations).toEqual([]);
    expect(agentBrowserCapabilities({}).frames.closedShadow).toBe('closed_shadow_unsupported');
  });

  it('rejects unknown fields, old versions, boolean integers, and raw evaluation', () => {
    expect(() => validateAgentBrowserAction({ schemaVersion: 2, kind: 'agent_browser_observe', includeElements: true, includeFrames: false, includeScreenshot: false, targetId: 'worker' })).toThrow(AgentBrowserContractError);
    expect(() => validateAgentBrowserAction({ schemaVersion: 1, kind: 'agent_browser_observe', includeElements: true, includeFrames: false, includeScreenshot: false })).toThrow(/schema version 2/);
    expect(() => validateAgentBrowserAction({ schemaVersion: 2, kind: 'evaluate', expression: 'document.cookie' })).toThrow(/not offered/);
    expect(() => validateAgentBrowserAction({ schemaVersion: 2, kind: 'agent_browser_observe', includeElements: 1, includeFrames: false, includeScreenshot: false })).toThrow(/booleans/);
  });

  it('keeps fill text in the digest and removes it from the diagnostic trace', () => {
    const action = { schemaVersion: 2, kind: 'agent_browser_fill', snapshotId: 'snap1234', elementRef: 'elem1234', text: 'secret-token', clear: true };
    const changed = { ...action, text: 'other-token' };
    expect(agentActionDigest(action)).not.toBe(agentActionDigest(changed));
    expect(JSON.stringify(redactAgentActionForTrace(action))).not.toContain('secret-token');
  });
});
