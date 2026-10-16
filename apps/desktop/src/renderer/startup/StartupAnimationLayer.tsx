import { useEffect, useRef, useState } from 'react';
import { createStartupAnimation, I18N_TEXTS, TIMING_DATA } from '../../../../../docs/design/startup-animation/startup-animation.js';
import './StartupScreen.css';
import welcomeTiming from '../../../../../docs/design/startup-animation/timing/welcome-in.json';
import tonesTiming from '../../../../../docs/design/startup-animation/timing/three-ascending-tones.json';
import untitledTiming from '../../../../../docs/design/startup-animation/timing/untitled.json';
import springTiming from '../../../../../docs/design/startup-animation/timing/spring-vibes.json';
import unlockTiming from '../../../../../docs/design/startup-animation/timing/unlock-gesture.json';
import type { StartupPhaseId } from './startup-screen-state.js';
import { readStartupPreferences } from './startup-preferences.js';

export const startupAnimationLocales = Object.keys(I18N_TEXTS);

const clipUrls = {
  'welcome-in': new URL('../../../../../docs/design/startup-animation/audio/welcome-in.mp3', import.meta.url).href,
  'three-ascending-tones': new URL('../../../../../docs/design/startup-animation/audio/three-ascending-tones.mp3', import.meta.url).href,
  untitled: new URL('../../../../../docs/design/startup-animation/audio/untitled.mp3', import.meta.url).href,
  'spring-vibes': new URL('../../../../../docs/design/startup-animation/audio/spring-vibes.mp3', import.meta.url).href,
  'unlock-gesture': new URL('../../../../../docs/design/startup-animation/audio/unlock-gesture.mp3', import.meta.url).href
} as const;

const measuredTiming = {
  'welcome-in': welcomeTiming,
  'three-ascending-tones': tonesTiming,
  untitled: untitledTiming,
  'spring-vibes': springTiming,
  'unlock-gesture': unlockTiming
} as const;

export type StartupClipId = keyof typeof clipUrls;

type Measured = { duration_ms?: number; global_peak_ms?: number; decay_start_ms?: number; onsets?: { ms?: number }[] };

/** Cue actions stay with the engine. Durations and onset marks come from timing/*.json. */
export function timingForClip(clipId: StartupClipId) {
  const base = TIMING_DATA[clipId];
  const measured = measuredTiming[clipId] as Measured;
  const onsetsMs = (measured.onsets || []).map(item => Number(item.ms)).filter(ms => Number.isFinite(ms));
  return {
    ...base,
    durationMs: typeof measured.duration_ms === 'number' ? measured.duration_ms : base.durationMs,
    mainPeakMs: typeof measured.global_peak_ms === 'number' ? measured.global_peak_ms : base.mainPeakMs,
    tailStartMs: typeof measured.decay_start_ms === 'number' ? measured.decay_start_ms : base.tailStartMs,
    onsetsMs: onsetsMs.length ? onsetsMs : base.onsetsMs
  };
}

export function clipIdFromSound(soundId: string | undefined, afterUnlock: boolean): StartupClipId {
  if (afterUnlock) return 'unlock-gesture';
  const match = /^asset:([a-z0-9-]+)$/.exec(soundId || '');
  const id = match?.[1];
  return id && id in clipUrls ? id as StartupClipId : 'welcome-in';
}

export type StartupDemoScene = 'unlock-input' | 'unlock-success' | 'coldstart-loop' | 'transition';

/** Maps the live startup gate onto the demo scenes from startup-animation-demo.html. */
export function startupSceneForState(input: {
  locked: boolean;
  afterUnlock: boolean;
  phaseReady: boolean;
}): StartupDemoScene {
  if (input.locked) return 'unlock-input';
  if (input.afterUnlock && !input.phaseReady) return 'unlock-success';
  if (input.phaseReady) return 'transition';
  return 'coldstart-loop';
}

export function startupPersona(personality: string | undefined): 'nova' | 'orion' | 'patch' | 'spark' | 'zen' | 'custom' {
  if (personality === 'analytical') return 'orion';
  if (personality === 'developer') return 'patch';
  if (personality === 'creative') return 'spark';
  if (personality === 'mentor') return 'zen';
  if (personality === 'custom' || personality === 'orion' || personality === 'patch' || personality === 'spark' || personality === 'zen' || personality === 'nova') return personality;
  return 'nova';
}

function readActivePersona(): ReturnType<typeof startupPersona> {
  try {
    const raw = JSON.parse(window.localStorage.getItem('lastbrowser.standardChatCompanion.v1') || '');
    return startupPersona(typeof raw?.personality === 'string' ? raw.personality : 'nova');
  } catch {
    return 'nova';
  }
}

type Frame = { currentTimeMs: number; durationMs: number; fps: number; driftMs: number; nextCue: string };
type AnimationApi = {
  play: (scene?: string) => Promise<void> | void;
  setPhase: (phase: string) => void;
  error: () => void;
  setRainbow: (style: string) => void;
  setAudioOptions: (audio: { volume?: number; enabled?: boolean }) => void;
  destroy: () => void;
};

