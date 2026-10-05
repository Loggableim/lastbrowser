# Native Windows UI acceptance, 2026-10-05

Root used the Computer Use skill and the existing Castlabs Electron installation to operate the real desktop window. The user explicitly authorized host testing; no VM is required for these normal application flows. This is a source-build observation, not a final packaged/clean-Windows acceptance.

## Owned test launch

The first restricted-tool launch failed before the UI could run. `output/root-host-ui-20261005/stderr.log` records Chromium's `platform_channel.cc:89` fatal check with Windows access denied (`0x5`). The reported `electron.exe` and `crashpad_handler.exe` exception dialogs belong to this failed launch. This evidence does not establish an application-code crash cause.

The reviewed host launch used the same existing Electron executable, an independent user-data/runtime/downloads directory, no inherited provider secret environment variables, and no `--no-sandbox` switch. It succeeded. The owned Main PID at launch was 53928; the actual window was returned by the native API as Lastbrowser. Treat these identifiers as historical observations, not reusable process authority.

Logs and launch receipt are under `output/root-host-ui-unrestricted-20261005/`. This profile remains separate from the user's ordinary Lastbrowser profile. The UI discovered a legacy Sidekick installation, but Root did not import it, log in, invoke a real provider, install an extension, change permissions, clear data or set a default browser.

## Observed flows

| Flow | Native observation | Remaining limitation |
|---|---|---|
| Launch | Real Lastbrowser window and bundled Python backend reached Uvicorn ready after an initial connection-refused interval. | Source build, not Setup/Portable. |
| Hardware button | A real click refreshed the CPU, free RAM and disk result and its timestamp; Ryzen 5950X and Intel Arc A770 were reported. GPU budget remained explicitly unknown. | Hardware detection does not qualify inference or a GPU backend. |
| Background router files | First-launch panel displayed verified router files and exact progress completion. | No inference readiness or routing quality inferred. |
| Settings / Plugins | Native clicks opened settings and the plugin catalogue without `Cannot convert undefined or null to object` or a panel crash. | No extension was installed; catalogue strings still include English copy in the German UI. |
| Languages | The actual dropdown contained System/Auto and all eight UI languages. After fresh state capture and a real Japanese selection, settings/sidebar/status labels immediately changed to Japanese and the select displayed 日本語. | Separate backend settings save and process-restart persistence were not completed. |
| Space Assistant startup | The panel remained empty/stale with “Live-Daten nicht verfügbar” and the generic independent-request error after backend readiness. Preferences also showed an unbound backend profile. | Reproduced defect; a scoped recovery fix is assigned to `security_acceptance`. |

The native accessibility click on the compact sidebar selected the adjacent help action once; Root corrected it using fresh screenshot coordinates. No private data was transmitted. Subsequent manual user input changed the window geometry; stale coordinates were discarded.

## Next acceptance

Rebuild after the Local-AI and Assistant recovery changes freeze. Repeat initial startup without any Space switch, simple local setup, Japanese language save/reload, settings/plugins and quickchat in a fresh owned profile. Then run the same critical flows against the source-identical final package. Host execution cannot establish clean-Windows dependency closure; the preserved VirtualBox `poker` snapshot remains available separately if needed.
