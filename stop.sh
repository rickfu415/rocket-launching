#!/bin/bash

# Rocket Launch Simulator - Stop Script
# Stops both backend and frontend servers

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.simulator.pid"

# Port configuration (must match start.sh)
BACKEND_PORT=8765
FRONTEND_PORT=3456

echo "========================================"
echo "  Rocket Launch Simulator - Stopping"
echo "========================================"
echo

# Function to kill process and its children
kill_process_tree() {
    local pid=$1
    local name=$2

    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        # Kill child processes first
        pkill -P "$pid" 2>/dev/null
        # Kill the main process
        kill "$pid" 2>/dev/null
        sleep 1
        # Force kill if still running
        if kill -0 "$pid" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null
        fi
        echo "  ✓ Stopped $name (PID: $pid)"
        return 0
    else
        echo "  → $name not running or already stopped"
        return 1
    fi
}

# Check if PID file exists
if [ -f "$PID_FILE" ]; then
    # Read PIDs from file
    PIDS=($(cat "$PID_FILE"))
    BACKEND_PID="${PIDS[0]}"
    FRONTEND_PID="${PIDS[1]}"

    echo "Stopping processes..."

    # Stop backend
    kill_process_tree "$BACKEND_PID" "Backend"

    # Stop frontend
    kill_process_tree "$FRONTEND_PID" "Frontend"

    # Remove PID file
    rm -f "$PID_FILE"

else
    echo "No PID file found. Attempting to find and stop processes..."

    # Try to find and kill uvicorn processes for this project
    UVICORN_PIDS=$(pgrep -f "uvicorn src.main:app" 2>/dev/null)
    if [ -n "$UVICORN_PIDS" ]; then
        for pid in $UVICORN_PIDS; do
            kill_process_tree "$pid" "Backend (uvicorn)"
        done
    fi

    # Try to find and kill vite processes
    VITE_PIDS=$(pgrep -f "vite" 2>/dev/null)
    if [ -n "$VITE_PIDS" ]; then
        for pid in $VITE_PIDS; do
            kill_process_tree "$pid" "Frontend (vite)"
        done
    fi
fi

# Also kill any remaining processes on the ports
echo
echo "Checking ports..."

# Check backend port
BACKEND_PID_PORT=$(lsof -ti:$BACKEND_PORT 2>/dev/null)
if [ -n "$BACKEND_PID_PORT" ]; then
    kill "$BACKEND_PID_PORT" 2>/dev/null
    echo "  ✓ Freed port $BACKEND_PORT"
else
    echo "  → Port $BACKEND_PORT is free"
fi

# Check frontend port
FRONTEND_PID_PORT=$(lsof -ti:$FRONTEND_PORT 2>/dev/null)
if [ -n "$FRONTEND_PID_PORT" ]; then
    kill "$FRONTEND_PID_PORT" 2>/dev/null
    echo "  ✓ Freed port $FRONTEND_PORT"
else
    echo "  → Port $FRONTEND_PORT is free"
fi

echo
echo "========================================"
echo "  Simulator stopped"
echo "========================================"
echo
