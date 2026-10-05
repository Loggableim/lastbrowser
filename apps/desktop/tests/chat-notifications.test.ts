import { describe, expect, it } from 'vitest';
import { CHAT_COMPLETION_NOTIFICATION, getChatCompletionNotification, shouldNotifyChatCompletion } from '../src/main/chat-notifications.js';

describe('background chat completion notifications', () => {
  it('notifies only when the saved preference is explicitly enabled and the window is unfocused', () => {
    expect(shouldNotifyChatCompletion(true, false)).toBe(true);
    expect(shouldNotifyChatCompletion(true, true)).toBe(false);
    expect(shouldNotifyChatCompletion(false, false)).toBe(false);
    expect(shouldNotifyChatCompletion(undefined, false)).toBe(false);
  });

  it('uses generic localized copy for every supported desktop language', () => {
    const translations = {
      en: 'A reply is ready.',
      de: 'Eine Antwort ist fertig.',
      it: 'La risposta è pronta.',
      es: 'La respuesta está lista.',
      fr: 'Une réponse est prête.',
      'pt-BR': 'Uma resposta está pronta.',
      ru: 'Ответ готов.',
      ja: '返信が届きました。'
    };
    for (const [locale, body] of Object.entries(translations)) {
      expect(getChatCompletionNotification(locale)).toEqual({ title: 'Lastbrowser', body });
    }
  });

  it('falls back to English for an unknown locale and does not include chat content', () => {
    expect(getChatCompletionNotification('unknown')).toEqual({
      title: 'Lastbrowser',
      body: 'A reply is ready.'
    });
    expect(CHAT_COMPLETION_NOTIFICATION).toEqual({
      title: 'Lastbrowser',
      body: 'A reply is ready.'
    });
  });
});
