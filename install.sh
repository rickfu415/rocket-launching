#!/bin/bash

# Rocket Launch Simulator - Installation Script
# This script sets up the Python virtual environment and installs all dependencies

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"

echo "========================================"
echo "  Rocket Launch Simulator - Installer"
echo "========================================"
echo

# Check for Python 3
echo "[1/6] Checking Python installation..."
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
    PYTHON_VERSION=$($PYTHON_CMD --version 2>&1 | cut -d' ' -f2)
    echo "  ✓ Found Python $PYTHON_VERSION"
else
    echo "  ✗ Python 3 is not installed. Please install Python 3.9 or higher."
    exit 1
fi

# Check Python version (need 3.9+)
PYTHON_MAJOR=$($PYTHON_CMD -c "import sys; print(sys.version_info.major)")
PYTHON_MINOR=$($PYTHON_CMD -c "import sys; print(sys.version_info.minor)")

if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 9 ]); then
    echo "  ✗ Python 3.9 or higher is required. Found $PYTHON_VERSION"
    exit 1
fi

# Check for Node.js
echo "[2/6] Checking Node.js installation..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "  ✓ Found Node.js $NODE_VERSION"
else
    echo "  ✗ Node.js is not installed. Please install Node.js 18 or higher."
    exit 1
fi

# Check for npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo "  ✓ Found npm $NPM_VERSION"
else
    echo "  ✗ npm is not installed. Please install npm."
    exit 1
fi

# Create Python virtual environment
echo "[3/6] Creating Python virtual environment..."
if [ -d "$VENV_DIR" ]; then
    echo "  → Virtual environment already exists, skipping creation"
else
    $PYTHON_CMD -m venv "$VENV_DIR"
    echo "  ✓ Created virtual environment at $VENV_DIR"
fi

# Activate virtual environment and install Python dependencies
echo "[4/6] Installing Python dependencies..."
source "$VENV_DIR/bin/activate"
pip install --upgrade pip -q
pip install -r "$BACKEND_DIR/requirements.txt" -q
echo "  ✓ Installed Python packages:"
echo "    - fastapi"
echo "    - uvicorn"
echo "    - websockets"
echo "    - numpy"
echo "    - scipy"
echo "    - pyyaml"
echo "    - pydantic"
deactivate

# Install Node.js dependencies
echo "[5/6] Installing Node.js dependencies..."
cd "$FRONTEND_DIR"
npm install --silent
echo "  ✓ Installed Node.js packages:"
echo "    - three"
echo "    - vite"

# Verify installation
echo "[6/6] Verifying installation..."
cd "$SCRIPT_DIR"

# Check if key Python packages are installed
source "$VENV_DIR/bin/activate"
MISSING_PACKAGES=""
for pkg in fastapi uvicorn numpy scipy; do
    if ! $PYTHON_CMD -c "import $pkg" 2>/dev/null; then
        MISSING_PACKAGES="$MISSING_PACKAGES $pkg"
    fi
done
deactivate

if [ -n "$MISSING_PACKAGES" ]; then
    echo "  ✗ Missing Python packages:$MISSING_PACKAGES"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo "  ✗ Node.js packages not installed correctly"
    exit 1
fi

echo "  ✓ All dependencies verified"

echo
echo "========================================"
echo "  Installation Complete!"
echo "========================================"
echo
echo "To start the simulator, run:"
echo "  ./start.sh"
echo
echo "To stop the simulator, run:"
echo "  ./stop.sh"
echo
