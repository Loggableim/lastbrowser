import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirstLaunchCompletion } from '../src/renderer/startup/FirstLaunchCompletion.js';
import { StartupScreen } from '../src/renderer/startup/StartupScreen.js';
import { STARTUP_AUDIO_CLOCK_EVENT, getSoundOpeningTheme, readStartupAudioClock, soundOpeningFrame } from '../src/renderer/startup/sound-opening.js';

// Explicit effect-lifecycle harness: no browser/VM or DOM layout is simulated.
// Replaying setup/cleanup/setup reproduces the relevant StrictMode side effects.
const h = vi.hoisted(() => ({ refs: [] as { current: any }[], cursor: 0,
  layout: [] as (() => void | (() => void))[], effects: [] as (() => void | (() => void))[],
  play: vi.fn(), stop: vi.fn() }));
vi.mock('react', async importOriginal => ({ ...await importOriginal<any>(),
  useRef: (value: unknown) => h.refs[h.cursor++] ?? (h.refs[h.cursor - 1] = { current: value }),
  useState: (value: any) => [typeof value === 'function' ? value() : value, vi.fn()],
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void) => { h.effects.push(fn); },
  useLayoutEffect: (fn: () => void) => { h.layout.push(fn); }
}));
vi.mock('../src/renderer/startup/StartupPreferencesPanel.js', () => ({ StartupPreferencesPanel: () => null }));
vi.mock('../src/renderer/startup/startup-preferences.js', async importOriginal => {
  const actual = await importOriginal<any>();
  return { ...actual, playStartupSound: h.play,
    useStartupPreferences: () => ({ ...actual.defaultStartupPreferences }) };
});

