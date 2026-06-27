@echo off
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"

where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    set "PYTHON=py -3"
) else (
    where python >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        set "PYTHON=python"
    ) else (
        echo Python 3 was not found. Install Python 3 and try again.
        exit /b 1
    )
)

%PYTHON% -m pip install pyinstaller
%PYTHON% build_launcher.py
