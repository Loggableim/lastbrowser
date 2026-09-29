import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  SidecarServices,
  parseDoctorOutput,
  resolveServiceLayout,
  type DoctorReport
} from '../src/main/services.js';

describe('doctor diagnosis service & parser', () => {
  const sampleCliDoctorOutput = `
┌─────────────────────────────────────────────────────────┐
│                 🩺 Sidekick Doctor                      │
└─────────────────────────────────────────────────────────┘

◆ Python Environment
  ✓ Python 3.12.10
  ⚠ Not in virtual environment (recommended)

◆ Required Packages
  ✗ OpenAI SDK (missing)
  ✓ Rich (terminal UI)
  ✓ python-dotenv
  ✓ PyYAML
  ✓ HTTPX
  ⚠ Croniter (cron expressions) (optional, not installed)

◆ Configuration Files
  ✓ C:\\sidekick\\home/.env file exists
  ✓ API key or custom endpoint configured
  ✓ C:\\sidekick\\home/config.yaml exists
  ✓ Config version up to date (v23)

◆ Auth Providers
  ✓ OpenAI Codex auth (logged in)
  ✓ Google Gemini OAuth (logged in (dominikrnr@gmail.com))
  ⚠ MiniMax OAuth (not logged in)
  ✓ codex CLI

◆ Directory Structure
  ✓ C:\\sidekick\\home directory exists
  ✓ C:\\sidekick\\home/SOUL.md exists (persona configured)
  ✓ C:\\sidekick\\home/state.db exists (192 sessions)
    → WAL file is 14 MB (normal for active sessions)

◆ External Tools
  ✓ git
  ✓ ripgrep (rg) (faster file search)
  ⚠ docker not found (optional)
  ✓ Node.js

────────────────────────────────────────────────────────────
  Found 2 issue(s) to address:

  1. Install OpenAI SDK: uv pip install openai
  2. Run 'sidekick setup' to configure missing API keys for full tool access

  Tip: run 'sidekick doctor --fix' to auto-fix what's possible.
`;

  it('parses doctor categories, checks, status rollups and issues cleanly', () => {
    const report = parseDoctorOutput(sampleCliDoctorOutput, 1);

    expect(report.exitCode).toBe(1);
    expect(report.categories).toHaveLength(6);

    // Python Environment category
    const pyCat = report.categories.find((c) => c.name === 'Python Environment');
    expect(pyCat).toBeDefined();
    expect(pyCat?.status).toBe('warn');
    expect(pyCat?.checks).toEqual([
      { type: 'ok', text: 'Python 3.12.10' },
      { type: 'warn', text: 'Not in virtual environment', detail: 'recommended' }
    ]);

    // Required Packages category (has fail)
    const pkgCat = report.categories.find((c) => c.name === 'Required Packages');
    expect(pkgCat).toBeDefined();
    expect(pkgCat?.status).toBe('fail');
    const openAiCheck = pkgCat?.checks.find((c) => c.text === 'OpenAI SDK');
    expect(openAiCheck).toEqual({ type: 'fail', text: 'OpenAI SDK', detail: 'missing' });

    // Auth Providers category with nested parens
    const authCat = report.categories.find((c) => c.name === 'Auth Providers');
    expect(authCat).toBeDefined();
    expect(authCat?.status).toBe('warn');
    const geminiCheck = authCat?.checks.find((c) => c.text === 'Google Gemini OAuth');
    expect(geminiCheck).toEqual({
      type: 'ok',
      text: 'Google Gemini OAuth',
      detail: 'logged in (dominikrnr@gmail.com)'
    });

    // External Tools with multiple parens
    const toolsCat = report.categories.find((c) => c.name === 'External Tools');
    expect(toolsCat).toBeDefined();
    const rgCheck = toolsCat?.checks.find((c) => c.text === 'ripgrep (rg)');
    expect(rgCheck).toEqual({
      type: 'ok',
      text: 'ripgrep (rg)',
      detail: 'faster file search'
    });

    // Configuration Files (all ok)
    const confCat = report.categories.find((c) => c.name === 'Configuration Files');
    expect(confCat).toBeDefined();
    expect(confCat?.status).toBe('ok');

    // Summary counts
    expect(report.summary.failures).toBe(1);
    expect(report.summary.warnings).toBe(4);
    expect(report.summary.passed).toBe(18);

    // Issues
    expect(report.issues).toEqual([
      'Install OpenAI SDK: uv pip install openai',
      "Run 'sidekick setup' to configure missing API keys for full tool access"
    ]);
  });

  it('handles clean output with 0 failures and 0 warnings', () => {
    const cleanOutput = `
◆ Runtime
  ✓ Python 3.12.10
  ✓ Environment active
◆ Database
  ✓ SQLite DB healthy
`;
    const report = parseDoctorOutput(cleanOutput, 0);
    expect(report.exitCode).toBe(0);
    expect(report.summary.failures).toBe(0);
    expect(report.summary.warnings).toBe(0);
    expect(report.summary.passed).toBe(3);
    expect(report.issues).toEqual([]);
    expect(report.categories.every((c) => c.status === 'ok')).toBe(true);
  });

  it('keeps a warnings-only doctor exit distinct from failures', () => {
    const report = parseDoctorOutput(`
◆ Optional integrations
  ⚠ docker not found (optional)
`, 1);

    expect(report.exitCode).toBe(1);
    expect(report.summary.failures).toBe(0);
    expect(report.summary.warnings).toBe(1);
    expect(report.categories[0].status).toBe('warn');
  });

  it('keeps expected optional setup notes informational in the dashboard', () => {
    const report = parseDoctorOutput(`
◆ Python Environment
  → Virtual environment not active (optional; Lastbrowser manages its Python runtime)
◆ Configuration Files
  → Provider credentials are managed by Lastbrowser; .env is optional
  → config.yaml not found (using defaults; configuration is optional)
◆ Auth Providers
  → OpenAI Codex auth not connected (optional unless selected as the active provider)
◆ Tool Availability
  → browser-cdp unavailable (optional integration dependency not met)
  → web unavailable (optional; missing search provider credentials)
◆ Skills Hub
  → Skills Hub not initialized (created when you first use skills)
────────────────────────────────────────────────────────────
  All checks passed!
`, 0);

    expect(report.summary).toEqual({ passed: 0, warnings: 0, failures: 0 });
    expect(report.categories.every((category) => category.status === 'ok')).toBe(true);
    expect(report.categories.flatMap((category) => category.checks).every((check) => check.type === 'info')).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('strips ANSI color codes properly', () => {
    const ansiOutput = `
\u001b[32m◆\u001b[0m \u001b[1mPython Environment\u001b[0m
  \u001b[32m✓\u001b[0m Python 3.12.10
`;
    const report = parseDoctorOutput(ansiOutput, 0);
    expect(report.categories[0].name).toBe('Python Environment');
    expect(report.categories[0].checks[0]).toEqual({
      type: 'ok',
      text: 'Python 3.12.10'
    });
  });

  it('runs doctor command via SidecarServices with correct arguments', async () => {
    const layout = resolveServiceLayout('D:/Lastbrowser/resources');
    const spawned: Array<{ command: string; args: string[]; options: any }> = [];

    const fakeProcess = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    fakeProcess.stdout = new EventEmitter();
    fakeProcess.stderr = new EventEmitter();

    const service = new SidecarServices(
      layout,
      8787,
      ((command: string, args: string[], options: any) => {
        spawned.push({ command, args, options });
        setTimeout(() => {
          fakeProcess.stdout.emit('data', Buffer.from(sampleCliDoctorOutput));
          fakeProcess.emit('close', 1);
        }, 10);
        return fakeProcess as never;
      }) as never,
      async () => 8787
    );

    const report = await service.runDoctor();

    expect(spawned).toHaveLength(1);
    expect(spawned[0].command).toBe(layout.pythonExe);
    expect(spawned[0].args).toEqual(['-m', 'sidekick_cli.main', 'doctor']);
    expect(spawned[0].options.cwd).toBe(layout.sidekickDir);
    expect(report.summary.failures).toBe(1);
    expect(report.issues).toHaveLength(2);
  });

  it('runs doctor with --fix flag when requested', async () => {
    const layout = resolveServiceLayout('D:/Lastbrowser/resources');
    const spawned: Array<{ command: string; args: string[]; options: any }> = [];

    const fakeProcess = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    fakeProcess.stdout = new EventEmitter();
    fakeProcess.stderr = new EventEmitter();

    const service = new SidecarServices(
      layout,
      8787,
      ((command: string, args: string[], options: any) => {
        spawned.push({ command, args, options });
        setTimeout(() => {
          fakeProcess.stdout.emit('data', Buffer.from('◆ System\n  ✓ Repaired\n'));
          fakeProcess.emit('close', 0);
        }, 10);
        return fakeProcess as never;
      }) as never,
      async () => 8787
    );

    const report = await service.runDoctor({ fix: true });

    expect(spawned).toHaveLength(1);
    expect(spawned[0].args).toEqual(['-m', 'sidekick_cli.main', 'doctor', '--fix']);
    expect(report.summary.passed).toBe(1);
    expect(report.summary.failures).toBe(0);
  });

  it('preserves Doctor failure markers split across UTF-8 stdout and stderr chunks', async () => {
    const layout = resolveServiceLayout('D:/Lastbrowser/resources');
    const fakeProcess = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    fakeProcess.stdout = new EventEmitter();
    fakeProcess.stderr = new EventEmitter();

    const service = new SidecarServices(
      layout,
      8787,
      (() => {
        setTimeout(() => {
          const stdout = Buffer.from('◆ Database\n  ✗ state.db corrupt\n', 'utf8');
          const markerByte = stdout.indexOf(Buffer.from('✗', 'utf8'));
          fakeProcess.stdout.emit('data', stdout.subarray(0, markerByte + 1));
          fakeProcess.stdout.emit('data', stdout.subarray(markerByte + 1));
          const stderr = Buffer.from('  ⚠ recovery pending\n', 'utf8');
          const warningByte = stderr.indexOf(Buffer.from('⚠', 'utf8'));
          fakeProcess.stderr.emit('data', stderr.subarray(0, warningByte + 2));
          fakeProcess.stderr.emit('data', stderr.subarray(warningByte + 2));
          fakeProcess.emit('close', 2);
        }, 10);
        return fakeProcess as never;
      }) as never,
      async () => 8787
    );

    const report = await service.runDoctor();
    expect(report.categories[0]).toEqual({
      name: 'Database',
      checks: [
        { type: 'fail', text: 'state.db corrupt' },
        { type: 'warn', text: 'recovery pending' }
      ],
      status: 'fail'
    });
    expect(report.summary.failures).toBe(1);
    expect(report.summary.warnings).toBe(1);
    expect(report.rawOutput).toContain('✗ state.db corrupt');
    expect(report.rawOutput).toContain('⚠ recovery pending');
  });
});
