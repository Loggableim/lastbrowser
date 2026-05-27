import React, { useEffect, useRef } from 'react';

// Lightweight Mermaid/KaTeX renderer for chat content.
// Uses CDN-loaded libraries — mermaid and katex are loaded on first use.

declare global {
  interface Window {
    mermaid?: {
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
      if (window.mermaid) {
        window.mermaid.initialize({ startOnLoad: false, theme: 'dark' });
        resolve();
      } else reject(new Error('mermaid loaded but not found'));
    };
    script.onerror = () => reject(new Error('Failed to load mermaid'));
    document.head.appendChild(script);
  });
}

function renderMermaidBlocks(container: HTMLElement): void {
  const blocks = container.querySelectorAll<HTMLElement>('.mermaid-block');
  if (!blocks.length) return;
  void loadMermaid().then(() => {
    if (window.mermaid) {
      void window.mermaid.run({ nodes: Array.from(blocks) });
    }
  });
}

// ── KaTeX ────────────────────────────────────────────────────

function loadKatex(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window.katex !== 'undefined') {
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
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load katex'));
    document.head.appendChild(script);
  });
}

function renderKatexInElement(el: HTMLElement): void {
  const texBlocks = el.querySelectorAll<HTMLElement>('.katex-block');
  const texInline = el.querySelectorAll<HTMLElement>('.katex-inline');
  if (!texBlocks.length && !texInline.length) return;
  void loadKatex().then(() => {
    if (!window.katex) return;
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

export function processRichText(text: string): { html: string } {
  let html = text;

  // 1. Mermaid fenced blocks
  html = html.replace(
    /```mermaid\s*([\s\S]*?)```/g,
    (_, code: string) => `<pre class="mermaid-block">${escapeHtml(code.trim())}</pre>`
  );

  // 2. Display math: $$...$$
  html = html.replace(
    /\$\$([\s\S]*?)\$\$/g,
    (_, tex: string) => `<span class="katex-block">${escapeHtml(tex.trim())}</span>`
  );

  // 3. Inline math: $...$ (but not $$)
  html = html.replace(
    /(?<!\$)\$([^\n$]{1,200}?)\$(?!\$)/g,
    (_, tex: string) => `<span class="katex-inline">${escapeHtml(tex.trim())}</span>`
  );

  // 4. Simple code blocks — wrap with copy button
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, lang: string, code: string) => {
      const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
      return `<div class="rich-code-block"><div class="rich-code-header"><span>${escapeHtml(lang || 'code')}</span></div><pre><code${langAttr}>${escapeHtml(code.trimEnd())}</code></pre></div>`;
    }
  );

  return { html };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── React Component ──────────────────────────────────────────

export function RichTextRenderer({ content }: { content: string }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    renderMermaidBlocks(ref.current);
    renderKatexInElement(ref.current);
  }, [content]);

  const { html } = processRichText(content);

  return (
    <div
      ref={ref}
      className="rich-text-renderer"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
