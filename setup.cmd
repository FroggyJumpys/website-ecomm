@echo off
rem Double-clickable Windows wrapper for "npm run setup".
rem
rem The real work happens in scripts\setup.mjs, which installs the workspaces,
rem creates the runtime folders and writes the git-ignored .env files. This file
rem only switches the console to UTF-8, keeps the window open when it was opened
rem from Explorer, and forwards any arguments (for example: setup.cmd --migrate).
setlocal
chcp 65001 >nul
cd /d "%~dp0"

rem cmd /c "<this file>" is how Explorer starts a .cmd; an already-open console
rem or Git Bash leaves cmdcmdline without this file's name.
set "LAUNCHED_FROM_EXPLORER="
echo "%cmdcmdline%" | find /i "%~nx0" >nul && set "LAUNCHED_FROM_EXPLORER=1"
if defined TERM set "LAUNCHED_FROM_EXPLORER="

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   ! Node.js was not found on PATH.
  echo     Install Node.js 22.12 or newer from https://nodejs.org, then run this file again.
  set "EXITCODE=1"
  goto :finish
)

node "scripts\setup.mjs" %*
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
  echo.
  echo   ! Setup failed with exit code %EXITCODE%.
)

:finish
if defined LAUNCHED_FROM_EXPLORER (
  echo.
  pause
)

endlocal & exit /b %EXITCODE%
