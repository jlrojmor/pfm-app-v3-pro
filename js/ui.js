// ui.js — all renderers (V5)
function filterTxByRange(tx, s, e){ return tx.filter(t=> Utils.within(t.date, s, e)); }
function toUSD(txn){ return txn.currency==='USD'? Number(txn.amount) : Number(txn.amount)*Number(txn.fxRate||1); }
function creditCardAccounts(){ return AppState.State.accounts.filter(a=> Utils.accountType(a)==='credit-card'); }
function calcNetWorthInsights(series){
  if(!series.length) return { 
    current:0, prev:0, change:0, changePercent:0, 
    largestAsset:null, largestLiability:null, ratio:null,
    totalAssets:0, totalLiabilities:0, accountBreakdown:[], 
    monthlyGrowth:0, yearlyGrowth:0, trend: 'stable'
  };
  
  const current = series[series.length-1].netWorthUSD;
  const lastMonthDate = new Date(series[series.length-1].date);
  lastMonthDate.setMonth(lastMonthDate.getMonth()-1);
  
  let prev = series[0];
  for(const point of series){
    if(new Date(point.date) <= lastMonthDate){ prev = point; } else break;
  }
  
  const change = current - (prev?.netWorthUSD || 0);
  const changePercent = prev?.netWorthUSD ? (change / Math.abs(prev.netWorthUSD)) * 100 : 0;
  
  // Calculate assets and liabilities properly
  const assets = AppState.State.accounts.filter(a => {
    const type = Utils.accountType(a);
    const balance = Utils.currentBalanceUSD(a);
    // Only include positive balances from asset accounts
    return (type === 'checking' || type === 'savings' || type === 'cash' || type === 'investment') && balance > 0;
  }).map(a => ({
    account: a,
    balance: Utils.currentBalanceUSD(a),
    type: Utils.accountType(a)
  }));
  
  const liabilities = AppState.State.accounts.filter(a => {
    const type = Utils.accountType(a);
    const balance = Utils.currentBalanceUSD(a);
    
    // Credit cards and loans are always liabilities
    if (type === 'credit-card' || type === 'loan') {
      return true;
    }
    
    // Other accounts with negative balances are liabilities
    return balance < 0;
  }).map(a => ({
    account: a,
    balance: Math.abs(Utils.currentBalanceUSD(a)), // Show as positive for display
    type: Utils.accountType(a)
  }));
  
  const largestAsset = assets.sort((a,b) => b.balance - a.balance)[0] || null;
  const largestLiability = liabilities.sort((a,b) => Math.abs(b.balance) - Math.abs(a.balance))[0] || null;
  
  const totalAssets = assets.reduce((s,a) => s + Math.max(0, a.balance), 0);
  const totalLiabilities = liabilities.reduce((s,a) => s + Math.abs(a.balance), 0);
  const ratio = totalAssets > 0 ? totalLiabilities / totalAssets : null;
  
  // Calculate growth rates
  let monthlyGrowth = 0;
  let yearlyGrowth = 0;
  let trend = 'stable';
  
  if(series.length >= 2) {
    const lastMonth = series[series.length - 1];
    const twoMonthsAgo = series[Math.max(0, series.length - 2)];
    monthlyGrowth = twoMonthsAgo.netWorthUSD ? 
      ((lastMonth.netWorthUSD - twoMonthsAgo.netWorthUSD) / Math.abs(twoMonthsAgo.netWorthUSD)) * 100 : 0;
  }
  
  if(series.length >= 12) {
    const lastYear = series[series.length - 1];
    const yearAgo = series[Math.max(0, series.length - 12)];
    yearlyGrowth = yearAgo.netWorthUSD ? 
      ((lastYear.netWorthUSD - yearAgo.netWorthUSD) / Math.abs(yearAgo.netWorthUSD)) * 100 : 0;
  }
  
  // Determine trend
  if(changePercent > 5) trend = 'growing';
  else if(changePercent < -5) trend = 'declining';
  else trend = 'stable';
  
  // Account breakdown
  const accountBreakdown = [...assets, ...liabilities]
    .filter(a => Math.abs(a.balance) > 0.01)
    .sort((a,b) => Math.abs(b.balance) - Math.abs(a.balance));
  
  return { 
    current, prev: prev?.netWorthUSD || 0, change, changePercent,
    largestAsset, largestLiability, ratio, totalAssets, totalLiabilities,
    accountBreakdown, monthlyGrowth, yearlyGrowth, trend
  };
}
function buildDueEvents(monthsToRender=2, cardsInput){
  const cards=(cardsInput||creditCardAccounts()).filter(c=> c.dueDay);
  const today=new Date(); today.setHours(0,0,0,0);
  const months=[];
  const base=new Date(today.getFullYear(), today.getMonth(),1);
  for(let i=0;i<monthsToRender;i++){ months.push(new Date(base.getFullYear(), base.getMonth()+i,1)); }
  return months.map(monthDate=>{
    const days=new Date(monthDate.getFullYear(), monthDate.getMonth()+1,0).getDate();
    const rows=[];
    for(let d=1; d<=days; d++){
      const iso=new Date(monthDate.getFullYear(), monthDate.getMonth(), d).toISOString().slice(0,10);
      const events=cards.flatMap(card=>{
        const dueIso=new Date(monthDate.getFullYear(), monthDate.getMonth(), Math.min(card.dueDay,28)).toISOString().slice(0,10);
        if(dueIso===iso && !Utils.isDuePaid(card, iso)){
          return [{ name:card.name, amount:card.minimumPaymentDue||0 }];
        }
        return [];
      });
      rows.push({ iso, day:d, events });
    }
    return { month:monthDate, rows };
  });
}
function kpisForRange(s,e){
  const tx=filterTxByRange(AppState.State.transactions,s,e);
  const income=tx.filter(t=>t.transactionType==='Income').reduce((a,t)=>a+toUSD(t),0);
  const expenses=tx.filter(t=>t.transactionType==='Expense').reduce((a,t)=>a+toUSD(t),0);
  const net=income-expenses;
  const expOnly=tx.filter(t=>t.transactionType==='Expense');
  // Find the largest expense transaction (not just the amount)
  let largestTransaction = null;
  let largestAmount = 0;
  expOnly.forEach(t => {
    const amount = toUSD(t);
    if (amount > largestAmount) {
      largestAmount = amount;
      largestTransaction = t;
    }
  });
  
  const byCat=Utils.groupBy(expOnly, t=>{ const cat=Utils.categoryById(t.categoryId); return cat? (cat.parentCategoryId||cat.id) : '—'; }); let top='—', topVal=0;
  Object.entries(byCat).forEach(([cid,arr])=>{ const sum=arr.reduce((s,t)=>s+toUSD(t),0); if(sum>topVal){ topVal=sum; top=Utils.parentCategoryName(cid); } });
  
  return {income,expenses,net,largest:largestAmount,largestTransaction,topCatName:top,topCatAmount:topVal, txRange:tx};
}

async function renderDashboard(root){
  root.innerHTML = $('#tpl-dashboard').innerHTML;
  const startEl=$('#dashStart'), endEl=$('#dashEnd');
  const today=Utils.todayISO(); const first=new Date(); first.setDate(1); startEl.value=first.toISOString().slice(0,10); endEl.value=today;
  async function apply(){
    await Utils.ensureTodayFX();
    const {income,expenses,net,largest,largestTransaction,topCatName,topCatAmount,txRange}=kpisForRange(startEl.value,endEl.value);
        
        // Calculate proper P&L and Cash Flow statements
        let financials = {
          plIncome: income,
          plExpenses: expenses,
          plNet: net,
          cfIn: 0,
          cfOut: 0,
          cfNet: 0
        };
        
        // Calculate actual cash flow (different from P&L)
        try {
          // P&L: All income and expenses regardless of payment method
          financials.plIncome = income;
          financials.plExpenses = expenses;
          financials.plNet = net;
          
          // Cash Flow: Only actual cash movements
          let cashIn = 0;
          let cashOut = 0;
          
          txRange.forEach(txn => {
            const usdAmount = txn.currency === 'USD' ? Number(txn.amount) : Number(txn.amount) * Number(txn.fxRate || 1);
            
            if (txn.transactionType === 'Income') {
              // All income affects cash flow
              cashIn += usdAmount;
            } else if (txn.transactionType === 'Expense') {
              // Only expenses paid with cash/checking/savings affect cash flow
              const fromAccount = AppState.State.accounts.find(a => a.id === txn.fromAccountId);
              if (fromAccount && Utils.accountType(fromAccount) !== 'credit-card') {
                cashOut += usdAmount;
              }
              // Credit card expenses don't affect cash flow until payment is made
            } else if (txn.transactionType === 'Credit Card Payment') {
              // Credit card payments reduce cash flow
              cashOut += usdAmount;
            } else if (txn.transactionType === 'Transfer') {
              // Transfers between accounts should net to zero in cash flow
              // This is correct - transfer from checking to savings:
              // - cashOut increases (money leaving checking)
              // - cashIn increases (money entering savings)
              // - Net effect: 0 (which is correct for transfers)
              const fromAccount = AppState.State.accounts.find(a => a.id === txn.fromAccountId);
              const toAccount = AppState.State.accounts.find(a => a.id === txn.toAccountId);
              
              // Count as cash out from source account (if it's a cash account)
              if (fromAccount && Utils.accountType(fromAccount) !== 'credit-card') {
                cashOut += usdAmount;
              }
              // Count as cash in to destination account (if it's a cash account)
              if (toAccount && Utils.accountType(toAccount) !== 'credit-card') {
                cashIn += usdAmount;
              }
              // Note: This correctly nets to zero for cash-to-cash transfers
            }
          });
          
          financials.cfIn = cashIn;
          financials.cfOut = cashOut;
          financials.cfNet = cashIn - cashOut;
          
        } catch (error) {
          console.warn('Error calculating cash flow, using P&L values:', error);
          // Fallback to P&L values if calculation fails
          financials.cfIn = income;
          financials.cfOut = expenses;
          financials.cfNet = net;
        }
        
        // Update P&L Statement
        $('#plIncome').textContent = Utils.formatMoneyUSD(financials.plIncome);
        $('#plExpenses').textContent = Utils.formatMoneyUSD(financials.plExpenses);
        $('#plNet').textContent = Utils.formatMoneyUSD(financials.plNet);
        $('#plNet').className = `metric-value metric-net ${financials.plNet >= 0 ? 'metric-income' : 'metric-expense'}`;
        
        // Update Cash Flow Statement
        $('#cfIn').textContent = Utils.formatMoneyUSD(financials.cfIn);
        $('#cfOut').textContent = Utils.formatMoneyUSD(financials.cfOut);
        $('#cfNet').textContent = Utils.formatMoneyUSD(financials.cfNet);
        $('#cfNet').className = `metric-value metric-net ${financials.cfNet >= 0 ? 'metric-income' : 'metric-expense'}`;
        
        // Update insight KPIs
        if (largestTransaction) {
          const expenseText = `${Utils.formatMoneyUSD(largest)} - ${largestTransaction.description || 'No description'}`;
          const expenseDate = new Date(largestTransaction.date).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          });
          $('#kpiLargestExp').innerHTML = `<div>${expenseText}</div><div class="small muted">${expenseDate}</div>`;
        } else {
          $('#kpiLargestExp').textContent = '—';
        }
        
        // Update top category with amount
        if (topCatName !== '—' && topCatAmount > 0) {
          $('#kpiTopCat').innerHTML = `<div>${Utils.formatMoneyUSD(topCatAmount)} - ${topCatName}</div>`;
        } else {
          $('#kpiTopCat').textContent = topCatName || '—';
        }
        
        // Calculate additional insights
        const avgDaily = expenses > 0 ? expenses / Math.max(1, Math.floor((new Date(endEl.value) - new Date(startEl.value)) / (1000 * 60 * 60 * 24))) : 0;
        const txnCount = txRange.length;
        
        $('#kpiAvgDaily').textContent = avgDaily > 0 ? Utils.formatMoneyUSD(avgDaily) : '—';
        $('#kpiTxnCount').textContent = txnCount.toLocaleString();
    
    // Render charts with proper Chart.js availability check
    if (window.Chart && window.Charts) {
    Charts.renderCashFlow('chartCashFlow', txRange, startEl.value, endEl.value);
    Charts.renderPieByCategory('chartSpendCat', txRange.filter(t=>t.transactionType==='Expense'), AppState.State.categories, 'Spending (USD)');
    Charts.renderPieByCategory('chartIncomeCat', txRange.filter(t=>t.transactionType==='Income'), AppState.State.categories, 'Income (USD)');
    } else {
      // Show loading state for charts
      $('#chartCashFlow').parentElement.innerHTML = '<div class="card"><h3>Cash Flow Trend</h3><div class="muted">Loading charts...</div></div>';
      $('#chartSpendCat').parentElement.innerHTML = '<div class="card"><h3>Spending by Category</h3><div class="muted">Loading charts...</div></div>';
      $('#chartIncomeCat').parentElement.innerHTML = '<div class="card"><h3>Income by Category</h3><div class="muted">Loading charts...</div></div>';
      
      // Retry after Chart.js loads
      let retryCount = 0;
      const maxRetries = 50; // 5 seconds max
      const checkChart = () => {
        if (window.Chart && window.Charts) {
          // Restore chart containers
          $('#chartCashFlow').parentElement.innerHTML = '<div class="card"><h3>Cash Flow Trend</h3><canvas id="chartCashFlow" height="200"></canvas></div>';
          $('#chartSpendCat').parentElement.innerHTML = '<div class="card"><h3>Spending by Category</h3><canvas id="chartSpendCat" height="200"></canvas></div>';
          $('#chartIncomeCat').parentElement.innerHTML = '<div class="card"><h3>Income by Category</h3><canvas id="chartIncomeCat" height="200"></canvas></div>';
          
          // Render charts
          Charts.renderCashFlow('chartCashFlow', txRange, startEl.value, endEl.value);
          Charts.renderPieByCategory('chartSpendCat', txRange.filter(t=>t.transactionType==='Expense'), AppState.State.categories, 'Spending (USD)');
          Charts.renderPieByCategory('chartIncomeCat', txRange.filter(t=>t.transactionType==='Income'), AppState.State.categories, 'Income (USD)');
        } else if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(checkChart, 100);
        } else {
          // Chart.js failed to load, show text-based fallback
          const expenseData = txRange.filter(t=>t.transactionType==='Expense');
          const incomeData = txRange.filter(t=>t.transactionType==='Income');
          
              // Financial Statements Summary - proper calculation
              let financials = {
                plIncome: income,
                plExpenses: expenses,
                plNet: net,
                cfIn: 0,
                cfOut: 0,
                cfNet: 0
              };
              
              // Calculate actual cash flow
              try {
                let cashIn = 0;
                let cashOut = 0;
                
                txRange.forEach(txn => {
                  const usdAmount = txn.currency === 'USD' ? Number(txn.amount) : Number(txn.amount) * Number(txn.fxRate || 1);
                  
                  if (txn.transactionType === 'Income') {
                    cashIn += usdAmount;
                  } else if (txn.transactionType === 'Expense') {
                    const fromAccount = AppState.State.accounts.find(a => a.id === txn.fromAccountId);
                    if (fromAccount && Utils.accountType(fromAccount) !== 'credit-card') {
                      cashOut += usdAmount;
                    }
                  } else if (txn.transactionType === 'Credit Card Payment') {
                    cashOut += usdAmount;
                  } else if (txn.transactionType === 'Transfer') {
                    const fromAccount = AppState.State.accounts.find(a => a.id === txn.fromAccountId);
                    const toAccount = AppState.State.accounts.find(a => a.id === txn.toAccountId);
                    
                    if (fromAccount && Utils.accountType(fromAccount) !== 'credit-card') {
                      cashOut += usdAmount;
                    }
                    if (toAccount && Utils.accountType(toAccount) !== 'credit-card') {
                      cashIn += usdAmount;
                    }
                  }
                });
                
                financials.cfIn = cashIn;
                financials.cfOut = cashOut;
                financials.cfNet = cashIn - cashOut;
              } catch (error) {
                console.warn('Error in fallback cash flow calculation:', error);
                financials.cfIn = income;
                financials.cfOut = expenses;
                financials.cfNet = net;
              }
              
              $('#chartCashFlow').parentElement.innerHTML = `
                <div class="card">
                  <h3>Financial Statements Summary</h3>
                  <div class="muted">📊 Charts unavailable offline</div>
                  <div style="margin-top:1rem;">
                    <div style="padding:1rem; background:var(--muted-bg); border-radius:6px; margin-bottom:1rem;">
                      <h4 style="margin:0 0 .5rem 0; color:var(--primary);">📊 P&L Statement</h4>
                      <div><strong>Total Income:</strong> ${Utils.formatMoneyUSD(financials.plIncome)}</div>
                      <div><strong>Total Expenses:</strong> ${Utils.formatMoneyUSD(financials.plExpenses)}</div>
                      <div><strong>Net Profit/Loss:</strong> <span class="${financials.plNet >= 0 ? 'good' : 'bad'}">${Utils.formatMoneyUSD(financials.plNet)}</span></div>
                    </div>
                    <div style="padding:1rem; background:var(--muted-bg); border-radius:6px;">
                      <h4 style="margin:0 0 .5rem 0; color:var(--primary);">💰 Cash Flow Statement</h4>
                      <div><strong>Cash In:</strong> ${Utils.formatMoneyUSD(financials.cfIn)}</div>
                      <div><strong>Cash Out:</strong> ${Utils.formatMoneyUSD(financials.cfOut)}</div>
                      <div><strong>Net Cash Flow:</strong> <span class="${financials.cfNet >= 0 ? 'good' : 'bad'}">${Utils.formatMoneyUSD(financials.cfNet)}</span></div>
                    </div>
                  </div>
                </div>
              `;
          
          // Spending by Category (group subcategories under parent)
          const spendByCat = {};
          expenseData.forEach(t => {
            const category = AppState.State.categories.find(c => c.id === t.categoryId);
            let categoryName = 'Other';
            
            if (category) {
              if (category.parentCategoryId) {
                const parentCategory = AppState.State.categories.find(c => c.id === category.parentCategoryId);
                categoryName = parentCategory ? parentCategory.name : category.name;
              } else {
                categoryName = category.name;
              }
            }
            
            const amount = t.currency === 'USD' ? Number(t.amount) : Number(t.amount) * Number(t.fxRate || 1);
            spendByCat[categoryName] = (spendByCat[categoryName] || 0) + amount;
          });
          const spendList = Object.entries(spendByCat).sort((a,b) => b[1] - a[1]).slice(0, 5);
          
          $('#chartSpendCat').parentElement.innerHTML = `
            <div class="card">
              <h3>Spending by Category</h3>
              <div class="muted">📊 Charts unavailable offline</div>
              <div style="margin-top:1rem;">
                ${spendList.map(([cat, amount]) => 
                  `<div style="display:flex; justify-content:space-between; padding:.25rem 0; border-bottom:1px solid var(--border);">
                    <span>${cat}</span>
                    <span><strong>${Utils.formatMoneyUSD(amount)}</strong></span>
                  </div>`
                ).join('')}
              </div>
            </div>
          `;
          
          // Income by Category (group subcategories under parent)
          const incomeByCat = {};
          incomeData.forEach(t => {
            const category = AppState.State.categories.find(c => c.id === t.categoryId);
            let categoryName = 'Other';
            
            if (category) {
              if (category.parentCategoryId) {
                const parentCategory = AppState.State.categories.find(c => c.id === category.parentCategoryId);
                categoryName = parentCategory ? parentCategory.name : category.name;
              } else {
                categoryName = category.name;
              }
            }
            
            const amount = t.currency === 'USD' ? Number(t.amount) : Number(t.amount) * Number(t.fxRate || 1);
            incomeByCat[categoryName] = (incomeByCat[categoryName] || 0) + amount;
          });
          const incomeList = Object.entries(incomeByCat).sort((a,b) => b[1] - a[1]).slice(0, 5);
          
          $('#chartIncomeCat').parentElement.innerHTML = `
            <div class="card">
              <h3>Income by Category</h3>
              <div class="muted">📊 Charts unavailable offline</div>
              <div style="margin-top:1rem;">
                ${incomeList.length > 0 ? incomeList.map(([cat, amount]) => 
                  `<div style="display:flex; justify-content:space-between; padding:.25rem 0; border-bottom:1px solid var(--border);">
                    <span>${cat}</span>
                    <span><strong>${Utils.formatMoneyUSD(amount)}</strong></span>
                  </div>`
                ).join('') : '<div class="muted">No income data</div>'}
              </div>
            </div>
          `;
        }
      };
      checkChart();
    }
    
    const exp=txRange.filter(t=>t.transactionType==='Expense'); const byCat=Utils.groupBy(exp, t=> t.categoryId||'—'); const li=[];
    Object.values(byCat).forEach(arr=>{ const avg=arr.reduce((s,t)=>s+Number(t.amount),0)/Math.max(1,arr.length); arr.forEach(t=>{ if(Number(t.amount)>=3*avg){ const cat=AppState.State.categories.find(c=>c.id===t.categoryId)?.name||'—'; const from=AppState.State.accounts.find(a=>a.id===t.fromAccountId)?.name||'—'; li.push(`<li><strong>${t.date}</strong> — ${cat} — ${Utils.formatMoneyUSD(toUSD(t))} <span class="muted">(${from})</span></li>`); } }); });
    $('#unusualList').innerHTML = li.join('') || '<li class="muted">None</li>';
    $('#upcomingPayments30').innerHTML = listUpcoming(30);
  }
  $('#dashApply').addEventListener('click', apply); 
  
  // Ensure charts render when dashboard becomes visible
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        const target = mutation.target;
        if (target.id === 'dashboard' && target.style.display !== 'none') {
          // Dashboard is now visible, ensure charts are rendered
          setTimeout(() => {
            if (window.Chart && window.Charts) {
              const {income,expenses,net,largest,largestTransaction,topCatName,topCatAmount,txRange}=kpisForRange(startEl.value,endEl.value);
              Charts.renderCashFlow('chartCashFlow', txRange, startEl.value, endEl.value);
              Charts.renderPieByCategory('chartSpendCat', txRange.filter(t=>t.transactionType==='Expense'), AppState.State.categories, 'Spending (USD)');
              Charts.renderPieByCategory('chartIncomeCat', txRange.filter(t=>t.transactionType==='Income'), AppState.State.categories, 'Income (USD)');
            }
          }, 100);
        }
      }
    });
  });
  
  // Start observing the dashboard element
  const dashboardEl = document.getElementById('dashboard');
  if (dashboardEl) {
    observer.observe(dashboardEl, { attributes: true, attributeFilter: ['style'] });
  }
  
  apply();
}
function listUpcoming(days){
  const today=new Date(); const until=new Date(); until.setDate(until.getDate()+days);
  const cards=creditCardAccounts().filter(a=>a.dueDay); const up=[];
  cards.forEach(a=> Utils.nextDueDates(a,3).forEach(d=>{ const dt=new Date(d); if(dt>=today&&dt<=until&&!Utils.isDuePaid(a,d)){up.push({name:a.name,date:d,min:a.minimumPaymentDue||0}); } }));
  up.sort((a,b)=>a.date.localeCompare(b.date)); if(up.length===0) return '<li class="muted">No payments due in range.</li>';
  return up.map(a=> `<li><strong>${a.name}</strong> — Due ${a.date} — Min ${Utils.formatMoneyUSD(a.min)}</li>`).join('');
}

