import { describe, expect, it } from 'vitest';
import { describeChatContent, partitionChatMessages } from '../src/renderer/chat-display.js';

describe('chat display helpers', () => {
  it('separates internal prompts from the visible transcript', () => {
    const prompt = [
      '[Workspace:v1 C:/Users/logga/AppData/Local/Programs/Lastbrowser/resources/services/webui]',
      'You are Sidekick inside Lastbrowser.',
      'Take over the web search for the user and return a compact research brief.',
      'Query: compare Arc Browser and Dia Browser',
      'Return strict JSON with this shape:'
    ].join('\n');

    const { visible, developer } = partitionChatMessages([
      { role: 'user', content: prompt },
      { role: 'assistant', content: '{"summary":"done"}' }
    ]);

    expect(visible[0]?.content).toBe('Research: compare Arc Browser and Dia Browser');
    expect(developer[0]?.content).toContain('Return strict JSON with this shape');
    expect(visible[1]?.content).toBe('{"summary":"done"}');
  });

  it('parses research briefs into structured output', () => {
    const view = describeChatContent(JSON.stringify({
      summary: 'Arc and Dia are both browser-focused, but they optimize different workflows.',
      key_points: ['Arc emphasizes workspace organization.', 'Dia emphasizes speed and minimalism.'],
      results: [
        {
          title: 'Arc Browser',
          url: 'https://arc.net',
          snippet: 'A browser built around workspaces and context.',
          source: 'Arc'
        }
      ],
      next_steps: ['Try both browsers', 'Compare tab workflows']
    }));

    expect(view.kind).toBe('research');
    if (view.kind !== 'research') throw new Error('Expected research view');
    expect(view.summary).toContain('Arc and Dia');
    expect(view.keyPoints).toHaveLength(2);
    expect(view.results[0]?.title).toBe('Arc Browser');
    expect(view.nextSteps).toContain('Try both browsers');
  });

  it('detects html payloads even when wrapped in json output', () => {
    const view = describeChatContent(JSON.stringify({
      output: '<!DOCTYPE html><html><head><title>DuckDuckGo</title></head><body>Result</body></html>'
    }));

    expect(view.kind).toBe('html');
    if (view.kind !== 'html') throw new Error('Expected html view');
    expect(view.title).toBe('DuckDuckGo');
    expect(view.snippet).toContain('<!DOCTYPE html>');
  });
});
