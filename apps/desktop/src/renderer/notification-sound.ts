/** Play a short, local-only tone when a native chat turn completes. */
export function playChatCompletionSound(
  enabled: boolean,
  createAudioContext?: () => AudioContext
): void {
  if (!enabled) return;
  if (!createAudioContext && typeof globalThis.AudioContext !== 'function') return;

  let context: AudioContext;
  try {
    context = createAudioContext ? createAudioContext() : new AudioContext();
  } catch {
    return;
  }

  const closeContext = (): void => {
    void context.close().catch(() => undefined);
  };

  const startTone = (): void => {
    try {
      if (context.state === 'closed') return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime;

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(740, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.06, startAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = closeContext;
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.2);
    } catch {
      closeContext();
    }
  };

  if (context.state === 'suspended') {
    void context.resume().then(startTone, closeContext);
  } else {
    startTone();
  }
}
