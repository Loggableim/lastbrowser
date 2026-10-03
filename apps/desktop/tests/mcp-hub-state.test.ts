import { describe, expect, it, vi } from 'vitest';
import { McpHubStateModel, parseMcpEditor } from '../src/renderer/components/mcp-hub-state.js';

function fixture() {
  let servers = { example: { command: 'python', args: ['server.py'], enabled: true } } as Record<string, Record<string, unknown>>;
  const client = {
    listServers: vi.fn(async () => ({ config: { mcpServers: servers }, servers: Object.entries(servers).map(([name, cfg]) => ({ name, enabled: cfg.enabled })) } as Record<string, unknown>)),
    listTools: vi.fn(async () => ({ tools: [{ name: 'mcp_example_read', server: 'example' }] })),
    saveServers: vi.fn(async (payload: unknown) => { servers = (payload as { mcpServers: typeof servers }).mcpServers; return { ok: true }; })
  };
  return { client, model: new McpHubStateModel(client) };
}

describe('MCP hub actual configuration', () => {
  it('loads canonical server data and known tools without pretending they are connected', async () => {
    const { model } = fixture();
    await model.load();
    expect(parseMcpEditor(model.getSnapshot().editor).example.command).toBe('python');
    expect(model.getSnapshot().tools[0].name).toBe('mcp_example_read');
    expect(model.getSnapshot().servers[0].active).toBeUndefined();
  });

  it('really persists a disabled server and reports the required restart', async () => {
    const { model, client } = fixture();
    await model.load();
    expect(await model.toggle('example', false)).toBe(true);
    expect(client.saveServers).toHaveBeenCalledWith({ mcpServers: { example: { command: 'python', args: ['server.py'], enabled: false } } });
    expect(model.getSnapshot().servers[0].enabled).toBe(false);
    expect(model.getSnapshot().notice).toContain('Nova neu starten');
  });

  it('does not claim success or change the displayed state after a rejected save', async () => {
    const { model, client } = fixture();
    await model.load();
    client.saveServers.mockRejectedValue(new Error('Disk unavailable'));
    expect(await model.toggle('example', false)).toBe(false);
    expect(model.getSnapshot().servers[0].enabled).toBe(true);
    expect(model.getSnapshot().notice).toBe('');
    expect(model.getSnapshot().error).toBe('Disk unavailable');
  });

  it('allows an empty map to remove all servers but rejects malformed editor input before IPC', async () => {
    const { model, client } = fixture();
    await model.load();
    for (const editor of ['[]', '{"mcpServers":[]}', '{"mcpServers":{"broken":{}}}', '{']) {
      model.setEditor(editor);
      expect(await model.save()).toBe(false);
    }
    expect(client.saveServers).not.toHaveBeenCalled();
    model.setEditor('{"mcpServers":{}}');
    expect(await model.save()).toBe(true);
    expect(model.getSnapshot().servers).toEqual([]);
  });

  it('preserves edits during a pending load and prevents toggles from discarding a dirty draft', async () => {
    const { model, client } = fixture();
    let resolve!: (value: Record<string, unknown>) => void;
    client.listServers.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const loading = model.load();
    model.setEditor('{"mcpServers":{"draft":{"command":"local"}}}');
    resolve({ config: { mcpServers: { example: { command: 'python' } } }, servers: [{ name: 'example' }] });
    await loading;
    expect(parseMcpEditor(model.getSnapshot().editor).draft.command).toBe('local');
    expect(await model.toggle('example', false)).toBe(false);
    expect(client.saveServers).not.toHaveBeenCalled();
    model.resetEditor();
    expect(parseMcpEditor(model.getSnapshot().editor).example.command).toBe('python');
  });

  it('preserves newer input when an earlier save completes', async () => {
    const { model, client } = fixture();
    await model.load();
    let resolve!: (value: { ok: boolean }) => void;
    client.saveServers.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    model.setEditor('{"mcpServers":{"saved":{"command":"local"}}}');
    const saving = model.save();
    model.setEditor('{"mcpServers":{"newer":{"command":"local"}}}');
    resolve({ ok: true });
    await saving;
    expect(parseMcpEditor(model.getSnapshot().editor).newer.command).toBe('local');
  });

  it('discards a stale request after closing and can load again after reopening', async () => {
    const { model, client } = fixture();
    let resolve!: (value: Record<string, unknown>) => void;
    client.listServers.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const loading = model.load();
    model.dispose();
    await model.load();
    resolve({ config: { mcpServers: { stale: { command: 'old' } } }, servers: [] });
    await loading;
    expect(model.getSnapshot().config.stale).toBeUndefined();
    expect(model.getSnapshot().busy).toBe(false);
  });
});
