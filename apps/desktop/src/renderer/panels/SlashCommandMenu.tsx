import React, { useEffect, useId, useRef, useState } from 'react';
import { chatCommandCopy } from '../chat-command-copy.js';
import { commandAvailable, filterChatCommands } from '../chat-command-registry.js';
import type { ChatCommandDefinition } from '../chat-command-registry.js';
import type { CommandCapabilities } from '../CommandActionContracts.js';
import './chat-command-controls.css';

export interface SlashCommandMenuProps {
  locale: string;
  query?: string;
  capabilities: CommandCapabilities;
  onChoose: (command: ChatCommandDefinition) => void;
  onClose: () => void;
}
export function SlashCommandMenu({ locale, query = '', capabilities, onChoose, onClose }: SlashCommandMenuProps): React.JSX.Element {
  const copy = chatCommandCopy(locale);
  const [search, setSearch] = useState(query);
  const [selected, setSelected] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const id = useId();
  const commands = filterChatCommands(search);
  useEffect(() => { setSearch(query); setSelected(0); }, [query]);
  useEffect(() => { container.current?.querySelector<HTMLInputElement>('input')?.focus(); }, []);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [onClose]);
  const active = Math.min(selected, Math.max(0, commands.length - 1));
  return <div ref={container} className="chat-command-menu" role="dialog" aria-label={copy.menu}
    onKeyDown={event => {
      if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setSelected(commands.length ? (active + (event.key === 'ArrowDown' ? 1 : -1) + commands.length) % commands.length : 0);
      }
      if (event.key === 'Enter') {
        event.preventDefault(); const command = commands[active];
        if (command && commandAvailable(command.id, capabilities)) onChoose(command);
      }
    }}>
    <input aria-label={copy.search} role="combobox" aria-expanded="true" aria-controls={id}
      aria-activedescendant={commands.length ? `${id}-${active}` : undefined} value={search}
      onChange={event => { setSearch(event.target.value); setSelected(0); }} />
    <div role="listbox" id={id} aria-label={copy.menu}>
      {commands.map((command, index) => {
        const available = commandAvailable(command.id, capabilities);
        return <div role="option" id={`${id}-${index}`} key={command.id} aria-selected={active === index}
          aria-disabled={!available} className={active === index ? 'selected' : ''}>
          <button type="button" tabIndex={-1} disabled={!available} onClick={() => onChoose(command)}>
            <strong>/{command.name}</strong><span>{copy.commands[command.id]}</span>
            <small>{available ? copy[command.lifetime] : copy.unavailable}</small>
          </button>
        </div>;
      })}
      {!commands.length && <p role="status">{copy.empty}</p>}
    </div>
  </div>;
}
