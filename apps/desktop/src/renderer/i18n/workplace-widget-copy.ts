import type { DesktopLocaleId } from './keys.js';

type WorkplaceWidgetCopy = {
  notes: { title: string; label: string; placeholder: string; scope: string };
  tasks: { title: string; remove: string; empty: string; newTask: string; add: string; limit: string };
  focus: {
    title: string; remaining: string; running: string; complete: string; ready: string;
    minutes: string; pause: string; start: string; reset: string;
  };
};

export const workplaceWidgetCopy: Record<DesktopLocaleId, WorkplaceWidgetCopy> = {
  en: {
    notes: { title: 'Notes', label: 'Local Space notes', placeholder: 'Thoughts for this workspace …', scope: 'Local · only in this profile and Space' },
    tasks: {
      title: 'Tasks', remove: 'Delete task', empty: 'What would you like to finish?', newTask: 'New task', add: 'Add',
      limit: 'Maximum 80 tasks. Delete an entry to make room.',
    },
    focus: {
      title: 'Focus timer', remaining: 'Remaining focus time', running: 'Time for your next task',
      complete: 'Focus session complete', ready: 'Your quiet work session', minutes: 'Minutes',
      pause: 'Pause', start: 'Start', reset: 'Reset',
    },
  },
  de: {
    notes: { title: 'Notizen', label: 'Lokale Space-Notizen', placeholder: 'Gedanken für diesen Arbeitsplatz …', scope: 'Lokal · nur in diesem Profil und Space' },
    tasks: {
      title: 'Aufgaben', remove: 'Aufgabe löschen', empty: 'Was möchtest du erledigen?', newTask: 'Neue Aufgabe', add: 'Hinzufügen',
      limit: 'Maximal 80 Aufgaben. Lösche einen Eintrag, um Platz zu schaffen.',
    },
    focus: {
      title: 'Fokuszeit', remaining: 'Verbleibende Fokuszeit', running: 'Zeit für deine nächste Aufgabe',
      complete: 'Fokuszeit abgeschlossen', ready: 'Dein ruhiger Arbeitsblock', minutes: 'Minuten',
      pause: 'Pause', start: 'Starten', reset: 'Zurücksetzen',
    },
  },
  it: {
    notes: { title: 'Note', label: 'Note locali dello spazio', placeholder: 'Appunti per questo spazio …', scope: 'In locale · solo in questo profilo e in questo spazio' },
    tasks: {
      title: 'Attività', remove: 'Elimina attività', empty: 'Cosa vuoi portare a termine?', newTask: 'Nuova attività', add: 'Aggiungi',
      limit: 'Massimo 80 attività. Elimina una voce per fare spazio.',
    },
    focus: {
      title: 'Timer di concentrazione', remaining: 'Tempo di concentrazione rimanente', running: 'È il momento della prossima attività',
      complete: 'Sessione di concentrazione conclusa', ready: 'La tua sessione di lavoro senza distrazioni', minutes: 'Minuti',
      pause: 'Pausa', start: 'Avvia', reset: 'Reimposta',
    },
  },
  es: {
    notes: { title: 'Notas', label: 'Notas locales del espacio', placeholder: 'Ideas para este espacio …', scope: 'En local · solo en este perfil y espacio' },
    tasks: {
      title: 'Tareas', remove: 'Eliminar tarea', empty: '¿Qué te gustaría terminar?', newTask: 'Nueva tarea', add: 'Añadir',
      limit: 'Máximo 80 tareas. Elimina una para hacer sitio.',
    },
    focus: {
      title: 'Temporizador de concentración', remaining: 'Tiempo de concentración restante', running: 'Hora de tu próxima tarea',
      complete: 'Sesión de concentración terminada', ready: 'Tu sesión de trabajo sin distracciones', minutes: 'Minutos',
      pause: 'Pausar', start: 'Iniciar', reset: 'Reiniciar',
    },
  },
  fr: {
    notes: { title: 'Notes', label: 'Notes locales de l’espace', placeholder: 'Idées pour cet espace …', scope: 'En local · uniquement dans ce profil et cet espace' },
    tasks: {
      title: 'Tâches', remove: 'Supprimer la tâche', empty: 'Que souhaitez-vous terminer ?', newTask: 'Nouvelle tâche', add: 'Ajouter',
      limit: '80 tâches maximum. Supprimez une tâche pour libérer de la place.',
    },
    focus: {
      title: 'Minuteur de concentration', remaining: 'Temps de concentration restant', running: 'Place à votre prochaine tâche',
      complete: 'Session de concentration terminée', ready: 'Votre session de travail au calme', minutes: 'Minutes',
      pause: 'Pause', start: 'Démarrer', reset: 'Réinitialiser',
    },
  },
  'pt-BR': {
    notes: { title: 'Anotações', label: 'Anotações locais do espaço', placeholder: 'Ideias para este espaço …', scope: 'Local · somente neste perfil e espaço' },
    tasks: {
      title: 'Tarefas', remove: 'Excluir tarefa', empty: 'O que você gostaria de concluir?', newTask: 'Nova tarefa', add: 'Adicionar',
      limit: 'Até 80 tarefas. Exclua uma tarefa para liberar espaço.',
    },
    focus: {
      title: 'Tempo de foco', remaining: 'Tempo de foco restante', running: 'Hora da sua próxima tarefa',
      complete: 'Sessão de foco concluída', ready: 'Sua sessão de trabalho sem distrações', minutes: 'Minutos',
      pause: 'Pausar', start: 'Iniciar', reset: 'Redefinir',
    },
  },
  ru: {
    notes: { title: 'Заметки', label: 'Локальные заметки пространства', placeholder: 'Мысли для этого пространства …', scope: 'Локально · только в этом профиле и пространстве' },
    tasks: {
      title: 'Задачи', remove: 'Удалить задачу', empty: 'Что вы хотите сделать?', newTask: 'Новая задача', add: 'Добавить',
      limit: 'Не более 80 задач. Удалите одну задачу, чтобы освободить место.',
    },
    focus: {
      title: 'Таймер концентрации', remaining: 'Оставшееся время концентрации', running: 'Время для следующей задачи',
      complete: 'Сеанс концентрации завершён', ready: 'Время поработать без отвлечений', minutes: 'Минуты',
      pause: 'Пауза', start: 'Начать', reset: 'Сбросить',
    },
  },
  ja: {
    notes: { title: 'メモ', label: 'スペースのローカルメモ', placeholder: 'このスペース用のメモ …', scope: 'ローカル保存 · このプロフィールとスペースのみ' },
    tasks: {
      title: 'タスク', remove: 'タスクを削除', empty: '何を終わらせたいですか？', newTask: '新しいタスク', add: '追加',
      limit: 'タスクは最大80件です。追加するには既存のタスクを削除してください。',
    },
    focus: {
      title: '集中タイマー', remaining: '集中時間の残り', running: '次のタスクに集中する時間です',
      complete: '集中時間が終了しました', ready: '落ち着いて作業する時間', minutes: '分',
      pause: '一時停止', start: '開始', reset: 'リセット',
    },
  },
};
