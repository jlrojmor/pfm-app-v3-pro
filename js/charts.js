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

  // Get the canvas container to determine proper height
  const container = canvas.parentElement;
  const containerHeight = container ? container.clientHeight || 300 : 300;
  
  const ctx = canvas.getContext('2d');
  
  // Create gradients that will be updated after chart renders
  // We'll use a plugin to update them with actual chart dimensions

  _charts[id] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [
        { 
          label: 'Income', 
          data: inc,
          borderColor: '#10b981', // Professional green
          backgroundColor: 'rgba(16, 185, 129, 0.2)', // Temporary, will be replaced by plugin
          borderWidth: 2.5,
          fill: true,
          tension: 0.5, // Smooth curves
          pointBackgroundColor: '#10b981',
          pointBorderColor: '#0b1020', // Dark background color
          pointBorderWidth: 2,
          pointRadius: 0, // Hide points by default
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#10b981',
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2
        },
        { 
          label: 'Expenses', 
          data: exp,
          borderColor: '#ef4444', // Professional red
          backgroundColor: 'rgba(239, 68, 68, 0.2)', // Temporary, will be replaced by plugin
          borderWidth: 2.5,
          fill: true,
          tension: 0.5, // Smooth curves
          pointBackgroundColor: '#ef4444',
          pointBorderColor: '#0b1020', // Dark background color
          pointBorderWidth: 2,
          pointRadius: 0, // Hide points by default
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#ef4444',
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2
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
      animation: {
        duration: 1000,
        easing: 'easeInOutQuart'
      },
      plugins: { 
        legend: { 
          position: 'bottom',
          align: 'center',
          labels: {
            padding: 15,
            usePointStyle: true,
            pointStyle: 'circle',
            font: {
              family: 'system-ui, -apple-system, sans-serif',
              size: 11,
              weight: '600'
            },
            color: '#9fb0d1',
            boxWidth: 8,
            boxHeight: 8
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#e7ecff',
          bodyColor: '#e7ecff',
          borderColor: '#1e2540',
          borderWidth: 1,
          cornerRadius: 8,
          displayColors: true,
          padding: 12,
          titleFont: {
            family: 'system-ui, -apple-system, sans-serif',
            size: 12,
            weight: '600'
          },
          bodyFont: {
            family: 'system-ui, -apple-system, sans-serif',
            size: 11,
            weight: '500'
          },
          callbacks: {
            title: function(context) {
              return context[0].label;
            },
            label: function(context) {
              const value = context.parsed.y;
              const sign = value >= 0 ? '+' : '';
              return `${context.dataset.label}: ${sign}$${value.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            },
            labelColor: function(context) {
              return {
                borderColor: context.dataset.borderColor,
                backgroundColor: context.dataset.borderColor,
                borderWidth: 2,
                borderRadius: 2
              };
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: true,
            color: 'rgba(159, 176, 209, 0.08)',
            lineWidth: 1,
            drawBorder: false
          },
          ticks: {
            font: {
              family: 'system-ui, -apple-system, sans-serif',
              size: 10,
              weight: '500'
            },
            color: '#9fb0d1',
            maxRotation: 45,
            minRotation: 0,
            padding: 8
          },
          border: {
            display: false
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            display: true,
            color: 'rgba(159, 176, 209, 0.08)',
            lineWidth: 1,
            drawBorder: false,
            drawOnChartArea: true
          },
          ticks: {
            font: {
              family: 'system-ui, -apple-system, sans-serif',
              size: 10,
              weight: '500'
            },
            color: '#9fb0d1',
            padding: 10,
            callback: function(value) {
              if (value >= 1000) {
                return '$' + (value / 1000).toFixed(1) + 'k';
              }
              return '$' + value.toLocaleString();
            }
          },
          border: {
            display: false
          }
        }
      },
      elements: {
        line: {
          capBezierPoints: false
        }
      }
    },
    plugins: [{
      id: 'gradientFill',
      beforeDatasetsDraw: function(chart) {
        const chartArea = chart.chartArea;
        if (!chartArea) return;
        
        const ctx = chart.ctx;
        const height = chartArea.bottom - chartArea.top;
        
        // Only update if chart area exists and is valid
        // Use a flag to prevent infinite updates
        if (height > 0 && !chart._gradientsSet) {
          // Create income gradient with actual chart dimensions
          const incomeGradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          incomeGradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
          incomeGradient.addColorStop(0.5, 'rgba(16, 185, 129, 0.2)');
          incomeGradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
          
          // Create expense gradient with actual chart dimensions
          const expenseGradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          expenseGradient.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
          expenseGradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.2)');
          expenseGradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
          
          // Apply gradients to datasets once
          if (chart.data.datasets[0]) {
            chart.data.datasets[0].backgroundColor = incomeGradient;
          }
          if (chart.data.datasets[1]) {
            chart.data.datasets[1].backgroundColor = expenseGradient;
          }
          
          // Mark as set to prevent re-setting
          chart._gradientsSet = true;
        }
      }
    }]
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

  // Professional trading-style color palette
  const tradingColors = [
    '#10b981', // Green
    '#ef4444', // Red
    '#3b82f6', // Blue
    '#f59e0b', // Amber
    '#8b5cf6', // Purple
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#f97316', // Orange
    '#84cc16', // Lime
    '#6366f1', // Indigo
    '#14b8a6', // Teal
    '#f43f5e'  // Rose
  ];

  // Generate colors with gradients and shadows
  const colors = Object.keys(map).map((_, index) => {
    const baseColor = tradingColors[index % tradingColors.length];
    return baseColor;
  });

  // Create gradient colors for each slice
  const backgroundColors = colors.map((color, index) => {
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, color + 'cc'); // Slightly transparent
    return color; // Use solid color for now, gradients applied via plugin
  });

  const data = Object.values(map);
  const labels = Object.keys(map);
  const total = data.reduce((sum, val) => sum + val, 0);

  _charts[id] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        label: label,
        data: data,
        backgroundColor: colors,
        borderColor: '#0f172a', // Dark border
        borderWidth: 2,
        hoverBorderWidth: 3,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          align: 'center',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 12,
            font: {
              family: 'system-ui, -apple-system, sans-serif',
              size: 11,
              weight: '500',
              color: '#e2e8f0' // Light grey/white for readability on dark background
            },
            color: '#e2e8f0', // Light grey/white for readability on dark background
            generateLabels: function(chart) {
              const data = chart.data;
              if (data.labels.length && data.datasets.length) {
                return data.labels.map((label, i) => {
                  const value = data.datasets[0].data[i];
                  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                  return {
                    text: `${label} (${percentage}%)`,
                    fillStyle: colors[i],
                    strokeStyle: colors[i],
                    lineWidth: 2,
                    hidden: false,
                    index: i,
                    fontColor: '#e2e8f0' // Light grey/white text
                  };
                });
              }
              return [];
            }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#e2e8f0',
          bodyColor: '#cbd5e1',
          borderColor: '#334155',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          displayColors: true,
          usePointStyle: true,
          callbacks: {
            title: function(context) {
              return context[0].label;
            },
            label: function(context) {
              const value = context.parsed;
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return `${Utils.formatMoneyUSD(value)} (${percentage}%)`;
            },
            labelColor: function(context) {
              return {
                borderColor: colors[context.dataIndex],
                backgroundColor: colors[context.dataIndex],
                borderWidth: 2,
                borderRadius: 2
              };
            }
          },
          titleFont: {
            family: 'system-ui, -apple-system, sans-serif',
            size: 13,
            weight: '600'
          },
          bodyFont: {
            family: 'system-ui, -apple-system, sans-serif',
            size: 12,
            weight: '500'
          }
        }
      },
      animation: {
        animateRotate: true,
        animateScale: true,
        duration: 1000,
        easing: 'easeInOutQuart'
      },
      elements: {
        arc: {
          borderJoinStyle: 'round'
        }
      }
    }
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


