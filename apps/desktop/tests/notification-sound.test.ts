import { describe, expect, it, vi } from 'vitest';
import { playChatCompletionSound } from '../src/renderer/notification-sound.js';

function createAudioContextMock(state: AudioContextState = 'running') {
  const oscillator = {
    type: 'sine' as OscillatorType,
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as (() => void) | null
  };
  const gain = {
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn()
    },
    connect: vi.fn()
  };
  const context = {
    currentTime: 3,
    destination: {},
    state,
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => gain),
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined)
  } as unknown as AudioContext;

  return { context, oscillator, gain };
}

describe('chat completion sound', () => {
  it('does not create audio when the sound preference is off', () => {
    const createContext = vi.fn(() => createAudioContextMock().context);

    playChatCompletionSound(false, createContext);

    expect(createContext).not.toHaveBeenCalled();
  });

  it('plays a short local tone when enabled and closes the audio context', () => {
    const mock = createAudioContextMock();

    playChatCompletionSound(true, () => mock.context);

    expect(mock.oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(740, 3);
    expect(mock.oscillator.start).toHaveBeenCalledWith(3);
    expect(mock.oscillator.stop).toHaveBeenCalledWith(3.2);
    mock.oscillator.onended?.();
    expect(mock.context.close).toHaveBeenCalledOnce();
  });

  it('waits for a suspended audio context to resume before starting the tone', async () => {
    const mock = createAudioContextMock('suspended');
    let resume: (() => void) | undefined;
    const resumePromise = new Promise<void>((resolve) => { resume = resolve; });
    vi.mocked(mock.context.resume).mockReturnValue(resumePromise);

    playChatCompletionSound(true, () => mock.context);
    expect(mock.oscillator.start).not.toHaveBeenCalled();
    resume?.();
    await resumePromise;
    await Promise.resolve();

    expect(mock.context.resume).toHaveBeenCalledOnce();
    expect(mock.oscillator.start).toHaveBeenCalledWith(3);
  });

  it('silently skips audio when the platform cannot construct an audio context', () => {
    expect(() => playChatCompletionSound(true, () => { throw new Error('unavailable'); })).not.toThrow();
  });
});
