// Controlled transport/state probe. No provider calls, credentials or GUI automation.
// Usage: node stream-first-character-probe.mjs C:/work/lastbrowser-chat-debug
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const root = resolve(process.argv[2]);
const require = createRequire(resolve(root, 'package.json'));
const { build } = require('esbuild');
async function sourceModule(path) {
  const result = await build({ entryPoints: [resolve(root, path)], bundle: true,
    platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const { subscribeChatStream } = await sourceModule('apps/desktop/src/main/chat-stream.ts');
const { applyLiveChatDelta } = await sourceModule('apps/desktop/src/renderer/chat-live-stream.ts');
let controller;
const body = new ReadableStream({ start(value) { controller = value; } });
const encoder = new TextEncoder();
let messages = [{ role: 'assistant', content: 'Working on it...', pending: true, streaming: true }];
const events = [];
let complete = false;
const stream = subscribeChatStream('http://127.0.0.1:8787', 'controlled-probe', null, event => {
  events.push(event.event);
  if (event.event === 'token') messages = applyLiveChatDelta(messages, 'token', event.data.text);
}, async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
stream.done.then(() => { complete = true; });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function send(text) { controller.enqueue(encoder.encode(text)); await tick(); }
await send('event: token\ndata: {"text":"H"}');
assert.equal(messages[0].content, 'Working on it...', 'An incomplete SSE frame must remain buffered');
await send('\n\n');
assert.equal(messages[0].content, 'H', 'First character must reach renderer state before any later chunk');
assert.equal(messages[0].pending, false);
assert.equal(complete, false, 'Stream must still be open after first character');
await send('event: token\ndata: {"text":"i"}\n\n');
assert.equal(messages[0].content, 'Hi', 'Next character must append before stream completion');
assert.equal(complete, false);
await send('event: stream_end\ndata: {}\n\n');
await stream.done;
assert.deepEqual(events, ['token', 'token', 'stream_end']);
console.log('PASS: split SSE frame -> first H -> next i -> terminal; first character delivered while stream remains open.');
console.log('Scope: actual transport and shared renderer state helper; not a DOM/first-paint timing measurement.');
