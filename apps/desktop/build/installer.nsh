!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Install Lastbrowser"
  !define MUI_WELCOMEPAGE_TEXT "Lastbrowser is an AI-native browser runtime for Windows.$\r$\n$\r$\nThe installer bundles the local Sidekick runtime and uses the branded browser-first setup flow. You can start browsing immediately while Sidekick finishes in the background."
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

  !define MUI_FINISHPAGE_TITLE "Lastbrowser is ready"
  !define MUI_FINISHPAGE_TEXT "Open Lastbrowser to connect your cloud provider. The browser starts immediately while Sidekick prepares the runtime in the background."
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customUnInstall
  ; During an AUTO-UPDATE the old version is uninstalled first. A MessageBox here
  ; blocks that path completely — it ignores /S and waits for a click forever,
  ; which is why auto-updates hung on "Deinstallation von Lastbrowser".
  ; ${isUpdated} is true when the uninstaller runs as part of an update, so the
  ; prompt is skipped there and user data is always kept (an update must never
  ; delete profiles or tokens).
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION "Remove Lastbrowser user data from $APPDATA\Lastbrowser? Choose No to keep browser profiles, Sidekick settings, tokens, cache, and local setup state for a future reinstall." IDNO skipUserDataCleanup
      RMDir /r "$APPDATA\Lastbrowser"
      DetailPrint "Removed Lastbrowser user data from $APPDATA\Lastbrowser"
    skipUserDataCleanup:
  ${endIf}
!macroend
