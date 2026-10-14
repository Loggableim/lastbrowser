import { useCallback, useEffect, useRef } from 'react';
import { StartupScreen } from './StartupScreen.js';
import { playStartupSound, readStartupPreferences, startupSoundAssets } from './startup-preferences.js';
import type { StartupIconId } from './startup-screen-state.js';

const welcomeSound = startupSoundAssets.find(sound => sound.id === 'asset:welcome-in')!;

export type FirstLaunchCompletionProps = {
  locale: string;
  launchIcon: StartupIconId | null;
  onComplete: () => void;
};

/** Mount once after a successful first-run save, over the ready desktop.
 * This one-time welcome does not enable sounds for subsequent launches.
 */
export function FirstLaunchCompletion({ locale, launchIcon, onComplete }: FirstLaunchCompletionProps) {
  const callback = useRef(onComplete);
  callback.current = onComplete;
  const active = useRef(false);
  const completed = useRef(false);
  const stopSound = useRef<(() => void) | null>(null);
  const finish = useCallback(() => {
    if (!active.current || completed.current) return;
    completed.current = true;
    const stop = stopSound.current;
    stopSound.current = null;
    // Set the guard before stopping: cleanup emits the final audio-clock event.
    stop?.();
    callback.current();
  }, []);

  useEffect(() => {
    active.current = true;
    completed.current = false;
    let disposed = false;
    // Snapshot the visual preferences, overriding audio only for this playback.
    // Never persist this override or route it through normal startup sound state.
    // A canceled StrictMode effect must never start a second audible welcome.
    // Deferring one microtask lets its immediate cleanup cancel the first run.
    void Promise.resolve().then(() => {
      if (disposed) return;
      try {
        const stop = playStartupSound({ ...readStartupPreferences(),
          soundEnabled: true, volume: 0.08, randomSound: false, soundId: welcomeSound.id
        }, () => { if (!disposed) finish(); }, welcomeSound, { purpose: 'startup' });
        if (disposed || completed.current) stop();
        else stopSound.current = stop;
      } catch {
        if (!disposed) finish();
      }
    });
    // Covers stalled media/AudioContext promises, including a clock that starts
    // but never advances. A first-run welcome must never trap the user.
    const watchdog = window.setTimeout(finish, welcomeSound.durationMs + 2000);
    return () => {
      disposed = true;
      active.current = false;
      window.clearTimeout(watchdog);
      stopSound.current?.();
      stopSound.current = null;
    };
  }, [finish]);

  return <StartupScreen locale={locale} launchIcon={launchIcon} phase={null}
    opening openingSoundId={welcomeSound.id} openingDurationMs={welcomeSound.durationMs}
    onOpeningComplete={finish} />;
}
