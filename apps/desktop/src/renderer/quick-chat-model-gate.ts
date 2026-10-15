import type { DesktopLocaleId } from './i18n/keys.js';
import { hasChosenChatModel } from './provider-model-selection.js';

export type QuickChatModelGateReason = 'loading' | 'catalog-unavailable' | 'model-unavailable' | 'opencode-unreachable' | 'sign-in-expired' | null;
export type QuickChatModelChoice = Readonly<{ id: string; providerId?: string; category?: string; remainingPercent?: number; remainingFraction?: number }>;

const orchestrationModelIds = new Set(['teamwork', 'smart-track-low', 'smart-track-medium', 'smart-track-high']);

export function quickChatModelGateReason(options: {
  selectedModel: string;
  selectedProvider?: string;
  activeScopeKey: string;
  loadedCatalogScopeKey: string | null;
  failedCatalogScopeKey: string | null;
  availableModels: readonly QuickChatModelChoice[];
  connectionNotice?: 'opencode-unreachable' | 'sign-in-expired' | null;
}): QuickChatModelGateReason {
  if (options.connectionNotice) return options.connectionNotice;
  const modelId = options.selectedModel.trim();
  const providerId = options.selectedProvider?.trim() || '';
  const matches = options.availableModels.filter(model => model.id === modelId && (!providerId || model.providerId === providerId));
  const available = matches.length === 1
    && (matches[0].remainingPercent === undefined || matches[0].remainingPercent > 0)
    && (matches[0].remainingFraction === undefined || matches[0].remainingFraction > 0);
  if (orchestrationModelIds.has(modelId)) return available ? null : 'model-unavailable';
  if (options.loadedCatalogScopeKey !== options.activeScopeKey) {
    // A chosen model may send while the catalog loads or after it failed; the send path still qualifies it on the backend.
    if (hasChosenChatModel(modelId)) return null;
    return options.failedCatalogScopeKey === options.activeScopeKey ? 'catalog-unavailable' : 'loading';
  }
  return available ? null : 'model-unavailable';
}

export type SlowCatalogHint = 'slow-catalog' | null;

/**
 * Neutral hint shown while the model catalog takes longer than the visible-wait
 * deadline. It never blocks sending (the gate above already allows a chosen
 * model) and returns null when the active scope already owns a stronger state:
 * a connection notice, a loaded catalog, or a genuine catalog failure.
 */
export function slowCatalogHint(options: {
  activeScopeKey: string;
  loadedCatalogScopeKey: string | null;
  failedCatalogScopeKey: string | null;
  slowCatalogScopeKey: string | null;
  connectionNotice?: 'opencode-unreachable' | 'sign-in-expired' | null;
}): SlowCatalogHint {
  if (options.connectionNotice) return null;
  if (options.loadedCatalogScopeKey === options.activeScopeKey) return null;
  if (options.failedCatalogScopeKey === options.activeScopeKey) return null;
  return options.slowCatalogScopeKey === options.activeScopeKey ? 'slow-catalog' : null;
}

