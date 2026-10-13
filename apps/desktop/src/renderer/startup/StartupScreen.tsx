import { StartupPreferencesPanel } from './StartupPreferencesPanel.js';
import { startupAnimations, useStartupPreferences } from './startup-preferences.js';
import { useEffect, useLayoutEffect, useRef, useState, type AnimationEvent, type CSSProperties, type ReactNode } from 'react';
import { startupScreenCopy, resolveStartupLocale } from './startup-screen-copy.js';
import { chooseStartupQuoteIndex, nextStartupQuoteIndex, type StartupIconId, type StartupPhaseId } from './startup-screen-state.js';
import './StartupScreen.css';

const iconSources: Record<StartupIconId, string> = {
  'sidekick-01': new URL('./assets/sidekick-01.png', import.meta.url).href,
  'sidekick-02': new URL('./assets/sidekick-02.png', import.meta.url).href,
  'sidekick-03': new URL('./assets/sidekick-03.png', import.meta.url).href,
  'sidekick-04': new URL('./assets/sidekick-04.png', import.meta.url).href,
  'sidekick-05': new URL('./assets/sidekick-05.png', import.meta.url).href,
  'sidekick-06': new URL('./assets/sidekick-06.png', import.meta.url).href
};

export type StartupScreenProps = {
  locale: string;
  /** Must be selected once for the application launch and provided by its launch-lifetime owner. */
  launchIcon: StartupIconId | null;
  phase: StartupPhaseId | null;
  error?: string | null;
  onRetry?: () => void;
  retryContent?: ReactNode;
  reducedMotion?: boolean;
  random?: () => number;
  opening?: boolean;
  /** Frozen duration of the sound selected for this unlock. */
  openingDurationMs?: number;
  onOpeningComplete?: () => void;
};

export function readReducedMotionPreference(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

export function StartupScreen({ locale, launchIcon, phase, error = null, onRetry, retryContent, reducedMotion, random, opening = false, openingDurationMs, onOpeningComplete }: StartupScreenProps) {
  const preferences = useStartupPreferences();
  const copy = startupScreenCopy[resolveStartupLocale(locale)];
  const screenRef = useRef<HTMLElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const landingRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);
  const callbackRef = useRef(onOpeningComplete);
  callbackRef.current = onOpeningComplete;
  const [travelStyle, setTravelStyle] = useState<CSSProperties>({});
  const [quoteIndex, setQuoteIndex] = useState(() => chooseStartupQuoteIndex(random));
  const [systemReducedMotion, setSystemReducedMotion] = useState(readReducedMotionPreference);
  const motionIsReduced = reducedMotion ?? systemReducedMotion;
  const defaultDuration = startupAnimations.find(item => item.id === preferences.animation)!.duration;
  const duration = motionIsReduced ? 100 : typeof openingDurationMs === 'number' && Number.isFinite(openingDurationMs)
    && openingDurationMs >= 100 && openingDurationMs <= 30000 ? openingDurationMs : defaultDuration;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReducedMotion(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (!opening) { completedRef.current = false; return; }
    screenRef.current?.focus({ preventScroll: true });
    const timer = window.setTimeout(() => {
      if (!completedRef.current) { completedRef.current = true; callbackRef.current?.(); }
    }, duration + 150);
    return () => window.clearTimeout(timer);
  }, [duration, opening]);

  useLayoutEffect(() => {
    if (!opening || preferences.animation !== 'companion' || motionIsReduced) return;
    const measure = () => {
      const visibleTarget = [...document.querySelectorAll<HTMLElement>('.app-shell [data-startup-sidekick-target], .app-shell .nova-dock-btn.avatar-btn')].find(element => {
        const rect = element.getBoundingClientRect(); const css = getComputedStyle(element);
        return rect.width > 8 && rect.height > 8 && rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth && css.visibility !== 'hidden' && css.display !== 'none';
      });
      const target = visibleTarget || landingRef.current;
      const source = artRef.current?.getBoundingClientRect(), destination = target?.getBoundingClientRect();
      if (source && destination && source.width && destination.width) setTravelStyle({
        '--startup-landing-opacity': visibleTarget ? '0' : '1',
        '--startup-travel-x': `${destination.x + destination.width / 2 - source.x - source.width / 2}px`,
        '--startup-travel-y': `${destination.y + destination.height / 2 - source.y - source.height / 2}px`,
        '--startup-travel-scale': String(Math.max(0.1, Math.min(0.35, destination.width / source.width)))
      } as CSSProperties);
    };
    measure();
    // Re-measuring transformed artwork mid-flight would distort its path; resize ends safely.
    const resize = () => { if (!completedRef.current) { completedRef.current = true; callbackRef.current?.(); } };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [motionIsReduced, opening, preferences.animation]);

  useEffect(() => {
    if (error || motionIsReduced || opening) return undefined;
    const timer = window.setInterval(() => setQuoteIndex((current) => nextStartupQuoteIndex(current, copy.quotes.length)), 4_000);
    return () => window.clearInterval(timer);
  }, [copy.quotes.length, error, motionIsReduced, opening]);

  return (
    <main
      ref={screenRef}
      tabIndex={opening ? -1 : undefined}
      onAnimationEnd={(event: AnimationEvent<HTMLElement>) => {
        if (opening && !completedRef.current && event.target === event.currentTarget && event.animationName.startsWith('startup-open-')) {
          completedRef.current = true; callbackRef.current?.();
        }
      }}
      style={{ ...travelStyle, '--startup-opening-duration': `${duration}ms`,
        '--startup-movement-duration': `${Math.min(duration, 850)}ms`,
        '--startup-lift-duration': `${Math.min(duration, 550)}ms`,
        '--startup-departure-duration': `${Math.min(duration, 220)}ms` } as CSSProperties}
      className={`startup-screen${!preferences.rainbow ? ' startup-screen--no-rainbow' : ''}${error ? ' startup-screen--error' : ''}${motionIsReduced ? ' startup-screen--reduced-motion' : ''}${opening ? ` startup-screen--opening startup-opening-${preferences.animation}` : ''}`}
    >
      {opening && preferences.animation === 'companion' && <div ref={landingRef} className="startup-screen__landing-point" aria-hidden="true">{launchIcon && <img src={iconSources[launchIcon]} alt="" />}<span>Sidekick</span></div>}
      {!opening && <StartupPreferencesPanel compact />}
      <div className="startup-screen__content">
        <div ref={artRef} className="startup-screen__art" aria-hidden="true">
          <div className="startup-screen__glow" />
          {launchIcon && <img className="startup-screen__icon" src={iconSources[launchIcon]} alt="" />}
        </div>
        <p className="startup-screen__brand">LastBrowser</p>
        {!error && (
          <p className="startup-screen__quote" aria-live="polite" aria-atomic="true" key={quoteIndex}>
            {copy.quotes[quoteIndex]}
          </p>
        )}
        {error ? (
          <section className="startup-screen__error" role="alert">
            <h1>{copy.errorTitle}</h1>
            <p>{error}</p>
            {retryContent ?? (onRetry ? <button type="button" onClick={onRetry}>{copy.retry}</button> : null)}
          </section>
        ) : (
          <>
            {phase && <p className="startup-screen__phase" aria-live="polite">{copy.phases[phase]}</p>}
            {retryContent}
          </>
        )}
      </div>
    </main>
  );
}
