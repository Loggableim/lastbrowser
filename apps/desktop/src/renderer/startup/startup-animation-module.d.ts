declare module '*/startup-animation.js' {
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
    destroy: () => void;
  };
}
