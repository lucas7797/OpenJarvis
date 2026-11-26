; Civil Site Lab – Windows installer (NSIS). Built by scripts/build-installer.sh
Unicode true
SetCompressor /SOLID lzma
!include "MUI2.nsh"
!include "FileFunc.nsh"

!define APPNAME "Civil Site Lab"
!define EXENAME "Civil Site Lab.exe"
!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\CivilSiteLab"

Name "${APPNAME}"
OutFile "..\dist\CivilSiteLab-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\Civil Site Lab"
InstallDirRegKey HKCU "${UNINSTKEY}" "InstallLocation"
RequestExecutionLevel user
BrandingText "${APPNAME} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "FileDescription" "${APPNAME} Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "CompanyName" "Civil Site Lab"
VIAddVersionKey "LegalCopyright" "Civil Site Lab"

!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXENAME}"
!define MUI_FINISHPAGE_RUN_TEXT "Start Civil Site Lab now"
!define MUI_WELCOMEPAGE_TEXT "This will install Civil Site Lab ${VERSION} – the on-site civil test report generator (sieve analysis, compaction, FDD, cube, mix design, Marshall, cement, steel, brick and more).$\r$\n$\r$\nNo administrator rights are needed.$\r$\n$\r$\nClick Next to continue."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  ; close a running copy so files can be replaced
  nsExec::Exec 'taskkill /IM "${EXENAME}" /F'
  SetOutPath "$INSTDIR"
  File /r "..\dist\win-unpacked\*.*"
  WriteUninstaller "$INSTDIR\Uninstall Civil Site Lab.exe"

  CreateDirectory "$SMPROGRAMS\Civil Site Lab"
  CreateShortCut "$SMPROGRAMS\Civil Site Lab\Civil Site Lab.lnk" "$INSTDIR\${EXENAME}"
  CreateShortCut "$SMPROGRAMS\Civil Site Lab\Uninstall Civil Site Lab.lnk" "$INSTDIR\Uninstall Civil Site Lab.exe"
  CreateShortCut "$DESKTOP\Civil Site Lab.lnk" "$INSTDIR\${EXENAME}"

  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "Civil Site Lab"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\${EXENAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall Civil Site Lab.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "${UNINSTKEY}" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM "${EXENAME}" /F'
  Delete "$DESKTOP\Civil Site Lab.lnk"
  RMDir /r "$SMPROGRAMS\Civil Site Lab"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  ; Saved reports/records (in %APPDATA%\Civil Site Lab) are kept on purpose.
SectionEnd
