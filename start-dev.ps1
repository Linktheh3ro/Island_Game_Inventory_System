Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"

function Stop-ManagedProcesses {
    param([array]$Processes)

    foreach ($process in $Processes) {
        if ($null -ne $process -and -not $process.HasExited) {
            try {
                Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            } catch {}
        }
    }
}

$pythonCommand = Get-Command py -ErrorAction SilentlyContinue
if ($pythonCommand) {
    $pythonPrefix = "py -3"
} else {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pythonCommand) {
        throw "Python was not found. Install Python 3 and try again."
    }

    $pythonPrefix = "python"
}

$yarnCommand = Get-Command yarn -ErrorAction SilentlyContinue
if (-not $yarnCommand) {
    throw "Yarn was not found. Install Yarn and try again."
}

$backendCommand = "cd /d `"$backendDir`" && $pythonPrefix -m uvicorn server:app --host 0.0.0.0 --port 8000"
$frontendCommand = "cd /d `"$frontendDir`" && yarn start"

Write-Host "Starting backend..." -ForegroundColor Cyan
$backendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", $backendCommand) -WorkingDirectory $repoRoot -PassThru -NoNewWindow

Write-Host "Starting frontend..." -ForegroundColor Cyan
$frontendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", $frontendCommand) -WorkingDirectory $repoRoot -PassThru -NoNewWindow

Write-Host ""
Write-Host "Backend: http://localhost:8000" -ForegroundColor Green
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop both services." -ForegroundColor Yellow

try {
    while ($true) {
        Start-Sleep -Seconds 2
        if ($backendProcess.HasExited -or $frontendProcess.HasExited) {
            break
        }
    }
}
finally {
    Stop-ManagedProcesses -Processes @($backendProcess, $frontendProcess)
}
