import { useDesktopI18n } from '../i18n.js';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Settings, Play, X } from 'lucide-react';
import { chooseStartupSound, playStartupSound, saveStartupPreferences, startupAnimations, startupRainbowStyles, useStartupPreferences, useStartupSounds, type StartupPreferences } from './startup-preferences.js';
import { getSoundOpening, getSoundOpeningTheme, readStartupAudioClock, soundOpeningFrame, STARTUP_AUDIO_CLOCK_EVENT } from './sound-opening.js';
import './StartupScreen.css';
export function StartupPreferencesPanel({ compact = false }: { compact?: boolean }) {
  const { locale } = useDesktopI18n();
  const c = (de: string, en: string) => locale.startsWith('de') ? de : en;
  const animationNames: Record<string, string> = { awakening: 'Gentle awakening', companion: 'Sidekick moves in', glass: 'Glass dissolves', light: 'Light opens the room' };
  const rainbowNames = { classic: c('Klassischer Rainbow-Flow', 'Classic rainbow flow'), aurora: c('Sanfter Aurora-Flow', 'Soft aurora flow'), orbit: c('Umlaufendes Lichtband', 'Orbit light band') };
  const rainbowDescriptions = { classic: c('Alle Regenbogenfarben fließen gleichmäßig um den Rahmen.', 'All rainbow colors flow evenly around the frame.'), aurora: c('Weiche Cyan-, Violett- und Rosatöne bewegen sich langsam hin und zurück.', 'Soft cyan, violet and pink hues drift slowly back and forth.'), orbit: c('Ein heller Lichtbogen umrundet einen ruhigen, dunklen Rahmen.', 'A bright arc circles a calm, dark frame.') };
  const preferences = useStartupPreferences();
  const sounds = useStartupSounds();
  const [open, setOpen] = useState(!compact);
  type Preview = { id: number; animation: StartupPreferences['animation']; durationMs: number; soundId: string | null };
  const [preview, setPreview] = useState<Preview | null>(null);
  const previewValue = useRef<Preview | null>(null);
  const previewElement = useRef<HTMLDivElement>(null);
  const previewSerial = useRef(0);
  const [message, setMessage] = useState('');
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
    setMessage(saveStartupPreferences({ ...preferences, ...patch }) ? '' : c('Nur für diese Sitzung gespeichert: lokaler Speicher ist nicht verfügbar.', 'Saved for this session only: local storage is unavailable.'));
  };
  const previewSound = () => {
    stopPreview(); setMessage('');
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
      setMessage(c('Dieser Sound konnte nicht abgespielt werden. Bitte ein unterstütztes Audioformat wählen.', 'Could not play this sound. Please choose a supported audio file.'));
    }, sound, { purpose: 'preview' });
  };
  const startAnimationPreview = () => {
    stopPreview(); setMessage('');
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
    {compact && <button ref={trigger} type="button" className="startup-preferences-gear" aria-label={c("Startanimation und Sound einstellen", "Configure startup animation and sound")} title={c("Startanimation und Sound", "Startup animation and sound")} aria-expanded={open} aria-controls="startup-preferences-popover" onClick={() => setOpen(value => !value)}><Settings size={17} /></button>}
    {open && <div ref={panel} id={compact ? 'startup-preferences-popover' : undefined} className="startup-preferences-panel" role={compact ? 'dialog' : 'group'} aria-label={c("Startanimation und Sound", "Startup animation and sound")}>
      <div className="startup-preferences-heading"><strong>{c("Startanimation & Sound", "Startup animation & sound")}</strong>{compact && <button type="button" aria-label={c("Schließen", "Close")} onClick={close}><X size={15} /></button>}</div>
      <small>{c('Mit aktiviertem Sound erhält jeder der fünf Sounds seine eigene Startanimation. Bewegung und Dauer folgen der Audiowiedergabe.', 'When sound is enabled, each of the five sounds has its own opening animation. Movement and duration follow audio playback.')}</small>
      <label>{c('Animation ohne Sound', 'Silent opening animation')}<select value={preferences.animation} onChange={event => update({ animation: event.target.value as StartupPreferences['animation'] })}>{startupAnimations.map(item => <option key={item.id} value={item.id}>{locale.startsWith('de') ? item.label : animationNames[item.id]} · {item.duration} ms</option>)}</select></label>
      <button type="button" onClick={startAnimationPreview}><Play size={14} /> {c('Lautlose Animation ansehen', 'Preview silent animation')}</button>
      {preview && <div key={preview.id} data-startup-sound={preview.soundId ?? undefined} style={{ '--startup-opening-duration': `${preview.durationMs}ms`, '--startup-movement-duration': `${Math.min(preview.durationMs, 850)}ms`, '--startup-lift-duration': `${Math.min(preview.durationMs, 550)}ms`, '--startup-departure-duration': `${Math.min(preview.durationMs, 220)}ms` } as CSSProperties} className={`startup-animation-preview${previewTheme ? '' : ` startup-screen--opening startup-opening-${preview.animation}`}`} aria-label={c("Isolierte Animationsvorschau", "Isolated animation preview")}>
        <div className="startup-preview-header">LastBrowser <span>✦</span></div><div className="startup-preview-desktop">{c("Dein Browser", "Your browser")}</div>
        <div ref={previewElement} style={previewTheme ? soundOpeningFrame(0, 0, previewTheme) as CSSProperties : undefined} className={`startup-preview-cover startup-rainbow-frame startup-rainbow-${preferences.rainbowStyle}${preferences.rainbow ? '' : ' startup-screen--no-rainbow'}${previewTheme ? ` startup-sound-opening startup-sound-${previewTheme}` : ''}`}>{previewTheme && <div className="startup-sound-scene" aria-hidden="true"><i /><i /><i /></div>}<div className="startup-screen__content"><div className="startup-screen__art"><img className="startup-screen__icon" src={new URL('./assets/sidekick-01.png', import.meta.url).href} alt="" /></div><span>{c("Willkommen", "Welcome")}</span></div></div>
      </div>}
      {preview && <button type="button" onClick={stopPreview}><X size={14} /> {c('Vorschau stoppen', 'Stop preview')}</button>}
      <label className="startup-preferences-check"><input type="checkbox" checked={preferences.rainbow} onChange={event => update({ rainbow: event.target.checked })} /> {c("Animierter Rainbow-Rahmen", "Animated rainbow border")}</label>
      <label>{c('Rahmenstil', 'Border style')}<select value={preferences.rainbowStyle} disabled={!preferences.rainbow} onChange={event => update({ rainbowStyle: event.target.value as StartupPreferences['rainbowStyle'] })}>{startupRainbowStyles.map(style => <option key={style} value={style}>{rainbowNames[style]}</option>)}</select></label>
      <div className={`startup-rainbow-swatch startup-rainbow-frame startup-rainbow-${preferences.rainbowStyle}${preferences.rainbow ? '' : ' startup-screen--no-rainbow'}`} role="img" aria-label={preferences.rainbow ? rainbowDescriptions[preferences.rainbowStyle] : c('Rainbow-Rahmen ausgeschaltet', 'Rainbow border disabled')}><span>{preferences.rainbow ? rainbowNames[preferences.rainbowStyle] : c('Rahmen ausgeschaltet', 'Border disabled')}</span></div>
      <small>{rainbowDescriptions[preferences.rainbowStyle]}</small>
      <label className="startup-preferences-check"><input type="checkbox" checked={preferences.soundEnabled} onChange={event => update({ soundEnabled: event.target.checked })} /> {c("Sound nach erfolgreicher Anmeldung", "Sound after successful sign-in")}</label>
      <label>{c("Lautstärke", "Volume")} · {Math.round(preferences.volume * 100)} %<input aria-label={c("Lautstärke", "Volume")} type="range" min="0" max="100" value={Math.round(preferences.volume * 100)} onChange={event => update({ volume: Number(event.target.value) / 100 })} /></label>
      <label>Sound<select value={preferences.soundId} disabled={!sounds.length} onChange={event => update({ soundId: event.target.value })}><option value="">{sounds.length ? c('Sound auswählen', 'Choose a sound') : c('Noch keine Sounds', 'No sounds yet')}</option>{sounds.map(sound => { const opening = getSoundOpening(sound.id); return <option key={sound.id} value={sound.id}>{sound.label}{opening ? ` · ${c(opening.labelDe, opening.labelEn)}${opening.beatSynced ? c(' · Beat-synchron', ' · Beat synchronized') : ''}` : ''}</option>; })}</select></label>
      {preferences.randomSound ? <small>{c('Einmal pro Start ausgewürfelt: Sound und zugehörige Animation bleiben zusammen.', 'Chosen once per opening: the sound and its matching animation stay together.')}</small> : selectedOpening && <small>{c('Zugehörige Animation: ', 'Matching animation: ')}{c(selectedOpening.labelDe, selectedOpening.labelEn)} · {selectedOpening.beatSynced ? c('Beat-synchron', 'Beat synchronized') : c('An die Songlänge angepasst', 'Matched to the song duration')}</small>}
      <label className="startup-preferences-check"><input type="checkbox" checked={preferences.randomSound} onChange={event => update({ randomSound: event.target.checked })} disabled={!sounds.length} /> {c("Zufälliger Sound pro Anmeldung", "Random sound per sign-in")}</label>
      <button type="button" disabled={!selectedSoundExists} onClick={previewSound}><Play size={14} /> {c('Sound & Animation ansehen', 'Preview sound & animation')}</button>
      {!sounds.length && <small>{c("Noch keine Sounds hinterlegt. Ohne Audiodatei bleibt der Start lautlos.", "No sounds added yet. Startup remains silent until audio files are supplied.")}</small>}
      <small>{c("Einstellungen werden sofort auf diesem Gerät gespeichert. Sounds werden nicht hochgeladen.", "Settings are saved immediately on this device. Sounds are never uploaded.")}</small>
      {message && <p role="status">{message}</p>}
    </div>}
  </div>;
}
