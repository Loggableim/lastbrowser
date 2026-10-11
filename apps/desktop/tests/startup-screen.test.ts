import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { desktopLocaleIds } from '../src/renderer/i18n/keys.js';
import { StartupScreen } from '../src/renderer/startup/StartupScreen.js';
import { reduceStartupOpeningState } from '../src/renderer/startup/startup-opening-state.js';
import { startupScreenCopy, startupLocaleIds } from '../src/renderer/startup/startup-screen-copy.js';
import { chooseStartupIcon, chooseStartupQuoteIndex, deriveStartupPhase, getStartupBackgroundPhase, getStartupFailureStage, isStartupReady, isValidStartupModelCatalog, nextStartupQuoteIndex, startupIconIds, type StartupReadinessSignals } from '../src/renderer/startup/startup-screen-state.js';

const sourceRoot = path.resolve(process.cwd(), 'src/renderer/startup');

describe('startup screen launch state', () => {
  it('opens only after a verified protected login and completed auth plus browser readiness', () => {
    expect(reduceStartupOpeningState('idle', { type: 'verified-password-login', passwordProtected: false })).toBe('idle');
    expect(reduceStartupOpeningState('idle', { type: 'readiness', authAllowed: true, ready: true, reducedMotion: false })).toBe('idle');

    const pending = reduceStartupOpeningState('idle', { type: 'verified-password-login', passwordProtected: true });
    expect(pending).toBe('pending');
    expect(reduceStartupOpeningState(pending, { type: 'readiness', authAllowed: true, ready: false, reducedMotion: false })).toBe('pending');
    expect(reduceStartupOpeningState(pending, { type: 'readiness', authAllowed: false, ready: true, reducedMotion: false })).toBe('idle');
    expect(reduceStartupOpeningState(pending, { type: 'readiness', authAllowed: true, ready: true, reducedMotion: false })).toBe('opening');
  });

  it('skips motion when reduced and cancels the opening for lock, scope change, or completion', () => {
    const pending = reduceStartupOpeningState('idle', { type: 'verified-password-login', passwordProtected: true });
    expect(reduceStartupOpeningState(pending, { type: 'readiness', authAllowed: true, ready: true, reducedMotion: true })).toBe('idle');
    const opening = reduceStartupOpeningState(pending, { type: 'readiness', authAllowed: true, ready: true, reducedMotion: false });
    expect(reduceStartupOpeningState(opening, { type: 'lock' })).toBe('idle');
    expect(reduceStartupOpeningState(opening, { type: 'scope-change' })).toBe('idle');
    expect(reduceStartupOpeningState(opening, { type: 'complete' })).toBe('idle');
  });

  it('makes each launch icon reachable through an injected random source', () => {
    const selected = startupIconIds.map((_, index) => chooseStartupIcon(() => index / startupIconIds.length));
    expect(selected).toEqual(startupIconIds);
    expect(new Set(selected).size).toBe(6);
  });

  it('chooses a random first quote and advances in a deterministic cycle', () => {
    expect(chooseStartupQuoteIndex(() => 0)).toBe(0);
    expect(chooseStartupQuoteIndex(() => 6 / 7)).toBe(6);
    expect(nextStartupQuoteIndex(6)).toBe(0);
    expect(nextStartupQuoteIndex(2)).toBe(3);
  });

  it('rejects invalid random values instead of selecting unpredictably', () => {
    for (const value of [-0.1, 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => chooseStartupIcon(() => value)).toThrow(RangeError);
    }
  });

  it('derives phases only from explicit stage signals and keeps aggregate readiness fail-closed', () => {
    const ready: StartupReadinessSignals = {
      engine: 'complete', profile: 'complete', spaces: 'complete', connections: 'complete',
      models: 'complete', sidekick: 'complete', session: 'complete'
    };
    expect(isStartupReady(ready)).toBe(true);
    expect(deriveStartupPhase(ready)).toBe('ready');
    for (const phase of ['engine', 'profile', 'sidekick', 'session'] as const) {
      expect(deriveStartupPhase({ ...ready, [phase]: 'pending' })).toBe(phase);
      expect(isStartupReady({ ...ready, [phase]: 'pending' })).toBe(false);
      expect(deriveStartupPhase({ ...ready, [phase]: 'error' })).toBe(phase);
      expect(getStartupFailureStage({ ...ready, [phase]: 'error' })).toBe(phase);
    }
    const failedSession = { ...ready, profile: 'pending' as const, session: 'error' as const };
    expect(deriveStartupPhase(failedSession)).toBe('session');
    expect(getStartupFailureStage(failedSession)).toBe('session');
    const offlineButDisabled: StartupReadinessSignals = {
      engine: 'error', profile: 'complete', spaces: 'error', connections: 'error',
      models: 'error', sidekick: 'error', session: 'complete'
    };
    expect(isStartupReady(offlineButDisabled, 'disabled')).toBe(true);
    expect(deriveStartupPhase(offlineButDisabled, 'disabled')).toBe('ready');
    expect(getStartupBackgroundPhase(offlineButDisabled, 'disabled')).toBe('sidekick');
    expect(isStartupReady(offlineButDisabled, 'enabled')).toBe(false);
    expect(isStartupReady(offlineButDisabled, 'unknown')).toBe(false);
    expect(isStartupReady({ ...ready, connections: 'error', models: 'error' }, 'enabled')).toBe(true);
    expect(isStartupReady({ ...ready, session: 'error' }, 'disabled')).toBe(false);
    expect(isValidStartupModelCatalog({ groups: [] })).toBe(true);
    expect(isValidStartupModelCatalog({ detail: 'failed' })).toBe(false);
    expect(isValidStartupModelCatalog(null)).toBe(false);
  });
});

