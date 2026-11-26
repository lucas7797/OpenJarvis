; Civil Site Lab – Windows installer (NSIS 3)
; Build: makensis CivilSiteLab.nsi   (run build.sh, which first copies the app into build/app)

Unicode true
!include "MUI2.nsh"

!define APPNAME   "Civil Site Lab"
!define COMPANY   "Civil Site Lab"
!define VERSION   "1.0.0"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\CivilSiteLab"

Name "${APPNAME}"
!ifdef ONECLICK
  OutFile "build\CivilSiteLab-OneClick-Setup-${VERSION}.exe"
  SilentInstall silent          ; no wizard: install with defaults, then open the app
!else
  OutFile "build\CivilSiteLab-Setup-${VERSION}.exe"
!endif
InstallDir "$LOCALAPPDATA\Programs\Civil Site Lab"
InstallDirRegKey HKCU "Software\CivilSiteLab" "InstallDir"
RequestExecutionLevel user          ; no admin rights needed
SetCompressor /SOLID lzma
BrandingText "${APPNAME} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "FileDescription" "${APPNAME} Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "CompanyName" "${COMPANY}"
VIAddVersionKey "LegalCopyright" "${COMPANY}"

!define MUI_ICON "CivilSiteLab.ico"
!define MUI_UNICON "CivilSiteLab.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "sidebar.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "sidebar.bmp"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "header.bmp"
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "Install ${APPNAME}"
!define MUI_WELCOMEPAGE_TEXT "On-site civil test report generator: sieve analysis, compaction, field density, cube & core, mix design, Marshall, cement, water, steel, brick and aggregate tests — with PDF reports, signatures and a document scanner.$\r$\n$\r$\nWorks offline. Your reports are stored only on this computer.$\r$\n$\r$\nClick Next to continue."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Open ${APPNAME} now"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
Var StartMenuFolder
!define MUI_STARTMENUPAGE_DEFAULTFOLDER "${APPNAME}"
!define MUI_STARTMENUPAGE_REGISTRY_ROOT "HKCU"
!define MUI_STARTMENUPAGE_REGISTRY_KEY "Software\CivilSiteLab"
!define MUI_STARTMENUPAGE_REGISTRY_VALUENAME "StartMenuFolder"
!insertmacro MUI_PAGE_STARTMENU App $StartMenuFolder
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Function .onInit
  StrCpy $StartMenuFolder "${APPNAME}"
FunctionEnd

Function .onInstSuccess
  IfSilent 0 +2
    Call LaunchApp
FunctionEnd

Function LaunchApp
  ExecShell "" "$SYSDIR\wscript.exe" '"$INSTDIR\launch.vbs"'
FunctionEnd

Section "!${APPNAME} (required)" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\app"            ; clean old version on upgrade (user data lives elsewhere)
  File "launch.vbs"
  File "CivilSiteLab.ico"
  File /oname=README.txt "build\README.txt"
  SetOutPath "$INSTDIR\app"
  File /r "build\app\*.*"

  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\CivilSiteLab" "InstallDir" "$INSTDIR"

  !insertmacro MUI_STARTMENU_WRITE_BEGIN App
    CreateDirectory "$SMPROGRAMS\$StartMenuFolder"
    CreateShortcut "$SMPROGRAMS\$StartMenuFolder\${APPNAME}.lnk" "$SYSDIR\wscript.exe" '"$INSTDIR\launch.vbs"' "$INSTDIR\CivilSiteLab.ico" 0
    CreateShortcut "$SMPROGRAMS\$StartMenuFolder\Document Scanner.lnk" "$SYSDIR\wscript.exe" '"$INSTDIR\launch.vbs" scanner' "$INSTDIR\CivilSiteLab.ico" 0
    CreateShortcut "$SMPROGRAMS\$StartMenuFolder\Uninstall ${APPNAME}.lnk" "$INSTDIR\Uninstall.exe"
  !insertmacro MUI_STARTMENU_WRITE_END

  ; Apps & features entry
  WriteRegStr   HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr   HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr   HKCU "${UNINSTKEY}" "Publisher" "${COMPANY}"
  WriteRegStr   HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\CivilSiteLab.ico"
  WriteRegStr   HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr   HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr   HKCU "${UNINSTKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "EstimatedSize" 1200
SectionEnd

Section "Desktop shortcut" SecDesktop
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$SYSDIR\wscript.exe" '"$INSTDIR\launch.vbs"' "$INSTDIR\CivilSiteLab.ico" 0
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} "The ${APPNAME} application and Start-menu shortcuts."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} "Add a ${APPNAME} icon to the desktop."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Section "Uninstall"
  !insertmacro MUI_STARTMENU_GETFOLDER App $StartMenuFolder
  Delete "$SMPROGRAMS\$StartMenuFolder\*.lnk"
  RMDir  "$SMPROGRAMS\$StartMenuFolder"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$INSTDIR\app"
  Delete "$INSTDIR\launch.vbs"
  Delete "$INSTDIR\CivilSiteLab.ico"
  Delete "$INSTDIR\README.txt"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir  "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\CivilSiteLab"
  ; Saved reports (%LOCALAPPDATA%\CivilSiteLab) are kept on purpose so reinstalling doesn't lose data.
SectionEnd
