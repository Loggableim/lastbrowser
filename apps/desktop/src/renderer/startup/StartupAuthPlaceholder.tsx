import { brandAssets } from '../brand.js';
import './StartupAuthPlaceholder.css';

export const startupAuthIcons = Object.values(brandAssets.sidebarIcons);

export function chooseStartupAuthIcon(random: () => number = Math.random): string {
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new RangeError('Invalid random sample');
  return startupAuthIcons[Math.floor(sample * startupAuthIcons.length)];
}

const launchIcon = chooseStartupAuthIcon();

export function shouldShowStartupAuthPlaceholder(state: { checked: boolean; required: boolean; error: string; failure: boolean }): boolean {
  return !state.checked && !state.required && !state.error && !state.failure;
}

export function StartupAuthPlaceholder({ message, icon = launchIcon }: { message: string; icon?: string }): JSX.Element {
  return <main className="startup-auth-placeholder" role="status" aria-live="polite">
    <img className="startup-auth-placeholder__icon" src={icon} alt="" />
    <span className="startup-auth-placeholder__brand">LastBrowser</span>
    <p>{message}</p>
  </main>;
}