async function renderAccounts(root){
  root.innerHTML = $('#tpl-accounts').innerHTML;
  const list=$('#accountsList'); const dlg=$('#dlgAccount'); const form=$('#formAccount'); const btnAdd=$('#btnAddAccount'); const btnClose=$('#btnCloseAccount');
  const creditFields=()=>$all('.credit-only', form);
  function draw(){
    const accounts = [...AppState.State.accounts].map(a => AppState.normalizeAccount(a));
    
    // Group accounts by type
    const grouped = {
      'credit-card': accounts.filter(a => Utils.accountType(a) === 'credit-card'),
      'checking': accounts.filter(a => Utils.accountType(a) === 'checking'),
      'savings': accounts.filter(a => Utils.accountType(a) === 'savings'),
      'cash': accounts.filter(a => Utils.accountType(a) === 'cash')
    };
    
    // Sort each group by name
    Object.keys(grouped).forEach(type => {
      grouped[type].sort((a,b) => a.name.localeCompare(b.name));
    });
    
    const typeLabels = {
      'credit-card': '💳 Credit Cards',
      'checking': '🏦 Checking Accounts', 
      'savings': '💰 Savings Accounts',
      'cash': '💵 Cash'
    };
    
    let html = '';
    
    // Render each group in logical order
    const typeOrder = ['credit-card', 'checking', 'savings', 'cash'];
    
    typeOrder.forEach(type => {
      const accountsOfType = grouped[type];
      if (accountsOfType.length === 0) return;
      
      html += `<div class="account-group">
        <h3 class="group-header">${typeLabels[type]} (${accountsOfType.length})</h3>
        <div class="group-accounts">`;
      
      accountsOfType.forEach(account => {
        const balUSD = Utils.currentBalanceUSD(account);
        const limitUSD = Utils.creditLimitUSD(account);
        const accountType = Utils.accountType(account);
        const badgeLabel = accountType.replace('-', ' ');
        
        // Calculate current balance in native currency
        const currentBalanceNative = Utils.currentBalanceNative ? Utils.currentBalanceNative(account) : account.balanceAsOfAmount;
        const nativeBalance = Utils.formatMoney(currentBalanceNative, account.currency);
        const usdBalance = Utils.formatMoneyUSD(balUSD);
        
        // Credit card specific calculations
        let creditInfo = '';
        if (accountType === 'credit-card') {
          const available = Utils.getAvailableCredit ? Utils.getAvailableCredit(account) : (limitUSD - balUSD);
          const utilization = Utils.getCreditCardUtilization ? Utils.getCreditCardUtilization(account).toFixed(1) : (limitUSD > 0 ? ((balUSD / limitUSD) * 100).toFixed(1) : '0.0');
          const nextPayment = Utils.calculateCreditCardPaymentDue ? Utils.calculateCreditCardPaymentDue(account, Utils.nextDueDates(account, 1)[0] || Utils.todayISO()) : 0;
          const installmentInfo = Utils.getCreditCardInstallmentInfo ? Utils.getCreditCardInstallmentInfo(account) : { totalInstallments: 0, totalMonthlyPayment: 0, activeInstallments: [] };
          
          creditInfo = `
            <div class="account-credit-info">
              <div class="credit-metrics">
                <div class="credit-metric">
                  <span class="metric-label">Credit Limit</span>
                  <span class="metric-value">${Utils.formatMoneyUSD(limitUSD)}</span>
            </div>
                <div class="credit-metric">
                  <span class="metric-label">Available</span>
                  <span class="metric-value good">${Utils.formatMoneyUSD(available)}</span>
          </div>
                <div class="credit-metric">
                  <span class="metric-label">Utilization</span>
                  <span class="metric-value ${utilization > 80 ? 'bad' : utilization > 50 ? 'warning' : 'good'}">${utilization}%</span>
          </div>
        </div>
              <div class="credit-details">
                <div class="credit-detail">
                  <span class="detail-label">Due Day:</span>
                  <span class="detail-value">${account.dueDay || '—'}</span>
                </div>
                <div class="credit-detail">
                  <span class="detail-label">Min Payment:</span>
                  <span class="detail-value">${Utils.formatMoneyUSD(account.minimumPaymentDue || 0)}</span>
                </div>
                <div class="credit-detail">
                  <span class="detail-label">Next Payment:</span>
                  <span class="detail-value">${Utils.formatMoneyUSD(nextPayment)}</span>
                </div>
                ${installmentInfo.totalInstallments > 0 ? `
                <div class="credit-detail">
                  <span class="detail-label">Active Installments:</span>
                  <span class="detail-value">${installmentInfo.totalInstallments}</span>
                </div>
                <div class="credit-detail">
                  <span class="detail-label">Monthly Installments:</span>
                  <span class="detail-value">${Utils.formatMoneyUSD(installmentInfo.totalMonthlyPayment)}</span>
                </div>
                ` : ''}
              </div>
      </div>`;
        }
        
        html += `<div class="card account-card-enhanced" data-type="${accountType}">
          <div class="account-header">
            <div class="account-title">
              <div class="account-icon">${Utils.accountIcon(account)}</div>
              <div class="account-name-section">
                <h4 class="account-name">${account.name}</h4>
                <div class="account-meta">
                  <span class="account-badge ${accountType}">${badgeLabel}</span>
                  <span class="account-country">${account.country}</span>
                </div>
              </div>
            </div>
            <div class="account-actions">
              <button class="btn-icon edit" data-edit="${account.id}" title="Edit Account">✏️</button>
              <button class="btn-icon delete" data-del="${account.id}" title="Delete Account">🗑️</button>
            </div>
          </div>
          
          <div class="account-balance-section">
            <div class="primary-balance">
              <div class="balance-label">Current Balance</div>
              <div class="balance-amounts">
                ${account.country === 'Mexico' ? `
                  <div class="primary-amount">${usdBalance}</div>
                  <div class="secondary-amount">${nativeBalance}</div>
                ` : `
                  <div class="primary-amount">${usdBalance}</div>
                `}
              </div>
            </div>
            
            <div class="balance-details">
              <div class="detail-item">
                <span class="detail-label">As of:</span>
                <span class="detail-value">${account.balanceAsOfDate || '—'}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Original:</span>
                <span class="detail-value">${Utils.formatMoney(account.balanceAsOfAmount, account.currency)}</span>
              </div>
            </div>
          </div>
          
          ${creditInfo}
          
          ${accountType === 'cash' ? `
            <div class="account-note">
              <span class="note-icon">💡</span>
              <span class="note-text">Balance As Of Date ensures manual cash tracking stays accurate</span>
            </div>
          ` : ''}
        </div>`;
      });
      
      html += `</div></div>`;
    });
    
    list.innerHTML = html || '<div class="muted">No accounts yet.</div>';
  }
  function updateAccountFormState(){
    const type=$('#accType').value;
    creditFields().forEach(el=> el.classList.toggle('hidden', type!=='credit-card'));
    validateAccountForm();
  }
  function validateAccountForm(){
    const type=$('#accType').value;
    const creditLimit=Number($('#accCreditLimit').value||0);
    const dueDay=$('#accDueDay').value;
    const balanceAmt=Number($('#accAsOfAmt').value||0);
    const balanceDate=$('#accAsOfDate').value;
    const limitOk = type!=='credit-card' || creditLimit>0;
    const dueOk = type!=='credit-card' || (!!dueDay && Number(dueDay)>=1 && Number(dueDay)<=28);
    const balOk = !isNaN(balanceAmt);
    const dateOk = !!balanceDate;
    Validate.setValidity($('#accCreditLimit'), limitOk, 'Required for credit cards');
    Validate.setValidity($('#accDueDay'), dueOk, 'Required for credit cards');
    Validate.setValidity($('#accAsOfAmt'), balOk, 'Balance is required');
    Validate.setValidity($('#accAsOfDate'), dateOk, 'Balance date required');
    $('#formAccount button[type="submit"]').disabled = !(limitOk && dueOk && balOk && dateOk && $('#accName').value.trim());
  }
  function openForm(account){
    form.reset();
    if(account){
      const normalized=AppState.normalizeAccount(account);
      $('#accountFormTitle').textContent='Edit Account';
      $('#accId').value=normalized.id;
      $('#accName').value=normalized.name;
      $('#accType').value=Utils.accountType(normalized);
      $('#accCurrency').value=normalized.currency||'USD';
      $('#accCountry').value=normalized.country||'USA';
      $('#accAsOfAmt').value=normalized.balanceAsOfAmount||0;
      $('#accAsOfDate').value=normalized.balanceAsOfDate||Utils.todayISO();
      $('#accCreditLimit').value=normalized.creditLimit||0;
      $('#accNextClosing').value=normalized.nextClosingDate||'';
      $('#accDueDay').value=normalized.dueDay||'';
      $('#accMinDue').value=normalized.minimumPaymentDue||0;
    }else{
      $('#accountFormTitle').textContent='Add Account';
      $('#accId').value='';
      $('#accType').value='checking';
      $('#accCurrency').value='USD';
      $('#accCountry').value='USA';
      $('#accAsOfDate').value=Utils.todayISO();
    }
    updateAccountFormState();
    dlg.showModal();
  }
  draw();
  btnAdd.addEventListener('click', ()=> openForm(null));
  btnClose.addEventListener('click', ()=> dlg.close());
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if($('#formAccount button[type="submit"]').disabled) return;
    const id=$('#accId').value||crypto.randomUUID();
    const accountType=$('#accType').value;
    const obj={ id,
      name:$('#accName').value.trim(),
      type:accountType.replace('-', '_'),
      accountType,
      currency:$('#accCurrency').value,
      country:$('#accCountry').value,
      balanceAsOfAmount:Number($('#accAsOfAmt').value||0),
      balanceAsOfDate:$('#accAsOfDate').value||Utils.todayISO(),
      creditLimit:Number($('#accCreditLimit').value||0),
      nextClosingDate:$('#accNextClosing').value||'',
      dueDay: $('#accDueDay').value? Number($('#accDueDay').value):null,
      minimumPaymentDue:Number($('#accMinDue').value||0)
    };
    await AppState.saveItem('accounts', obj, 'accounts');
    draw();
    dlg.close();
  });
  form.addEventListener('input', validateAccountForm);
  $('#accType').addEventListener('change', updateAccountFormState);
  list.addEventListener('click', async (e)=>{
    const t=e.target;
    if (t.dataset.edit){
      const a=AppState.State.accounts.find(x=>x.id===t.dataset.edit);
      openForm(a);
    }
    if (t.dataset.del){
      if (await Utils.confirmDialog('Delete this account?')){
        await AppState.deleteItem('accounts', t.dataset.del, 'accounts');
        renderAccounts(root);
      }
    }
  });
}

async function renderCategories(root){
  root.innerHTML = $('#tpl-categories').innerHTML;
  const btnAdd=$('#btnAddCategory'); 
  const btnAddSub=$('#btnAddSubcategory');
  const dlg=$('#dlgCategory'); 
  const form=$('#formCategory'); 
  const btnClose=$('#btnCloseCategory');
  
  function buildParentOptions(type, excludeId = '') {
    const categories = AppState.State.categories
      .filter(c => c.type === type && c.id !== excludeId)
      .sort((a,b) => a.name.localeCompare(b.name));
    
    const buildHierarchicalOptions = (cats, parentId = '', level = 0) => {
      const children = cats.filter(c => c.parentCategoryId === parentId);
      let html = '';
      
      children.forEach(cat => {
        const indent = '  '.repeat(level);
        const prefix = level > 0 ? '└─ ' : '';
        html += `<option value="${cat.id}">${indent}${prefix}${cat.name}</option>`;
        html += buildHierarchicalOptions(cats, cat.id, level + 1);
      });
      
      return html;
    };
    
    return buildHierarchicalOptions(categories);
  }
  
  function renderCategoryTree(type) {
    const categories = AppState.State.categories.filter(c => c.type === type);
    const roots = categories.filter(c => !c.parentCategoryId).sort((a,b) => a.name.localeCompare(b.name));
    const children = pid => categories.filter(c => c.parentCategoryId === pid).sort((a,b) => a.name.localeCompare(b.name));
    
    if (roots.length === 0) {
      return `<div class="empty-state">
        <span class="icon">📂</span>
        <p>No ${type} categories yet</p>
        <p class="small">Click "Add Category" to get started</p>
      </div>`;
    }
    
    let html = '';
    roots.forEach(root => {
      const kids = children(root.id);
      
      // Main category with toggle button
      html += `<div class="category-item main" data-id="${root.id}">
        <div class="category-name">
          ${kids.length > 0 ? `<button class="category-toggle" data-toggle="${root.id}" title="Toggle subcategories">+</button>` : ''}
          <span>${root.name}</span>
          ${kids.length > 0 ? `<span class="small muted">(${kids.length} sub)</span>` : ''}
      </div>
        <div class="category-actions">
          <button class="btn small" data-addsub="${root.id}" title="Add subcategory">+</button>
          <button class="btn small" data-edit="${root.id}" title="Edit">✏️</button>
          <button class="btn small danger" data-del="${root.id}" title="Delete">🗑️</button>
        </div>
      </div>`;
      
      // Collapsible subcategories container
      if (kids.length > 0) {
        html += `<div class="category-subcategories" id="subs-${root.id}">`;
        kids.forEach(sub => {
          html += `<div class="category-item sub" data-id="${sub.id}">
            <div class="category-name">
              <span style="width:1.2rem;"></span>
              <span>${sub.name}</span>
            </div>
            <div class="category-actions">
              <button class="btn small" data-edit="${sub.id}" title="Edit">✏️</button>
              <button class="btn small danger" data-del="${sub.id}" title="Delete">🗑️</button>
            </div>
          </div>`;
        });
        html += `</div>`;
      }
    });
    
    return html;
  }
  
  function updateCounts() {
    const expenseCount = AppState.State.categories.filter(c => c.type === 'expense').length;
    const incomeCount = AppState.State.categories.filter(c => c.type === 'income').length;
    $('#expenseCount').textContent = expenseCount;
    $('#incomeCount').textContent = incomeCount;
  }
  
  function draw(){ 
    $('#expenseCats').innerHTML=renderCategoryTree('expense'); 
    $('#incomeCats').innerHTML=renderCategoryTree('income');
    updateCounts();
  }
  draw();
  
  btnAdd.addEventListener('click', ()=>{ form.reset(); $('#catId').value=''; $('#catFormTitle').textContent='➕ Add Category'; $('#catType').value='expense'; $('#catParent').innerHTML='<option value="">— Create as main category —</option>'+buildParentOptions('expense'); dlg.showModal(); });
  btnAddSub.addEventListener('click', ()=>{ form.reset(); $('#catId').value=''; $('#catFormTitle').textContent='➕ Add Subcategory'; $('#catType').value='expense'; $('#catParent').innerHTML='<option value="">— Select parent category —</option>'+buildParentOptions('expense'); dlg.showModal(); });
  btnClose.addEventListener('click', ()=> dlg.close());
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const id=$('#catId').value||crypto.randomUUID();
    const obj={ id, name:$('#catName').value.trim(), type:$('#catType').value, parentCategoryId: $('#catParent').value||'' };
    await AppState.saveItem('categories', obj, 'categories'); draw(); dlg.close();
  });
  // Use event delegation with proper scoping to prevent interference with other tabs
  root.addEventListener('click', async (e)=>{
    const t=e.target;
    
    // Only handle clicks on elements with category-specific data attributes
    // This prevents interference when other tabs are active
    if (!t.dataset.toggle && !t.dataset.addsub && !t.dataset.edit && !t.dataset.del) {
      return;
    }
    
    // Additional safety check: ensure we're in the categories context
    const isCategoriesContext = root.querySelector('#expenseCats') || root.querySelector('#incomeCats');
    if (!isCategoriesContext) {
      return;
    }
    
    if (t.dataset.toggle){ 
      const subContainer = $(`#subs-${t.dataset.toggle}`);
      const toggle = t;
      if (subContainer) {
        subContainer.classList.toggle('expanded');
        toggle.classList.toggle('expanded');
        toggle.textContent = subContainer.classList.contains('expanded') ? '−' : '+';
      }
    }
    if (t.dataset.addsub){ form.reset(); $('#catId').value=''; $('#catFormTitle').textContent='➕ Add Subcategory'; const tp=AppState.State.categories.find(c=>c.id===t.dataset.addsub).type; $('#catType').value=tp; $('#catParent').innerHTML='<option value="">— Select parent category —</option>'+buildParentOptions(tp); $('#catParent').value=t.dataset.addsub; dlg.showModal(); }
    if (t.dataset.edit){ const c=AppState.State.categories.find(x=>x.id===t.dataset.edit); form.reset(); $('#catId').value=c.id; $('#catFormTitle').textContent='✏️ Edit Category'; $('#catName').value=c.name; $('#catType').value=c.type; $('#catParent').innerHTML='<option value="">— Create as main category —</option>'+buildParentOptions(c.type, c.id); $('#catParent').value=c.parentCategoryId||''; dlg.showModal(); }
    if (t.dataset.del){ if (await Utils.confirmDialog('Delete this category? This will also delete any subcategories.')){ await AppState.deleteItem('categories', t.dataset.del, 'categories'); renderCategories(root);} }
  });
}

