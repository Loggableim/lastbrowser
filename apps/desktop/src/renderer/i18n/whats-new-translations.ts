import type { DesktopLocaleId, DesktopTranslationKey } from './keys.js';

type Keys = 'whatsNew.title' | 'whatsNew.intro' | 'whatsNew.version' | 'whatsNew.versionRange' | 'whatsNew.versionOnly' | 'whatsNew.close';
type Copy = Record<Keys, string>;

export const whatsNewTranslations: Record<DesktopLocaleId, Partial<Record<DesktopTranslationKey, string>>> = {
  en: {
    'whatsNew.title': "What's new",
    'whatsNew.intro': "Here's what's changed in this update.",
    'whatsNew.version': 'Version {version}',
    'whatsNew.versionRange': 'Updates from {fromVersion} to {toVersion}',
    'whatsNew.versionOnly': 'Version {toVersion}',
    'whatsNew.close': 'Close'
  } satisfies Copy,
  de: {
    'whatsNew.title': 'Was ist neu?',
    'whatsNew.intro': 'Das hat sich in diesem Update geändert.',
    'whatsNew.version': 'Version {version}',
    'whatsNew.versionRange': 'Updates von {fromVersion} bis {toVersion}',
    'whatsNew.versionOnly': 'Version {toVersion}',
    'whatsNew.close': 'Schließen'
  } satisfies Copy,
  it: {
    'whatsNew.title': 'Novità',
    'whatsNew.intro': 'Ecco le novità di questo aggiornamento.',
    'whatsNew.version': 'Versione {version}',
    'whatsNew.versionRange': 'Aggiornamenti da {fromVersion} a {toVersion}',
    'whatsNew.versionOnly': 'Versione {toVersion}',
    'whatsNew.close': 'Chiudi'
  } satisfies Copy,
  es: {
    'whatsNew.title': 'Novedades',
    'whatsNew.intro': 'Esto es lo que ha cambiado en esta actualización.',
    'whatsNew.version': 'Versión {version}',
    'whatsNew.versionRange': 'Actualizaciones de {fromVersion} a {toVersion}',
    'whatsNew.versionOnly': 'Versión {toVersion}',
    'whatsNew.close': 'Cerrar'
  } satisfies Copy,
  fr: {
    'whatsNew.title': 'Nouveautés',
    'whatsNew.intro': 'Voici les changements apportés par cette mise à jour.',
    'whatsNew.version': 'Version {version}',
    'whatsNew.versionRange': 'Mises à jour de {fromVersion} à {toVersion}',
    'whatsNew.versionOnly': 'Version {toVersion}',
    'whatsNew.close': 'Fermer'
  } satisfies Copy,
  'pt-BR': {
    'whatsNew.title': 'Novidades',
    'whatsNew.intro': 'Veja o que mudou nesta atualização.',
    'whatsNew.version': 'Versão {version}',
    'whatsNew.versionRange': 'Atualizações de {fromVersion} até {toVersion}',
    'whatsNew.versionOnly': 'Versão {toVersion}',
    'whatsNew.close': 'Fechar'
  } satisfies Copy,
  ru: {
    'whatsNew.title': 'Что нового',
    'whatsNew.intro': 'Изменения в этом обновлении.',
    'whatsNew.version': 'Версия {version}',
    'whatsNew.versionRange': 'Обновления с {fromVersion} до {toVersion}',
    'whatsNew.versionOnly': 'Версия {toVersion}',
    'whatsNew.close': 'Закрыть'
  } satisfies Copy,
  ja: {
    'whatsNew.title': '更新内容',
    'whatsNew.intro': '今回の更新で変更された内容です。',
    'whatsNew.version': 'バージョン {version}',
    'whatsNew.versionRange': '{fromVersion} から {toVersion} までの更新',
    'whatsNew.versionOnly': 'バージョン {toVersion}',
    'whatsNew.close': '閉じる'
  } satisfies Copy
};
