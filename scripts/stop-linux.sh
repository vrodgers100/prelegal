#!/usr/bin/env bash
# Stops Prelegal and removes its container. The database is inside the
# container, so stopping discards it -- that is intended for now.
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose down
echo "Prelegal stopped."
