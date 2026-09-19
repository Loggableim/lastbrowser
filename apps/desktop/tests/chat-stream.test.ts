import { describe, expect, it } from 'vitest';
import { drainSseBuffer, parseSseFrame } from '../src/main/chat-stream.js';

describe('parseSseFrame', () => {
  it('parses an event name and JSON payload', () => {
    const event = parseSseFrame('event: delta\ndata: {"text":"hi"}');
    expect(event).toEqual({ event: 'delta', data: { text: 'hi' }, raw: '{"text":"hi"}' });
  });

  it('defaults the event name to message', () => {
    const event = parseSseFrame('data: {"a":1}');
    expect(event?.event).toBe('message');
    expect(event?.data).toEqual({ a: 1 });
  });

  it('keeps non-JSON payloads as raw strings', () => {
    const event = parseSseFrame('event: heartbeat\ndata: ping');
    expect(event?.data).toBe('ping');
  });

  it('joins multi-line data fields', () => {
    const event = parseSseFrame('event: message\ndata: line one\ndata: line two');
    expect(event?.data).toBe('line one\nline two');
  });

  it('ignores comment-only frames', () => {
    expect(parseSseFrame(': keep-alive')).toBeNull();
  });

  it('ignores empty frames', () => {
    expect(parseSseFrame('')).toBeNull();
  });

  it('strips a single leading space after data:', () => {
    const event = parseSseFrame('data:  two spaces');
    // Only the first space is part of the SSE framing.
    expect(event?.data).toBe(' two spaces');
  });
});

describe('drainSseBuffer', () => {
  it('parses complete frames and keeps the remainder', () => {
    const { events, rest } = drainSseBuffer('event: a\ndata: 1\n\nevent: b\ndata: 2\n\nevent: c\ndata: 3');
    expect(events.map((e) => e.event)).toEqual(['a', 'b']);
    expect(rest).toBe('event: c\ndata: 3');
  });

  it('handles CRLF line endings', () => {
    const { events } = drainSseBuffer('event: delta\r\ndata: {"x":1}\r\n\r\n');
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual({ x: 1 });
  });

  it('returns nothing for a partial frame', () => {
    const { events, rest } = drainSseBuffer('event: delta\ndata: {"partial"');
    expect(events).toHaveLength(0);
    expect(rest).toBe('event: delta\ndata: {"partial"');
  });

  it('parses several frames in one chunk', () => {
    const { events } = drainSseBuffer('event: a\ndata: 1\n\nevent: b\ndata: 2\n\nevent: c\ndata: 3\n\n');
    expect(events.map((e) => e.event)).toEqual(['a', 'b', 'c']);
  });

  it('skips comment frames inside a chunk', () => {
    const { events } = drainSseBuffer(': ping\n\nevent: delta\ndata: {"t":1}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('delta');
  });
});