export const quickChatModelGateCopy: Record<DesktopLocaleId, Record<Exclude<QuickChatModelGateReason, null>, string>> = {
  en: { loading: 'Loading this Space’s model list. Sending is paused until the current catalog is ready.', 'catalog-unavailable': 'Could not verify models for this Space. Check provider settings and try again.', 'model-unavailable': 'The selected model is unavailable in this Space. Choose a model from the current catalog.', 'opencode-unreachable': 'OpenCode is not reachable. Sending is paused until the connection returns.', 'sign-in-expired': 'Sign-in expired. Sign in to OpenCode again, then retry.' },
  de: { loading: 'Modellliste für diesen Space wird geladen. Der Chat startet erst, wenn der aktuelle Katalog bereit ist.', 'catalog-unavailable': 'Modelle für diesen Space konnten nicht geprüft werden. Prüfe die Provider-Einstellungen und versuche es erneut.', 'model-unavailable': 'Das gewählte Modell ist in diesem Space nicht verfügbar. Wähle ein Modell aus dem aktuellen Katalog.', 'opencode-unreachable': 'OpenCode ist nicht erreichbar. Senden pausiert, bis die Verbindung wieder da ist.', 'sign-in-expired': 'Anmeldung abgelaufen. Melde dich erneut bei OpenCode an und versuche es noch einmal.' },
  es: { loading: 'Cargando los modelos de este Space. El envío se pausa hasta que esté listo el catálogo actual.', 'catalog-unavailable': 'No se pudieron verificar los modelos de este Space. Revisa la configuración del proveedor e inténtalo de nuevo.', 'model-unavailable': 'El modelo seleccionado no está disponible en este Space. Elige uno del catálogo actual.', 'opencode-unreachable': 'OpenCode no está accesible. El envío queda en pausa hasta que vuelva la conexión.', 'sign-in-expired': 'El inicio de sesión caducó. Vuelve a entrar en OpenCode y reintenta.' },
  fr: { loading: 'Chargement des modèles de cet espace. L’envoi attend le catalogue actuel.', 'catalog-unavailable': 'Impossible de vérifier les modèles de cet espace. Vérifiez le fournisseur et réessayez.', 'model-unavailable': 'Le modèle choisi n’est pas disponible dans cet espace. Choisissez-en un du catalogue actuel.', 'opencode-unreachable': 'OpenCode est injoignable. L’envoi est en pause jusqu’au retour de la connexion.', 'sign-in-expired': 'Connexion expirée. Reconnecte-toi à OpenCode, puis réessaie.' },
  it: { loading: 'Caricamento dei modelli di questo Space. L’invio attende il catalogo aggiornato.', 'catalog-unavailable': 'Impossibile verificare i modelli di questo Space. Controlla le impostazioni del provider e riprova.', 'model-unavailable': 'Il modello scelto non è disponibile in questo Space. Scegline uno dal catalogo attuale.', 'opencode-unreachable': 'OpenCode non è raggiungibile. L’invio resta in pausa finché la connessione non torna.', 'sign-in-expired': 'Accesso scaduto. Accedi di nuovo a OpenCode e riprova.' },
  'pt-BR': { loading: 'Carregando os modelos deste Space. O envio aguarda o catálogo atual.', 'catalog-unavailable': 'Não foi possível verificar os modelos deste Space. Confira o provedor e tente novamente.', 'model-unavailable': 'O modelo escolhido não está disponível neste Space. Escolha um modelo do catálogo atual.', 'opencode-unreachable': 'O OpenCode está inacessível. O envio fica pausado até a conexão voltar.', 'sign-in-expired': 'O login expirou. Entre de novo no OpenCode e tente outra vez.' },
  ru: { loading: 'Загружается список моделей этого Space. Отправка будет доступна после проверки каталога.', 'catalog-unavailable': 'Не удалось проверить модели этого Space. Проверьте настройки провайдера и повторите попытку.', 'model-unavailable': 'Выбранная модель недоступна в этом Space. Выберите модель из текущего каталога.', 'opencode-unreachable': 'OpenCode недоступен. Отправка на паузе, пока соединение не вернётся.', 'sign-in-expired': 'Срок входа истёк. Войдите в OpenCode снова и повторите попытку.' },
  ja: { loading: 'このSpaceのモデル一覧を読み込み中です。現在のカタログが準備できるまで送信できません。', 'catalog-unavailable': 'このSpaceのモデルを確認できませんでした。プロバイダー設定を確認して再試行してください。', 'model-unavailable': '選択したモデルはこのSpaceで利用できません。現在のカタログからモデルを選択してください。', 'opencode-unreachable': 'OpenCode に到達できません。接続が戻るまで送信は停止します。', 'sign-in-expired': 'サインインの期限が切れました。OpenCode に再度サインインしてから再試行してください。' }
};
