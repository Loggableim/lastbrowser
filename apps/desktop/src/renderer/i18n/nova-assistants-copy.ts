import type { DesktopLocaleId } from './keys.js';

type Copy = {
  assistants: string; activity: string; manage: string; space: string; profile: string;
  selected: string; add: string; instructions: string; disabled: string;
  switchChat: string; remove: string; unableToOpen: string;
};

export const novaAssistantsCopy: Record<DesktopLocaleId, Copy> = {
  en: {
    assistants: 'Assistants', activity: 'Activity', manage: 'Manage',
    space: 'Choose an assistant for this Space.', profile: 'Assistants in this browser profile',
    selected: 'Selected for this Space', add: 'New assistant', instructions: 'Response instructions',
    disabled: 'Enable additional assistants in the Extension & Skill Hub to chat with them.',
    switchChat: 'Open a new Nova chat with {name}? The current chat will remain in Recent sessions.',
    remove: 'Delete {name} from this browser profile?', unableToOpen: 'The assistant chat could not be opened.',
  },
  de: {
    assistants: 'Assistenten', activity: 'Aktivität', manage: 'Verwalten',
    space: 'Wähle einen Assistenten für diesen Space.', profile: 'Assistenten in diesem Browserprofil',
    selected: 'Für diesen Space ausgewählt', add: 'Neuer Assistent', instructions: 'Anweisungen für Antworten',
    disabled: 'Aktiviere zusätzliche Assistenten im Extension & Skill Hub, um mit ihnen zu chatten.',
    switchChat: 'Einen neuen Nova-Chat mit {name} öffnen? Der aktuelle Chat bleibt in den letzten Sitzungen.',
    remove: '{name} aus diesem Browserprofil löschen?', unableToOpen: 'Der Assistenten-Chat konnte nicht geöffnet werden.',
  },
  it: {
    assistants: 'Assistenti', activity: 'Attività', manage: 'Gestisci',
    space: 'Scegli un assistente per questo spazio.', profile: 'Assistenti in questo profilo del browser',
    selected: 'Selezionato per questo spazio', add: 'Nuovo assistente', instructions: 'Istruzioni per le risposte',
    disabled: 'Attiva gli assistenti aggiuntivi nel centro estensioni e skill per chattare con loro.',
    switchChat: 'Aprire una nuova chat Nova con {name}? La chat attuale rimarrà nelle sessioni recenti.',
    remove: 'Eliminare {name} da questo profilo del browser?', unableToOpen: 'Impossibile aprire la chat con l’assistente.',
  },
  es: {
    assistants: 'Asistentes', activity: 'Actividad', manage: 'Gestionar',
    space: 'Elige un asistente para este espacio.', profile: 'Asistentes en este perfil del navegador',
    selected: 'Seleccionado para este espacio', add: 'Nuevo asistente', instructions: 'Instrucciones para las respuestas',
    disabled: 'Activa los asistentes adicionales en el centro de extensiones y habilidades para chatear con ellos.',
    switchChat: '¿Abrir un nuevo chat de Nova con {name}? El chat actual seguirá en las sesiones recientes.',
    remove: '¿Eliminar a {name} de este perfil del navegador?', unableToOpen: 'No se pudo abrir el chat con el asistente.',
  },
  fr: {
    assistants: 'Assistants', activity: 'Activité', manage: 'Gérer',
    space: 'Choisissez un assistant pour cet espace.', profile: 'Assistants de ce profil de navigateur',
    selected: 'Sélectionné pour cet espace', add: 'Nouvel assistant', instructions: 'Consignes de réponse',
    disabled: 'Activez les assistants supplémentaires dans le centre des extensions et compétences pour discuter avec eux.',
    switchChat: 'Ouvrir une nouvelle discussion Nova avec {name} ? La discussion actuelle restera dans les sessions récentes.',
    remove: 'Supprimer {name} de ce profil de navigateur ?', unableToOpen: 'Impossible d’ouvrir la discussion avec l’assistant.',
  },
  'pt-BR': {
    assistants: 'Assistentes', activity: 'Atividade', manage: 'Gerenciar',
    space: 'Escolha um assistente para este espaço.', profile: 'Assistentes neste perfil do navegador',
    selected: 'Selecionado para este espaço', add: 'Novo assistente', instructions: 'Instruções para as respostas',
    disabled: 'Ative assistentes adicionais na central de extensões e habilidades para conversar com eles.',
    switchChat: 'Abrir um novo chat do Nova com {name}? O chat atual permanecerá nas sessões recentes.',
    remove: 'Excluir {name} deste perfil do navegador?', unableToOpen: 'Não foi possível abrir o chat com o assistente.',
  },
  ru: {
    assistants: 'Ассистенты', activity: 'Активность', manage: 'Управление',
    space: 'Выберите ассистента для этого пространства.', profile: 'Ассистенты в этом профиле браузера',
    selected: 'Выбран для этого пространства', add: 'Новый ассистент', instructions: 'Инструкции для ответов',
    disabled: 'Включите дополнительных ассистентов в центре расширений и навыков, чтобы общаться с ними.',
    switchChat: 'Открыть новый чат Nova с ассистентом {name}? Текущий чат останется в недавних сеансах.',
    remove: 'Удалить ассистента {name} из этого профиля браузера?', unableToOpen: 'Не удалось открыть чат с ассистентом.',
  },
  ja: {
    assistants: 'アシスタント', activity: 'アクティビティ', manage: '管理',
    space: 'このスペースのアシスタントを選択します。', profile: 'このブラウザープロフィールのアシスタント',
    selected: 'このスペースで選択済み', add: '新しいアシスタント', instructions: '回答への指示',
    disabled: 'チャットするには、拡張機能とスキルのハブで追加のアシスタントを有効にしてください。',
    switchChat: '{name}と新しいNovaチャットを開きますか？現在のチャットは最近のセッションに残ります。',
    remove: 'このブラウザープロフィールから{name}を削除しますか？', unableToOpen: 'アシスタントのチャットを開けませんでした。',
  },
};
