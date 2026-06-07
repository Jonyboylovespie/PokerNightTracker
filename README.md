# Poker Night Tracker

A sleek, self-hosted web dashboard to track home game poker nights, inspired by your Google Sheets setup. Built with **Python + Flask + SQLite** on the backend and **Tailwind CSS + Chart.js** on the frontend.

![Theme](https://img.shields.io/badge/theme-Poker%20Felt-green)
![Stack](https://img.shields.io/badge/stack-Flask%20%7C%20SQLite%20%7C%20Tailwind-blue)

## Features

- **Public Dashboard**: Anyone can view the results, chart, and running totals.
- **Admin Login**: Password-protected access for making changes.
- **Add Players / Nights / Remove Night**: Admin-only actions.
- **Auto-Sorting**: Players sorted by total winnings (high to low).
- **Running Totals**: Cumulative table that carries forward a player’s total even if they miss a night (just like your sheet).
- **Live Chart**: Interactive line chart of cumulative winnings over time.
- **Automatic Backups**: Every data change triggers a timestamped JSON backup in the `backups/` folder.

## Tech Stack

- **Backend**: Python 3, Flask, SQLite, Werkzeug
- **Frontend**: HTML, Tailwind CSS (CDN), Chart.js (CDN), Vanilla JS
- **Data**: Single SQLite file (`instance/poker.db`) + JSON backups (`backups/`)

## Quick Start (Ubuntu / Linux)

```bash
# 1. Copy the example environment file and edit it
 cp .env.example .env
#    (Optional: edit .env to set a custom SECRET_KEY and ADMIN_PASSWORD)

# 2. Make run script executable
chmod +x run.sh

# 3. Run it
./run.sh
```

This will:
- Create a Python virtual environment (`venv/`)
- Install dependencies
- Initialize the SQLite database with a default admin user
- Start the server on `http://0.0.0.0:5000`

### Default Login
- **Username**: `admin`
- **Password**: `pokeradmin` (set `ADMIN_PASSWORD` env var before first run to customize)

**Important**: Change the default password after your first login by hitting the "Change Password" link in the navbar.

## Running with Systemd (Recommended for a server)

Create a service file at `/etc/systemd/system/poker.service`:

```ini
[Unit]
Description=Poker Night Tracker
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/poker
Environment="SECRET_KEY=your-very-long-secret-key-here"
Environment="ADMIN_PASSWORD=your-secure-admin-password"
ExecStart=/opt/poker/venv/bin/python /opt/poker/app.py
Restart=always

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable poker
sudo systemctl start poker
```


## License

MIT — use it for your home game and have fun!
