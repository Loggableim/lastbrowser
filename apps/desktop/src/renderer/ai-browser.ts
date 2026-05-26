export type AiBrowserResult = {
  title: string;
  url: string;
  snippet: string;
  source?: string;
};

export type AiBrowserBrief = {
  query: string;
  summary: string;
  keyPoints: string[];
  results: AiBrowserResult[];
  nextSteps: string[];
};

type AiBrowserPayload = {
  summary?: unknown;
  key_points?: unknown;
  keyPoints?: unknown;
  results?: unknown;
  next_steps?: unknown;
  nextSteps?: unknown;
};

export function buildAiBrowserPrompt(query: string): string {
  return [
    'You are Sidekick inside Lastbrowser AI Search.',
    'Take over the web search for the user and return a compact research brief.',
    `Query: ${query.trim()}`,
    '',
    'Return strict JSON with this shape:',
    '{',
    '  "summary": "3-5 sentence answer",',
    '  "key_points": ["important point"],',
    '  "results": [{"title":"result title","url":"https://source","snippet":"why it matters","source":"publisher"}],',
    '  "next_steps": ["useful follow-up"]',
    '}',
    'Prefer current, primary, and reputable sources. Keep it concise and presentation-ready.'
  ].join('\n');
}

export function parseAiBrowserResponse(message: string, query: string): AiBrowserBrief {
  const payload = parseJsonPayload(message);
  if (payload) {
    const results = normalizeResults(payload.results);
    return {
      query,
      summary: text(payload.summary, message).trim(),
      keyPoints: stringArray(payload.key_points || payload.keyPoints),
      results: results.length ? results : fallbackResults(query),
      nextSteps: stringArray(payload.next_steps || payload.nextSteps)
    };
  }

  return {
    query,
    summary: message.trim() || `Search brief for ${query}.`,
    keyPoints: [],
    results: fallbackResults(query),
    nextSteps: ['Open a result in the browser', 'Ask Sidekick to compare the sources']
  };
}

function parseJsonPayload(message: string): AiBrowserPayload | null {
  const fenced = message.match(/```json\s*([\s\S]*?)```/i);
  const candidates = [
    fenced?.[1],
    message.match(/\{[\s\S]*\}/)?.[0]
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as AiBrowserPayload;
      }
    } catch {
      // Continue with the next candidate.
    }
  }
  return null;
}

function normalizeResults(value: unknown): AiBrowserResult[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
    .map((item) => ({
      title: text(item.title || item.name, 'Untitled result'),
      url: text(item.url || item.href, ''),
      snippet: text(item.snippet || item.description || item.summary, ''),
      source: text(item.source || item.publisher || item.site, '')
    }))
    .filter((item) => item.title || item.url || item.snippet)
    .slice(0, 8);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item).trim()).filter(Boolean).slice(0, 8);
}

function fallbackResults(query: string): AiBrowserResult[] {
  const encoded = encodeURIComponent(query);
  return [
    {
      title: 'Web search',
      url: `https://www.google.com/search?q=${encoded}`,
      snippet: 'Open the live web results for this query.',
      source: 'Google'
    },
    {
      title: 'Source-focused search',
      url: `https://www.google.com/search?q=${encoded}%20official%20documentation%20OR%20source`,
      snippet: 'Search with a stronger bias toward official documentation and primary sources.',
      source: 'Lastbrowser'
    }
  ];
}

function text(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  return String(value);
}
