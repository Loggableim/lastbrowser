import { randomInt } from 'node:crypto';

export const startupLaunchIconIds = [
  'sidekick-01',
  'sidekick-02',
  'sidekick-03',
  'sidekick-04',
  'sidekick-05',
  'sidekick-06'
] as const;

export type StartupLaunchIconId = (typeof startupLaunchIconIds)[number];

export function createStartupLaunchIconSelector(
  chooseIndex: (maxExclusive: number) => number = (maxExclusive) => randomInt(maxExclusive)
): () => StartupLaunchIconId {
  let selected: StartupLaunchIconId | null = null;
  return () => {
    if (selected !== null) return selected;
    const index = chooseIndex(startupLaunchIconIds.length);
    if (!Number.isInteger(index) || index < 0 || index >= startupLaunchIconIds.length) {
      throw new RangeError('Startup icon selector returned an index outside the icon list.');
    }
    selected = startupLaunchIconIds[index];
    return selected;
  };
}

const getLaunchIcon = createStartupLaunchIconSelector();

/** Select once per Electron process so every window and retry shares the launch icon. */
export function getStartupLaunchIcon(): StartupLaunchIconId {
  return getLaunchIcon();
}
