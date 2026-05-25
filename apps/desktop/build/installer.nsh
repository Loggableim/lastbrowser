!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Install lastbrowser"
  !define MUI_WELCOMEPAGE_TEXT "Lastbrowser is an AI-native browser runtime for Windows.$\r$\n$\r$\nThe installer includes the local Sidekick runtime. After installation, Lastbrowser opens quickly and finishes Sidekick setup in the browser while you can already use tabs and the address bar."
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
  !define MUI_FINISHPAGE_TEXT "Open Lastbrowser to connect your cloud provider. The browser starts immediately while Sidekick prepares the local runtime in the background."
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "Remove Lastbrowser user data from $APPDATA\Lastbrowser? Choose No to keep browser profiles, Sidekick settings, tokens, cache, and local setup state for a future reinstall." IDNO skipUserDataCleanup
    RMDir /r "$APPDATA\Lastbrowser"
    DetailPrint "Removed Lastbrowser user data from $APPDATA\Lastbrowser"
  skipUserDataCleanup:
!macroend
