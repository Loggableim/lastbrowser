import type { DesktopLocaleId } from './keys.js';

type ChatHeaderCopy = {
  moreActions: string;
  status: { unknown: string; ready: string; starting: string; unavailable: string };
};

export const chatHeaderCopy: Record<DesktopLocaleId, ChatHeaderCopy> = {
  en: { moreActions: 'More chat actions', status: { unknown: 'Status unknown', ready: 'Online', starting: 'Starting', unavailable: 'Unavailable' } },
  de: { moreActions: 'Weitere Chataktionen', status: { unknown: 'Status unbekannt', ready: 'Online', starting: 'Startet', unavailable: 'Nicht verfügbar' } },
  es: { moreActions: 'Más acciones del chat', status: { unknown: 'Estado desconocido', ready: 'En línea', starting: 'Iniciando', unavailable: 'No disponible' } },
  fr: { moreActions: 'Autres actions du chat', status: { unknown: 'État inconnu', ready: 'En ligne', starting: 'Démarrage', unavailable: 'Indisponible' } },
  it: { moreActions: 'Altre azioni chat', status: { unknown: 'Stato sconosciuto', ready: 'Online', starting: 'Avvio', unavailable: 'Non disponibile' } },
  'pt-BR': { moreActions: 'Mais ações do chat', status: { unknown: 'Status desconhecido', ready: 'Online', starting: 'Iniciando', unavailable: 'Indisponível' } },
  ru: { moreActions: 'Другие действия чата', status: { unknown: 'Статус неизвестен', ready: 'В сети', starting: 'Запуск', unavailable: 'Недоступно' } }
};
