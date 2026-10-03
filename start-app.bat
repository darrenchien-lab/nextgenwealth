@echo off
cd /d "%~dp0"

echo Starting NextGen Wealth backend...
start "NextGen Wealth Backend" cmd /k "cd backend && npm run dev"

echo Starting NextGen Wealth frontend...
start "NextGen Wealth Frontend" cmd /k "cd frontend && npm run dev"

echo Waiting for the servers to come up...
timeout /t 6 /nobreak >nul

start http://localhost:3001
