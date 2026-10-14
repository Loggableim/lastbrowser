!include "WinMessages.nsh"
!include "nsDialogs.nsh"

!define MUI_BGCOLOR "F7F9FC"
!define MUI_TEXTCOLOR "152238"
!define MUI_INSTFILESPAGE_COLORS "152238 F7F9FC"
!define MUI_INSTFILESPAGE_PROGRESSBAR "colored"

!define LB_INSTALL_NOVA_ID 5741
!define LB_INSTALL_EYEBROW_ID 5742
!define LB_INSTALL_HEADLINE_ID 5743
!define LB_INSTALL_DESCRIPTION_ID 5744
!define LB_INSTALL_PRIVACY_ID 5745

Var LastBrowserInstallNovaBitmap
Var LastBrowserInstallEyebrowFont
Var LastBrowserInstallHeadlineFont
Var LastBrowserInstallDescriptionFont
Var LastBrowserInstallPrivacyFont
Var LastBrowserInstallPageStyled
Var LastBrowserInstallDialog
Var LastBrowserInstallText
Var LastBrowserInstallProgressBar
Var LastBrowserInstallShowLogButton
Var LastBrowserInstallLog

!macro LB_CREATE_CENTERED_LABEL ID TEXT FONT_VAR FONT_SIZE FONT_WEIGHT COLOR
  GetDlgItem $0 $LastBrowserInstallDialog ${ID}
  ${If} $0 == 0
    System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "${TEXT}", i 0x50000001, i 0, i 0, i 10, i 10, p $LastBrowserInstallDialog, p ${ID}, p 0, p 0) p .r0'
    SetCtlColors $0 "${COLOR}" "F7F9FC"
    CreateFont ${FONT_VAR} "$(^Font)" "${FONT_SIZE}" "${FONT_WEIGHT}"
    SendMessage $0 ${WM_SETFONT} ${FONT_VAR} 1
  ${EndIf}
!macroend

!macro LB_MOVE CONTROL X Y WIDTH HEIGHT
  System::Call 'user32::MoveWindow(p ${CONTROL}, i ${X}, i ${Y}, i ${WIDTH}, i ${HEIGHT}, i 1) i.r0'
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "LastBrowser mit Sidekick installieren"
  !define MUI_WELCOMEPAGE_TEXT "Sidekick wird lokal auf deinem Rechner eingerichtet.$\r$\n$\r$\nDeine Browserdaten und KI-Einstellungen bleiben auf deinem Gerät. Anbieter kannst du später selbst verbinden."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customInit
  InitPluginsDir
  File "/oname=$PLUGINSDIR\installerNova.bmp" "${BUILD_RESOURCES_DIR}\installerNova.bmp"
!macroend

!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW LastBrowserInstallPageShow
!macroend