async function renderBudget(root){
  root.innerHTML = $('#tpl-budget').innerHTML;

  // Independent month tracking for different sections
  let budgetSummaryMonth = new Date(); // For Budget Summary and Budget vs Actual by Category graph
  let monthlyBvaMonth = new Date();    // For Monthly Budget vs Actual tables only
  
  const monthYearEl = $('#budgetMonthYear');
  const prevBtn = $('#budgetPrevMonth');
  const nextBtn = $('#budgetNextMonth');

  // Update Budget Summary month display and refresh data
  function updateBudgetSummaryDisplay() {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    monthYearEl.textContent = `${monthNames[budgetSummaryMonth.getMonth()]} ${budgetSummaryMonth.getFullYear()}`;
    
    renderBudgetSummary();
    renderCategoryBreakdown();
  }

  // Budget Summary month navigation
  prevBtn.onclick = () => {
    budgetSummaryMonth.setMonth(budgetSummaryMonth.getMonth() - 1);
    updateBudgetSummaryDisplay();
  };

  nextBtn.onclick = () => {
    budgetSummaryMonth.setMonth(budgetSummaryMonth.getMonth() + 1);
    updateBudgetSummaryDisplay();
  };

  // Connect the Monthly Budget vs Actual month input
  const bMonthInput = $('#bMonth');
  if (bMonthInput) {
    // Set initial value to current month
    const currentMonthStr = `${monthlyBvaMonth.getFullYear()}-${String(monthlyBvaMonth.getMonth() + 1).padStart(2, '0')}`;
    bMonthInput.value = currentMonthStr;
    
    // Add event listener for month changes
    bMonthInput.addEventListener('change', (e) => {
      const [year, month] = e.target.value.split('-');
      const selectedDate = new Date(parseInt(year), parseInt(month) - 1, 1); // month is 0-based in Date constructor
      monthlyBvaMonth = selectedDate;
      drawMonthly(); // Only update the Monthly Budget vs Actual tables
    });
  }

  // Get month range for Budget Summary calculations
  function getBudgetSummaryMonthRange() {
    const start = new Date(budgetSummaryMonth.getFullYear(), budgetSummaryMonth.getMonth(), 1);
    const end = new Date(budgetSummaryMonth.getFullYear(), budgetSummaryMonth.getMonth() + 1, 0);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10)
    };
  }

  // Calculate overall budget summary
  function renderBudgetSummary() {
    const { start, end } = getBudgetSummaryMonthRange();
    
    
    // Get transactions for the month
    const transactions = AppState.State.transactions.filter(t => 
      Utils.within(t.date, start, end)
    );

    // Calculate actual totals
    let actualIncome = 0;
    let actualExpenses = 0;

    transactions.forEach(t => {
      const amount = t.currency === 'USD' ? Number(t.amount) : Number(t.amount) * Number(t.fxRate || 1);
      if (t.transactionType === 'Income') {
        actualIncome += amount;
      } else if (t.transactionType === 'Expense') {
        actualExpenses += amount;
      }
    });

    // Calculate budget totals from budget series that are active in this month
    const budgetSeries = AppState.State.budgets || [];
    let budgetedIncome = 0;
    let budgetedExpenses = 0;

    // Get the year and month for the selected budget summary month
    const { y, m } = { y: budgetSummaryMonth.getFullYear(), m: budgetSummaryMonth.getMonth() };

    budgetSeries.forEach(series => {
      // Check if this series is active in the selected month
      const instances = expandSeriesForMonth(series, y, m);
      if (instances.length === 0) return; // Skip if no instances in this month
      
      // Calculate monthly budget amount based on cadence
      let monthlyAmount = series.amount;
      if (series.cadence === 'weekly') {
        monthlyAmount = series.amount * 4.33; // Approximate weeks per month
      } else if (series.cadence === 'biweekly') {
        monthlyAmount = series.amount * 2.17; // Approximate biweeks per month
      }
      
      // Convert to USD if needed
      if ((series.currency || 'USD') === 'MXN' && (series.fxRate || 1)) {
        monthlyAmount = monthlyAmount / (series.fxRate || 1);
      }
      
      if (series.type === 'income') {
        budgetedIncome += monthlyAmount;
      } else if (series.type === 'expense') {
        budgetedExpenses += monthlyAmount;
      }
    });

    // Calculate differences and net amounts
    const incomeVariance = actualIncome - budgetedIncome;
    const expenseVariance = budgetedExpenses - actualExpenses; // Positive if under budget
    const netBudgeted = budgetedIncome - budgetedExpenses;
    const netActual = actualIncome - actualExpenses;
    const netVariance = netActual - netBudgeted;

    // For the progress bar, we track budgeted expenses vs actual expenses
    const budgetPercentage = budgetedExpenses > 0 ? (actualExpenses / budgetedExpenses) * 100 : 0;
    const expenseRemaining = budgetedExpenses - actualExpenses;

    // Update UI - Income section
    $('#budgetBudgetedIncome').textContent = Utils.formatMoneyUSD(budgetedIncome);
    $('#budgetActualIncome').textContent = Utils.formatMoneyUSD(actualIncome);
    $('#incomeVariance').textContent = `${incomeVariance >= 0 ? '+' : ''}${Utils.formatMoneyUSD(incomeVariance)}`;
    $('#incomeVariance').className = `variance-amount ${incomeVariance >= 0 ? 'good' : 'bad'}`;

    // Update UI - Expenses section
    $('#budgetBudgetedExpenses').textContent = Utils.formatMoneyUSD(budgetedExpenses);
    $('#budgetActualExpenses').textContent = Utils.formatMoneyUSD(actualExpenses);
    $('#expenseVariance').textContent = `${expenseVariance >= 0 ? '+' : ''}${Utils.formatMoneyUSD(expenseVariance)}`;
    $('#expenseVariance').className = `variance-amount ${expenseVariance >= 0 ? 'good' : 'bad'}`;

    // Update UI - Net section
    $('#budgetNetBudgeted').textContent = Utils.formatMoneyUSD(netBudgeted);
    $('#budgetNetActual').textContent = Utils.formatMoneyUSD(netActual);
    $('#netVariance').textContent = `${netVariance >= 0 ? '+' : ''}${Utils.formatMoneyUSD(netVariance)}`;
    $('#netVariance').className = `variance-amount ${netVariance >= 0 ? 'good' : 'bad'}`;

    // Update progress bar (expenses only)
    $('#budgetBudgetedExpenses').textContent = Utils.formatMoneyUSD(budgetedExpenses);
    $('#budgetPercentage').textContent = `${Math.round(budgetPercentage)}%`;
    $('#budgetTotalAmount').textContent = Utils.formatMoneyUSD(budgetedExpenses);
    $('#budgetSpentAmount').textContent = Utils.formatMoneyUSD(actualExpenses);
    $('#budgetRemainingAmount').textContent = Utils.formatMoneyUSD(expenseRemaining);
    
    // Update progress bar visual
    const barFill = $('#budgetBarFill');
    if (barFill) {
      const fillWidth = Math.min(budgetPercentage, 100);
      barFill.style.width = `${fillWidth}%`;
      
      // Set background color - red for over budget, green for under budget
      if (actualExpenses > budgetedExpenses) {
        barFill.style.background = '#dc2626'; // Red for over budget
      } else {
        barFill.style.background = 'linear-gradient(90deg, #10b981, #059669)'; // Green for under budget
      }
      
      console.log('📊 Progress Bar Update:', {
        percentage: budgetPercentage,
        fillWidth: fillWidth,
        budgeted: budgetedExpenses,
        actual: actualExpenses,
        overBudget: actualExpenses > budgetedExpenses
      });
    } else {
      console.log('❌ Progress bar element not found');
    }
  }

  // Render diverging chart and consolidated budget
  function renderCategoryBreakdown() {
    renderDivergingChart();
    renderConsolidatedBudget();
  }

  // Render diverging bar chart
  function renderDivergingChart() {
    const { start, end } = getBudgetSummaryMonthRange();
    const chartEl = $('#divergingChart');
    if (!chartEl) return;

    console.log('📊 Rendering Diverging Chart for:', {
      month: budgetSummaryMonth.toISOString().slice(0, 7),
      start,
      end
    });

    // Get budget series
    const budgetSeries = AppState.State.budgets || [];
    
    // Get actual transactions
    const transactions = AppState.State.transactions.filter(t => 
      Utils.within(t.date, start, end) && t.categoryId
    );

    console.log('📊 Chart Data:', {
      budgetSeriesCount: budgetSeries.length,
      transactionsCount: transactions.length,
      transactions: transactions.map(t => ({
        date: t.date,
        type: t.transactionType,
        categoryId: t.categoryId,
        amount: t.amount
      }))
    });

    // Calculate budget and actual amounts by category and type
    const budgetData = new Map(); // key: "type|categoryId", value: amount
    const actualData = new Map(); // key: "type|categoryId", value: amount

    // Process budget series that are active in this month
    const { y, m } = { y: budgetSummaryMonth.getFullYear(), m: budgetSummaryMonth.getMonth() };
    
    budgetSeries.forEach(series => {
      // Check if this series is active in the selected month
      const instances = expandSeriesForMonth(series, y, m);
      console.log(`📊 Budget Series ${series.id}:`, {
        series: series,
        instances: instances,
        instancesCount: instances.length
      });
      
      if (instances.length === 0) return; // Skip if no instances in this month
      
      // Calculate total monthly amount from all instances
      let totalMonthlyAmount = 0;
      instances.forEach(instance => {
        totalMonthlyAmount += instance.amount;
      });
      
      const key = `${series.type}|${series.categoryId}`;
      budgetData.set(key, (budgetData.get(key) || 0) + totalMonthlyAmount);
      
      console.log(`📊 Added to budget data:`, {
        key,
        amount: totalMonthlyAmount,
        totalForKey: budgetData.get(key)
      });
    });

    // Process actual transactions
    transactions.forEach(t => {
      const amount = t.currency === 'USD' ? Number(t.amount) : Number(t.amount) * Number(t.fxRate || 1);
      const keyType = t.transactionType === 'Income' ? 'income' : 
                     t.transactionType === 'Expense' ? 'expense' : '';
      if (!keyType) return;
      
      const key = `${keyType}|${t.categoryId}`;
      actualData.set(key, (actualData.get(key) || 0) + amount);
    });

    console.log('📊 Budget vs Actual Data:', {
      budgetData: Object.fromEntries(budgetData),
      actualData: Object.fromEntries(actualData)
    });

    // Prepare data for chart
    const incomeCategories = [];
    const expenseCategories = [];
    const incomeBudgetData = [];
    const incomeActualData = [];
    const expenseBudgetData = [];
    const expenseActualData = [];

    // Process income categories
    const incomeKeys = Array.from(budgetData.keys()).filter(k => k.startsWith('income|'));
    const incomeActualKeys = Array.from(actualData.keys()).filter(k => k.startsWith('income|'));
    const allIncomeKeys = [...new Set([...incomeKeys, ...incomeActualKeys])];

    allIncomeKeys.forEach(key => {
      const categoryId = key.split('|')[1];
      const category = AppState.State.categories.find(c => c.id === categoryId);
      if (!category) return;

      const budgetAmount = budgetData.get(key) || 0;
      const actualAmount = actualData.get(key) || 0;
      
      if (budgetAmount > 0 || actualAmount > 0) {
        incomeCategories.push(category.name);
        incomeBudgetData.push(budgetAmount);
        incomeActualData.push(actualAmount);
      }
    });

    // Process expense categories
    const expenseKeys = Array.from(budgetData.keys()).filter(k => k.startsWith('expense|'));
    const expenseActualKeys = Array.from(actualData.keys()).filter(k => k.startsWith('expense|'));
    const allExpenseKeys = [...new Set([...expenseKeys, ...expenseActualKeys])];

    allExpenseKeys.forEach(key => {
      const categoryId = key.split('|')[1];
      const category = AppState.State.categories.find(c => c.id === categoryId);
      if (!category) return;

      const budgetAmount = budgetData.get(key) || 0;
      const actualAmount = actualData.get(key) || 0;
      
      if (budgetAmount > 0 || actualAmount > 0) {
        expenseCategories.push(category.name);
        expenseBudgetData.push(budgetAmount);
        expenseActualData.push(actualAmount);
      }
    });

    // Sort by actual amount and take top 6
    const incomeSorted = incomeCategories.map((name, i) => ({
      name, budget: incomeBudgetData[i], actual: incomeActualData[i]
    })).sort((a, b) => b.actual - a.actual).slice(0, 6);

    const expenseSorted = expenseCategories.map((name, i) => ({
      name, budget: expenseBudgetData[i], actual: expenseActualData[i]
    })).sort((a, b) => b.actual - a.actual).slice(0, 6);

    // Calculate "Other" categories correctly
    const allIncomeSorted = incomeCategories.map((name, i) => ({
      name, budget: incomeBudgetData[i], actual: incomeActualData[i]
    })).sort((a, b) => b.actual - a.actual);
    
    const allExpenseSorted = expenseCategories.map((name, i) => ({
      name, budget: expenseBudgetData[i], actual: expenseActualData[i]
    })).sort((a, b) => b.actual - a.actual);

    // Calculate "Other" from the remaining categories after top 6
    const otherIncomeBudget = allIncomeSorted.slice(6).reduce((sum, item) => sum + item.budget, 0);
    const otherIncomeActual = allIncomeSorted.slice(6).reduce((sum, item) => sum + item.actual, 0);
    
    const otherExpenseBudget = allExpenseSorted.slice(6).reduce((sum, item) => sum + item.budget, 0);
    const otherExpenseActual = allExpenseSorted.slice(6).reduce((sum, item) => sum + item.actual, 0);

    // Prepare chart data for diverging layout
    const chartLabels = [];
    const budgetDataArray = [];
    const actualDataArray = [];

    console.log('📊 Sorted Data:', {
      expenseSorted,
      incomeSorted,
      otherExpense: { budget: otherExpenseBudget, actual: otherExpenseActual },
      otherIncome: { budget: otherIncomeBudget, actual: otherIncomeActual }
    });

    // First, collect all expense categories (will go on left side - negative)
    const expenseItems = [];
    expenseSorted.forEach(item => {
      if (item.budget > 0 || item.actual > 0) {
        expenseItems.push({
          name: item.name,
          budget: -item.budget, // Negative for left side
          actual: -item.actual  // Negative for left side
        });
      }
    });

    // Add "Other Expense" if exists
    if (otherExpenseBudget > 0 || otherExpenseActual > 0) {
      expenseItems.push({
        name: 'Other Expense',
        budget: -otherExpenseBudget,
        actual: -otherExpenseActual
      });
    }

    // Then, collect all income categories (will go on right side - positive)
    const incomeItems = [];
    incomeSorted.forEach(item => {
      if (item.budget > 0 || item.actual > 0) {
        incomeItems.push({
          name: item.name,
          budget: item.budget, // Positive for right side
          actual: item.actual  // Positive for right side
        });
      }
    });

    // Add "Other Income" if exists
    if (otherIncomeBudget > 0 || otherIncomeActual > 0) {
      incomeItems.push({
        name: 'Other Income',
        budget: otherIncomeBudget,
        actual: otherIncomeActual
      });
    }

    // Build the chart data: expenses first (left), then income (right)
    // Ensure budget and actual arrays are properly aligned
    expenseItems.forEach(item => {
      chartLabels.push(item.name);
      budgetDataArray.push(item.budget);
      actualDataArray.push(item.actual);
    });

    incomeItems.forEach(item => {
      chartLabels.push(item.name);
      budgetDataArray.push(item.budget);
      actualDataArray.push(item.actual);
    });

    // Verify data alignment
    console.log('📊 Chart Data Alignment Check:', {
      labelsCount: chartLabels.length,
      budgetDataCount: budgetDataArray.length,
      actualDataCount: actualDataArray.length,
      labels: chartLabels,
      budgetData: budgetDataArray,
      actualData: actualDataArray
    });

    console.log('📊 Final Chart Data:', {
      chartLabels,
      budgetDataArray,
      actualDataArray,
      expenseItems,
      incomeItems
    });

    // Destroy existing chart
    if (window.divergingChartInstance && window.divergingChartInstance.destroy) {
      window.divergingChartInstance.destroy();
    }

    // Create consistent colors: same hue for same category, different opacity for budget vs actual
    const budgetBackgroundColors = budgetDataArray.map(value => 
      value < 0 ? 'rgba(239, 68, 68, 0.7)' : 'rgba(34, 197, 94, 0.7)' // Semi-transparent for budget
    );
    const actualBackgroundColors = actualDataArray.map(value => 
      value < 0 ? 'rgba(239, 68, 68, 1)' : 'rgba(34, 197, 94, 1)' // Solid for actual
    );

    // Create new chart
    const ctx = chartEl.getContext('2d');
    window.divergingChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartLabels,
        datasets: [
          {
            label: 'Budgeted',
            data: budgetDataArray,
            backgroundColor: budgetBackgroundColors,
            borderColor: budgetBackgroundColors,
            borderWidth: 1
          },
          {
            label: 'Actual',
            data: actualDataArray,
            backgroundColor: actualBackgroundColors,
            borderColor: actualBackgroundColors,
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          title: {
            display: true,
            text: `Budget vs Actual by Category - ${budgetSummaryMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
            font: {
              size: 14,
              weight: 'bold'
            },
            padding: {
              bottom: 30
            }
          },
          subtitle: {
            display: true,
            text: '💸 Expenses (Left) ← → Income (Right) 💰',
            font: {
              size: 12,
              style: 'italic'
            },
            color: '#666666',
            padding: {
              bottom: 15
            }
          },
          legend: {
            display: true,
            position: 'top',
            labels: {
              usePointStyle: true,
              padding: 20,
              font: {
                size: 12
              }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const value = Math.abs(context.parsed.x);
                const sign = context.parsed.x < 0 ? '-' : '+';
                return `${context.dataset.label}: ${sign}${Utils.formatMoneyUSD(value)}`;
              },
              title: function(context) {
                return context[0].label;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: {
              drawBorder: false,
              color: function(context) {
                // Draw a thicker line at zero to separate expenses (left) from income (right)
                if (context.tick.value === 0) {
                  return '#000000';
                }
                return '#e5e7eb';
              },
              lineWidth: function(context) {
                if (context.tick.value === 0) {
                  return 2;
                }
                return 1;
              }
            },
            ticks: {
              callback: function(value) {
                const amount = Utils.formatMoneyUSD(Math.abs(value));
                return amount; // Just show the amount, emojis are in the subtitle
              }
            }
          },
          y: {
            grid: {
              display: false
            },
            ticks: {
              font: {
                size: 11
              }
            }
          }
        }
      }
    });
  }

  // Render consolidated budget summary
  function renderConsolidatedBudget() {
    const { start, end } = getBudgetSummaryMonthRange();
    
    // Get budget series
    const budgetSeries = AppState.State.budgets || [];
    
    // Get actual transactions
    const transactions = AppState.State.transactions.filter(t => 
      Utils.within(t.date, start, end)
    );

    // Calculate budgeted totals
    let budgetedIncome = 0;
    let budgetedExpenses = 0;

    // Get the year and month for the selected budget summary month
    const { y, m } = { y: budgetSummaryMonth.getFullYear(), m: budgetSummaryMonth.getMonth() };
    
    budgetSeries.forEach(series => {
      // Check if this series is active in the selected month
      const instances = expandSeriesForMonth(series, y, m);
      if (instances.length === 0) return; // Skip if no instances in this month
      
      let monthlyAmount = series.amount;
      if (series.cadence === 'weekly') {
        monthlyAmount = series.amount * 4.33;
      } else if (series.cadence === 'biweekly') {
        monthlyAmount = series.amount * 2.17;
      }
      
      // Convert to USD if needed
      if ((series.currency || 'USD') === 'MXN' && (series.fxRate || 1)) {
        monthlyAmount = monthlyAmount / (series.fxRate || 1);
      }
      
      if (series.type === 'income') {
        budgetedIncome += monthlyAmount;
      } else if (series.type === 'expense') {
        budgetedExpenses += monthlyAmount;
      }
    });

    // Calculate actual totals
    let actualIncome = 0;
    let actualExpenses = 0;

    transactions.forEach(t => {
      const amount = t.currency === 'USD' ? Number(t.amount) : Number(t.amount) * Number(t.fxRate || 1);
      if (t.transactionType === 'Income') {
        actualIncome += amount;
      } else if (t.transactionType === 'Expense') {
        actualExpenses += amount;
      }
    });

    // Calculate net amounts
    const budgetedNet = budgetedIncome - budgetedExpenses;
    const actualNet = actualIncome - actualExpenses;
    const varianceDollar = actualNet - budgetedNet;
    const variancePercent = budgetedNet !== 0 ? (varianceDollar / Math.abs(budgetedNet)) * 100 : null;

    // Update UI
    const budgetedNetEl = $('#budgetedNet');
    const actualNetEl = $('#actualNet');
    const varianceDollarEl = $('#varianceDollar');
    const variancePercentEl = $('#variancePercent');

    if (budgetedNetEl) {
      budgetedNetEl.textContent = Utils.formatMoneyUSD(budgetedNet);
      budgetedNetEl.className = `net-value ${budgetedNet >= 0 ? 'positive' : 'negative'}`;
    }

    if (actualNetEl) {
      actualNetEl.textContent = Utils.formatMoneyUSD(actualNet);
      actualNetEl.className = `net-value ${actualNet >= 0 ? 'positive' : 'negative'}`;
    }

    if (varianceDollarEl) {
      varianceDollarEl.textContent = Utils.formatMoneyUSD(varianceDollar);
      varianceDollarEl.className = `variance-value ${varianceDollar >= 0 ? 'positive' : 'negative'}`;
    }

    if (variancePercentEl) {
      if (variancePercent !== null) {
        variancePercentEl.textContent = `${variancePercent >= 0 ? '+' : ''}${variancePercent.toFixed(1)}%`;
        variancePercentEl.className = `variance-value ${variancePercent >= 0 ? 'positive' : 'negative'}`;
      } else {
        variancePercentEl.textContent = 'n/a';
        variancePercentEl.className = 'variance-value neutral';
      }
    }
  }

  // --- form controls for budget series creation
  const typeSel = $('#bType');
  const catSel  = $('#bCategory');
  const currSel = $('#bCurrency');
  const amtInp  = $('#bAmount');
  const fxInp   = $('#bFxRate');
  const fxGroup = $('#bFxGroup');
  const cadSel  = $('#bCadence');
  const ancInp  = $('#bAnchor');
  const untilInp= $('#bUntil');
  const btnSave = $('#btnBudgetSeriesSave');
  const btnClear= $('#btnBudgetSeriesReset');

  // --- monthly view controls
  const monthInp = $('#bMonth');
  const chartEl  = $('#bvaChart');
  let chartInst  = null;
  let isDeleting = false;

  // Fill categories by type
  function fillCats(){
    const kind = typeSel.value === 'expense' ? 'expense' : 'income';
    catSel.innerHTML = Utils.buildCategoryOptions(kind);
  }
  typeSel.addEventListener('change', fillCats);
  fillCats();

  // Handle currency change and FX rate auto-fill
  function handleCurrencyChange() {
    if (currSel.value === 'MXN') {
      fxGroup.style.display = 'block';
      autoFillFxRate();
    } else {
      fxGroup.style.display = 'none';
      fxInp.value = '';
    }
  }

  // Auto-fill FX rate with loading state
  async function autoFillFxRate() {
    const originalPlaceholder = fxInp.placeholder;
    fxInp.placeholder = 'Fetching rate...';
    fxInp.disabled = true;
    
    try {
      const fxRate = await Utils.ensureTodayFX();
      if (fxRate && fxRate > 0) {
        fxInp.value = fxRate.toFixed(4);
        fxInp.placeholder = originalPlaceholder;
        // Show success feedback
        fxInp.style.borderColor = '#10b981';
        setTimeout(() => {
          fxInp.style.borderColor = '';
        }, 2000);
      } else {
        // Fallback to manual rate if API fails
        fxInp.placeholder = 'Enter rate manually';
        fxInp.focus();
      }
    } catch (error) {
      console.error('Error fetching FX rate:', error);
      fxInp.placeholder = 'Enter rate manually';
      fxInp.focus();
    } finally {
      fxInp.disabled = false;
    }
  }

  currSel.addEventListener('change', handleCurrencyChange);

  // Defaults
  ancInp.value = Utils.todayISO();
  monthInp.value = Utils.todayISO().slice(0,7);

  // Save series with loading state
  btnSave.onclick = async () => {
    const originalText = btnSave.textContent;
    btnSave.textContent = '💾 Saving...';
    btnSave.disabled = true;
    
    try {
      const b = AppState.newBudget();
      b.type       = typeSel.value;
      b.categoryId = catSel.value;
      b.amount     = Number(amtInp.value||0);
      b.currency   = currSel.value || 'USD';
      b.fxRate     = currSel.value === 'MXN' ? Number(fxInp.value||1) : 1;
      b.cadence    = cadSel.value || 'monthly';
      b.anchorDate = ancInp.value || Utils.todayISO();
      b.repeatUntil= untilInp.value || '';
      b.createdAt  = Utils.todayISO();

      if(!b.categoryId || !b.amount){ 
        alert('Pick a category and amount.'); 
        return; 
      }
      if(b.currency === 'MXN' && (!b.fxRate || b.fxRate <= 0)){ 
        alert('Enter a valid FX rate for MXN.'); 
        return; 
      }

      await AppState.saveItem('budgets', b, 'budgets');
      drawSeries();
      drawMonthly();
      renderBudgetSummary();
      renderCategoryBreakdown();
      btnClear.click();
      
      // Show success feedback
      btnSave.textContent = '✅ Saved!';
      setTimeout(() => {
        btnSave.textContent = originalText;
      }, 1500);
    } catch (error) {
      console.error('Error saving budget:', error);
      btnSave.textContent = '❌ Error';
      setTimeout(() => {
        btnSave.textContent = originalText;
      }, 2000);
    } finally {
      btnSave.disabled = false;
    }
  };
  
  btnClear.onclick = () => {
    amtInp.value = '';
    currSel.value = 'USD';
    fxInp.value = '';
    fxGroup.style.display = 'none';
    cadSel.value = 'monthly';
    ancInp.value = Utils.todayISO();
    untilInp.value = '';
  };

  // Remove series
  async function deleteSeries(id){
    if(isDeleting) return;
    
    if(await Utils.confirmDialog('Delete this budget series?')){
      isDeleting = true;
      try {
        await AppState.deleteItem('budgets', id, 'budgets');
        drawSeries();
        drawMonthly();
        renderBudgetSummary();
        renderCategoryBreakdown();
      } catch (error) {
        console.error('Error deleting budget series:', error);
        alert('Error deleting budget series. Please try again.');
      } finally {
        isDeleting = false;
      }
    }
  }

  // Expand a series into instances covering a month window
  function expandSeriesForMonth(series, y, m){
    const startOfMonth = new Date(y, m, 1);
    const endOfMonth   = new Date(y, m+1, 0);
    const untilTs = series.repeatUntil ? new Date(series.repeatUntil).getTime() : Infinity;
    const anchor   = new Date(series.anchorDate);

    const inst = [];
    function pushIfInRange(d){
      const ts = d.getTime();
      if(ts >= startOfMonth.getTime() && ts <= endOfMonth.getTime() && ts <= untilTs){
        inst.push({ 
          date: d.toISOString().slice(0,10), 
          amount: (series.currency || 'USD') === 'MXN' && (series.fxRate || 1) ? series.amount / (series.fxRate || 1) : series.amount, 
          seriesId: series.id, 
          categoryId: series.categoryId, 
          type: series.type 
        });
      }
    }

    if(series.cadence === 'monthly'){
      const d = new Date(y, m, Math.min(anchor.getDate(), 28));
      if (d.getTime() >= new Date(series.anchorDate).getTime()) pushIfInRange(d);
    }
    else if(series.cadence === 'weekly' || series.cadence === 'biweekly'){
      const step = series.cadence === 'weekly' ? 7 : 14;
      const first = new Date(anchor);
      while (first < startOfMonth) first.setDate(first.getDate() + step);
      for (let d = new Date(first); d <= endOfMonth; d.setDate(d.getDate()+step)){
        if (d.getTime() >= new Date(series.anchorDate).getTime()) pushIfInRange(new Date(d));
      }
    }
    return inst;
  }

  function monthParts(isoYYYYMM){
    const [yy,mm] = isoYYYYMM.split('-').map(Number);
    return { y: yy, m: mm-1 };
  }

  function actualsForMonth(isoYYYYMM){
    const { y, m } = monthParts(isoYYYYMM);
    const start = new Date(y, m, 1).toISOString().slice(0,10);
    const end   = new Date(y, m+1, 0).toISOString().slice(0,10);

    const tx = AppState.State.transactions.filter(t => Utils.within(t.date, start, end));
    const byCat = new Map();
    for (const t of tx){
      const keyType = (t.transactionType === 'Expense') ? 'expense' :
                      (t.transactionType === 'Income')  ? 'income'  : '';
      if(!keyType || !t.categoryId) continue;
      const key = `${keyType}|${t.categoryId}`;
      const prev = byCat.get(key) || 0;
      byCat.set(key, prev + (t.currency==='USD' ? Number(t.amount) : Number(t.amount)*Number(t.fxRate||1)));
    }
    return byCat;
  }

  // Build monthly BvA rows
  function computeBVA(isoYYYYMM){
    const { y, m } = monthParts(isoYYYYMM);
    const allSeries = [...AppState.State.budgets];
    const expanded = allSeries.flatMap(s => expandSeriesForMonth(normalizeSeries(s), y, m));

    const budByCat = new Map();
    for(const b of expanded){
      const key = `${b.type}|${b.categoryId}`;
      budByCat.set(key, (budByCat.get(key)||0) + b.amount);
    }

    const actByCat = actualsForMonth(isoYYYYMM);
    const keys = new Set([...budByCat.keys(), ...actByCat.keys()]);
    const rows = [];
    let budTot=0, actTot=0;

    for(const key of keys){
      const [type, categoryId] = key.split('|');
      const cat = AppState.State.categories.find(c=>c.id===categoryId);
      const name = cat ? cat.name : '—';

      const budget = budByCat.get(key) || 0;
      const actual = actByCat.get(key) || 0;
      const variance = (type==='expense') ? (budget - actual) : (actual - budget);

      budTot += budget;
      actTot += actual;

      rows.push({ type, categoryId, name, budget, actual, variance });
    }

    rows.sort((a,b)=> a.type===b.type ? a.name.localeCompare(b.name) : a.type.localeCompare(b.type));
    return { rows, budTot, actTot, varTot: (actTot - budTot) };
  }

  function normalizeSeries(s){
    return {
      ...s,
      currency: s.currency || 'USD', // Default to USD for legacy budgets
      fxRate: s.fxRate || 1, // Default to 1 for legacy budgets
      cadence: s.cadence || 'monthly',
      anchorDate: s.anchorDate || s.startDate || Utils.todayISO(),
      repeatUntil: s.repeatUntil || s.endDate || '',
      createdAt: s.createdAt || Utils.todayISO() // Add default for legacy budgets
    };
  }

  // Draw Series table
  function drawSeries(){
    const tbody = $('#tblSeries tbody');
    
    
    const data = [...AppState.State.budgets].map(normalizeSeries).sort((a,b)=>{
      const an = AppState.State.categories.find(c=>c.id===a.categoryId)?.name||'';
      const bn = AppState.State.categories.find(c=>c.id===b.categoryId)?.name||'';
      return an.localeCompare(bn);
    });

    tbody.innerHTML = data.map(b=>{
      const cname = AppState.State.categories.find(c=>c.id===b.categoryId)?.name || '—';
      const amountDisplay = (b.currency || 'USD') === 'MXN' ? 
        `${Utils.formatMoneyUSD(b.amount)} ${b.currency || 'USD'} (${(b.fxRate || 1) ? (b.amount / (b.fxRate || 1)).toFixed(2) : 'N/A'} USD)` :
        `${Utils.formatMoneyUSD(b.amount)} ${b.currency || 'USD'}`;
      return `<tr>
        <td>${b.type}</td>
        <td>${cname}</td>
        <td>${b.cadence}</td>
        <td>${amountDisplay}</td>
        <td>${b.anchorDate}</td>
        <td>${b.repeatUntil||'—'}</td>
        <td><button class="btn danger" data-del="${b.id}">Delete</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="muted">No series yet</td></tr>';

    tbody.onclick = (e)=>{
      e.preventDefault();
      e.stopPropagation();
      
      if(e.target && e.target.classList.contains('btn') && e.target.classList.contains('danger')){
        const id = e.target?.dataset?.del;
        if(id) {
          console.log('Delete button clicked for ID:', id);
          deleteSeries(id);
        }
      }
    };
  }

  // Draw Monthly BvA (separate income and expense tables)
  function drawMonthly(){
    const isoMMMM = `${monthlyBvaMonth.getFullYear()}-${String(monthlyBvaMonth.getMonth() + 1).padStart(2, '0')}`;
    const { rows, budTot, actTot, varTot } = computeBVA(isoMMMM);

    // Separate income and expense rows
    const incomeRows = rows.filter(r => r.type === 'income');
    const expenseRows = rows.filter(r => r.type === 'expense');

    // Calculate totals for each type
    const incomeBudTot = incomeRows.reduce((sum, r) => sum + r.budget, 0);
    const incomeActTot = incomeRows.reduce((sum, r) => sum + r.actual, 0);
    const incomeVarTot = incomeActTot - incomeBudTot;

    const expenseBudTot = expenseRows.reduce((sum, r) => sum + r.budget, 0);
    const expenseActTot = expenseRows.reduce((sum, r) => sum + r.actual, 0);
    const expenseVarTot = expenseBudTot - expenseActTot; // For expenses, positive variance means under budget

    // Render income table
    const incomeTb = $('#tblBVAIncome tbody');
    if (incomeTb) {
      incomeTb.innerHTML = incomeRows.map(r => {
      // Income color logic: Green if more than budget, Red if less, Black if equal
      const actualClass = r.actual > r.budget ? 'under-budget' : r.actual < r.budget ? 'over-budget' : 'on-budget';
      const varianceClass = r.variance > 0 ? 'positive' : r.variance < 0 ? 'negative' : 'neutral';
      
      return `
        <tr>
          <td>💵 ${r.name}</td>
          <td class="budget-amount">${Utils.formatMoneyUSD(r.budget)}</td>
          <td class="budget-amount ${actualClass}">${Utils.formatMoneyUSD(r.actual)}</td>
          <td class="variance-amount ${varianceClass}">${Utils.formatMoneyUSD(r.variance)}</td>
        </tr>
      `;
      }).join('') || '<tr><td colspan="4" class="muted">No income data</td></tr>';
    }

    // Apply color logic to income totals
    const incomeActualClass = incomeActTot > incomeBudTot ? 'under-budget' : incomeActTot < incomeBudTot ? 'over-budget' : 'on-budget';
    const incomeVarianceClass = incomeVarTot > 0 ? 'positive' : incomeVarTot < 0 ? 'negative' : 'neutral';
    
    const bvaIncomeBudTot = $('#bvaIncomeBudTot');
    const bvaIncomeActTot = $('#bvaIncomeActTot');
    const bvaIncomeVarTot = $('#bvaIncomeVarTot');
    
    if (bvaIncomeBudTot) bvaIncomeBudTot.textContent = Utils.formatMoneyUSD(incomeBudTot);
    if (bvaIncomeActTot) {
      bvaIncomeActTot.textContent = Utils.formatMoneyUSD(incomeActTot);
      bvaIncomeActTot.className = `budget-amount ${incomeActualClass}`;
    }
    if (bvaIncomeVarTot) {
      bvaIncomeVarTot.textContent = Utils.formatMoneyUSD(incomeVarTot);
      bvaIncomeVarTot.className = `variance-amount ${incomeVarianceClass}`;
    }

    // Render expense table
    const expenseTb = $('#tblBVAExpense tbody');
    if (expenseTb) {
      expenseTb.innerHTML = expenseRows.map(r => {
      // Expense color logic: Red if more than budget (overspent), Green if less (under budget), Black if equal
      const actualClass = r.actual > r.budget ? 'over-budget' : r.actual < r.budget ? 'under-budget' : 'on-budget';
      const varianceClass = r.variance > 0 ? 'positive' : r.variance < 0 ? 'negative' : 'neutral';
      
      return `
        <tr>
          <td>🧾 ${r.name}</td>
          <td class="budget-amount">${Utils.formatMoneyUSD(r.budget)}</td>
          <td class="budget-amount ${actualClass}">${Utils.formatMoneyUSD(r.actual)}</td>
          <td class="variance-amount ${varianceClass}">${Utils.formatMoneyUSD(r.variance)}</td>
        </tr>
      `;
      }).join('') || '<tr><td colspan="4" class="muted">No expense data</td></tr>';
    }

    // Apply color logic to expense totals
    const expenseActualClass = expenseActTot > expenseBudTot ? 'over-budget' : expenseActTot < expenseBudTot ? 'under-budget' : 'on-budget';
    const expenseVarianceClass = expenseVarTot > 0 ? 'positive' : expenseVarTot < 0 ? 'negative' : 'neutral';
    
    const bvaExpenseBudTot = $('#bvaExpenseBudTot');
    const bvaExpenseActTot = $('#bvaExpenseActTot');
    const bvaExpenseVarTot = $('#bvaExpenseVarTot');
    
    if (bvaExpenseBudTot) bvaExpenseBudTot.textContent = Utils.formatMoneyUSD(expenseBudTot);
    if (bvaExpenseActTot) {
      bvaExpenseActTot.textContent = Utils.formatMoneyUSD(expenseActTot);
      bvaExpenseActTot.className = `budget-amount ${expenseActualClass}`;
    }
    if (bvaExpenseVarTot) {
      bvaExpenseVarTot.textContent = Utils.formatMoneyUSD(expenseVarTot);
      bvaExpenseVarTot.className = `variance-amount ${expenseVarianceClass}`;
    }
  }

  // Initialize with a small delay to ensure data is loaded
  setTimeout(() => {
    updateBudgetSummaryDisplay();
    drawSeries();
    drawMonthly();
  }, 100);
}

async function renderTransactions(root){
  root.innerHTML = $('#tpl-transactions').innerHTML;
  const form=$('#formTxn');
  const date=$('#txnDate');
  const type=$('#txnType');
  const amount=$('#txnAmount');
  const currency=$('#txnCurrency');
  const fx=$('#txnFx');
  const fromSel=$('#txnFromAccount');
  const toSel=$('#txnToAccount');
  // Note: catSel removed - element doesn't exist in new layout
  const desc=$('#txnDesc');
  const hiddenId=$('#txnId');
  const btnSubmit=$('#txnSubmit');
  const btnCancel=$('#btnCancelEdit');
  const btnSortAmount=$('#txnSortAmount');
  const btnSortDate=$('#txnSortDate');
  const btnSortDescription=$('#txnSortDescription');
  const btnToggleFilters=$('#btnToggleFilters');
  const btnRefreshLog=$('#btnRefreshLog');
  const filtersSection=$('#filtersSection');
  const formStatus=$('#formStatus');
  const fxRow=$('#fxRow');
  const deferredMonthsRow=$('#deferredMonthsRow');
  const bulkDialog=$('#dlgTxnBulk');
  const bulkForm=$('#formTxnBulk');
  const bulkGrid=$('#bulkGrid');
  const bulkGridBody=$('#bulkGridBody');
  const btnBulkClose=$('#btnBulkClose');
  const btnBulkSave=$('#btnBulkSave');
  const btnAddMultiple=$('#btnAddMultiple');
  const btnAddRow=$('#btnAddRow');
  const btnAddRows=$('#btnAddRows');
  const btnClearAll=$('#btnClearAll');
  const bulkCount=$('.bulk-count');
  const filterText=$('#filterText');
  const filterType=$('#filterType');
  const filterStart=$('#filterStart');
  const filterEnd=$('#filterEnd');
  const filterAmountMin=$('#filterAmountMin');
  const filterAmountMax=$('#filterAmountMax');
  const filterAccount=$('#filterAccount');
  const filterCategory=$('#filterCategory');
  const filterClear=$('#btnClearFilters');
  let sortKey='date';
  let sortDir='desc';
  let editingId=null;
  function rootCategoryId(catId){ const cat=Utils.categoryById(catId); if(!cat) return ''; return cat.parentCategoryId||cat.id; }
  
  // Helper function to calculate account balance impact for a transaction
  function getTransactionBalanceImpact(txn) {
    const impacts = [];
    
    // Calculate impact on fromAccount
    if (txn.fromAccountId) {
      const fromAccount = AppState.State.accounts.find(a => a.id === txn.fromAccountId);
      if (fromAccount) {
        const fromImpact = Utils.txnDeltaUSDForAccount(txn, fromAccount);
        if (fromImpact !== 0) {
          const accountName = fromAccount.name;
          const impactText = `${fromImpact > 0 ? '+' : ''}${Utils.formatMoneyUSD(fromImpact)}`;
          impacts.push(`${accountName}: ${impactText}`);
        }
      }
    }
    
    // Calculate impact on toAccount
    if (txn.toAccountId) {
      const toAccount = AppState.State.accounts.find(a => a.id === txn.toAccountId);
      if (toAccount) {
        const toImpact = Utils.txnDeltaUSDForAccount(txn, toAccount);
        if (toImpact !== 0) {
          const accountName = toAccount.name;
          const impactText = `${toImpact > 0 ? '+' : ''}${Utils.formatMoneyUSD(toImpact)}`;
          impacts.push(`${accountName}: ${impactText}`);
        }
      }
    }
    
    return impacts.length > 0 ? impacts.join(', ') : '—';
  }
  
  function buildFilterCategoryOptions(){
    const roots=AppState.State.categories.filter(c=>!c.parentCategoryId).sort((a,b)=> a.name.localeCompare(b.name));
    return '<option value="">All</option>'+roots.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  }
  function fillAccounts(){
    const sorted=[...AppState.State.accounts].sort((a,b)=> a.name.localeCompare(b.name));
    const opts=sorted.map(a=>`<option value="${a.id}">${Utils.accountIcon(a)} ${a.name}</option>`).join('');
    
    const filterAccountEl = document.getElementById('filterAccount');
    if (filterAccountEl) {
      filterAccountEl.innerHTML='<option value="">All</option>'+opts;
    }
    
    // Fill fields based on current transaction type
    updateFormFields();
  }
  
  function updateFormFields(){
    const txnType = type.value;
    
    if (txnType === 'Expense') {
      // Expense: From=accounts, To=categories
      fillFromFieldWithAccounts();
      fillToFieldWithCategories('expense');
    } else if (txnType === 'Income') {
      // Income: From=categories, To=accounts
      fillFromFieldWithCategories('income');
      fillToFieldWithAccounts();
    } else if (txnType === 'Transfer') {
      // Transfer: From=accounts, To=accounts
      fillFromFieldWithAccounts();
      fillToFieldWithAccounts();
    } else if (txnType === 'Credit Card Payment') {
      // CC Payment: From=accounts, To=credit cards only
      fillFromFieldWithAccounts();
      fillToFieldWithCreditCards();
    }
  }
  
  function fillFromFieldWithAccounts(){
    const sorted=[...AppState.State.accounts].sort((a,b)=> a.name.localeCompare(b.name));
    const opts=sorted.map(a=>`<option value="${a.id}">${Utils.accountIcon(a)} ${a.name}</option>`).join('');
    fromSel.innerHTML='<option value="">Select Account...</option>'+opts;
  }
  
  function fillFromFieldWithCategories(categoryType){
    const categories = AppState.State.categories.filter(c => c.type === categoryType);
    const opts = buildHierarchicalCategoryOptions(categories);
    fromSel.innerHTML='<option value="">Select Category...</option>'+opts;
  }
  
  function fillToFieldWithAccounts(){
    const sorted=[...AppState.State.accounts].sort((a,b)=> a.name.localeCompare(b.name));
    const opts=sorted.map(a=>`<option value="${a.id}">${Utils.accountIcon(a)} ${a.name}</option>`).join('');
    toSel.innerHTML='<option value="">Select Account...</option>'+opts;
  }
  
  function fillToFieldWithCategories(categoryType){
    const categories = AppState.State.categories.filter(c => c.type === categoryType);
    const opts = buildHierarchicalCategoryOptions(categories);
    toSel.innerHTML='<option value="">Select Category...</option>'+opts;
  }
  
  function fillToFieldWithCreditCards(){
    const creditCards = AppState.State.accounts.filter(a => Utils.accountType(a) === 'credit-card').sort((a,b)=> a.name.localeCompare(b.name));
    const opts=creditCards.map(a=>`<option value="${a.id}">${Utils.accountIcon(a)} ${a.name}</option>`).join('');
    toSel.innerHTML='<option value="">Select Credit Card...</option>'+opts;
  }
  
  function buildHierarchicalCategoryOptions(categories, parentId = '', level = 0) {
    const children = categories.filter(c => c.parentCategoryId === parentId).sort((a,b) => a.name.localeCompare(b.name));
    let html = '';
    
    children.forEach(cat => {
      const indent = '  '.repeat(level);
      const prefix = level > 0 ? '└─ ' : '';
      html += `<option value="${cat.id}">${indent}${prefix}${cat.name}</option>`;
      html += buildHierarchicalCategoryOptions(categories, cat.id, level + 1);
    });
    
    return html;
  }
  // fillCats function removed - categories are now handled through updateFormFields()
  function setVisibility(){
    const t=type.value;
    const lblFromAcc = $('#lblFromAcc');
    const lblToAcc = $('#lblToAcc');
    
    // Update field labels and visibility based on transaction type
    if (t==='Expense'){
      // Expense: From=accounts, To=categories
      if (lblFromAcc) {
        lblFromAcc.classList.remove('hidden');
        const span = lblFromAcc.querySelector('span');
        if (span) span.textContent = 'From Account';
      }
      if (lblToAcc) {
        lblToAcc.classList.remove('hidden');
        const span = lblToAcc.querySelector('span');
        if (span) span.textContent = 'To Category';
      }
      fromSel.required=true; toSel.required=true;
    }else if (t==='Income'){
      // Income: From=categories, To=accounts
      if (lblFromAcc) {
        lblFromAcc.classList.remove('hidden');
        const span = lblFromAcc.querySelector('span');
        if (span) span.textContent = 'Income Type';
      }
      if (lblToAcc) {
        lblToAcc.classList.remove('hidden');
        const span = lblToAcc.querySelector('span');
        if (span) span.textContent = 'To Account';
      }
      fromSel.required=true; toSel.required=true;
    }else if (t==='Transfer'){
      // Transfer: From=accounts, To=accounts
      if (lblFromAcc) {
        lblFromAcc.classList.remove('hidden');
        const span = lblFromAcc.querySelector('span');
        if (span) span.textContent = 'From Account';
      }
      if (lblToAcc) {
        lblToAcc.classList.remove('hidden');
        const span = lblToAcc.querySelector('span');
        if (span) span.textContent = 'To Account';
      }
      fromSel.required=true; toSel.required=true;
    }else if (t==='Credit Card Payment'){
      // CC Payment: From=accounts, To=credit cards
      if (lblFromAcc) {
        lblFromAcc.classList.remove('hidden');
        const span = lblFromAcc.querySelector('span');
        if (span) span.textContent = 'From Account';
      }
      if (lblToAcc) {
        lblToAcc.classList.remove('hidden');
        const span = lblToAcc.querySelector('span');
        if (span) span.textContent = 'To Credit Card';
      }
      fromSel.required=true; toSel.required=true;
    }
    
    // Update form fields based on transaction type
    updateFormFields();
    
    // Handle FX field visibility (new compact layout)
    const showFx = currency.value !== 'USD';
    if (fxRow) {
      fxRow.style.display = showFx ? 'block' : 'none';
    }
    
    // Show/hide deferred payment fields for credit card expenses
    const deferredFields = $('#deferredFields');
    const fromAccount = $('#txnFromAccount');
    if (t === 'Expense' && fromAccount.value) {
      const account = AppState.State.accounts.find(a => a.id === fromAccount.value);
      if (account && Utils.accountType(account) === 'credit-card') {
        deferredFields.style.display = 'block';
      } else {
        deferredFields.style.display = 'none';
      }
    } else {
      deferredFields.style.display = 'none';
    }
  }
  
  // Function to check if selected account is a credit card and show installment option
  function checkForCreditCardInstallments() {
    const selectedFromAccount = fromSel.value;
    const deferredFields = $('#deferredFields');
    const isDeferredCheckbox = $('#txnIsDeferred');
    const deferredMonthsRow = $('#deferredMonthsRow');
    
    if (selectedFromAccount && deferredFields && isDeferredCheckbox) {
      // Check if the selected account is a credit card
      const account = AppState.State.accounts.find(acc => acc.id === selectedFromAccount);
      const isCreditCard = account && Utils.accountType(account) === 'credit-card';
      
      // Show installment option only for credit card accounts in expense transactions
      if (isCreditCard && type.value === 'Expense') {
        deferredFields.style.display = 'block';
      } else {
        deferredFields.style.display = 'none';
        // Reset checkbox and hide months when hiding
        isDeferredCheckbox.checked = false;
        if (deferredMonthsRow) deferredMonthsRow.style.display = 'none';
      }
    }
  }
  function validateForm(){
    const t=type.value;
    const amtOk=Number(amount.value)>0;
    const requiresFx = currency.value !== 'USD';
    const fxVal = requiresFx ? fx.value : (fx.value || '1');
    const fxOk = requiresFx? Number(fxVal)>0 : true;
    let accountsOk=true;
    
    // In new layout, categories are handled through toSel for expenses
    if(t==='Expense') accountsOk=!!fromSel.value && !!toSel.value; // toSel contains category for expenses
    if(t==='Income') accountsOk=!!toSel.value; // toSel contains account for income
    if(t==='Transfer'||t==='Credit Card Payment') accountsOk=!!fromSel.value && !!toSel.value && fromSel.value!==toSel.value;
    
    Validate.setValidity(amount, amtOk, 'Amount must be > 0');
    Validate.setValidity(fx, fxOk, requiresFx ? 'FX rate required' : '');
    Validate.setValidity(fromSel, (t==='Expense'||t==='Transfer'||t==='Credit Card Payment')?!!fromSel.value:true, 'Required');
    Validate.setValidity(toSel, !!toSel.value, 'Required'); // toSel is always required in new layout
    
    Validate.setValidity(date, !!date.value, 'Pick a date');
    btnSubmit.disabled = !(amtOk && accountsOk && (!!date.value) && fxOk);
  }
  let fxRequestId = 0;
  async function updateFx(){
    console.log('🔄 updateFx called - Currency:', currency.value, 'Date:', date.value);
    
    fx.placeholder='';
    fx.readOnly = currency.value==='USD';
    if(currency.value==='USD'){ 
      fx.value=1; 
      Validate.setValidity(fx, true, "");
      validateForm(); 
      return; 
    }
    
    const iso=date.value||Utils.todayISO();
    const requestId = ++fxRequestId;
    
    console.log(`📅 Processing FX for ${currency.value} on ${iso}`);
    
    // Set a default rate immediately to prevent validation errors
    const defaultRate = Utils.getFallbackRate ? Utils.getFallbackRate(currency.value, 'USD') : 0.05;
    fx.value = defaultRate.toFixed(4);
    fx.placeholder = 'Loading...';
    Validate.setValidity(fx, true, "");
    validateForm();
    
    try{
      // Use historical FX rate if date is not today
      const today = Utils.todayISO();
      let rate;
      
      if (iso !== today) {
        // Fetch historical rate for the selected date
        console.log(`📊 Fetching historical FX rate for ${currency.value} to USD on ${iso}`);
        rate = await Utils.fetchHistoricalFXRate(currency.value, 'USD', iso);
        fx.placeholder = `Historical rate for ${iso}`;
        console.log(`✅ Historical rate fetched: ${rate}`);
      } else {
        // Use current rate for today
        console.log(`📊 Fetching current FX rate for ${currency.value} to USD`);
        rate = await Utils.ensureFxForDate(iso);
        fx.placeholder = 'Current rate';
        console.log(`✅ Current rate fetched: ${rate}`);
      }
      
      if (requestId!==fxRequestId) {
        console.log('⏭️ Request cancelled, newer request in progress');
        return;
      }
      
      fx.value=Number(rate).toFixed(4);
      Validate.setValidity(fx, true, "");
      console.log(`💾 FX rate set to: ${fx.value}`);
    }catch(e){
      if (requestId!==fxRequestId) {
        console.log('⏭️ Request cancelled, newer request in progress');
        return;
      }
      console.warn('❌ FX rate fetch failed, using fallback:', e);
      // Keep the default rate that was set earlier
      fx.placeholder = `Using fallback rate (${currency.value} → USD)`;
      Validate.setValidity(fx, true, "");
    }
    validateForm();
  }
  function resetForm(){
    form.reset();
    // Clear touched classes from all form elements
    $all('#formTxn input, #formTxn select').forEach(el=> Validate.clearTouched(el));
    fillAccounts();
    setVisibility();
    validateForm();
    const last=AppState.State.settings.lastTxnDate;
    if (AppState.State.settings.defaultTxnDateMode==='selected' && last){ date.value=last; }
    else { date.value=Utils.todayISO(); }
    updateFx();
    editingId=null;
    hiddenId.value='';
    btnSubmit.textContent='Add';
    btnCancel.classList.remove('hidden'); // Always show cancel button
    // Don't scroll automatically on reset - will be handled by caller if needed
  }
  function prefillForm(txn, duplicate=false){
    form.reset();
    // Clear touched classes from all form elements
    $all('#formTxn input, #formTxn select').forEach(el=> Validate.clearTouched(el));
    editingId = duplicate? null : txn.id;
    hiddenId.value = duplicate? '' : txn.id;
    type.value=txn.transactionType;
    setVisibility();
    date.value=txn.date;
    amount.value=txn.amount;
    currency.value=txn.currency||'USD';
    fx.value=Number(txn.fxRate||1).toFixed(4);
    fx.placeholder='';
    
    // Set field values based on transaction type
    if (txn.transactionType === 'Expense') {
      // Expense: From=account, To=category
      fromSel.value = txn.fromAccountId || '';
      toSel.value = txn.categoryId || '';
    } else if (txn.transactionType === 'Income') {
      // Income: From=category, To=account
      fromSel.value = txn.categoryId || '';
      toSel.value = txn.toAccountId || '';
    } else if (txn.transactionType === 'Transfer' || txn.transactionType === 'Credit Card Payment') {
      // Transfer/CC Payment: From=account, To=account
      fromSel.value = txn.fromAccountId || '';
      toSel.value = txn.toAccountId || '';
    }
    
    desc.value=txn.description||'';
    validateForm();
    btnSubmit.textContent = duplicate? 'Add' : 'Save Changes';
    btnCancel.classList.remove('hidden'); // Always show cancel button
  }
  fillAccounts();
  const filterCategoryEl = document.getElementById('filterCategory');
  if (filterCategoryEl) {
    filterCategoryEl.innerHTML = buildFilterCategoryOptions();
  }
  setVisibility();
  validateForm();
  if (AppState.State.settings.defaultTxnDateMode==='selected' && AppState.State.settings.lastTxnDate){ date.value = AppState.State.settings.lastTxnDate; }
  else { date.value = Utils.todayISO(); }
  updateFx();
  type.addEventListener('change', ()=>{ setVisibility(); validateForm(); });
  fromSel.addEventListener('change', ()=>{ checkForCreditCardInstallments(); validateForm(); });
  $all('#formTxn input, #formTxn select').forEach(el=> {
    el.addEventListener('input', (e) => {
      Validate.markTouched(e.target);
      validateForm();
    });
    el.addEventListener('blur', (e) => Validate.markTouched(e.target));
    el.addEventListener('change', (e) => Validate.markTouched(e.target));
  });
  currency.addEventListener('change', updateFx);
  date.addEventListener('change', updateFx);
  
  // Deferred payment event listeners
  const isDeferredCheckbox = $('#txnIsDeferred');
  const deferredMonthsInput = $('#txnDeferredMonths');
  const monthlyPaymentSpan = $('#monthlyPaymentAmount');
  
  if (isDeferredCheckbox) {
    isDeferredCheckbox.addEventListener('change', function() {
      const deferredCalc = $('#deferredCalc');
      const lblDeferredMonths = $('#lblDeferredMonths');
      
      if (this.checked) {
        lblDeferredMonths.style.display = 'block';
        deferredCalc.style.display = 'block';
        updateMonthlyPayment();
      } else {
        lblDeferredMonths.style.display = 'none';
        deferredCalc.style.display = 'none';
      }
    });
  }
  
  if (deferredMonthsInput) {
    deferredMonthsInput.addEventListener('input', updateMonthlyPayment);
  }
  
  function updateMonthlyPayment() {
    if (isDeferredCheckbox && isDeferredCheckbox.checked && amount.value && deferredMonthsInput && deferredMonthsInput.value) {
      const monthlyAmount = Number(amount.value) / Number(deferredMonthsInput.value);
      if (monthlyPaymentSpan) {
        monthlyPaymentSpan.textContent = Utils.formatMoneyUSD(monthlyAmount);
      }
    }
  }
  // Form status updates
  function updateFormStatus(status, type = 'ready') {
    if (formStatus) {
      formStatus.textContent = status;
      formStatus.className = `status-indicator ${type}`;
    }
  }

  // Toggle filters section
  if (btnToggleFilters) {
    btnToggleFilters.addEventListener('click', () => {
      if (filtersSection) {
        const isVisible = filtersSection.style.display !== 'none';
        filtersSection.style.display = isVisible ? 'none' : 'block';
        btnToggleFilters.textContent = isVisible ? '🔍' : '❌';
      }
    });
  }

  // Refresh log
  if (btnRefreshLog) {
    btnRefreshLog.addEventListener('click', () => {
      updateFormStatus('Refreshing...', 'busy');
      drawTable();
      setTimeout(() => updateFormStatus('Ready', 'ready'), 500);
    });
  }

  // Enhanced deferred payment handling for compact layout
  if (isDeferredCheckbox && deferredMonthsRow) {
    isDeferredCheckbox.addEventListener('change', function() {
      deferredMonthsRow.style.display = this.checked ? 'block' : 'none';
      if (this.checked) {
        const monthlyPaymentCalc = () => {
          const totalAmount = Number($('#txnAmount').value || 0);
          const months = Number($('#txnDeferredMonths').value || 1);
          const monthlyAmount = totalAmount / months;
          const monthlyPaymentSpan = $('#monthlyPaymentAmount');
          if (monthlyPaymentSpan) {
            monthlyPaymentSpan.textContent = Utils.formatMoneyUSD(monthlyAmount);
          }
        };
        monthlyPaymentCalc();
        $('#txnAmount').addEventListener('input', monthlyPaymentCalc);
        $('#txnDeferredMonths').addEventListener('input', monthlyPaymentCalc);
      }
    });
  }

  const debouncedFilters=Utils.debounce(()=> drawTable(), 300);
  
  // Add event listeners for all filters with debugging
  if (filterText) {
    filterText.addEventListener('input', () => {
      console.log('Filter text changed to:', filterText.value);
      debouncedFilters();
    });
  }
  [filterAmountMin, filterAmountMax].forEach(el=> {
    if (el) {
      el.addEventListener('input', () => {
        console.log(`Amount filter changed: ${el.id} = ${el.value}`);
        debouncedFilters();
      });
    }
  });
  [filterType, filterStart, filterEnd, filterAccount, filterCategory].forEach(el=> {
    if (el) {
      el.addEventListener('change', () => {
        console.log(`Filter changed: ${el.id} = ${el.value}`);
        drawTable();
      });
    }
  });
  
  // Clear all filters
  if (filterClear) {
    filterClear.addEventListener('click', ()=>{ 
      if (filterText) filterText.value=''; 
      if (filterType) filterType.value=''; 
      if (filterStart) filterStart.value=''; 
      if (filterEnd) filterEnd.value=''; 
      if (filterAmountMin) filterAmountMin.value='';
      if (filterAmountMax) filterAmountMax.value='';
      if (filterAccount) filterAccount.value=''; 
      if (filterCategory) filterCategory.value=''; 
      drawTable(); 
    });
  }
  btnCancel.addEventListener('click', ()=> resetForm());
  // Bulk Grid Variables
  let bulkTransactions = [];
  let currentRow = 0;
  let currentCol = 0;

  // Initialize bulk grid
  function initBulkGrid() {
    bulkTransactions = [];
    addBulkRows(3); // Start with 3 empty rows
    updateBulkCount();
    
    // Auto-focus first row's date field for better UX
    setTimeout(() => {
      const firstDateField = bulkGridBody?.querySelector('[data-field="date"]');
      if (firstDateField) {
        firstDateField.focus();
        firstDateField.select();
      }
    }, 100);
  }

  function addBulkRows(count = 1) {
    for (let i = 0; i < count; i++) {
      const rowData = {
        id: crypto.randomUUID(),
        date: Utils.todayISO(),
        type: 'Expense',
        amount: '',
        currency: 'USD',
        fromAccount: '',
        toAccount: '',
        description: '',
        fxRate: 1,
        isDeferred: false,
        deferredMonths: 0
      };
      bulkTransactions.push(rowData);
    }
    renderBulkGrid();
    
    // Ensure all rows have correct dropdown options based on their type
    bulkTransactions.forEach((_, index) => {
      updateToAccountOptions(index);
    });
  }

  function deleteBulkRow(id) {
    bulkTransactions = bulkTransactions.filter(t => t.id !== id);
    renderBulkGrid();
    updateBulkCount();
  }

  function clearBulkGrid() {
    bulkTransactions = [];
    addBulkRows(3);
    updateBulkCount();
  }

  function updateBulkCount() {
    const validTransactions = bulkTransactions.filter(t => {
      if (!t.date || !t.amount || !t.type) return false;
      
      // Validate based on transaction type
      if (t.type === 'Expense') {
        return !!(t.fromAccount && t.toAccount);
      } else if (t.type === 'Income') {
        return !!(t.fromAccount && t.toAccount);
      } else if (t.type === 'Transfer' || t.type === 'Credit Card Payment') {
        return !!(t.fromAccount && t.toAccount && t.fromAccount !== t.toAccount);
      }
      return false;
    });
    
    const totalTransactions = bulkTransactions.filter(t => t.date || t.amount || t.type).length;
    
    if (bulkCount) {
      bulkCount.textContent = `${validTransactions.length} of ${totalTransactions} transactions ready`;
      
      // Update visual styling based on validation status
      if (validTransactions.length > 0) {
        bulkCount.style.color = 'var(--good)';
      } else if (totalTransactions > 0) {
        bulkCount.style.color = 'var(--warning)';
      } else {
        bulkCount.style.color = 'var(--muted)';
      }
    }
    
    // Update row validation indicators
    bulkTransactions.forEach((txn, index) => {
      const row = bulkGridBody?.querySelector(`tr[data-row="${index}"]`);
      if (row) {
        const isValid = validTransactions.includes(txn);
        const hasPartialData = txn.date || txn.amount || txn.type;
        
        row.classList.remove('row-valid', 'row-invalid', 'row-partial');
        if (isValid) {
          row.classList.add('row-valid');
        } else if (hasPartialData) {
          row.classList.add('row-partial');
        } else {
          row.classList.add('row-invalid');
        }
      }
    });
  }

  function buildAccountOptions() {
    return AppState.State.accounts.map(acc => 
      `<option value="${acc.id}">${acc.name}</option>`
    ).join('');
  }

  function buildCategoryOptions(type = 'expense') {
    // Build categories based on transaction type - return simple option tags for bulk grid
    if (type === 'expense') {
      return Utils.buildCategoryOptions('expense');
    } else if (type === 'income') {
      return Utils.buildCategoryOptions('income');
    } else {
      // For transfers and other types, show both
      const expenseOptions = Utils.buildCategoryOptions('expense');
      const incomeOptions = Utils.buildCategoryOptions('income');
      return expenseOptions + incomeOptions;
    }
  }

  function buildCreditCardOptions() {
    const creditCards = AppState.State.accounts.filter(acc => Utils.accountType(acc) === 'credit-card');
    return creditCards.map(acc => 
      `<option value="${acc.id}">${Utils.accountIcon(acc)} ${acc.name}</option>`
    ).join('');
  }

  function renderBulkGrid() {
    if (!bulkGridBody) return;
    
    const accountOptions = buildAccountOptions();
    
    bulkGridBody.innerHTML = bulkTransactions.map((txn, index) => {
      const isIncome = txn.type === 'Income';
      const isExpense = txn.type === 'Expense';
      
      // Get the correct options based on transaction type
      let fromAccountOptions, toAccountOptions;
      
      if (isIncome) {
        // For income: From = Income categories, To = Accounts
        fromAccountOptions = buildCategoryOptions('income');
        toAccountOptions = accountOptions;
      } else if (isExpense) {
        // For expense: From = Accounts, To = Expense categories
        fromAccountOptions = accountOptions;
        toAccountOptions = buildCategoryOptions('expense');
      } else {
        // For transfer/CC payment: From = Accounts, To = Accounts
        fromAccountOptions = accountOptions;
        toAccountOptions = accountOptions;
      }
      
      return `
      <tr data-row="${index}" data-id="${txn.id}" class="bulk-row">
        <td>
          <input type="date" 
                 class="grid-cell-date" 
                 value="${txn.date}"
                 data-field="date"
                 tabindex="${index * 9 + 1}">
        </td>
        <td>
          <select class="grid-cell-select" 
                  data-field="type"
                  tabindex="${index * 9 + 2}">
            <option value="Expense" ${txn.type === 'Expense' ? 'selected' : ''}>💸 Expense</option>
            <option value="Income" ${txn.type === 'Income' ? 'selected' : ''}>💰 Income</option>
            <option value="Transfer" ${txn.type === 'Transfer' ? 'selected' : ''}>🔄 Transfer</option>
            <option value="Credit Card Payment" ${txn.type === 'Credit Card Payment' ? 'selected' : ''}>💳 CC Payment</option>
          </select>
        </td>
        <td>
          <input type="number" 
                 class="grid-cell-number" 
                 step="0.01" 
                 placeholder="0.00"
                 value="${txn.amount}"
                 data-field="amount"
                 tabindex="${index * 9 + 3}">
        </td>
        <td>
          <select class="grid-cell-select" 
                  data-field="currency"
                  tabindex="${index * 9 + 4}">
            <option value="USD" ${txn.currency === 'USD' ? 'selected' : ''}>🇺🇸 USD</option>
            <option value="MXN" ${txn.currency === 'MXN' ? 'selected' : ''}>🇲🇽 MXN</option>
          </select>
        </td>
        <td>
          <select class="grid-cell-select" 
                  data-field="fromAccount"
                  tabindex="${index * 9 + 5}">
            <option value="">${isIncome ? 'Select Income Source...' : 'Select Account...'}</option>
            ${fromAccountOptions}
          </select>
        </td>
        <td>
          <select class="grid-cell-select" 
                  data-field="toAccount"
                  tabindex="${index * 9 + 6}">
            <option value="">${isExpense ? 'Select Category...' : 'Select Account...'}</option>
            ${toAccountOptions}
          </select>
        </td>
        <td>
          <input type="text" 
                 class="grid-cell-input" 
                 placeholder="Description..."
                 value="${txn.description}"
                 data-field="description"
                 tabindex="${index * 9 + 7}">
        </td>
        <td>
          <input type="number" 
                 class="grid-cell-number" 
                 step="0.0001" 
                 placeholder="Auto"
                 value="${txn.fxRate !== 1 ? txn.fxRate : ''}"
                 data-field="fxRate"
                 tabindex="${index * 9 + 8}">
        </td>
        <td class="installments-cell">
          <div class="installments-controls" style="display: flex; align-items: center; gap: 4px;">
            <input type="checkbox" 
                   class="installment-checkbox" 
                   data-field="isDeferred"
                   ${txn.isDeferred ? 'checked' : ''}
                   tabindex="${index * 9 + 9}">
            <input type="number" 
                   class="grid-cell-number installment-months" 
                   min="1" 
                   max="60" 
                   value="${txn.deferredMonths || ''}"
                   placeholder="Months"
                   data-field="deferredMonths"
                   style="width: 60px; display: ${txn.isDeferred ? 'block' : 'none'};"
                   tabindex="${index * 9 + 10}">
          </div>
        </td>
        <td>
          <div class="grid-row-actions">
            <button type="button" class="grid-delete-btn" data-delete="${txn.id}" title="Delete row">🗑️</button>
          </div>
        </td>
      </tr>
      `;
    }).join('');

    // Add event listeners for grid interactions
    addGridEventListeners();
  }

  function addGridEventListeners() {
    // Handle input changes
    bulkGridBody.addEventListener('input', (e) => {
      const field = e.target.dataset.field;
      const row = parseInt(e.target.closest('tr').dataset.row);
      const value = e.target.value;
      
      if (bulkTransactions[row] && field) {
        bulkTransactions[row][field] = field === 'amount' || field === 'fxRate' ? 
          (value ? Number(value) : (field === 'fxRate' ? 1 : '')) : value;
        
        // Auto-fill logic
        if (field === 'type') {
          updateToAccountOptions(row);
        }
        
        if (field === 'currency' && value === 'USD') {
          bulkTransactions[row].fxRate = 1;
          const fxField = e.target.closest('tr').querySelector('[data-field="fxRate"]');
          if (fxField) fxField.value = '';
        }
        
        // Smart auto-fill for date field
        if (field === 'date' && value && row > 0) {
          // Copy date from previous row if it's the same day
          const prevDate = bulkTransactions[row - 1]?.date;
          if (prevDate && !value) {
            bulkTransactions[row].date = prevDate;
            e.target.value = prevDate;
          }
        }
        
        // Auto-add new row if this is the last row and has meaningful content
        if (row === bulkTransactions.length - 1 && value && field !== 'description') {
          addBulkRows(1);
        }
        
        updateBulkCount();
      }
    });

    // Handle tab navigation
    bulkGridBody.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' || e.key === 'Enter') {
    e.preventDefault();
        const currentElement = e.target;
        const currentTabIndex = parseInt(currentElement.tabIndex);
        const nextTabIndex = e.shiftKey ? currentTabIndex - 1 : currentTabIndex + 1;
        const nextElement = bulkGridBody.querySelector(`[tabindex="${nextTabIndex}"]`);
        
        if (nextElement) {
          nextElement.focus();
          if (nextElement.select) nextElement.select();
        } else if (!e.shiftKey) {
          // If we're at the end and pressing Tab/Enter, add a new row
          const currentRow = parseInt(currentElement.closest('tr')?.dataset.row || '0');
          if (currentRow === bulkTransactions.length - 1) {
            addBulkRows(1);
            // Focus the new row's first field
            setTimeout(() => {
              const newRowDateField = bulkGridBody.querySelector(`tr[data-row="${bulkTransactions.length - 1}"] [data-field="date"]`);
              if (newRowDateField) {
                newRowDateField.focus();
                newRowDateField.select();
              }
            }, 50);
          }
        }
      }
    });

    // Handle row deletion
    bulkGridBody.addEventListener('click', (e) => {
      if (e.target.dataset.delete) {
        deleteBulkRow(e.target.dataset.delete);
      }
    });

    // Handle installment checkbox changes
    bulkGridBody.addEventListener('change', (e) => {
      if (e.target.classList.contains('installment-checkbox')) {
        const row = parseInt(e.target.closest('tr').dataset.row);
        const isChecked = e.target.checked;
        const monthsInput = e.target.closest('tr').querySelector('.installment-months');
        
        if (bulkTransactions[row]) {
          bulkTransactions[row].isDeferred = isChecked;
          
          if (monthsInput) {
            monthsInput.style.display = isChecked ? 'block' : 'none';
            if (isChecked && !bulkTransactions[row].deferredMonths) {
              bulkTransactions[row].deferredMonths = 1;
              monthsInput.value = '1';
            } else if (!isChecked) {
              bulkTransactions[row].deferredMonths = 0;
              monthsInput.value = '';
            }
          }
          
          updateBulkCount();
        }
      }
    });
  }

  function updateToAccountOptions(rowIndex) {
    const row = bulkGridBody.querySelector(`tr[data-row="${rowIndex}"]`);
    const typeSelect = row.querySelector('[data-field="type"]');
    const fromSelect = row.querySelector('[data-field="fromAccount"]');
    const toSelect = row.querySelector('[data-field="toAccount"]');
    const fromTd = fromSelect.closest('td');
    const toTd = toSelect.closest('td');
    const type = typeSelect.value;
    
    const isIncome = type === 'Income';
    const isExpense = type === 'Expense';
    const isTransfer = type === 'Transfer';
    const isCCPayment = type === 'Credit Card Payment';
    
    // Handle "From Account" field based on transaction type
    if (isIncome) {
      // Income: From = Income categories
      fromTd.style.opacity = '';
      fromTd.style.pointerEvents = '';
      fromSelect.disabled = false;
      fromSelect.tabIndex = parseInt(row.dataset.row) * 8 + 5;
      const incomeCategoryOptions = buildCategoryOptions('income');
      fromSelect.innerHTML = `<option value="">Select Income Type...</option>${incomeCategoryOptions}`;
    } else if (isExpense || isTransfer || isCCPayment) {
      // Expense/Transfer/CC Payment: From = Accounts
      fromTd.style.opacity = '';
      fromTd.style.pointerEvents = '';
      fromSelect.disabled = false;
      fromSelect.tabIndex = parseInt(row.dataset.row) * 8 + 5;
      const accountOptions = buildAccountOptions();
      fromSelect.innerHTML = `<option value="">Select Account...</option>${accountOptions}`;
    }
    
    // Handle "To Account" field based on transaction type
    if (isExpense) {
      // Expense: To = Expense categories
      const expenseCategoryOptions = buildCategoryOptions('expense');
      toSelect.innerHTML = `<option value="">Select Category...</option>${expenseCategoryOptions}`;
    } else if (isIncome) {
      // Income: To = Accounts (where money goes)
      const accountOptions = buildAccountOptions();
      toSelect.innerHTML = `<option value="">Select Account...</option>${accountOptions}`;
    } else if (isTransfer) {
      // Transfer: To = Accounts
      const accountOptions = buildAccountOptions();
      toSelect.innerHTML = `<option value="">Select Account...</option>${accountOptions}`;
    } else if (isCCPayment) {
      // CC Payment: To = Credit cards only
      const creditCardOptions = buildCreditCardOptions();
      toSelect.innerHTML = `<option value="">Select Credit Card...</option>${creditCardOptions}`;
    }
  }

  // Bulk grid event listeners
  if (btnAddMultiple) {
    btnAddMultiple.addEventListener('click', () => {
      initBulkGrid();
      if (bulkDialog) {
        bulkDialog.showModal();
      }
    });
  }

  // Keyboard shortcut for bulk addition (Ctrl+B or Cmd+B)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b' && !e.shiftKey) {
      // Only if we're on the transactions tab
      if (window.location.hash === '#/transactions' || window.location.hash === '') {
        e.preventDefault();
        if (btnAddMultiple) {
          btnAddMultiple.click();
        }
      }
    }
  });

  if (btnBulkClose) {
    btnBulkClose.addEventListener('click', () => bulkDialog.close());
  }

  if (btnAddRow) {
    btnAddRow.addEventListener('click', () => addBulkRows(1));
  }
  
  if (btnAddRows) {
    btnAddRows.addEventListener('click', () => addBulkRows(5));
  }
  
  if (btnClearAll) {
    btnClearAll.addEventListener('click', () => {
      if (confirm('Clear all rows?')) {
        clearBulkGrid();
      }
    });
  }

  if (bulkForm) {
    bulkForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Prevent multiple submissions
      if (btnBulkSave.disabled) return;
      
      // Validate transactions based on type
      const validTransactions = bulkTransactions.filter(t => {
        if (!t.date || !t.amount || !t.type) return false;
        
        // Validate based on transaction type
        if (t.type === 'Expense') {
          return !!(t.fromAccount && t.toAccount); // fromAccount + category
        } else if (t.type === 'Income') {
          return !!(t.fromAccount && t.toAccount); // category + toAccount
        } else if (t.type === 'Transfer' || t.type === 'Credit Card Payment') {
          return !!(t.fromAccount && t.toAccount && t.fromAccount !== t.toAccount); // both accounts, different
        }
        return false;
      });
      
      const totalWithData = bulkTransactions.filter(t => t.date || t.amount || t.type).length;
      
      if (!validTransactions.length) {
        if (totalWithData === 0) {
          alert('Please enter some transaction data before saving.');
        } else {
          alert(`Found ${totalWithData} transactions with data, but none are complete.\n\nPlease ensure all required fields are filled:\n\n• Date and Amount are required\n• For Expenses: From Account + To Category\n• For Income: From Category + To Account\n• For Transfers/CC Payments: From Account + To Account (different)\n\nCheck the highlighted rows for incomplete data.`);
        }
        return;
      }

      btnBulkSave.disabled = true;
      btnBulkSave.textContent = 'Saving...';

      let savedCount = 0;
      let errorCount = 0;

      try {
        for (const txnData of validTransactions) {
          try {
            const txn = AppState.newTransaction();
            txn.date = txnData.date;
            txn.transactionType = txnData.type;
            txn.amount = Number(txnData.amount);
            txn.currency = txnData.currency || 'USD';
            txn.description = txnData.description || '';

            // Handle account assignment based on type
            if (txnData.type === 'Expense') {
              txn.fromAccountId = txnData.fromAccount || '';
              txn.toAccountId = '';
              txn.categoryId = txnData.toAccount || '';
            } else if (txnData.type === 'Income') {
              txn.fromAccountId = '';
              txn.toAccountId = txnData.toAccount || '';
              txn.categoryId = txnData.fromAccount || '';
            } else {
              // Transfer and Credit Card Payment
              txn.fromAccountId = txnData.fromAccount || '';
              txn.toAccountId = txnData.toAccount || '';
              txn.categoryId = '';
            }

            // Handle FX rate
            if (txn.currency === 'USD') {
              txn.fxRate = 1;
            } else if (txnData.fxRate && txnData.fxRate !== 1) {
              txn.fxRate = Number(txnData.fxRate);
            } else {
              try {
                txn.fxRate = await Utils.ensureFxForDate(txn.date);
              } catch (e) {
                txn.fxRate = Utils.latestUsdPerMXN();
              }
            }

            // Handle installment/deferred payment fields
            if (txnData.isDeferred && txnData.deferredMonths) {
              txn.isDeferred = true;
              txn.deferredMonths = Number(txnData.deferredMonths);
              txn.remainingMonths = txn.deferredMonths;
              
              // Calculate monthly payment amount
              const usdAmount = txn.currency === 'USD' ? txn.amount : txn.amount * txn.fxRate;
              txn.monthlyPaymentAmount = Utils.calculateMonthlyPayment ? Utils.calculateMonthlyPayment(usdAmount, txn.deferredMonths) : (usdAmount / txn.deferredMonths);
            } else {
              // Reset deferred payment fields
              txn.isDeferred = false;
              txn.deferredMonths = 0;
              txn.monthlyPaymentAmount = 0;
              txn.remainingMonths = 0;
            }

      await AppState.saveItem('transactions', txn, 'transactions');
            savedCount++;
          } catch (error) {
            console.error('Error saving individual transaction:', error);
            errorCount++;
    }
        }

        // Close dialog and refresh
    bulkDialog.close();
    drawTable();
        clearBulkGrid(); // Clear the bulk grid after successful save
        
        // Show success/error message
        if (errorCount === 0) {
          const message = `Successfully added ${savedCount} transactions!`;
          if (window.Utils && Utils.showToast) {
            Utils.showToast(message, 'success');
          } else {
            alert(message);
          }
        } else if (savedCount > 0) {
          const message = `Added ${savedCount} transactions successfully, but ${errorCount} failed. Please check the console for details.`;
          alert(message);
        } else {
          alert('Failed to save any transactions. Please check the console for details.');
        }
        
      } catch (error) {
        console.error('Error in bulk transaction processing:', error);
        alert('Error processing bulk transactions. Please try again.');
      } finally {
        btnBulkSave.disabled = false;
        btnBulkSave.textContent = '💾 Save All Transactions';
      }
    });
  }
  function updateSortButtons() {
    // Update visual state of sort buttons
    [btnSortDate, btnSortAmount, btnSortDescription].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });
    
    if (sortKey === 'date' && btnSortDate) {
      btnSortDate.classList.add('active');
      btnSortDate.textContent = `Date ${sortDir === 'desc' ? '↓' : '↑'}`;
    } else if (btnSortDate) {
      btnSortDate.textContent = 'Date';
    }
    
    if (sortKey === 'amount' && btnSortAmount) {
      btnSortAmount.classList.add('active');
      btnSortAmount.textContent = `Amount ${sortDir === 'desc' ? '↓' : '↑'}`;
    } else if (btnSortAmount) {
      btnSortAmount.textContent = 'Amount';
    }
    
    if (sortKey === 'description' && btnSortDescription) {
      btnSortDescription.classList.add('active');
      btnSortDescription.textContent = `Description ${sortDir === 'desc' ? '↓' : '↑'}`;
    } else if (btnSortDescription) {
      btnSortDescription.textContent = 'Description';
    }
  }

  btnSortAmount.addEventListener('click', ()=>{ 
    sortKey='amount'; 
    sortDir= sortDir==='desc'?'asc':'desc'; 
    updateSortButtons();
    drawTable(); 
  });
  if (btnSortDate) {
    btnSortDate.addEventListener('click', ()=>{ 
      sortKey='date'; 
      sortDir= sortDir==='desc'?'asc':'desc'; 
      updateSortButtons();
      drawTable(); 
    });
  }
  if (btnSortDescription) {
    btnSortDescription.addEventListener('click', ()=>{ 
      sortKey='description'; 
      sortDir= sortDir==='desc'?'asc':'desc'; 
      updateSortButtons();
      drawTable(); 
    });
  }
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(btnSubmit.disabled) return;
    
    try {
      updateFormStatus('Saving...', 'busy');
      console.log('Starting transaction save...');
      
    const txn=editingId? AppState.State.transactions.find(x=>x.id===editingId) : AppState.newTransaction();
    txn.id = editingId || txn.id;
    txn.date = date.value;
    txn.transactionType = type.value;
    txn.amount = Number(amount.value||0);
    txn.currency = currency.value;
    txn.fxRate = Number(fx.value||1);
    txn.description = desc.value.trim();
      console.log('Transaction data prepared:', txn);
      
      // Handle "From" and "To" fields based on transaction type
      if (txn.transactionType === 'Expense') {
        // Expense: From=account, To=category
        txn.fromAccountId = fromSel.value || '';
        txn.toAccountId = ''; // No destination account for expenses
        txn.categoryId = toSel.value || ''; // Category comes from "To" field
      } else if (txn.transactionType === 'Income') {
        // Income: From=category, To=account
        txn.fromAccountId = ''; // No source account for income
        txn.toAccountId = toSel.value || ''; // Account comes from "To" field
        txn.categoryId = fromSel.value || ''; // Income category comes from "From" field
      } else if (txn.transactionType === 'Transfer') {
        // Transfer: From=account, To=account
        txn.fromAccountId = fromSel.value || '';
        txn.toAccountId = toSel.value || '';
        txn.categoryId = ''; // No category for transfers
      } else if (txn.transactionType === 'Credit Card Payment') {
        // CC Payment: From=account, To=credit card
        txn.fromAccountId = fromSel.value || '';
        txn.toAccountId = toSel.value || '';
        txn.categoryId = ''; // No category for CC payments
      }
      
      // Handle deferred payment fields
      const isDeferredCheckbox = $('#txnIsDeferred');
      const deferredMonthsInput = $('#txnDeferredMonths');
      
      if (isDeferredCheckbox && isDeferredCheckbox.checked && deferredMonthsInput && deferredMonthsInput.value) {
        txn.isDeferred = true;
        txn.deferredMonths = Number(deferredMonthsInput.value);
        txn.remainingMonths = txn.deferredMonths;
        
        // Calculate monthly payment amount
        const usdAmount = txn.currency === 'USD' ? txn.amount : txn.amount * txn.fxRate;
        txn.monthlyPaymentAmount = Utils.calculateMonthlyPayment ? Utils.calculateMonthlyPayment(usdAmount, txn.deferredMonths) : (usdAmount / txn.deferredMonths);
      } else {
        // Reset deferred payment fields
        txn.isDeferred = false;
        txn.deferredMonths = 0;
        txn.monthlyPaymentAmount = 0;
        txn.remainingMonths = 0;
      }
      
      console.log('About to save transaction to AppState...');
    await AppState.saveItem('transactions', txn, 'transactions');
      console.log('Transaction saved successfully!');
      
    if (!editingId && AppState.State.settings.defaultTxnDateMode==='selected'){
      AppState.State.settings.lastTxnDate = txn.date;
      await AppState.saveItem('settings', AppState.State.settings, 'settings');
    }
      
      // Show success feedback
      const action = editingId ? 'updated' : 'added';
      const usdAmount = txn.currency === 'USD' ? txn.amount : txn.amount * txn.fxRate;
      const message = `Transaction ${action} successfully! ${txn.transactionType}: ${Utils.formatMoneyUSD(usdAmount)}`;
      
      console.log('Success message:', message);
      
      // Show toast notification if available, otherwise use alert
      if (window.Utils && Utils.showToast) {
        Utils.showToast(message, 'success');
      } else {
        // Create a temporary success message
        const successDiv = document.createElement('div');
        successDiv.style.cssText = `
          position: fixed; top: 20px; right: 20px; z-index: 10000;
          background: var(--good); color: white; padding: 12px 20px;
          border-radius: var(--radius); box-shadow: var(--shadow);
          font-weight: 600; max-width: 300px;
        `;
        successDiv.textContent = message;
        document.body.appendChild(successDiv);
        
        // Remove after 3 seconds
        setTimeout(() => {
          if (successDiv.parentNode) {
            successDiv.parentNode.removeChild(successDiv);
          }
        }, 3000);
      }
      
      console.log('About to draw table...');
    drawTable();
      console.log('About to reset form...');
      resetForm();
      
      // Update form status to show success
      updateFormStatus('Saved!', 'ready');
      setTimeout(() => updateFormStatus('Ready', 'ready'), 2000);
      
      // Focus on the date field for next transaction (after reset completes)
      setTimeout(() => {
        if (date && date.focus) {
          console.log('Setting focus to date field');
          date.focus();
          date.select(); // Also select the content
        }
      }, 200); // Increased timeout to ensure reset completes
      
    } catch (error) {
      console.error('Error saving transaction:', error);
      updateFormStatus('Error saving transaction', 'error');
      alert('Error saving transaction: ' + error.message);
      setTimeout(() => updateFormStatus('Ready', 'ready'), 3000);
    }
  });
  async function removeTxn(id){
    if(await Utils.confirmDialog('Delete this transaction?')){
      await AppState.deleteItem('transactions', id, 'transactions');
      drawTable();
    }
  }
  function passesFilter(t){
    const txt=filterText.value.toLowerCase();
    const typ=filterType.value;
    const start=filterStart.value;
    const end=filterEnd.value;
    const acc = filterAccount.value;
if (acc) {
  // Accept either account ID or legacy account NAME stored in the transaction
  const accObj   = AppState.State.accounts.find(a => a.id === acc);
  const accNameL = (accObj?.name || '').toLowerCase();

  const fromRaw = (t.fromAccountId || '');
  const toRaw   = (t.toAccountId   || '');

  const fromMatch =
    fromRaw === acc || fromRaw.toLowerCase() === accNameL;

  const toMatch =
    toRaw === acc || toRaw.toLowerCase() === accNameL;

  if (!(fromMatch || toMatch)) return false;
}
    if(cat && rootCategoryId(t.categoryId)!==cat) return false;
    return true;
  }
  
