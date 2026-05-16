#!/bin/bash

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Restarting ladder-league services..."

"$REPO_DIR/stop.sh" || true

exec "$REPO_DIR/start.sh"
