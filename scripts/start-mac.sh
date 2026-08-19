#!/usr/bin/env bash
# Builds and starts Prelegal, then waits until the API answers.
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose up --build -d

printf "Waiting for http://localhost:8000 "
for _ in $(seq 1 60); do
  if curl -fsS http://localhost:8000/api/health >/dev/null 2>&1; then
    echo
    echo "Prelegal is running at http://localhost:8000"
    exit 0
  fi
  printf "."
  sleep 1
done

echo
echo "Prelegal did not become healthy in time. Recent logs:" >&2
docker compose logs --tail 50 >&2
exit 1