function passesFilter2(t){
  // --- read filter values safely ---
  const txt   = (filterText.value || '').toLowerCase().trim();
  const typ   = filterType.value || '';
  const start = filterStart.value || '';
  const end   = filterEnd.value || '';
  const cat   = filterCategory.value || '';

  // --- text ---
  if (txt) {
    const desc = (t.description || '').toLowerCase();
    if (!desc.includes(txt)) return false;
  }

  // --- type ---
  if (typ && t.transactionType !== typ) return false;

  // --- date range (inclusive) ---
  if (start && t.date < start) return false;
  if (end   && t.date > end)   return false;

  // --- account (match by ID OR by visible name in the dropdown) ---
  const accSel   = document.querySelector('#filterAccount');
  const accId    = accSel?.value || '';
  const accLabel = accSel?.selectedOptions?.[0]?.text?.trim().toLowerCase() || '';

  if (accId) {
    const fromRaw = String(t.fromAccountId || '').trim();
    const toRaw   = String(t.toAccountId   || '').trim();
    const fromLow = fromRaw.toLowerCase();
    const toLow   = toRaw.toLowerCase();

    const match =
      // Exact ID match (normal case)
      fromRaw === accId || toRaw === accId ||
      // Legacy rows that stored the account NAME instead of ID
      (accLabel && (fromLow === accLabel || toLow === accLabel));

    if (!match) return false;
  }

  // --- category (root category match, like your UI expects) ---
  if (cat && rootCategoryId(t.categoryId) !== cat) return false;

  return true;
}
// Enhanced transaction filter
function txFilter(t){
  const txtEl = document.getElementById('filterText');
  const typEl = document.getElementById('filterType');
  const startEl = document.getElementById('filterStart');
  const endEl = document.getElementById('filterEnd');
  const amountMinEl = document.getElementById('filterAmountMin');
  const amountMaxEl = document.getElementById('filterAmountMax');
  const catEl = document.getElementById('filterCategory');
  
  // Check if elements exist - if not, show all transactions
  if (!txtEl || !typEl || !startEl || !endEl || !amountMinEl || !amountMaxEl || !catEl) {
    return true; 
  }

  const txt = (txtEl.value || '').toLowerCase().trim();
  const typ = typEl.value || '';
  const start = startEl.value || '';
  const end = endEl.value || '';
  const amountMin = amountMinEl.value || '';
  const amountMax = amountMaxEl.value || '';
  const cat = catEl.value || '';
  
  // Quick debug - log when filters are applied
  const hasAnyFilter = txt || typ || start || end || amountMin || amountMax || cat;
  if (hasAnyFilter) {
    console.log('Applying filters:', { txt, typ, start, end, amountMin, amountMax, cat });
  }

  // Description filter
  if (txt && !((t.description || '').toLowerCase().includes(txt))) {
    return false;
  }
  
  // Transaction type filter
  if (typ && t.transactionType !== typ) {
    return false;
  }
  
  // Date range filters
  if (start && t.date < start) {
    return false;
  }
  if (end && t.date > end) {
    return false;
  }

  // Amount filters (convert to USD for comparison)
  const usdAmount = t.currency === 'USD' ? Number(t.amount) : Number(t.amount) * Number(t.fxRate || 1);
  if (amountMin && usdAmount < Number(amountMin)) {
    return false;
  }
  if (amountMax && usdAmount > Number(amountMax)) {
    return false;
  }

  // Account filter: match by ID
  const accEl = document.getElementById('filterAccount');
  const accId = accEl?.value || '';
  if (accId){
    const fromRaw = String(t.fromAccountId || '').trim();
    const toRaw   = String(t.toAccountId   || '').trim();
    const match = fromRaw === accId || toRaw === accId;
    if (!match) {
      return false;
    }
  }

  // Category filter (root category match)
  if (cat && rootCategoryId(t.categoryId) !== cat) {
    return false;
  }
  
  return true;
}