describe('startup screen copy and motion rules', () => {
  it('covers every current app locale with seven quotes and all eight real phase labels', () => {
    expect(startupLocaleIds).toEqual(desktopLocaleIds);
    for (const locale of desktopLocaleIds) {
      expect(startupScreenCopy[locale].quotes).toHaveLength(7);
      expect(Object.values(startupScreenCopy[locale].phases)).toHaveLength(8);
      expect(Object.values(startupScreenCopy[locale].phases).every((text) => text.trim().length > 0)).toBe(true);
      expect(startupScreenCopy[locale].sidekickWaiting.trim().length).toBeGreaterThan(0);
      expect(startupScreenCopy[locale].errorDescription.trim().length).toBeGreaterThan(0);
    }
  });

  it('preserves the seven approved German phrases exactly', () => {
    expect(startupScreenCopy.de.quotes).toEqual([
      'Hamster beim vortrainieren des Sprachmodells …',
      'Noch schnell dem Algorithmus entfolgen …',
      'Neuronale Netze werden entknotet …',
      'Kontext laden. Brainrot aussortieren …',
      'Dein Sidekick wird wach. Bitte noch keine Prompts.',
      'Der Algorithmus empfiehlt: kurz durchatmen.',
      'Trainingsdaten vom Doomscrolling befreien …'
    ]);
  });

  it('uses a launch-owned icon, rotates quotes every four seconds, cleans up, and stops on error', () => {
    const component = readFileSync(path.join(sourceRoot, 'StartupScreen.tsx'), 'utf8');
    expect(component).toContain('launchIcon: StartupIconId | null');
    expect(component).toContain('src={iconSources[launchIcon]}');
    expect(component).not.toContain('chooseStartupIcon(');
    expect(component).not.toContain('Math.random');
    expect(component).toContain('window.setInterval');
    expect(component).toContain('4_000');
    expect(component).toContain('window.clearInterval(timer)');
    expect(component).toContain('if (error || motionIsReduced) return undefined;');
  });

  it('renders the selected launch icon, localized phase, and retryable error state', () => {
    const screen = renderToStaticMarkup(createElement(StartupScreen, {
      locale: 'de', launchIcon: 'sidekick-03', phase: 'engine', reducedMotion: true
    }));
    expect(screen).toContain('sidekick-03');
    expect(screen).toContain('Lokale Engine startet');
    expect(screen).toContain('LastBrowser');
    const ready = renderToStaticMarkup(createElement(StartupScreen, {
      locale: 'de', launchIcon: 'sidekick-03', phase: 'ready', reducedMotion: true
    }));
    expect(ready).toContain('Dein Browser ist bereit.');

    const opening = renderToStaticMarkup(createElement(StartupScreen, {
      locale: 'de', launchIcon: 'sidekick-03', phase: 'ready', opening: true, reducedMotion: false
    }));
    expect(opening).toContain('startup-screen--opening');
    expect(opening).toContain('tabindex="-1"');

    const error = renderToStaticMarkup(createElement(StartupScreen, {
      locale: 'de', launchIcon: 'sidekick-03', phase: 'engine', error: 'Ein Testfehler', onRetry: () => undefined
    }));
    expect(error).toContain('Ein Testfehler');
    expect(error).toContain('Erneut versuchen');
    expect(error).not.toContain('Hamster beim vortrainieren');
    expect(error).not.toContain('Lokale Engine startet');
  });

  it('keeps a still presentation for reduced motion and uses proportional responsive icon sizing', () => {
    const styles = readFileSync(path.join(sourceRoot, 'StartupScreen.css'), 'utf8');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toContain('animation: none');
    expect(styles).toContain('object-fit: contain');
    expect(styles).toContain('width: clamp(');
    expect(styles).toContain('aspect-ratio: 1.071 / 1');
    expect(styles).toContain('.startup-screen--error {');
    expect(styles).toContain('linear-gradient(#314259, #314259) border-box');
    expect(styles).toContain('#ff0018 0deg 60deg');
    expect(styles).toContain('#ff8c00 60deg 120deg');
    expect(styles).toContain('#ffe600 120deg 180deg');
    expect(styles).toContain('#008026 180deg 240deg');
    expect(styles).toContain('#004dff 240deg 300deg');
    expect(styles).toContain('#750787 300deg 360deg');
    expect(styles).not.toContain('startup-rainbow-trail');
    expect(styles).toContain('startup-open-overlay 650ms');
    expect(styles).toContain('startup-open-mascot 650ms');
  });

  it('keeps all six original icon assets byte-bound to their documented sources', () => {
    const expectedHashes = [
      '052B5C99A7F78F52B7D14C9A973F90E28A5799581186F1D564405D000F270A5A',
      'D9030084DF647C275B2F7AC17E86A7C08722E7FD021528DE15C78D33924D4A11',
      '1C87E8226B6E1B71329B98DD124D1EDD53569D9F5B25C7D5C00BA90857DE3CBC',
      '0056E6E2C7E3451BF3E423BFA299FE8F28F10AC559CACCAA307D1152252963E1',
      '11C2538C7C7C410FEF7EE75FF4E08CAEF6C938E7F10172C3EF56F7C58D1EF0BA',
      'A0460E59C333438F15A30DF4A94357322699796D28BC78B0EE678EEF627BCC25'
    ];
    for (const [index, expectedHash] of expectedHashes.entries()) {
      const image = readFileSync(path.join(sourceRoot, 'assets', `sidekick-${String(index + 1).padStart(2, '0')}.png`));
      expect(image.toString('ascii', 1, 4)).toBe('PNG');
      expect(image.readUInt32BE(16)).toBe(1298);
      expect(image.readUInt32BE(20)).toBe(1212);
      expect(createHash('sha256').update(image).digest('hex').toUpperCase()).toBe(expectedHash);
    }
  });
});
