import type { ChatCommandId } from './CommandActionContracts.js';
export const commandLocales = ['de', 'en', 'it', 'es', 'fr', 'pt-BR', 'ru', 'ja'] as const;
export type CommandLocale = typeof commandLocales[number];
export interface CommandCopy {
  menu: string; search: string; empty: string; unavailable: string;
  ui: string; next_turn: string; chat: string;
  goal: string; start: string; edit: string; pause: string; resume: string; clear: string; refresh: string;
  completeAction: string; cancelAction: string;
  active: string; paused: string; done: string; cleared: string; unknown: string; unlimited: string; turns: string;
  pendingJudge: string; runOwned: string; goalPlaceholder: string; details: string; revision: string;
  commands: Record<ChatCommandId, string>;
}
const goalActionLabels: Record<CommandLocale, Pick<CommandCopy, 'completeAction' | 'cancelAction'>> = {
  de: { completeAction: 'Abschließen', cancelAction: 'Abbrechen' },
  en: { completeAction: 'Complete', cancelAction: 'Cancel' },
  it: { completeAction: 'Completa', cancelAction: 'Annulla' },
  es: { completeAction: 'Completar', cancelAction: 'Cancelar' },
  fr: { completeAction: 'Terminer', cancelAction: 'Annuler' },
  'pt-BR': { completeAction: 'Concluir', cancelAction: 'Cancelar' },
  ru: { completeAction: 'Завершить', cancelAction: 'Отменить' },
  ja: { completeAction: '完了する', cancelAction: 'キャンセル' },
};
const rows: Record<CommandLocale, readonly string[]> = {
  de: ['Chatbefehle','Befehl suchen','Keine Befehle gefunden','Backendfunktion nicht verfügbar','Oberfläche','Nächster Turn','Dieser Chat','Persistentes Ziel','Starten','Ändern','Pausieren','Fortsetzen','Beenden','Aktualisieren','Aktiv','Pausiert','Erledigt','Beendet','Unbekannt','Unbegrenzt','Turns','Zielbewertung wartet','Fortsetzung wird vom Agentenlauf gesteuert','Ziel für diesen Chat','Modell auswählen','Nur analysieren und lesen','Persistentes Ziel steuern','Fragen und Annahmen gemeinsam prüfen','Mehr Qualität innerhalb des verfügbaren Budgets','Neue Unterhaltung erstellen','Aktuellen Turn stoppen','Befehle anzeigen','Google-Kontingent anzeigen','Pluginsteuerung öffnen','Details','Revision'],
  en: ['Chat commands','Search commands','No commands found','Backend feature unavailable','Interface','Next turn','This chat','Persistent goal','Start','Edit','Pause','Resume','End','Refresh','Active','Paused','Done','Ended','Unknown','Unlimited','Turns','Goal evaluation pending','Continuation is controlled by the agent run','Goal for this chat','Choose model','Analyze and read only','Control persistent goal','Explore questions and assumptions together','Higher quality within the available budget','Create new conversation','Stop current turn','Show commands','Show Google quota','Open plugin controls','Details','Revision'],
  it: ['Comandi chat','Cerca comandi','Nessun comando trovato','Funzione backend non disponibile','Interfaccia','Prossimo turno','Questa chat','Obiettivo persistente','Avvia','Modifica','Pausa','Riprendi','Termina','Aggiorna','Attivo','In pausa','Completato','Terminato','Sconosciuto','Illimitato','Turni','Valutazione obiettivo in attesa','La continuazione è gestita dall’agente','Obiettivo di questa chat','Scegli modello','Solo analisi e lettura','Gestisci obiettivo persistente','Esamina insieme domande e ipotesi','Qualità superiore entro il budget disponibile','Crea nuova conversazione','Ferma turno attuale','Mostra comandi','Mostra quota Google','Apri controlli plugin','Dettagli','Revisione'],
  es: ['Comandos del chat','Buscar comandos','No hay comandos','Función del backend no disponible','Interfaz','Siguiente turno','Este chat','Objetivo persistente','Iniciar','Editar','Pausar','Reanudar','Finalizar','Actualizar','Activo','Pausado','Completado','Finalizado','Desconocido','Ilimitado','Turnos','Evaluación del objetivo pendiente','El agente controla la continuación','Objetivo de este chat','Elegir modelo','Solo analizar y leer','Gestionar objetivo persistente','Examinar preguntas y supuestos juntos','Mayor calidad dentro del presupuesto disponible','Crear conversación nueva','Detener turno actual','Mostrar comandos','Mostrar cuota Google','Abrir controles de plugins','Detalles','Revisión'],
  fr: ['Commandes du chat','Rechercher une commande','Aucune commande trouvée','Fonction backend indisponible','Interface','Prochain tour','Ce chat','Objectif persistant','Démarrer','Modifier','Pause','Reprendre','Terminer','Actualiser','Actif','En pause','Terminé','Arrêté','Inconnu','Illimité','Tours','Évaluation de l’objectif en attente','La continuation est contrôlée par l’agent','Objectif de ce chat','Choisir un modèle','Analyse et lecture uniquement','Gérer l’objectif persistant','Examiner ensemble les questions et hypothèses','Qualité accrue dans le budget disponible','Créer une conversation','Arrêter le tour actuel','Afficher les commandes','Afficher le quota Google','Ouvrir les contrôles des plugins','Détails','Révision'],
  'pt-BR': ['Comandos do chat','Buscar comandos','Nenhum comando encontrado','Recurso do backend indisponível','Interface','Próximo turno','Este chat','Objetivo persistente','Iniciar','Editar','Pausar','Retomar','Encerrar','Atualizar','Ativo','Pausado','Concluído','Encerrado','Desconhecido','Ilimitado','Turnos','Avaliação do objetivo pendente','O agente controla a continuação','Objetivo deste chat','Escolher modelo','Somente analisar e ler','Controlar objetivo persistente','Examinar perguntas e hipóteses juntos','Mais qualidade dentro do orçamento disponível','Criar nova conversa','Parar turno atual','Mostrar comandos','Mostrar cota Google','Abrir controles de plugins','Detalhes','Revisão'],
  ru: ['Команды чата','Поиск команд','Команды не найдены','Функция сервера недоступна','Интерфейс','Следующий ход','Этот чат','Постоянная цель','Начать','Изменить','Пауза','Продолжить','Завершить','Обновить','Активна','На паузе','Выполнена','Завершена','Неизвестно','Без ограничения','Ходы','Ожидается оценка цели','Продолжением управляет агент','Цель этого чата','Выбрать модель','Только анализ и чтение','Управлять постоянной целью','Обсудить вопросы и предположения','Выше качество в пределах бюджета','Создать новый чат','Остановить текущий ход','Показать команды','Показать квоту Google','Открыть управление плагинами','Подробности','Ревизия'],
  ja: ['チャットコマンド','コマンドを検索','コマンドがありません','バックエンド機能は利用できません','画面操作','次のターン','このチャット','継続目標','開始','編集','一時停止','再開','終了','更新','実行中','一時停止中','達成','終了済み','不明','無制限','ターン','目標の評価待ち','継続はエージェントが制御します','このチャットの目標','モデルを選択','分析と読み取りのみ','継続目標を管理','質問と前提を一緒に検討','予算内で品質を高める','新しい会話を作成','現在のターンを停止','コマンドを表示','Googleの割り当てを表示','プラグイン設定を開く','詳細','リビジョン'],
};
const keys = ['menu','search','empty','unavailable','ui','next_turn','chat','goal','start','edit','pause','resume','clear','refresh','active','paused','done','cleared','unknown','unlimited','turns','pendingJudge','runOwned','goalPlaceholder'] as const;
const commandIds: ChatCommandId[] = ['model','plan','goal','grill_me','boost','new','stop','help','gquota','plugins'];
export function chatCommandCopy(locale: string): CommandCopy {
  const row = rows[locale as CommandLocale] || rows.en;
  return { ...Object.fromEntries(keys.map((key, index) => [key, row[index]])),
    details: row[row.length - 2], revision: row[row.length - 1],
    ...(goalActionLabels[locale as CommandLocale] || goalActionLabels.en),
    commands: Object.fromEntries(commandIds.map((key, index) => [key, row[keys.length + index]])) } as CommandCopy;
}
const budgetLabels: Record<CommandLocale, readonly [string, string]> = {
  de: ['Parallele Agenten', 'Tokenbudget'], en: ['Parallel agents', 'Token budget'],
  it: ['Agenti paralleli', 'Budget token'], es: ['Agentes paralelos', 'Presupuesto de tokens'],
  fr: ['Agents parallèles', 'Budget de tokens'], 'pt-BR': ['Agentes paralelos', 'Orçamento de tokens'],
  ru: ['Параллельные агенты', 'Лимит токенов'], ja: ['並列エージェント', 'トークン予算'],
};
export function chatBudgetLabels(locale: string): readonly [string, string] { return budgetLabels[locale as CommandLocale] || budgetLabels.en; }