Function LastBrowserInstallPageShow
  ; The MUI callback has already resolved these native controls on the InstFiles dialog.
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $R0
  Push $R1
  Push $R2
  Push $R3
  Push $R4
  Push $R5
  Push $R6
  Push $R7
  Push $R8
  Push $R9

  ; Resolve the native InstFiles dialog and controls through the IDs used by NSIS MUI2.
  FindWindow $LastBrowserInstallDialog "#32770" "" $HWNDPARENT
  GetDlgItem $LastBrowserInstallText $LastBrowserInstallDialog 1006
  GetDlgItem $LastBrowserInstallProgressBar $LastBrowserInstallDialog 1004
  GetDlgItem $LastBrowserInstallShowLogButton $LastBrowserInstallDialog 1027
  GetDlgItem $LastBrowserInstallLog $LastBrowserInstallDialog 1016

  ; Read the actual page size and center the content within the native InstFiles dialog.
  System::Call 'user32::GetClientRect(p $LastBrowserInstallDialog, @r0)'
  System::Call '*$0(i, i, i.r1, i.r2)'
  System::Free $0
  StrCpy $R8 $1
  StrCpy $R9 $2
  IntOp $R0 $R8 / 2
  IntOp $R6 $R8 - 48
  ${If} $R6 > 380
    StrCpy $R6 380
  ${EndIf}
  IntOp $R3 $R8 - $R6
  IntOp $R3 $R3 / 2

  GetDlgItem $R4 $LastBrowserInstallDialog ${LB_INSTALL_NOVA_ID}
  ${If} $R4 == 0
    System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "", i 0x5000020E, i 0, i 0, i 72, i 72, p $LastBrowserInstallDialog, p ${LB_INSTALL_NOVA_ID}, p 0, p 0) p .r4'
    ${NSD_SetBitmap} $R4 "$PLUGINSDIR\installerNova.bmp" $LastBrowserInstallNovaBitmap
  ${EndIf}
  IntOp $R7 $R0 - 36
  !insertmacro LB_MOVE $R4 $R7 2 72 72

  !insertmacro LB_CREATE_CENTERED_LABEL ${LB_INSTALL_EYEBROW_ID} "WILLKOMMEN BEI LASTBROWSER" $LastBrowserInstallEyebrowFont 8 600 "53657C"
  !insertmacro LB_CREATE_CENTERED_LABEL ${LB_INSTALL_HEADLINE_ID} "Dein neuer Arbeitsplatz ist gleich da." $LastBrowserInstallHeadlineFont 14 700 "182B43"
  !insertmacro LB_CREATE_CENTERED_LABEL ${LB_INSTALL_DESCRIPTION_ID} "Wir bereiten deinen Browser vor. Den Rest bestimmst du beim ersten Start." $LastBrowserInstallDescriptionFont 9 400 "53657C"
  !insertmacro LB_CREATE_CENTERED_LABEL ${LB_INSTALL_PRIVACY_ID} "Lokal auf deinem Rechner" $LastBrowserInstallPrivacyFont 9 400 "53657C"

  GetDlgItem $0 $LastBrowserInstallDialog ${LB_INSTALL_EYEBROW_ID}
  !insertmacro LB_MOVE $0 $R3 79 $R6 12
  GetDlgItem $0 $LastBrowserInstallDialog ${LB_INSTALL_HEADLINE_ID}
  !insertmacro LB_MOVE $0 $R3 95 $R6 24
  GetDlgItem $0 $LastBrowserInstallDialog ${LB_INSTALL_DESCRIPTION_ID}
  !insertmacro LB_MOVE $0 $R3 122 $R6 25
  GetDlgItem $0 $LastBrowserInstallDialog ${LB_INSTALL_PRIVACY_ID}
  !insertmacro LB_MOVE $0 $R3 184 $R6 16

  ; Keep the native per-file status, progress, expandable detail log, and cancel behavior.
  !insertmacro LB_MOVE $LastBrowserInstallText $R3 152 $R6 16
  ${If} $LastBrowserInstallPageStyled != "1"
    System::Call 'user32::GetWindowLongW(p $LastBrowserInstallText, i -16) i.r0'
    IntOp $R0 $0 & 0xFFFFFFFC
    IntOp $R0 $R0 | 1
    System::Call 'user32::SetWindowLongW(p $LastBrowserInstallText, i -16, i $R0) i.r0'
    SetCtlColors $LastBrowserInstallText "182B43" "F7F9FC"
    StrCpy $LastBrowserInstallPageStyled "1"
  ${EndIf}
  !insertmacro LB_MOVE $LastBrowserInstallProgressBar $R3 171 $R6 9
  SendMessage $LastBrowserInstallProgressBar ${PBM_SETBARCOLOR} 0 0x00FFD900
  SendMessage $LastBrowserInstallProgressBar ${PBM_SETBKCOLOR} 0 0x00FF4E93
  !insertmacro LB_MOVE $LastBrowserInstallShowLogButton $R3 202 $R6 18
  SendMessage $LastBrowserInstallShowLogButton ${WM_SETTEXT} 0 "STR:Details anzeigen"
  IntOp $R5 $R9 - 222
  ${If} $R5 < 18
    StrCpy $R5 18
  ${EndIf}
  !insertmacro LB_MOVE $LastBrowserInstallLog $R3 222 $R6 $R5

  ; Use the existing MUI footer buttons, with a concise localized action label.
  SendMessage $mui.Button.Cancel ${WM_SETTEXT} 0 "STR:Abbrechen"
  SendMessage $mui.Button.Next ${WM_SETTEXT} 0 "STR:Startklar"
  ShowWindow $mui.Button.Back ${SW_HIDE}
  System::Call 'user32::GetClientRect(p $HWNDPARENT, @r0)'
  System::Call '*$0(i, i, i.r1, i.r2)'
  System::Free $0
  IntOp $R4 $1 - 180
  IntOp $R5 $2 - 34
  !insertmacro LB_MOVE $mui.Button.Cancel $R4 $R5 78 23
  IntOp $R4 $R4 + 88
  !insertmacro LB_MOVE $mui.Button.Next $R4 $R5 88 23
  SendMessage $mui.Branding.Text ${WM_SETTEXT} 0 "STR:${VERSION} · Beta"
  IntOp $R4 $R5 + 3
  !insertmacro LB_MOVE $mui.Branding.Text 20 $R4 150 18
  ShowWindow $mui.Header.Text ${SW_HIDE}
  ShowWindow $mui.Header.SubText ${SW_HIDE}

  Pop $R9
  Pop $R8
  Pop $R7
  Pop $R6
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

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
    !define MUI_FINISHPAGE_RUN_TEXT "LastBrowser jetzt starten"
  !endif

  !define MUI_FINISHPAGE_TITLE "LastBrowser ist startklar"
  !define MUI_FINISHPAGE_TEXT "LastBrowser und Sidekick sind eingerichtet. Sidekick arbeitet lokal; KI-Anbieter verbindest du bei Bedarf in den Einstellungen."
  !define MUI_FINISHPAGE_BUTTON "Startklar"
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
