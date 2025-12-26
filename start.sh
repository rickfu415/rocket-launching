#!/bin/bash

# Rocket Launch Simulator - Start Script
# Starts both backend and frontend servers in background

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"
PID_FILE="$SCRIPT_DIR/.simulator.pid"
LOG_DIR="$SCRIPT_DIR/logs"

# Port configuration
BACKEND_PORT=8765
FRONTEND_PORT=3456

echo "========================================"
echo "  Rocket Launch Simulator - Starting"
echo "========================================"
echo

# Stop any existing services first
if [ -f "$PID_FILE" ] || lsof -ti:$BACKEND_PORT > /dev/null 2>&1 || lsof -ti:$FRONTEND_PORT > /dev/null 2>&1; then
    echo "Stopping existing services..."

    # Kill processes from PID file
    if [ -f "$PID_FILE" ]; then
        while read pid; do
            if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null
            fi
        done < "$PID_FILE"
        rm -f "$PID_FILE"
    fi

    # Kill any processes on the ports
    lsof -ti:$BACKEND_PORT | xargs kill -9 2>/dev/null
    lsof -ti:$FRONTEND_PORT | xargs kill -9 2>/dev/null

    sleep 1
    echo "  ✓ Existing services stopped"
    echo
fi

# Check if virtual environment exists
if [ ! -d "$VENV_DIR" ]; then
    echo "Virtual environment not found. Please run ./install.sh first."
    exit 1
fi

# Check if node_modules exists
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo "Node modules not found. Please run ./install.sh first."
    exit 1
fi

# Create logs directory
mkdir -p "$LOG_DIR"

# Start backend server
echo "[1/2] Starting backend server (FastAPI)..."
cd "$BACKEND_DIR"
source "$VENV_DIR/bin/activate"

# Run uvicorn in background, redirect output to log file
nohup python -m uvicorn src.main:app --host 0.0.0.0 --port $BACKEND_PORT --reload > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "  ✓ Backend started (PID: $BACKEND_PID)"
echo "  → API: http://localhost:$BACKEND_PORT"
echo "  → Docs: http://localhost:$BACKEND_PORT/docs"
echo "  → Log: $LOG_DIR/backend.log"

deactivate

# Wait a moment for backend to initialize
sleep 2

# Start frontend server
echo "[2/2] Starting frontend server (Vite)..."
cd "$FRONTEND_DIR"

# Run vite in background, redirect output to log file
nohup npm run dev -- --port $FRONTEND_PORT > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "  ✓ Frontend started (PID: $FRONTEND_PID)"
echo "  → App: http://localhost:$FRONTEND_PORT"
echo "  → Log: $LOG_DIR/frontend.log"

# Save PIDs for stop script
echo "$BACKEND_PID" > "$PID_FILE"
echo "$FRONTEND_PID" >> "$PID_FILE"

echo
echo "========================================"
echo "  Simulator is running in background!"
echo "========================================"
echo
echo "Open your browser to: http://localhost:$FRONTEND_PORT"
echo
echo "Backend API: http://localhost:$BACKEND_PORT"
echo "API Docs:    http://localhost:$BACKEND_PORT/docs"
echo
echo "View logs:"
echo "  tail -f $LOG_DIR/backend.log"
echo "  tail -f $LOG_DIR/frontend.log"
echo
echo "To stop the simulator, run: ./stop.sh"
echo
