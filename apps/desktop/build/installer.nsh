!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Install LastBrowser"
  !define MUI_WELCOMEPAGE_TEXT "LastBrowser in wenigen Augenblicken installieren.$\r$\n$\r$\nDer Browser ist sofort bereit. Optionale KI-Funktionen kannst du später in den Einstellungen verbinden."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFinishPage
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !endif

  !define MUI_FINISHPAGE_TITLE "LastBrowser is ready"
  !define MUI_FINISHPAGE_TEXT "LastBrowser ist installiert und startklar. Optionale KI-Anbieter kannst du jederzeit in den Einstellungen verbinden."
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customUnInstall
  ; During an AUTO-UPDATE or SILENT UNINSTALL (/S) we must never display a MessageBox.
  ; Showing a dialog in silent mode causes Windows uninstallation / store certification to hang.
  ; ${isUpdated} is true during auto-updates (preserve data for next version).
  ; ${Silent} is true when uninstalled via msiexec/powershell/store with /S.
  ${ifNot} ${Silent}
    ${ifNot} ${isUpdated}
      MessageBox MB_YESNO|MB_ICONQUESTION "Remove LastBrowser user data from $APPDATA\Lastbrowser? Choose No to keep browser profiles, Sidekick settings, tokens, cache, and local setup state for a future reinstall." IDNO skipUserDataCleanup
        RMDir /r "$APPDATA\Lastbrowser"
        DetailPrint "Removed LastBrowser user data from $APPDATA\Lastbrowser"
      skipUserDataCleanup:
    ${endIf}
  ${endIf}
!macroend
