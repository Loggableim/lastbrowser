/** Bounded real-renderer chat contrast smoke. Uses localhost and a disposable profile. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

const electron = process.argv[2] || path.resolve('node_modules/electron/dist/electron.exe');
const entry = path.resolve('apps/desktop/dist/main/main.js');
const profile = mkdtempSync(path.join(os.tmpdir(), 'lastbrowser-chat-contrast-'));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
let child;
let cdp;
let fatalError = false;
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.waiting = new Map();
    this.ready = new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (!message.id || !this.waiting.has(message.id)) return;
      const { resolve, reject } = this.waiting.get(message.id);
      this.waiting.delete(message.id);
      message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result);
    };
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (!this.waiting.has(id)) return;
        this.waiting.delete(id);
        reject(Error(`CDP timeout ${method}`));
      }, 12_000);
    });
  }
  close() { this.ws.close(); }
}

async function evaluate(expression, awaitPromise = false) {
  const response = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (response.exceptionDetails) throw Error('Renderer evaluation failed.');
  return response.result.value;
}

async function waitFor(expression, expected = true, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await evaluate(expression, true)) === expected) return true; } catch {}
    await wait(200);
  }
  return false;
}

const fixtureExpression = `(() => {
  const transcript = document.querySelector('.chat-transcript');
  if (!transcript) return false;
  transcript.querySelector('.chat-contrast-fixture')?.remove();
  const host = document.createElement('div');
  host.className = 'chat-contrast-fixture';
  transcript.append(host);
  const addMessage = (role, message, withReasoning = false) => {
    const article = document.createElement('article');
    article.className = 'chat-message ' + role;
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    const body = document.createElement('div');
    body.className = 'message-body';
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const label = document.createElement('strong');
    label.textContent = role === 'user' ? 'You' : 'Sidekick';
    meta.append(label);
    const richText = document.createElement('div');
    richText.className = 'rich-text-renderer';
    richText.textContent = message;
    body.append(meta, richText);
    if (withReasoning) {
      const details = document.createElement('details');
      details.className = 'chat-reasoning-details';
      details.open = true;
      const summary = document.createElement('summary');
      summary.textContent = 'Reasoning';
      const content = document.createElement('div');
      content.className = 'chat-reasoning-content';
      const reasoning = document.createElement('div');
      reasoning.className = 'rich-text-renderer';
      reasoning.textContent = 'Reasoning stays readable in every theme.';
      content.append(reasoning);
      details.append(summary, content);
      body.append(details);
    }
    article.append(avatar, body);
    host.append(article);
    return { text: richText, body, reasoning: withReasoning ? body.querySelector('.chat-reasoning-content .rich-text-renderer') : null,
      summary: withReasoning ? body.querySelector('.chat-reasoning-details > summary') : null };
  };
  const user = addMessage('user', 'A short user message for contrast inspection.');
  const assistant = addMessage('assistant', 'A short assistant answer for contrast inspection.', true);
  const assistantLink = document.createElement('a');
  assistantLink.href = '#contrast-fixture';
  assistantLink.textContent = 'A transcript link';
  assistant.body.querySelector('.rich-text-renderer').append(assistantLink);
  const citation = document.createElement('button');
  citation.className = 'tab-citation-pill';
  citation.textContent = 'Tab 1: sample';
  citation.style.cssText = 'background:rgba(56,189,248,.15);border:1px solid rgba(56,189,248,.35);color:#38bdf8;';
  assistant.body.querySelector('.rich-text-renderer').append(citation);
  const richCode = document.createElement('div');
  richCode.className = 'rich-code-block';
  const richCodeHeader = document.createElement('div');
  richCodeHeader.className = 'rich-code-header';
  const richCodeLanguage = document.createElement('span');
  richCodeLanguage.textContent = 'text';
  const richCodeCopy = document.createElement('button');
  richCodeCopy.className = 'rich-code-copy';
  richCodeCopy.textContent = 'Copy';
  richCodeHeader.append(richCodeLanguage, richCodeCopy);
  const richCodePre = document.createElement('pre');
  const richCodeText = document.createElement('code');
  richCodeText.textContent = 'safe sample';
  richCodePre.append(richCodeText);
  richCode.append(richCodeHeader, richCodePre);
  assistant.body.append(richCode);
  const usage = document.createElement('div');
  usage.className = 'chat-turn-usage';
  usage.textContent = '12 tokens · 8 tokens/s';
  assistant.body.append(usage);
  const activity = document.createElement('details');
  activity.className = 'chat-activity-details';
  activity.open = true;
  const activitySummary = document.createElement('summary');
  activitySummary.textContent = 'Activity details';
  const activityText = document.createElement('div');
  activityText.className = 'chat-reasoning-content';
  activityText.textContent = 'A short activity detail.';
  activity.append(activitySummary, activityText);
  assistant.body.append(activity);
  const tool = document.createElement('details');
  tool.className = 'chat-tool-call-details';
  tool.open = true;
  const toolSummary = document.createElement('summary');
  toolSummary.textContent = 'Tool details';
  const toolText = document.createElement('pre');
  toolText.textContent = 'A short tool detail.';
  tool.append(toolSummary, toolText);
  assistant.body.append(tool);
  const structured = document.createElement('div');
  structured.className = 'chat-structured';
  const header = document.createElement('div');
  header.className = 'chat-structured-header';
  const heading = document.createElement('strong');
  heading.textContent = 'Structured answer';
  const headerMeta = document.createElement('span');
  headerMeta.textContent = '1 result';
  header.append(heading, headerMeta);
  const chips = document.createElement('div');
  chips.className = 'chat-chip-row';
  const chip = document.createElement('span');
  chip.textContent = 'Sample';
  chips.append(chip);
  const card = document.createElement('article');
  card.className = 'chat-result-card';
  const cardHead = document.createElement('div');
  cardHead.className = 'chat-result-card-head';
  const cardTitle = document.createElement('strong');
  cardTitle.textContent = 'Result title';
  cardHead.append(cardTitle);
  const cardText = document.createElement('p');
  cardText.textContent = 'Structured body copy for contrast inspection.';
  card.append(cardHead, cardText);
  structured.append(header, chips, card);
  assistant.body.append(structured);

  document.querySelector('.chat-contrast-copilot-fixture')?.remove();
  const copilot = document.createElement('aside');
  copilot.className = 'copilot-split-panel chat-contrast-copilot-fixture';
  copilot.style.cssText = 'position:fixed;left:-12000px;top:0;width:360px;height:800px;';
  const list = document.createElement('div');
  list.className = 'copilot-messages-list';
  const makeCopilotBubble = (role) => {
    const row = document.createElement('div');
    row.className = 'copilot-message-row ' + (role === 'user' ? 'user-row' : 'assistant-row');
    const bubble = document.createElement('div');
    bubble.className = 'copilot-bubble ' + role;
    const body = document.createElement('div');
    body.className = 'copilot-bubble-body';
    row.append(bubble);
    bubble.append(body);
    list.append(row);
    return { bubble, body };
  };
  const copilotUser = makeCopilotBubble('user');
  const copilotUserText = document.createElement('p');
  copilotUserText.className = 'copilot-text-p';
  copilotUserText.textContent = 'A Copilot user message.';
  copilotUser.body.append(copilotUserText);
  const copilotAssistant = makeCopilotBubble('assistant');
  const copilotRichText = document.createElement('div');
  copilotRichText.className = 'rich-text-renderer';
  const copilotAnswer = document.createElement('p');
  copilotAnswer.className = 'copilot-text-p';
  copilotAnswer.textContent = 'A Copilot assistant answer.';
  const copilotLink = document.createElement('a');
  copilotLink.href = '#copilot-contrast-fixture';
  copilotLink.textContent = 'A Copilot link';
  copilotRichText.append(copilotAnswer, copilotLink);
  const copilotCode = document.createElement('div');
  copilotCode.className = 'copilot-code-block';
  const codeHeader = document.createElement('div');
  codeHeader.className = 'copilot-code-header';
  const codeLabel = document.createElement('span');
  codeLabel.className = 'copilot-code-lang';
  codeLabel.textContent = 'text';
  const codeCopy = document.createElement('button');
  codeCopy.className = 'copilot-code-copy-btn';
  codeCopy.textContent = 'Copy';
  codeHeader.append(codeLabel, codeCopy);
  const codePre = document.createElement('pre');
  codePre.className = 'copilot-code-content';
  const code = document.createElement('code');
  code.textContent = 'safe sample';
  codePre.append(code);
  copilotCode.append(codeHeader, codePre);
  copilotAssistant.body.append(copilotRichText, copilotCode);
  copilot.append(list);
  document.body.append(copilot);
  return Boolean(user.text && assistant.text && assistant.reasoning && assistant.summary && copilotUserText && copilotAnswer);
})()`;

const measureExpression = `(() => {
  const parse = (value) => {
    const match = String(value).match(/rgba?\\(([^)]+)\\)/i);
    if (!match) return null;
    const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
    return parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)
      ? [parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1]
      : null;
  };
  const blend = (front, back) => {
    const alpha = front[3];
    return [0, 1, 2].map((index) => front[index] * alpha + back[index] * (1 - alpha)).concat(1);
  };
  const effectiveBackground = (element) => {
    const chain = [];
    for (let node = element; node && node instanceof Element; node = node.parentElement) chain.push(node);
    let color = [255, 255, 255, 1];
    for (const node of chain.reverse()) {
      const background = parse(getComputedStyle(node).backgroundColor);
      if (background && background[3] > 0) color = blend(background, color);
    }
    return color;
  };
  const luminance = (color) => {
    const values = color.slice(0, 3).map((part) => {
      const channel = part / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
  };
  const contrast = (foreground, background) => {
    const fg = foreground[3] < 1 ? blend(foreground, background) : foreground;
    const a = luminance(fg);
    const b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const inspect = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const foreground = parse(getComputedStyle(element).color);
    const background = effectiveBackground(element);
    if (!foreground) return null;
    return {
      ratio: Number(contrast(foreground, background).toFixed(2)),
      foreground: getComputedStyle(element).color,
      background: 'rgb(' + background.slice(0, 3).map(Math.round).join(', ') + ')',
      fontSize: getComputedStyle(element).fontSize
    };
  };
  return {
    theme: document.documentElement.dataset.theme,
    mode: document.documentElement.dataset.themeMode,
    layout: document.documentElement.dataset.messageLayout,
    fontSetting: document.documentElement.dataset.fontSize,
    user: inspect('.chat-contrast-fixture .chat-message.user .rich-text-renderer'),
    assistant: inspect('.chat-contrast-fixture .chat-message.assistant .message-body > .rich-text-renderer'),
    reasoning: inspect('.chat-contrast-fixture .chat-message.assistant .chat-reasoning-content .rich-text-renderer'),
    reasoningSummary: inspect('.chat-contrast-fixture .chat-message.assistant .chat-reasoning-details > summary'),
    structuredHeader: inspect('.chat-contrast-fixture .chat-structured-header strong'),
    structuredChip: inspect('.chat-contrast-fixture .chat-chip-row span'),
    structuredCardText: inspect('.chat-contrast-fixture .chat-result-card p'),
    nativeLink: inspect('.chat-contrast-fixture .chat-message.assistant .rich-text-renderer a'),
    nativeCitation: inspect('.chat-contrast-fixture .tab-citation-pill'),
    nativeCodeHeader: inspect('.chat-contrast-fixture .rich-code-header'),
    nativeCodeLanguage: inspect('.chat-contrast-fixture .rich-code-header span'),
    nativeCodeCopy: inspect('.chat-contrast-fixture .rich-code-copy'),
    nativeCode: inspect('.chat-contrast-fixture .rich-code-block code'),
    usage: inspect('.chat-contrast-fixture .chat-turn-usage'),
    activitySummary: inspect('.chat-contrast-fixture .chat-activity-details > summary'),
    activityText: inspect('.chat-contrast-fixture .chat-activity-details .chat-reasoning-content'),
    toolSummary: inspect('.chat-contrast-fixture .chat-tool-call-details > summary'),
    toolText: inspect('.chat-contrast-fixture .chat-tool-call-details pre'),
    copilotUser: inspect('.chat-contrast-copilot-fixture .copilot-bubble.user .copilot-text-p'),
    copilotAssistant: inspect('.chat-contrast-copilot-fixture .copilot-bubble.assistant .copilot-text-p'),
    copilotLink: inspect('.chat-contrast-copilot-fixture .copilot-bubble.assistant .rich-text-renderer a'),
    copilotCodeLabel: inspect('.chat-contrast-copilot-fixture .copilot-code-lang'),
    copilotCodeCopy: inspect('.chat-contrast-copilot-fixture .copilot-code-copy-btn'),
    copilotCode: inspect('.chat-contrast-copilot-fixture .copilot-code-content')
  };
})()`;

async function clickSettings() {
  const clicked = await evaluate(`(() => {
    const re = /^(settings|einstellungen|configuraci[oó]n|param[eè]tres|impostazioni|configura[cç][aã]o|настройки)$/i;
    const button = [...document.querySelectorAll('.nova-dock-btn,.footer-link-btn')]
      .find((element) => re.test((element.getAttribute('aria-label') || element.innerText || '').trim()));
    button?.click();
    return Boolean(button);
  })()`);
  return clicked && await waitFor(`Boolean(document.querySelector('.app-shell.panel-settings'))`);
}

async function clickAppearance() {
  const clicked = await evaluate(`(() => { const button = document.querySelectorAll('.settings-section-button')[1]; button?.click(); return Boolean(button); })()`);
  return clicked && await waitFor(`Boolean(document.querySelector('.settings-theme-grid'))`);
}

async function saveTheme(theme) {
  const clicked = await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('.settings-theme-grid .settings-theme-btn')];
    const index = { dark: 0, light: 1, oled: 2, system: 3 }['${theme}'];
    const target = buttons.find((button) => (button.innerText || '').toLowerCase().includes('${theme}')) || buttons[index];
    target?.click();
    return Boolean(target);
  })()`);
  if (!clicked) return false;
  const live = theme === 'system'
    ? await waitFor(`document.documentElement.dataset.themeMode === 'system'`)
    : await waitFor(`document.documentElement.dataset.theme === '${theme}'`);
  const stored = await waitFor(`localStorage.getItem('lastbrowser.theme') === '${theme}'`, true, 10_000);
  const persisted = await waitFor(`(async () => {
    try {
      const result = await window.lastbrowser.sidekick.getSettings();
      const settings = result?.settings || result || {};
      return settings.theme === '${theme}';
    } catch { return false; }
  })()`, true, 10_000);
  return live && stored && persisted;
}

async function setSystemPreference(preference) {
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: preference }]
  });
  return true;
}

async function saveXlargeFont() {
  const clicked = await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('.settings-size-grid .settings-size-btn')];
    buttons[3]?.click();
    return Boolean(buttons[3]);
  })()`);
  if (!clicked) return false;
  return await waitFor(`document.documentElement.dataset.fontSize === 'xlarge'`)
    && await waitFor(`localStorage.getItem('lastbrowser.font_size') === 'xlarge'`, true, 10_000)
    && await waitFor(`(async () => {
      try {
        const result = await window.lastbrowser.sidekick.getSettings();
        const settings = result?.settings || result || {};
        return settings.font_size === 'xlarge';
      } catch { return false; }
    })()`, true, 10_000);
}

async function openChat() {
  const clicked = await evaluate(`(() => {
    const button = document.querySelector('[data-testid="nova-dock-chat"]');
    button?.click();
    return Boolean(button);
  })()`);
  return clicked && await waitFor(`Boolean(document.querySelector('.chat-transcript'))`);
}

try {
  if (!existsSync(electron) || !existsSync(entry)) throw Error('Build Electron or dist/main/main.js missing; build the desktop first.');
  const port = await freePort();
  const launchArgs = [
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    ...(path.basename(electron).toLowerCase() === 'electron.exe' ? [entry] : [])
  ];
  child = spawn(electron, launchArgs, {
    detached: true,
    stdio: process.env.LASTBROWSER_SMOKE_LOG === '1' ? 'inherit' : 'ignore',
    windowsHide: true
  });
  let target;
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((item) => item.type === 'page' && /index\.html/.test(item.url));
      if (target) break;
    } catch {}
    await wait(250);
  }
  if (!target) throw Error('No local Electron renderer target became ready.');
  cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  check('real renderer shell mounts', await waitFor(`Boolean(document.querySelector('.shell-rail, .sidekick-sidebar'))`));

  await evaluate(`(() => {
    const dismiss = [...document.querySelectorAll('button')].find((button) => /erstmal ohne|ohne ki|dismiss|skip/i.test(button.innerText || ''));
    dismiss?.click();
    return Boolean(dismiss);
  })()`);
  check('Chat panel opens in the built renderer', await openChat());
  check('Appearance settings open through the built UI', await clickSettings() && await clickAppearance());
  check('large font setting is saved through the UI', await saveXlargeFont());

  const themeCases = [
    { setting: 'dark', resolved: 'dark' },
    { setting: 'light', resolved: 'light' },
    { setting: 'oled', resolved: 'oled' },
    { setting: 'system', resolved: 'light', preference: 'light' },
    { setting: 'system', resolved: 'dark', preference: 'dark' }
  ];
  for (let caseIndex = 0; caseIndex < themeCases.length; caseIndex++) {
    const themeCase = themeCases[caseIndex];
    const { setting, resolved, preference } = themeCase;
    const label = setting === 'system' ? `system/${resolved}` : setting;
    if (preference && !(await setSystemPreference(preference))) {
      check(`${label} system preference resolves`, false);
      continue;
    }
    if (!(await saveTheme(setting))) {
      check(`${label} theme is saved`, false, 'UI theme preview, local preference, or backend setting did not converge');
      continue;
    }
    check(`${label} theme is saved in settings`, true);
    check(`${label} theme returns to Chat`, await openChat());
    const fixtureReady = await evaluate(fixtureExpression);
    check(`${label} native and Copilot production-shaped fixtures mount`, fixtureReady);
    const resolvedTheme = await waitFor(`document.documentElement.dataset.theme === '${resolved}'`);
    check(`${label} resolves to ${resolved}`, resolvedTheme);

    for (const layout of ['bubbles', 'compact', 'expanded']) {
      await evaluate(`(() => { document.documentElement.dataset.messageLayout = '${layout}'; return true; })()`);
      const layoutReady = await waitFor(`document.documentElement.dataset.messageLayout === '${layout}'`);
      const measurements = await evaluate(measureExpression);
      const contrastKeys = [
        'user', 'assistant', 'reasoning', 'reasoningSummary', 'structuredHeader', 'structuredChip',
        'structuredCardText', 'nativeLink', 'nativeCitation', 'nativeCodeHeader', 'nativeCodeLanguage',
        'nativeCodeCopy', 'nativeCode', 'usage',
        'activitySummary', 'activityText', 'toolSummary', 'toolText', 'copilotUser', 'copilotAssistant', 'copilotLink',
        'copilotCodeLabel', 'copilotCodeCopy', 'copilotCode'
      ];
      const contrastItems = contrastKeys.map((key) => [key, measurements?.[key]]);
      const bad = contrastItems.filter(([, value]) => !value || value.ratio < 4.5);
      const contrastPass = layoutReady
        && measurements?.theme === resolved
        && measurements?.mode === setting
        && measurements?.layout === layout
        && measurements?.fontSetting === 'xlarge'
        && bad.length === 0;
      const finiteRatios = contrastItems.map(([, value]) => value?.ratio).filter(Number.isFinite);
      const minimum = finiteRatios.length ? Math.min(...finiteRatios).toFixed(2) : 'none';
      check(`${label}/${layout} native and Copilot text surfaces >=4.5:1`, contrastPass,
        `min=${minimum}${bad.length ? ` failures=${bad.map(([key, value]) => `${key}:${value?.ratio ?? 'missing'}`).join(',')}` : ''}`);
      const largeFontPass = measurements?.user?.fontSize === '18px'
        && measurements?.assistant?.fontSize === '18px'
        && measurements?.copilotUser?.fontSize === '18px'
        && measurements?.copilotAssistant?.fontSize === '18px';
      check(`${label}/${layout} retains xlarge transcript font`, largeFontPass);
    }
    if (caseIndex + 1 < themeCases.length) check(`${label} Settings reopens`, await clickSettings() && await clickAppearance());
  }
  cdp.close();
} catch (error) {
  fatalError = true;
  console.error('FATAL', error?.stack || error);
} finally {
  if (child?.pid) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  const tempRoot = path.resolve(os.tmpdir());
  const resolvedProfile = path.resolve(profile);
  if (path.dirname(resolvedProfile) === tempRoot && path.basename(resolvedProfile).startsWith('lastbrowser-chat-contrast-')) {
    try { rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  }
}
const passed = results.filter((result) => result.ok).length;
console.log(`Result: ${passed}/${results.length} checks passed`);
process.exitCode = !fatalError && passed === results.length && results.length > 0 ? 0 : 1;
