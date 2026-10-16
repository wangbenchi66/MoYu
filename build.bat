@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

REM ===============================================================
REM  Build Windows NSIS installer for MoYu.
REM
REM  NOTE: electron-builder lives in MoYu\node_modules\.bin\ and is
REM  NOT on the system PATH. It must go through npm run or npx,
REM  because npm temporarily adds .bin to PATH.
REM
REM  Wrong:
REM      npm run build && electron-builder --win nsis
REM  The second command has no npm prefix, so cmd fails with
REM  "'electron-builder' is not recognized as an internal or
REM  external command".
REM
REM  Also: "npm run dist:win" already runs "npm run build", so do
REM  NOT call build separately.
REM
REM  Keep this file ASCII-only and CRLF. Chinese comments show up
REM  as mojibake under some consoles even with chcp 65001.
REM ===============================================================

echo.
echo ================================================================
echo   MoYu - Windows installer build
echo ================================================================
echo.
echo [1/2] Checking for processes locking the build folder...

REM electron-builder wipes and recreates MoYu\release\win-unpacked.
REM If a MoYu.exe launched earlier from there is still alive, or a
REM helper like 7za.exe is stuck, the build dies with:
REM   "The process cannot access the file because it is being used
REM    by another process"
REM The check lives in a separate .ps1: embedding it in this .bat
REM breaks on quoting, and $vars silently become empty.
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\check-build-lock.ps1"
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)

REM Drop leftover archive from an interrupted build
if exist "MoYu\release\moyu-*-x64.nsis.7z" (
  echo       Removing leftover archive from an interrupted build...
  @del /q "MoYu\release\moyu-*-x64.nsis.7z" 2>nul
)

echo.
echo [2/2] Building, this takes 1-2 minutes...
echo.

pushd MoYu
call npm run dist:win
set BUILD_RESULT=%errorlevel%
popd

if not "%BUILD_RESULT%"=="0" (
  echo.
  echo ================================================================
  echo   [FAILED] See the output above.
  echo ================================================================
  echo.
  echo   Common causes:
  echo.
  echo   1. A file is locked by another process. Look for MoYu, 7za or
  echo      app-builder in Task Manager, or run:
  echo        tasklist /FO TABLE
  echo      Then close or kill the offending process and retry.
  echo.
  echo   2. Corrupt electron-builder binary cache. Delete this folder
  echo      and re-run. It is re-downloaded from the mirror.
  echo        %LOCALAPPDATA%\electron-builder\Cache
  echo.
  echo   3. Dependencies missing. Run "npm install" inside MoYu\.
  echo.
  pause
  exit /b 1
)

echo.
echo ================================================================
echo   Build complete
echo ================================================================
echo.
dir /b "MoYu\release\*.exe" 2>nul
echo.
echo   Folder: %CD%\MoYu\release
echo.
pause
