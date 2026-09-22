import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Lastbrowser first-run branding', () => {
  it('does not expose Hermes wording in onboarding runtime status messages', () => {
    const source = readFileSync(
      path.resolve(process.cwd(), '../../services/sidekick/web/api/onboarding.py'),
      'utf8'
    );

    expect(source).not.toContain('Hermes');
    expect(source).not.toContain('bot_name": settings.get("bot_name") or "Hermes"');
    expect(source).toContain('"bot_name": settings.get("bot_name") or "Nova"');
  });
});
