export type PageCategory = 'news' | 'tabular' | 'code' | 'general';

export interface QuickActionChip {
  id: string;
  category: PageCategory;
  label: string;
  icon: string;
  tooltip: string;
  promptTemplate: string;
}

export interface ExtractedPageSignals {
  url?: string;
  title?: string;
  headings?: string[];
  tables?: string[];
  codeBlocks?: string[];
  hasTables?: boolean;
}

const CODE_DOMAINS = [
  'github.com',
  'gitlab.com',
  'gist.github.com',
  'stackoverflow.com',
  'developer.mozilla.org',
  'npmjs.com',
  'pypi.org',
  'crates.io',
  'pkg.go.dev',
  'learn.microsoft.com',
  'codepen.io',
  'jsfiddle.net',
  'arxiv.org',
  'typescriptlang.org',
  'react.dev',
  'vuejs.org',
  'electronjs.org',
  'vite.dev'
];

const TABULAR_DOMAINS = [
  'amazon.',
  'ebay.',
  'store.',
  'shop.',
  'finance.yahoo',
  'coinmarketcap',
  'kaggle.com',
  'statista.com',
  'geizhals.de',
  'idealo.de',
  'booking.com',
  'expedia.'
];

const NEWS_DOMAINS = [
  'theverge.com',
  'techcrunch.com',
  'spiegel.de',
  'heise.de',
  'golem.de',
  'wired.com',
  'arstechnica.com',
  'bbc.com',
  'bbc.co.uk',
  'cnn.com',
  'reuters.com',
  'bloomberg.com',
  'medium.com',
  'substack.com',
  'nytimes.com',
  'theguardian.com',
  'welt.de',
  'faz.net',
  'zeit.de'
];

/**
 * Detects the dominant semantic category of a web page based on its URL,
 * title, and extracted DOM signals.
 */
export function detectPageCategory(
  url: string,
  title?: string,
  signals?: ExtractedPageSignals
): PageCategory {
  if (!url) return 'general';
  const lowerUrl = url.toLowerCase();
  const lowerTitle = (title || '').toLowerCase();

  // 1. Code / Developer documentation detection
  const isCodeUrl = CODE_DOMAINS.some((domain) => lowerUrl.includes(domain)) ||
    lowerUrl.includes('/docs/') ||
    lowerUrl.includes('/documentation/') ||
    lowerUrl.includes('/api/') ||
    lowerUrl.includes('/reference/');

  const hasCodeSignals = Boolean(
    (signals?.codeBlocks && signals.codeBlocks.length > 0) ||
    lowerTitle.includes('github -') ||
    lowerTitle.includes('documentation') ||
    lowerTitle.includes('api reference')
  );

  if (isCodeUrl || hasCodeSignals) {
    return 'code';
  }

  // 2. Tabular / Data / Comparison detection
  const isTabularUrl = TABULAR_DOMAINS.some((domain) => lowerUrl.includes(domain)) ||
    lowerUrl.includes('/pricing') ||
    lowerUrl.includes('/compare') ||
    lowerUrl.includes('/metrics') ||
    lowerUrl.includes('/specs') ||
    lowerUrl.includes('/benchmark');

  const hasTableSignals = Boolean(
    signals?.hasTables ||
    (signals?.tables && signals.tables.length > 0) ||
    lowerTitle.includes('pricing') ||
    lowerTitle.includes('vergleich') ||
    lowerTitle.includes('benchmark') ||
    lowerTitle.includes('spezifikationen')
  );

  if (isTabularUrl || hasTableSignals) {
    return 'tabular';
  }

  // 3. News / Article / Editorial detection
  const isNewsUrl = NEWS_DOMAINS.some((domain) => lowerUrl.includes(domain)) ||
    lowerUrl.includes('/news/') ||
    lowerUrl.includes('/article/') ||
    lowerUrl.includes('/post/') ||
    lowerUrl.includes('/blog/') ||
    lowerUrl.includes('/review/');

  const hasNewsSignals = Boolean(
    lowerTitle.includes('review') ||
    lowerTitle.includes('bericht') ||
    lowerTitle.includes('artikel') ||
    lowerTitle.includes('news')
  );

  if (isNewsUrl || hasNewsSignals) {
    return 'news';
  }

  return 'general';
}

