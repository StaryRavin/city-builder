; Установщик «Городок у реки» для Windows (NSIS 3).
; Собирает scripts/make-installer.mjs: makensis -DVER=… -DVER4=… -DSRC=… -DOUT=… -DICON=… installer.nsi
; Ставится для текущего пользователя (без прав администратора) в %LOCALAPPDATA%\Programs\Gorodok.
; Сохранения городов лежат отдельно — %APPDATA%\Городок у реки\saves — и не удаляются
; ни при обновлении, ни при удалении игры.
Unicode true
ManifestDPIAware true
!include "MUI2.nsh"

!define APPNAME "Городок у реки"
!define EXE "Gorodok.exe"
!define REGKEY "Software\GorodokURekiCityBuilder"
!define UNINST "Software\Microsoft\Windows\CurrentVersion\Uninstall\GorodokURekiCityBuilder"

Name "${APPNAME}"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\Gorodok"
InstallDirRegKey HKCU "${REGKEY}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "${APPNAME} ${VER}"

VIProductVersion "${VER4}"
VIAddVersionKey /LANG=0 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=0 "FileDescription" "Установщик игры ${APPNAME}"
VIAddVersionKey /LANG=0 "FileVersion" "${VER}"
VIAddVersionKey /LANG=0 "ProductVersion" "${VER}"
VIAddVersionKey /LANG=0 "LegalCopyright" "city-builder"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TEXT "Мастер установит игру ${APPNAME} ${VER}.$\r$\n$\r$\nЕсли игра уже стоит, она обновится. Сохранённые города останутся на месте: они лежат в папке пользователя, а не в папке игры.$\r$\n$\r$\nПеред продолжением закройте игру."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Запустить игру"
!insertmacro MUI_PAGE_FINISH
!define MUI_UNCONFIRMPAGE_TEXT_TOP "Игра будет удалена. Сохранённые города останутся в папке %APPDATA%\${APPNAME}\saves — их можно открыть после повторной установки."
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Russian"

Section "Игра" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"
  ; обновление: убрать файлы прошлой версии (сохранения лежат не здесь)
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  File /r "${SRC}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXE}"
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${EXE}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Удалить ${APPNAME}.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${REGKEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${REGKEY}" "Version" "${VER}"
  WriteRegStr HKCU "${UNINST}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINST}" "DisplayVersion" "${VER}"
  WriteRegStr HKCU "${UNINST}" "Publisher" "city-builder"
  WriteRegStr HKCU "${UNINST}" "DisplayIcon" "$INSTDIR\${EXE}"
  WriteRegStr HKCU "${UNINST}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNINST}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINST}"
  DeleteRegKey HKCU "${REGKEY}"
  ; %APPDATA%\Городок у реки (сохранения) — не трогаем
SectionEnd
