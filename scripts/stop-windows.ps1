# Stops Prelegal and removes its container. The database is inside the
# container, so stopping discards it -- that is intended for now.
#
# See start-windows.ps1 for why exit codes are checked instead of using
# $ErrorActionPreference = "Stop".

Set-Location (Join-Path $PSScriptRoot "..")

docker compose down
if ($LASTEXITCODE -ne 0) {
    Write-Host "docker compose down failed."
    exit 1
}

Write-Host "Prelegal stopped."
