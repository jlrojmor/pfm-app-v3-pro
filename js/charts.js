let _charts = {};

// Kill a chart instance if it exists and is destroyable
function kill(id) {
  const inst = _charts[id];
  if (inst && typeof inst.destroy === "function") {
    try { inst.destroy(); } catch (e) { /* ignore */ }
  }
  delete _charts[id];
}

// Get a canvas by id; return null if not present (e.g., different route)
function getCanvas(id) {
  const el = document.getElementById(id);
  if (!el || el.tagName !== 'CANVAS') return null;
  return el;
}

function renderCashFlow(id, tx, start, end) {
  const canvas = getCanvas(id);
  if (!canvas) return;           // Not on this route/page → do nothing

  kill(id);

  const s = new Date(start), e = new Date(end);
  const days = Math.ceil((e - s) / 86400000);
  const buckets = [];

  // build time buckets (days<=60 → daily; <=365 → weekly; else monthly)
  if (days <= 60) {
    let cur = new Date(s);
    while (cur <= e) {
      const nxt = new Date(cur); nxt.setDate(nxt.getDate() + 1);
      buckets.push({ label: cur.toISOString().slice(0,10), start: new Date(cur), end: nxt });
      cur.setDate(cur.getDate() + 1);
    }
  } else if (days <= 365) {
    let cur = new Date(s);
    while (cur <= e) {
      const nxt = new Date(cur); nxt.setDate(nxt.getDate() + 7);
      buckets.push({ label: cur.toISOString().slice(0,10), start: new Date(cur), end: nxt });
      cur.setDate(cur.getDate() + 7);
    }
  } else {
    let cur = new Date(s.getFullYear(), s.getMonth(), 1);
    while (cur <= e) {
      const nxt = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
      const label = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`;
      buckets.push({ label, start: new Date(cur), end: nxt });
      cur.setMonth(cur.getMonth() + 1, 1);
    }
  }

  const toUSD = t => t.currency === 'USD' ? Number(t.amount) : Number(t.amount) * Number(t.fxRate || 1);

  const inc = buckets.map(b =>
    tx.filter(t => (t.transactionType === 'Income' || t.transactionType === 'I') &&
                   t.date >= b.start.toISOString().slice(0,10) &&
                   t.date <= b.end.toISOString().slice(0,10))
      .reduce((s,t)=> s + toUSD(t), 0)
  );

  const exp = buckets.map(b =>
    tx.filter(t => (t.transactionType === 'Expense' || t.transactionType === 'E') &&
                   t.date >= b.start.toISOString().slice(0,10) &&
                   t.date <= b.end.toISOString().slice(0,10))
      .reduce((s,t)=> s + toUSD(t), 0)
  );

  _charts[id] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [
        { label: 'Income', data: inc },
        { label: 'Expenses', data: exp }
      ]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
}

function renderPieByCategory(id, tx, cats, label) {
  const canvas = getCanvas(id);
  if (!canvas) return;

  kill(id);

  const toUSD = t => t.currency === 'USD' ? Number(t.amount) : Number(t.amount) * Number(t.fxRate || 1);
  const map = {};
  tx.forEach(t => {
    const name = cats.find(c => c.id === (t.categoryId || t.toCategoryId))?.name || 'Other';
    map[name] = (map[name] || 0) + toUSD(t);
  });

  _charts[id] = new Chart(canvas, {
    type: 'pie',
    data: {
      labels: Object.keys(map),
      datasets: [{ label, data: Object.values(map) }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
}

function renderNetWorth(id, snaps) {
  const canvas = getCanvas(id);
  if (!canvas) return;

  kill(id);

  const s = [...snaps].sort((a,b) => a.date > b.date ? 1 : -1);
  _charts[id] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: s.map(x => x.date),
      datasets: [{ label: 'Net Worth (USD)', data: s.map(x => Number(x.net_worth_usd || x.netWorthUSD || 0)) }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
}

window.Charts = { renderCashFlow, renderPieByCategory, renderNetWorth };