/**
 * Returns contextual quick action chips tailored to the detected page category.
 */
export function getQuickActionChips(category: PageCategory, _url?: string): QuickActionChip[] {
  switch (category) {
    case 'code':
      return [
        {
          id: 'extract-code',
          category: 'code',
          label: '💻 Code extrahieren',
          icon: '💻',
          tooltip: 'Code-Beispiele, APIs und Snippets dieser Seite extrahieren',
          promptTemplate: 'Extrahiere die wichtigsten Code-Beispiele, CLI-Befehle und API-Signaturen dieser Seite mit kurzer Erklärung der Funktionsweise.'
        },
        {
          id: 'tldr',
          category: 'code',
          label: '⚡ TL;DR',
          icon: '⚡',
          tooltip: 'Kompakte technische Zusammenfassung der Seite',
          promptTemplate: 'Erstelle eine kurze technische TL;DR-Zusammenfassung dieser Dokumentation/Bibliothek.'
        }
      ];

    case 'tabular':
      return [
        {
          id: 'export-tables',
          category: 'tabular',
          label: '📊 Tabellen exportieren',
          icon: '📊',
          tooltip: 'Tabellen und Zahlen als saubere Markdown-Tabelle extrahieren',
          promptTemplate: 'Extrahiere alle Tabellen und relevanten Zahlen dieser Seite und bereite sie als saubere Markdown-Vergleichstabelle mit kurzer Analyse auf.'
        },
        {
          id: 'tldr',
          category: 'tabular',
          label: '⚡ TL;DR',
          icon: '⚡',
          tooltip: 'Produkte, Preise und wichtigste Merkmale zusammenfassen',
          promptTemplate: 'Fasse die wichtigsten Produkte, Preise und Kennzahlen dieser Seite kurz zusammen.'
        }
      ];

    case 'news':
      return [
        {
          id: 'tldr',
          category: 'news',
          label: '⚡ TL;DR',
          icon: '⚡',
          tooltip: 'Die 3 wichtigsten Kernaussagen dieses Artikels zusammenfassen',
          promptTemplate: 'Erstelle eine prägnante TL;DR-Zusammenfassung mit den 3 wichtigsten Kernaussagen dieses Artikels.'
        },
        {
          id: 'counter-args',
          category: 'news',
          label: '⚖️ Gegenargumente',
          icon: '⚖️',
          tooltip: 'Kritische Perspektiven und Gegenargumente analysieren',
          promptTemplate: 'Welche Gegenargumente, Risiken oder alternativen Perspektiven zu den Thesen dieses Artikels gibt es?'
        }
      ];

    case 'general':
    default:
      return [
        {
          id: 'tldr',
          category: 'general',
          label: '⚡ TL;DR',
          icon: '⚡',
          tooltip: 'Kompakte Zusammenfassung der aktuellen Webseite',
          promptTemplate: 'Erstelle eine prägnante Zusammenfassung der Kernaussagen dieser Seite.'
        }
      ];
  }
}

/**
 * Executes a quick action: extracts active tab content and sends the prepared
 * prompt with <context_tabs> block to the Copilot.
 */
export async function executeQuickAction(
  chip: QuickActionChip,
  activeTab: { id: string; url: string; title?: string },
  onSendPrompt: (prompt: string) => void
): Promise<void> {
  const safeTitle = activeTab.title || activeTab.url;
  let markdownExcerpt = '';

  try {
    if (typeof window !== 'undefined' && window.lastbrowser?.tabIntelligence?.extractActive) {
      const extracted = await window.lastbrowser.tabIntelligence.extractActive(4000);
      if (extracted?.markdown) {
        markdownExcerpt = extracted.markdown;
      }
    }
  } catch {
    // fallback if webview extraction is unavailable
  }

  const contextBlock = markdownExcerpt
    ? `<context_tabs count="1">\n## [Tab 1: ${safeTitle}](${activeTab.url})\n${markdownExcerpt}\n</context_tabs>\n\n`
    : `<context_tabs count="1">\n## [Tab 1: ${safeTitle}](${activeTab.url})\n</context_tabs>\n\n`;

  onSendPrompt(`${contextBlock}${chip.promptTemplate}`);
}
