/**
 * DOM Extractor & CometJacking Guardrails Engine.
 *
 * Implements Phase 10.1 & 10.6 of Lastbrowser:
 *   • Clean content, metadata, headings, and table extraction from web pages.
 *   • Robust CometJacking & Prompt-Injection defense (hidden CSS filters, zero-width strippers,
 *     and instruction-hijacking neutralizers).
 *   • Fair token budgeting and structured Markdown formatting.
 */

export type ExtractedTabContent = {
  tabId?: string;
  url: string;
  title: string;
  metaDescription?: string;
  markdown: string;
  headings: string[];
  tables: string[];
  charCount: number;
  estimatedTokens: number;
  hasInjectionAttempt: boolean;
  sanitizedPatterns: string[];
  truncated: boolean;
};

/**
 * Malicious prompt injection patterns designed to hijack LLM behavior when digesting
 * untrusted third-party web content (CometJacking prevention).
 */
export const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above)\s+(instructions|directions|rules|prompts|commands)/gi,
  /disregard\s+(all\s+|any\s+|the\s+)?(previous|prior|above)\s+(instructions|directions|rules|prompts|commands)/gi,
  /you\s+are\s+now\s+(in\s+developer\s+mode|dan|an\s+unrestricted|a\s+new\s+ai|jailbroken)/gi,
  /system\s+prompt\s+override[:\s]/gi,
  /new\s+system\s+instruction[:\s]/gi,
  /important:\s*from\s+now\s+on\s+you\s+must/gi,
  /exfiltrate\s+(password|secret|key|token|cookie|data|session)/gi,
  /send\s+(all\s+|the\s+)?(context|cookies|tokens|chat\s+history)\s+to\s+https?:\/\//gi,
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /\[SYSTEM_PROMPT\]/gi,
  /\[INST\]/gi,
  /\[\/INST\]/gi
];

/**
 * Invisible or zero-width unicode characters frequently used to bypass tokenizers
 * or hide text from human users while feeding instructions to LLMs.
 */
export const ZERO_WIDTH_REGEX = /[\u200B\u200C\u200D\uFEFF\u200E\u200F\u00AD\u2060\u2061\u2062\u2063\u2064]/g;

/**
 * Neutralize prompt injection attempts in raw web content.
 */
export function applyCometJackingGuardrails(rawText: string): {
  cleanText: string;
  hasInjectionAttempt: boolean;
  sanitizedPatterns: string[];
} {
  // 1. Remove zero-width spaces and invisible bypass characters
  let cleanText = rawText.replace(ZERO_WIDTH_REGEX, '');

  const sanitizedPatterns: string[] = [];
  let hasInjectionAttempt = false;

  // 2. Scan and neutralize prompt-injection vectors
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(cleanText)) {
      hasInjectionAttempt = true;
      const matches = cleanText.match(pattern) || [];
      for (const m of matches) {
        if (!sanitizedPatterns.includes(m.trim())) {
          sanitizedPatterns.push(m.trim());
        }
      }
      cleanText = cleanText.replace(pattern, '[⚠️ Guardrail: Untrusted instruction block sanitized to prevent prompt injection]');
    }
  }

  return { cleanText, hasInjectionAttempt, sanitizedPatterns };
}

/**
 * JavaScript snippet executed inside the live webview via webContents.executeJavaScript.
 * Runs in the context of the page, checks computed styles to reject hidden elements,
 * extracts headings, structured tables, and body paragraphs.
 */
