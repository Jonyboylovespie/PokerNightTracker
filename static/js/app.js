let currentState = null;
let chartInstance = null;

// Distinct chart colors (hex)
const CHART_COLORS = [
    '#fbbf24', '#f87171', '#60a5fa', '#34d399', '#a78bfa',
    '#f472b6', '#fb923c', '#2dd4bf', '#e879f9', '#22d3ee',
    '#facc15', '#a3e635', '#c084fc', '#f87171', '#38bdf8'
];

async function fetchState() {
    try {
        const res = await fetch('/api/state');
        if (!res.ok) throw new Error('Failed to fetch state');
        currentState = await res.json();
        renderAll();
    } catch (e) {
        console.error(e);
        showStatus('Error loading data', true);
    }
}

function formatMoney(val) {
    if (val === null || val === undefined) return '';
    const num = Number(val);
    const prefix = num >= 0 ? '+' : '';
    return prefix + num.toFixed(2);
}

function showStatus(msg, isError = false) {
    const el = document.getElementById('status-msg');
    el.textContent = msg;
    el.className = 'text-sm min-w-[120px] text-right transition-colors ' + (isError ? 'text-red-400' : 'text-emerald-300/80');
    setTimeout(() => { el.textContent = ''; }, 3000);
}

function renderAll() {
    renderResultsTable();
    renderChart();
}

function renderResultsTable() {
    const thead = document.querySelector('#results-table thead tr');
    const tbody = document.querySelector('#results-table tbody');

    // Rebuild header
    thead.innerHTML = '<th class="px-6 py-3 font-medium">Player</th>';
    (currentState.nights || []).forEach(n => {
        const th = document.createElement('th');
        th.className = 'px-3 py-3 font-medium text-right';
        th.textContent = n.label;
        thead.appendChild(th);
    });
    const totalTh = document.createElement('th');
    totalTh.className = 'px-4 py-3 font-medium text-right';
    totalTh.textContent = 'Total';
    thead.appendChild(totalTh);

    // Rebuild body
    tbody.innerHTML = '';
    (currentState.sorted_players || []).forEach(p => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-emerald-800/20 transition-colors';

        // Name cell
        const nameTd = document.createElement('td');
        nameTd.className = 'px-6 py-3 font-medium text-white';
        nameTd.textContent = p.name;
        tr.appendChild(nameTd);

        // Night cells
        (currentState.nights || []).forEach(n => {
            const val = currentState.matrix[p.id][n.id];
            const td = document.createElement('td');
            td.className = 'px-3 py-3 text-right tabular-nums ' + (val !== null && val !== undefined ? (val >= 0 ? 'text-emerald-300' : 'text-red-300') : 'text-emerald-700/30');
            td.textContent = formatMoney(val);
            tr.appendChild(td);
        });

        // Total cell
        const totalVal = currentState.totals[p.id];
        const totalTd = document.createElement('td');
        totalTd.className = 'px-4 py-3 text-right font-bold tabular-nums ' + (totalVal >= 0 ? 'text-yellow-400' : 'text-red-400');
        totalTd.textContent = formatMoney(totalVal);
        tr.appendChild(totalTd);

        tbody.appendChild(tr);
    });
}
function renderChart() {
    const ctx = document.getElementById('cumulativeChart').getContext('2d');

    const labels = (currentState.nights || []).map(n => n.label);
    const datasets = (currentState.sorted_players || []).map((p, idx) => {
        const color = CHART_COLORS[idx % CHART_COLORS.length];
        const data = (currentState.cumulative[p.id] || []).map(v => v === null ? NaN : v);
        return {
            label: p.name,
            data: data,
            borderColor: color,
            backgroundColor: color,
            tension: 0.2,
            pointRadius: 4,
            pointHoverRadius: 6,
            spanGaps: true // Carry line forward over nulls once started
        };
    });

    if (chartInstance) {
        chartInstance.destroy();
    }

    const zeroLinePlugin = {
        id: 'zeroLine',
        afterDraw: (chart) => {
            const ctx = chart.ctx;
            const yAxis = chart.scales.y;
            const xAxis = chart.scales.x;
            const y = yAxis.getPixelForValue(0);
            if (y >= yAxis.top && y <= yAxis.bottom) {
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(xAxis.left, y);
                ctx.lineTo(xAxis.right, y);
                ctx.lineWidth = 2;
                ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)'; // red with some transparency
                ctx.setLineDash([6, 4]);
                ctx.stroke();
                ctx.restore();
            }
        }
    };

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        plugins: [zeroLinePlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    labels: { color: '#d1fae5', font: { family: 'Inter', size: 12 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(2, 44, 34, 0.95)',
                    titleColor: '#fbbf24',
                    bodyColor: '#d1fae5',
                    borderColor: 'rgba(251, 191, 36, 0.2)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            const val = context.parsed.y;
                            if (isNaN(val)) return label + '-';
                            return label + (val >= 0 ? '+' : '') + val.toFixed(2);
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#6ee7b7', font: { family: 'Inter' } },
                    grid: { color: 'rgba(6, 78, 59, 0.5)' }
                },
                y: {
                    ticks: {
                        color: '#6ee7b7',
                        font: { family: 'Inter' },
                        callback: function(value) { return (value >= 0 ? '+' : '') + value.toFixed(0); }
                    },
                    grid: { color: 'rgba(6, 78, 59, 0.5)' }
                }
            }
        }
    });
}

