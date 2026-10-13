type Result = { ok: boolean; error?: string };
export type TerminalEvent = { id: string; data?: string; exitCode?: number };
type Bridge = {
  start(request: { cwd: string; mode: 'shell' | 'tui'; sessionId?: string }): Promise<{ id: string; error?: string }>;
  close(id: string): Promise<Result>;
  write(request: { id: string; data: string }): Promise<Result>;
  onData(callback: (event: TerminalEvent) => void): () => void;
};

/** A mounted workspace owns its PTY. Async starts cannot escape that lifetime. */
export function createTerminalSession(bridge: Bridge, output: (data: string) => void, changed: (id: string) => void, error: (message: string) => void) {
  let id = '';
  let generation = 0;
  let disposed = false;
  let pending = false;
  let early: TerminalEvent[] = [];
  const deliver = (event: TerminalEvent) => {
    if (event.id !== id) return;
    if (event.data) output(event.data);
    if (event.exitCode !== undefined) { id = ''; changed(''); error(`Terminal beendet (Exit ${event.exitCode}).`); }
  };
  const unsubscribe = bridge.onData((event) => {
    if (disposed) return;
    if (pending) { early.push(event); if (early.length > 256) early.shift(); }
    else deliver(event);
  });
  async function close() {
    generation++; pending = false; early = [];
    const closing = id;
    id = '';
    if (!disposed) changed('');
    if (closing) await bridge.close(closing).catch(() => ({ ok: false }));
  }
  return {
    async start(request: { cwd: string; mode: 'shell' | 'tui'; sessionId?: string }) {
      const closing = close();
      const current = generation;
      await closing;
      if (disposed || current !== generation) return;
      pending = true;
      try {
        const result = await bridge.start(request);
        if (disposed || current !== generation) {
          if (!result.error) await bridge.close(result.id).catch(() => ({ ok: false }));
          return;
        }
        pending = false;
        if (result.error) { error(result.error); early = []; return; }
        id = result.id; changed(id);
        const queued = early; early = []; queued.forEach(deliver);
      } catch (failure) {
        if (!disposed && current === generation) { pending = false; early = []; error(String(failure)); }
      }
    },
    close,
    async write(data: string) {
      if (!id || disposed) return;
      try {
        const result = await bridge.write({ id, data });
        if (!result.ok && !disposed) error(result.error || 'Terminal-Eingabe fehlgeschlagen.');
      } catch (failure) { if (!disposed) error(String(failure)); }
    },
    dispose() { disposed = true; unsubscribe(); void close(); }
  };
}