function updateFilterStatus(filteredCount, totalCount) {
  const filterTextEl = document.getElementById('filterText');
  const filterTypeEl = document.getElementById('filterType');
  const filterStartEl = document.getElementById('filterStart');
  const filterEndEl = document.getElementById('filterEnd');
  const filterAmountMinEl = document.getElementById('filterAmountMin');
  const filterAmountMaxEl = document.getElementById('filterAmountMax');
  const filterAccountEl = document.getElementById('filterAccount');
  const filterCategoryEl = document.getElementById('filterCategory');
  const filterClearEl = document.getElementById('btnClearFilters');
  
  if (!filterClearEl) return; // Safety check
  
  const hasActiveFilters = (
    (filterTextEl?.value || '') || 
    (filterTypeEl?.value || '') || 
    (filterStartEl?.value || '') || 
    (filterEndEl?.value || '') || 
    (filterAmountMinEl?.value || '') || 
    (filterAmountMaxEl?.value || '') || 
    (filterAccountEl?.value || '') || 
    (filterCategoryEl?.value || '')
  );
  
  // Update clear button text to show filter status
  if (hasActiveFilters) {
    filterClearEl.textContent = `Clear (${filteredCount}/${totalCount})`;
    filterClearEl.classList.add('active');
  } else {
    filterClearEl.textContent = 'Clear All';
    filterClearEl.classList.remove('active');
  }
}

