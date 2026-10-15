export type SidekickMotion = 'idle' | 'thinking' | 'working' | 'done' | 'needs-input' | 'error';
export type SidekickRunState = 'idle' | 'starting' | 'streaming' | 'cancelling' | 'error';
export type EnginePersona = 'nova' | 'orion' | 'patch' | 'spark' | 'zen' | 'custom';

export function enginePersona(personality: string): EnginePersona {
  if (personality === 'analytical') return 'orion';
  if (personality === 'developer') return 'patch';
  if (personality === 'creative') return 'spark';
  if (personality === 'mentor') return 'zen';
  if (personality === 'custom') return 'custom';
  return 'nova';
}

export function sidekickMotionFromRun(input: {
  runState: SidekickRunState;
  sawToken: boolean;
  toolRunning: boolean;
  needsInput: boolean;
  unreachable: boolean;
  previous: SidekickMotion;
}): SidekickMotion {
  if (input.unreachable || input.runState === 'cancelling' || input.runState === 'error') return 'error';
  if (input.needsInput) return 'needs-input';
  if (input.runState === 'starting' || (input.runState === 'streaming' && !input.sawToken && !input.toolRunning)) return 'thinking';
  if (input.toolRunning || input.runState === 'streaming') return 'working';
  if (input.runState === 'idle' && (input.previous === 'thinking' || input.previous === 'working')) return 'done';
  if (input.runState === 'idle' && input.previous === 'done') return 'done';
  return 'idle';
}
