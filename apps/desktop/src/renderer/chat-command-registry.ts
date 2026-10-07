import { captureCommandContext, type ChatCommandId, type CommandAction, type CommandCapabilities, type CommandContext, type CommandLifetime } from './CommandActionContracts.js';

export interface ChatCommandDefinition { id: ChatCommandId; name: string; aliases: readonly string[]; lifetime: CommandLifetime }
export const CHAT_COMMANDS: readonly ChatCommandDefinition[] = Object.freeze([
  { id: 'model', name: 'model', aliases: ['modell'], lifetime: 'ui' },
  { id: 'plan', name: 'plan', aliases: [], lifetime: 'chat' },
  { id: 'goal', name: 'goal', aliases: ['ziel'], lifetime: 'chat' },
  { id: 'grill_me', name: 'grill-me', aliases: [], lifetime: 'chat' },
  { id: 'boost', name: 'boost', aliases: [], lifetime: 'next_turn' },
  { id: 'new', name: 'new', aliases: ['neu'], lifetime: 'ui' },
  { id: 'stop', name: 'stop', aliases: ['stopp'], lifetime: 'ui' },
  { id: 'help', name: 'help', aliases: ['hilfe'], lifetime: 'ui' },
  { id: 'gquota', name: 'gquota', aliases: [], lifetime: 'ui' },
  { id: 'plugins', name: 'plugins', aliases: ['plugin'], lifetime: 'ui' },
]);
export function parseChatCommand(input: string): { command: ChatCommandDefinition; args: string } | null {
  const match = input.trim().match(/^\/([^\s/]+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  const name = match[1].toLowerCase();
  const command = CHAT_COMMANDS.find(item => item.name === name || item.aliases.includes(name));
  return command ? { command, args: (match[2] || '').trim() } : null;
}
export function filterChatCommands(query: string): ChatCommandDefinition[] {
  const needle = query.replace(/^\//, '').trim().toLowerCase();
  return CHAT_COMMANDS.filter(item => [item.name, ...item.aliases].some(name => name.includes(needle)));
}
const persistentGoalActions = new Set(['status', 'pause', 'resume', 'clear', 'cancel', 'complete', 'stop', 'done']);
function canonicalGoalArgs(args: string): string {
  const action = args.toLowerCase();
  return persistentGoalActions.has(action) ? action : args;
}
export function commandAvailable(id: ChatCommandId, capabilities: CommandCapabilities): boolean {
  return !(id in capabilities) || capabilities[id as keyof CommandCapabilities] === true;
}
export function createChatCommandAction(input: string, source: 'composer' | 'attached_content', context: CommandContext,
  capabilities: CommandCapabilities, requestId: () => string = () => crypto.randomUUID()): CommandAction | null {
  if (source !== 'composer') return null;
  const parsed = parseChatCommand(input);
  if (!parsed) return null;
  const captured = captureCommandContext(context);
  const { id } = parsed.command;
  const unavailable = (reason: 'backend_unavailable' | 'missing_session' | 'invalid_arguments'): CommandAction =>
    ({ kind: 'unavailable', command: id, reason, context: captured });
  if (!commandAvailable(id, capabilities)) return unavailable('backend_unavailable');
  const args = parsed.args;
  if (id === 'gquota' || id === 'plugins') return { kind: 'legacy_adapter', adapter: id, args, context: captured };
  if (id === 'goal') {
    if (!args) return { kind: 'open_goal_editor', context: captured };
    if (!captured.sessionId) return unavailable('missing_session');
    return { kind: 'goal_command', args: canonicalGoalArgs(args), clientRequestId: requestId(), context: captured };
  }
  if (id === 'plan' || id === 'grill_me' || id === 'boost') {
    if (!captured.sessionId) return unavailable('missing_session');
    if(id==='grill_me'&&args&&!['on','off'].includes(args.toLowerCase()))return args.length<=8192?
      {kind:'set_mode',mode:'grill_me',lifetime:'chat',objective:args,context:captured}:unavailable('invalid_arguments');
    if (args && !['on', 'off'].includes(args.toLowerCase())) return unavailable('invalid_arguments');
    return { kind: 'set_mode', mode: args.toLowerCase() === 'off' ? 'action' : id,
      lifetime: id === 'boost' ? 'next_turn' : 'chat', context: captured };
  }
  if (args) return unavailable('invalid_arguments');
  if (id === 'stop' && !captured.sessionId) return unavailable('missing_session');
  const kind = { model: 'open_model_picker', new: 'new_session', stop: 'stop_turn', help: 'open_help' } as const;
  return { kind: kind[id], context: captured };
}
