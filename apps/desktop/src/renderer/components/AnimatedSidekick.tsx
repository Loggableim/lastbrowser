import { useEffect, useRef, useState } from 'react';
import { createSidekick } from '../../assets/sidekicks/animated/sidekick-engine.js';
import '../../assets/sidekicks/animated/sidekicks.css';
import { personalityAvatar, type CompanionPersonality } from '../personality-avatar.js';
import type { SidekickMotion } from '../sidekick-motion.js';

export type AnimatedPersona = 'nova' | 'orion' | 'patch' | 'spark' | 'zen' | 'custom';

const fallbackPersonality: Record<AnimatedPersona, CompanionPersonality> = {
  nova: 'nova',
  orion: 'analytical',
  patch: 'developer',
  spark: 'creative',
  zen: 'mentor',
  custom: 'nova'
};

type SidekickHandle = {
  setState: (state: string) => void;
  getState: () => string;
  destroy: () => void;
};

export function AnimatedSidekick({
  persona,
  state = 'idle',
  mini = false,
  color,
  label
}: {
  persona: AnimatedPersona;
  state?: SidekickMotion;
  mini?: boolean;
  color?: string;
  label?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<SidekickHandle | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    try {
      const created = createSidekick(el, { persona, mini, color, onVisibilityChange: () => undefined }) as SidekickHandle;
      api.current = created;
      created.setState(state);
      return () => {
        created.destroy();
        api.current = null;
      };
    } catch {
      setFailed(true);
      return undefined;
    }
  }, [persona, mini, color]);

  useEffect(() => {
    const current = api.current;
    if (!current) return;
    if (state === 'idle' && current.getState() === 'done') return;
    current.setState(state);
  }, [state]);

  if (failed) {
    const size = mini ? 40 : 128;
    return <img src={personalityAvatar(fallbackPersonality[persona])} alt="" width={size} height={size} />;
  }

  // The engine builds the persona SVG only into an empty host and never clears
  // it, so a new persona needs a fresh host element (key), not a reused one.
  return <div key={mini ? `${persona}-mini` : persona} ref={host} role="img" aria-label={label} data-sidekick-state={state} />;
}
