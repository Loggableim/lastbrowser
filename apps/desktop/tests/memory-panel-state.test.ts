import { describe, expect, it, vi } from 'vitest';
import { MemoryPanelStateModel, type MemoryRecord } from '../src/renderer/panels/memory-panel-state.js';

function fixture() {
  const client = {
    getMemory: vi.fn(async () => ({ memory: 'Saved core', user: 'Saved facts', memory_path: 'MEMORY.md', user_path: 'USER.md' } as MemoryRecord)),
    writeMemory: vi.fn(async () => ({ ok: true } as MemoryRecord)),
    getSupermemoryStatus: vi.fn(async () => ({ configured: true, connected: true, document_count: 1 } as MemoryRecord)),
    listSupermemoryDocuments: vi.fn(async () => ({ ok: true, documents: [{ id: 'document-1', title: 'Document', content: 'Content' }] } as MemoryRecord)),
    searchSupermemory: vi.fn(async () => ({ ok: true, results: [] } as MemoryRecord)),
    hybridMemorySearch: vi.fn(async () => ({ ok: true, hits: [] } as MemoryRecord)),
    getSupermemoryDocument: vi.fn(async (request: { id?: string }) => ({ ok: true, document: { id: request.id, title: request.id, content: 'Detail' } } as MemoryRecord)),
    addSupermemoryDocument: vi.fn(async () => ({ ok: true } as MemoryRecord)),
    forgetSupermemoryDocument: vi.fn(async () => ({ ok: true, deleted: true } as MemoryRecord))
  };
  return { client, model: new MemoryPanelStateModel(client) };
}

