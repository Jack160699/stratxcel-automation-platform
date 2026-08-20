@echo off
title StratXcel Production E2E Visible Chrome Window
echo ===============================================================================
echo Starting Fresh Visible Google Chrome for StratXcel E2E Production Testing
echo ===============================================================================

set PROFILE_DIR=%TEMP%\stratxcel-final-e2e-browser

echo Profile Directory: %PROFILE_DIR%
echo Debugging Port:    9222
echo Production Target: https://www.stratxcel.in/login
echo.

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set CHROME_BIN="C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set CHROME_BIN="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) else (
    echo [ERROR] Google Chrome not found at standard installation path!
    pause
    exit /b 1
)

start "" %CHROME_BIN% --new-window --start-maximized --no-first-run --no-default-browser-check --user-data-dir="%PROFILE_DIR%" --remote-debugging-port=9222 "https://www.stratxcel.in/login"

echo [SUCCESS] Chrome launched. Please make sure the window is visible on your screen.
echo Keep this window open during the testing mission.
