$ErrorActionPreference = 'Stop'
$BaseDir = $PSScriptRoot
$PatchScript = Join-Path $BaseDir 'patch-antigravity.mjs'
$LogFile = Join-Path $BaseDir 'auto-patch.log'

function Write-Log([string]$msg) {
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -Path $LogFile -Value "[$ts] $msg" -Encoding UTF8
}

# Fast check: exit immediately if already patched
& node $PatchScript --check *> $null
if ($LASTEXITCODE -eq 0) {
    exit 0
}

# Unpatched (e.g. fresh install or Antigravity just updated)
$running = Get-Process -Name 'Antigravity' -ErrorAction SilentlyContinue
if ($running) {
    Write-Log 'Detected unpatched app.asar, waiting for Antigravity.exe to close on next cycle.'
    exit 0
}

try {
    $out = & node $PatchScript --if-needed 2>&1 | Out-String
    Write-Log "Auto-patched successfully: $($out.Trim())"
} catch {
    Write-Log "Auto-patch failed: $($_.Exception.Message)"
    exit 1
}
