[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendRoot = Join-Path $ProjectRoot "backend"
$VenvRoot = Join-Path $BackendRoot ".venv"
$VenvPython = Join-Path $VenvRoot "Scripts\python.exe"
$PythonExe = $null

if (Get-Command python -ErrorAction SilentlyContinue) {
    $Candidate = (Get-Command python).Source
    $CandidateVersion = & $Candidate -c "import sys; print('.'.join(map(str, sys.version_info[:2])))"
    if ($LASTEXITCODE -eq 0 -and $CandidateVersion.Trim() -eq "3.11") {
        $PythonExe = $Candidate
    }
}

if (-not $PythonExe -and (Get-Command py -ErrorAction SilentlyContinue)) {
    try {
        $Candidate = & py -3.11 -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0) {
            $PythonExe = $Candidate.Trim()
        }
    }
    catch {
        $PythonExe = $null
    }
}

if (-not $PythonExe) {
    throw "Python 3.11 is not installed. Install Python 3.11.9 and run this script again."
}

$PythonVersion = & $PythonExe -c "import sys; print('.'.join(map(str, sys.version_info[:3])))"

if (-not (Test-Path $VenvPython)) {
    Write-Host "Creating backend virtual environment with Python $PythonVersion..."
    & $PythonExe -m venv $VenvRoot
}

Write-Host "Installing pinned backend development dependencies..."
& $VenvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
    throw "Failed to upgrade pip in $VenvRoot."
}
& $VenvPython -m pip install -r (Join-Path $BackendRoot "requirements-dev.txt")
if ($LASTEXITCODE -ne 0) {
    throw "Failed to install backend development dependencies."
}

Write-Host ""
Write-Host "Backend environment ready."
Write-Host "Python: $VenvPython"
Write-Host "Run tests: & '$VenvPython' -m pytest -q"
