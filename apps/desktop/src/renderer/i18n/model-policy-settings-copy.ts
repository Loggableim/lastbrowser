import type { DesktopLocaleId } from './keys.js';

export const modelPolicySettingsCopy: Record<DesktopLocaleId, Readonly<{ loading: string; sessionRequired: string }>> = {
  en: { loading: 'Checking the active chat and Space…', sessionRequired: 'Open a chat in this Space to configure its model policy. Settings stay bound to that chat and Space.' },
  de: { loading: 'Aktiver Chat und Space werden geprüft…', sessionRequired: 'Öffne einen Chat in diesem Space, um seine Modellrichtlinie festzulegen. Die Einstellungen bleiben an diesen Chat und Space gebunden.' },
  it: { loading: 'Verifica della chat e dello Space attivi…', sessionRequired: 'Apri una chat in questo Space per configurarne i criteri del modello. Le impostazioni restano legate a quella chat e a quello Space.' },
  es: { loading: 'Comprobando el chat y el Space activos…', sessionRequired: 'Abre un chat en este Space para configurar su política de modelos. La configuración queda vinculada a ese chat y Space.' },
  fr: { loading: 'Vérification du chat et du Space actifs…', sessionRequired: 'Ouvrez une discussion dans ce Space pour configurer sa règle de modèle. Les réglages restent liés à cette discussion et à ce Space.' },
  'pt-BR': { loading: 'Verificando a conversa e o Space ativos…', sessionRequired: 'Abra uma conversa neste Space para configurar a política de modelos. As configurações ficam vinculadas a essa conversa e a esse Space.' },
  ru: { loading: 'Проверка активного чата и Space…', sessionRequired: 'Откройте чат в этом Space, чтобы настроить его правила выбора модели. Настройки привязаны к этому чату и Space.' },
  ja: { loading: '現在のチャットとSpaceを確認しています…', sessionRequired: 'モデルポリシーを設定するには、このSpaceでチャットを開いてください。設定はそのチャットとSpaceに紐づきます。' }
};
