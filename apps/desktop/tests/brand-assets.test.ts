import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { brandAssets } from '../src/renderer/brand.js';

const requiredSidebarIcons = [
  'chat',
  'tasks',
  'kanban',
  'skills',
  'agents',
  'memory',
  'workspaces',
  'profiles',
  'todos',
  'insights',
  'logs',
  'gmail',
  'browser',
  'discord',
  'appstore',
  'settings'
] as const;

describe('brand assets', () => {
  it('exposes file-protocol-safe public asset paths for Lastbrowser and Sidekick', () => {
    expect(brandAssets.logo).toBe('./lastbrowser-logo.png');
    expect(brandAssets.appIcon256).toBe('./app-icon-256.png');
    expect(brandAssets.favicon32).toBe('./favicon-32.png');
    expect(brandAssets.sidekickAvatar).toBe('./sidekick-avatar.png');
    expect(brandAssets.sidebarIcons.chat).toBe('./sidebar-icons/01-chat-modern-popart.png');
    expect(brandAssets.sidebarIcons.appstore).toBe('./sidebar-icons/15-appstore-modern-popart.png');
    expect(brandAssets.sidebarIcons.sidekick).toBe('./sidebar-icons/30-sidekick-modern-popart.png');
  });

  it('maps every WebUI rail panel to a generated corporate-design icon', () => {
    for (const key of requiredSidebarIcons) {
      const assetPath = brandAssets.sidebarIcons[key];
      expect(assetPath).toMatch(/^\.\/sidebar-icons\/\d{2}-.+-modern-popart\.png$/);
      expect(existsSync(path.resolve(process.cwd(), '../../brand/assets', assetPath))).toBe(true);
    }
  });

  it('keeps generated NSIS bitmap assets in the desktop build resources', () => {
    expect(existsSync(path.resolve(process.cwd(), 'build/installerHeader.bmp'))).toBe(true);
    expect(existsSync(path.resolve(process.cwd(), 'build/installerSidebar.bmp'))).toBe(true);
    expect(existsSync(path.resolve(process.cwd(), 'build/installer.nsh'))).toBe(true);
  });

  it('offers a branded uninstall cleanup path for Lastbrowser user data', () => {
    const nsis = readFileSync(path.resolve(process.cwd(), 'build/installer.nsh'), 'utf8');

    expect(nsis).toContain('!macro customUnInstall');
    expect(nsis).toContain('$APPDATA\\Lastbrowser');
    expect(nsis).toContain('Remove Lastbrowser user data');
  });
});
