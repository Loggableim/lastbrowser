export type MemoryRecord = Record<string, unknown>;
export type MemorySection = 'memory' | 'user';
type MemoryClient = Pick<Window['lastbrowser']['sidekick'], 'getMemory' | 'writeMemory' | 'getSupermemoryStatus' | 'listSupermemoryDocuments' | 'searchSupermemory' | 'hybridMemorySearch' | 'getSupermemoryDocument' | 'addSupermemoryDocument' | 'forgetSupermemoryDocument'>;

export function checkedMemoryPayload(payload: MemoryRecord): MemoryRecord {
  if (payload.ok === false || (typeof payload.error === 'string' && payload.error)) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Memory request failed.');
  }
  return payload;
}
export function memoryItems(payload: MemoryRecord): MemoryRecord[] {
  for (const key of ['results', 'hits', 'documents', 'items']) {
    if (Array.isArray(payload[key])) return (payload[key] as unknown[]).filter((item): item is MemoryRecord => !!item && typeof item === 'object' && !Array.isArray(item));
  }
  return [];
}
export function memoryDocumentId(item: MemoryRecord | null): string | null {
  return item?.source !== 'local' && typeof item?.id === 'string' && item.id.trim() ? item.id : null;
}

export type MemoryPanelState = {
  drafts: Record<MemorySection, string>;
  saved: Record<MemorySection, string>;
  paths: Record<MemorySection, string>;
  loaded: boolean;
  loading: boolean;
  saving: boolean;
  status: MemoryRecord | null;
  documents: MemoryRecord[];
  results: MemoryRecord[];
  searched: boolean;
  searching: boolean;
  selected: MemoryRecord | null;
  detail: MemoryRecord | null;
  documentBusy: boolean;
  error: string;
};

