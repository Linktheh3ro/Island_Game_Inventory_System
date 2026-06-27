@echo off
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"

where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    set "PYTHON=py -3"
) else (
    set "PYTHON=python"
)

where yarn >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Yarn was not found. Install Yarn and try again.
    exit /b 1
)

set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"

start "Backend" cmd /k "cd /d ""%BACKEND_DIR%"" && %PYTHON% -m uvicorn server:app --host 0.0.0.0 --port 8000"
start "Frontend" cmd /k "cd /d ""%FRONTEND_DIR%"" && yarn start"

echo Backend: http://localhost:8000
echo Frontend: http://localhost:3000
