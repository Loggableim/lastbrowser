import type { DesktopLocaleId } from './keys.js';

export const searchEngineOnboardingTranslations: Record<DesktopLocaleId, Record<string, string>> = {
  en: { title: 'Choose your default search engine', description: 'Pick the search engine LastBrowser will use for address bar searches. You can change this later in Settings.', recommended: 'Recommended', more: 'More', selected: 'Selected', saveError: 'Your search engine choice could not be saved. Please try again.' },
  de: { title: 'Standardsuchmaschine wählen', description: 'Wähle die Suchmaschine für Suchen über die Adressleiste. Du kannst die Auswahl später in den Einstellungen ändern.', recommended: 'Empfohlen', more: 'Weitere', selected: 'Ausgewählt', saveError: 'Deine Suchmaschine konnte nicht gespeichert werden. Bitte versuche es erneut.' },
  it: { title: 'Scegli il motore di ricerca predefinito', description: 'Scegli il motore da usare per le ricerche dalla barra degli indirizzi. Potrai cambiarlo in seguito nelle Impostazioni.', recommended: 'Consigliati', more: 'Altri', selected: 'Selezionato', saveError: 'Non è stato possibile salvare la scelta. Riprova.' },
  es: { title: 'Elige tu motor de búsqueda predeterminado', description: 'Elige el motor que LastBrowser usará para buscar desde la barra de direcciones. Puedes cambiarlo más tarde en Ajustes.', recommended: 'Recomendados', more: 'Más', selected: 'Seleccionado', saveError: 'No se pudo guardar el motor de búsqueda. Inténtalo de nuevo.' },
  fr: { title: 'Choisissez votre moteur de recherche par défaut', description: 'Choisissez le moteur utilisé pour les recherches depuis la barre d’adresse. Vous pourrez modifier ce choix plus tard dans les Paramètres.', recommended: 'Recommandés', more: 'Autres', selected: 'Sélectionné', saveError: 'Impossible d’enregistrer votre choix. Veuillez réessayer.' },
  'pt-BR': { title: 'Escolha seu mecanismo de pesquisa padrão', description: 'Escolha o mecanismo que o LastBrowser usará nas pesquisas pela barra de endereço. Você pode alterar isso depois nas Configurações.', recommended: 'Recomendados', more: 'Mais', selected: 'Selecionado', saveError: 'Não foi possível salvar sua escolha. Tente novamente.' },
  ru: { title: 'Выберите поисковую систему по умолчанию', description: 'Выберите систему для поиска из адресной строки. Позже её можно изменить в настройках.', recommended: 'Рекомендуемые', more: 'Другие', selected: 'Выбрана', saveError: 'Не удалось сохранить выбор. Повторите попытку.' },
  ja: { title: '既定の検索エンジンを選択', description: 'アドレスバーで検索するときに使う検索エンジンを選択します。設定からいつでも変更できます。', recommended: 'おすすめ', more: 'その他', selected: '選択中', saveError: '検索エンジンを保存できませんでした。もう一度お試しください。' }
};

export const searchEngineOnboardingTranslationKeys = {
  'searchEngineSetup.title': 'title',
  'searchEngineSetup.description': 'description',
  'searchEngineSetup.recommended': 'recommended',
  'searchEngineSetup.more': 'more',
  'searchEngineSetup.selected': 'selected',
  'searchEngineSetup.saveError': 'saveError'
} as const;
