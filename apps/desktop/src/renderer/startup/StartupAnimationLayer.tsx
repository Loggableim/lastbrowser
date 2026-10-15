import { useEffect, useRef, useState } from 'react';
import { createStartupAnimation, I18N_TEXTS, TIMING_DATA } from '../../../../../docs/design/startup-animation/startup-animation.js';
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

export function StartupAnimationLayer({
  locale,
  phase,
  afterUnlock,
  soundId,
  onFinished
}: {
  locale: string;
  phase: StartupPhaseId | null;
  afterUnlock: boolean;
  soundId?: string;
  onFinished: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ setPhase: (phase: string) => void; ready: () => void; destroy: () => void } | null>(null);
  const [feed, setFeed] = useState<{ clip: string; time: string; cue: string; fps: string; drift: string; last: string } | null>(null);
  const showFeed = readStartupPreferences().eventFeed;
  const clipId = clipIdFromSound(soundId, afterUnlock);

  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    const preferences = readStartupPreferences();
    const timing = timingForClip(clipId);
    const anim = createStartupAnimation(el, {
      audio: {
        url: clipUrls[clipId],
        timing,
        volume: preferences.volume,
        enabled: preferences.soundEnabled
      },
      scene: afterUnlock ? 'unlock-success' : 'full',
      persona: readActivePersona(),
      locale: startupAnimationLocales.includes(locale) ? locale : 'en',
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      rainbow: preferences.rainbow ? preferences.rainbowStyle : 'none',
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
      onComplete: onFinished
    });
    api.current = anim;
    void anim.play();
    return () => {
      anim.destroy();
      api.current = null;
    };
  }, [afterUnlock, clipId, locale, onFinished]);

  useEffect(() => {
    if (!phase || !api.current) return;
    if (phase === 'ready') api.current.ready();
    else api.current.setPhase(phase);
  }, [phase]);

  return (
    <div className="startup-animation-layer" style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
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