// ---- Modals ----

function openAddPlayer() {
    document.getElementById('modal-player').classList.remove('hidden');
    document.getElementById('new-player-name').value = '';
    document.getElementById('new-player-name').focus();
}

function closeAddPlayer() {
    document.getElementById('modal-player').classList.add('hidden');
}

async function submitAddPlayer() {
    const name = document.getElementById('new-player-name').value.trim();
    if (!name) return;
    try {
        const res = await fetch('/api/players', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (res.ok) {
            showStatus(`Added player: ${name}`);
            closeAddPlayer();
            fetchState();
        } else {
            showStatus(data.error || 'Error adding player', true);
        }
    } catch (e) {
        showStatus('Network error', true);
    }
}

function openAddNight() {
    const container = document.getElementById('night-inputs');
    container.innerHTML = '';

    if (!currentState || !currentState.players || currentState.players.length === 0) {
        container.innerHTML = '<p class="text-emerald-200/70 text-sm">No players yet. Add players first.</p>';
    } else {
        currentState.players.forEach(p => {
            const row = document.createElement('div');
            row.className = 'flex items-center gap-3';
            row.innerHTML = `
                <label class="w-28 text-sm font-medium text-emerald-100 truncate">${p.name}</label>
                <input type="number" step="0.01" data-player-id="${p.id}" placeholder="0.00"
                    class="flex-1 px-3 py-2 rounded-lg bg-emerald-950/50 border border-emerald-700/50 text-white placeholder-emerald-600 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 tabular-nums">
            `;
            container.appendChild(row);
        });
    }

    document.getElementById('modal-night').classList.remove('hidden');
    const firstInput = container.querySelector('input');
    if (firstInput) firstInput.focus();
}

function closeAddNight() {
    document.getElementById('modal-night').classList.add('hidden');
}

async function submitAddNight() {
    const inputs = document.querySelectorAll('#night-inputs input[data-player-id]');
    const results = {};
    let total = 0;

    inputs.forEach(input => {
        const val = input.value.trim();
        const num = val !== '' ? parseFloat(val) : 0;
        if (!isNaN(num)) {
            total += num;
        }
        if (val !== '') {
            results[input.dataset.playerId] = val;
        }
    });

    if (Math.abs(total) > 0.001) {
        alert(`The total of all amounts must equal $0.00 for a balanced night.\nCurrent total: ${total.toFixed(2)}`);
        return;
    }

    try {
        const res = await fetch('/api/nights', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ results })
        });
        const data = await res.json();
        if (res.ok) {
            showStatus(`Added ${data.night.label}`);
            closeAddNight();
            fetchState();
        } else {
            showStatus(data.error || 'Error adding night', true);
        }
    } catch (e) {
        showStatus('Network error', true);
    }
}

async function removeLatestNight() {
    if (!confirm('Are you sure you want to remove the last night?')) return;
    try {
        const res = await fetch('/api/nights/latest', { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
            showStatus('Removed last night');
            fetchState();
        } else {
            showStatus(data.error || 'Error removing night', true);
        }
    } catch (e) {
        showStatus('Network error', true);
    }
}

// ---- Change Password ----

function openChangePassword() {
    document.getElementById('modal-password').classList.remove('hidden');
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value = '';
    document.getElementById('pw-current').focus();
}

function closeChangePassword() {
    document.getElementById('modal-password').classList.add('hidden');
}

async function submitChangePassword() {
    const current = document.getElementById('pw-current').value;
    const newPw = document.getElementById('pw-new').value;
    if (!current || !newPw) {
        showStatus('Fill in both fields', true);
        return;
    }
    try {
        const res = await fetch('/api/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ current, new: newPw })
        });
        const data = await res.json();
        if (res.ok) {
            showStatus('Password updated');
            closeChangePassword();
        } else {
            showStatus(data.error || 'Error updating password', true);
        }
    } catch (e) {
        showStatus('Network error', true);
    }
}

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAddPlayer();
        closeAddNight();
        closeChangePassword();
    }
});

// Init
fetchState();
