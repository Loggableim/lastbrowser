import { describe, expect, it } from 'vitest';
import { connectionPresentation } from '../src/renderer/components/connection-presentation.js';
import type { CapabilityCatalogEntry, SpaceBindingsView } from '../src/renderer/independent-contracts.js';

function entry(id: string, status: CapabilityCatalogEntry['status']): CapabilityCatalogEntry {
  return { capabilityId: id, title: id, status, connectionKind: 'provider', supportedTasks: [], connections: [], evidenceKind: 'configuration' };
}
describe('connection presentation', () => {
  it('puts connected entries first and leaves configured evidence unverified', () => {
    const configured = entry('Configured', 'configured');
    const result = connectionPresentation([configured, entry('Connected', 'connected')], null);
    expect(result.entries.map(row => row.capabilityId)).toEqual(['Connected', 'Configured']);
    expect(result.connectedCount).toBe(1); expect(result.entries[1].status).toBe('configured');
    expect(configured.evidenceKind).toBe('configuration');
  });
  it('retains unavailable and reauthentication problems instead of hiding them in the chooser', () => {
    const result = connectionPresentation([entry('Missing', 'not_configured'), entry('Unavailable', 'unavailable'), entry('Expired', 'reauth_required')], null);
    expect(result.problemCount).toBe(2); expect(result.entries).toHaveLength(2);
  });
  it('retains a bound entry even when its catalog status is not configured', () => {
    const bindings = { connectionBindings: [{ capabilityId: 'Bound', status: 'active' }] } as SpaceBindingsView;
    expect(connectionPresentation([entry('Bound', 'not_configured'), entry('Unbound', 'not_configured')], bindings).entries.map(row => row.capabilityId)).toEqual(['Bound']);
  });
});
