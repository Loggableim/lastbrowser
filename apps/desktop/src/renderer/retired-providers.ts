/** Retired identities remain recognizable so old profiles cannot revive them. */
export function isRetiredProvider(value: unknown): boolean {
  const id = String(value || '').trim().toLowerCase().replace(/^custom:/, '');
  return ['antigravity', 'antigravity (google)', 'antigravity-cli', 'antigravity-cloud', 'agy'].includes(id)
    || id.startsWith('cloudcode-pa://antigravity');
}
