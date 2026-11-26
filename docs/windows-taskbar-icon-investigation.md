# Windows taskbar icon investigation

Issue [#293](https://github.com/Loggableim/lastbrowser/issues/293) has an
existing [draft PR #323](https://github.com/Loggableim/lastbrowser/pull/323).
Do not duplicate or merge that draft without reviewing the current distribution
format and the requested acceptance test.

On 2026-11-26 the current source was checked against the draft:

* The application window points to the renderer's `Lastbrowser.ico`, while the
  tray searches bundled brand assets. The draft's icon-path fallback and
  `app.setAppUserModelId` changes are not present in this checkout.
* The draft unconditionally sets `com.lastbrowser.desktop`, matching the
  electron-builder app ID used by the traditional installer. The current
  Store payload is MSIX and has a separate Windows package identity. Do not
  assume that an unpackaged installer identity is correct for an MSIX process;
  verify taskbar grouping and pinning using the installed package identity.
* `build-store-payload.ps1` deliberately sets `signAndEditExecutable` to false.
  Earlier inspection of the available 0.1.62-rc2 test payload found the
  executable's 32-pixel icon matched the generic Castlabs executable rather
  than the project icon. This observation is about the executable resource,
  not proof of the icon displayed by Windows for the installed MSIX.
* The newly built local `goal-local-test-r6-20261126` payload was checked again
  using Windows `Icon.ExtractAssociatedIcon`: its rendered 32×32 icon has
  SHA-256 `FDDEE667320490169D36F7CAD21E0EA80F3EECC209B701D62F6FC73C4BD7D7D7`,
  identical to `electron.exe` from the configured Castlabs archive. Rendering
  `apps/desktop/build/icon.ico` at 32×32 produced
  `116EFADE7FA6902B54A4E11157524FD01D67D8E5754890AF581E440E495ADAE`.
  These are hashes of PNG encodings of the extracted bitmaps, not hashes of
  the original EXE or ICO files. The temporary reference executable was removed.
  The public Widevine sample played on this unpacked payload, but that does not
  establish VMP acceptance by Spotify or other services.
* The same r6 payload's `app.asar` contains both
  `dist/renderer/Lastbrowser.ico` (103,329 bytes) and
  `dist/renderer/app-icon-256.png` (65,633 bytes). Its separate resources also
  contain `brand/assets/Lastbrowser.ico` and `brand/assets/app-icon-32.png`.
  These are the configured window and preferred tray icon locations. Archive
  presence confirms packaging, not that Windows rendered either icon or that
  the installed Store package has correct taskbar grouping.
* Castlabs explains that modifying executable resources such as the icon can
  invalidate Windows VMP signing and that the unpacked application must be
  signed again after the change: [Castlabs electron-releases issue #67](https://github.com/castlabs/electron-releases/issues/67).
  Microsoft's Store signature on the MSIX is a separate step and does not by
  itself establish a valid Widevine VMP signature. The current Store builder
  can call its EVS hook with `-VmpSign` after packaging; a build that edits the
  EXE would need successful EVS signing and verification, followed by playback
  tests, before that change could be considered safe. This has not been tested.
* The MSIX manifest separately declares 44×44 and 150×150 logo assets generated
  from the project's Store artwork. Their declaration is not proof of which
  icon Windows displays for the running or pinned application.

Acceptance still requires inspecting the actual taskbar button and pinning of
the installed Store package. The issue's original signed setup and portable
acceptance also remains unverified. Any executable-resource change must be
checked against Castlabs VMP/DRM signing requirements and then tested in a
new, correctly packaged build; an icon-only code change does not prove that
protected playback still works.
