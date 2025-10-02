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
  if (!window.Chart) {
    console.warn('Chart.js not loaded, skipping chart render');
    return;
  }

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
        { 
          label: 'Income', 
          data: inc,
          borderColor: '#16A34A',
          backgroundColor: 'rgba(22, 163, 74, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#16A34A',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7
        },
        { 
          label: 'Expenses', 
          data: exp,
          borderColor: '#DC2626',
          backgroundColor: 'rgba(220, 38, 38, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#DC2626',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7
        }
      ]
    },
    options: { 
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: { 
        legend: { 
          position: 'bottom',
          labels: {
            padding: 20,
            usePointStyle: true,
            pointStyle: 'circle',
            font: {
              family: 'Manrope, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
              size: 12,
              weight: '600'
            },
            color: '#0E5B62'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(14, 91, 98, 0.95)',
          titleColor: '#ffffff',
          bodyColor: '#ffffff',
          borderColor: '#0E5B62',
          borderWidth: 1,
          cornerRadius: 8,
          displayColors: true,
          titleFont: {
            family: 'Manrope, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
            size: 13,
            weight: '600'
          },
          bodyFont: {
            family: 'Manrope, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
            size: 12,
            weight: '500'
          },
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: $${context.parsed.y.toLocaleString()}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: true,
            color: 'rgba(14, 91, 98, 0.1)',
            lineWidth: 1
          },
          ticks: {
            font: {
              family: 'Manrope, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
              size: 10,
              weight: '500'
            },
            color: '#0E5B62',
            maxRotation: 45,
            minRotation: 0
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            display: true,
            color: 'rgba(14, 91, 98, 0.1)',
            lineWidth: 1
          },
          ticks: {
            font: {
              family: 'Manrope, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
              size: 10,
              weight: '500'
            },
            color: '#0E5B62',
            callback: function(value) {
              return '$' + value.toLocaleString();
            }
          }
        }
      }
    }
  });
}

function renderPieByCategory(id, tx, cats, label) {
  const canvas = getCanvas(id);
  if (!canvas) return;
  if (!window.Chart) {
    console.warn('Chart.js not loaded, skipping chart render');
    return;
  }

  kill(id);

  const toUSD = t => t.currency === 'USD' ? Number(t.amount) : Number(t.amount) * Number(t.fxRate || 1);
  const map = {};
  
  tx.forEach(t => {
    const categoryId = t.categoryId || t.toCategoryId;
    const category = cats.find(c => c.id === categoryId);
    
    if (category) {
      // If it's a subcategory, use the parent category name
      let categoryName;
      if (category.parentCategoryId) {
        const parentCategory = cats.find(c => c.id === category.parentCategoryId);
        categoryName = parentCategory ? parentCategory.name : category.name;
      } else {
        categoryName = category.name;
      }
      
      map[categoryName] = (map[categoryName] || 0) + toUSD(t);
    } else {
      map['Other'] = (map['Other'] || 0) + toUSD(t);
    }
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
  if (!canvas) {
    console.warn(`Canvas element with id '${id}' not found`);
    return;
  }
  if (!window.Chart) {
    console.warn('Chart.js not loaded, skipping chart render');
    return;
  }

  kill(id);

  const s = [...snaps].sort((a,b) => a.date > b.date ? 1 : -1);
  console.log('Rendering net worth chart with data:', s);
  
  try {
    _charts[id] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: s.map(x => x.date),
        datasets: [{ 
          label: 'Net Worth (USD)', 
          data: s.map(x => Number(x.net_worth_usd || x.netWorthUSD || 0)),
          borderColor: 'var(--primary)',
          backgroundColor: 'rgba(74, 144, 226, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: { 
        responsive: true, 
        plugins: { legend: { position: 'bottom' } },
        scales: {
          y: {
            beginAtZero: false,
            ticks: {
              callback: function(value) {
                return '$' + value.toLocaleString();
              }
            }
          }
        }
      }
    });
    console.log('Net worth chart rendered successfully');
  } catch (error) {
    console.error('Error rendering net worth chart:', error);
  }
}

function renderAssetAllocation(id, accounts) {
  const canvas = getCanvas(id);
  if (!canvas) {
    console.warn(`Canvas element with id '${id}' not found`);
    return;
  }
  if (!window.Chart) {
    console.warn('Chart.js not loaded, skipping chart render');
    return;
  }

  kill(id);

  // Only show assets (positive balances)
  const assetAccounts = accounts.filter(account => account.balance > 0);
  console.log('Rendering asset allocation chart with accounts:', assetAccounts);
  
  if (assetAccounts.length === 0) {
    canvas.parentElement.innerHTML = '<div class="muted small text-center">No assets to display</div>';
    return;
  }

  // Group accounts by type
  const grouped = assetAccounts.reduce((acc, account) => {
    const type = account.type;
    if (!acc[type]) {
      acc[type] = { total: 0, accounts: [] };
    }
    acc[type].total += account.balance;
    acc[type].accounts.push(account);
    return acc;
  }, {});

  const labels = Object.keys(grouped);
  const data = labels.map(type => grouped[type].total);
  const colors = [
    '#4A90E2', '#7ED321', '#F5A623', '#D0021B', 
    '#9013FE', '#50E3C2', '#B8E986', '#4A4A4A'
  ];

  console.log('Asset allocation data:', { labels, data, grouped });

  try {
    _charts[id] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels.map(type => type.charAt(0).toUpperCase() + type.slice(1).replace('-', ' ')),
        datasets: [{
          data: data,
          backgroundColor: colors.slice(0, labels.length),
          borderWidth: 1,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { 
            position: 'bottom',
            labels: {
              padding: 10,
              usePointStyle: true,
              font: { size: 11 }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const value = context.parsed;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return `${context.label}: $${value.toLocaleString()} (${percentage}%)`;
              }
            }
          }
        },
        cutout: '60%'
      }
    });
    console.log('Asset allocation chart rendered successfully');
  } catch (error) {
    console.error('Error rendering asset allocation chart:', error);
  }
}

window.Charts = { renderCashFlow, renderPieByCategory, renderNetWorth, renderAssetAllocation };

