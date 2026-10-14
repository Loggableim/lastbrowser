import { randomUUID } from 'node:crypto';
import { BrowserWindow, dialog, type ContextMenuParams, type MenuItemConstructorOptions, type Session, type WebContents } from 'electron';
import type { PasswordVault } from './password-vault.js';
type Options = {
  vault: PasswordVault;
  authorize: () => Promise<() => void>;
  profileForSession: (session: Session) => Promise<string | null>;
  isHumanGuest: (guest: WebContents) => boolean;
  locale: () => string;
};
/** Native user gesture only: no secret-reading renderer IPC and no agent-browser filling. */
export function passwordContextMenu(options: Options) {
  const navigations = new WeakMap<WebContents, { epoch: number }>();
  return async (contents: WebContents, params: ContextMenuParams): Promise<MenuItemConstructorOptions[]> => {
    try {
      if (contents.isDestroyed() || contents.getType() !== 'webview' || !contents.isFocused() || !params.isEditable || !options.isHumanGuest(contents)) return [];
      const owner = contents.hostWebContents;
      const ownerWindow = owner ? BrowserWindow.fromWebContents(owner) : null;
      if (!owner || !ownerWindow || ownerWindow.isDestroyed() || !ownerWindow.isVisible() || !ownerWindow.isFocused()) return [];
      const frame = contents.mainFrame;
      if (!params.frame || params.frame !== frame || params.frame.routingId !== frame.routingId || params.frame.processId !== frame.processId) return [];
      const url = contents.getURL(), parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || frame.url !== url) return [];
      let navigation = navigations.get(contents);
      if (!navigation) { navigation = { epoch: 0 }; navigations.set(contents, navigation); contents.on('did-start-navigation', () => { navigation!.epoch++; }); }
      const epoch = navigation.epoch, targetSession = contents.session;
      const checkPage = () => {
        if (contents.isDestroyed() || contents.getType() !== 'webview' || contents.hostWebContents !== owner || ownerWindow.isDestroyed() || !ownerWindow.isVisible() || !ownerWindow.isFocused() || contents.session !== targetSession || navigation!.epoch !== epoch
          || contents.mainFrame !== frame || frame.isDestroyed() || frame.url !== url || contents.getURL() !== url || !options.isHumanGuest(contents)) throw new Error('Page changed.');
      };
      // Isolated-world document proof: a same-URL reload has a fresh global and cannot inherit this nonce.
      const documentNonce = randomUUID();
      const proof = await contents.executeJavaScriptInIsolatedWorld(1002, [{ code: `(() => {
        if (window !== window.top || location.origin !== ${JSON.stringify(parsed.origin)} || location.href !== ${JSON.stringify(url)}) return null;
        Object.defineProperty(globalThis, '__lastbrowserPasswordDocument', { value: ${JSON.stringify(documentNonce)}, configurable: true });
        return { timeOrigin: performance.timeOrigin };
      })()` }]);
      checkPage();
      if (!proof || !Number.isFinite(proof.timeOrigin)) return [];
      const documentTimeOrigin = proof.timeOrigin;
      const checkAuth = await options.authorize(); checkPage(); checkAuth();
      const profile = await options.profileForSession(targetSession); checkPage(); checkAuth();
      if (!profile || !options.vault.available()) return [];
      const metadata = await options.vault.list(profile); checkPage(); checkAuth();
      const matching = metadata.entries.filter(entry => entry.origin === parsed.origin).slice(0, 30);
      if (!matching.length) return [];
      const de = options.locale().startsWith('de');
      return [{ type: 'separator' }, { label: de ? 'Gespeichertes Passwort ausfüllen' : 'Fill saved password', submenu: matching.map(entry => ({
        label: entry.username || (de ? '(ohne Benutzername)' : '(no username)'),
        click: () => { void (async () => {
          checkPage(); checkAuth();
          const checkFreshAuth = await options.authorize(); checkPage(); checkAuth(); checkFreshAuth();
          if (await options.profileForSession(targetSession) !== profile) throw new Error('Profile changed.');
          checkPage(); checkAuth(); checkFreshAuth();
          await options.vault.fillCredential(profile, entry.id, parsed.origin, async credential => {
            const checkFinalAuth = await options.authorize(); checkPage(); checkAuth(); checkFinalAuth();
            // Only Main receives the credential. It is delivered directly to the explicitly selected top-level HTTPS page.
            const payload = JSON.stringify({ origin: parsed.origin, url, username: credential.username, password: credential.password });
            // Main checks and dispatch are synchronous in this turn. The isolated-world proof
            // is checked before credentials are bound or DOM fields are touched in the target document.
            const filled = await contents.executeJavaScriptInIsolatedWorld(1002, [{ code: `(() => {
              if (globalThis.__lastbrowserPasswordDocument !== ${JSON.stringify(documentNonce)} || performance.timeOrigin !== ${JSON.stringify(documentTimeOrigin)}
                || window !== window.top || document.visibilityState !== 'visible' || location.origin !== ${JSON.stringify(parsed.origin)} || location.href !== ${JSON.stringify(url)}) return false;
              const data = ${payload};
              const visible = element => { const rect = element.getBoundingClientRect(), css = getComputedStyle(element); return !element.disabled && !element.readOnly && !element.closest('[inert],[hidden],[aria-hidden="true"]') && element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth && css.visibility !== 'hidden' && css.display !== 'none' && css.opacity !== '0'; };
              const candidates = [...document.querySelectorAll('input[type="password"]')].filter(element => visible(element) && !element.autocomplete.toLowerCase().split(/\\s+/).includes('new-password') && !/(new|confirm|repeat)[-_ ]?(pass(word)?|pwd)/i.test(element.name+' '+element.id));
              const active = document.activeElement;
              const chosen = candidates.includes(active) ? active : candidates.filter(element => !element.form || new URL(element.form.action || location.href, location.href).origin === data.origin);
              const passwordField = chosen instanceof HTMLInputElement ? chosen : chosen.length === 1 ? chosen[0] : null;
              if (!passwordField || passwordField.form && new URL(passwordField.form.action || location.href, location.href).origin !== data.origin) return false;
              const container = passwordField.form || document;
              const users = [...container.querySelectorAll('input')].filter(element => visible(element) && ['text','email','tel'].includes(element.type) && element.autocomplete !== 'new-password');
              const usernameField = users.find(element => element.autocomplete === 'username') || (users.length === 1 ? users[0] : null);
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
              if (usernameField) { setter.call(usernameField,data.username); usernameField.dispatchEvent(new Event('input',{bubbles:true})); usernameField.dispatchEvent(new Event('change',{bubbles:true})); }
              if (!passwordField.isConnected || !visible(passwordField) || location.origin !== data.origin || location.href !== data.url || passwordField.form && new URL(passwordField.form.action || location.href, location.href).origin !== data.origin) return false;
              setter.call(passwordField,data.password); passwordField.dispatchEvent(new Event('input',{bubbles:true})); passwordField.dispatchEvent(new Event('change',{bubbles:true}));
              return true;
            })()` }], true);
            if (!filled) throw new Error('No unambiguous login field.');
          });
        })().catch(() => dialog.showErrorBox(de ? 'Passwort nicht ausgefüllt' : 'Password was not filled',
          de ? 'Die Seite oder Anmeldung hat sich geändert, oder es gibt kein eindeutiges sichtbares Anmeldefeld. Bitte erneut anmelden, die HTTPS-Anmeldeseite öffnen und das Kontextmenü erneut verwenden.'
            : 'The page or authentication changed, or no unambiguous visible login field exists. Sign in again, open the HTTPS login page and use its context menu again.')); }
      })) }];
    } catch { return []; }
  };
}
