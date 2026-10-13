import React, { useEffect, useRef } from 'react';
import { switchTabByIndex } from './tab-intelligence.js';
import DOMPurify from 'dompurify';
import { renderChatMarkdown } from './chat-markdown.js';
import './chat-markdown.css';

// Lazy modules and KaTeX fonts/CSS are bundled by Vite, with no remote scripts.
let mermaidModule: Promise<typeof import('mermaid')['default']> | undefined;
let katexModule: Promise<typeof import('katex')['default']> | undefined;
let diagramSequence = 0;

function loadMermaid(): Promise<typeof import('mermaid')['default']> {
  if (!mermaidModule) mermaidModule = import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false, theme: 'dark', securityLevel: 'strict',
      suppressErrorRendering: true, maxTextSize: 50_000, maxEdges: 500,
      flowchart: { htmlLabels: false },
      secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'suppressErrorRendering', 'dompurifyConfig'],
    });
    return mermaid;
  }).catch(error => { mermaidModule = undefined; throw error; });
  return mermaidModule;
}

function renderMermaidBlocks(container: HTMLElement): void {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>('.mermaid-block'));
  if (!blocks.length) return;
  void loadMermaid().then(async mermaid => {
    for (const block of blocks) {
      const source = block.textContent || '';
      if (!block.isConnected || source.length > 50_000) continue;
      try {
        const result = await mermaid.render(`lastbrowser-diagram-${++diagramSequence}`, source);
        if (!block.isConnected || block.textContent !== source) continue;
        block.innerHTML = DOMPurify.sanitize(result.svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          FORBID_TAGS: ['foreignObject', 'script', 'iframe', 'object', 'embed'],
        });
      } catch { /* retain readable diagram source on parse/render failure */ }
    }
  }).catch(() => { /* retain source if the bundled module cannot load */ });
}

function loadKatex(): Promise<typeof import('katex')['default']> {
  if (!katexModule) katexModule = Promise.all([
    import('katex'), import('katex/dist/katex.min.css'),
  ]).then(([module]) => module.default).catch(error => { katexModule = undefined; throw error; });
  return katexModule;
}

function renderKatexInElement(container: HTMLElement): void {
  const elements = Array.from(container.querySelectorAll<HTMLElement>('.katex-block, .katex-inline'));
  if (!elements.length) return;
  void loadKatex().then(katex => {
    elements.forEach(element => {
      if (!element.isConnected) return;
      try {
        const markup = katex.renderToString(element.textContent || '', {
          displayMode: element.classList.contains('katex-block'), throwOnError: false,
          trust: false, strict: 'warn', maxExpand: 1000, maxSize: 20,
        });
        element.innerHTML = DOMPurify.sanitize(markup, { USE_PROFILES: { html: true, mathMl: true } });
      } catch { /* retain readable math source on failure */ }
    });
  }).catch(() => { /* retain source if the bundled module cannot load */ });
}

// ── Pre-process text: extract mermaid / math blocks ──────────

export function processRichText(text?: string | null): { html: string } {
  if (!text) return { html: '' };
  return { html: renderChatMarkdown(String(text)) };
}

function escapeHtml(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Legacy execCommand fallback for environments without the async Clipboard API. */
function fallbackCopy(text: string): void {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  } catch {
    /* clipboard unavailable — the button label still flashes, no throw */
  }
}

// ── React Component ──────────────────────────────────────────

export function RichTextRenderer({ content, text }: { content?: string; text?: string }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const rawContent = content ?? text ?? '';

  useEffect(() => {
    if (!ref.current) return;
    renderMermaidBlocks(ref.current);
    renderKatexInElement(ref.current);
  }, [rawContent]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('.tab-citation-pill') as HTMLElement | null;
      if (btn && btn.dataset.tabIndex) {
        const tabNum = parseInt(btn.dataset.tabIndex, 10);
        const snippet = btn.dataset.snippet || '';
        if (!isNaN(tabNum)) {
          switchTabByIndex(tabNum, snippet);
        }
        return;
      }
      // Copy button on code blocks: copy the raw code text to the clipboard
      // and flash the button label as confirmation. Clipboard writes can be
      // blocked by webview permission policies — degrade to a selection
      // fallback instead of throwing inside the React event handler.
      const copyBtn = (e.target as HTMLElement).closest('.rich-code-copy') as HTMLElement | null;
      if (copyBtn) {
        const block = copyBtn.closest('.rich-code-block');
        const codeEl = block?.querySelector('code');
        if (!codeEl) return;
        const text = codeEl.textContent || '';
        const done = () => {
          copyBtn.textContent = 'Copied!';
          window.setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1600);
        };
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(() => {
            fallbackCopy(text);
            done();
          });
        } else {
          fallbackCopy(text);
          done();
        }
      }
    };
    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, []);

  const { html } = processRichText(rawContent);

  return (
    <div
      ref={ref}
      className="rich-text-renderer"
      dangerouslySetInnerHTML={{ __html: typeof DOMPurify.sanitize === 'function' ? DOMPurify.sanitize(html) : escapeHtml(rawContent) }}
    />
  );
}
