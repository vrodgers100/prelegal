# Builds and starts Prelegal, then waits until the API answers.
#
# `docker compose` writes its progress to stderr, which Windows PowerShell 5.1
# turns into error records. Exit codes are checked explicitly instead of using
# $ErrorActionPreference = "Stop", which would abort on that ordinary output.

Set-Location (Join-Path $PSScriptRoot "..")

docker compose up --build -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "docker compose up failed."
    exit 1
}

Write-Host "Waiting for http://localhost:8000 " -NoNewline
foreach ($attempt in 1..60) {
    try {
        Invoke-RestMethod "http://localhost:8000/api/health" -TimeoutSec 2 | Out-Null
        Write-Host ""
        Write-Host "Prelegal is running at http://localhost:8000"
        exit 0
    } catch {
        Write-Host "." -NoNewline
        Start-Sleep -Seconds 1
    }
}

Write-Host ""
Write-Host "Prelegal did not become healthy in time. Recent logs:"
docker compose logs --tail 50
exit 1
