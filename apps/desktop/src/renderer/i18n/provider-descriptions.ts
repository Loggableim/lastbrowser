import type { DesktopLocaleId } from './keys.js';

type ProviderDescriptionId =
  | 'openai-codex' | 'anthropic' | 'google-gemini-cli' | 'openai' | 'openrouter' | 'ollama-cloud'
  | 'gemini' | 'deepseek' | 'mistralai' | 'nvidia' | 'xiaomi' | 'zai' | 'x-ai'
  | 'ollama' | 'lmstudio' | 'custom';

const descriptions: Record<ProviderDescriptionId, Record<DesktopLocaleId, string>> = {
  'openai-codex': {
    en: 'Sign in with your ChatGPT account — no API key needed.', de: 'Melde dich mit deinem ChatGPT-Konto an – ein API-Schlüssel ist nicht nötig.',
    es: 'Inicia sesión con tu cuenta de ChatGPT; no necesitas una clave de API.', fr: 'Connectez-vous avec votre compte ChatGPT, sans clé API.',
    it: 'Accedi con il tuo account ChatGPT: non serve una chiave API.', 'pt-BR': 'Entre com sua conta do ChatGPT; não é necessária uma chave de API.', ru: 'Войдите через аккаунт ChatGPT — ключ API не нужен.'
  },
  anthropic: {
    en: 'Connect Claude Code or enter an Anthropic API key.', de: 'Verbinde Claude Code oder gib einen Anthropic-API-Schlüssel ein.',
    es: 'Conecta Claude Code o introduce una clave de API de Anthropic.', fr: 'Connectez Claude Code ou saisissez une clé API Anthropic.',
    it: 'Collega Claude Code o inserisci una chiave API Anthropic.', 'pt-BR': 'Conecte o Claude Code ou informe uma chave de API da Anthropic.', ru: 'Подключите Claude Code или укажите ключ API Anthropic.'
  },
  'google-gemini-cli': {
    en: 'Consumer Gemini CLI subscription access changed on June 18, 2026. See the official Antigravity CLI migration guide; Gemini API keys are separate.', de: 'Der Gemini-CLI-Abozugriff für Privatkonten wurde am 18. Juni 2026 geändert. Hinweise stehen in der offiziellen Migrationsanleitung für Antigravity CLI; Gemini-API-Schlüssel sind davon getrennt.',
    es: 'El acceso de suscripción de Gemini CLI para consumidores cambió el 18 de junio de 2026. Consulta la guía oficial de migración a Antigravity CLI; las claves API de Gemini son independientes.', fr: 'L’accès par abonnement à Gemini CLI pour les particuliers a changé le 18 juin 2026. Consultez le guide officiel de migration vers Antigravity CLI ; les clés API Gemini sont distinctes.',
    it: 'L’accesso agli abbonamenti consumer di Gemini CLI è cambiato il 18 giugno 2026. Consulta la guida ufficiale alla migrazione di Antigravity CLI; le chiavi API Gemini sono separate.', 'pt-BR': 'O acesso por assinatura à Gemini CLI para consumidores mudou em 18 de junho de 2026. Consulte o guia oficial de migração para Antigravity CLI; as chaves de API Gemini são separadas.', ru: 'Доступ к Gemini CLI по потребительской подписке изменился 18 июня 2026 года. См. официальное руководство по переходу на Antigravity CLI; ключи API Gemini — отдельный способ доступа.'
  },
  openai: {
    en: 'OpenAI API key for GPT models.', de: 'OpenAI-API-Schlüssel für GPT-Modelle.', es: 'Clave de API de OpenAI para modelos GPT.', fr: 'Clé API OpenAI pour les modèles GPT.',
    it: 'Chiave API OpenAI per i modelli GPT.', 'pt-BR': 'Chave de API da OpenAI para modelos GPT.', ru: 'Ключ API OpenAI для моделей GPT.'
  },
  openrouter: {
    en: 'One key for models from many providers.', de: 'Ein Schlüssel für Modelle vieler Anbieter.', es: 'Una clave para modelos de muchos proveedores.', fr: 'Une clé pour des modèles de nombreux fournisseurs.',
    it: 'Una chiave per modelli di molti provider.', 'pt-BR': 'Uma chave para modelos de vários provedores.', ru: 'Один ключ для моделей разных провайдеров.'
  },
  gemini: {
    en: 'Google AI Studio API key for Gemini models.', de: 'Google-AI-Studio-API-Schlüssel für Gemini-Modelle.', es: 'Clave de API de Google AI Studio para modelos Gemini.', fr: 'Clé API Google AI Studio pour les modèles Gemini.',
    it: 'Chiave API di Google AI Studio per i modelli Gemini.', 'pt-BR': 'Chave de API do Google AI Studio para modelos Gemini.', ru: 'Ключ API Google AI Studio для моделей Gemini.'
  },
  deepseek: {
    en: 'DeepSeek API key for its reasoning models.', de: 'DeepSeek-API-Schlüssel für die Reasoning-Modelle.', es: 'Clave de API de DeepSeek para sus modelos de razonamiento.', fr: 'Clé API DeepSeek pour ses modèles de raisonnement.',
    it: 'Chiave API DeepSeek per i suoi modelli di ragionamento.', 'pt-BR': 'Chave de API da DeepSeek para modelos de raciocínio.', ru: 'Ключ API DeepSeek для моделей рассуждения.'
  },
  mistralai: {
    en: 'Mistral API key for models hosted in Europe.', de: 'Mistral-API-Schlüssel für in Europa gehostete Modelle.', es: 'Clave de API de Mistral para modelos alojados en Europa.', fr: 'Clé API Mistral pour des modèles hébergés en Europe.',
    it: 'Chiave API Mistral per modelli ospitati in Europa.', 'pt-BR': 'Chave de API da Mistral para modelos hospedados na Europa.', ru: 'Ключ API Mistral для моделей, размещённых в Европе.'
  },
  nvidia: {
    en: 'NVIDIA NIM endpoints, including Nemotron.', de: 'NVIDIA-NIM-Endpunkte, darunter Nemotron.', es: 'Endpoints de NVIDIA NIM, incluido Nemotron.', fr: 'Points de terminaison NVIDIA NIM, dont Nemotron.',
    it: 'Endpoint NVIDIA NIM, incluso Nemotron.', 'pt-BR': 'Endpoints NVIDIA NIM, incluindo o Nemotron.', ru: 'Конечные точки NVIDIA NIM, включая Nemotron.'
  },
  xiaomi: {
    en: 'Xiaomi MiMo API key.', de: 'Xiaomi-MiMo-API-Schlüssel.', es: 'Clave de API de Xiaomi MiMo.', fr: 'Clé API Xiaomi MiMo.',
    it: 'Chiave API Xiaomi MiMo.', 'pt-BR': 'Chave de API do Xiaomi MiMo.', ru: 'Ключ API Xiaomi MiMo.'
  },
  zai: {
    en: 'Z.AI / GLM API key.', de: 'Z.AI-/GLM-API-Schlüssel.', es: 'Clave de API de Z.AI / GLM.', fr: 'Clé API Z.AI / GLM.',
    it: 'Chiave API Z.AI / GLM.', 'pt-BR': 'Chave de API da Z.AI / GLM.', ru: 'Ключ API Z.AI / GLM.'
  },
  'x-ai': {
    en: 'xAI API key for Grok models.', de: 'xAI-API-Schlüssel für Grok-Modelle.', es: 'Clave de API de xAI para modelos Grok.', fr: 'Clé API xAI pour les modèles Grok.',
    it: 'Chiave API xAI per i modelli Grok.', 'pt-BR': 'Chave de API da xAI para modelos Grok.', ru: 'Ключ API xAI для моделей Grok.'
  },
  ollama: {
    en: 'Run models locally or use Ollama Cloud with a key.', de: 'Führe Modelle lokal aus oder nutze Ollama Cloud mit einem Schlüssel.',
    es: 'Ejecuta modelos localmente o usa Ollama Cloud con una clave.', fr: 'Exécutez des modèles localement ou utilisez Ollama Cloud avec une clé.',
    it: 'Esegui i modelli in locale o usa Ollama Cloud con una chiave.', 'pt-BR': 'Execute modelos localmente ou use o Ollama Cloud com uma chave.', ru: 'Запускайте модели локально или используйте Ollama Cloud с ключом.'
  },
  'ollama-cloud': {
    en: 'Use hosted Ollama models with an API key.', de: 'Nutze gehostete Ollama-Modelle mit einem API-Schlüssel.',
    es: 'Usa modelos de Ollama alojados con una clave de API.', fr: 'Utilisez les modèles Ollama hébergés avec une clé API.',
    it: 'Usa i modelli Ollama ospitati con una chiave API.', 'pt-BR': 'Use modelos hospedados do Ollama com uma chave de API.', ru: 'Используйте размещённые модели Ollama с ключом API.'
  },
  lmstudio: {
    en: 'Connect to a local LM Studio server.', de: 'Verbinde dich mit einem lokalen LM-Studio-Server.', es: 'Conéctate a un servidor local de LM Studio.', fr: 'Connectez-vous à un serveur LM Studio local.',
    it: 'Collegati a un server LM Studio locale.', 'pt-BR': 'Conecte-se a um servidor local do LM Studio.', ru: 'Подключитесь к локальному серверу LM Studio.'
  },
  custom: {
    en: 'Any OpenAI-compatible endpoint (vLLM, llama.cpp, and more).', de: 'Jeder OpenAI-kompatible Endpunkt (vLLM, llama.cpp und weitere).',
    es: 'Cualquier endpoint compatible con OpenAI (vLLM, llama.cpp y más).', fr: 'Tout point de terminaison compatible avec OpenAI (vLLM, llama.cpp, etc.).',
    it: 'Qualsiasi endpoint compatibile con OpenAI (vLLM, llama.cpp e altri).', 'pt-BR': 'Qualquer endpoint compatível com OpenAI (vLLM, llama.cpp e outros).', ru: 'Любая совместимая с OpenAI конечная точка (vLLM, llama.cpp и другие).'
  }
};

const fallback: Record<DesktopLocaleId, string> = {
  en: 'Connect this provider to Sidekick.', de: 'Verbinde diesen Anbieter mit Sidekick.', es: 'Conecta este proveedor con Sidekick.',
  fr: 'Connectez ce fournisseur à Sidekick.', it: 'Collega questo provider a Sidekick.', 'pt-BR': 'Conecte este provedor ao Sidekick.', ru: 'Подключите этот провайдер к Sidekick.'
};

export function localizedProviderDescription(providerId: string, locale: DesktopLocaleId): string {
  return descriptions[providerId as ProviderDescriptionId]?.[locale] ?? fallback[locale];
}
