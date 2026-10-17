'use strict';
// Wraps dist/win-unpacked into a Windows installer with NSIS.
// Uses `makensis` from PATH (apt install nsis), or electron-builder's cached copy.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const app = path.join(root, 'dist', 'win-unpacked');
const { version } = require(path.join(root, 'package.json'));
if (!fs.existsSync(app)) { console.error('dist/win-unpacked is missing. Run: npx electron-builder --win dir --x64'); process.exit(1); }

const files = [], dirs = [];
let size = 0;
(function walk(d, rel) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name), r = rel ? rel + '\\' + e.name : e.name;
    if (e.isDirectory()) { dirs.push(r); walk(p, r); } else { files.push(r); size += fs.statSync(p).size; }
  }
})(app, '');
const q = s => s.replace(/"/g, '$\\"');
const nsi = `Unicode true
!define APPNAME "K-9 Salon Manager"
!define EXENAME "K-9 Salon Manager.exe"
!define VERSION "${version}"
!define PUBLISHER "K-9 Salon"
!define UNINST "Uninstall K-9 Salon Manager.exe"
!define UKEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\K9SalonManager"

Name "\${APPNAME}"
OutFile "dist/K-9-Salon-Manager-Setup-\${VERSION}.exe"
InstallDir "$LOCALAPPDATA\\Programs\\K-9 Salon Manager"
InstallDirRegKey HKCU "Software\\K9SalonManager" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "K-9 Salon Manager \${VERSION}"
VIProductVersion "${version}.0"
VIAddVersionKey "ProductName" "\${APPNAME}"
VIAddVersionKey "CompanyName" "\${PUBLISHER}"
VIAddVersionKey "FileDescription" "\${APPNAME} Setup"
VIAddVersionKey "FileVersion" "\${VERSION}"
VIAddVersionKey "ProductVersion" "\${VERSION}"
VIAddVersionKey "LegalCopyright" "\${PUBLISHER}"

!include "MUI2.nsh"
!include "FileFunc.nsh"
!define MUI_ICON "build/icon.ico"
!define MUI_UNICON "build/icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Install K-9 Salon Manager \${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "Kennel records for K-9 Salon, kept in sync with your Google Sheet.$\\r$\\n$\\r$\\nIf the app is open, close it first. Click Next to continue."
!define MUI_FINISHPAGE_RUN "$INSTDIR\\\${EXENAME}"
!define MUI_FINISHPAGE_RUN_TEXT "Open K-9 Salon Manager now"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

; Waits until the app's window is gone and its program file is no longer in use.
; When updating silently the app is already closing, so wait for it (up to a minute).
!macro CloseRunningApp
  StrCpy $R9 0
  check_running:
  FindWindow $0 "Chrome_WidgetWin_1" "K-9 Salon Manager"
  StrCmp $0 0 0 still_open
  IfFileExists "$INSTDIR\\\${EXENAME}" 0 not_running
  ClearErrors
  FileOpen $1 "$INSTDIR\\\${EXENAME}" a
  IfErrors still_open
  FileClose $1
  Goto not_running
  still_open:
  IfSilent 0 ask
  IntOp $R9 $R9 + 1
  IntCmp $R9 120 give_up keep_waiting give_up
  keep_waiting:
  Sleep 500
  Goto check_running
  give_up:
  Abort
  ask:
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "K-9 Salon Manager is open. Close it, then click Retry." /SD IDCANCEL IDRETRY check_running
  Abort
  not_running:
!macroend

Function .onInit
  !insertmacro CloseRunningApp
FunctionEnd
Function un.onInit
  !insertmacro CloseRunningApp
FunctionEnd

; After a silent update started from the app, open the app again.
Function .onInstSuccess
  IfSilent 0 done
  \${GetParameters} $R0
  ClearErrors
  \${GetOptions} $R0 "--force-run" $R1
  IfErrors done
  Exec '"$INSTDIR\\\${EXENAME}"'
  done:
FunctionEnd

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "dist/win-unpacked/*.*"
  WriteUninstaller "$INSTDIR\\\${UNINST}"
  CreateShortCut "$SMPROGRAMS\\K-9 Salon Manager.lnk" "$INSTDIR\\\${EXENAME}" "" "$INSTDIR\\\${EXENAME}" 0
  IfSilent +2 0
  CreateShortCut "$DESKTOP\\K-9 Salon Manager.lnk" "$INSTDIR\\\${EXENAME}" "" "$INSTDIR\\\${EXENAME}" 0
  WriteRegStr HKCU "Software\\K9SalonManager" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "\${UKEY}" "DisplayName" "\${APPNAME}"
  WriteRegStr HKCU "\${UKEY}" "DisplayVersion" "\${VERSION}"
  WriteRegStr HKCU "\${UKEY}" "Publisher" "\${PUBLISHER}"
  WriteRegStr HKCU "\${UKEY}" "DisplayIcon" "$INSTDIR\\\${EXENAME}"
  WriteRegStr HKCU "\${UKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "\${UKEY}" "UninstallString" '"$INSTDIR\\\${UNINST}"'
  WriteRegDWORD HKCU "\${UKEY}" "EstimatedSize" ${Math.round(size / 1024)}
  WriteRegDWORD HKCU "\${UKEY}" "NoModify" 1
  WriteRegDWORD HKCU "\${UKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\\K-9 Salon Manager.lnk"
  Delete "$DESKTOP\\K-9 Salon Manager.lnk"
${files.map(f => `  Delete "$INSTDIR\\${q(f)}"`).join('\n')}
${dirs.sort((a, b) => b.split('\\').length - a.split('\\').length).map(d => `  RMDir "$INSTDIR\\${q(d)}"`).join('\n')}
  Delete "$INSTDIR\\\${UNINST}"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "\${UKEY}"
  DeleteRegKey HKCU "Software\\K9SalonManager"
SectionEnd
`;
fs.writeFileSync(path.join(root, 'build', 'installer.nsi'), nsi);

function findMakensis() {
  if (process.env.MAKENSIS) return { bin: process.env.MAKENSIS, env: {} };
  try { const p = execFileSync('which', ['makensis']).toString().trim(); if (p) return { bin: p, env: {} }; } catch (e) { /* not on PATH */ }
  const cache = path.join(os.homedir(), '.cache', 'electron-builder');
  const nsisDir = fs.existsSync(cache) && fs.readdirSync(cache).filter(d => d.startsWith('nsis-3')).map(d => path.join(cache, d)).flatMap(d => fs.readdirSync(d).map(x => path.join(d, x))).find(d => fs.existsSync(path.join(d, 'linux', 'makensis')));
  if (nsisDir) { fs.chmodSync(path.join(nsisDir, 'linux', 'makensis'), 0o755); return { bin: path.join(nsisDir, 'linux', 'makensis'), env: { NSISDIR: nsisDir } }; }
  throw new Error('makensis not found. Install NSIS (sudo apt-get install nsis) or set MAKENSIS.');
}
const mk = findMakensis();
execFileSync(mk.bin, ['-V2', '-NOCD', path.join(root, 'build', 'installer.nsi')], { cwd: root, env: Object.assign({}, process.env, mk.env), stdio: 'inherit' });
const exe = path.join(root, 'dist', `K-9-Salon-Manager-Setup-${version}.exe`);
console.log(`built ${path.relative(root, exe)} (${(fs.statSync(exe).size / 1048576).toFixed(1)} MB)`);
