import { describe, expect, it } from 'vitest';
import { I18N_TEXTS } from '../../../docs/design/startup-animation/startup-animation.js';
import { clipIdFromSound, startupAnimationLocales, startupPersona, timingForClip } from '../src/renderer/startup/StartupAnimationLayer.js';
import { defaultStartupPreferences } from '../src/renderer/startup/startup-preferences.js';

describe('startup animation integration', () => {
  it('keeps every module language and the beta event feed on by default', () => {
    expect(startupAnimationLocales).toEqual(['de', 'en', 'it', 'es', 'fr', 'pt-BR', 'ru', 'ja']);
    expect(Object.keys(I18N_TEXTS)).toEqual(startupAnimationLocales);
    expect(defaultStartupPreferences.eventFeed).toBe(true);
  });

  it('reads duration and onset marks from timing json', () => {
    const timing = timingForClip('welcome-in');
    expect(timing.durationMs).toBe(6014);
    expect(timing.onsetsMs[0]).toBe(120);
    expect(timing.mainPeakMs).toBe(250);
    expect(timingForClip('unlock-gesture').durationMs).toBe(5614);
  });

  it('uses the unlock clip after the password and the active sidekick persona', () => {
    expect(clipIdFromSound('asset:spring-vibes', false)).toBe('spring-vibes');
    expect(clipIdFromSound('asset:welcome-in', true)).toBe('unlock-gesture');
    expect(startupPersona('analytical')).toBe('orion');
    expect(startupPersona('developer')).toBe('patch');
    expect(startupPersona('creative')).toBe('spark');
    expect(startupPersona('mentor')).toBe('zen');
    expect(startupPersona('nova')).toBe('nova');
  });
});
