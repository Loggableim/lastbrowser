import type { DesktopLocaleId } from './keys.js';

type WallpaperCopy = {
  settings: string;
  previous: string;
  next: string;
  close: string;
  dim: string;
  blur: string;
  images: Record<string, string>;
};

const wallpaperNames = {
  'liquid-obsidian': 'Liquid Obsidian',
  'nordic-arch': 'Nordic Arch',
  'cyberpunk-street': 'Cyberpunk Street',
  'misty-forest': 'Misty Forest',
  'sapphire-nebula': 'Sapphire Nebula',
  'temple-evening': 'Evening Temple'
};

export const browserStartWallpaperCopy: Record<DesktopLocaleId, WallpaperCopy> = {
  en: { settings: 'Background', previous: 'Previous background', next: 'Next background', close: 'Close background settings', dim: 'Darken background', blur: 'Blur background', images: wallpaperNames },
  de: { settings: 'Hintergrund', previous: 'Vorheriger Hintergrund', next: 'Nächster Hintergrund', close: 'Hintergrundauswahl schließen', dim: 'Hintergrund abdunkeln', blur: 'Hintergrund weichzeichnen', images: { 'liquid-obsidian': 'Liquid Obsidian', 'nordic-arch': 'Nordischer Bogen', 'cyberpunk-street': 'Cyberpunk-Stadt', 'misty-forest': 'Nebelwald', 'sapphire-nebula': 'Saphirnebel', 'temple-evening': 'Tempel am Abend' } },
  es: { settings: 'Fondo', previous: 'Fondo anterior', next: 'Fondo siguiente', close: 'Cerrar ajustes de fondo', dim: 'Oscurecer fondo', blur: 'Desenfocar fondo', images: wallpaperNames },
  fr: { settings: 'Fond', previous: 'Fond précédent', next: 'Fond suivant', close: 'Fermer les réglages du fond', dim: 'Assombrir le fond', blur: 'Flouter le fond', images: wallpaperNames },
  it: { settings: 'Sfondo', previous: 'Sfondo precedente', next: 'Sfondo successivo', close: 'Chiudi impostazioni sfondo', dim: 'Scurisci sfondo', blur: 'Sfoca sfondo', images: wallpaperNames },
  'pt-BR': { settings: 'Plano de fundo', previous: 'Plano de fundo anterior', next: 'Próximo plano de fundo', close: 'Fechar ajustes do plano de fundo', dim: 'Escurecer plano de fundo', blur: 'Desfocar plano de fundo', images: wallpaperNames },
  ru: { settings: 'Фон', previous: 'Предыдущий фон', next: 'Следующий фон', close: 'Закрыть настройки фона', dim: 'Затемнить фон', blur: 'Размыть фон', images: wallpaperNames }
};
