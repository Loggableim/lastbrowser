import { useEffect, useState } from 'react';
export const startupAnimations = [
  { id: 'awakening', label: 'Sanftes Erwachen', duration: 550 },
  { id: 'companion', label: 'Sidekick zieht ein', duration: 650 },
  { id: 'glass', label: 'Glas löst sich auf', duration: 450 },
  { id: 'light', label: 'Licht öffnet den Raum', duration: 600 }
] as const;
export type StartupAnimation = typeof startupAnimations[number]['id'];
export type StartupPreferences = { animation: StartupAnimation; soundEnabled: boolean; volume: number; soundId: string; randomSound: boolean; rainbow: boolean };
export const defaultStartupPreferences: StartupPreferences = { animation: 'awakening', soundEnabled: false, volume: 0.35, soundId: 'asset:welcome-in', randomSound: false, rainbow: true };
const key = 'lastbrowser.startup-preferences.v1';
const changed = 'lastbrowser:startup-preferences';
function validated(value: unknown): StartupPreferences {
  const v = value && typeof value === 'object' ? value as Partial<StartupPreferences> : {};
  return { animation: startupAnimations.some(a => a.id === v.animation) ? v.animation! : 'awakening',
    soundEnabled: v.soundEnabled === true, volume: typeof v.volume === 'number' && Number.isFinite(v.volume) ? Math.min(1, Math.max(0, v.volume)) : 0.35,
    soundId: typeof v.soundId === 'string' && /^(asset|local):[a-zA-Z0-9_-]{1,100}$/.test(v.soundId) ? v.soundId : 'asset:welcome-in',
    randomSound: v.randomSound === true, rainbow: v.rainbow !== false };
}
let sessionPreferences: StartupPreferences | null = null;
export function readStartupPreferences(): StartupPreferences {
  if (sessionPreferences) return sessionPreferences;
  try { return validated(JSON.parse(localStorage.getItem(key) || '{}')); } catch { return { ...defaultStartupPreferences }; }
}
export function saveStartupPreferences(value: StartupPreferences): boolean {
  const next = validated(value);
  sessionPreferences = next;
  let persisted = true;
  try { localStorage.setItem(key, JSON.stringify(next)); } catch { persisted = false; }
  window.dispatchEvent(new Event(changed));
  return persisted;
}
export function useStartupPreferences() {
  const [preferences, setPreferences] = useState(readStartupPreferences);
  useEffect(() => {
    const update = () => setPreferences(readStartupPreferences());
    const sync = (event: StorageEvent) => { if (event.key === key) { sessionPreferences = null; update(); } };
    window.addEventListener(changed, update); window.addEventListener('storage', sync);
    return () => { window.removeEventListener(changed, update); window.removeEventListener('storage', sync); };
  }, []);
  return preferences;
}
export type StartupSound = { id: string; label: string; durationMs: number; url?: string; blob?: Blob };
// Durations measured from the user-supplied MP3 System.Media.Duration metadata.
export const startupSoundAssets: readonly StartupSound[] = [
  { id: 'asset:welcome-in', label: 'Welcome In', durationMs: 6048, url: new URL('./assets/sounds/welcome-in.mp3', import.meta.url).href },
  { id: 'asset:three-ascending-tones', label: 'Three Ascending Tones', durationMs: 6528, url: new URL('./assets/sounds/three-ascending-tones.mp3', import.meta.url).href },
  { id: 'asset:untitled', label: 'Untitled', durationMs: 6456, url: new URL('./assets/sounds/untitled.mp3', import.meta.url).href },
  { id: 'asset:spring-vibes', label: 'Spring vibes', durationMs: 5640, url: new URL('./assets/sounds/spring-vibes.mp3', import.meta.url).href },
  { id: 'asset:unlock-gesture', label: 'Unlock Gesture', durationMs: 5640, url: new URL('./assets/sounds/unlock-gesture.mp3', import.meta.url).href }
];
export function chooseStartupSound(preferences: StartupPreferences): StartupSound | null {
  if (!startupSoundAssets.length) return null;
  return preferences.randomSound
    ? startupSoundAssets[Math.floor(Math.random() * startupSoundAssets.length)] ?? null
    : startupSoundAssets.find(sound => sound.id === preferences.soundId) ?? null;
}
export async function listStartupSounds(): Promise<StartupSound[]> { return [...startupSoundAssets]; }
export function useStartupSounds(): readonly StartupSound[] { return startupSoundAssets; }
/** Call only after verified authentication + readiness, or explicit user-requested preview. */
export function playStartupSound(preferences: StartupPreferences, onError?: () => void, chosenSound?: StartupSound | null): () => void {
  let cancelled = false; let audio: HTMLAudioElement | null = null; let objectUrl: string | null = null;
  const cleanup = () => { cancelled = true; audio?.pause(); if (audio) audio.src = ''; if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; } };
  void listStartupSounds().then(sounds => {
    if (cancelled || !preferences.soundEnabled || !sounds.length) return;
    const sound = chosenSound === undefined ? chooseStartupSound(preferences) : chosenSound;
    if (!sound) return;
    const url = sound.blob ? (objectUrl = URL.createObjectURL(sound.blob)) : sound.url;
    if (!url) return;
    audio = new Audio(url); audio.volume = preferences.volume;
    audio.addEventListener('ended', cleanup, { once: true });
    audio.addEventListener('error', () => { if (!cancelled) onError?.(); cleanup(); }, { once: true });
    void audio.play().catch(() => { if (!cancelled) onError?.(); cleanup(); });
  }).catch(() => { if (!cancelled) onError?.(); });
  return cleanup;
}

