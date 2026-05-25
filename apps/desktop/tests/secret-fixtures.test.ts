import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const telegramBotTokenPattern = /\b(?:bot)?\d{8,}:[A-Za-z0-9_-]{20,}\b/;
const textFilePattern = /\.(css|html|js|json|md|mjs|nsh|py|ts|tsx|txt|ya?ml)$/i;

function trackedTextFiles(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter((file) => file && textFilePattern.test(file));
}

describe('secret-shaped fixtures', () => {
  it('does not commit Telegram bot-token-shaped literals in tracked text files', () => {
    const offenders = trackedTextFiles().filter((file) => {
      const fullPath = path.join(repoRoot, file);
      return existsSync(fullPath) && telegramBotTokenPattern.test(readFileSync(fullPath, 'utf8'));
    });

    expect(offenders).toEqual([]);
  });
});
