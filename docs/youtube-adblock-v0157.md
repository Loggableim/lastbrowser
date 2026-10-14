# YouTube filtering in the next Windows candidate

## Source changes

The installed Ghostery Electron SDK 2.18.2 already includes YouTube filters in its ads-and-tracking preset, including uBlock quick-fixes, unbreak exceptions and corresponding scriptlet resources. YouTube is not part of LastBrowser's DRM streaming bypass. No broad googlevideo.com block or custom page-wide ad-removal script was added.

Two integration gaps were addressed:

- The filter engine previously remained cached for seven days with no refresh during a running app. It now expires after four hours and checks hourly while the app runs. It rebuilds from the maintained SDK preset and resources before replacing the active engine. Offline refresh retains the last usable snapshot.
- Session attachment previously always yielded before registering the SDK preload, even with a loaded engine. Warm-engine attachment now registers synchronously when a Space/session is created. Startup primes the default session before creating the first window, with a maximum additional wait of 1.5 seconds. Slow first-ever downloads continue in the background; the first page may need reloading after the blocker reaches ready.

The existing user toggle remains authoritative. Cosmetic injection and observer IPC additionally check that blocking is enabled and the sender belongs to an attached session. The reported frame URL must match the injection request. Disabling does not undo scriptlets already executed in an existing page: reload that page after changing the toggle. Refresh also applies new document-start scriptlets on the next navigation/reload; it does not restart playback automatically.

Individual subscription requests have a 15-second timeout and reject unsuccessful HTTP responses. Ghostery's own bounded retry behavior is retained. No browsing URLs, credentials or cookies are sent with subscription downloads. Existing DRM streaming exceptions, browser isolation, CSP and request-policy composition remain in place.

## Practical limits

This is a source change, not proof that all YouTube ads are removed. YouTube delivery and countermeasures vary by account, region and experiment. Ghostery's Electron adapter supports its own scriptlet mechanism; this does not claim parity with every browser-extension capability. Neither playback nor the user's VM was exercised here. Argus can perform the requested VM check through Slack, including https://adblock.turtlecute.org/ and actual YouTube playback separately.

## Primary maintainer references

- [Ghostery Electron integration](https://github.com/ghostery/adblocker/blob/master/packages/adblocker-electron/README.md)
- [Maintained preset lists and scriptlet resources](https://github.com/ghostery/adblocker/blob/master/packages/adblocker/src/fetch.ts)
- [YouTube filters](https://github.com/ghostery/adblocker/blob/master/packages/adblocker/assets/ublock-origin/filters.txt)
- [Quick fixes](https://github.com/ghostery/adblocker/blob/master/packages/adblocker/assets/ublock-origin/quick-fixes.txt)
- [Electron adapter and session preloads](https://github.com/ghostery/adblocker/blob/master/packages/adblocker-electron/src/index.ts)