export const DOM_IN_PAGE_EXTRACTOR_SCRIPT = `
(() => {
  try {
    const isVisible = (elem) => {
      if (!elem || elem.nodeType !== 1) return false;
      const style = window.getComputedStyle(elem);
      if (style.display === 'none') return false;
      if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      if (parseFloat(style.opacity || '1') <= 0.05) return false;
      if (style.fontSize === '0px') return false;
      const rect = elem.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0 && elem.children.length === 0) return false;
      return true;
    };

    const title = document.title || '';
    const url = window.location.href || '';
    const metaDescElem = document.querySelector('meta[name="description"]') ||
                         document.querySelector('meta[property="og:description"]');
    const metaDescription = metaDescElem ? (metaDescElem.getAttribute('content') || '') : '';

    // Collect headings
    const headings = [];
    document.querySelectorAll('h1, h2, h3').forEach((h) => {
      if (isVisible(h)) {
        const text = (h.textContent || '').trim();
        if (text && text.length > 2 && !headings.includes(text)) {
          headings.push(text);
        }
      }
    });

    // Convert tables to clean Markdown
    const tables = [];
    document.querySelectorAll('table').forEach((table) => {
      if (!isVisible(table)) return;
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length === 0) return;

      const mdRows = [];
      let headerAdded = false;

      rows.forEach((row, rowIdx) => {
        const cells = Array.from(row.querySelectorAll('th, td')).map((c) =>
          (c.textContent || '').replace(/\\r?\\n/g, ' ').replace(/\\|/g, '-').trim()
        );
        if (cells.length === 0) return;

        mdRows.push('| ' + cells.join(' | ') + ' |');
        if (!headerAdded && (row.querySelector('th') || rowIdx === 0)) {
          mdRows.push('| ' + cells.map(() => '---').join(' | ') + ' |');
          headerAdded = true;
        }
      });

      if (mdRows.length > 1) {
        tables.push(mdRows.join('\\n'));
      }
    });

    // Content container selection: prioritize article/main, fallback to body
    const root = document.querySelector('article') ||
                 document.querySelector('main') ||
                 document.querySelector('[role="main"]') ||
                 document.querySelector('.content, #content, .post, .article') ||
                 document.body;

    const ignoredTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS', 'NAV', 'FOOTER']);
    const paragraphs = [];

    const walk = (node) => {
      if (!node) return;
      if (node.nodeType === 1) {
        const tag = node.tagName.toUpperCase();
        if (ignoredTags.has(tag)) return;
        if (!isVisible(node)) return;

        if (tag === 'P' || tag === 'BLOCKQUOTE' || tag === 'LI' || tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4') {
          const t = (node.textContent || '').replace(/\\s+/g, ' ').trim();
          if (t.length > 15) {
            paragraphs.push((tag.startsWith('H') ? '### ' : '') + t);
          }
          return;
        }
      }
      for (const child of node.childNodes) {
        walk(child);
      }
    };

    if (root) walk(root);

    return {
      title,
      url,
      metaDescription,
      headings: headings.slice(0, 15),
      tables: tables.slice(0, 5),
      paragraphs: paragraphs.slice(0, 100)
    };
  } catch (err) {
    return {
      title: document.title || '',
      url: window.location.href || '',
      metaDescription: '',
      headings: [],
      tables: [],
      paragraphs: [(document.body?.innerText || '').slice(0, 3000)]
    };
  }
})();
`;

/**
 * Truncate text cleanly at a sentence or paragraph boundary to fit within a character budget.
 */
export function truncateContentToBudget(
  text: string,
  maxChars: number
): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }

  const slice = text.slice(0, maxChars);
  // Try to find the last double newline, newline, or sentence end (.!?)
  const lastDoubleNewline = slice.lastIndexOf('\n\n');
  const lastPeriod = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('.\n'), slice.lastIndexOf('! '), slice.lastIndexOf('? '));

  let cutIdx = maxChars;
  if (lastDoubleNewline > maxChars * 0.6) {
    cutIdx = lastDoubleNewline;
  } else if (lastPeriod > maxChars * 0.6) {
    cutIdx = lastPeriod + 1;
  }

  const truncatedText = slice.slice(0, cutIdx).trim() + '\n\n[… Inhalt für Kontext-Budget gekürzt …]';
  return { text: truncatedText, truncated: true };
}

/**
 * Parse raw HTML (used for background tabs fetched via net.fetch or test fixtures).
 */
