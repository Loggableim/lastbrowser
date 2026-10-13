import { useDesktopI18n } from '../i18n.js';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Settings, Play, X } from 'lucide-react';
import { playStartupSound, saveStartupPreferences, startupAnimations, useStartupPreferences, useStartupSounds, type StartupPreferences, type StartupAnimation } from './startup-preferences.js';
import './StartupScreen.css';
export function StartupPreferencesPanel({ compact = false }: { compact?: boolean }) {
  const { locale } = useDesktopI18n();
  const c = (de: string, en: string) => locale.startsWith('de') ? de : en;
  const animationNames: Record<string, string> = { awakening: 'Gentle awakening', companion: 'Sidekick moves in', glass: 'Glass dissolves', light: 'Light opens the room' };
  const preferences = useStartupPreferences();
  const sounds = useStartupSounds();
  const [open, setOpen] = useState(!compact);
  const [preview, setPreview] = useState<{ id: number; animation: StartupAnimation; durationMs: number } | null>(null);
  const previewSerial = useRef(0);
  const [message, setMessage] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const stopSound = useRef<(() => void) | null>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => { if (!open) { stopSound.current?.(); stopSound.current = null; setPreview(null); } }, [open]);
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
  useEffect(() => { if (!preferences.soundEnabled) { stopSound.current?.(); stopSound.current = null; } }, [preferences.soundEnabled]);
  useEffect(() => () => stopSound.current?.(), []);
  useEffect(() => {
    if (!preview) return;
    const timer = window.setTimeout(() => setPreview(null), preview.durationMs + 250);
    return () => window.clearTimeout(timer);
  }, [preview]);
  const update = (patch: Partial<StartupPreferences>) => {
    setMessage(saveStartupPreferences({ ...preferences, ...patch }) ? '' : c('Nur für diese Sitzung gespeichert: lokaler Speicher ist nicht verfügbar.', 'Saved for this session only: local storage is unavailable.'));
  };
  const previewSound = () => {
    stopSound.current?.(); setMessage('');
    stopSound.current = playStartupSound({ ...preferences, soundEnabled: true }, () => setMessage(c('Dieser Sound konnte nicht abgespielt werden. Bitte ein unterstütztes Audioformat wählen.', 'Could not play this sound. Please choose a supported audio file.')));
  };
  const startAnimationPreview = () => {
    const sound = preferences.soundEnabled ? preferences.randomSound
      ? sounds[Math.floor(Math.random() * sounds.length)] : sounds.find(item => item.id === preferences.soundId) : undefined;
    const fallback = startupAnimations.find(item => item.id === preferences.animation)!.duration;
    const requested = sound?.durationMs;
    const durationMs = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 100
      : typeof requested === 'number' && Number.isFinite(requested) && requested >= 100 && requested <= 30000 ? requested : fallback;
    setPreview({ id: ++previewSerial.current, animation: preferences.animation, durationMs });
  };
  const selectedSoundExists = preferences.randomSound ? sounds.length > 0 : sounds.some(sound => sound.id === preferences.soundId);
  return <div ref={root} className={compact ? 'startup-preferences-trigger' : 'startup-preferences-inline'}>
    {compact && <button ref={trigger} type="button" className="startup-preferences-gear" aria-label={c("Startanimation und Sound einstellen", "Configure startup animation and sound")} title={c("Startanimation und Sound", "Startup animation and sound")} aria-expanded={open} aria-controls="startup-preferences-popover" onClick={() => setOpen(value => !value)}><Settings size={17} /></button>}
    {open && <div ref={panel} id={compact ? 'startup-preferences-popover' : undefined} className="startup-preferences-panel" role={compact ? 'dialog' : 'group'} aria-label={c("Startanimation und Sound", "Startup animation and sound")}>
      <div className="startup-preferences-heading"><strong>{c("Startanimation & Sound", "Startup animation & sound")}</strong>{compact && <button type="button" aria-label={c("Schließen", "Close")} onClick={close}><X size={15} /></button>}</div>
      <label>Animation<select value={preferences.animation} onChange={event => update({ animation: event.target.value as StartupPreferences['animation'] })}>{startupAnimations.map(item => <option key={item.id} value={item.id}>{locale.startsWith('de') ? item.label : animationNames[item.id]} · {preferences.soundEnabled && selectedSoundExists ? c("Songlänge", "Song duration") : `${item.duration} ms`}</option>)}</select></label>
      <button type="button" onClick={startAnimationPreview}><Play size={14} /> {c("Animation ansehen", "Preview animation")}</button>
      {preview && <div key={preview.id} style={{ '--startup-opening-duration': `${preview.durationMs}ms`, '--startup-movement-duration': `${Math.min(preview.durationMs, 850)}ms`, '--startup-lift-duration': `${Math.min(preview.durationMs, 550)}ms`, '--startup-departure-duration': `${Math.min(preview.durationMs, 220)}ms` } as CSSProperties} className={`startup-animation-preview startup-screen--opening startup-opening-${preview.animation}`} aria-label={c("Isolierte Animationsvorschau", "Isolated animation preview")}>
        <div className="startup-preview-header">LastBrowser <span>✦</span></div><div className="startup-preview-desktop">{c("Dein Browser", "Your browser")}</div>
        <div className="startup-preview-cover"><div className="startup-screen__content"><div className="startup-screen__art"><img className="startup-screen__icon" src={new URL('./assets/sidekick-01.png', import.meta.url).href} alt="" /></div><span>{c("Willkommen", "Welcome")}</span></div></div>
      </div>}
      <label className="startup-preferences-check"><input type="checkbox" checked={preferences.rainbow} onChange={event => update({ rainbow: event.target.checked })} /> {c("Animierter Rainbow-Rahmen", "Animated rainbow border")}</label>
      <label className="startup-preferences-check"><input type="checkbox" checked={preferences.soundEnabled} onChange={event => update({ soundEnabled: event.target.checked })} /> {c("Sound nach erfolgreicher Anmeldung", "Sound after successful sign-in")}</label>
      <label>{c("Lautstärke", "Volume")} · {Math.round(preferences.volume * 100)} %<input aria-label={c("Lautstärke", "Volume")} type="range" min="0" max="100" value={Math.round(preferences.volume * 100)} onChange={event => update({ volume: Number(event.target.value) / 100 })} /></label>
      <label>Sound<select value={preferences.soundId} disabled={!sounds.length} onChange={event => update({ soundId: event.target.value })}><option value="">{sounds.length ? c('Sound auswählen', 'Choose a sound') : c('Noch keine Sounds', 'No sounds yet')}</option>{sounds.map(sound => <option key={sound.id} value={sound.id}>{sound.label}</option>)}</select></label>
      <label className="startup-preferences-check"><input type="checkbox" checked={preferences.randomSound} onChange={event => update({ randomSound: event.target.checked })} disabled={!sounds.length} /> {c("Zufälliger Sound pro Anmeldung", "Random sound per sign-in")}</label>
      <button type="button" disabled={!selectedSoundExists} onClick={previewSound}><Play size={14} /> {c("Sound vorhören", "Preview sound")}</button>
      {!sounds.length && <small>{c("Noch keine Sounds hinterlegt. Ohne Audiodatei bleibt der Start lautlos.", "No sounds added yet. Startup remains silent until audio files are supplied.")}</small>}
      <small>{c("Einstellungen werden sofort auf diesem Gerät gespeichert. Sounds werden nicht hochgeladen.", "Settings are saved immediately on this device. Sounds are never uploaded.")}</small>
      {message && <p role="status">{message}</p>}
    </div>}
  </div>;
}
