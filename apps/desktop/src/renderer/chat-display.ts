import type { DesktopChatMessage } from './shell-state.js';

export type StructuredChatContent =
  | { kind: 'empty' }
  | { kind: 'text'; text: string }
  | {
      kind: 'research';
      summary: string;
      keyPoints: string[];
      results: Array<{
        title: string;
        url?: string;
        snippet?: string;
        source?: string;
      }>;
      nextSteps: string[];
      raw: string;
    }
  | {
      kind: 'json';
      entries: Array<{
        key: string;
        value: string;
      }>;
      raw: string;
    }
  | {
      kind: 'html';
      title?: string;
      snippet: string;
      raw: string;
    };

export function partitionChatMessages(messages: DesktopChatMessage[] | undefined): {
  visible: DesktopChatMessage[];
  developer: DesktopChatMessage[];
} {
  const visible: DesktopChatMessage[] = [];
  const developer: DesktopChatMessage[] = [];

  for (const message of Array.isArray(messages) ? messages : []) {
    const content = String(message.content || '').trim();
    if (!content && !message.role) continue;

    const internalPrompt = isInternalPromptText(content);
    if (message.role === 'system' || message.role === 'tool') {
      developer.push({ ...message });
      continue;
    }

    const visibleMessage = toVisibleMessage(message, content);
    if (internalPrompt) {
      developer.push({ ...message });
    }

    if (visibleMessage) visible.push(visibleMessage);
  }

  return { visible, developer };
}

export function toVisibleMessage(
  message: DesktopChatMessage,
  content = String(message.content || '').trim()
): DesktopChatMessage | null {
  if (!content && !message.role) return null;

  if (message.role === 'system' || message.role === 'tool') return null;

  if (isInternalPromptText(content)) {
    const summary = summarizeInternalPrompt(content);
    if (!summary) return null;
    return {
      ...message,
      content: summary,
      role: message.role || 'user'
    };
  }

  return {
    ...message,
    content
  };
}

export function isInternalPromptText(content: string): boolean {
  const text = content.trim();
  if (!text) return false;
  return [
    /^\[Workspace:[^\]]+\]/i,
    /Take over the web search/i,
    /Return strict JSON with this shape/i,
    /You are Sidekick inside Lastbrowser/i,
    /prefer current, primary, and reputable sources/i,
    /Take care of the browser search/i,
    /Query:\s+/i
  ].some((pattern) => pattern.test(text));
}

export function summarizeInternalPrompt(content: string): string | null {
  const text = content.trim();
  if (!text) return null;

  const queryMatch = text.match(/Query:\s*(.+?)(?:\n|$)/i);
  if (queryMatch?.[1]) {
    const query = queryMatch[1].trim().replace(/[.]+$/, '');
    if (query) return `Research: ${query}`;
  }

  if (/summarize/i.test(text)) return 'Summarize page';
  if (/explain/i.test(text)) return 'Explain selection';
  if (/research/i.test(text)) return 'Research page';
  if (/workspace/i.test(text)) return 'Workspace action';
  return null;
}

export function describeChatContent(content: string): StructuredChatContent {
  const raw = String(content || '').trim();
  if (!raw) return { kind: 'empty' };

  const parsed = tryParseStructuredPayload(raw);
  if (parsed) return parsed;

  if (looksLikeHtml(raw)) {
    return {
      kind: 'html',
      title: extractHtmlTitle(raw) || undefined,
      snippet: extractHtmlSnippet(raw),
      raw
    };
  }

  return { kind: 'text', text: raw };
}

function tryParseStructuredPayload(raw: string): StructuredChatContent | null {
  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const record = parsed as Record<string, unknown>;
  const output = typeof record.output === 'string' ? record.output.trim() : '';

  if (output) {
    if (looksLikeHtml(output)) {
      return {
        kind: 'html',
        title: extractHtmlTitle(output) || undefined,
        snippet: extractHtmlSnippet(output),
        raw: output
      };
    }

    const nested = safeParseJson(output);
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return tryParseStructuredPayload(output);
    }
  }

  if (isResearchPayload(record)) {
    return {
      kind: 'research',
      summary: stringValue(record.summary) || stringValue(record.title) || 'Research brief',
      keyPoints: listValue(record.key_points ?? record.keyPoints ?? record.keypoints),
      results: arrayValue(record.results).map((item) => normalizeResultItem(item)),
      nextSteps: listValue(record.next_steps ?? record.nextSteps ?? record.follow_up ?? record.followUps),
      raw
    };
  }

  const entries = Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({ key, value: formatStructuredValue(value) }));

  if (!entries.length) return { kind: 'empty' };

  return {
    kind: 'json',
    entries,
    raw
  };
}

function isResearchPayload(record: Record<string, unknown>): boolean {
  return 'summary' in record || 'key_points' in record || 'results' in record || 'next_steps' in record;
}

function normalizeResultItem(value: unknown): { title: string; url?: string; snippet?: string; source?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { title: formatStructuredValue(value) };
  }

  const record = value as Record<string, unknown>;
  return {
    title: stringValue(record.title) || stringValue(record.name) || stringValue(record.label) || 'Result',
    url: stringValue(record.url) || undefined,
    snippet: stringValue(record.snippet) || stringValue(record.description) || undefined,
    source: stringValue(record.source) || stringValue(record.publisher) || undefined
  };
}

function listValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => formatStructuredValue(item)).filter(Boolean);
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function formatStructuredValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => formatStructuredValue(item)).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '[Object]';
    }
  }
  return String(value);
}

function safeParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function looksLikeHtml(raw: string): boolean {
  return /<!doctype html|<html[\s>]/i.test(raw) || /<body[\s>]/i.test(raw) || /<head[\s>]/i.test(raw);
}

function extractHtmlTitle(raw: string): string | null {
  const match = raw.match(/<title[^>]*>(.*?)<\/title>/is);
  if (!match?.[1]) return null;
  return match[1].replace(/\s+/g, ' ').trim() || null;
}

function extractHtmlSnippet(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}
