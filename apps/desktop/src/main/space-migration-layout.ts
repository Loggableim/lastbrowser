import { createHash } from 'node:crypto';
import path from 'node:path';

type SpaceBinding = {
  spaceId: string;
  browserProfileId: string;
  backendProfileName: string;
  backendProfileId?: string;
  partitionKey: string;
  agentPartitionKey?: string;
};

/** Resolve only app-owned, unambiguous stores from authoritative Space bindings. */
export function resolveSpaceMigrationLayout(
  userData: string, bindings: readonly SpaceBinding[], primaryId: string, decoyId: string
) {
  if (!path.isAbsolute(userData) || primaryId === decoyId) throw new Error('Invalid migration selection');

  function resolve(spaceId: string) {
    const matches = bindings.filter(row => row.spaceId === spaceId);
    if (matches.length !== 1) throw new Error('The migration selection is stale or ambiguous');
    const [binding] = matches;
    const { browserProfileId, backendProfileName, partitionKey, agentPartitionKey } = binding;
    if (!/^[a-z0-9][a-z0-9_.-]{0,127}$/i.test(browserProfileId)
      || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(backendProfileName)
      || !/^persist:space_[a-z0-9_~.-]+$/i.test(partitionKey)
      || !partitionKey.endsWith(`_${browserProfileId}`)
      || (agentPartitionKey !== undefined && !/^persist:independent_agent_v1_[a-f0-9]{64}$/.test(agentPartitionKey))) {
      throw new Error('Invalid Space storage binding');
    }
    if (backendProfileName === 'default') {
      throw new Error('The default Sidekick home needs a scoped export before it can be moved');
    }

    if (bindings.some(other => other !== binding && (
      other.browserProfileId.toLowerCase() === browserProfileId.toLowerCase()
      || other.backendProfileName.toLowerCase() === backendProfileName
      || other.partitionKey.toLowerCase() === partitionKey.toLowerCase()
      || (agentPartitionKey !== undefined && agentPartitionKey === other.agentPartitionKey)
    ))) throw new Error('Shared Space stores need a scoped export before they can be moved');

    const partition = path.join('Partitions', partitionKey.slice('persist:'.length).toLowerCase());
    const backend = path.join('runtime', 'profiles', backendProfileName);
    const file = `${createHash('sha256').update(browserProfileId).digest('hex')}.json`;
    const history = path.join('browser-history', file);
    const passwordVault = path.join('password-vault', file);
    const agent = agentPartitionKey && path.join('Partitions', agentPartitionKey.slice('persist:'.length));
    return {
      partition: { source: path.join(userData, partition), target: path.join('chromium', partition) },
      ...(agent ? { agent: { source: path.join(userData, agent), target: path.join('chromium', agent), optional: true } } : {}),
      backend: { source: path.join(userData, backend), target: backend },
      history: { source: path.join(userData, history), target: history, optional: true },
      passwordVault: { source: path.join(userData, passwordVault), target: passwordVault, optional: true }
    };
  }

  return { primary: resolve(primaryId), decoy: resolve(decoyId) };
}
