!include "WinMessages.nsh"
!include "nsDialogs.nsh"

!define MUI_BGCOLOR "FAFCFF"
!define MUI_TEXTCOLOR "152238"
!define MUI_INSTFILESPAGE_COLORS "152238 FAFCFF"
!define MUI_INSTFILESPAGE_PROGRESSBAR "colored"

; electron-builder compiles its uninstaller first. The installation-only
; controls and callback must not become unused install functions in that pass.
!ifndef BUILD_UNINSTALLER

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
Var LastBrowserInstallDialog
Var LastBrowserInstallText
Var LastBrowserInstallProgressBar
Var LastBrowserInstallShowLogButton
Var LastBrowserInstallLog
Var LastBrowserInstallButtonNext
Var LastBrowserInstallButtonCancel
Var LastBrowserInstallButtonBack
Var LastBrowserInstallBrandingText
Var LastBrowserInstallHeaderText
Var LastBrowserInstallHeaderSubText
Var LastBrowserInstallHeaderImage
Var LastBrowserInstallHeaderBackground
Var LastBrowserInstallHeaderLine
Var LastBrowserInstallBrandingBackground
Var LastBrowserInstallDpi
Var LastBrowserInstallMoveX
Var LastBrowserInstallMoveY
Var LastBrowserInstallMoveWidth
Var LastBrowserInstallMoveHeight
Var LastBrowserInstallFooterFont

!macro LB_CREATE_CENTERED_LABEL ID TEXT FONT_VAR FONT_SIZE FONT_WEIGHT COLOR
  GetDlgItem $0 $LastBrowserInstallDialog ${ID}
  ${If} $0 == 0
    System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "${TEXT}", i 0x50000001, i 0, i 0, i 10, i 10, p $LastBrowserInstallDialog, p ${ID}, p 0, p 0) p .r0'
    SetCtlColors $0 "${COLOR}" "FAFCFF"
    CreateFont ${FONT_VAR} "Segoe UI" "${FONT_SIZE}" "${FONT_WEIGHT}"
    SendMessage $0 ${WM_SETFONT} ${FONT_VAR} 1
  ${EndIf}
!macroend

; Design coordinates match the 690px Sidekick mockup and scale with window DPI.
!macro LB_MOVE_DESIGN CONTROL X Y WIDTH HEIGHT
  System::Call 'kernel32::MulDiv(i ${X}, i $LastBrowserInstallDpi, i 96) i.s'
  Pop $LastBrowserInstallMoveX
  System::Call 'kernel32::MulDiv(i ${Y}, i $LastBrowserInstallDpi, i 96) i.s'
  Pop $LastBrowserInstallMoveY
  System::Call 'kernel32::MulDiv(i ${WIDTH}, i $LastBrowserInstallDpi, i 96) i.s'
  Pop $LastBrowserInstallMoveWidth
  System::Call 'kernel32::MulDiv(i ${HEIGHT}, i $LastBrowserInstallDpi, i 96) i.s'
  Pop $LastBrowserInstallMoveHeight
  !insertmacro LB_MOVE ${CONTROL} $LastBrowserInstallMoveX $LastBrowserInstallMoveY $LastBrowserInstallMoveWidth $LastBrowserInstallMoveHeight
!macroend

