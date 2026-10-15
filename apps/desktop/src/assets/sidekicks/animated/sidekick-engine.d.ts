export function createSidekick(el: HTMLElement, options?: Record<string, unknown>): {
  setState: (state: string) => void;
  getState: () => string;
  destroy: () => void;
};
