import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function AccessPasswordInput({ value, onChange, resetKey, showLabel, hideLabel }: {
  value: string;
  onChange: (value: string) => void;
  resetKey: number;
  showLabel: string;
  hideLabel: string;
}): JSX.Element {
  const [visibility, setVisibility] = useState({ key: resetKey, visible: false });
  const visible = visibility.key === resetKey && visibility.visible;
  return (
    <div className="startup-screen__auth-password">
      <input id="access-lock-password" autoFocus type={visible ? 'text' : 'password'} autoComplete="current-password"
        value={value} onChange={event => onChange(event.target.value)} />
      <button type="button" aria-label={visible ? hideLabel : showLabel} aria-pressed={visible}
        onClick={() => setVisibility({ key: resetKey, visible: !visible })}>
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  );
}
