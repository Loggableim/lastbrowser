import { useDesktopI18n } from '../i18n.js';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Settings, Play, X } from 'lucide-react';
import { chooseStartupSound, playStartupSound, saveStartupPreferences, startupAnimations, startupRainbowStyles, useStartupPreferences, useStartupSounds, type StartupPreferences } from './startup-preferences.js';
import { getSoundOpening, getSoundOpeningTheme, readStartupAudioClock, soundOpeningFrame, STARTUP_AUDIO_CLOCK_EVENT } from './sound-opening.js';
import { startupPreferencesCopy } from './startup-preferences-copy.js';
import './StartupScreen.css';
export function StartupPreferencesPanel({ compact = false }: { compact?: boolean }) {
  const { locale } = useDesktopI18n();
  const copy = startupPreferencesCopy[locale];
  const preferences = useStartupPreferences();
  const sounds = useStartupSounds();
  const rainbowStyle = copy.rainbowStyles[preferences.rainbowStyle];
  // The popover is closed on mount in every context so it can never open itself
  // over the launch animation. The gear is the only entry point.
  const [open, setOpen] = useState(false);
  // The inline variant is the visible settings card and stays expanded; only the
  // compact startup variant is gated behind the gear.
  const expanded = compact ? open : true;
  type Preview = { id: number; animation: StartupPreferences['animation']; durationMs: number; soundId: string | null };
  const [preview, setPreview] = useState<Preview | null>(null);
  const previewValue = useRef<Preview | null>(null);
  const previewElement = useRef<HTMLDivElement>(null);
  const previewSerial = useRef(0);
  const [message, setMessage] = useState<'storageUnavailable' | 'playbackFailed' | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const stopSound = useRef<(() => void) | null>(null);
  const stopPreview = () => {
    previewValue.current = null;
    stopSound.current?.(); stopSound.current = null;
    setPreview(null);
  };
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => { if (!open) stopPreview(); }, [open]);
  useEffect(() => {
    if (!open || !compact) return;
    panel.current?.querySelector<HTMLElement>('select,button,input')?.focus();
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const items = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),[tabindex="0"]') || [])];
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', keys);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keys); };
  }, [compact, open]);
  useEffect(() => { if (!preferences.soundEnabled) stopPreview(); }, [preferences.soundEnabled]);
  useEffect(() => () => { previewValue.current = null; stopSound.current?.(); }, []);
  useEffect(() => {
    const clockChanged = (event: Event) => {
      const active = previewValue.current;
      if (!active?.soundId || !(event instanceof CustomEvent)) return;
      const clock = readStartupAudioClock(event.detail, active.soundId);
      const theme = getSoundOpeningTheme(active.soundId);
      if (!clock || clock.purpose !== 'preview' || !theme) return;
      for (const [key, value] of Object.entries(soundOpeningFrame(clock.currentTimeMs / clock.durationMs, clock.beat, theme))) {
        previewElement.current?.style.setProperty(key, value);
      }
      if (active.durationMs !== clock.durationMs) {
        const next = { ...active, durationMs: clock.durationMs };
        previewValue.current = next;
        setPreview(previous => previous?.id === active.id ? next : previous);
      }
      if (clock.ended) {
        previewValue.current = null;
        stopSound.current = null;
        setPreview(null);
      }
    };
    window.addEventListener(STARTUP_AUDIO_CLOCK_EVENT, clockChanged);
    return () => window.removeEventListener(STARTUP_AUDIO_CLOCK_EVENT, clockChanged);
  }, []);
  useEffect(() => {
    if (!preview) return;
    const timer = window.setTimeout(() => {
      if (previewValue.current?.id === preview.id) stopPreview();
    }, preview.durationMs + (preview.soundId ? 5000 : 250));
    return () => window.clearTimeout(timer);
  }, [preview]);
  const update = (patch: Partial<StartupPreferences>) => {
    setMessage(saveStartupPreferences({ ...preferences, ...patch }) ? null : 'storageUnavailable');
  };
  const previewSound = () => {
    stopPreview(); setMessage(null);
    // Freeze one selection for both sound and animation, including random mode.
    const sound = chooseStartupSound(preferences);
    if (!sound) return;
    const next: Preview = { id: ++previewSerial.current, animation: preferences.animation,
      durationMs: sound.durationMs, soundId: sound.id };
    previewValue.current = next;
    setPreview(next);
    stopSound.current = playStartupSound({ ...preferences, soundEnabled: true }, () => {
      if (previewValue.current?.id !== next.id) return;
      stopPreview();
      setMessage('playbackFailed');
    }, sound, { purpose: 'preview' });
  };
  const startAnimationPreview = () => {
    stopPreview(); setMessage(null);
    const fallback = startupAnimations.find(item => item.id === preferences.animation)!.duration;
    const durationMs = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 100
      : fallback;
    const next: Preview = { id: ++previewSerial.current, animation: preferences.animation, durationMs, soundId: null };
    previewValue.current = next;
    setPreview(next);
  };
  const selectedSoundExists = preferences.randomSound ? sounds.length > 0 : sounds.some(sound => sound.id === preferences.soundId);
  const selectedOpening = getSoundOpening(preferences.soundId);
  const previewTheme = getSoundOpeningTheme(preview?.soundId ?? undefined);
  return <div ref={root} className={compact ? 'startup-preferences-trigger' : 'startup-preferences-inline'}>
    {compact && <button ref={trigger} type="button" className="startup-preferences-gear" aria-label={copy.gearLabel} title={copy.title} aria-expanded={open} aria-controls="startup-preferences-popover" onClick={() => setOpen(value => !value)}><Settings size={17} /></button>}
    {expanded && <div ref={panel} id={compact ? 'startup-preferences-popover' : undefined} className="startup-preferences-panel" role={compact ? 'dialog' : 'group'} aria-label={copy.title}>
      <div className="startup-preferences-heading"><strong>{copy.heading}</strong>{compact && <button type="button" aria-label={copy.close} onClick={close}><X size={15} /></button>}</div>
      <small>{copy.soundAnimationDescription}</small>
      <label>{copy.animationLabel}
        <select value={preferences.animation} onChange={event => update({ animation: event.target.value as StartupPreferences['animation'] })}>
          {startupAnimations.map(item => <option key={item.id} value={item.id}>{copy.animations[item.id]} · {item.duration} ms</option>)}
        </select>
      </label>
      <button type="button" onClick={startAnimationPreview}><Play size={14} /> {copy.previewSilent}</button>
      {preview && <div key={preview.id} data-startup-sound={preview.soundId ?? undefined} style={{ '--startup-opening-duration': `${preview.durationMs}ms`, '--startup-movement-duration': `${Math.min(preview.durationMs, 850)}ms`, '--startup-lift-duration': `${Math.min(preview.durationMs, 550)}ms`, '--startup-departure-duration': `${Math.min(preview.durationMs, 220)}ms` } as CSSProperties} className={`startup-animation-preview${previewTheme ? '' : ` startup-screen--opening startup-opening-${preview.animation}`}`} aria-label={copy.animationPreview}>
        <div className="startup-preview-header">LastBrowser <span>✦</span></div><div className="startup-preview-desktop">{copy.browserPreview}</div>
        <div ref={previewElement} style={previewTheme ? soundOpeningFrame(0, 0, previewTheme) as CSSProperties : undefined} className={`startup-preview-cover startup-rainbow-frame startup-rainbow-${preferences.rainbowStyle}${preferences.rainbow ? '' : ' startup-screen--no-rainbow'}${previewTheme ? ` startup-sound-opening startup-sound-${previewTheme}` : ''}`}>{previewTheme && <div className="startup-sound-scene" aria-hidden="true"><i /><i /><i /></div>}<div className="startup-screen__content"><div className="startup-screen__art"><img className="startup-screen__icon" src={new URL('./assets/sidekick-01.png', import.meta.url).href} alt="" /></div><span>{copy.welcome}</span></div></div>
      </div>}
      {preview && <button type="button" onClick={stopPreview}><X size={14} /> {copy.stopPreview}</button>}
      <label className="startup-preferences-check"><input type="checkbox" checked={preferences.rainbow} onChange={event => update({ rainbow: event.target.checked })} /> {copy.rainbowEnabled}</label>
      <label>{copy.rainbowStyle}
        <select value={preferences.rainbowStyle} disabled={!preferences.rainbow} onChange={event => update({ rainbowStyle: event.target.value as StartupPreferences['rainbowStyle'] })}>
          {startupRainbowStyles.map(style => <option key={style} value={style}>{copy.rainbowStyles[style].label}</option>)}
        </select>
      </label>
      <div className={`startup-rainbow-swatch startup-rainbow-frame startup-rainbow-${preferences.rainbowStyle}${preferences.rainbow ? '' : ' startup-screen--no-rainbow'}`} role="img" aria-label={preferences.rainbow ? rainbowStyle.description : copy.rainbowOff}><span>{preferences.rainbow ? rainbowStyle.label : copy.borderOff}</span></div>
      <small>{rainbowStyle.description}</small>
      <label className="startup-preferences-check"><input type="checkbox" checked={preferences.soundEnabled} onChange={event => update({ soundEnabled: event.target.checked })} /> {copy.signInSound}</label>
      <label className="startup-preferences-check"><input type="checkbox" checked={preferences.eventFeed} onChange={event => update({ eventFeed: event.target.checked })} /> {copy.eventFeed}</label>
      <label>{copy.volume} · {Math.round(preferences.volume * 100)} %<input aria-label={copy.volume} type="range" min="0" max="100" value={Math.round(preferences.volume * 100)} onChange={event => update({ volume: Number(event.target.value) / 100 })} /></label>
      <label>{copy.sound}
        <select value={preferences.soundId} disabled={!sounds.length} onChange={event => update({ soundId: event.target.value })}>
          <option value="">{sounds.length ? copy.chooseSound : copy.noSounds}</option>
          {sounds.map(sound => {
            const opening = getSoundOpening(sound.id);
            const label = [sound.label];
            if (opening) {
              label.push(copy.soundThemes[opening.animation]);
              if (opening.beatSynced) label.push(copy.beatSynced);
            }
            return <option key={sound.id} value={sound.id}>{label.join(' · ')}</option>;
          })}
        </select>
      </label>
      {preferences.randomSound ? <small>{copy.randomExplanation}</small> : selectedOpening && <small>
        {copy.matchingAnimation} {copy.soundThemes[selectedOpening.animation]} · {selectedOpening.beatSynced ? copy.beatSynced : copy.followsSoundLength}
      </small>}
      <label className="startup-preferences-check"><input type="checkbox" checked={preferences.randomSound} onChange={event => update({ randomSound: event.target.checked })} disabled={!sounds.length} /> {copy.randomSound}</label>
      <button type="button" disabled={!selectedSoundExists} onClick={previewSound}><Play size={14} /> {copy.previewSound}</button>
      {!sounds.length && <small>{copy.silentWithoutAudio}</small>}
      <small>{copy.localSettings}</small>
      {message && <p role="status">{copy[message]}</p>}
    </div>}
  </div>;
}
