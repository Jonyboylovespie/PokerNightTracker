#!/bin/bash
set -e

VENV_DIR="venv"

# Check if we can create virtual environments
if ! python3 -m ensurepip --help >/dev/null 2>&1; then
    echo "ERROR: python3-venv (ensurepip) is missing."
    echo "Install it with:   sudo apt install python3-venv"
    echo "(or python3.12-venv, python3.11-venv, etc. depending on your python version)"
    exit 1
fi

# If venv exists but is broken (missing activate or pip), nuke it
if [ -d "$VENV_DIR" ]; then
    if [ ! -f "$VENV_DIR/bin/activate" ] || [ ! -f "$VENV_DIR/bin/pip" ]; then
        echo "Broken virtual environment detected. Rebuilding..."
        rm -rf "$VENV_DIR"
    fi
fi

if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Set production secret key if not already set
if [ -z "$SECRET_KEY" ]; then
    export SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
    echo "Generated SECRET_KEY. Set this permanently in your environment or systemd service."
fi

# Default admin password (change this!)
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-pokeradmin}"

# Run the Flask app
# Bind 0.0.0.0:5000. Use a reverse proxy (nginx) for HTTPS/public access.
echo "Starting Poker Night Tracker..."
python app.py
