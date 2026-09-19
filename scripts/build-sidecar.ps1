$ErrorActionPreference = "Stop"

python -m pip install --disable-pip-version-check -r python/requirements-build.txt

$target = "x86_64-pc-windows-msvc"
$dist = "src-tauri/binaries"
New-Item -ItemType Directory -Force -Path $dist | Out-Null

python -m PyInstaller `
  --onefile `
  --name "signal-desk-agent-$target" `
  --distpath $dist `
  --workpath "$env:TEMP/signal-desk-pyinstaller" `
  --specpath "$env:TEMP/signal-desk-pyinstaller" `
  python/agent.py

Write-Host "Sidecar created in $dist"
