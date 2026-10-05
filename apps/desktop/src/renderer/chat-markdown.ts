import { Marked } from 'marked';

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeUrl = (value: string) => /^(https?:|mailto:)/i.test(value) || value.startsWith('#');
const markdown = new Marked({ gfm: true, breaks: true, renderer: {
  html({ text }) { return escape(text); },
  link({ href, tokens }) {
    const label = this.parser.parseInline(tokens);
    return safeUrl(href) ? `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
  },
  image({ text }) { return escape(text); },
  code({ text, lang }) {
    if (lang?.trim() === 'mermaid') return `<pre class="mermaid-block">${escape(text)}</pre>`;
    return `<div class="rich-code-block"><div class="rich-code-header"><span>${escape(lang || 'code')}</span><button type="button" class="rich-code-copy" aria-label="Copy code">Copy</button></div><pre><code>${escape(text)}</code></pre></div>`;
  }
}, extensions: [{
  name: 'tabCitation', level: 'inline',
  start(src) { return src.indexOf('[Tab '); },
  tokenizer(src) {
    const match = /^\[Tab\s+(\d+)(?::\s*([^\]]+))?\]/i.exec(src);
    if (match) return { type: 'tabCitation', raw: match[0], tab: match[1], label: match[2]?.trim() || '' };
  },
  renderer(token) {
    const tab = escape(String(token.tab)); const label = escape(String(token.label));
    return `<button type="button" class="tab-citation-pill" data-tab-index="${tab}" data-snippet="${label}">Tab ${tab}${label ? `: ${label}` : ''}</button>`;
  }
}, {
  name: 'math', level: 'inline', start(src) { return src.indexOf('$'); },
  tokenizer(src) {
    const match = /^(\$\$)([\s\S]+?)\$\$|^\$([^\n$]{1,200})\$(?!\$)/.exec(src);
    if (match) return { type: 'math', raw: match[0], display: Boolean(match[1]), tex: match[2] ?? match[3] };
  },
  renderer(token) { return `<span class="${token.display ? 'katex-block' : 'katex-inline'}">${escape(String(token.tex).trim())}</span>`; }
}] });

/** Raw HTML is escaped; links cannot execute code and images never load remotely. */
export function renderChatMarkdown(text: string): string {
  return markdown.parse(text, { async: false });
}
