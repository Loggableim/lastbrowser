import { describe, expect, it } from 'vitest';
import { buildAiBrowserPrompt, parseAiBrowserResponse } from '../src/renderer/ai-browser.js';

describe('AI Browser search brief', () => {
  it('builds a research prompt that asks Sidekick for structured search results', () => {
    const prompt = buildAiBrowserPrompt('best local llm for windows');

    expect(prompt).toContain('best local llm for windows');
    expect(prompt).toContain('AI Browser');
    expect(prompt).toContain('summary');
    expect(prompt).toContain('results');
    expect(prompt).toContain('JSON');
  });

  it('parses structured Sidekick output into a presentation-style search brief', () => {
    const brief = parseAiBrowserResponse(`Here is the brief:

\`\`\`json
{
  "summary": "Local models are best picked by GPU memory and latency needs.",
  "key_points": ["Use quantized GGUF for CPU fallback", "Prefer OpenAI-compatible servers for tooling"],
  "results": [
    {"title": "llama.cpp", "url": "https://github.com/ggerganov/llama.cpp", "snippet": "Local inference runtime."}
  ],
  "next_steps": ["Compare 7B and 14B models"]
}
\`\`\`
`, 'best local llm');

    expect(brief.summary).toContain('GPU memory');
    expect(brief.keyPoints).toEqual([
      'Use quantized GGUF for CPU fallback',
      'Prefer OpenAI-compatible servers for tooling'
    ]);
    expect(brief.results[0]).toMatchObject({
      title: 'llama.cpp',
      url: 'https://github.com/ggerganov/llama.cpp'
    });
    expect(brief.nextSteps).toEqual(['Compare 7B and 14B models']);
  });

  it('falls back to a readable brief when the model returns prose', () => {
    const brief = parseAiBrowserResponse('AI search summary.\n\nUse official docs first.', 'official docs');

    expect(brief.summary).toBe('AI search summary.\n\nUse official docs first.');
    expect(brief.results.length).toBeGreaterThan(0);
    expect(brief.results[0].url).toContain('official%20docs');
  });
});
