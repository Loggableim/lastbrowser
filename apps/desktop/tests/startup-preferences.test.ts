import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let values: Map<string, string>;
const key = 'lastbrowser.startup-preferences.v1';
beforeEach(() => {
  vi.resetModules(); values = new Map();
  vi.stubGlobal('localStorage', { getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => values.set(name, value) });
  vi.stubGlobal('window', Object.assign(new EventTarget(), { setTimeout, clearTimeout }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('startup preferences compatibility', () => {
  it('defaults to classic rainbow on and startup sound off', async () => {
    const prefs = await import('../src/renderer/startup/startup-preferences.js');
    expect(prefs.readStartupPreferences()).toMatchObject({ rainbow: true, rainbowStyle: 'classic', soundEnabled: false });
    expect(prefs.startupRainbowStyles).toEqual(['classic', 'aurora', 'orbit']);
  });
  it.each(['classic', 'aurora', 'orbit'] as const)('persists and reloads the %s style', async style => {
    const prefs = await import('../src/renderer/startup/startup-preferences.js');
    expect(prefs.saveStartupPreferences({ ...prefs.defaultStartupPreferences, rainbowStyle: style })).toBe(true);
    expect(JSON.parse(values.get(key)!)).toMatchObject({ rainbowStyle: style, soundEnabled: false });
    vi.resetModules();
    expect((await import('../src/renderer/startup/startup-preferences.js')).readStartupPreferences().rainbowStyle).toBe(style);
  });
  it('retains legacy sound/rainbow choices while supplying the missing style', async () => {
    values.set(key, JSON.stringify({ rainbow: false, soundEnabled: true, volume: .12, soundId: 'asset:spring-vibes' }));
    const prefs = await import('../src/renderer/startup/startup-preferences.js');
    expect(prefs.readStartupPreferences()).toMatchObject({ rainbow: false, rainbowStyle: 'classic', soundEnabled: true, volume: .12, soundId: 'asset:spring-vibes' });
  });
  it.each(['null', 'broken-json', '{"rainbowStyle":"rotate-square","volume":500}'])('validates untrusted saved preferences %s', async value => {
    values.set(key, value);
    const prefs = await import('../src/renderer/startup/startup-preferences.js');
    expect(prefs.readStartupPreferences().rainbowStyle).toBe('classic');
    expect(prefs.readStartupPreferences().volume).toBeLessThanOrEqual(1);
  });
  it('retains session settings and notifies the UI if persistent storage fails', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('denied'); } });
    const prefs = await import('../src/renderer/startup/startup-preferences.js');
    const changed = vi.fn(); window.addEventListener('lastbrowser:startup-preferences', changed);
    expect(prefs.saveStartupPreferences({ ...prefs.defaultStartupPreferences, rainbowStyle: 'orbit' })).toBe(false);
    expect(prefs.readStartupPreferences().rainbowStyle).toBe('orbit');
    expect(changed).toHaveBeenCalledTimes(1);
  });
});

describe('startup audio playback', () => {
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  function audioHarness(reject = false) {
    const frames: FrameRequestCallback[] = [];
    const audios: FakeAudio[] = [];
    class FakeAudio extends EventTarget {
      volume = 1; currentTime = 0; duration = 6.1; paused = true; src: string;
      pause = vi.fn(() => { this.paused = true; });
      constructor(src: string) { super(); this.src = src; audios.push(this); }
      play = vi.fn(async () => {
        if (reject) throw Error('autoplay denied');
        this.paused = false; this.dispatchEvent(new Event('playing'));
      });
    }
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.push(fn); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    return { audios, frames };
  }
  it('never instantiates audio for the default disabled sound setting', async () => {
    const { audios } = audioHarness();
    const prefs = await import('../src/renderer/startup/startup-preferences.js');
    const stop = prefs.playStartupSound(prefs.defaultStartupPreferences); await flush();
    expect(audios).toHaveLength(0); stop();
  });
  it('uses actual media time/duration and emits a final clock once on cleanup', async () => {
    const { audios, frames } = audioHarness();
    const prefs = await import('../src/renderer/startup/startup-preferences.js');
    const clocks: any[] = [];
    window.addEventListener('lastbrowser:startup-audio-clock', event => clocks.push((event as CustomEvent).detail));
    const stop = prefs.playStartupSound({ ...prefs.defaultStartupPreferences, soundEnabled: true, volume: .08 }, undefined, prefs.startupSoundAssets[0]);
    await flush();
    expect(audios[0].volume).toBe(.08);
    audios[0].currentTime = 2.75; frames.at(-1)!(0);
    expect(clocks.at(-1)).toMatchObject({ currentTimeMs: 2750, durationMs: 6100, purpose: 'startup', playing: true });
    stop(); stop();
    expect(clocks.filter(clock => clock.ended)).toHaveLength(1);
    expect(audios[0].pause).toHaveBeenCalledTimes(1);
  });
  it('reports rejected playback once and cleans up without changing stored preferences', async () => {
    const { audios } = audioHarness(true);
    const prefs = await import('../src/renderer/startup/startup-preferences.js');
    const failed = vi.fn();
    const stop = prefs.playStartupSound({ ...prefs.defaultStartupPreferences, soundEnabled: true }, failed);
    await flush();
    expect(failed).toHaveBeenCalledTimes(1);
    expect(audios[0].pause).toHaveBeenCalledTimes(1);
    expect(values.size).toBe(0); stop();
  });
  it('cancels before asynchronous setup without creating a media element', async () => {
    const { audios } = audioHarness();
    const prefs = await import('../src/renderer/startup/startup-preferences.js');
    prefs.playStartupSound({ ...prefs.defaultStartupPreferences, soundEnabled: true })(); await flush();
    expect(audios).toHaveLength(0);
  });
});