const setups = () => [...h.layout, ...h.effects].map(fn => fn()).filter((fn): fn is () => void => typeof fn === 'function');
const clearEffects = () => { h.cursor = 0; h.layout = []; h.effects = []; };
let cleanups: (() => void)[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  h.refs = []; clearEffects(); h.play.mockReset(); h.stop.mockReset(); h.play.mockReturnValue(h.stop);
  const win = Object.assign(new EventTarget(), {
    setTimeout: (...args: any[]) => (setTimeout as any)(...args),
    clearTimeout: (id: any) => clearTimeout(id),
    setInterval: (...args: any[]) => (setInterval as any)(...args),
    clearInterval: (id: any) => clearInterval(id),
    matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  });
  vi.stubGlobal('window', win);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  cleanups = [];
});
afterEach(() => { cleanups.forEach(fn => fn()); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('first-launch welcome lifecycle', () => {
  it('uses only Welcome In at 8%, without enabling persisted startup sound', async () => {
    const completed = vi.fn();
    const element = FirstLaunchCompletion({ locale: 'de', launchIcon: 'sidekick-01', onComplete: completed });
    expect(element.props.openingSoundId).toBe('asset:welcome-in');
    expect(element.props.openingDurationMs).toBe(6048);
    cleanups = setups(); await Promise.resolve();
    expect(h.play).toHaveBeenCalledTimes(1);
    expect(h.play.mock.calls[0][0]).toMatchObject({ soundEnabled: true, volume: .08, randomSound: false, soundId: 'asset:welcome-in' });
    expect(h.play.mock.calls[0][3]).toEqual({ purpose: 'startup' });
    element.props.onOpeningComplete(); element.props.onOpeningComplete();
    expect(completed).toHaveBeenCalledTimes(1);
    expect(h.stop).toHaveBeenCalledTimes(1);
  });
  it('starts only once during immediate StrictMode-style effect replay', async () => {
    const completed = vi.fn();
    FirstLaunchCompletion({ locale: 'de', launchIcon: null, onComplete: completed });
    setups().forEach(fn => fn());
    cleanups = setups(); await Promise.resolve();
    expect(h.play).toHaveBeenCalledTimes(1);
    expect(completed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(8048);
    expect(completed).toHaveBeenCalledTimes(1);
  });
  it('finishes once when playback rejects, including a synchronous player failure', async () => {
    const completed = vi.fn();
    h.play.mockImplementation((_prefs, onError) => { onError(); return h.stop; });
    FirstLaunchCompletion({ locale: 'en', launchIcon: null, onComplete: completed });
    cleanups = setups(); await Promise.resolve();
    expect(completed).toHaveBeenCalledTimes(1);
    expect(h.stop).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10000);
    expect(completed).toHaveBeenCalledTimes(1);
  });
  it('does not start audio after unmount and ignores a late failure callback', async () => {
    const completed = vi.fn();
    FirstLaunchCompletion({ locale: 'en', launchIcon: null, onComplete: completed });
    setups().forEach(fn => fn()); await Promise.resolve();
    expect(h.play).not.toHaveBeenCalled();
    clearEffects();
    FirstLaunchCompletion({ locale: 'en', launchIcon: null, onComplete: completed });
    const dispose = setups(); await Promise.resolve();
    const onError = h.play.mock.calls[0][1]; dispose.forEach(fn => fn()); onError();
    expect(completed).not.toHaveBeenCalled();
  });
});

function mountOpening(reducedMotion = false) {
  const done = vi.fn();
  const element = StartupScreen({ locale: 'en', launchIcon: null, phase: null,
    opening: true, openingSoundId: 'asset:welcome-in', openingDurationMs: 6048,
    reducedMotion, onOpeningComplete: done });
  const style = { setProperty: vi.fn() };
  element.props.ref.current = { style, focus: vi.fn() };
  cleanups = setups();
  return { done, style };
}
function clock(overrides: Record<string, unknown> = {}) {
  window.dispatchEvent(new CustomEvent(STARTUP_AUDIO_CLOCK_EVENT, { detail: {
    soundId: 'asset:welcome-in', purpose: 'startup', currentTimeMs: 3024,
    durationMs: 6048, beat: 0, playing: true, ended: false, ...overrides
  } }));
}
describe('sound-clock opening lifecycle', () => {
  it.each([
    ['asset:welcome-in', 'welcome-aurora'], ['asset:three-ascending-tones', 'tones-rise'],
    ['asset:first-light', 'first-light'], ['asset:spring-vibes', 'spring-orbit'], ['asset:unlock-gesture', 'unlock-ripple']
  ])('retains the sound-specific %s opening theme', (sound, theme) => {
    expect(getSoundOpeningTheme(sound)).toBe(theme);
  });
  it('rejects other sounds and malformed clock events', () => {
    expect(getSoundOpeningTheme('not-a-sound')).toBeNull();
    for (const value of [null, { soundId: 'asset:welcome-in', durationMs: 0 },
      { soundId: 'asset:welcome-in', purpose: 'startup', currentTimeMs: NaN, durationMs: 6000, beat: 0, playing: true, ended: false }]) {
      expect(readStartupAudioClock(value, 'asset:welcome-in')).toBeNull();
    }
    const { style } = mountOpening(); style.setProperty.mockClear(); clock({ soundId: 'asset:spring-vibes' });
    expect(style.setProperty).not.toHaveBeenCalled();
  });
  it('uses actual audio progress, ignores preview clocks, and completes once on ended', () => {
    const { done, style } = mountOpening();
    style.setProperty.mockClear(); clock({ purpose: 'preview' });
    expect(style.setProperty).not.toHaveBeenCalled();
    clock(); expect(style.setProperty).toHaveBeenCalledWith('--sound-progress', '0.5');
    clock({ ended: true }); clock({ ended: true });
    expect(done).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20000); expect(done).toHaveBeenCalledTimes(1);
  });
  it('escapes a stalled clock after its bounded grace period', () => {
    const { done } = mountOpening(); clock({ currentTimeMs: 0, playing: false });
    vi.advanceTimersByTime(11047); expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(done).toHaveBeenCalledTimes(1);
  });
  it('removes listeners/timers on unmount', () => {
    const { done } = mountOpening(); cleanups.forEach(fn => fn()); cleanups = [];
    clock({ ended: true }); vi.advanceTimersByTime(20000);
    expect(done).not.toHaveBeenCalled();
  });
  it('keeps the short reduced-motion completion and avoids animated audio frames', () => {
    const { done, style } = mountOpening(true); clock();
    expect(style.setProperty).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250); expect(done).toHaveBeenCalledTimes(1);
  });
  it('can complete after an earlier effect replay was canceled', () => {
    const { done } = mountOpening();
    cleanups.forEach(fn => fn()); cleanups = setups();
    clock({ ended: true }); expect(done).toHaveBeenCalledTimes(1);
  });
  it('derives paused/seeking frames deterministically from position, not a guessed beat', () => {
    expect(soundOpeningFrame(.5, 1, 'welcome-aurora')).toMatchObject({ '--sound-progress': '0.5', '--sound-beat': '0', '--sound-rotation': '100deg' });
    expect(soundOpeningFrame(2, 2, 'unlock-ripple')).toMatchObject({ '--sound-progress': '1', '--sound-beat': '1' });
  });
});
