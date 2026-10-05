import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
vi.mock('electron', () => ({ BaseWindow: class {}, WebContentsView: class {}, session: {}, webContents: {} }));
import { NativeChatStreamController, type NativeStreamReadBinding } from '../src/main/native-chat-stream-controller.js';
import { subscribeChatStream } from '../src/main/chat-stream.js';

const scope = { backendProfileId: 'backend-a', spaceId: 'space-a', browserProfileId: 'browser-a' };
const trusted = { profile: 'captured-profile-a', workspacePath: 'C:/controlled/a', spaceScope: scope, sessionId: 'session-a' };
function owner(id = 1) {
  const frame = { url: 'app://bundle/index.html', isDestroyed: () => false };
  return Object.assign(new EventEmitter(), { id, mainFrame: frame, isDestroyed: () => false, getURL: () => frame.url, send: vi.fn() });
}
let shell: ReturnType<typeof owner>, event: any, controller: NativeChatStreamController;
let proof: ReturnType<typeof vi.fn>, status: ReturnType<typeof vi.fn>, transport: ReturnType<typeof vi.fn>, cancel: ReturnType<typeof vi.fn>, handles: any[];
beforeEach(() => {
  shell = owner(); event = { sender: shell, senderFrame: shell.mainFrame }; handles = [];
  proof = vi.fn(async (binding: NativeStreamReadBinding) => ({ schemaVersion: 1, nativeChat: true, scope: binding.spaceScope,
    sessionId: binding.sessionId, streamId: binding.streamId, profileName: binding.profile,
    profileHome: 'C:/controlled/home-a', writerGeneration: 'actual-writer-a', processExited: false }));
  status = vi.fn(async () => ({ active: true }));
  cancel = vi.fn(async binding => ({ ok: true, cancelled: true, streamId: binding.streamId }));
  transport = vi.fn((_binding, onEvent) => {
    let finish!: () => void; const done = new Promise<void>(resolve => { finish = resolve; });
    const handle = { close: vi.fn(finish), done, onEvent, finish }; handles.push(handle); return handle;
  });
  controller = new NativeChatStreamController({ isShell: value => value === shell, readContext: proof as any,
    statusTransport: status, subscribeTransport: transport, cancelTransport: cancel });
});
afterEach(() => { controller.close(); vi.restoreAllMocks(); });
async function capture(streamId = 'stream-a') {
  const token = controller.beginCapture(event, trusted);
  await controller.captureStart(token, { sessionId: trusted.sessionId, streamId });
}

