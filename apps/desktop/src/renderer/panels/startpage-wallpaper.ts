export interface StartPageWallpaper {
  id: string;
  path: string;
}

export const START_PAGE_WALLPAPERS: readonly StartPageWallpaper[] = [
  { id: 'liquid-obsidian', path: './launchpad-wallpaper.jpg' },
  { id: 'nordic-arch', path: './wallpapers/nordic-arch.jpg' },
  { id: 'cyberpunk-street', path: './wallpapers/cyberpunk-street.jpg' },
  { id: 'misty-forest', path: './wallpapers/misty-forest.jpg' },
  { id: 'sapphire-nebula', path: './wallpapers/sapphire-nebula.jpg' },
  { id: 'temple-evening', path: './wallpapers/temple-evening.jpg' }
];

export interface StartPageWallpaperPreference {
  wallpaperId: string;
  dim: number;
  blur: number;
}

export const DEFAULT_WALLPAPER_PREFERENCE: StartPageWallpaperPreference = {
  wallpaperId: START_PAGE_WALLPAPERS[0].id,
  dim: 60,
  blur: 0
};

export function startPageWallpaperStorageKey(browserProfileId: string, backendProfileId: string, workspacePath: string): string {
  return `lastbrowser.startPage.wallpaper.v1:${JSON.stringify([browserProfileId, backendProfileId, workspacePath])}`;
}

export function parseStartPageWallpaperPreference(raw: string | null): StartPageWallpaperPreference {
  if (!raw) return DEFAULT_WALLPAPER_PREFERENCE;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return DEFAULT_WALLPAPER_PREFERENCE;
    const record = value as Record<string, unknown>;
    return {
      wallpaperId: START_PAGE_WALLPAPERS.some(wallpaper => wallpaper.id === record.wallpaperId)
        ? String(record.wallpaperId) : DEFAULT_WALLPAPER_PREFERENCE.wallpaperId,
      dim: typeof record.dim === 'number' && Number.isFinite(record.dim)
        ? Math.round(Math.max(0, Math.min(80, record.dim))) : DEFAULT_WALLPAPER_PREFERENCE.dim,
      blur: typeof record.blur === 'number' && Number.isFinite(record.blur)
        ? Math.round(Math.max(0, Math.min(20, record.blur))) : DEFAULT_WALLPAPER_PREFERENCE.blur
    };
  } catch {
    return DEFAULT_WALLPAPER_PREFERENCE;
  }
}