describe('memory panel state', () => {
  it('keeps subscribers active after service readiness changes and discards an older save', async () => {
    const { model, client } = fixture();
    const listener = vi.fn();
    model.subscribe(listener);
    await model.refresh();
    model.setDraft('memory', 'Old edit');
    let resolve!: (payload: MemoryRecord) => void;
    client.writeMemory.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const saving = model.save('memory');
    model.dispose();
    model.activate();
    model.setDraft('memory', 'New edit');
    const notifications = listener.mock.calls.length;
    resolve({ ok: true });
    await saving;
    expect(model.getSnapshot().saved.memory).toBe('Saved core');
    expect(model.getSnapshot().drafts.memory).toBe('New edit');
    expect(model.getSnapshot().saving).toBe(false);
    await model.refresh();
    expect(listener.mock.calls.length).toBeGreaterThan(notifications);
  });

  it('preserves unsaved drafts for both local sections during refresh', async () => {
    const { model } = fixture();
    await model.refresh();
    model.setDraft('memory', 'Unsaved core');
    model.setDraft('user', 'Unsaved facts');
    await model.refresh();
    expect(model.getSnapshot().drafts).toEqual({ memory: 'Unsaved core', user: 'Unsaved facts' });
    expect(model.isDirty('memory')).toBe(true);
    expect(model.isDirty('user')).toBe(true);
  });

  it('keeps an empty local file empty, instead of rendering JSON or the other section', async () => {
    const { client, model } = fixture();
    client.getMemory.mockResolvedValue({ memory: '', user: '' });
    await model.refresh();
    expect(model.getSnapshot().drafts).toEqual({ memory: '', user: '' });
    expect(model.getSnapshot().loaded).toBe(true);
  });

  it('saves the captured section while retaining edits typed during the request', async () => {
    const { client, model } = fixture();
    await model.refresh();
    model.setDraft('memory', 'First edit');
    let resolve!: (payload: MemoryRecord) => void;
    client.writeMemory.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const saving = model.save('memory');
    model.setDraft('memory', 'Later edit');
    resolve({ ok: true });
    await saving;
    expect(client.writeMemory).toHaveBeenCalledWith({ section: 'memory', content: 'First edit' });
    expect(model.getSnapshot().saved.memory).toBe('First edit');
    expect(model.getSnapshot().drafts.memory).toBe('Later edit');
    expect(model.isDirty('memory')).toBe(true);
  });

  it('does not enable saving after failed initial loading or hide successful HTTP error payloads', async () => {
    const { client, model } = fixture();
    client.getMemory.mockRejectedValue(new Error('Cannot read notes'));
    await model.refresh();
    model.setDraft('memory', 'Typed too early');
    await model.save('memory');
    expect(client.writeMemory).not.toHaveBeenCalled();
    expect(model.getSnapshot().error).toContain('Cannot read notes');
    client.hybridMemorySearch.mockResolvedValue({ ok: false, error: 'Storage failed', hits: [] });
    await model.search('query', true);
    expect(model.getSnapshot().error).toBe('Storage failed');
    expect(model.getSnapshot().searched).toBe(true);
  });

  it('distinguishes an empty search from the existing document library and ignores stale responses', async () => {
    const { model, client } = fixture();
    await model.refresh();
    let resolve!: (payload: MemoryRecord) => void;
    client.searchSupermemory.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const oldSearch = model.search('older query', false);
    await model.search('newer query', true);
    resolve({ results: [{ id: 'stale-document' }] });
    await oldSearch;
    expect(model.getSnapshot().results).toEqual([]);
    expect(model.getSnapshot().documents).toHaveLength(1);
    expect(model.getSnapshot().searched).toBe(true);
    model.clearSearch();
    expect(model.getSnapshot().searched).toBe(false);
  });

  it('opens local note hits without document APIs and never deletes them', async () => {
    const { client, model } = fixture();
    const note = { id: 'local:memory:1', source: 'local', title: 'MEMORY.md', content: 'Note' };
    await model.open(note);
    await model.forget();
    expect(model.getSnapshot().detail).toBe(note);
    expect(client.getSupermemoryDocument).not.toHaveBeenCalled();
    expect(client.forgetSupermemoryDocument).not.toHaveBeenCalled();
  });

  it('passes real document IDs unchanged and ignores an older detail response', async () => {
    const { client, model } = fixture();
    let resolve!: (payload: MemoryRecord) => void;
    client.getSupermemoryDocument.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const first = model.open({ id: 'long-real-document-identifier-A', source: 'supermemory' });
    await model.open({ id: 'long-real-document-identifier-B', source: 'supermemory' });
    resolve({ document: { id: 'A', content: 'Stale detail' } });
    await first;
    expect(model.getSnapshot().detail?.id).toBe('long-real-document-identifier-B');
    await model.forget();
    expect(client.forgetSupermemoryDocument).toHaveBeenCalledWith({ id: 'long-real-document-identifier-B' });
  });

  it('does not claim deletion when the backend reports deleted=false', async () => {
    const { client, model } = fixture();
    await model.open({ id: 'document-1' });
    client.forgetSupermemoryDocument.mockResolvedValue({ ok: true, deleted: false });
    await model.forget();
    expect(model.getSnapshot().selected?.id).toBe('document-1');
    expect(model.getSnapshot().error).toContain('deleted');
  });

  it('rejects blank document content and preserves drafts when add fails', async () => {
    const { client, model } = fixture();
    expect(await model.add('Title', ' ')).toBe(false);
    expect(client.addSupermemoryDocument).not.toHaveBeenCalled();
    client.addSupermemoryDocument.mockResolvedValue({ ok: false, error: 'Add failed' });
    expect(await model.add('Title', 'Content')).toBe(false);
    expect(model.getSnapshot().error).toBe('Add failed');
  });

  it('prevents late loads from updating a disposed profile or space view', async () => {
    const { model, client } = fixture();
    let resolve!: (payload: MemoryRecord) => void;
    client.getMemory.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const loading = model.refresh();
    model.dispose();
    resolve({ memory: 'Old profile contents' });
    await loading;
    expect(model.getSnapshot().drafts.memory).toBe('');
  });
});
