#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDS_FILE="$REPO_DIR/.pids"

echo "Starting ladder-league services..."

# Start backend (FastAPI on port 8080)
cd "$REPO_DIR/backend"
venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload &
BACKEND_PID=$!
echo "Backend started (PID $BACKEND_PID) → http://localhost:8080"

# Start frontend (React on port 3030)
cd "$REPO_DIR/frontend"
PORT=3030 npm start &
FRONTEND_PID=$!
echo "Frontend started (PID $FRONTEND_PID) → http://localhost:3030"

# Save PIDs for stop script
echo "$BACKEND_PID $FRONTEND_PID" > "$PIDS_FILE"
echo ""
echo "Both services running. Run ./stop.sh to stop them."

wait
