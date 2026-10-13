type Payload = Record<string, unknown>;
export type McpConfig = Record<string, Record<string, unknown>>;
type Client = Pick<Window['lastbrowser']['mcp'], 'listServers' | 'saveServers' | 'listTools'>;

function checked(payload: Payload): Payload {
  if (payload.ok === false || payload.error) throw new Error(typeof payload.error === 'string' ? payload.error : 'MCP-Anfrage fehlgeschlagen.');
  return payload;
}
export function parseMcpEditor(json: string): McpConfig {
  const payload = JSON.parse(json) as Payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('JSON-Konfiguration muss ein Objekt sein.');
  const keys = ['mcpServers', 'servers', 'mcp_servers'].filter(key => key in payload);
  if (keys.length !== 1) throw new Error('Genau ein Serverfeld (mcpServers, servers oder mcp_servers) ist erforderlich.');
  const servers = payload[keys[0]];
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) throw new Error('MCP-Server müssen ein Objekt sein.');
  for (const [name, value] of Object.entries(servers)) {
    if (!name.trim() || name !== name.trim() || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ungültiger MCP-Servereintrag.');
    const config = value as Payload;
    if (!!config.command === !!config.url) throw new Error(`Server ${name} benötigt entweder command oder url.`);
  }
  return servers as McpConfig;
}

export class McpHubStateModel {
  private state = { editor: '{\n  "mcpServers": {}\n}', savedEditor: '{\n  "mcpServers": {}\n}', config: {} as McpConfig,
    servers: [] as Payload[], tools: [] as Payload[], loaded: false, busy: false, runtimeAvailable: null as boolean | null, error: '', notice: '' };
  private listeners = new Set<() => void>();
  private version = 0;
  constructor(private client: Client) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  dispose = () => { this.version++; this.update({ busy: false }); };
  private update(patch: Partial<typeof this.state>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); }
  setEditor = (editor: string) => this.update({ editor, error: '', notice: '' });
  resetEditor = () => this.update({ editor: this.state.savedEditor, error: '' });
  private async read(version: number, replaceEditor?: string) {
    const payload = checked(await this.client.listServers());
    const config = payload.config as Payload | undefined;
    if (!config || !config.mcpServers || typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)) throw new Error('MCP-Konfiguration ist nicht verfügbar.');
    if (version !== this.version) return;
    const editor = JSON.stringify({ mcpServers: config.mcpServers }, null, 2);
    this.update({ config: config.mcpServers as McpConfig, servers: Array.isArray(payload.servers) ? payload.servers as Payload[] : [],
      runtimeAvailable: typeof payload.runtime_available === 'boolean' ? payload.runtime_available : null,
      loaded: true, savedEditor: editor, ...(replaceEditor === this.state.editor ? { editor } : {}) });
    const tools = checked(await this.client.listTools());
    if (version === this.version) this.update({ tools: Array.isArray(tools.tools) ? tools.tools as Payload[] : [] });
  }
  load = async () => {
    if (this.state.busy) return;
    const version = ++this.version;
    const previousEditor = this.state.editor;
    this.update({ busy: true, error: '' });
    try { await this.read(version, previousEditor === this.state.savedEditor ? previousEditor : undefined); }
    catch (error) { if (version === this.version) this.update({ error: error instanceof Error ? error.message : String(error) }); }
    finally { if (version === this.version) this.update({ busy: false }); }
  };
  private async persist(config: McpConfig, capturedEditor?: string): Promise<boolean> {
    if (!this.state.loaded || this.state.busy) return false;
    const version = ++this.version;
    this.update({ busy: true, error: '', notice: '' });
    try {
      checked(await this.client.saveServers({ mcpServers: config }));
      if (version !== this.version) return false;
      this.update({ notice: 'MCP-Konfiguration gespeichert. Nova neu starten, damit die Änderung wirksam wird.' });
      await this.read(version, capturedEditor);
      return true;
    } catch (error) { if (version === this.version) this.update({ error: error instanceof Error ? error.message : String(error) }); return false; }
    finally { if (version === this.version) this.update({ busy: false }); }
  }
  save = async (): Promise<boolean> => {
    const editor = this.state.editor;
    try { return await this.persist(parseMcpEditor(editor), editor); }
    catch (error) { this.update({ notice: '', error: `Ungültige JSON-Konfiguration: ${error instanceof Error ? error.message : String(error)}` }); return false; }
  };
  toggle = async (name: string, enabled: boolean): Promise<boolean> => {
    if (this.state.editor !== this.state.savedEditor) { this.update({ notice: '', error: 'Bitte den Konfigurationsentwurf zuerst speichern oder verwerfen.' }); return false; }
    if (!this.state.config[name]) return false;
    return this.persist({ ...this.state.config, [name]: { ...this.state.config[name], enabled } }, this.state.editor);
  };
}
