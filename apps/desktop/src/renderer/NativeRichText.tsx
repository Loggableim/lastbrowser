import React, { useEffect, useRef } from 'react';
import { switchTabByIndex } from './tab-intelligence.js';
import DOMPurify from 'dompurify';
import { renderChatMarkdown } from './chat-markdown.js';
import './chat-markdown.css';

// Lightweight Mermaid/KaTeX renderer for chat content.
// Uses CDN-loaded libraries — mermaid and katex are loaded on first use.

declare global {
  interface Window {
    mermaid?: {
      initialize: (options: { startOnLoad: boolean; theme: 'dark' | 'default' }) => void;
      run: (opts: { nodes: HTMLElement[] }) => Promise<void>;
    };
    katex?: {
      renderToString: (tex: string, opts?: { displayMode?: boolean; throwOnError?: boolean }) => string;
    };
  }
}

// ── Mermaid ──────────────────────────────────────────────────

function loadMermaid(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window.mermaid !== 'undefined' && typeof window.mermaid.run === 'function') {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
    script.onload = () => {
      // The CDN can serve a build whose API differs (or a partial load), so
      // verify the method we actually call exists before resolving. Without
      // this the caller throws "run is not a function" and the whole chat
      // panel falls into the error boundary.
      if (window.mermaid && typeof window.mermaid.run === 'function') {
        window.mermaid.initialize({ startOnLoad: false, theme: 'dark' });
        resolve();
      } else {
        reject(new Error('mermaid loaded without a usable run()'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load mermaid'));
    document.head.appendChild(script);
  });
}

function renderMermaidBlocks(container: HTMLElement): void {
  const blocks = container.querySelectorAll<HTMLElement>('.mermaid-block');
  if (!blocks.length) return;
  // Diagram rendering is a progressive enhancement: a missing CDN or an API
  // mismatch must never break the chat transcript.
  void loadMermaid()
    .then(() => {
      if (window.mermaid && typeof window.mermaid.run === 'function') {
        void window.mermaid.run({ nodes: Array.from(blocks) });
      }
    })
    .catch(() => {
      /* leave the raw diagram text in place */
    });
}

// ── KaTeX ────────────────────────────────────────────────────

function loadKatex(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window.katex !== 'undefined' && typeof window.katex.renderToString === 'function') {
      resolve();
      return;
    }
    // Load CSS first
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css';
    document.head.appendChild(link);
    // Load JS
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.js';
    script.onload = () => {
      // Same guard as mermaid: verify the method we call actually exists.
      if (window.katex && typeof window.katex.renderToString === 'function') resolve();
      else reject(new Error('katex loaded without renderToString()'));
    };
    script.onerror = () => reject(new Error('Failed to load katex'));
    document.head.appendChild(script);
  });
}

function renderKatexInElement(el: HTMLElement): void {
  const texBlocks = el.querySelectorAll<HTMLElement>('.katex-block');
  const texInline = el.querySelectorAll<HTMLElement>('.katex-inline');
  if (!texBlocks.length && !texInline.length) return;
  // Math rendering is a progressive enhancement — never break the transcript.
  void loadKatex().then(() => {
    if (!window.katex || typeof window.katex.renderToString !== 'function') return;
    texBlocks.forEach((block) => {
      try {
        block.innerHTML = window.katex!.renderToString(block.textContent || '', {
          displayMode: true, throwOnError: false
        });
      } catch { /* keep raw on error */ }
    });
    texInline.forEach((span) => {
      try {
        span.innerHTML = window.katex!.renderToString(span.textContent || '', {
          displayMode: false, throwOnError: false
        });
      } catch { /* keep raw on error */ }
    });
  });
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
      dangerouslySetInnerHTML={{ __html: typeof DOMPurify.sanitize === 'function' ? DOMPurify.sanitize(html) : html }}
    />
  );
}
