import { describe, expect, it } from 'vitest';
import { lastAssistantText } from '../src/renderer/bridge.js';

describe('lastAssistantText', () => {
  it('returns the last assistant message', () => {
    const session = {
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'first answer' },
        { role: 'user', content: 'again' },
        { role: 'assistant', content: 'final answer' }
      ]
    };
    expect(lastAssistantText(session)).toBe('final answer');
  });

  it('skips trailing user messages', () => {
    const session = {
      messages: [
        { role: 'assistant', content: 'the answer' },
        { role: 'user', content: 'a follow-up' }
      ]
    };
    expect(lastAssistantText(session)).toBe('the answer');
  });

  it('returns an empty string when there is no assistant message', () => {
    expect(lastAssistantText({ messages: [{ role: 'user', content: 'hi' }] })).toBe('');
  });

  it('returns an empty string for an empty session', () => {
    expect(lastAssistantText({ messages: [] })).toBe('');
  });

  it('tolerates a missing messages array', () => {
    expect(lastAssistantText({})).toBe('');
  });

  it('tolerates null and undefined', () => {
    expect(lastAssistantText(null)).toBe('');
    expect(lastAssistantText(undefined)).toBe('');
  });

  it('ignores assistant messages with blank content', () => {
    const session = {
      messages: [
        { role: 'assistant', content: 'real answer' },
        { role: 'assistant', content: '   ' }
      ]
    };
    expect(lastAssistantText(session)).toBe('real answer');
  });

  it('trims the returned content', () => {
    expect(lastAssistantText({ messages: [{ role: 'assistant', content: '  padded  ' }] })).toBe('padded');
  });

  it('ignores non-string content', () => {
    const session = {
      messages: [
        { role: 'assistant', content: 'good' },
        { role: 'assistant', content: undefined as unknown as string }
      ]
    };
    expect(lastAssistantText(session)).toBe('good');
  });
});
