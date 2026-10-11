export const startupIconIds = ['sidekick-01', 'sidekick-02', 'sidekick-03', 'sidekick-04', 'sidekick-05', 'sidekick-06'] as const;

export type StartupIconId = (typeof startupIconIds)[number];
export type StartupPhaseId = 'engine' | 'profile' | 'spaces' | 'connections' | 'models' | 'sidekick' | 'session' | 'sandbox' | 'ready';
export type StartupSignalState = 'pending' | 'complete' | 'error';

export type StartupReadinessSignals = {
  engine: StartupSignalState;
  profile: StartupSignalState;
  spaces: StartupSignalState;
  connections: StartupSignalState;
  models: StartupSignalState;
  sidekick: StartupSignalState;
  session: StartupSignalState;
  sandbox: StartupSignalState;
};

const startupSignalOrder = [
  'engine',
  'sandbox',
  'profile',
  'sidekick',
  'session',
  'spaces',
  'connections',
  'models'
] as const satisfies readonly (keyof StartupReadinessSignals)[];

/** Return the first actual startup stage that has not completed. */
export function deriveStartupPhase(signals: StartupReadinessSignals): StartupPhaseId {
  const failedStage = startupSignalOrder.find((stage) => signals[stage] === 'error');
  if (failedStage) return failedStage;
  const activeStage = startupSignalOrder.find((stage) => signals[stage] !== 'complete');
  return activeStage ?? 'ready';
}

export function isStartupReady(signals: StartupReadinessSignals): boolean {
  return deriveStartupPhase(signals) === 'ready';
}

export function getStartupFailureStage(signals: StartupReadinessSignals): keyof StartupReadinessSignals | null {
  return startupSignalOrder.find((stage) => signals[stage] === 'error') ?? null;
}

export function isValidStartupModelCatalog(value: unknown): boolean {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Array.isArray((value as { groups?: unknown }).groups);
}

export function chooseStartupIcon(random: () => number = Math.random): StartupIconId {
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new RangeError('Startup icon random source must return a finite value in [0, 1).');
  }
  return startupIconIds[Math.floor(sample * startupIconIds.length)];
}

export function chooseStartupQuoteIndex(random: () => number = Math.random, quoteCount = 7): number {
  if (!Number.isInteger(quoteCount) || quoteCount < 1) {
    throw new RangeError('Startup quote count must be a positive integer.');
  }
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new RangeError('Startup quote random source must return a finite value in [0, 1).');
  }
  return Math.floor(sample * quoteCount);
}

export function nextStartupQuoteIndex(current: number, quoteCount = 7): number {
  if (!Number.isInteger(quoteCount) || quoteCount < 1) {
    throw new RangeError('Startup quote count must be a positive integer.');
  }
  if (!Number.isInteger(current) || current < 0 || current >= quoteCount) {
    throw new RangeError('Current startup quote index is outside the quote list.');
  }
  return (current + 1) % quoteCount;
}