!macro customHeader
  ShowInstDetails hide
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
  GetDlgItem $LastBrowserInstallButtonNext $HWNDPARENT 1
  GetDlgItem $LastBrowserInstallButtonCancel $HWNDPARENT 2
  GetDlgItem $LastBrowserInstallButtonBack $HWNDPARENT 3
  GetDlgItem $LastBrowserInstallBrandingText $HWNDPARENT 1256
  GetDlgItem $LastBrowserInstallHeaderText $HWNDPARENT 1037
  GetDlgItem $LastBrowserInstallHeaderSubText $HWNDPARENT 1038
  GetDlgItem $LastBrowserInstallHeaderImage $HWNDPARENT 1039
  GetDlgItem $LastBrowserInstallHeaderBackground $HWNDPARENT 1034
  GetDlgItem $LastBrowserInstallHeaderLine $HWNDPARENT 1035
  GetDlgItem $LastBrowserInstallBrandingBackground $HWNDPARENT 1028

  ; Give the installation scene the whole body, rather than leaving an empty
  ; native header above it. Keep the footer actions in their native dialog.
  SetCtlColors $HWNDPARENT "152238" "FAFCFF"
  SetCtlColors $LastBrowserInstallDialog "152238" "FAFCFF"
  ShowWindow $LastBrowserInstallHeaderText ${SW_HIDE}
  ShowWindow $LastBrowserInstallHeaderSubText ${SW_HIDE}
  ShowWindow $LastBrowserInstallHeaderImage ${SW_HIDE}
  ShowWindow $LastBrowserInstallHeaderBackground ${SW_HIDE}
  ShowWindow $LastBrowserInstallHeaderLine ${SW_HIDE}
  ShowWindow $LastBrowserInstallBrandingBackground ${SW_HIDE}
  ShowWindow $LastBrowserInstallBrandingText ${SW_HIDE}
  System::Call 'user32::GetDpiForWindow(p $HWNDPARENT) i.s'
  Pop $LastBrowserInstallDpi
  ${If} $LastBrowserInstallDpi <= 0
    StrCpy $LastBrowserInstallDpi 96
  ${EndIf}
  ; Preserve the window center and account for the native caption/frame.
  System::Alloc 16
  Pop $0
  System::Call 'user32::GetWindowRect(p $HWNDPARENT, p r0)'
  System::Call '*$0(i.r1, i.r2, i.r3, i.r4)'
  IntOp $R8 $3 - $1
  IntOp $R9 $4 - $2
  System::Call 'user32::GetClientRect(p $HWNDPARENT, p r0)'
  System::Call '*$0(i, i, i.R1, i.R2)'
  System::Free $0
  IntOp $R6 $R8 - $R1
  IntOp $R7 $R9 - $R2
  System::Call 'kernel32::MulDiv(i 690, i $LastBrowserInstallDpi, i 96) i.R1'
  System::Call 'kernel32::MulDiv(i 530, i $LastBrowserInstallDpi, i 96) i.R2'
  IntOp $R1 $R1 + $R6
  IntOp $R2 $R2 + $R7
  IntOp $R3 $R8 - $R1
  IntOp $R3 $R3 / 2
  IntOp $R3 $1 + $R3
  IntOp $R4 $R9 - $R2
  IntOp $R4 $R4 / 2
  IntOp $R4 $2 + $R4
  ${If} $R3 < 0
    StrCpy $R3 0
  ${EndIf}
  ${If} $R4 < 0
    StrCpy $R4 0
  ${EndIf}
  !insertmacro LB_MOVE $HWNDPARENT $R3 $R4 $R1 $R2
  !insertmacro LB_MOVE_DESIGN $LastBrowserInstallDialog 0 0 690 464
  StrCpy $R3 140
  StrCpy $R6 410

  GetDlgItem $R4 $LastBrowserInstallDialog ${LB_INSTALL_NOVA_ID}
  ${If} $R4 == 0
    System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "", i 0x5000020E, i 0, i 0, i 100, i 100, p $LastBrowserInstallDialog, p ${LB_INSTALL_NOVA_ID}, p 0, p 0) p .R4'
  ${EndIf}
  !insertmacro LB_MOVE_DESIGN $R4 295 26 100 100
  ${NSD_SetStretchedImage} $R4 "$PLUGINSDIR\installerNova.bmp" $LastBrowserInstallNovaBitmap

  !insertmacro LB_CREATE_CENTERED_LABEL ${LB_INSTALL_EYEBROW_ID} "WILLKOMMEN BEI LASTBROWSER" $LastBrowserInstallEyebrowFont 8 600 "53657C"
  !insertmacro LB_CREATE_CENTERED_LABEL ${LB_INSTALL_HEADLINE_ID} "Dein neuer Arbeitsplatz$\r$\nist gleich da." $LastBrowserInstallHeadlineFont 21 600 "182B43"
  !insertmacro LB_CREATE_CENTERED_LABEL ${LB_INSTALL_DESCRIPTION_ID} "Wir bereiten deinen Browser vor.$\r$\nDen Rest bestimmst du beim ersten Start." $LastBrowserInstallDescriptionFont 10 400 "53657C"
  !insertmacro LB_CREATE_CENTERED_LABEL ${LB_INSTALL_PRIVACY_ID} "Lokal auf deinem Rechner" $LastBrowserInstallPrivacyFont 8 400 "53657C"

  GetDlgItem $0 $LastBrowserInstallDialog ${LB_INSTALL_EYEBROW_ID}
  !insertmacro LB_MOVE_DESIGN $0 $R3 146 $R6 18
  GetDlgItem $0 $LastBrowserInstallDialog ${LB_INSTALL_HEADLINE_ID}
  !insertmacro LB_MOVE_DESIGN $0 $R3 175 $R6 70
  GetDlgItem $0 $LastBrowserInstallDialog ${LB_INSTALL_DESCRIPTION_ID}
  !insertmacro LB_MOVE_DESIGN $0 125 258 440 44
  GetDlgItem $0 $LastBrowserInstallDialog ${LB_INSTALL_PRIVACY_ID}
  !insertmacro LB_MOVE_DESIGN $0 $R3 377 $R6 18

  ; Native engine progress stays authoritative. No simulated percentages.
  !insertmacro LB_MOVE_DESIGN $LastBrowserInstallText 150 325 390 18
  SendMessage $LastBrowserInstallText ${WM_SETTEXT} 0 "STR:Lastbrowser installieren"
  SendMessage $LastBrowserInstallText ${WM_SETFONT} $LastBrowserInstallDescriptionFont 1
  SetCtlColors $LastBrowserInstallText "182B43" "FAFCFF"
  !insertmacro LB_MOVE_DESIGN $LastBrowserInstallProgressBar 150 352 390 7
  System::Call 'uxtheme::SetWindowTheme(p $LastBrowserInstallProgressBar, w "", w "")'
  SendMessage $LastBrowserInstallProgressBar ${PBM_SETBARCOLOR} 0 0x00DBBD00
  SendMessage $LastBrowserInstallProgressBar ${PBM_SETBKCOLOR} 0 0x00F8EFE9
  !insertmacro LB_MOVE_DESIGN $LastBrowserInstallShowLogButton 270 406 150 28
  SendMessage $LastBrowserInstallShowLogButton ${WM_SETTEXT} 0 "STR:Details anzeigen"
  SendMessage $LastBrowserInstallShowLogButton ${WM_SETFONT} $LastBrowserInstallDescriptionFont 1
  ShowWindow $LastBrowserInstallShowLogButton ${SW_SHOW}
  !insertmacro LB_MOVE_DESIGN $LastBrowserInstallLog 125 322 440 123
  System::Call 'user32::SetWindowPos(p $LastBrowserInstallLog, p 0, i 0, i 0, i 0, i 0, i 0x13)'

  ; A dedicated footer avoids the old empty back button and duplicated branding.
  SendMessage $LastBrowserInstallButtonCancel ${WM_SETTEXT} 0 "STR:Abbrechen"
  SendMessage $LastBrowserInstallButtonNext ${WM_SETTEXT} 0 "STR:Fertigstellen"
  !insertmacro LB_MOVE $LastBrowserInstallButtonBack -300 -300 1 1
  !insertmacro LB_MOVE_DESIGN $LastBrowserInstallButtonCancel 440 482 104 34
  !insertmacro LB_MOVE_DESIGN $LastBrowserInstallButtonNext 554 482 116 34
  GetDlgItem $R4 $HWNDPARENT 5751
  ${If} $R4 == 0
    System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "${VERSION}", i 0x50000000, i 0, i 0, i 10, i 10, p $HWNDPARENT, p 5751, p 0, p 0) p .R4'
    CreateFont $LastBrowserInstallFooterFont "Segoe UI" 8 400
    SendMessage $R4 ${WM_SETFONT} $LastBrowserInstallFooterFont 1
    SetCtlColors $R4 "53657C" "FAFCFF"
  ${EndIf}
  !insertmacro LB_MOVE_DESIGN $R4 20 490 190 18
  GetDlgItem $R4 $HWNDPARENT 5752
  ${If} $R4 == 0
    System::Call 'user32::CreateWindowExW(i 0, w "STATIC", w "", i 0x50000000, i 0, i 0, i 10, i 1, p $HWNDPARENT, p 5752, p 0, p 0) p .R4'
    SetCtlColors $R4 "DBE4EE" "DBE4EE"
  ${EndIf}
  !insertmacro LB_MOVE_DESIGN $R4 0 464 690 1
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

!endif

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
