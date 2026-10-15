import type { DesktopLocaleId } from './i18n/keys.js';

export type ConnectionNotice = 'opencode-unreachable' | 'sign-in-expired';

const EXPIRED_STATE = /expired|reauth|invalid_grant|unauthorized/;
const EXPIRED_TEXT = /sign-?in expired|login expired|reauth_required|invalid_grant|\b401\b|unauthorized/i;
// Transport-level failures only. Request timeouts and OpenCode URLs inside other errors do not prove that OpenCode is unreachable.
const UNREACHABLE_TEXT = /econnrefused|enotfound|eai_again|unreachable|failed to fetch|network error/i;

export function classifyConnectionNotice(input: {
  error?: unknown;
  authStates?: readonly string[];
}): ConnectionNotice | null {
  const states = (input.authStates || []).map(state => state.toLowerCase());
  if (states.some(state => EXPIRED_STATE.test(state))) return 'sign-in-expired';
  const text = input.error instanceof Error ? input.error.message : typeof input.error === 'string' ? input.error : '';
  if (EXPIRED_TEXT.test(text)) return 'sign-in-expired';
  if (UNREACHABLE_TEXT.test(text)) return 'opencode-unreachable';
  return null;
}

export type CatalogNotice = 'slow-catalog' | ConnectionNotice | null;

const TIMEOUT_TEXT = /timed out|timeout/i;

/**
 * Classifies a catalog request failure. A request timeout means the catalog is
 * slow, not that the connection is down, so it maps to the neutral slow-catalog
 * state. Every other error falls back to the real connection classification
 * (which stays null for a timeout).
 */
export function classifyCatalogNotice(input: {
  error?: unknown;
  authStates?: readonly string[];
}): CatalogNotice {
  const text = input.error instanceof Error ? input.error.message : typeof input.error === 'string' ? input.error : '';
  if (TIMEOUT_TEXT.test(text)) return 'slow-catalog';
  return classifyConnectionNotice(input);
}

export const connectionNoticeCopy: Record<DesktopLocaleId, Record<ConnectionNotice, string>> = {
  en: {
    'opencode-unreachable': 'OpenCode is not reachable. Sending is paused until the connection returns.',
    'sign-in-expired': 'Sign-in expired. Sign in to OpenCode again, then retry.'
  },
  de: {
    'opencode-unreachable': 'OpenCode ist nicht erreichbar. Senden pausiert, bis die Verbindung wieder da ist.',
    'sign-in-expired': 'Anmeldung abgelaufen. Melde dich erneut bei OpenCode an und versuche es noch einmal.'
  },
  es: {
    'opencode-unreachable': 'OpenCode no está accesible. El envío queda en pausa hasta que vuelva la conexión.',
    'sign-in-expired': 'El inicio de sesión caducó. Vuelve a entrar en OpenCode y reintenta.'
  },
  fr: {
    'opencode-unreachable': 'OpenCode est injoignable. L’envoi est en pause jusqu’au retour de la connexion.',
    'sign-in-expired': 'Connexion expirée. Reconnecte-toi à OpenCode, puis réessaie.'
  },
  it: {
    'opencode-unreachable': 'OpenCode non è raggiungibile. L’invio resta in pausa finché la connessione non torna.',
    'sign-in-expired': 'Accesso scaduto. Accedi di nuovo a OpenCode e riprova.'
  },
  'pt-BR': {
    'opencode-unreachable': 'O OpenCode está inacessível. O envio fica pausado até a conexão voltar.',
    'sign-in-expired': 'O login expirou. Entre de novo no OpenCode e tente outra vez.'
  },
  ru: {
    'opencode-unreachable': 'OpenCode недоступен. Отправка на паузе, пока соединение не вернётся.',
    'sign-in-expired': 'Срок входа истёк. Войдите в OpenCode снова и повторите попытку.'
  },
  ja: {
    'opencode-unreachable': 'OpenCode に到達できません。接続が戻るまで送信は停止します。',
    'sign-in-expired': 'サインインの期限が切れました。OpenCode に再度サインインしてから再試行してください。'
  }
};
