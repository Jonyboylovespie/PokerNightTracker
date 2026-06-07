import os
import json
import sqlite3
import datetime
from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify, g
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, instance_relative_config=True)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-change-me')

DATABASE = os.path.join(app.instance_path, 'poker.db')
BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backups')


def ensure_dirs():
    os.makedirs(app.instance_path, exist_ok=True)
    os.makedirs(BACKUP_DIR, exist_ok=True)


def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
    return db


def init_db():
    ensure_dirs()
    db = get_db()
    cursor = db.cursor()

    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS nights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        night_number INTEGER UNIQUE NOT NULL,
        label TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL,
        night_id INTEGER NOT NULL,
        amount REAL,
        UNIQUE(player_id, night_id),
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
        FOREIGN KEY (night_id) REFERENCES nights(id) ON DELETE CASCADE
    );
    """)
    db.commit()

    # Seed default admin if none exists
    cursor.execute("SELECT id FROM users WHERE username = 'admin'")
    if not cursor.fetchone():
        default_pw = os.environ.get('ADMIN_PASSWORD', 'pokeradmin')
        cursor.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            ('admin', generate_password_hash(default_pw))
        )
        db.commit()
        print("=" * 50)
        print(f"ADMIN CREATED: username=admin, password={default_pw}")
        print("Change this immediately by logging in!")
        print("=" * 50)


@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            if request.is_json or request.headers.get('Accept') == 'application/json':
                return jsonify({"error": "Unauthorized"}), 401
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function


def create_backup():
    db = get_db()
    cursor = db.cursor()

    players = [dict(row) for row in cursor.execute("SELECT * FROM players").fetchall()]
    nights = [dict(row) for row in cursor.execute("SELECT * FROM nights ORDER BY night_number").fetchall()]
    results = [dict(row) for row in cursor.execute("SELECT * FROM results").fetchall()]

    backup_data = {
        "timestamp": datetime.datetime.now().isoformat(),
        "players": players,
        "nights": nights,
        "results": results
    }

    filename = f"poker_backup_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    filepath = os.path.join(BACKUP_DIR, filename)
    with open(filepath, 'w') as f:
        json.dump(backup_data, f, indent=2)
    return filename


def get_full_state():
    db = get_db()
    cursor = db.cursor()

    players = cursor.execute("SELECT * FROM players ORDER BY name").fetchall()
    nights = cursor.execute("SELECT * FROM nights ORDER BY night_number").fetchall()

    player_rows = [dict(p) for p in players]
    night_rows = [dict(n) for n in nights]

    # Initialize matrix
    matrix = {p['id']: {n['id']: None for n in night_rows} for p in player_rows}

    for r in cursor.execute("SELECT player_id, night_id, amount FROM results").fetchall():
        if r['player_id'] in matrix and r['night_id'] in matrix[r['player_id']]:
            matrix[r['player_id']][r['night_id']] = r['amount']

    # Totals per player (sum only non-null values)
    totals = {}
    for p in player_rows:
        total = sum(v for v in matrix[p['id']].values() if v is not None)
        totals[p['id']] = total

    # Sort players by total descending
    sorted_players = sorted(player_rows, key=lambda p: totals[p['id']], reverse=True)

    # Cumulative logic matching Sheets:
    # Once a player has any result, carry forward the running total.
    cumulative = {}
    for p in sorted_players:
        running = 0.0
        has_started = False
        cum = []
        for n in night_rows:
            val = matrix[p['id']][n['id']]
            if val is not None:
                running += val
                has_started = True
            if has_started:
                cum.append(running)
            else:
                cum.append(None)
        cumulative[p['id']] = cum

    return {
        "players": player_rows,
        "nights": night_rows,
        "matrix": matrix,
        "totals": totals,
        "sorted_players": sorted_players,
        "cumulative": cumulative
    }


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        db = get_db()
        user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if user and check_password_hash(user['password_hash'], password):
            session['user_id'] = user['id']
            return redirect(url_for('index'))
        flash('Invalid credentials', 'error')
    return render_template('login.html')


@app.route('/logout')
def logout():
    session.pop('user_id', None)
    return redirect(url_for('login'))


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/state')
def api_state():
    return jsonify(get_full_state())


@app.route('/api/players', methods=['POST'])
@login_required
def add_player():
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return jsonify({"error": "Player name is required"}), 400

    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute("INSERT INTO players (name) VALUES (?)", (name,))
        player_id = cursor.lastrowid

        # Seed empty results for all existing nights so the UI matrix stays consistent
        existing_nights = cursor.execute("SELECT id FROM nights").fetchall()
        for n in existing_nights:
            cursor.execute(
                "INSERT INTO results (player_id, night_id, amount) VALUES (?, ?, NULL)",
                (player_id, n['id'])
            )

        db.commit()
        create_backup()
        return jsonify({"success": True, "player": {"id": player_id, "name": name}})
    except sqlite3.IntegrityError:
        return jsonify({"error": "Player already exists"}), 409


@app.route('/api/players/<int:player_id>', methods=['DELETE'])
@login_required
def remove_player(player_id):
    db = get_db()
    db.execute("DELETE FROM players WHERE id = ?", (player_id,))
    db.commit()
    create_backup()
    return jsonify({"success": True})


@app.route('/api/nights', methods=['POST'])
@login_required
def add_night():
    data = request.get_json()
    results_data = data.get('results', {})  # { "player_id_str": value_or_null }

    db = get_db()
    cursor = db.cursor()

    last = cursor.execute("SELECT MAX(night_number) as max_n FROM nights").fetchone()
    next_num = (last['max_n'] or 0) + 1
    label = f"Night {next_num}"

    cursor.execute("INSERT INTO nights (night_number, label) VALUES (?, ?)", (next_num, label))
    night_id = cursor.lastrowid

    players = cursor.execute("SELECT id FROM players").fetchall()
    for p in players:
        pid = p['id']
        raw = results_data.get(str(pid), None)
        amount = None
        if raw is not None and str(raw).strip() != "":
            try:
                amount = float(raw)
            except (ValueError, TypeError):
                amount = None
        cursor.execute(
            "INSERT INTO results (player_id, night_id, amount) VALUES (?, ?, ?)",
            (pid, night_id, amount)
        )

    db.commit()
    create_backup()
    return jsonify({"success": True, "night": {"id": night_id, "label": label, "number": next_num}})


@app.route('/api/nights/latest', methods=['DELETE'])
@login_required
def remove_latest_night():
    db = get_db()
    last = db.execute("SELECT id FROM nights ORDER BY night_number DESC LIMIT 1").fetchone()
    if not last:
        return jsonify({"error": "No nights to remove"}), 404

    db.execute("DELETE FROM nights WHERE id = ?", (last['id'],))
    db.commit()
    create_backup()
    return jsonify({"success": True})


@app.route('/api/change-password', methods=['POST'])
@login_required
def change_password():
    data = request.get_json()
    current = data.get('current', '')
    new_pw = data.get('new', '')

    if not current or not new_pw:
        return jsonify({"error": "Both current and new passwords are required"}), 400

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (session['user_id'],)).fetchone()
    if not user or not check_password_hash(user['password_hash'], current):
        return jsonify({"error": "Current password is incorrect"}), 403

    db.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        (generate_password_hash(new_pw), session['user_id'])
    )
    db.commit()
    create_backup()
    return jsonify({"success": True})


if __name__ == '__main__':
    with app.app_context():
        init_db()
    # Bind 0.0.0.0 so it's accessible from other machines on your network
    app.run(host='0.0.0.0', port=5000, debug=False)