// Swipe gesture functionality for mobile
function addSwipeGestures(container) {
  if (!container) return;
  
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let isSwiping = false;
  let swipedRow = null;
  
  // Touch events
  container.addEventListener('touchstart', (e) => {
    const row = e.target.closest('.transaction-row');
    if (!row) return;
    
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    currentX = startX;
    currentY = startY;
    isSwiping = false;
    swipedRow = row;
    
    // Reset any previous swipe states
    resetSwipeState();
  }, { passive: true });
  
  container.addEventListener('touchmove', (e) => {
    if (!swipedRow) return;
    
    const touch = e.touches[0];
    currentX = touch.clientX;
    currentY = touch.clientY;
    
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;
    
    // Only start swiping if horizontal movement is greater than vertical
    if (!isSwiping && Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      isSwiping = true;
      swipedRow.classList.add('swiping');
    }
    
    if (isSwiping) {
      // Prevent default to avoid scrolling
      e.preventDefault();
      
      // Limit swipe distance
      const maxSwipe = 80;
      const clampedDeltaX = Math.max(-maxSwipe, Math.min(maxSwipe, deltaX));
      
      // Apply visual feedback
      if (clampedDeltaX > 20) {
        swipedRow.classList.remove('swipe-right');
        swipedRow.classList.add('swipe-left');
      } else if (clampedDeltaX < -20) {
        swipedRow.classList.remove('swipe-left');
        swipedRow.classList.add('swipe-right');
      } else {
        swipedRow.classList.remove('swipe-left', 'swipe-right');
      }
    }
  }, { passive: false });
  
  container.addEventListener('touchend', (e) => {
    if (!swipedRow || !isSwiping) {
      resetSwipeState();
      return;
    }
    
    const deltaX = currentX - startX;
    const swipeThreshold = 50;
    
    // Handle swipe actions
    if (deltaX > swipeThreshold) {
      // Swipe right - Delete
      handleSwipeAction(swipedRow, 'delete');
    } else if (deltaX < -swipeThreshold) {
      // Swipe left - Edit
      handleSwipeAction(swipedRow, 'edit');
    }
    
    // Reset swipe state
    setTimeout(() => {
      resetSwipeState();
    }, 300);
  }, { passive: true });
  
  function resetSwipeState() {
    if (swipedRow) {
      swipedRow.classList.remove('swiping', 'swipe-left', 'swipe-right');
      swipedRow = null;
    }
    isSwiping = false;
  }
  
  function handleSwipeAction(row, action) {
    const transactionId = row.dataset.id;
    if (!transactionId) return;
    
    if (action === 'edit') {
      const tx = AppState.State.transactions.find(x => x.id === transactionId);
      if (tx) {
        prefillForm(tx);
        btnCancel.classList.remove('hidden');
        btnSubmit.textContent = 'Save Changes';
        // Scroll to form
        document.getElementById('formTxn').scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Show feedback
        if (window.Utils && Utils.showToast) {
          Utils.showToast('📝 Edit mode activated', 'success');
        }
      }
    } else if (action === 'delete') {
      if (confirm('Delete this transaction?')) {
        removeTxn(transactionId);
        
        // Show feedback
        if (window.Utils && Utils.showToast) {
          Utils.showToast('🗑️ Transaction deleted', 'success');
        }
      }
    }
  }
}

