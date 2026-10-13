# Terminal and per-Space Mail verification

Verified on Windows, 2026-10-03:

- 144 desktop test suites / 1253 tests pass (`npm run test:run`, the non-watch execution of npm test).
- All 27 `verify:store` checks pass; desktop main and renderer builds pass; Sidekick compileall passes.
- Four backend regression tests cover separate account configuration, encrypted persistence, disabled-space isolation and generic TLS validation.
- Real node-pty ConPTY smoke: shell output, resizing and process-exit cleanup.
- In-tree prompt_toolkit TUI runs inside the existing packaged Python, draws fullscreen ANSI output and exits with Ctrl+Q. Model chat is not end-to-end verified.
- Production Mail components were mounted in a local browser harness with the production mail handlers. Both authorized Gmail accounts authenticated through IMAP and SMTP in different test Spaces. Test mails were delivered in both directions. Received attachment bytes match the original test attachment in both directions. UI setup and sending were tested; attachment content verification used the API.

Mail credentials are encrypted in the verification runtime under `%APPDATA%/Lastbrowser/mail-verification/mail-plugin`. No credentials, mailbox exports or runtime configuration are committed. Test configurations do not automatically configure the user's existing Spaces.

## Remaining packaging verification

The current prepared desktop Python runtime lacks cryptography. It is now a required Sidekick dependency, alongside prompt_toolkit, so new runtime preparation must include it. The complete offline package has not been built or verified with these changes. The other active agent owns the pending offline wheelhouse/runtime preparation changes in the primary checkout; those uncommitted changes have not been copied into this branch. After integration, rebuild the runtime offline and verify imports of prompt_toolkit and cryptography inside the packaged artifact.

The xterm 6.0.0 and addon-fit 0.11.0 runtime sources, typings, CSS and MIT licenses are tracked in-tree. The renderer build and TUI startup need no download or external backend checkout.

Generic IMAP/SMTP configuration is regression-tested; live provider tests covered Gmail only. The live harness does not substitute for a packaged Electron end-to-end test.
