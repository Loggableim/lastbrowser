export class Terminal {
  constructor(options?: Record<string, unknown>);
  cols: number; rows: number;
  open(element: HTMLElement): void;
  write(data: string): void;
  focus(): void;
  dispose(): void;
  loadAddon(addon: unknown): void;
  onData(callback: (data: string) => void): { dispose(): void };
  onResize(callback: (size: { cols: number; rows: number }) => void): { dispose(): void };
}
