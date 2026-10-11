import { useEffect, useState, type ReactNode } from 'react';
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
};

function readReducedMotionPreference(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

export function StartupScreen({ locale, launchIcon, phase, error = null, onRetry, retryContent, reducedMotion, random }: StartupScreenProps) {
  const copy = startupScreenCopy[resolveStartupLocale(locale)];
  const [quoteIndex, setQuoteIndex] = useState(() => chooseStartupQuoteIndex(random));
  const [systemReducedMotion, setSystemReducedMotion] = useState(readReducedMotionPreference);
  const motionIsReduced = reducedMotion ?? systemReducedMotion;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReducedMotion(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (error || motionIsReduced) return undefined;
    const timer = window.setInterval(() => setQuoteIndex((current) => nextStartupQuoteIndex(current, copy.quotes.length)), 4_000);
    return () => window.clearInterval(timer);
  }, [copy.quotes.length, error, motionIsReduced]);

  return (
    <main className={`startup-screen${error ? ' startup-screen--error' : ''}${motionIsReduced ? ' startup-screen--reduced-motion' : ''}`}>
      <div className="startup-screen__content">
        <div className="startup-screen__art" aria-hidden="true">
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
