/** Keep desktop completion notifications generic so private chat text never leaves the app window. */
export function shouldNotifyChatCompletion(enabled: unknown, windowFocused: boolean): boolean {
  return enabled === true && !windowFocused;
}

const CHAT_COMPLETION_BODIES = {
  en: 'A reply is ready.',
  de: 'Eine Antwort ist fertig.',
  it: 'La risposta è pronta.',
  es: 'La respuesta está lista.',
  fr: 'Une réponse est prête.',
  'pt-BR': 'Uma resposta está pronta.',
  ru: 'Ответ готов.'
} as const;

export type ChatNotificationLocale = keyof typeof CHAT_COMPLETION_BODIES;

/** Return generic localized copy; never include private conversation content. */
export function getChatCompletionNotification(locale: unknown): { title: string; body: string } {
  const requested = typeof locale === 'string' ? locale.trim() : '';
  const supportedLocale = Object.keys(CHAT_COMPLETION_BODIES).find(
    (candidate) => candidate.toLowerCase() === requested.toLowerCase()
  ) as ChatNotificationLocale | undefined;
  return {
    title: 'Lastbrowser',
    body: CHAT_COMPLETION_BODIES[supportedLocale ?? 'en']
  };
}

/** Backward-compatible English default for callers that need static copy. */
export const CHAT_COMPLETION_NOTIFICATION = getChatCompletionNotification('en');