/** First scene to start. A verified password always opens on unlock-success, even when the shell is already ready. */
export function startupPlaybackScene(input: {
  locked: boolean;
  afterUnlock: boolean;
  phaseReady: boolean;
}, active: StartupDemoScene | null): StartupDemoScene {
  if (active === 'unlock-success') return 'unlock-success';
  const mapped = startupSceneForState(input);
  if (input.afterUnlock && !input.locked && mapped === 'transition' && active !== 'coldstart-loop' && active !== 'transition') {
    return 'unlock-success';
  }
  return mapped;
}

export function StartupAnimationLayer({
  locale,
  phase,
  afterUnlock,
  locked = false,
  authError = '',
  soundId,
  onFinished
}: {
  locale: string;
  phase: StartupPhaseId | null;
  afterUnlock: boolean;
  locked?: boolean;
  authError?: string;
  soundId?: string;
  onFinished: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<AnimationApi | null>(null);
  const sceneRef = useRef<StartupDemoScene>('coldstart-loop');
  const phaseRef = useRef(phase);
  const onFinishedRef = useRef(onFinished);
  phaseRef.current = phase;
  onFinishedRef.current = onFinished;
  const [feed, setFeed] = useState<{ clip: string; time: string; cue: string; fps: string; drift: string; last: string } | null>(null);
  const showFeed = readStartupPreferences().eventFeed;
  const clipId = clipIdFromSound(soundId || readStartupPreferences().soundId, afterUnlock);

  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    const preferences = readStartupPreferences();
    const timing = timingForClip(clipId);
    const playScene = (scene: StartupDemoScene) => {
      sceneRef.current = scene;
      return api.current?.play(scene);
    };
    const gate = { locked, afterUnlock, phaseReady: phaseRef.current === 'ready' };
    const initial = startupPlaybackScene(gate, null);
    const anim = createStartupAnimation(el, {
      audio: {
        url: clipUrls[clipId],
        timing,
        volume: preferences.volume,
        enabled: preferences.soundEnabled
      },
      scene: initial,
      persona: readActivePersona(),
      locale: startupAnimationLocales.includes(locale) ? locale : 'en',
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      rainbow: preferences.rainbow ? preferences.rainbowStyle : 'none',
      target: () => document.querySelector('.app-shell .nova-dock-btn.avatar-btn'),
      onCue: (cue: { do?: string; at?: number }) => {
        setFeed(current => current ? { ...current, last: `${cue.do || 'cue'} (${cue.at ?? 0} ms)` } : current);
      },
      onFrame: (frame: Frame) => {
        setFeed(current => ({
          clip: `${clipId} / ${timing.theme || clipId}`,
          time: `${Math.round(frame.currentTimeMs)} / ${frame.durationMs} ms`,
          cue: frame.nextCue,
          fps: `${frame.fps} fps`,
          drift: `${frame.driftMs.toFixed(2)} ms`,
          last: current?.last || 'init'
        }));
      },
      onComplete: (reason?: string) => {
        if (reason === 'skip') {
          onFinishedRef.current();
          return;
        }
        if (sceneRef.current === 'unlock-success') {
          void playScene(phaseRef.current === 'ready' ? 'transition' : 'coldstart-loop');
          return;
        }
        if (sceneRef.current === 'transition') onFinishedRef.current();
      }
    }) as AnimationApi;
    api.current = anim;
    sceneRef.current = initial;
    void anim.play(initial);
    if (phaseRef.current && phaseRef.current !== 'ready') anim.setPhase(phaseRef.current);
    return () => {
      anim.destroy();
      api.current = null;
    };
  }, [afterUnlock, clipId, locale, locked]);

  useEffect(() => {
    const anim = api.current;
    if (!anim) return;
    if (phase && phase !== 'ready') anim.setPhase(phase);
    const next = startupPlaybackScene(
      { locked, afterUnlock, phaseReady: phase === 'ready' },
      sceneRef.current
    );
    if (sceneRef.current !== next) {
      sceneRef.current = next;
      void anim.play(next);
    }
  }, [afterUnlock, locked, phase]);

  useEffect(() => {
    const apply = () => {
      const preferences = readStartupPreferences();
      api.current?.setRainbow(preferences.rainbow ? preferences.rainbowStyle : 'none');
      api.current?.setAudioOptions({ volume: preferences.volume, enabled: preferences.soundEnabled });
    };
    window.addEventListener('lastbrowser:startup-preferences', apply);
    return () => window.removeEventListener('lastbrowser:startup-preferences', apply);
  }, []);

  useEffect(() => {
    if (authError) api.current?.error();
  }, [authError]);

  return (
    <div className={`startup-animation-layer${locked ? ' is-external-auth' : ''}`} style={{ position: 'fixed', inset: 0, zIndex: 2100 }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      {showFeed && feed && (
        <div role="status" aria-live="polite" style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 2, minWidth: 240, padding: '8px 10px', borderRadius: 8, background: 'rgba(6,16,26,.82)', color: '#d7e7f7', font: '12px/1.45 ui-monospace, Consolas, monospace' }}>
          <div>Clip / Theme: {feed.clip}</div>
          <div>Audiozeit: {feed.time}</div>
          <div>Nächster Cue: {feed.cue}</div>
          <div>FPS: {feed.fps}</div>
          <div>A/V-Drift: {feed.drift}</div>
          <div>Letztes Ereignis: {feed.last}</div>
        </div>
      )}
    </div>
  );
}