/** Keeps edits, search identities and document requests independent of tab selection. */
export class MemoryPanelStateModel {
  private state: MemoryPanelState = {
    drafts: { memory: '', user: '' }, saved: { memory: '', user: '' }, paths: { memory: '', user: '' },
    loaded: false, loading: false, saving: false, status: null, documents: [], results: [],
    searched: false, searching: false, selected: null, detail: null, documentBusy: false, error: ''
  };
  private listeners = new Set<() => void>();
  private alive = true;
  private refreshVersion = 0;
  private searchVersion = 0;
  private detailVersion = 0;
  private lifecycle = 0;
  private mutating = false;
  constructor(private client: MemoryClient) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  dispose = () => {
    this.alive = false;
    this.lifecycle++;
    this.refreshVersion++;
    this.searchVersion++;
    this.detailVersion++;
  };
  activate = () => {
    this.alive = true;
    this.mutating = false;
    this.update({ loading: false, saving: false, searching: false, documentBusy: false });
  };
  private update(patch: Partial<MemoryPanelState>) {
    if (!this.alive) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private fail(error: unknown) { this.update({ error: error instanceof Error ? error.message : String(error) }); }
  setDraft = (section: MemorySection, value: string) => { this.update({ drafts: { ...this.state.drafts, [section]: value } }); };
  isDirty = (section: MemorySection) => this.state.drafts[section] !== this.state.saved[section];

  refresh = async (): Promise<void> => {
    const version = ++this.refreshVersion;
    this.update({ loading: true, error: '' });
    const responses = await Promise.allSettled([this.client.getMemory(), this.client.getSupermemoryStatus(), this.client.listSupermemoryDocuments()]);
    if (!this.alive || version !== this.refreshVersion) return;
    const errors: string[] = [];
    responses.forEach((response, index) => {
      try {
        if (response.status === 'rejected') throw response.reason;
        const payload = checkedMemoryPayload(response.value);
        if (index === 0) {
          const saved = { memory: typeof payload.memory === 'string' ? payload.memory : '', user: typeof payload.user === 'string' ? payload.user : '' };
          const drafts = { ...this.state.drafts };
          for (const section of ['memory', 'user'] as const) {
            if (!this.isDirty(section)) drafts[section] = saved[section];
          }
          this.update({ saved, drafts, loaded: true, paths: {
            memory: typeof payload.memory_path === 'string' ? payload.memory_path : '',
            user: typeof payload.user_path === 'string' ? payload.user_path : ''
          } });
        } else if (index === 1) this.update({ status: payload });
        else this.update({ documents: memoryItems(payload) });
      } catch (error) {
        if (index === 1) this.update({ status: null });
        errors.push(error instanceof Error ? error.message : String(error));
      }
    });
    this.update({ loading: false, error: errors.join(' | ') });
  };

  save = async (section: MemorySection): Promise<void> => {
    if (!this.state.loaded || this.state.saving || !this.isDirty(section)) return;
    const content = this.state.drafts[section];
    const lifecycle = this.lifecycle;
    this.update({ saving: true, error: '' });
    try {
      checkedMemoryPayload(await this.client.writeMemory({ section, content }));
      if (lifecycle !== this.lifecycle) return;
      // Edits typed during the request remain dirty instead of being overwritten.
      this.update({ saved: { ...this.state.saved, [section]: content } });
    } catch (error) { if (lifecycle === this.lifecycle) this.fail(error); }
    finally { if (lifecycle === this.lifecycle) this.update({ saving: false }); }
  };

  clearSearch = (): void => {
    this.searchVersion++;
    this.detailVersion++;
    this.update({ results: [], searched: false, searching: false, selected: null, detail: null, documentBusy: this.mutating });
  };
  search = async (query: string, hybrid: boolean): Promise<void> => {
    if (this.mutating) return;
    const trimmed = query.trim();
    if (!trimmed) { this.clearSearch(); return; }
    const version = ++this.searchVersion;
    this.detailVersion++;
    this.update({ searching: true, searched: true, results: [], selected: null, detail: null, documentBusy: false, error: '' });
    try {
      const payload = checkedMemoryPayload(await (hybrid ? this.client.hybridMemorySearch : this.client.searchSupermemory)({ query: trimmed, limit: 20 }));
      if (version === this.searchVersion) this.update({ results: memoryItems(payload) });
    } catch (error) { if (version === this.searchVersion) this.fail(error); }
    finally { if (version === this.searchVersion) this.update({ searching: false }); }
  };

  open = async (item: MemoryRecord): Promise<void> => {
    if (this.mutating) return;
    const version = ++this.detailVersion;
    this.update({ selected: item, detail: null, documentBusy: true, error: '' });
    const id = memoryDocumentId(item);
    if (!id) { this.update({ detail: item, documentBusy: false }); return; }
    try {
      const payload = checkedMemoryPayload(await this.client.getSupermemoryDocument({ id }));
      const document = payload.document;
      if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('Document was not found.');
      if (version === this.detailVersion) this.update({ detail: document as MemoryRecord });
    } catch (error) { if (version === this.detailVersion) this.fail(error); }
    finally { if (version === this.detailVersion) this.update({ documentBusy: false }); }
  };
  add = async (title: string, content: string): Promise<boolean> => {
    if (!title.trim() || !content.trim() || this.state.documentBusy) return false;
    const lifecycle = this.lifecycle;
    this.mutating = true;
    this.update({ documentBusy: true, error: '' });
    try {
      checkedMemoryPayload(await this.client.addSupermemoryDocument({ title: title.trim(), content }));
      if (lifecycle !== this.lifecycle) return false;
      this.clearSearch();
      await this.refresh();
      return true;
    } catch (error) { if (lifecycle === this.lifecycle) this.fail(error); return false; }
    finally { if (lifecycle === this.lifecycle) { this.mutating = false; this.update({ documentBusy: false }); } }
  };
  forget = async (): Promise<void> => {
    const id = memoryDocumentId(this.state.selected);
    if (!id || !this.state.detail || this.state.documentBusy) return;
    const lifecycle = this.lifecycle;
    this.mutating = true;
    this.update({ documentBusy: true, error: '' });
    try {
      const payload = checkedMemoryPayload(await this.client.forgetSupermemoryDocument({ id }));
      if (lifecycle !== this.lifecycle) return;
      if (payload.deleted === false) throw new Error('Document could not be deleted.');
      this.detailVersion++;
      this.update({ selected: null, detail: null, documents: this.state.documents.filter((item) => memoryDocumentId(item) !== id), results: this.state.results.filter((item) => memoryDocumentId(item) !== id) });
      await this.refresh();
    } catch (error) { if (lifecycle === this.lifecycle) this.fail(error); }
    finally { if (lifecycle === this.lifecycle) { this.mutating = false; this.update({ documentBusy: false }); } }
  };
}
