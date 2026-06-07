#!/bin/bash
set -e

# Virtual environment setup (optional but recommended)
VENV_DIR="venv"

if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

# Install dependencies
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
python app.py
