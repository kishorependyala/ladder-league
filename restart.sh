#!/bin/bash

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Restarting ladder-league services..."

"$REPO_DIR/stop.sh" || true

echo "Pulling latest changes..."
cd "$REPO_DIR"
git pull --ff-only || echo "⚠️  Git pull skipped (local changes present)"

exec "$REPO_DIR/start.sh"
