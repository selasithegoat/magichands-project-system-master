# Run as Administrator
param(
  [string]$Ip = "192.168.100.203",
  [string[]]$Hostnames = @(
    "magichandsproject.lan",
    "admin.magichandsproject.lan",
    "ops.magichandsproject.lan"
  )
)

$ErrorActionPreference = "Stop"

try {
  $hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
  $backupPath = "$hostsPath.bak"

  # Backup once
  if (-not (Test-Path $backupPath)) {
    Copy-Item $hostsPath $backupPath
  }

  # Read current hosts
  $lines = Get-Content $hostsPath

  # Remove old entries for these hostnames
  $filtered = $lines | Where-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return $true }
    foreach ($h in $Hostnames) {
      if ($line -match "(^|\\s)$([regex]::Escape($h))($|\\s)") { return $false }
    }
    return $true
  }

  # Add fresh entries
  foreach ($h in $Hostnames) {
    $filtered += "$Ip $h"
  }

  # Write back
  Set-Content -Path $hostsPath -Value $filtered -Force

  # Flush DNS
  ipconfig /flushdns | Out-Null

  Write-Host "Hosts updated for $($Hostnames -join ', ') -> $Ip"
} catch {
  Write-Error "Failed to update hosts. Re-run this script in an elevated PowerShell session. $($_.Exception.Message)"
  exit 1
}
