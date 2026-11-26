; Civil Site Lab – lightweight Windows installer (<1 MB).
; Installs the app files and opens them in their own window with Microsoft Edge (built into Windows 10/11).
Unicode true
SetCompressor /SOLID lzma
!include "MUI2.nsh"

!define APPNAME "Civil Site Lab"
!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\CivilSiteLabLite"

Name "${APPNAME}"
OutFile "..\dist\CivilSiteLab-Setup-Lite-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\Civil Site Lab"
RequestExecutionLevel user
BrandingText "${APPNAME} ${VERSION}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "FileDescription" "${APPNAME} Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "CompanyName" "Civil Site Lab"
VIAddVersionKey "LegalCopyright" "Civil Site Lab"

!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp
!define MUI_FINISHPAGE_RUN_TEXT "Start Civil Site Lab now"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Var EDGE

Function FindEdge
  StrCpy $EDGE "$PROGRAMFILES32\Microsoft\Edge\Application\msedge.exe"
  IfFileExists $EDGE done
  StrCpy $EDGE "$PROGRAMFILES64\Microsoft\Edge\Application\msedge.exe"
  IfFileExists $EDGE done
  StrCpy $EDGE "$LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
  done:
FunctionEnd

Function LaunchApp
  Exec '"$INSTDIR\Civil Site Lab.cmd"'
FunctionEnd

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "..\app\*.*"
  File "icon.ico"
  Call FindEdge
  ; launcher: own window, own profile (keeps reports separate and persistent)
  FileOpen $0 "$INSTDIR\Civil Site Lab.cmd" w
  FileWrite $0 '@start "" "$EDGE" --app="file:///$INSTDIR\index.html" --user-data-dir="$LOCALAPPDATA\Civil Site Lab\EdgeProfile" --no-first-run$\r$\n'
  FileClose $0
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Civil Site Lab"
  CreateShortCut "$SMPROGRAMS\Civil Site Lab\Civil Site Lab.lnk" "$EDGE" '--app="file:///$INSTDIR\index.html" --user-data-dir="$LOCALAPPDATA\Civil Site Lab\EdgeProfile" --no-first-run' "$INSTDIR\icon.ico"
  CreateShortCut "$SMPROGRAMS\Civil Site Lab\Uninstall Civil Site Lab.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\Civil Site Lab.lnk" "$EDGE" '--app="file:///$INSTDIR\index.html" --user-data-dir="$LOCALAPPDATA\Civil Site Lab\EdgeProfile" --no-first-run' "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "Civil Site Lab"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\Civil Site Lab.lnk"
  RMDir /r "$SMPROGRAMS\Civil Site Lab"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  ; Saved reports (in %LOCALAPPDATA%\Civil Site Lab\EdgeProfile) are kept on purpose.
SectionEnd
