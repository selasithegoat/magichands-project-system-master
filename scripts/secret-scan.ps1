# Secret scanning helper for local audits.
# Uses gitleaks when installed, otherwise falls back to regex scans.
param(
  [switch]$SkipHistory
)

$ErrorActionPreference = "Stop"

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host "== $Title =="
}

function Get-TrackedEnvFiles {
  $envPattern = '(^|/)\.env($|\.)'
  $allowedEnvPattern = '\.env\.(example|sample|template)$'

  return @(
    (& git ls-files) |
      Where-Object {
        $_ -match $envPattern -and $_ -notmatch $allowedEnvPattern
      }
  )
}

function Get-RegexPatterns {
  return @(
    '\b[A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API[_-]?KEY|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET)[A-Z0-9_]*\b\s*[:=]\s*["'']?[A-Za-z0-9_./+=:-]{8,}["'']?',
    'aws_access_key_id\s*[:=]\s*(?:AKIA|ASIA)[0-9A-Z]{16}',
    'aws_secret_access_key\s*[:=]\s*[A-Za-z0-9/+=]{40}',
    '(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}',
    'xox[baprs]-[A-Za-z0-9-]{10,}',
    'sk-[A-Za-z0-9]{20,}',
    'mongodb(?:\+srv)?://[^/\s:@]+:[^@\s]+@',
    'BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY'
  )
}

function Filter-ObviousPlaceholders {
  param([string[]]$Lines)

  if (-not $Lines) {
    return @()
  }

  $placeholderPattern = '(?i)(example|placeholder|localhost|127\.0\.0\.1|replace[-_ ]?with|changeme|dummy|sample|your[_-])'
  return @($Lines | Where-Object { $_ -notmatch $placeholderPattern })
}

function Scan-WorkingTree {
  param([string[]]$Patterns)

  $joinedPattern = ($Patterns -join "|")
  $matches = & git grep -n -I -P $joinedPattern -- .
  if ($LASTEXITCODE -eq 0 -and $matches) {
    return @($matches)
  }
  return @()
}

function Scan-History {
  param([string[]]$Patterns)

  $joinedPattern = ($Patterns -join "|")
  $history = & git log --all --full-history -p -- .
  if (-not $history) {
    return @()
  }

  $hits = $history | Select-String -Pattern $joinedPattern -CaseSensitive
  if (-not $hits) {
    return @()
  }

  return @($hits | ForEach-Object { $_.Line.Trim() })
}

$repoRoot = & git rev-parse --show-toplevel 2>$null
if ($LASTEXITCODE -ne 0 -or -not $repoRoot) {
  Write-Error "Not inside a git repository."
  exit 1
}

Set-Location $repoRoot

$failed = $false
$patterns = Get-RegexPatterns

Write-Section "Tracked .env Files"
$trackedEnv = Get-TrackedEnvFiles
if ($trackedEnv.Count -gt 0) {
  $failed = $true
  Write-Host "Tracked env-like files detected:" -ForegroundColor Red
  $trackedEnv | ForEach-Object { Write-Host " - $_" }
} else {
  Write-Host "No tracked .env files detected."
}

$gitleaks = Get-Command gitleaks -ErrorAction SilentlyContinue
if ($gitleaks) {
  Write-Section "Gitleaks"
  & gitleaks detect --source . --redact --no-banner --exit-code 1
  if ($LASTEXITCODE -ne 0) {
    $failed = $true
    Write-Host "Gitleaks found potential leaks." -ForegroundColor Red
  } else {
    Write-Host "Gitleaks reported no leaks."
  }
} else {
  Write-Section "Regex Fallback (gitleaks not installed)"
  Write-Host "gitleaks not found. Running local regex scan instead."

  $treeMatches = Filter-ObviousPlaceholders (Scan-WorkingTree -Patterns $patterns)
  if ($treeMatches.Count -gt 0) {
    $failed = $true
    Write-Host "Potential secret-like values found in working tree:" -ForegroundColor Red
    $treeMatches | Select-Object -First 25 | ForEach-Object { Write-Host " - $_" }
  } else {
    Write-Host "No non-placeholder secret-like values found in working tree."
  }

  if (-not $SkipHistory) {
    Write-Section "History Regex Scan"
    $historyMatches = Filter-ObviousPlaceholders (Scan-History -Patterns $patterns)
    if ($historyMatches.Count -gt 0) {
      $failed = $true
      Write-Host "Potential secret-like values found in git history:" -ForegroundColor Red
      $historyMatches | Select-Object -First 25 | ForEach-Object { Write-Host " - $_" }
    } else {
      Write-Host "No non-placeholder secret-like values found in git history."
    }
  } else {
    Write-Host "History scan skipped."
  }
}

if ($failed) {
  Write-Error "Secret scan found issues. Review and remediate findings."
  exit 1
}

Write-Host ""
Write-Host "Secret scan passed."
