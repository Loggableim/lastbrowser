import type { DesktopLocaleId } from './keys.js';

export type ProviderRecommendationCopy = {
  badge: string;
  headline: string;
  benefits: string[];
  bestFor: string;
};

const copy: Record<string, Record<DesktopLocaleId, ProviderRecommendationCopy>> = {
  'openai-codex': {
    de: { badge: 'ChatGPT-Konto', headline: 'OpenAI Codex (ChatGPT)', benefits: ['Kontobasierte Anmeldung, sofern der aktuelle Zugang sie unterstützt', 'Verfügbare Modelle und Funktionen hängen vom Konto ab', 'Die Verbindung ist noch nicht live geprüft'], bestFor: 'Für Nutzer, die den ChatGPT-Kontozugang testen möchten' },
    en: { badge: 'ChatGPT account', headline: 'OpenAI Codex (ChatGPT)', benefits: ['Account sign-in where supported by your current access', 'Available models and features depend on the account', 'This connection has not been live-tested'], bestFor: 'For users who want to try ChatGPT account access' },
    es: { badge: 'Cuenta de ChatGPT', headline: 'OpenAI Codex (ChatGPT)', benefits: ['Inicio de sesión con cuenta si tu acceso actual lo permite', 'Los modelos y funciones disponibles dependen de la cuenta', 'Esta conexión no se ha probado en vivo'], bestFor: 'Para quienes quieran probar el acceso con su cuenta de ChatGPT' },
    fr: { badge: 'Compte ChatGPT', headline: 'OpenAI Codex (ChatGPT)', benefits: ['Connexion au compte si votre accès actuel la prend en charge', 'Les modèles et fonctions disponibles dépendent du compte', 'Cette connexion n’a pas été testée en direct'], bestFor: 'Pour les utilisateurs qui souhaitent essayer l’accès au compte ChatGPT' },
    it: { badge: 'Account ChatGPT', headline: 'OpenAI Codex (ChatGPT)', benefits: ['Accesso con account se supportato dal tuo piano attuale', 'Modelli e funzioni disponibili dipendono dall’account', 'Questa connessione non è stata testata dal vivo'], bestFor: 'Per chi vuole provare l’accesso con l’account ChatGPT' },
    'pt-BR': { badge: 'Conta ChatGPT', headline: 'OpenAI Codex (ChatGPT)', benefits: ['Login com a conta quando disponível no seu acesso atual', 'Modelos e recursos disponíveis dependem da conta', 'Esta conexão ainda não foi testada ao vivo'], bestFor: 'Para quem quer testar o acesso pela conta do ChatGPT' },
    ru: { badge: 'Аккаунт ChatGPT', headline: 'OpenAI Codex (ChatGPT)', benefits: ['Вход через аккаунт, если это поддерживается вашим доступом', 'Доступные модели и функции зависят от аккаунта', 'Подключение не проверено вживую'], bestFor: 'Для тех, кто хочет попробовать вход через аккаунт ChatGPT' }
  },
  ollama: {
    de: { badge: 'Lokal · private', headline: 'Ollama (lokale Modelle)', benefits: ['Lokale Anfragen bleiben auf deinem Gerät', 'Modelle aus deinem lokalen Ollama-Katalog', 'Funktioniert offline, wenn der lokale Server läuft'], bestFor: 'Für lokale Nutzung und private Workflows' },
    en: { badge: 'Local · private', headline: 'Ollama (local models)', benefits: ['Local requests stay on your device', 'Models from your local Ollama catalog', 'Works offline while the local server is running'], bestFor: 'For local use and private workflows' },
    es: { badge: 'Local · privado', headline: 'Ollama (modelos locales)', benefits: ['Las solicitudes locales permanecen en tu dispositivo', 'Modelos del catálogo local de Ollama', 'Funciona sin conexión mientras el servidor local esté activo'], bestFor: 'Para uso local y flujos de trabajo privados' },
    fr: { badge: 'Local · privé', headline: 'Ollama (modèles locaux)', benefits: ['Les requêtes locales restent sur votre appareil', 'Modèles du catalogue Ollama local', 'Fonctionne hors ligne si le serveur local est actif'], bestFor: 'Pour un usage local et des workflows privés' },
    it: { badge: 'Locale · privato', headline: 'Ollama (modelli locali)', benefits: ['Le richieste locali restano sul dispositivo', 'Modelli dal catalogo Ollama locale', 'Funziona offline mentre il server locale è attivo'], bestFor: 'Per uso locale e flussi di lavoro privati' },
    'pt-BR': { badge: 'Local · privado', headline: 'Ollama (modelos locais)', benefits: ['As solicitações locais permanecem no seu dispositivo', 'Modelos do catálogo local do Ollama', 'Funciona offline enquanto o servidor local estiver ativo'], bestFor: 'Para uso local e fluxos de trabalho privados' },
    ru: { badge: 'Локально · конфиденциально', headline: 'Ollama (локальные модели)', benefits: ['Локальные запросы остаются на вашем устройстве', 'Модели из локального каталога Ollama', 'Работает офлайн, пока запущен локальный сервер'], bestFor: 'Для локального использования и приватных задач' }
  },
  openrouter: {
    de: { badge: 'API-Schlüssel', headline: 'OpenRouter (Modelle verschiedener Anbieter)', benefits: ['Ein Schlüssel für den OpenRouter-Modellkatalog', 'Verfügbarkeit und Kosten stammen aus dem Katalog', 'Chat-Aufrufe sind noch nicht live geprüft'], bestFor: 'Wenn du Modelle verschiedener Anbieter vergleichen möchtest' },
    en: { badge: 'API key', headline: 'OpenRouter (models from multiple providers)', benefits: ['One key for the OpenRouter model catalog', 'Availability and costs come from the catalog', 'Chat requests have not been live-tested'], bestFor: 'If you want to compare models from multiple providers' },
    es: { badge: 'Clave API', headline: 'OpenRouter (modelos de varios proveedores)', benefits: ['Una clave para el catálogo de modelos de OpenRouter', 'La disponibilidad y los costes proceden del catálogo', 'Las solicitudes de chat no se han probado en vivo'], bestFor: 'Si quieres comparar modelos de varios proveedores' },
    fr: { badge: 'Clé API', headline: 'OpenRouter (modèles de plusieurs fournisseurs)', benefits: ['Une clé pour le catalogue de modèles OpenRouter', 'Disponibilité et coûts indiqués par le catalogue', 'Les requêtes de chat n’ont pas été testées en direct'], bestFor: 'Pour comparer des modèles de plusieurs fournisseurs' },
    it: { badge: 'Chiave API', headline: 'OpenRouter (modelli di più provider)', benefits: ['Una chiave per il catalogo modelli OpenRouter', 'Disponibilità e costi provengono dal catalogo', 'Le richieste di chat non sono state testate dal vivo'], bestFor: 'Se vuoi confrontare modelli di più provider' },
    'pt-BR': { badge: 'Chave de API', headline: 'OpenRouter (modelos de vários provedores)', benefits: ['Uma chave para o catálogo de modelos do OpenRouter', 'Disponibilidade e custos vêm do catálogo', 'As solicitações de chat ainda não foram testadas ao vivo'], bestFor: 'Se você quer comparar modelos de vários provedores' },
    ru: { badge: 'Ключ API', headline: 'OpenRouter (модели разных провайдеров)', benefits: ['Один ключ для каталога моделей OpenRouter', 'Доступность и стоимость указаны в каталоге', 'Запросы чата не проверялись вживую'], bestFor: 'Если вы хотите сравнивать модели разных провайдеров' }
  }
};

export function localizedProviderRecommendation(providerId: string, locale: DesktopLocaleId): ProviderRecommendationCopy | null {
  return copy[providerId]?.[locale] ?? copy[providerId]?.en ?? null;
}
