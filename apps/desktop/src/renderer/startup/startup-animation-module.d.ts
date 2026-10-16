declare module '../../../../../docs/design/startup-animation/startup-animation.js' {
  export const TIMING_DATA: Record<string, {
    durationMs: number;
    mainPeakMs: number;
    tailStartMs: number;
    onsetsMs: number[];
    theme?: string;
  }>;
  export const I18N_TEXTS: Record<string, unknown>;
  export function createStartupAnimation(el: HTMLElement, options: Record<string, unknown>): {
    play: (scene?: string) => Promise<void> | void;
    setPhase: (phase: string) => void;
    ready: () => void;
    error: () => void;
    setRainbow: (style: string) => void;
    setAudioOptions: (audio: { volume?: number; enabled?: boolean }) => void;
    destroy: () => void;
  };
}

declare module '../../../docs/design/startup-animation/startup-animation.js' {
  export const I18N_TEXTS: Record<string, unknown>;
}
