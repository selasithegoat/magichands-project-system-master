$ErrorActionPreference = "Stop"

$isAdministrator = [Security.Principal.WindowsPrincipal]::new(
    [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdministrator) {
    throw "Run this script in an Administrator PowerShell session to access the elevated PM2 service."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $repoRoot "server/node_modules/.cache"
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$logPath = Join-Path $logDirectory "lan-api-restart.log"
$env:PM2_HOME = "C:\Users\Onasis\.pm2"
$env:PM2_PIPE_NAMESPACE = "Onasis"
$pm2Command = "C:\Users\Onasis\AppData\Roaming\npm\pm2.cmd"

try {
    "Restarting magichands-project-server at $(Get-Date -Format o)" | Set-Content -LiteralPath $logPath -Encoding UTF8
    & $pm2Command restart magichands-project-server 2>&1 | Out-File -LiteralPath $logPath -Append -Encoding UTF8
    if ($LASTEXITCODE -ne 0) { throw "PM2 restart failed with exit code $LASTEXITCODE." }
    "Restart completed." | Add-Content -LiteralPath $logPath -Encoding UTF8
} catch {
    $_.Exception.Message | Add-Content -LiteralPath $logPath -Encoding UTF8
    exit 1
}
