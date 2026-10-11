import type { StartupPhaseId } from './startup-screen-state.js';

export const startupLocaleIds = ['en', 'de', 'it', 'es', 'fr', 'pt-BR', 'ru', 'ja'] as const;
export type StartupLocaleId = (typeof startupLocaleIds)[number];

export type StartupScreenCopy = {
  quotes: readonly [string, string, string, string, string, string, string];
  phases: Record<StartupPhaseId, string>;
  sidekickWaiting: string;
  retry: string;
  errorTitle: string;
  errorDescription: string;
};

export const startupScreenCopy: Record<StartupLocaleId, StartupScreenCopy> = {
  de: {
    quotes: ['Hamster beim vortrainieren des Sprachmodells …', 'Noch schnell dem Algorithmus entfolgen …', 'Neuronale Netze werden entknotet …', 'Kontext laden. Brainrot aussortieren …', 'Dein Sidekick wird wach. Bitte noch keine Prompts.', 'Der Algorithmus empfiehlt: kurz durchatmen.', 'Trainingsdaten vom Doomscrolling befreien …'],
    phases: { engine: 'Lokale Engine startet …', profile: 'Dein Browserprofil wird geladen …', spaces: 'Spaces werden vorbereitet …', connections: 'Gespeicherte Modellverbindungen werden geladen …', models: 'Verfügbare Modelle werden geprüft …', sidekick: 'Die Verbindung zu Sidekick wird hergestellt …', session: 'Sitzungsschutz wird geprüft …', ready: 'Dein Browser ist bereit.' },
    sidekickWaiting: 'Sidekick startet noch. Du kannst bereits surfen.', retry: 'Erneut versuchen', errorTitle: 'Der Start konnte nicht abgeschlossen werden', errorDescription: 'Ein notwendiger Startschritt ist fehlgeschlagen. Bitte versuche es erneut.'
  },
  en: {
    quotes: ['Pre-training the language model with hamsters …', 'Quickly unfollowing the algorithm …', 'Untangling neural networks …', 'Loading context. Sorting out the brainrot …', 'Your Sidekick is waking up. No prompts just yet.', 'The algorithm recommends taking a quick breath.', 'Freeing the training data from doomscrolling …'],
    phases: { engine: 'Starting the local engine …', profile: 'Loading your browser profile …', spaces: 'Preparing Spaces …', connections: 'Loading saved model connections …', models: 'Checking available models …', sidekick: 'Connecting to Sidekick …', session: 'Checking session protection …', ready: 'Your browser is ready.' },
    sidekickWaiting: 'Sidekick is still starting. Browsing is available.', retry: 'Try again', errorTitle: 'Startup could not be completed', errorDescription: 'A required startup check failed. Please try again.'
  },
  it: {
    quotes: ['Pre-addestramento del modello linguistico con i criceti …', 'Un attimo: smettiamo di seguire l’algoritmo …', 'Stiamo districando le reti neurali …', 'Caricamento del contesto. Via il brainrot …', 'Il tuo Sidekick si sta svegliando. Niente prompt per ora.', 'L’algoritmo consiglia: fai un bel respiro.', 'Liberiamo i dati di addestramento dallo scrolling infinito …'],
    phases: { engine: 'Avvio del motore locale …', profile: 'Caricamento del profilo del browser …', spaces: 'Preparazione degli Spaces …', connections: 'Caricamento delle connessioni ai modelli salvate …', models: 'Verifica dei modelli disponibili …', sidekick: 'Connessione a Sidekick …', session: 'Verifica della protezione della sessione …', ready: 'Il browser è pronto.' },
    sidekickWaiting: 'Sidekick si sta ancora avviando. Puoi già navigare.', retry: 'Riprova', errorTitle: 'Impossibile completare l’avvio', errorDescription: 'Un controllo necessario per l’avvio non è riuscito. Riprova.'
  },
  es: {
    quotes: ['Preentrenando el modelo de lenguaje con hámsteres …', 'Dejemos de seguir al algoritmo un momento …', 'Desenredando redes neuronales …', 'Cargando contexto. Fuera el brainrot …', 'Tu Sidekick está despertando. Todavía sin prompts.', 'El algoritmo recomienda respirar un momento.', 'Liberando los datos de entrenamiento del doomscrolling …'],
    phases: { engine: 'Iniciando el motor local …', profile: 'Cargando tu perfil del navegador …', spaces: 'Preparando Spaces …', connections: 'Cargando las conexiones guardadas a modelos …', models: 'Comprobando los modelos disponibles …', sidekick: 'Conectando con Sidekick …', session: 'Comprobando la protección de la sesión …', ready: 'Tu navegador está listo.' },
    sidekickWaiting: 'Sidekick aún se está iniciando. Ya puedes navegar.', retry: 'Reintentar', errorTitle: 'No se pudo completar el inicio', errorDescription: 'No se pudo completar una comprobación necesaria. Inténtalo de nuevo.'
  },
  fr: {
    quotes: ['Pré-entraînement du modèle de langue avec des hamsters …', 'Unfollow de l’algorithme en cours …', 'Démêlage des réseaux neuronaux …', 'Chargement du contexte. On trie le brainrot …', 'Votre Sidekick se réveille. Pas encore de prompts.', 'L’algorithme conseille de reprendre son souffle.', 'Libération des données d’entraînement du doomscrolling …'],
    phases: { engine: 'Démarrage du moteur local …', profile: 'Chargement de votre profil de navigateur …', spaces: 'Préparation des Spaces …', connections: 'Chargement des connexions de modèles enregistrées …', models: 'Vérification des modèles disponibles …', sidekick: 'Connexion à Sidekick …', session: 'Vérification de la protection de session …', ready: 'Votre navigateur est prêt.' },
    sidekickWaiting: 'Sidekick démarre encore. Vous pouvez déjà naviguer.', retry: 'Réessayer', errorTitle: 'Le démarrage n’a pas pu aboutir', errorDescription: 'Une vérification nécessaire au démarrage a échoué. Réessayez.'
  },
  'pt-BR': {
    quotes: ['Pré-treinando o modelo de linguagem com hamsters …', 'Deixando de seguir o algoritmo rapidinho …', 'Desatando os nós das redes neurais …', 'Carregando contexto. Separando o brainrot …', 'Seu Sidekick está acordando. Sem prompts ainda.', 'O algoritmo recomenda respirar um pouco.', 'Limpando os dados de treinamento do doomscrolling …'],
    phases: { engine: 'Iniciando o mecanismo local …', profile: 'Carregando seu perfil do navegador …', spaces: 'Preparando os Spaces …', connections: 'Carregando conexões de modelos salvas …', models: 'Verificando modelos disponíveis …', sidekick: 'Conectando ao Sidekick …', session: 'Verificando a proteção da sessão …', ready: 'Seu navegador está pronto.' },
    sidekickWaiting: 'O Sidekick ainda está iniciando. Você já pode navegar.', retry: 'Tentar novamente', errorTitle: 'Não foi possível concluir a inicialização', errorDescription: 'Uma verificação necessária para iniciar falhou. Tente novamente.'
  },
  ru: {
    quotes: ['Хомяки предварительно обучают языковую модель …', 'На минутку отпишемся от алгоритма …', 'Распутываем нейросети …', 'Загружаем контекст. Отсеиваем brainrot …', 'Твой Sidekick просыпается. Пока без промптов.', 'Алгоритм советует немного перевести дух.', 'Очищаем обучающие данные от бесконечной ленты …'],
    phases: { engine: 'Запускаем локальный движок …', profile: 'Загружаем профиль браузера …', spaces: 'Подготавливаем Spaces …', connections: 'Загружаем сохранённые подключения моделей …', models: 'Проверяем доступные модели …', sidekick: 'Подключаемся к Sidekick …', session: 'Проверяем защиту сеанса …', ready: 'Браузер готов.' },
    sidekickWaiting: 'Sidekick всё ещё запускается. Браузером уже можно пользоваться.', retry: 'Повторить', errorTitle: 'Не удалось завершить запуск', errorDescription: 'Не удалось выполнить необходимую проверку запуска. Попробуйте ещё раз.'
  },
  ja: {
    quotes: ['ハムスターが言語モデルを事前学習中 …', 'アルゴリズムのフォローをそっと解除中 …', 'ニューラルネットワークをほどいています …', 'コンテキストを読み込み中。brainrot を整理中 …', 'Sidekick が目を覚まします。プロンプトはもう少し待ってね。', 'アルゴリズムからのおすすめ：ひと息つこう。', '延々スクロールのデータを学習データから除去中 …'],
    phases: { engine: 'ローカルエンジンを起動中 …', profile: 'ブラウザプロフィールを読み込み中 …', spaces: 'Spaces を準備中 …', connections: '保存済みモデル接続を読み込み中 …', models: '利用可能なモデルを確認中 …', sidekick: 'Sidekick に接続中 …', session: 'セッション保護を確認中 …', ready: 'ブラウザを利用できます。' },
    sidekickWaiting: 'Sidekick はまだ起動中ですが、ブラウザーは利用できます。', retry: '再試行', errorTitle: '起動を完了できませんでした', errorDescription: '起動に必要な確認に失敗しました。もう一度お試しください。'
  }
};

export function resolveStartupLocale(locale: string): StartupLocaleId {
  return (startupLocaleIds as readonly string[]).includes(locale) ? locale as StartupLocaleId : 'en';
}
