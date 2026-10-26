export const STARTUP_AUDIO_CLOCK_EVENT = 'lastbrowser:startup-audio-clock';

export const soundOpeningThemes = {
  'asset:welcome-in': 'welcome-aurora',
  'asset:three-ascending-tones': 'tones-rise',
  'asset:first-light': 'first-light',
  'asset:spring-vibes': 'spring-orbit',
  'asset:unlock-gesture': 'unlock-ripple'
} as const;

export type SoundOpeningTheme = typeof soundOpeningThemes[keyof typeof soundOpeningThemes];
export type StartupAudioClock = {
  soundId: string;
  purpose: 'startup' | 'preview';
  currentTimeMs: number;
  durationMs: number;
  beat: number;
  playing: boolean;
  ended: boolean;
};

export function getSoundOpeningTheme(soundId?: string): SoundOpeningTheme | null {
  return soundId && Object.hasOwn(soundOpeningThemes, soundId)
    ? soundOpeningThemes[soundId as keyof typeof soundOpeningThemes] : null;
}

const themeLabels: Record<SoundOpeningTheme, [string, string]> = {
  'welcome-aurora': ['Aurora', 'Aurora'],
  'tones-rise': ['Drei Lichtstufen', 'Three light steps'],
  'first-light': ['Erstes Licht', 'First light'],
  'spring-orbit': ['Frühlingsorbit', 'Spring orbit'],
  'unlock-ripple': ['Lichtimpuls', 'Unlock ripple']
};

export function getSoundOpening(soundId?: string) {
  const animation = getSoundOpeningTheme(soundId);
  return animation ? {
    animation, labelDe: themeLabels[animation][0], labelEn: themeLabels[animation][1],
    beatSynced: animation === 'tones-rise' || animation === 'spring-orbit' || animation === 'unlock-ripple'
  } : null;
}

export function readStartupAudioClock(value: unknown, soundId: string): StartupAudioClock | null {
  if (!value || typeof value !== 'object') return null;
  const clock = value as Partial<StartupAudioClock>;
  if (clock.soundId !== soundId || (clock.purpose !== 'startup' && clock.purpose !== 'preview')
    || typeof clock.currentTimeMs !== 'number' || !Number.isFinite(clock.currentTimeMs)
    || clock.currentTimeMs < 0 || typeof clock.durationMs !== 'number' || !Number.isFinite(clock.durationMs)
    || clock.durationMs <= 0 || typeof clock.beat !== 'number' || !Number.isFinite(clock.beat)
    || typeof clock.playing !== 'boolean' || typeof clock.ended !== 'boolean') return null;
  return { ...clock, beat: Math.max(0, Math.min(1, clock.beat)) } as StartupAudioClock;
}

/** Every transform is a function of the playback position, including paused/seeking audio. */
export function soundOpeningFrame(progress: number, beat: number, theme: SoundOpeningTheme): Record<string, string> {
  const p = Math.max(0, Math.min(1, progress));
  const b = theme === 'tones-rise' || theme === 'spring-orbit' || theme === 'unlock-ripple'
    ? Math.max(0, Math.min(1, beat)) : 0;
  const departure = Math.max(0, (p - 0.78) / 0.22);
  return {
    '--sound-progress': String(p),
    '--sound-beat': String(b),
    '--sound-opacity': String(1 - departure),
    '--sound-content-opacity': String(1 - Math.max(0, (p - 0.65) / 0.35)),
    '--sound-rotation': `${p * 200}deg`,
    '--sound-rise': `${-p * 64}px`,
    '--sound-scale': String(0.55 + p * 1.7 + b * 0.14),
    '--sound-mascot-scale': String(1 + b * 0.025 - departure * 0.12),
    '--sound-glow-opacity': String(0.3 + Math.sin(p * Math.PI) * 0.5 + b * 0.2),
    '--sound-beam-width': `${8 + p * 145}%`,
    '--sound-ring-opacity': String((0.3 + b * 0.65) * (1 - departure)),
    '--sound-step-one': String(Math.min(1, p * 3)),
    '--sound-step-two': String(Math.max(0, Math.min(1, p * 3 - 1))),
    '--sound-step-three': String(Math.max(0, Math.min(1, p * 3 - 2)))
  };
}