// Bulk actions functionality
function addBulkActions(container) {
  if (!container) return;
  
  const bulkToolbar = document.getElementById('bulkActionsToolbar');
  const bulkCount = document.getElementById('bulkSelectionCount');
  const btnSelectAll = document.getElementById('btnSelectAll');
  const btnSelectNone = document.getElementById('btnSelectNone');
  const btnBulkDelete = document.getElementById('btnBulkDelete');
  const btnBulkExport = document.getElementById('btnBulkExport');
  const btnCloseBulkActions = document.getElementById('btnCloseBulkActions');
  
  let selectedTransactions = new Set();
  
  // Handle checkbox changes
  container.addEventListener('change', (e) => {
    if (e.target.classList.contains('bulk-checkbox')) {
      const transactionId = e.target.dataset.bulkSelect;
      const row = e.target.closest('.transaction-row');
      
      if (e.target.checked) {
        selectedTransactions.add(transactionId);
        row.classList.add('selected');
      } else {
        selectedTransactions.delete(transactionId);
        row.classList.remove('selected');
      }
      
      updateBulkToolbar();
    }
  });
  
  // Handle row clicks (for easier selection)
  container.addEventListener('click', (e) => {
    const row = e.target.closest('.transaction-row');
    if (!row || e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
    
    const checkbox = row.querySelector('.bulk-checkbox');
    if (checkbox) {
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change'));
    }
  });
  
  // Select All button
  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', () => {
      const checkboxes = container.querySelectorAll('.bulk-checkbox');
      checkboxes.forEach(checkbox => {
        if (!checkbox.checked) {
          checkbox.checked = true;
          checkbox.dispatchEvent(new Event('change'));
        }
      });
    });
  }
  
  // Select None button
  if (btnSelectNone) {
    btnSelectNone.addEventListener('click', () => {
      const checkboxes = container.querySelectorAll('.bulk-checkbox');
      checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
          checkbox.checked = false;
          checkbox.dispatchEvent(new Event('change'));
        }
      });
    });
  }
  
  // Bulk Delete button
  if (btnBulkDelete) {
    btnBulkDelete.addEventListener('click', async () => {
      if (selectedTransactions.size === 0) return;
      
      const count = selectedTransactions.size;
      if (await Utils.confirmDialog(`Delete ${count} selected transaction${count > 1 ? 's' : ''}? This cannot be undone.`)) {
        // Delete all selected transactions without individual confirmations
        const idsToDelete = Array.from(selectedTransactions);
        for (const id of idsToDelete) {
          await AppState.deleteItem('transactions', id, 'transactions');
        }
        
        selectedTransactions.clear();
        updateBulkToolbar();
        drawTable(); // Refresh the table
        Utils.showToast(`Deleted ${count} transaction${count > 1 ? 's' : ''}`);
      }
    });
  }
  
  // Bulk Export button
  if (btnBulkExport) {
    btnBulkExport.addEventListener('click', () => {
      if (selectedTransactions.size === 0) return;
      
      exportSelectedTransactions(selectedTransactions);
    });
  }
  
  // Close Bulk Actions button
  if (btnCloseBulkActions) {
    btnCloseBulkActions.addEventListener('click', () => {
      // Clear all selections
      selectedTransactions.clear();
      
      // Uncheck all checkboxes
      const checkboxes = container.querySelectorAll('.bulk-checkbox');
      checkboxes.forEach(checkbox => {
        checkbox.checked = false;
        const row = checkbox.closest('.transaction-row');
        if (row) row.classList.remove('selected');
      });
      
      // Hide toolbar
      updateBulkToolbar();
    });
  }
  
  function updateBulkToolbar() {
    const count = selectedTransactions.size;
    
    if (count > 0) {
      if (bulkToolbar) bulkToolbar.style.display = 'flex';
      if (bulkCount) bulkCount.textContent = `${count} transaction${count > 1 ? 's' : ''} selected`;
    } else {
      if (bulkToolbar) bulkToolbar.style.display = 'none';
    }
  }
  
  
  function exportSelectedTransactions(transactionIds) {
    const selectedTxn = AppState.State.transactions.filter(t => transactionIds.has(t.id));
    
    if (selectedTxn.length === 0) {
      alert('No transactions to export.');
      return;
    }
    
    // Create CSV content
    const headers = ['Date', 'Type', 'Description', 'Amount', 'Currency', 'From Account', 'To Account', 'Category'];
    const csvContent = [
      headers.join(','),
      ...selectedTxn.map(txn => [
        txn.date,
        txn.transactionType,
        `"${(txn.description || '').replace(/"/g, '""')}"`,
        txn.amount,
        txn.currency,
        txn.fromAccountId ? (AppState.State.accounts.find(a => a.id === txn.fromAccountId)?.name || '') : '',
        txn.toAccountId ? (AppState.State.accounts.find(a => a.id === txn.toAccountId)?.name || '') : '',
        txn.categoryId ? (AppState.State.categories.find(c => c.id === txn.categoryId)?.name || '') : ''
      ].join(','))
    ].join('\n');
    
    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `selected-transactions-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    if (window.Utils && Utils.showToast) {
      Utils.showToast(`📤 Exported ${selectedTxn.length} transactions`, 'success');
    } else {
      alert(`📤 Exported ${selectedTxn.length} transactions`);
    }
  }
}

function drawTable(){
    const tbody=$('#txTableBody');
    const filterAccountEl = document.getElementById('filterAccount');
    const filterCategoryEl = document.getElementById('filterCategory');
    const selectedAcc = filterAccountEl?.value || '';
    const selectedCat = filterCategoryEl?.value || '';
    
    // refresh filter dropdowns with current accounts/categories
    fillAccounts();
    if (filterAccountEl) filterAccountEl.value = selectedAcc;
    if (filterCategoryEl) {
      filterCategoryEl.innerHTML = buildFilterCategoryOptions();
      filterCategoryEl.value = selectedCat;
    }
    
    // Filter transactions
    const allTransactions = [...AppState.State.transactions];
    console.log('Total transactions before filter:', allTransactions.length);
    console.log('Transaction table body element:', tbody);
    
    if (!tbody) {
      console.error('Cannot find transaction table body element!');
      return;
    }
    
    // Debug: Check if filter elements exist at this point
    const filterElements = {
      text: document.getElementById('filterText'),
      type: document.getElementById('filterType'),
      start: document.getElementById('filterStart'),
      end: document.getElementById('filterEnd'),
      amountMin: document.getElementById('filterAmountMin'),
      amountMax: document.getElementById('filterAmountMax'),
      account: document.getElementById('filterAccount'),
      category: document.getElementById('filterCategory')
    };
    
    console.log('Filter elements found:', Object.fromEntries(
      Object.entries(filterElements).map(([key, el]) => [key, !!el])
    ));
    
    // Check if any filter has values
    const filterValues = Object.fromEntries(
      Object.entries(filterElements).map(([key, el]) => [key, el?.value || ''])
    );
    console.log('Current filter values:', filterValues);
    
    let arr = allTransactions.filter(txFilter);
    console.log('Transactions after filter:', arr.length);
    console.log('Sample transactions:', arr.slice(0, 3));
    
    // Update filter status indicator
    updateFilterStatus(arr.length, AppState.State.transactions.length);

// Account filtering is working correctly
    arr.sort((a,b)=>{
      if(sortKey==='amount'){
        const diff=toUSD(b)-toUSD(a);
        return sortDir==='desc'? diff : -diff;
      }
      if(sortKey==='description'){
        const diff=(a.description||'').localeCompare(b.description||'');
        return sortDir==='desc'? -diff : diff;
      }
      const diff=b.date.localeCompare(a.date);
      return sortDir==='desc'? diff : -diff;
    });
    
    // Group transactions by month
    const grouped = {};
    arr.forEach(t => {
      const month = t.date.slice(0, 7); // YYYY-MM
      if (!grouped[month]) {
        grouped[month] = [];
      }
      grouped[month].push(t);
    });
    
    // Sort months in descending order (most recent first)
    const sortedMonths = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
    
    const formatMonthHeader = (month) => {
      const [year, monthNum] = month.split('-');
      const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    };
    
    const calculateMonthSummary = (transactions) => {
      let income = 0;
      let expenses = 0;
      transactions.forEach(t => {
        const usdAmount = toUSD(t);
        if (t.transactionType === 'Income') {
          income += usdAmount;
        } else if (t.transactionType === 'Expense') {
          expenses += usdAmount;
        }
      });
      return { income, expenses, net: income - expenses };
    };
    
    if (sortedMonths.length === 0) {
      tbody.innerHTML = '<div class="no-transactions"><div class="muted" style="text-align:center;padding:2rem;">No transactions yet. Add a transaction using the form on the left!</div></div>';
      console.log('📝 No transactions found - showing empty state');
      return;
    }
    
    // Render grouped transactions
    console.log('Rendering', sortedMonths.length, 'months:', sortedMonths);
    const finalHTML = sortedMonths.map(month => {
      const transactions = grouped[month];
      const summary = calculateMonthSummary(transactions);
      const monthHeader = formatMonthHeader(month);
      
      const transactionsHtml = transactions.map(t => {
        const parties = Utils.mapTransactionParties(t);
        const usdAmount = toUSD(t);
        const amountClass = t.transactionType === 'Income' ? 'income' : 'expense';
        
        // Format date to be more compact (avoid timezone issues)
        const [year, month, day] = t.date.split('-');
        const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        const formattedDate = dateObj.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
        
        // Format amount with proper decimal places
        const formattedAmount = usdAmount.toFixed(2);
        
        const balanceImpact = getTransactionBalanceImpact(t);
        
        return `<div class="transaction-row" data-id="${t.id}">
          <input type="checkbox" class="bulk-checkbox" data-bulk-select="${t.id}">
          <div class="swipe-actions">
            <div class="swipe-action edit">📝 Edit</div>
            <div class="swipe-action delete">🗑️ Delete</div>
          </div>
          <div class="transaction-content">
            <div class="transaction-date">${formattedDate}</div>
            <div class="transaction-description">${t.description || '—'}</div>
            <div class="transaction-parties">${parties.from} → ${parties.to}</div>
            <div class="transaction-amount ${amountClass}">$${formattedAmount}</div>
            <div class="transaction-balance-impact">${balanceImpact}</div>
            <div class="transaction-actions">
          <button class="btn" data-edit="${t.id}">Edit</button>
              <button class="btn" data-copy="${t.id}">Copy</button>
              <button class="btn danger" data-del="${t.id}">Del</button>
            </div>
          </div>
        </div>`;
      }).join('');
      
      return `<div class="transaction-group">
        <div class="transaction-group-header">
          <span>${monthHeader}</span>
          <span class="transaction-group-summary">
            Income: ${Utils.formatMoneyUSD(summary.income)} • 
            Expenses: ${Utils.formatMoneyUSD(summary.expenses)} • 
            Net: ${Utils.formatMoneyUSD(summary.net)}
          </span>
        </div>
        <div class="transaction-group-content">
          ${transactionsHtml}
        </div>
      </div>`;
    }).join('');
    
    tbody.innerHTML = finalHTML;
    console.log('✅ Transaction display complete! Set innerHTML with', finalHTML.length, 'characters');
    tbody.onclick = (e) => {
  const target = e.target;

  // Use closest() so clicks on inner spans/icons still resolve to the right button
  const btnDel  = target.closest?.('button[data-del]');
  const btnEdit = target.closest?.('button[data-edit]');
  const btnCopy = target.closest?.('button[data-copy]');

  if (btnDel) {
    return removeTxn(btnDel.dataset.del);
  }

  if (btnEdit) {
    const tx = AppState.State.transactions.find(x => x.id === btnEdit.dataset.edit);
    if (tx) {
      prefillForm(tx);
      btnCancel.classList.remove('hidden');
      btnSubmit.textContent = 'Save Changes';
      // Scroll to form
      document.getElementById('formTxn').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return;
  }

  if (btnCopy) {
    const tx = AppState.State.transactions.find(x => x.id === btnCopy.dataset.copy);
    if (tx) {
      prefillForm(tx, true);
      btnSubmit.textContent = 'Add';
      // Scroll to form
      document.getElementById('formTxn').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return;
  }
};

    // Add swipe gesture support for mobile
    addSwipeGestures(tbody);
    
    // Add bulk actions support
    addBulkActions(tbody);
  }
  $all('#txTable th[data-sort]').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key=th.dataset.sort;
      if(sortKey===key){ sortDir = sortDir==='desc'?'asc':'desc'; }
      else { sortKey=key; sortDir='desc'; }
      drawTable();
    });
  });
  resetForm();
  drawTable();
  updateSortButtons();
}

async function renderOverview(root){
  root.innerHTML = $('#tpl-overview').innerHTML;
  const countrySel=$('#ovCountry');
  function apply(){
    const filterCountry=countrySel.value; const accs=AppState.State.accounts.filter(a=> !filterCountry || a.country===filterCountry);
    const banks=accs.filter(a=> Utils.accountType(a)!=='credit-card').reduce((s,a)=> s+Utils.currentBalanceUSD(a),0);
    const cards=accs.filter(a=> Utils.accountType(a)==='credit-card');
    const debt=cards.reduce((s,a)=> s+Utils.currentBalanceUSD(a),0); const limit=cards.reduce((s,a)=> s+Utils.creditLimitUSD(a),0); const util=limit>0? (debt/limit*100):0;
    $('#ovCash').textContent=Utils.formatMoneyUSD(banks); $('#ovDebt').textContent=Utils.formatMoneyUSD(debt); $('#ovLimit').textContent=Utils.formatMoneyUSD(limit); $('#ovUtil').textContent=`${util.toFixed(1)}%`;
    const today=new Date(); const until=new Date(); until.setMonth(until.getMonth()+1);
    const upcoming=cards.flatMap(a=> Utils.nextDueDates(a,2).map(d=>({a,d}))).filter(x=>{ const dt=new Date(x.d); return (dt>=today && dt<=until) && !Utils.isDuePaid(x.a,x.d); }).sort((x,y)=> x.d.localeCompare(y.d));
    $('#ovUpcoming').textContent=upcoming.length;
    const cal=$('#dueCalendar'); const dueList=$('#dueList');
    const months=buildDueEvents(2, cards);
    const eventsIndex={};
    cal.innerHTML=months.map(m=>{ const label=m.month.toLocaleString(undefined,{month:'long',year:'numeric'});
      const days=m.rows.map(row=>{ const has=row.events.length>0; if(has) eventsIndex[row.iso]=row.events; const spans=row.events.map(ev=>`<span class="payment">${ev.name}: ${Utils.formatMoneyUSD(ev.amount)}</span>`).join('');
        return `<div class="day ${has?'has':''}" data-date="${row.iso}"><strong>${row.day}</strong>${spans}</div>`; }).join('');
      return `<div class="month">${label}</div>${days}`; }).join('');
    dueList.innerHTML='<div class="muted">Select a highlighted day to view payments.</div>';
    cal.onclick=(e)=>{ const cell=e.target.closest('.day'); if(!cell) return; const iso=cell.dataset.date; const items=eventsIndex[iso]||[]; dueList.innerHTML = items.length? items.map(ev=>`<div>• <strong>${ev.name}</strong> — ${Utils.formatMoneyUSD(ev.amount)}</div>`).join('') : '<div class="muted">No payments on this day.</div>'; };
    const cardList=$('#cardList');
    cardList.innerHTML = cards.map(c=>{ const used=Utils.currentBalanceUSD(c); const lim=Utils.creditLimitUSD(c); const pct=lim>0? Math.min(100,Math.max(0,used/lim*100)):0;
      return `<div class="card" style="margin-bottom:.6rem;"><div style="display:flex;justify-content:space-between;align-items:center;gap:.75rem;"><div>
        <div><strong>${c.name}</strong> <span class="muted">(${c.country})</span></div>
        <div class="muted">Balance (USD): ${Utils.formatMoneyUSD(used)} • Limit (USD): ${Utils.formatMoneyUSD(lim)} • Util: ${pct.toFixed(1)}%</div>
        <div class="progress mt-sm"><span style="width:${pct}%"></span></div></div>
        <div><button class="btn" data-pay="${c.id}">Pay Now</button></div></div></div>`; }).join('') || '<div class="muted">No credit cards yet.</div>';
    cardList.onclick=(e)=>{ const id=e.target.dataset.pay; if(!id)return; Router.go('transactions'); setTimeout(()=>{ const card=AppState.State.accounts.find(a=>a.id===id); const tSel=$('#txnType'); if(!tSel)return; tSel.value='Credit Card Payment'; tSel.dispatchEvent(new Event('change')); const bank=AppState.State.accounts.find(a=>Utils.accountType(a)!=='credit-card'); if(bank) $('#txnFromAccount').value=bank.id; $('#txnToAccount').value=card.id; },50); };
  }
  countrySel.addEventListener('change', apply); apply();
}

async function renderNetWorth(root){
  root.innerHTML = $('#tpl-networth').innerHTML; 
  await Utils.ensureTodayFX();
  
  const timeline = Utils.netWorthTimeline();
  const effectiveSeries = timeline.length ? timeline : AppState.State.snapshots;
  const currentNet = timeline.length ? timeline[timeline.length-1].netWorthUSD : UI.calcNetWorthUSD();
  
  // Calculate comprehensive insights
  const insights = calcNetWorthInsights(timeline.length ? timeline : [{ date: Utils.todayISO(), netWorthUSD: currentNet }]);
  
  // Get assets and liabilities for display
  const assets = AppState.State.accounts.filter(a => {
    const type = Utils.accountType(a);
    const balance = Utils.currentBalanceUSD(a);
    return (type === 'checking' || type === 'savings' || type === 'cash' || type === 'investment') && balance > 0;
  }).map(a => ({
    account: a,
    balance: Utils.currentBalanceUSD(a),
    type: Utils.accountType(a)
  }));
  
  const liabilities = AppState.State.accounts.filter(a => {
    const type = Utils.accountType(a);
    const balance = Utils.currentBalanceUSD(a);
    
    if (type === 'credit-card' || type === 'loan') {
      return true;
    }
    
    return balance < 0;
  }).map(a => ({
    account: a,
    balance: Math.abs(Utils.currentBalanceUSD(a)),
    type: Utils.accountType(a)
  }));
  
  // Main net worth display
  $('#nwNow').textContent = Utils.formatMoneyUSD(currentNet);
  
  // Change indicators
  $('#nwChange').textContent = Utils.formatMoneyUSD(insights.change);
  const changePercentEl = $('#nwChangePercent');
  if (changePercentEl) {
    changePercentEl.textContent = `(${insights.changePercent.toFixed(1)}%)`;
    changePercentEl.className = `small ${insights.changePercent >= 0 ? 'good' : 'bad'}`;
  }
  
  // Growth rates
  $('#nwMonthlyGrowth').textContent = `${insights.monthlyGrowth.toFixed(1)}%`;
  $('#nwYearlyGrowth').textContent = `${insights.yearlyGrowth.toFixed(1)}%`;
  
  // Trend badge
  const trendEl = $('#nwTrend');
  if (trendEl) {
    trendEl.textContent = insights.trend;
    trendEl.className = `badge ${insights.trend === 'growing' ? 'good' : insights.trend === 'declining' ? 'bad' : 'muted'}`;
  }
  
  // Assets and liabilities totals
  $('#nwTotalAssets').textContent = Utils.formatMoneyUSD(insights.totalAssets);
  $('#nwTotalLiabilities').textContent = Utils.formatMoneyUSD(insights.totalLiabilities);
  
  // Financial health metrics
  $('#nwRatio').textContent = insights.ratio != null ? Utils.formatPercent(insights.ratio) : '—';
  $('#nwAsset').textContent = insights.largestAsset ? 
    `${insights.largestAsset.account.name} (${Utils.formatMoneyUSD(insights.largestAsset.balance)})` : '—';
  $('#nwLiability').textContent = insights.largestLiability ? 
    `${insights.largestLiability.account.name} (${Utils.formatMoneyUSD(insights.largestLiability.balance)})` : '—';
  
  // Account breakdown lists
  renderAccountBreakdown('nwAssetsList', assets);
  renderAccountBreakdown('nwLiabilitiesList', liabilities);
  
  // Charts
  console.log('Rendering charts with data:', { effectiveSeries, assets });
  Charts.renderNetWorth('chartNetWorth', effectiveSeries);
  Charts.renderAssetAllocation('chartAssetAllocation', assets);
  
  // Event listeners
  $('#btnSnapshot').addEventListener('click', async () => { 
    const s = AppState.newSnapshot(); 
    s.netWorthUSD = UI.calcNetWorthUSD(); 
    await AppState.saveItem('snapshots', s, 'snapshots'); 
    renderNetWorth(root); 
  });
  
  $('#btnExportNetWorth').addEventListener('click', () => {
    exportNetWorthData(effectiveSeries, insights);
  });
}

function renderAccountBreakdown(containerId, accounts) {
  const container = $(`#${containerId}`);
  if (!container) return;
  
  if (accounts.length === 0) {
    container.innerHTML = '<div class="muted small">No accounts with balances</div>';
    return;
  }
  
  const html = accounts.map(account => {
    const balance = account.balance;
    const isAsset = containerId === 'nwAssetsList';
    const typeIcon = getAccountTypeIcon(account.type);
    
    return `
      <div class="account-item">
        <div class="account-info">
          <span class="account-icon">${typeIcon}</span>
          <div>
            <div class="account-name">${account.account.name}</div>
            <div class="account-type small muted">${account.type}</div>
          </div>
        </div>
        <div class="account-balance ${isAsset ? 'good' : 'bad'}">
          ${isAsset ? '+' : ''}${Utils.formatMoneyUSD(balance)}
        </div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = html;
}

function getAccountTypeIcon(type) {
  const icons = {
    'checking': '🏦',
    'savings': '💰',
    'cash': '💵',
    'investment': '📈',
    'credit-card': '💳',
    'loan': '🏠'
  };
  return icons[type] || '💼';
}

function exportNetWorthData(series, insights) {
  const data = {
    summary: {
      currentNetWorth: insights.current,
      totalAssets: insights.totalAssets,
      totalLiabilities: insights.totalLiabilities,
      debtToAssetRatio: insights.ratio,
      monthlyGrowth: insights.monthlyGrowth,
      yearlyGrowth: insights.yearlyGrowth,
      trend: insights.trend
    },
    timeline: series.map(point => ({
      date: point.date,
      netWorthUSD: point.netWorthUSD
    })),
    accountBreakdown: insights.accountBreakdown.map(account => ({
      name: account.account.name,
      type: account.type,
      balance: account.balance
    }))
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `net-worth-${Utils.todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function renderReports(root){
  console.log('🔵 renderReports called');
  root.innerHTML = $('#tpl-reports').innerHTML;
  console.log('🔵 Template loaded');
  
  await Utils.ensureTodayFX();
  console.log('🔵 FX rates ensured');
  
  const start=$('#reportStart'); const end=$('#reportEnd');
  const today=Utils.todayISO(); const first=new Date(); first.setDate(1);
  start.value=start.value||first.toISOString().slice(0,10);
  end.value=end.value||today;
  console.log('🔵 Date inputs set');
  
  // Load quick stats
  loadQuickStats();
  console.log('🔵 Quick stats loaded');
  
  const btn = $('#btnGenReport');
  console.log('🔵 Button element found:', btn);
  console.log('🔵 Button text:', btn ? btn.textContent : 'NOT FOUND');
  
  if (!btn) {
    console.error('🔵 CRITICAL: Generate Report button not found!');
    return;
  }
  
  btn.addEventListener('click', async (e)=>{
    e.preventDefault();
    e.stopPropagation();
    
    console.log('🔴 Generate report button clicked');
    console.log('🔴 Event:', e);
    console.log('🔴 Button element:', $('#btnGenReport'));
    console.log('🔴 PDF object:', window.PDF);
    console.log('🔴 jsPDF library:', window.jspdf);
    console.log('🔴 window object keys:', Object.keys(window).filter(k => k.toLowerCase().includes('pdf')));
    
    const startDate=start.value||first.toISOString().slice(0,10);
    const endDate=end.value||today;
    console.log('🔴 Date range:', startDate, 'to', endDate);
    
    if(startDate>endDate){ 
      console.log('🔴 Invalid date range');
      alert('Start date must be before end date.'); 
      return; 
    }
    
    // Check if PDF library is loaded
    if (!window.jspdf) {
      console.error('🔴 jsPDF library not loaded');
      console.log('🔴 Available libraries:', Object.keys(window).filter(k => k.toLowerCase().includes('jspdf')));
      alert('PDF library not loaded yet. Please wait a moment and try again.');
      return;
    }
    
    // Check if PDF object exists
    if (!window.PDF) {
      console.error('🔴 PDF object not found');
      console.log('🔴 Available objects:', Object.keys(window).filter(k => k.toLowerCase().includes('pdf')));
      alert('PDF module not loaded. Please refresh the page and try again.');
      return;
    }
    
    // Show loading state
    const btn = $('#btnGenReport');
    const originalText = btn.textContent;
    btn.textContent = '⏳ Generating Report...';
    btn.disabled = true;
    
    try {
      console.log('🔴 Calling PDF.generateReport...');
      console.log('🔴 PDF.generateReport function:', typeof PDF.generateReport);
      console.log('🔴 PDF object keys:', Object.keys(PDF));
      
      // Test if PDF.generateReport exists
      if (typeof PDF.generateReport !== 'function') {
        console.error('🔴 PDF.generateReport is not a function!');
        console.log('🔴 Available PDF methods:', Object.keys(PDF));
        alert('PDF generation function not found!');
        return;
      }
      
      console.log('🔴 About to call PDF.generateReport with:', { startDate, endDate });
    await PDF.generateReport({ startDate, endDate });
      console.log('🔴 PDF generation completed successfully');
      alert('Report generated successfully!');
    } catch (error) {
      console.error('🔴 Error generating report:', error);
      console.error('🔴 Error stack:', error.stack);
      console.error('🔴 Error name:', error.name);
      console.error('🔴 Error message:', error.message);
      alert('Error generating report. Please try again.');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });
}

function loadQuickStats() {
  const today = Utils.todayISO();
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const firstOfMonthStr = firstOfMonth.toISOString().slice(0, 10);
  
  const tx = AppState.State.transactions.filter(t => Utils.within(t.date, firstOfMonthStr, today));
  const usd = (t) => t.currency === 'USD' ? Number(t.amount) : Number(t.amount) * Number(t.fxRate || 1);
  
  const income = tx.filter(t => t.transactionType === 'Income').reduce((s, t) => s + usd(t), 0);
  const expenses = tx.filter(t => t.transactionType === 'Expense').reduce((s, t) => s + usd(t), 0);
  const net = income - expenses;
  
  $('#quickIncome').textContent = Utils.formatMoneyUSD(income);
  $('#quickExpenses').textContent = Utils.formatMoneyUSD(expenses);
  $('#quickNet').textContent = Utils.formatMoneyUSD(net);
  $('#quickNet').className = `stat-value ${net >= 0 ? 'good' : 'bad'}`;
}

async function renderSettings(root){
  root.innerHTML = $('#tpl-settings').innerHTML;
  
  // Set values only for elements that exist
  const setFiscalStart = $('#setFiscalStart');
  if (setFiscalStart) setFiscalStart.value = AppState.State.settings.fiscalStartDay || 1;
  
  const setManualFX = $('#setManualFX');
  if (setManualFX) setManualFX.value = AppState.State.settings.manualUsdPerMXN || '';
  
  const setUseManualFX = $('#setUseManualFX');
  if (setUseManualFX) setUseManualFX.value = String(!!AppState.State.settings.useManualFx);
  
  const setDefaultTxnDate = $('#setDefaultTxnDate');
  if (setDefaultTxnDate) setDefaultTxnDate.value = AppState.State.settings.defaultTxnDateMode || 'today';
  
  // Load API keys
  const exchangeratesApiKey = $('#exchangeratesApiKey');
  if (exchangeratesApiKey) exchangeratesApiKey.value = AppState.State.settings.exchangeratesApiKey || '';
  
  const fixerApiKey = $('#fixerApiKey');
  if (fixerApiKey) fixerApiKey.value = AppState.State.settings.fixerApiKey || '';
  
  const currencyApiKey = $('#currencyApiKey');
  if (currencyApiKey) currencyApiKey.value = AppState.State.settings.currencyApiKey || '';
  
  const exchangeRateApiKey = $('#exchangeRateApiKey');
  if (exchangeRateApiKey) exchangeRateApiKey.value = AppState.State.settings.exchangeRateApiKey || '';
  
  const alphaVantageKey = $('#alphaVantageKey');
  if (alphaVantageKey) alphaVantageKey.value = AppState.State.settings.alphaVantageKey || '';
  $('#btnFetchFX').addEventListener('click', async ()=>{ const r=await Utils.ensureTodayFX(); alert('Fetched. Latest USD per MXN = '+r); });
  $('#btnSaveSettings').addEventListener('click', async ()=>{
    // Save settings only for elements that exist
    const setFiscalStart = $('#setFiscalStart');
    if (setFiscalStart) AppState.State.settings.fiscalStartDay = Number(setFiscalStart.value||1);
    
    const setManualFX = $('#setManualFX');
    if (setManualFX) AppState.State.settings.manualUsdPerMXN = setManualFX.value? Number(setManualFX.value):null;
    
    const setUseManualFX = $('#setUseManualFX');
    if (setUseManualFX) AppState.State.settings.useManualFx = setUseManualFX.value==='true';
    
    const setDefaultTxnDate = $('#setDefaultTxnDate');
    if (setDefaultTxnDate) AppState.State.settings.defaultTxnDateMode = setDefaultTxnDate.value;
    
    // Save API keys
    const exchangeratesApiKey = $('#exchangeratesApiKey');
    if (exchangeratesApiKey) AppState.State.settings.exchangeratesApiKey = exchangeratesApiKey.value.trim();
    
    const fixerApiKey = $('#fixerApiKey');
    if (fixerApiKey) AppState.State.settings.fixerApiKey = fixerApiKey.value.trim();
    
    const currencyApiKey = $('#currencyApiKey');
    if (currencyApiKey) AppState.State.settings.currencyApiKey = currencyApiKey.value.trim();
    
    const exchangeRateApiKey = $('#exchangeRateApiKey');
    if (exchangeRateApiKey) AppState.State.settings.exchangeRateApiKey = exchangeRateApiKey.value.trim();
    
    const alphaVantageKey = $('#alphaVantageKey');
    if (alphaVantageKey) AppState.State.settings.alphaVantageKey = alphaVantageKey.value.trim();
    
    await AppState.saveItem('settings', AppState.State.settings, 'settings'); 
    Utils.showToast('Settings saved');
  });
  
  // Test FX APIs
  $('#testFxApis').addEventListener('click', async () => {
    const testButton = $('#testFxApis');
    const originalText = testButton.textContent;
    testButton.textContent = 'Testing...';
    testButton.disabled = true;
    
    try {
      const results = await testAllFxApis();
      showFxApiResults(results);
    } catch (error) {
      Utils.showToast('Error testing APIs: ' + error.message, 'error');
    } finally {
      testButton.textContent = originalText;
      testButton.disabled = false;
    }
  });
  
  // Test Historical FX Rates
  const testHistoricalBtn = $('#testHistoricalRates');
  if (testHistoricalBtn) {
    console.log('🔧 Setting up Test Historical Rates button');
    testHistoricalBtn.addEventListener('click', async () => {
      console.log('🖱️ Test Historical Rates button clicked');
      alert('Test Historical Rates button clicked! Check console for details.');
      
      const testButton = $('#testHistoricalRates');
      const originalText = testButton.textContent;
      testButton.textContent = 'Testing...';
      testButton.disabled = true;
      
      try {
        console.log('🧪 Starting historical rates test...');
        await testHistoricalRates();
        console.log('✅ Historical rates test completed');
      } catch (error) {
        console.error('❌ Error testing historical rates:', error);
        Utils.showToast('Error testing historical rates: ' + error.message, 'error');
      } finally {
        testButton.textContent = originalText;
        testButton.disabled = false;
      }
    });
    console.log('✅ Test Historical Rates button setup complete');
  } else {
    console.error('❌ Test Historical Rates button not found!');
  }
  
  // Clear API keys
  $('#clearApiKeys').addEventListener('click', () => {
    if (confirm('Clear all API keys? This cannot be undone.')) {
      $('#fixerApiKey').value = '';
      $('#currencyApiKey').value = '';
      $('#exchangeRateApiKey').value = '';
      $('#alphaVantageKey').value = '';
      Utils.showToast('API keys cleared');
    }
  });
  $('#btnExportExcel').addEventListener('click', ()=> Excel.exportAll());
  $('#btnImportExcel').addEventListener('click', ()=> $('#fileImportExcel').click());
  $('#fileImportExcel').addEventListener('change', (e)=> Excel.importAll(e.target.files?.[0]));
  $('#btnWipeAll').addEventListener('click', async ()=>{ if (await Utils.confirmDialog('This will erase ALL local data. Proceed?')){ await PFMDB.dbClearAll(); location.reload(); } });
  $('#btnManageCategories').addEventListener('click', ()=> Router.go('categories'));
}

// Test all FX APIs
async function testAllFxApis() {
  const testDate = Utils.todayISO();
  const testPairs = [
    { from: 'MXN', to: 'USD' },
    { from: 'EUR', to: 'USD' },
    { from: 'GBP', to: 'USD' }
  ];
  
  const results = [];
  
  for (const pair of testPairs) {
    const pairResults = {
      pair: `${pair.from} → ${pair.to}`,
      apis: []
    };
    
    // Test each API
    const apis = [
      {
        name: 'ExchangeRate-API',
        url: `https://api.exchangerate-api.com/v4/latest/${pair.from}`,
        parser: (data) => data.rates?.[pair.to]
      },
      {
        name: 'ExchangeRate-Host',
        url: `https://api.exchangerate.host/latest?base=${pair.from}&symbols=${pair.to}`,
        parser: (data) => data.rates?.[pair.to]
      }
    ];
    
    // Add premium APIs if keys are available
    const settings = AppState.State.settings || {};
    if (settings.fixerApiKey) {
      apis.push({
        name: 'Fixer.io',
        url: `https://api.fixer.io/latest?access_key=${settings.fixerApiKey}&base=${pair.from}&symbols=${pair.to}`,
        parser: (data) => data.rates?.[pair.to]
      });
    }
    
    if (settings.currencyApiKey) {
      apis.push({
        name: 'CurrencyAPI',
        url: `https://api.currencyapi.com/v3/latest?apikey=${settings.currencyApiKey}&base_currency=${pair.from}&currencies=${pair.to}`,
        parser: (data) => data.data?.[pair.to]?.value
      });
    }
    
    for (const api of apis) {
      try {
        const startTime = Date.now();
        const response = await fetch(api.url);
        const data = await response.json();
        const rate = api.parser(data);
        const responseTime = Date.now() - startTime;
        
        pairResults.apis.push({
          name: api.name,
          success: true,
          rate: rate,
          responseTime: responseTime,
          error: null
        });
      } catch (error) {
        pairResults.apis.push({
          name: api.name,
          success: false,
          rate: null,
          responseTime: null,
          error: error.message
        });
      }
    }
    
    results.push(pairResults);
  }
  
  return results;
}

// Test historical FX rates for different dates
async function testHistoricalRates() {
  console.log('🧪 testHistoricalRates function called');
  
  const testDates = [
    '2024-09-01',
    '2024-09-15', 
    '2024-09-30',
    Utils.todayISO() // Today's date
  ];
  
  const testCurrency = 'MXN';
  const targetCurrency = 'USD';
  
  console.log('🧪 Testing historical FX rates...');
  
  let html = '<div class="card"><h3>📅 Historical FX Rate Test</h3>';
  html += `<p>Testing ${testCurrency} → ${targetCurrency} for September 2024 and today (${Utils.todayISO()}):</p>`;
  html += `<div style="margin: 0.5rem 0; padding: 0.5rem; background: #e3f2fd; border-radius: 4px; font-size: 0.9em;">`;
  html += `<strong>Note:</strong> If you see rates around 0.05, the APIs are failing and using fallback values. Check console for details.`;
  html += `</div>`;
  
  for (const date of testDates) {
    try {
      console.log(`Testing date: ${date}`);
      const rate = await Utils.fetchHistoricalFXRate(testCurrency, targetCurrency, date);
      const formattedRate = rate.toFixed(4);
      
      const isToday = date === Utils.todayISO();
      const dateLabel = isToday ? `${date} (Today)` : date;
      const bgColor = isToday ? 'var(--primary-bg)' : 'var(--muted-bg)';
      const textColor = isToday ? 'var(--primary)' : 'inherit';
      
      html += `<div style="margin: 0.5rem 0; padding: 0.5rem; background: ${bgColor}; border-radius: 4px; color: ${textColor}; font-weight: ${isToday ? '600' : 'normal'};">`;
      html += `<strong>${dateLabel}:</strong> 1 ${testCurrency} = ${formattedRate} ${targetCurrency}`;
      if (isToday) html += ` <span style="font-size: 0.8em; opacity: 0.8;">(Current Rate)</span>`;
      html += `</div>`;
      
      console.log(`✅ ${date}: ${formattedRate}`);
    } catch (error) {
      html += `<div style="margin: 0.5rem 0; padding: 0.5rem; background: #ffebee; border-radius: 4px; color: #c62828;">`;
      html += `<strong>${date}:</strong> Error - ${error.message}`;
      html += `</div>`;
      
      console.error(`❌ ${date}: ${error.message}`);
    }
  }
  
  html += '</div>';
  
  // Show in a modal
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
    background: rgba(0,0,0,0.5); z-index: 1000; display: flex; 
    align-items: center; justify-content: center; padding: 2rem;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: white; border-radius: 8px; padding: 2rem; 
    max-width: 500px; max-height: 80vh; overflow-y: auto;
  `;
  content.innerHTML = html + '<button class="btn primary" onclick="this.closest(\'.modal\')?.remove()" style="margin-top: 1rem;">Close</button>';
  
  modal.className = 'modal';
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  console.log('✅ Modal created and displayed');
}

// Show FX API test results
function showFxApiResults(results) {
  let html = '<div class="card"><h3>🔍 FX API Test Results</h3>';
  
  results.forEach(pairResult => {
    html += `<div style="margin-bottom: 1rem; padding: 1rem; background: var(--muted-bg); border-radius: 6px;">`;
    html += `<h4>${pairResult.pair}</h4>`;
    
    pairResult.apis.forEach(api => {
      const status = api.success ? '✅' : '❌';
      const rate = api.rate ? `Rate: ${api.rate}` : 'No rate';
      const time = api.responseTime ? `(${api.responseTime}ms)` : '';
      const error = api.error ? ` - ${api.error}` : '';
      
      html += `<div style="margin: 0.5rem 0; padding: 0.5rem; background: white; border-radius: 4px;">`;
      html += `<strong>${status} ${api.name}</strong> - ${rate} ${time}${error}`;
      html += `</div>`;
    });
    
    html += `</div>`;
  });
  
  html += '</div>';
  
  // Show in a modal or alert
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
    background: rgba(0,0,0,0.5); z-index: 1000; display: flex; 
    align-items: center; justify-content: center; padding: 2rem;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: white; border-radius: 8px; padding: 2rem; 
    max-width: 600px; max-height: 80vh; overflow-y: auto;
  `;
  content.innerHTML = html + '<button class="btn primary" onclick="this.closest(\'.modal\')?.remove()" style="margin-top: 1rem;">Close</button>';
  
  modal.className = 'modal';
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

function calcNetWorthUSD(){ 
  // Assets: positive balances in checking, savings, cash, investment accounts
  const assets = AppState.State.accounts.filter(a => {
    const type = Utils.accountType(a);
    return type === 'checking' || type === 'savings' || type === 'cash' || type === 'investment';
  }).reduce((s,a) => s + Math.max(0, Utils.currentBalanceUSD(a)), 0);
  
  // Liabilities: negative balances in all accounts (credit cards, loans, overdrawn accounts)
  const liabilities = AppState.State.accounts.reduce((s,a) => {
    const balance = Utils.currentBalanceUSD(a);
    const type = Utils.accountType(a);
    
    // Credit cards and loans are always liabilities (even if positive balance)
    if (type === 'credit-card' || type === 'loan') {
      return s + Math.abs(balance); // Credit card balance is always a liability
    }
    
    // For other accounts, only negative balances are liabilities
    return s + Math.max(0, -balance);
  }, 0);
  
  return assets - liabilities; 
}
window.UI = { renderDashboard, renderAccounts, renderCategories, renderBudget, renderTransactions, renderOverview, renderNetWorth, renderReports, renderSettings, calcNetWorthUSD };
