$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")

Set-Location (Join-Path $repoRoot "server")

$env:DOTENV_FILE = ".env.staging"
node src/server.js
