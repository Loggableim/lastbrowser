import { useEffect, useState } from 'react';
import { STARTUP_AUDIO_CLOCK_EVENT, type StartupAudioClock } from './sound-opening.js';
export const startupAnimations = [
  { id: 'awakening', label: 'Sanftes Erwachen', duration: 550 },
  { id: 'companion', label: 'Sidekick zieht ein', duration: 650 },
  { id: 'glass', label: 'Glas löst sich auf', duration: 450 },
  { id: 'light', label: 'Licht öffnet den Raum', duration: 600 }
] as const;
export type StartupAnimation = typeof startupAnimations[number]['id'];
export const startupRainbowStyles = ['classic', 'aurora', 'orbit'] as const;
export type StartupRainbowStyle = typeof startupRainbowStyles[number];
export type StartupPreferences = { animation: StartupAnimation; soundEnabled: boolean; volume: number; soundId: string; randomSound: boolean; rainbow: boolean; rainbowStyle: StartupRainbowStyle; eventFeed: boolean };
export const defaultStartupPreferences: StartupPreferences = { animation: 'awakening', soundEnabled: false, volume: 0.35, soundId: 'asset:welcome-in', randomSound: false, rainbow: true, rainbowStyle: 'classic', eventFeed: true };
const key = 'lastbrowser.startup-preferences.v1';
const changed = 'lastbrowser:startup-preferences';
function validated(value: unknown): StartupPreferences {
  const v = value && typeof value === 'object' ? value as Partial<StartupPreferences> : {};
  return { animation: startupAnimations.some(a => a.id === v.animation) ? v.animation! : 'awakening',
    soundEnabled: v.soundEnabled === true, volume: typeof v.volume === 'number' && Number.isFinite(v.volume) ? Math.min(1, Math.max(0, v.volume)) : 0.35,
    soundId: typeof v.soundId === 'string' && /^(asset|local):[a-zA-Z0-9_-]{1,100}$/.test(v.soundId) ? (v.soundId === 'asset:untitled' ? 'asset:first-light' : v.soundId) : 'asset:welcome-in',
    randomSound: v.randomSound === true, rainbow: v.rainbow !== false,
    rainbowStyle: startupRainbowStyles.some(style => style === v.rainbowStyle) ? v.rainbowStyle! : 'classic',
    eventFeed: v.eventFeed !== false };
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
  { id: 'asset:first-light', label: 'First Light', durationMs: 6456, url: new URL('./assets/sounds/first-light.mp3', import.meta.url).href },
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
export function playStartupSound(preferences: StartupPreferences, onError?: () => void, chosenSound?: StartupSound | null,
  options: { purpose: 'startup' | 'preview' } = { purpose: 'startup' }): () => void {
  let cancelled = false; let audio: HTMLAudioElement | null = null; let objectUrl: string | null = null;
  let frame = 0; let context: AudioContext | null = null; let source: MediaElementAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null; let sound: StartupSound | null = null;
  let baseline = 0.015; let pulse = 0; let lastOnset = -1000; let lastTick = performance.now();
  const levels = new Uint8Array(512);
  const emitClock = (ended = false) => {
    if (!sound || !audio) return;
    const durationMs = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration * 1000 : sound.durationMs;
    window.dispatchEvent(new CustomEvent<StartupAudioClock>(STARTUP_AUDIO_CLOCK_EVENT, { detail: {
      soundId: sound.id, purpose: options.purpose, currentTimeMs: Math.max(0, audio.currentTime * 1000), durationMs,
      beat: pulse, playing: !audio.paused && !ended, ended
    } }));
  };
  const cleanup = () => {
    if (cancelled) return;
    emitClock(true); cancelled = true; cancelAnimationFrame(frame); audio?.pause();
    source?.disconnect(); analyser?.disconnect();
    if (context) { void context.close().catch(() => {}); context = null; }
    if (audio) audio.src = '';
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
  };
  const tick = () => {
    if (cancelled || !audio) return;
    const now = performance.now();
    pulse *= Math.exp(-Math.max(0, now - lastTick) / 140);
    lastTick = now;
    if (analyser && !audio.paused) {
      analyser.getByteTimeDomainData(levels);
      let energy = 0;
      for (const value of levels) energy += ((value - 128) / 128) ** 2;
      energy = Math.sqrt(energy / levels.length);
      // Local onset detection follows the actual waveform, never a guessed BPM.
      if (energy > Math.max(0.025, baseline * 1.5) && now - lastOnset > 160) {
        pulse = Math.min(1, energy / Math.max(0.06, baseline * 2)); lastOnset = now;
      }
      baseline = baseline * 0.96 + energy * 0.04;
    }
    emitClock(); frame = requestAnimationFrame(tick);
  };
  void listStartupSounds().then(sounds => {
    if (cancelled || !preferences.soundEnabled || !sounds.length) return;
    sound = chosenSound === undefined ? chooseStartupSound(preferences) : chosenSound;
    if (!sound) return;
    const url = sound.blob ? (objectUrl = URL.createObjectURL(sound.blob)) : sound.url;
    if (!url) return;
    audio = new Audio(url); audio.volume = preferences.volume;
    audio.addEventListener('loadedmetadata', () => emitClock(), { once: true });
    audio.addEventListener('playing', () => { cancelAnimationFrame(frame); lastTick = performance.now(); tick(); });
    audio.addEventListener('ended', cleanup, { once: true });
    audio.addEventListener('error', () => { if (!cancelled) onError?.(); cleanup(); }, { once: true });
    // Establish optional analysis before playback. If unavailable, the native
    // media element still plays and its currentTime remains the animation clock.
    void (async () => {
      try {
        context = new AudioContext();
        let resumeTimer = 0;
        try { await Promise.race([context.resume(), new Promise<void>(resolve => { resumeTimer = window.setTimeout(resolve, 150); })]); }
        finally { window.clearTimeout(resumeTimer); }
        if (cancelled) { void context?.close().catch(() => {}); return; }
        if (context.state === 'running' && audio) {
          analyser = context.createAnalyser(); analyser.fftSize = 512;
          source = context.createMediaElementSource(audio); source.connect(analyser); analyser.connect(context.destination);
        } else { void context.close().catch(() => {}); context = null; }
      } catch {
        // If routing was already captured, keep an audible destination even
        // when the optional analysis node could not be installed.
        try { if (source && context) { source.disconnect(); source.connect(context.destination); } } catch { /* Best effort. */ }
      }
      if (cancelled || !audio) return;
      try { await audio.play(); } catch { if (!cancelled) onError?.(); cleanup(); }
    })();
  }).catch(() => { if (!cancelled) onError?.(); });
  return cleanup;
}

