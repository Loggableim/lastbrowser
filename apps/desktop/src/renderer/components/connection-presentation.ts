import type { CapabilityCatalogEntry, SpaceBindingsView } from '../independent-contracts.js';

/** Presentation only: a configured credential is never evidence of successful use. */
export function connectionPresentation(entries: readonly CapabilityCatalogEntry[], bindings: SpaceBindingsView | null) {
  const bound = (entry: CapabilityCatalogEntry) => bindings?.connectionBindings?.some(row => row.capabilityId === entry.capabilityId && row.status !== 'revoked');
  const problem = (entry: CapabilityCatalogEntry) => ['reauth_required', 'unavailable'].includes(entry.status)
    || entry.connections?.some(connection => ['reauth_required', 'unavailable'].includes(connection.status));
  const connected = (entry: CapabilityCatalogEntry) => entry.status === 'connected' || entry.connections?.some(connection => connection.status === 'connected');
  const relevant = entries.filter(entry => ['configured', 'connected', 'reauth_required', 'unavailable'].includes(entry.status)
    || bound(entry) || entry.connections?.some(connection => ['configured', 'connected', 'reauth_required', 'unavailable'].includes(connection.status)
      || connection.configurationStatus === 'configured'));
  return {
    entries: relevant.sort((a, b) => Number(Boolean(connected(b))) - Number(Boolean(connected(a)))
      || Number(Boolean(problem(b))) - Number(Boolean(problem(a))) || (a.title || a.capabilityId).localeCompare(b.title || b.capabilityId)),
    problemCount: relevant.filter(problem).length,
    connectedCount: relevant.filter(connected).length,
  };
}
