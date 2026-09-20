import { describe, expect, it } from 'vitest';
import { createPermissionController } from '../src/main/permissions.js';

describe('permission controller', () => {
  it('allows page-local permissions', () => {
    const c = createPermissionController();
    expect(c.decide('fullscreen', 'https://example.com')).toBe('allow');
    expect(c.decide('pointerLock', 'https://example.com')).toBe('allow');
    expect(c.decide('clipboard-sanitized-write', 'https://example.com')).toBe('allow');
  });

  it('denies camera and microphone by default', () => {
    const c = createPermissionController();
    expect(c.decide('media', 'https://example.com')).toBe('deny');
  });

  it('denies geolocation', () => {
    const c = createPermissionController();
    expect(c.decide('geolocation', 'https://example.com')).toBe('deny');
  });

  it('denies raw device access even for trusted origins', () => {
    const c = createPermissionController(['https://trusted.com']);
    for (const permission of ['usb', 'serial', 'hid', 'midi', 'fileSystem']) {
      expect(c.decide(permission, 'https://trusted.com')).toBe('deny');
    }
  });

  it('denies clipboard reads (only sanitized writes are allowed)', () => {
    const c = createPermissionController();
    expect(c.decide('clipboard-read', 'https://example.com')).toBe('deny');
  });

  it('denies unknown permissions', () => {
    const c = createPermissionController();
    expect(c.decide('something-new', 'https://example.com')).toBe('deny');
  });

  it('allows media for an explicitly trusted origin', () => {
    const c = createPermissionController();
    c.trustOrigin('https://meet.example.com');
    expect(c.decide('media', 'https://meet.example.com')).toBe('allow');
    expect(c.decide('media', 'https://other.com')).toBe('deny');
  });

  it('normalizes the origin when trusting', () => {
    const c = createPermissionController();
    c.trustOrigin('https://meet.example.com/some/path?x=1');
    expect(c.trustedOrigins()).toContain('https://meet.example.com');
    expect(c.decide('media', 'https://meet.example.com/other')).toBe('allow');
  });

  it('ignores an unparseable origin', () => {
    const c = createPermissionController();
    c.trustOrigin('not a url');
    expect(c.trustedOrigins()).toHaveLength(0);
    expect(c.decide('media', 'not a url')).toBe('deny');
  });

  it('revokes trust', () => {
    const c = createPermissionController();
    c.trustOrigin('https://meet.example.com');
    c.revokeOrigin('https://meet.example.com');
    expect(c.decide('media', 'https://meet.example.com')).toBe('deny');
  });

  it('loads a trusted-origin list', () => {
    const c = createPermissionController();
    c.setTrustedOrigins(['https://a.com', 'https://b.com/path']);
    expect(c.trustedOrigins().sort()).toEqual(['https://a.com', 'https://b.com']);
  });

  it('replaces the list rather than appending', () => {
    const c = createPermissionController(['https://old.com']);
    c.setTrustedOrigins(['https://new.com']);
    expect(c.trustedOrigins()).toEqual(['https://new.com']);
    expect(c.decide('media', 'https://old.com')).toBe('deny');
  });

  it('filters empty entries from the initial list', () => {
    const c = createPermissionController(['', 'https://a.com']);
    expect(c.trustedOrigins()).toEqual(['https://a.com']);
  });

  it('notifies subscribers when an origin is trusted', () => {
    const c = createPermissionController();
    const seen: string[][] = [];
    c.onTrustedChange((origins) => seen.push(origins));
    c.trustOrigin('https://meet.example.com');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(['https://meet.example.com']);
  });

  it('notifies subscribers when an origin is revoked', () => {
    const c = createPermissionController(['https://meet.example.com']);
    const seen: string[][] = [];
    c.onTrustedChange((origins) => seen.push(origins));
    c.revokeOrigin('https://meet.example.com');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual([]);
  });

  it('does not notify when revoking an origin that was not trusted', () => {
    const c = createPermissionController();
    const seen: string[][] = [];
    c.onTrustedChange((origins) => seen.push(origins));
    c.revokeOrigin('https://never-trusted.com');
    expect(seen).toHaveLength(0);
  });

  it('does not notify for an unparseable origin', () => {
    const c = createPermissionController();
    const seen: string[][] = [];
    c.onTrustedChange((origins) => seen.push(origins));
    c.trustOrigin('not a url');
    expect(seen).toHaveLength(0);
  });

  it('stops notifying after unsubscribe', () => {
    const c = createPermissionController();
    const seen: string[][] = [];
    const unsubscribe = c.onTrustedChange((origins) => seen.push(origins));
    unsubscribe();
    c.trustOrigin('https://meet.example.com');
    expect(seen).toHaveLength(0);
  });

  it('keeps notifying other subscribers when one throws', () => {
    const c = createPermissionController();
    const seen: string[][] = [];
    c.onTrustedChange(() => {
      throw new Error('broken listener');
    });
    c.onTrustedChange((origins) => seen.push(origins));
    expect(() => c.trustOrigin('https://meet.example.com')).not.toThrow();
    expect(seen).toHaveLength(1);
  });
});
