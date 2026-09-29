import type { DesktopCatalog, DesktopLocaleId } from './keys.js';

export const splitMagnifierTranslations: Record<DesktopLocaleId, DesktopCatalog> = {
  en: {
    'visionImpaired.splitMagnifier.region': 'Split-screen magnifier',
    'visionImpaired.splitMagnifier.position': '2.5× magnification · scroll position {position} pixels',
    'visionImpaired.splitMagnifier.empty': 'No readable paragraph at the current position.'
  },
  de: {
    'visionImpaired.splitMagnifier.region': 'Geteilte Bildschirmlupe',
    'visionImpaired.splitMagnifier.position': '2,5-fache Vergrößerung · Scrollposition {position} Pixel',
    'visionImpaired.splitMagnifier.empty': 'An dieser Position wurde kein lesbarer Absatz gefunden.'
  },
  it: {
    'visionImpaired.splitMagnifier.region': 'Lente a schermo diviso',
    'visionImpaired.splitMagnifier.position': 'Ingrandimento 2,5× · posizione di scorrimento {position} pixel',
    'visionImpaired.splitMagnifier.empty': 'Nessun paragrafo leggibile in questa posizione.'
  },
  es: {
    'visionImpaired.splitMagnifier.region': 'Lupa de pantalla dividida',
    'visionImpaired.splitMagnifier.position': 'Ampliación 2,5× · posición de desplazamiento {position} píxeles',
    'visionImpaired.splitMagnifier.empty': 'No hay ningún párrafo legible en esta posición.'
  },
  fr: {
    'visionImpaired.splitMagnifier.region': 'Loupe à écran partagé',
    'visionImpaired.splitMagnifier.position': 'Agrandissement 2,5× · position de défilement : {position} pixels',
    'visionImpaired.splitMagnifier.empty': 'Aucun paragraphe lisible à cette position.'
  },
  'pt-BR': {
    'visionImpaired.splitMagnifier.region': 'Lupa de tela dividida',
    'visionImpaired.splitMagnifier.position': 'Ampliação de 2,5× · posição de rolagem de {position} pixels',
    'visionImpaired.splitMagnifier.empty': 'Nenhum parágrafo legível nesta posição.'
  },
  ru: {
    'visionImpaired.splitMagnifier.region': 'Лупа с разделённым экраном',
    'visionImpaired.splitMagnifier.position': 'Увеличение 2,5× · позиция прокрутки: {position} пикс.',
    'visionImpaired.splitMagnifier.empty': 'В этой позиции нет читаемого абзаца.'
  }
};
