$ErrorActionPreference = "Stop"

python -m pip install --disable-pip-version-check -r python/requirements-build.txt

$target = "x86_64-pc-windows-msvc"
$dist = Join-Path $PSScriptRoot "..\src-tauri\binaries"
$work = Join-Path $PSScriptRoot "..\build\pyinstaller"

New-Item -ItemType Directory -Force -Path $dist | Out-Null
New-Item -ItemType Directory -Force -Path $work | Out-Null

python -m PyInstaller `
  --onefile `
  --name "signal-desk-agent-$target" `
  --distpath $dist `
  --workpath $work `
  --specpath $work `
  (Join-Path $PSScriptRoot "..\python\agent.py")

if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller failed with exit code $LASTEXITCODE"
}

Write-Host "Sidecar created in $dist"