export function extractFromHtml(
  html: string,
  url: string,
  fallbackTitle?: string,
  maxChars = 4000
): ExtractedTabContent {
  // Strip script, style, iframe, svg, noscript
  let cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ');

  // Extract Title
  const titleMatch = cleanHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = (titleMatch ? titleMatch[1].trim() : fallbackTitle) || url;

  // Extract Meta Description
  const metaMatch = cleanHtml.match(/<meta\s+[^>]*name=["']description["'][^>]*content="([^"]*)"/i) ||
                    cleanHtml.match(/<meta\s+[^>]*name=["']description["'][^>]*content='([^']*)'/i) ||
                    cleanHtml.match(/<meta\s+[^>]*content="([^"]*)"[^>]*name=["']description["']/i) ||
                    cleanHtml.match(/<meta\s+[^>]*content='([^']*)'[^>]*name=["']description["']/i) ||
                    cleanHtml.match(/<meta\s+[^>]*property=["']og:description["'][^>]*content="([^"]*)"/i) ||
                    cleanHtml.match(/<meta\s+[^>]*property=["']og:description["'][^>]*content='([^']*)'/i);
  const metaDescription = metaMatch ? metaMatch[1].trim() : undefined;

  // Extract Headings
  const headings: string[] = [];
  const headingRegex = /<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi;
  let hMatch;
  while ((hMatch = headingRegex.exec(cleanHtml)) !== null) {
    const text = hMatch[1].replace(/<[^>]+>/g, '').trim();
    if (text && text.length > 2 && !headings.includes(text)) {
      headings.push(text);
      if (headings.length >= 10) break;
    }
  }

  // Extract Tables
  const tables: string[] = [];
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tMatch;
  while ((tMatch = tableRegex.exec(cleanHtml)) !== null) {
    const tableHtml = tMatch[1];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const mdRows: string[] = [];
    let rMatch;
    let headerDone = false;

    while ((rMatch = rowRegex.exec(tableHtml)) !== null) {
      const rowContent = rMatch[1];
      const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
      const cells: string[] = [];
      let cMatch;
      while ((cMatch = cellRegex.exec(rowContent)) !== null) {
        cells.push(cMatch[1].replace(/<[^>]+>/g, '').replace(/[\r\n]+/g, ' ').replace(/\|/g, '-').trim());
      }
      if (cells.length > 0) {
        mdRows.push('| ' + cells.join(' | ') + ' |');
        if (!headerDone) {
          mdRows.push('| ' + cells.map(() => '---').join(' | ') + ' |');
          headerDone = true;
        }
      }
    }

    if (mdRows.length > 1) {
      tables.push(mdRows.join('\n'));
      if (tables.length >= 5) break;
    }
  }

  // Extract Text Paragraphs
  const paragraphRegex = /<(?:p|blockquote|li)[^>]*>([\s\S]*?)<\/(?:p|blockquote|li)>/gi;
  const paragraphs: string[] = [];
  let pMatch;
  while ((pMatch = paragraphRegex.exec(cleanHtml)) !== null) {
    const text = pMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (text.length > 20) {
      paragraphs.push(text);
      if (paragraphs.length >= 60) break;
    }
  }

  // Build raw Markdown text
  const parts: string[] = [];
  if (metaDescription) {
    parts.push(`**Zusammenfassung**: ${metaDescription}\n`);
  }

  if (tables.length > 0) {
    parts.push('### Tabellen & Spezifikationen:');
    parts.push(tables.join('\n\n'));
    parts.push('');
  }

  if (paragraphs.length > 0) {
    parts.push('### Hauptinhalt:');
    parts.push(paragraphs.join('\n\n'));
  } else {
    // Fallback: strip tags from body
    const bodyMatch = cleanHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = (bodyMatch ? bodyMatch[1] : cleanHtml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    parts.push(bodyContent.slice(0, maxChars));
  }

  const rawMarkdown = parts.join('\n');

  // Apply CometJacking & Prompt-Injection Guardrails
  const { cleanText, hasInjectionAttempt, sanitizedPatterns } = applyCometJackingGuardrails(rawMarkdown);

  // Apply Token/Character Budget Truncation
  const { text: budgetedMarkdown, truncated } = truncateContentToBudget(cleanText, maxChars);

  return {
    url,
    title,
    metaDescription,
    markdown: budgetedMarkdown,
    headings,
    tables,
    charCount: budgetedMarkdown.length,
    estimatedTokens: Math.ceil(budgetedMarkdown.length / 4),
    hasInjectionAttempt,
    sanitizedPatterns,
    truncated
  };
}

/**
 * Format payload returned from in-page DOM script.
 */
export function processInPagePayload(
  payload: {
    title: string;
    url: string;
    metaDescription?: string;
    headings?: string[];
    tables?: string[];
    paragraphs?: string[];
  },
  maxChars = 4000
): ExtractedTabContent {
  const parts: string[] = [];
  if (payload.metaDescription) {
    parts.push(`**Zusammenfassung**: ${payload.metaDescription}\n`);
  }

  const tables = Array.isArray(payload.tables) ? payload.tables : [];
  if (tables.length > 0) {
    parts.push('### Tabellen & Daten:');
    parts.push(tables.join('\n\n'));
    parts.push('');
  }

  const paragraphs = Array.isArray(payload.paragraphs) ? payload.paragraphs : [];
  if (paragraphs.length > 0) {
    parts.push('### Textauszug:');
    parts.push(paragraphs.join('\n\n'));
  }

  const rawMarkdown = parts.join('\n');

  // Apply CometJacking & Prompt-Injection Guardrails
  const { cleanText, hasInjectionAttempt, sanitizedPatterns } = applyCometJackingGuardrails(rawMarkdown);

  // Apply Token/Character Budget Truncation
  const { text: budgetedMarkdown, truncated } = truncateContentToBudget(cleanText, maxChars);

  return {
    url: payload.url || '',
    title: payload.title || 'Untitled page',
    metaDescription: payload.metaDescription,
    markdown: budgetedMarkdown,
    headings: Array.isArray(payload.headings) ? payload.headings : [],
    tables,
    charCount: budgetedMarkdown.length,
    estimatedTokens: Math.ceil(budgetedMarkdown.length / 4),
    hasInjectionAttempt,
    sanitizedPatterns,
    truncated
  };
}
