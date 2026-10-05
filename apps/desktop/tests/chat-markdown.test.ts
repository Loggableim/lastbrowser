import { describe, expect, it } from 'vitest';
import { renderChatMarkdown } from '../src/renderer/chat-markdown.js';

describe('chat Markdown', () => {
  it('formats headings, emphasis, lists, tables and code together', () => {
    const html = renderChatMarkdown('## Zusammenfassung\n\n**Kernaussagen**\n\n- Eintrag\n\n| Repo | Sprache |\n| --- | --- |\n| sdk | Python |\n\n```python\nprint("<sdk>")\n```');
    for (const expected of ['<h2>', '<strong>Kernaussagen</strong>', '<ul>', '<table>', 'rich-code-copy', '&lt;sdk&gt;']) expect(html).toContain(expected);
  });
  it('escapes raw HTML and rejects executable links and remote images', () => {
    const html = renderChatMarkdown('<img src=x onerror=alert(1)>\n\n[run](javascript:alert)\n\n![remote](https://example.com/pixel)');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('&lt;img');
  });
  it('does not interpret Markdown, citations or math inside code', () => {
    const html = renderChatMarkdown('```text\n**literal** [Tab 1] $x$\n```');
    expect(html).toContain('**literal** [Tab 1] $x$');
    expect(html).not.toContain('tab-citation-pill');
    expect(html).not.toContain('katex-inline');
  });
});
