// Akustisches Feedback (docs/visionimpaired.md §8, Feature 36).
// Offline über die Web Audio API: ein dezenter D5→A5 Sinus-Gong, damit ein
// sehbehinderter Nutzer nicht auf das Chat-Fenster starren muss, bis Nova
// fertig ist. Kein Asset-Loading, keine Netzwerkabhängigkeit.

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!sharedContext) sharedContext = new Ctor();
    // Autoplay-Politik: ein pausierter Kontext muss einmal resumet werden.
    if (sharedContext.state === 'suspended') void sharedContext.resume();
    return sharedContext;
  } catch {
    return null;
  }
}

/** D5 (587.33 Hz) → A5 (880 Hz) Zweiklang-Gong, ~0.6s Ausklingen. */
export function playCopilotSuccessChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880.0, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // AudioContext nicht verfügbar — Chime ist Best-Effort.
  }
}