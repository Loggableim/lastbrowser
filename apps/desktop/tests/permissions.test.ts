import { describe, expect, it, vi } from 'vitest';
import { createPermissionController, resolvePermissionRequest, shouldPromptForNotificationPermission } from '../src/main/permissions.js';

describe('permission controller', () => {
  it('allows only low-risk page-local permissions and DRM playback', () => {
    const c = createPermissionController();
    expect(c.decide('fullscreen', 'https://example.com')).toBe('allow');
    expect(c.decide('pointerLock', 'https://example.com')).toBe('allow');
    expect(c.decide('clipboard-sanitized-write', 'https://example.com')).toBe('allow');
    expect(c.decide('mediaKeySystem', 'https://www.netflix.com')).toBe('allow');
  });

  it('denies sensitive browser capabilities without an explicit consent flow', () => {
    const c = createPermissionController();
    for (const permission of [
      'keyboardLock',
      'storage-access',
      'top-level-storage-access',
      'window-management',
      'window-placement',
      'local-fonts',
      'protected-media-identifier',
      'protectedMediaIdentifier'
    ]) {
      expect(c.decide(permission, 'https://example.com')).toBe('deny');
    }
  });

  it('denies camera and microphone by default', () => {
    const c = createPermissionController();
    expect(c.decide('media', 'https://example.com')).toBe('deny');
  });

  it('denies website notifications until separately approved and supports revocation', () => {
    const c = createPermissionController();
    expect(c.decide('notifications', 'https://example.com')).toBe('deny');

    c.trustNotificationOrigin('https://example.com/path');
    expect(c.notificationOrigins()).toEqual(['https://example.com']);
    expect(c.decide('notifications', 'https://example.com')).toBe('allow');
    expect(c.decide('notifications', 'https://other.example')).toBe('deny');
    expect(c.decide('media', 'https://example.com')).toBe('deny');

    c.revokeNotificationOrigin('https://example.com');
    expect(c.notificationOrigins()).toEqual([]);
    expect(c.decide('notifications', 'https://example.com')).toBe('deny');
  });

  it('loads, replaces, and notifies notification permission grants independently of media grants', () => {
    const c = createPermissionController(['https://camera.example'], ['https://old.example/path']);
    const seen: string[][] = [];
    c.onNotificationTrustedChange((origins) => seen.push(origins));
    expect(c.notificationOrigins()).toEqual(['https://old.example']);
    c.setNotificationOrigins(['https://new.example/path', 'file:///private']);
    expect(c.notificationOrigins()).toEqual(['https://new.example']);
    expect(c.trustedOrigins()).toEqual(['https://camera.example']);
    expect(seen).toEqual([['https://new.example']]);
  });

  it('prompts only for top-level HTTP(S) notification permission requests', () => {
    expect(shouldPromptForNotificationPermission('notifications', true, 'https://example.com/path')).toBe(true);
    expect(shouldPromptForNotificationPermission('notifications', false, 'https://example.com')).toBe(false);
    expect(shouldPromptForNotificationPermission('media', true, 'https://example.com')).toBe(false);
    expect(shouldPromptForNotificationPermission('notifications', true, 'file:///private')).toBe(false);
    expect(shouldPromptForNotificationPermission('notifications', true, 'not a URL')).toBe(false);
  });

  it('requires an explicit prompt decision, remembers allow, and does not prompt again', async () => {
    const c = createPermissionController();
    const prompt = vi.fn(async () => true);
    expect(await resolvePermissionRequest(c, 'notifications', true, 'https://example.com/path', prompt)).toBe(true);
    expect(c.decide('notifications', 'https://example.com')).toBe('allow');
    expect(prompt).toHaveBeenCalledOnce();
    expect(prompt).toHaveBeenCalledWith('https://example.com');

    expect(await resolvePermissionRequest(c, 'notifications', true, 'https://example.com/other', prompt)).toBe(true);
    expect(prompt).toHaveBeenCalledOnce();
  });

  it('denies prompt rejection and iframe requests without granting the origin', async () => {
    const c = createPermissionController();
    const prompt = vi.fn(async () => false);
    expect(await resolvePermissionRequest(c, 'notifications', true, 'https://example.com', prompt)).toBe(false);
    expect(c.decide('notifications', 'https://example.com')).toBe('deny');
    expect(await resolvePermissionRequest(c, 'notifications', false, 'https://example.com', prompt)).toBe(false);
    expect(prompt).toHaveBeenCalledOnce();
  });

  it('revokes a notification grant so the next request requires a fresh prompt', async () => {
    const c = createPermissionController();
    const allow = vi.fn(async () => true);
    await resolvePermissionRequest(c, 'notifications', true, 'https://example.com', allow);
    c.revokeNotificationOrigin('https://example.com');
    expect(c.decide('notifications', 'https://example.com')).toBe('deny');
    const deny = vi.fn(async () => false);
    expect(await resolvePermissionRequest(c, 'notifications', true, 'https://example.com', deny)).toBe(false);
    expect(deny).toHaveBeenCalledOnce();
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

  it('normalizes persisted origins before applying media permissions', () => {
    const c = createPermissionController(['https://meet.example.com/path?room=1']);
    expect(c.trustedOrigins()).toEqual(['https://meet.example.com']);
    expect(c.decide('media', 'https://meet.example.com/call')).toBe('allow');
  });

  it('never stores file or non-web origins as media exceptions', () => {
    const c = createPermissionController(['file:///C:/private', 'custom://trusted.example']);
    c.trustOrigin('file:///C:/another-private-file');
    c.trustOrigin('chrome://settings');
    expect(c.trustedOrigins()).toEqual([]);
    expect(c.decide('media', 'file:///C:/private')).toBe('deny');
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
