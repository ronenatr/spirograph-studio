@echo off
setlocal
cd /d "%~dp0"
title Invoice Collector

echo ===============================================
echo         Invoice Collector - starting up
echo ===============================================
echo.

REM --- 1. Check that Node.js is installed ---------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js is not installed.
  echo.
  echo     1. Download the "LTS" installer from:  https://nodejs.org
  echo     2. Install it ^(just click Next / Finish^).
  echo     3. Then double-click this file again.
  echo.
  pause
  exit /b 1
)

REM --- 2. Make sure a .env exists -----------------------------------------
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo [!] A new ".env" file was created and is opening in Notepad.
  echo.
  echo     Paste your GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET,
  echo     then SAVE, close Notepad, and run this file again.
  echo.
  notepad ".env"
  pause
  exit /b 0
)

REM --- 3. Install dependencies (first run only) ---------------------------
if not exist "node_modules" (
  echo Installing dependencies ^(this happens only once^)...
  echo.
  call npm install
  echo.
)

REM --- 4. Launch ----------------------------------------------------------
echo Opening http://localhost:3000 in your browser...
start "" http://localhost:3000
echo.
echo The server is now running. Keep this window open while you use the app.
echo To stop it, close this window or press Ctrl+C.
echo.
call npm start

endlocal
