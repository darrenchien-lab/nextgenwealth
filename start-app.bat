@echo off
cd /d "%~dp0"

echo Starting NextGen Wealth backend...
start "NextGen Wealth Backend" cmd /k "cd backend && npm run dev"

echo Starting NextGen Wealth frontend...
start "NextGen Wealth Frontend" cmd /k "cd frontend && npm run dev"

rem Wait until each server actually answers instead of guessing a fixed
rem delay: the first start after booting can take well over half a minute,
rem and opening the browser before the API is up makes every page fail
rem with "Failed to fetch". Windows' own curl is called by full path so a
rem different curl earlier on PATH can't be picked up; the 1-second pause is
rem a ping to localhost, which (unlike timeout) works without a console.
set "CURL=%SystemRoot%\System32\curl.exe"
set /a waited=0

echo Waiting for the backend on http://localhost:3000 ...
:wait_backend
"%CURL%" -s --connect-timeout 1 -f -o nul http://127.0.0.1:3000/healthz && goto wait_frontend_start
set /a waited+=1
if %waited% geq 60 goto not_ready
ping -n 2 127.0.0.1 >nul
goto wait_backend

:wait_frontend_start
echo Backend is up. Waiting for the frontend on http://localhost:3001 ...
:wait_frontend
"%CURL%" -s --connect-timeout 1 -o nul http://127.0.0.1:3001 && goto open_browser
set /a waited+=1
if %waited% geq 60 goto not_ready
ping -n 2 127.0.0.1 >nul
goto wait_frontend

:open_browser
echo Ready. Opening the app...
start http://localhost:3001
goto :eof

:not_ready
echo.
echo The app did not start within about 2 minutes.
echo Check the "NextGen Wealth Backend" and "NextGen Wealth Frontend" windows for errors.
pause
