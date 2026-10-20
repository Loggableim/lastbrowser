import type { ReactNode } from 'react';
import { brandAssets } from '../brand.js';
import './StartupPlaceholder.css';
import './startup-auth.css';

export const startupPlaceholderIcons = Object.values(brandAssets.sidebarIcons);

export function chooseStartupPlaceholderIcon(random: () => number = Math.random): string {
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new RangeError('Startup placeholder random source must return a finite value in [0, 1).');
  }
  return startupPlaceholderIcons[Math.floor(sample * startupPlaceholderIcons.length)];
}

const launchPlaceholderIcon = chooseStartupPlaceholderIcon();

export type StartupPlaceholderProps = {
  status?: string | null;
  error?: string | null;
  errorTitle?: string;
  retryLabel?: string;
  onRetry?: () => void;
  retryContent?: ReactNode;
  icon?: string;
};

export function StartupPlaceholder({
  status = null,
  error = null,
  errorTitle = 'LastBrowser',
  retryLabel = 'Try again',
  onRetry,
  retryContent,
  icon = launchPlaceholderIcon
}: StartupPlaceholderProps) {
  return (
    <main className={`startup-placeholder${error ? ' startup-placeholder--error' : ''}`}>
      <div className="startup-placeholder__art" aria-hidden="true">
        <div className="startup-placeholder__glow" />
        <img className="startup-placeholder__icon" src={icon} alt="" />
      </div>
      <p className="startup-placeholder__brand">LastBrowser</p>
      {error ? (
        <section className="startup-placeholder__error" role="alert">
          <h1>{errorTitle}</h1>
          <p>{error}</p>
          {retryContent ?? (onRetry ? <button type="button" onClick={onRetry}>{retryLabel}</button> : null)}
        </section>
      ) : (
        <>
          {status && <p className="startup-placeholder__phase" aria-live="polite">{status}</p>}
          {retryContent}
        </>
      )}
    </main>
  );
}
