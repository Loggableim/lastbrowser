# Space Assistant: simple everyday UX

## Scope and intent

Renderer-only UX pass for `SpaceAssistantPanel` and `IndependentConnections`. The ordinary panel prioritizes the conversation, three optional quick actions, and a compact live/stale activity summary. Connection setup, permissions, task definitions, profile reset, provider diagnostics, origins, adapter state, and the full provider catalog are only mounted or shown after explicit disclosure. No `App.tsx`, Main, LocalAI, or Teamwork files were changed.

## Implemented behavior

- A missing snapshot is shown as “starting” or unavailable activity, not as a missing model. The activity count is `—` until real activity data arrives. A model-setup CTA appears only after an authoritative snapshot says `providerReady: false`.
- The Assistant does not automatically start an interview when loading a new or existing Space. Setup is optional and starts only from the explicit setup button. The setup panel is collapsed on ordinary entry; the `beginSetup` route remains an explicit new-Space entry point.
- Opening setup is the first point that mounts `IndependentConnections` and reads the capability catalog, bindings, and browser permissions. A normal panel entry performs no such catalog/permission reads.
- The everyday connection view shows configured/connected profiles, current binding/revoke state, safe URL-only browser plugins, and a provider chooser. It does not render all unconfigured provider cards. Selecting one provider reveals that provider’s setup action. Full capability/adapter/authentication/binding diagnostics stay in the collapsed connection-details disclosure.
- The existing `UrlOnlyPluginBrowserAccess` guard and callback were preserved. Its button is rendered only for a safe HTTP(S) URL on a restricted, taskless `plugin:` connector and keeps the explicit “browser, not API” copy. No API connection, adapter, task, or permission is inferred.
- Permission editing, reset and task-definition controls are behind explicit Advanced. No right is auto-granted. Pending approvals and clarification questions automatically reveal the activity section; actual stale/partial status notices remain visible.
- Scope switching, request identity, cancellation, late-result guards, and the App-owned plugin-browser revalidation path were left unchanged.

## Selectors for the source-App probe

- Open setup: `[data-testid="space-assistant-setup"] > summary`
- Start interview explicitly: `[data-testid="space-assistant-start-interview"]`
- Choose another provider: `[data-testid="space-assistant-provider-select"]`; setup action: `[data-testid="space-assistant-connect-provider"]`
- Browser-only plugin: `[data-testid="space-assistant-browser-access"]`
- Compact activity/status: `[data-testid="space-assistant-compact-activity"]`; detailed activity: `[data-testid="space-assistant-activity"]`
- Advanced permissions/definitions/reset: `[data-testid="space-assistant-advanced"]`
- Full connection diagnostics: `[data-testid="space-assistant-connection-details"]`

The old `.space-assistant-tabs` selector is not part of this UI. After reload, open the setup disclosure before waiting for `.space-interview`; the interview no longer starts during the initial status load.

## Verification

Passed targeted checks:

- `npm --workspace apps/desktop run test:run -- tests/independent-assistant.test.ts tests/root-url-only-plugin.test.ts tests/i18n.test.ts` — 3 files, 57 tests passed.
- `npm --workspace apps/desktop run typecheck:renderer` — passed on the latest shared source state.
- `node apps/desktop/tests/settings-plugins-renderer-smoke.cjs` — valid, invalid, and empty fixtures passed; no boundary or renderer errors.
- `node apps/desktop/tests/assistant-mode-switch-visual-smoke.cjs` — actual `SpaceAssistantPanel` mounted in isolated Electron; conversation, three quick actions, no initial provider/permission reads, 30 controlled unconfigured-provider choices, only the chosen provider card, closed advanced disclosures, browser-only callback semantics, 320px DE/JA panel overflow checks, and mode-switch/held-turn retention passed. Controlled transport; this is a real renderer-panel mount, not a Main/Python or full-App assertion.
- The Electron run captured four panel PNGs (390px/320px, DE/JA) in `output/space-assistant-ui-1791175477729-143200/`. The temporary Electron `userData` profile was isolated and cleaned. No credentials or real provider profiles were supplied.
- Independent source-App evidence from the root agent: `node scripts/probe-full-app-entry.cjs --interview --plugin-browser` passed with 5 controlled calls, 3 reloads, no dialogs/orphans, cleanup confirmed (`output/full-app-entry-fe145051-1675-46fe-b94f-2d00ba604a0f.json`). This report does not contain the four PNGs above; those are component-level Electron captures.

Not green / not checked:

- `npm --workspace apps/desktop run test:run -- tests/japanese-catalog.test.ts` — 1 test passed, 2 failed because Japanese overrides are missing concurrent `teamwork.*` keys and the catalog loop encounters an undefined value (`tests/japanese-catalog.test.ts:32,36`). Teamwork files were left untouched.
- Full packaged application, provider login, external services, and a screenshot of the full production App window were not exercised by this renderer-panel fixture.
