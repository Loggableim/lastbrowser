import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mailPanelCopy, mailSettingsCopy } from '../src/renderer/i18n/mail-plugin-copy.js';

const source = (name: string) => readFileSync(resolve(__dirname, '../src/renderer', name), 'utf8');

describe('space mail panel mount', () => {
  it('opens the space inbox on the gmail route', () => {
    const app = source('App.tsx');
    expect(app).toContain("case 'gmail':");
    expect(app).toContain('<NativeMailMain workspace={activeSpacePath}');
    expect(app).not.toContain('<NativeGmailMain');
  });

  it('puts account setup on the plugins settings page', () => {
    const settings = source('panels/SystemPanels.tsx');
    const plugins = settings.slice(settings.indexOf("section === 'plugins'"), settings.indexOf("section === 'system'"));
    expect(plugins).toContain('<MailPluginSettings workspace={activeSpacePath} ready={ready} />');
  });

  it('keeps the tools drawer entry available without a separate flag', () => {
    const sidebar = source('components/SidekickSidebar.tsx');
    expect(sidebar).toContain("id: 'gmail' as const, title: 'Mail'");
    expect(sidebar).toContain('policy.gmail_ai_enabled');
  });

  it('uses English copy outside German locales', () => {
    expect(mailPanelCopy('en').noAccount).toBe('No mail account is enabled for this Space.');
    expect(mailPanelCopy('de').noAccount).toContain('Mailkonto');
    expect(mailSettingsCopy('en_US').label).toBe('Mail plugin');
    expect(mailSettingsCopy('de').label).toBe('Mail-Plugin');
  });
});
