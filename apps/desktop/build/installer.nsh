; One-click pages, progress banner and automatic launch are provided by electron-builder.
; Keep upgrades and silent Store uninstallations free of interactive cleanup prompts.
!macro customInstall
  ; Launch the installed executable directly. A Start Menu shortcut may be
  ; unavailable during upgrade/cleanup or blocked by shell policy.
  StrCpy $launchLink "$appExe"
!macroend

!macro customUnInstall
  ; During an AUTO-UPDATE or SILENT UNINSTALL (/S) we must never display a MessageBox.
  ; Showing a dialog in silent mode causes Windows uninstallation / store certification to hang.
  ; ${isUpdated} is true during auto-updates (preserve data for next version).
  ; ${Silent} is true when uninstalled via msiexec/powershell/store with /S.
  ${ifNot} ${Silent}
    ${ifNot} ${isUpdated}
      MessageBox MB_YESNO|MB_ICONQUESTION "Remove Lastbrowser user data from $APPDATA\Lastbrowser? Choose No to keep browser profiles, Sidekick settings, tokens, cache, and local setup state for a future reinstall." IDNO skipUserDataCleanup
        RMDir /r "$APPDATA\Lastbrowser"
        DetailPrint "Removed Lastbrowser user data from $APPDATA\Lastbrowser"
      skipUserDataCleanup:
    ${endIf}
  ${endIf}
!macroend
