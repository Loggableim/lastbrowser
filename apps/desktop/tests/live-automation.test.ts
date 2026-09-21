import { beforeEach, describe, expect, it } from 'vitest';
import {
  createAbortScript,
  createFormDiscoveryScript,
  createPaginationScript,
  createVisualMarkerScript,
  useLiveAutomationStore,
  type VisualAction
} from '../src/renderer/live-automation.js';
import { buildSidecarEnvironment, type ServiceLayout } from '../src/main/services.js';
import { resolveCdpPort, DEFAULT_CDP_PORT } from '../src/main/cdp.js';

describe('Live Webview CDP-Automatisierung & Visueller Assistent (Phase 10.3)', () => {
  describe('CDP port resolution and Sidekick environment coupling', () => {
    it('resolves default CDP port 9222 when no override is present', () => {
      const origEnv = process.env.LASTBROWSER_CDP_PORT;
      delete process.env.LASTBROWSER_CDP_PORT;
      delete process.env.CDP_PORT;
      expect(DEFAULT_CDP_PORT).toBe(9222);
      expect(resolveCdpPort()).toBe(9222);
      if (origEnv) process.env.LASTBROWSER_CDP_PORT = origEnv;
    });

    it('injects BROWSER_CDP_URL into Sidekick sidecar environment for direct webview attachment', () => {
      const layout: ServiceLayout = {
        resourcesDir: 'C:/resources',
        runtimeDir: 'C:/runtime',
        sidekickDir: 'C:/sidekick',
        webuiDir: 'C:/webui',
        webuiServer: 'C:/webui/server.py',
        webuiMode: 'monorepo',
        pythonExe: 'C:/runtime/python.exe',
        bridgeToken: 'test-token'
      };

      const env = buildSidecarEnvironment(layout, 8420);
      expect(env.BROWSER_CDP_URL).toBeDefined();
      expect(env.BROWSER_CDP_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(env.LASTBROWSER_CDP_PORT).toBeDefined();
    });
  });

  describe('createVisualMarkerScript', () => {
    it('generates in-page script containing action payload and visual beacon', () => {
      const action: VisualAction = {
        type: 'click',
        selector: '#submit-button',
        label: '🤖 Klickt Registrieren'
      };

      const script = createVisualMarkerScript(action);
      expect(script).toContain('lastbrowser-visual-beacon');
      expect(script).toContain('#submit-button');
      expect(script).toContain('🤖 Klickt Registrieren');
      expect(script).toContain('lbBeaconPulse');
      expect(script).toContain('pointerdown');
      expect(script).toContain('click()');
    });

    it('handles form fill actions with prototype setter and input/change events', () => {
      const action: VisualAction = {
        type: 'fill',
        selector: 'input[name="email"]',
        value: 'test@example.com',
        label: '✍️ Füllt E-Mail aus'
      };

      const script = createVisualMarkerScript(action);
      expect(script).toContain('test@example.com');
      expect(script).toContain('HTMLInputElement.prototype');
      expect(script).toContain("dispatchEvent(new Event('input'");
      expect(script).toContain("dispatchEvent(new Event('change'");
    });

    it('includes text-matching fallback when selector is omitted', () => {
      const action: VisualAction = {
        type: 'click',
        text: 'Jetzt Bestellen'
      };

      const script = createVisualMarkerScript(action);
      expect(script).toContain('Jetzt Bestellen');
      expect(script).toContain('candidates = Array.from(document.querySelectorAll');
    });
  });

  describe('createFormDiscoveryScript', () => {
    it('generates in-page discovery script for inputs, textareas, and submit buttons', () => {
      const script = createFormDiscoveryScript();
      expect(script).toContain('input:not([type="hidden"])');
      expect(script).toContain('textarea');
      expect(script).toContain('submitBtn');
      expect(script).toContain('submitButtonText');
      expect(script).toContain('fields.push');
    });
  });

  describe('createPaginationScript', () => {
    it('generates pagination detection script for common next selectors and text', () => {
      const script = createPaginationScript();
      expect(script).toContain('a[rel="next"]');
      expect(script).toContain('pagination');
      expect(script).toContain('weiter');
      expect(script).toContain('nextEl.click()');
      expect(script).toContain('lastbrowser-visual-beacon');
    });
  });

  describe('createAbortScript', () => {
    it('removes visual beacon and keyframe animations immediately', () => {
      const script = createAbortScript();
      expect(script).toContain('lastbrowser-visual-beacon');
      expect(script).toContain('lastbrowser-beacon-keyframes');
      expect(script).toContain('beacon.remove()');
    });
  });

  describe('useLiveAutomationStore', () => {
    beforeEach(() => {
      useLiveAutomationStore.setState({
        running: false,
        actionLabel: '',
        stepDescription: '',
        aborted: false,
        lastError: null,
        discoveredForm: null
      });
    });

    it('manages automation lifecycle: start, update step, finish', () => {
      const store = useLiveAutomationStore.getState();
      expect(store.running).toBe(false);

      store.startAction('Formular ausfüllen', 'Feld 1/3');
      const runningState = useLiveAutomationStore.getState();
      expect(runningState.running).toBe(true);
      expect(runningState.actionLabel).toBe('Formular ausfüllen');
      expect(runningState.stepDescription).toBe('Feld 1/3');
      expect(runningState.aborted).toBe(false);

      store.updateStep('Feld 2/3');
      expect(useLiveAutomationStore.getState().stepDescription).toBe('Feld 2/3');

      store.finishAction();
      const finishedState = useLiveAutomationStore.getState();
      expect(finishedState.running).toBe(false);
      expect(finishedState.lastError).toBeNull();
    });

    it('handles human-in-the-loop aborts correctly', () => {
      const store = useLiveAutomationStore.getState();
      store.startAction('Automatischer Klick');
      expect(useLiveAutomationStore.getState().running).toBe(true);

      store.abortAction();
      const abortedState = useLiveAutomationStore.getState();
      expect(abortedState.running).toBe(false);
      expect(abortedState.aborted).toBe(true);
      expect(abortedState.lastError).toContain('abgebrochen');
    });

    it('stores discovered form metadata', () => {
      const store = useLiveAutomationStore.getState();
      store.setDiscoveredForm({
        title: 'Registrierung',
        url: 'https://example.com/register',
        fields: [
          {
            tag: 'input',
            type: 'text',
            name: 'username',
            id: 'uname',
            placeholder: 'Benutzername',
            label: 'Name',
            currentValue: '',
            required: true,
            selector: 'input#uname'
          }
        ],
        hasSubmitButton: true,
        submitButtonText: 'Registrieren'
      });

      const form = useLiveAutomationStore.getState().discoveredForm;
      expect(form).not.toBeNull();
      expect(form?.fields).toHaveLength(1);
      expect(form?.fields[0].name).toBe('username');
      expect(form?.submitButtonText).toBe('Registrieren');
    });
  });
});
