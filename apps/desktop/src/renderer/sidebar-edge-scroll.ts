export interface EdgeScrollScheduler {
  delay(callback: () => void, milliseconds: number): number;
  cancelDelay(id: number): void;
  frame(callback: (time: number) => void): number;
  cancelFrame(id: number): void;
}

/** One cancellable hover gesture; elapsed time keeps speed independent of refresh rate. */
export function createEdgeScroller(
  move: (pixels: number) => boolean,
  scheduler: EdgeScrollScheduler
): { start: (direction: -1 | 1) => void; stop: () => void } {
  let timer: number | undefined;
  let frame: number | undefined;
  let previous: number | undefined;
  const stop = () => {
    if (timer !== undefined) scheduler.cancelDelay(timer);
    if (frame !== undefined) scheduler.cancelFrame(frame);
    timer = frame = previous = undefined;
  };
  return {
    stop,
    start(direction) {
      stop();
      timer = scheduler.delay(() => {
        timer = undefined;
        const tick = (time: number) => {
          frame = undefined;
          const elapsed = previous === undefined ? 0 : Math.min(time - previous, 50);
          previous = time;
          if (elapsed > 0 && !move(direction * elapsed * 0.12)) {
            stop();
            return;
          }
          frame = scheduler.frame(tick);
        };
        frame = scheduler.frame(tick);
      }, 250);
    }
  };
}
