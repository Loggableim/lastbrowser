# Browser updates and one-click installation

Lastbrowser's NSIS/EXE installation checks for stable releases six seconds after
startup and every four hours afterward. Checks and background downloads are always
enabled, independent of Sidekick settings or availability. Old
`check_for_updates: false` values and legacy disable IPC requests no longer stop
updates. Prereleases require the existing explicit development override.

The first startup check may display an update notice. “Do not show again” stores
only `lastbrowser.updates.hideStartupNotice` in renderer local storage. It does not
disable checks, downloads, or the toolbar icon. The toolbar icon appears only once
the download is complete. Clicking it opens a menu; choosing restart installs
silently and relaunches the browser. Normal closing does not install updates.
Pending downloads and completed packages are not overwritten by repeat checks.

The restart action is disabled while the visible AI task is running. The main
process also asks before terminating tracked agent workspace streams or open
terminals. Terminal processes cannot survive the restart. Existing profile/space
tab persistence supplies session restoration; this does not restore unsaved page
forms or terminal process state.

The first installation uses electron-builder's NSIS one-click progress banner
with the tracked Lastbrowser icon. It launches the installed EXE directly rather
than relying on the Start Menu shortcut. There are no welcome, folder-selection, or
finish pages. It installs per user, opens the app afterward, and bundles the
in-tree backend/runtime. `/S` remains supported and never launches the app unless
the updater explicitly supplies the force-run option. Existing install locations
for existing per-user installations are retained by electron-builder. Windows may still display its
own security or elevation prompts.

Both package.json and build/lastbrowser-builder-config.yml use the same NSIS
settings. The old bitmap wizard artwork and its external asset-folder generator
are removed. This is the stock modern NSIS progress banner, not a custom Chrome
installer clone.

## Distribution and verification

Microsoft explicitly permits in-app updates for Store-listed MSI/EXE apps:
https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/publish-update-to-your-app-on-store
New versions should also be submitted in Partner Center. Release installers and
executables must retain trusted signing. GitHub release assets and latest.yml
must be published together, with versioned installer URLs.

Store-packaged Electron builds (`process.windowsStore`) use Store updates;
portable executables must be replaced with a new portable download. The NSIS
updater is disabled for these distribution modes.

The release acceptance check needs two signed installed versions: download the
new version through the real feed, verify the ready icon, restart, check the new
version and restored tabs, then verify handling of active terminals. Unsigned
isolated NSIS smoke tests do not establish signature validation, successful
Store certification, or that complete production update flow.
