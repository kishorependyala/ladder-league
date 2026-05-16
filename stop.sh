#!/bin/bash

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDS_FILE="$REPO_DIR/.pids"

stop_pid() {
  local PID="$1"
  local NAME="$2"
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" && echo "Stopped $NAME (PID $PID)"
  else
    echo "$NAME (PID $PID) was not running"
  fi
}

kill_port() {
  local PORT="$1"
  local NAME="$2"
  local PIDS
  PIDS=$(lsof -ti tcp:"$PORT" 2>/dev/null)
  if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill -9 && echo "Killed $NAME processes on port $PORT ($PIDS)"
  fi
}

# Kill anything on the known ports first
kill_port 8080 "backend"
kill_port 3030 "frontend"

# Also stop by saved PIDs if available
if [ -f "$PIDS_FILE" ]; then
  read -r BACKEND_PID FRONTEND_PID < "$PIDS_FILE"
  stop_pid "$BACKEND_PID" "backend"
  stop_pid "$FRONTEND_PID" "frontend"
  pkill -P "$FRONTEND_PID" 2>/dev/null || true
  rm -f "$PIDS_FILE"
fi

echo "Done."
