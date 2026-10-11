/** Retired identities remain recognizable so old profiles cannot revive them. */
export function isRetiredProvider(value: unknown): boolean {
  const raw = String(value || '').trim().toLowerCase();
  const id = raw.replace(/^@/, '').replace(/^custom:/, '');
  const providerId = raw.startsWith('@') ? id.split(':', 1)[0] : id;
  return ['antigravity', 'antigravity (google)', 'antigravity-google', 'antigravity-cli', 'antigravity-cloud', 'agy'].includes(providerId)
    || id.startsWith('cloudcode-pa://antigravity');
}
