import { roadmapCatalog } from '../../assets/js/roadmap-catalog.js';

const FEATURES = new Set(roadmapCatalog.map(([id]) => id));
const COOKIE = '__Host-lb-roadmap-voter';
const YEAR = 365 * 24 * 60 * 60;
const encoder = new TextEncoder();
function reply(data, status = 200, cookie) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie' };
  if (cookie) headers['Set-Cookie'] = cookie;
  return new Response(JSON.stringify(data), { status, headers });
}
async function key(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
function hex(bytes) { return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join(''); }
async function voter(request, secret, now) {
  const token = (request.headers.get('cookie') || '').split(';').map(v => v.trim())
    .find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token || !/^[a-f0-9]{32}\.[0-9]{10}\.[a-f0-9]{64}$/.test(token)) return null;
  const [id, expiry, signature] = token.split('.');
  if (Number(expiry) <= now || Number(expiry) > now + YEAR + 60) return null;
  const bytes = Uint8Array.from(signature.match(/../g), value => parseInt(value, 16));
  return await crypto.subtle.verify('HMAC', await key(secret), bytes, encoder.encode(`${id}.${expiry}`))
    ? { id, expiry: Number(expiry) } : null;
}
async function boundedJson(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) { await reader.cancel(); throw new Error('body'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function state(db, identity, now) {
  const results = await db.batch([
    db.prepare('SELECT feature_id, COUNT(*) AS votes FROM roadmap_votes WHERE expires_at > ? GROUP BY feature_id').bind(now),
    db.prepare('SELECT feature_id FROM roadmap_votes WHERE voter_id = ? AND expires_at > ?').bind(identity?.id || '', now)
  ]);
  return { counts: Object.fromEntries(results[0].results.filter(row => FEATURES.has(row.feature_id))
    .map(row => [row.feature_id, Number(row.votes)])),
    selected: results[1].results.map(row => row.feature_id).filter(id => FEATURES.has(id)), session: !!identity };
}
export async function onRequest({ request, env }) {
  if (!['GET', 'POST', 'PUT'].includes(request.method)) return reply({ error: 'method' }, 405);
  if (!env.ROADMAP_DB || typeof env.ROADMAP_VOTE_SECRET !== 'string' || env.ROADMAP_VOTE_SECRET.length < 32)
    return reply({ error: 'unavailable' }, 503);
  const now = Math.floor(Date.now() / 1000);
  try {
    const identity = await voter(request, env.ROADMAP_VOTE_SECRET, now);
    if (request.method === 'GET') return reply(await state(env.ROADMAP_DB, identity, now));
    if (request.headers.get('origin') !== new URL(request.url).origin
      || request.headers.get('x-roadmap-vote') !== '1'
      || !request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'origin' }, 403);
    let body;
    try { body = await boundedJson(request); } catch { return reply({ error: 'body' }, 400); }
    if (request.method === 'POST') {
      if (body?.action !== 'session') return reply({ error: 'action' }, 400);
      if (identity) return reply({ session: true });
      const id = hex(crypto.getRandomValues(new Uint8Array(16)));
      const payload = `${id}.${now + YEAR}`;
      const signature = hex(await crypto.subtle.sign('HMAC', await key(env.ROADMAP_VOTE_SECRET), encoder.encode(payload)));
      return reply({ session: true }, 200,
        `${COOKIE}=${payload}.${signature}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${YEAR}`);
    }
    if (!identity) return reply({ error: 'session' }, 409);
    if (!FEATURES.has(body?.featureId) || typeof body?.voted !== 'boolean') return reply({ error: 'feature' }, 400);
    const window = Math.floor(now / 60) * 60;
    const limit = await env.ROADMAP_DB.prepare(`INSERT INTO roadmap_vote_limits (voter_id, window_start, attempts)
      VALUES (?, ?, 1) ON CONFLICT(voter_id) DO UPDATE SET
      attempts = CASE WHEN window_start = excluded.window_start THEN attempts + 1 ELSE 1 END,
      window_start = excluded.window_start RETURNING attempts`).bind(identity.id, window).first();
    if (!limit || limit.attempts > 60) return reply({ error: 'rate' }, 429);
    const mutation = body.voted
      ? env.ROADMAP_DB.prepare('INSERT INTO roadmap_votes (feature_id, voter_id, expires_at) VALUES (?, ?, ?) ON CONFLICT(feature_id, voter_id) DO NOTHING').bind(body.featureId, identity.id, identity.expiry)
      : env.ROADMAP_DB.prepare('DELETE FROM roadmap_votes WHERE feature_id = ? AND voter_id = ?').bind(body.featureId, identity.id);
    await env.ROADMAP_DB.batch([mutation,
      env.ROADMAP_DB.prepare('DELETE FROM roadmap_votes WHERE expires_at <= ?').bind(now),
      env.ROADMAP_DB.prepare('DELETE FROM roadmap_vote_limits WHERE window_start < ?').bind(window - 3600)]);
    return reply(await state(env.ROADMAP_DB, identity, now));
  } catch { return reply({ error: 'unavailable' }, 503); }
}