describe('native chat immutable read authority', () => {
  it('treats a null session ID as a new-chat capture while keeping any returned session strictly bound', async () => {
    const token = controller.beginCapture(event, { ...trusted, sessionId: null });
    await controller.captureStart(token, { sessionId: 'session-created', streamId: 'stream-created' });
    await controller.status(event, 'stream-created');
    expect(status.mock.calls[0][0]).toMatchObject({ sessionId: 'session-created', profile: trusted.profile,
      workspacePath: trusted.workspacePath, spaceScope: scope, nativeChat: true });
    await expect(controller.captureStart(controller.beginCapture(event, { ...trusted, sessionId: null }),
      { sessionId: 'session-other', streamId: 'stream-created' })).rejects.toThrow(/already bound to another chat/);
    expect(() => controller.beginCapture(event, { ...trusted, sessionId: 'bad session id' })).toThrow(/Invalid captured native chat binding/);
  });
  it('freezes the accepted profile, Scope and workspace across UI changes for both SSE and status', async () => {
    const request = { ...trusted, spaceScope: { ...scope } }, token = controller.beginCapture(event, request);
    request.profile = 'ui-profile-b'; request.workspacePath = 'C:/controlled/b'; request.spaceScope.spaceId = 'space-b';
    await controller.captureStart(token, { sessionId: 'session-a', streamId: 'stream-a' });
    await controller.status(event, 'stream-a'); await controller.subscribe(event, { streamId: 'stream-a' });
    expect(status.mock.calls[0][0]).toMatchObject({ profile: 'captured-profile-a', workspacePath: 'C:/controlled/a', spaceScope: scope, writerGeneration: 'actual-writer-a' });
    expect(transport.mock.calls[0][0]).toEqual(status.mock.calls[0][0]); expect(Object.isFrozen(status.mock.calls[0][0])).toBe(true);
    expect(Object.isFrozen(status.mock.calls[0][0].spaceScope)).toBe(true);
    expect(proof).toHaveBeenCalledTimes(3);
  });
  it('rejects guests, forged subframes and arbitrary UUID-only reads before network IO', async () => {
    await capture(); proof.mockClear();
    const guest = owner(2), subframe = { ...shell.mainFrame };
    await expect(controller.subscribe({ sender: guest, senderFrame: guest.mainFrame } as any, { streamId: 'stream-a' })).rejects.toThrow(/Untrusted/);
    await expect(controller.status({ sender: shell, senderFrame: subframe } as any, 'stream-a')).rejects.toThrow(/Untrusted/);
    await expect(controller.status(event, 'unknown-uuid')).rejects.toThrow(/accepted session/);
    await expect(controller.subscribe(event, { streamId: 'stream-a', spaceScope: scope })).rejects.toThrow(/Only/);
    await expect(controller.status(event, { streamId: 'stream-a', profile: 'other' })).rejects.toThrow(/Only/);
    await expect(controller.subscribe(event, { streamId: 'stream-a', nativeBridgeNonce: 'forged' })).rejects.toThrow(/Only/);
    expect(proof).not.toHaveBeenCalled(); expect(status).not.toHaveBeenCalled(); expect(transport).not.toHaveBeenCalled();
  });
  it('cancels only a stream accepted by this trusted shell and uses its captured profile', async () => {
    const original = controller.beginCapture(event, { profile: 'profile-a', workspacePath: 'C:/spaces/a', sessionId: 'session-a' });
    await controller.captureStart(original, { sessionId: 'session-a', streamId: 'stream-a' });
    const laterProfile = controller.beginCapture(event, { profile: 'profile-b', workspacePath: 'C:/spaces/b', sessionId: 'session-b' });
    await controller.captureStart(laterProfile, { sessionId: 'session-b', streamId: 'stream-b' });

    const result = await controller.cancel(event, 'stream-a');
    expect(result).toEqual({ ok: true, cancelled: true, streamId: 'stream-a' });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel.mock.calls[0][0]).toMatchObject({ streamId: 'stream-a', sessionId: 'session-a',
      profile: 'profile-a', workspacePath: 'C:/spaces/a', nativeChat: false });
    await expect(controller.cancel(event, 'unknown-stream')).rejects.toThrow(/accepted session/);
    await expect(controller.cancel(event, { streamId: 'stream-b', profile: 'profile-a' })).rejects.toThrow(/Only/);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('rejects cancel from a foreign shell, subframe, destroyed sender, and generic native stream path', async () => {
    await capture();
    const guest = owner(2), subframe = { ...shell.mainFrame };
    await expect(controller.cancel({ sender: guest, senderFrame: guest.mainFrame } as any, 'stream-a')).rejects.toThrow(/Untrusted/);
    await expect(controller.cancel({ sender: shell, senderFrame: subframe } as any, 'stream-a')).rejects.toThrow(/Untrusted/);
    shell.isDestroyed = () => true;
    await expect(controller.cancel(event, 'stream-a')).rejects.toThrow(/destroyed|Untrusted/i);
    shell.isDestroyed = () => false;
    expect(cancel).not.toHaveBeenCalled();

    await controller.cancel(event, 'stream-a').catch(() => null);
    expect(cancel).not.toHaveBeenCalled();
  });
  it('rechecks the accepted document after the captured-profile cancel transport resolves', async () => {
    const token = controller.beginCapture(event, { profile: 'old-profile-a', sessionId: 'legacy-session-a' });
    await controller.captureStart(token, { sessionId: 'legacy-session-a', streamId: 'legacy-stream-a' });
    cancel.mockImplementation(async () => {
      shell.emit('did-start-navigation', {}, 'app://bundle/other.html', false, true);
      return { ok: true, cancelled: true };
    });
    await expect(controller.cancel(event, 'legacy-stream-a')).rejects.toThrow(/reader changed while authorizing/);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel.mock.calls[0][0]).toMatchObject({ streamId: 'legacy-stream-a', profile: 'old-profile-a' });
  });
  it('attaches Main-verified writer provenance to every native event and overrides transport claims', async () => {
    await capture(); await controller.subscribe(event, { streamId: 'stream-a' });
    handles[0].onEvent({ event: 'token', data: { text: 'actual token' }, raw: '',
      nativeContext: { scope: { ...scope, spaceId: 'foreign' }, writerGeneration: 'forged-event-writer' } });
    const envelope = shell.send.mock.calls[0][1];
    expect(envelope.nativeContext).toEqual({ schemaVersion: 1, scope, sessionId: 'session-a', streamId: 'stream-a', writerGeneration: 'actual-writer-a' });
    expect(Object.isFrozen(envelope.nativeContext)).toBe(true); expect(Object.isFrozen(envelope.nativeContext.scope)).toBe(true);
    shell.emit('did-start-navigation', {}, '', false, true);
    handles[0].onEvent({ event: 'token', data: { text: 'stale token' }, raw: '' });
    expect(shell.send).toHaveBeenCalledTimes(1);
  });
  it('checks the captured original document before accepting an HTTP start response', async () => {
    const token = controller.beginCapture(event, trusted);
    shell.emit('did-start-navigation', {}, shell.getURL(), false, true);
    await expect(controller.captureStart(token, { sessionId: 'session-a', streamId: 'stream-a' })).rejects.toThrow(/document changed/);
    expect(proof).not.toHaveBeenCalled();
    await expect(controller.captureStart({} as any, { sessionId: 'session-a', streamId: 'stream-a' })).rejects.toThrow(/minted by Main/);
  });
  it('rechecks after the actual read-proof await and never opens transport on reload races', async () => {
    await capture(); const native = proof.getMockImplementation()!;
    proof.mockImplementation(async binding => { const result = await native(binding); shell.emit('did-start-navigation', {}, '', false, true); return result; });
    await expect(controller.subscribe(event, { streamId: 'stream-a' })).rejects.toThrow(/reader changed/);
    expect(transport).not.toHaveBeenCalled();
  });
  it.each(['scope', 'profileName', 'sessionId', 'streamId', 'writerGeneration', 'profileHome'])('rejects changed %s proof before status/subscribe IO', async field => {
    await capture(); const native = proof.getMockImplementation()!;
    proof.mockImplementation(async binding => ({ ...await native(binding), [field]: field === 'scope' ? { ...scope, spaceId: 'foreign' } : 'foreign' }));
    await expect(controller.status(event, 'stream-a')).rejects.toThrow(/another accepted/);
    expect(status).not.toHaveBeenCalled(); expect(transport).not.toHaveBeenCalled();
  });
  it('closes old document readers on reload without invoking any worker control and allows original-profile resubscription', async () => {
    await capture(); await controller.subscribe(event, { streamId: 'stream-a' }); const old = handles[0];
    shell.emit('did-start-navigation', {}, shell.getURL(), false, true);
    expect(old.close).toHaveBeenCalledTimes(1); old.onEvent({ event: 'delta', data: { text: 'stale' }, raw: '' }); expect(shell.send).not.toHaveBeenCalled();
    shell.mainFrame = { url: 'app://bundle/index.html', isDestroyed: () => false }; event.senderFrame = shell.mainFrame;
    await controller.subscribe(event, { streamId: 'stream-a' });
    handles[1].onEvent({ event: 'delta', data: { text: 'current' }, raw: '' });
    expect(shell.send).toHaveBeenCalledWith('lastbrowser:sidekick:chatStreamEvent', expect.objectContaining({ streamId: 'stream-a', data: { text: 'current' } }));
    expect(transport.mock.calls[1][0].profile).toBe('captured-profile-a');
  });
  it('rehydrates only from actual saved session scope and current native registry evidence', async () => {
    const token = controller.beginCapture(event, trusted);
    await controller.captureSession(token, { session: { session_id: 'session-a', profile: trusted.profile, space_scope: scope,
      active_stream_id: 'stream-a', native_controls: { schemaVersion: 1, scope, sessionId: 'session-a', streamId: 'stream-a' } } });
    await controller.status(event, 'stream-a'); expect(status.mock.calls[0][0]).toMatchObject({ spaceScope: scope, profile: trusted.profile });
    const foreign = controller.beginCapture(event, trusted);
    await expect(controller.captureSession(foreign, { session: { session_id: 'session-a', profile: trusted.profile,
      space_scope: { ...scope, spaceId: 'foreign' }, active_stream_id: 'stream-x' } })).rejects.toThrow(/another captured/);
  });
  it('does not grant a second shell reads until its own actual session is captured', async () => {
    const second = owner(2), secondEvent = { sender: second, senderFrame: second.mainFrame } as any;
    controller.close(); controller = new NativeChatStreamController({ isShell: value => value === shell || value === second,
      readContext: proof as any, statusTransport: status, subscribeTransport: transport });
    await capture(); await expect(controller.status(secondEvent, 'stream-a')).rejects.toThrow(/accepted session/);
    const token = controller.beginCapture(secondEvent, trusted);
    await controller.captureSession(token, { session: { session_id: 'session-a', profile: trusted.profile, space_scope: scope, active_stream_id: 'stream-a' } });
    await controller.status(secondEvent, 'stream-a'); expect(status).toHaveBeenCalledTimes(1);
  });
  it('bounds receipts and suppresses old replaced handle cleanup from detaching the new reader', async () => {
    controller.close(); controller = new NativeChatStreamController({ isShell: value => value === shell, capacity: 1,
      readContext: proof as any, statusTransport: status, subscribeTransport: transport });
    await capture(); await controller.subscribe(event, { streamId: 'stream-a' }); await controller.subscribe(event, { streamId: 'stream-a' });
    await Promise.resolve(); shell.emit('did-start-navigation', {}, '', false, true);
    expect(handles[1].close).toHaveBeenCalledTimes(1);
    await capture('stream-b'); await expect(controller.status(event, 'stream-a')).rejects.toThrow(/accepted session/);
    expect((controller as any).receipts.size).toBe(1);
  });
  it('preserves legacy unbound accepted streams while still rejecting guessed IDs and native-as-legacy downgrade', async () => {
    const token = controller.beginCapture(event, { profile: 'legacy-original', sessionId: 'legacy-session' });
    await controller.captureStart(token, { sessionId: 'legacy-session', streamId: 'legacy-stream' });
    await controller.status(event, 'legacy-stream'); expect(proof).not.toHaveBeenCalled();
    expect(status.mock.calls[0][0]).toMatchObject({ profile: 'legacy-original', nativeChat: false });
    await controller.subscribe(event, { streamId: 'legacy-stream' });
    handles[0].onEvent({ event: 'token', data: { text: 'legacy' }, raw: '', nativeContext: { writerGeneration: 'untrusted' } });
    expect(shell.send.mock.calls[0][1]).not.toHaveProperty('nativeContext');
    const downgraded = controller.beginCapture(event, { sessionId: 'session-a' });
    await expect(controller.captureSession(downgraded, { session: { session_id: 'session-a', space_scope: scope, active_stream_id: 'stream-a' } })).rejects.toThrow(/another captured/);
  });
  it('preserves a saved legacy chat in a now-bound UI Space only from actual unbound session evidence', async () => {
    const token = controller.beginCapture(event, trusted);
    await controller.captureSession(token, { session: { session_id: 'session-a', profile: trusted.profile, space_scope: null, active_stream_id: 'legacy-stream' } });
    await controller.status(event, 'legacy-stream'); expect(status.mock.calls[0][0]).toMatchObject({ nativeChat: false, profile: trusted.profile });
    expect(status.mock.calls[0][0]).not.toHaveProperty('spaceScope'); expect(proof).not.toHaveBeenCalled();
    const next = controller.beginCapture(event, trusted);
    await controller.captureStart(next, { sessionId: 'session-a', streamId: 'legacy-start' }, { session: { session_id: 'session-a', profile: trusted.profile } });
    await controller.status(event, 'legacy-start'); expect(status.mock.calls[1][0].nativeChat).toBe(false);
    const fake = controller.beginCapture(event, trusted);
    await expect(controller.captureSession(fake, { session: { session_id: 'session-a', profile: trusted.profile, independent: { runId: 'actual-run' }, active_stream_id: 'fake-legacy' } })).rejects.toThrow(/another captured/);
  });
  it('accepts only the actual backend null/native start classification tag and rejects a changed native tag', async () => {
    await controller.captureStart(controller.beginCapture(event, trusted), { sessionId: 'session-a', streamId: 'legacy-tagged', spaceScope: null });
    await controller.status(event, 'legacy-tagged'); expect(status.mock.calls[0][0].nativeChat).toBe(false); expect(proof).not.toHaveBeenCalled();
    await expect(controller.captureStart(controller.beginCapture(event, trusted), { sessionId: 'session-a', streamId: 'foreign-tagged', spaceScope: { ...scope, spaceId: 'foreign' } })).rejects.toThrow(/captured native scope/);
    await controller.captureStart(controller.beginCapture(event, trusted), { sessionId: 'session-a', streamId: 'native-tagged', spaceScope: scope });
    expect(proof).toHaveBeenCalledTimes(1);
  });
  it('keeps actual SSE transport open for native terminal processExited:false until actual exit evidence arrives', async () => {
    let source!: ReadableStreamDefaultController<Uint8Array>; const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({ start(value) { source = value; } });
    const fetchImpl: typeof fetch = async () => new Response(readable, { headers: { 'content-type': 'text/event-stream' } });
    controller.close(); controller = new NativeChatStreamController({ isShell: value => value === shell, readContext: proof as any, statusTransport: status,
      subscribeTransport: (binding, onEvent) => subscribeChatStream('http://127.0.0.1:8787', binding.streamId, null, onEvent, fetchImpl) });
    await capture(); await controller.subscribe(event, { streamId: 'stream-a' });
    source.enqueue(encoder.encode('event: stream_end\ndata: {"nativeChat":true,"processExited":false}\n\n'));
    await vi.waitFor(() => expect(shell.send).toHaveBeenCalledTimes(1)); expect((controller as any).subscriptions.size).toBe(1);
    source.enqueue(encoder.encode('event: stream_end\ndata: {"nativeChat":true,"processExited":true}\n\n'));
    await vi.waitFor(() => expect(shell.send).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect((controller as any).subscriptions.size).toBe(0));
  });
  it('removes lifecycle listeners and refuses pending receipt capture after shutdown without stopping workers', async () => {
    const token = controller.beginCapture(event, trusted); controller.close();
    expect(shell.listenerCount('did-start-navigation')).toBe(0); expect(shell.listenerCount('destroyed')).toBe(0);
    await expect(controller.captureStart(token, { sessionId: 'session-a', streamId: 'stream-a' })).rejects.toThrow(/closed/);
    expect(proof).not.toHaveBeenCalled();
  });
});
