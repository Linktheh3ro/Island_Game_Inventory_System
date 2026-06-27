Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcherPath = Join-Path $repoRoot "launcher.py"

if (-not (Test-Path $launcherPath)) {
    Write-Host "Launcher script not found. Make sure launcher.py is in the project root." -ForegroundColor Red
    exit 1
}

$pythonCommand = Get-Command py -ErrorAction SilentlyContinue
if ($pythonCommand) {
    & py -3 $launcherPath
} else {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pythonCommand) {
        Write-Host "Python 3 was not found. Install Python 3 and try again." -ForegroundColor Red
        exit 1
    }

    & python $launcherPath
}
