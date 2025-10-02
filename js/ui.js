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
  const largest=expOnly.reduce((m,t)=> Math.max(m,toUSD(t)),0);
  const byCat=Utils.groupBy(expOnly, t=>{ const cat=Utils.categoryById(t.categoryId); return cat? (cat.parentCategoryId||cat.id) : '—'; }); let top='—', topVal=0;
  Object.entries(byCat).forEach(([cid,arr])=>{ const sum=arr.reduce((s,t)=>s+toUSD(t),0); if(sum>topVal){ topVal=sum; top=Utils.parentCategoryName(cid); } });
  return {income,expenses,net,largest,topCatName:top, txRange:tx};
}

async function renderDashboard(root){
  root.innerHTML = $('#tpl-dashboard').innerHTML;
  const startEl=$('#dashStart'), endEl=$('#dashEnd');
  const today=Utils.todayISO(); const first=new Date(); first.setDate(1); startEl.value=first.toISOString().slice(0,10); endEl.value=today;
  async function apply(){
    await Utils.ensureTodayFX();
    const {income,expenses,net,largest,topCatName,txRange}=kpisForRange(startEl.value,endEl.value);
        
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
              // Transfers between cash accounts don't affect net cash flow
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
        $('#plNet').className = `kpi-value ${financials.plNet >= 0 ? 'good' : 'bad'}`;
        
        // Update Cash Flow Statement
        $('#cfIn').textContent = Utils.formatMoneyUSD(financials.cfIn);
        $('#cfOut').textContent = Utils.formatMoneyUSD(financials.cfOut);
        $('#cfNet').textContent = Utils.formatMoneyUSD(financials.cfNet);
        $('#cfNet').className = `kpi-value ${financials.cfNet >= 0 ? 'good' : 'bad'}`;
        
        // Update legacy KPIs (for backward compatibility)
    $('#kpiTotalIncome').textContent=Utils.formatMoneyUSD(income);
    $('#kpiTotalExpense').textContent=Utils.formatMoneyUSD(expenses);
    $('#kpiNetFlow').textContent=Utils.formatMoneyUSD(net);
    $('#kpiLargestExp').textContent=largest? Utils.formatMoneyUSD(largest) : '—';
    $('#kpiTopCat').textContent=topCatName;
    
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
              const {income,expenses,net,largest,topCatName,txRange}=kpisForRange(startEl.value,endEl.value);
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
        
        html += `<div class="card account-card" data-type="${accountType}">
        <div class="header-row">
          <div class="icon">${Utils.accountIcon(account)}</div>
          <div style="flex:1">
            <div style="display:flex; align-items:center; gap:.5rem; flex-wrap:wrap;">
              <strong>${account.name}</strong>
              <span class="badge">${badgeLabel}</span>
              <span class="muted">${account.country}</span>
            </div>
            <div class="muted">Balance As Of: ${Utils.formatMoney(account.balanceAsOfAmount, account.currency)} on ${account.balanceAsOfDate||'—'}</div>
            <div>Computed Balance (USD): <strong>${Utils.formatMoneyUSD(balUSD)}</strong></div>
              ${accountType==='credit-card'? `
                <div class="muted">Limit: ${Utils.formatMoneyUSD(limitUSD)} • Due day: ${account.dueDay||'—'} • Min: ${Utils.formatMoneyUSD(account.minimumPaymentDue||0)}</div>
                <div class="muted">Available Credit: ${Utils.formatMoneyUSD(Utils.getAvailableCredit ? Utils.getAvailableCredit(account) : 0)} • Utilization: ${Utils.getCreditCardUtilization ? Utils.getCreditCardUtilization(account).toFixed(1) : '0.0'}%</div>
                <div class="muted">Next Payment Due: ${Utils.formatMoneyUSD(Utils.calculateCreditCardPaymentDue ? Utils.calculateCreditCardPaymentDue(account, Utils.nextDueDates(account, 1)[0] || Utils.todayISO()) : 0)}</div>
              `:''}
              ${accountType==='cash'? `<div class="muted">Balance As Of Date ensures manual cash tracking stays accurate.</div>`:''}
          </div>
          <div class="row" style="gap:.5rem; align-self:flex-start;">
            <button class="btn" data-edit="${account.id}">Edit</button>
            <button class="btn danger" data-del="${account.id}">Delete</button>
          </div>
        </div>
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
  root.addEventListener('click', async (e)=>{
    const t=e.target;
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

  // Current month tracking
  let currentMonth = new Date();
  const monthYearEl = $('#budgetMonthYear');
  const prevBtn = $('#budgetPrevMonth');
  const nextBtn = $('#budgetNextMonth');

  // Update month display and refresh data
  function updateMonthDisplay() {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    monthYearEl.textContent = `${monthNames[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
    renderBudgetSummary();
    renderCategoryBreakdown();
  }

  // Month navigation
  prevBtn.onclick = () => {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    updateMonthDisplay();
  };

  nextBtn.onclick = () => {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    updateMonthDisplay();
  };

  // Get month range for calculations
  function getMonthRange() {
    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10)
    };
  }

  // Calculate overall budget summary
  function renderBudgetSummary() {
    const { start, end } = getMonthRange();
    
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

    // Calculate budget totals from budget series
    const budgetSeries = AppState.State.budgets || [];
    let budgetedIncome = 0;
    let budgetedExpenses = 0;

    budgetSeries.forEach(series => {
      // Calculate monthly budget amount based on cadence
      let monthlyAmount = series.amount;
      if (series.cadence === 'weekly') {
        monthlyAmount = series.amount * 4.33; // Approximate weeks per month
      } else if (series.cadence === 'biweekly') {
        monthlyAmount = series.amount * 2.17; // Approximate biweeks per month
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
    $('#incomeVariance').textContent = `Diff: ${Utils.formatMoneyUSD(incomeVariance)}`;
    $('#incomeVariance').className = `variance-text ${incomeVariance >= 0 ? 'good' : 'bad'}`;

    // Update UI - Expenses section
    $('#budgetBudgetedExpenses').textContent = Utils.formatMoneyUSD(budgetedExpenses);
    $('#budgetActualExpenses').textContent = Utils.formatMoneyUSD(actualExpenses);
    $('#expenseVariance').textContent = `Diff: ${Utils.formatMoneyUSD(expenseVariance)}`;
    $('#expenseVariance').className = `variance-text ${expenseVariance >= 0 ? 'good' : 'bad'}`;

    // Update UI - Net section
    $('#budgetNetBudgeted').textContent = Utils.formatMoneyUSD(netBudgeted);
    $('#budgetNetActual').textContent = Utils.formatMoneyUSD(netActual);
    $('#netVariance').textContent = `Diff: ${Utils.formatMoneyUSD(netVariance)}`;
    $('#netVariance').className = `variance-text ${netVariance >= 0 ? 'good' : 'bad'}`;

    // Update progress bar (expenses only)
    $('#budgetTotalBudgetedExpenses').textContent = Utils.formatMoneyUSD(budgetedExpenses);
    $('#budgetPercentage').textContent = `${Math.round(budgetPercentage)}%`;
    $('#budgetSpentAmount').textContent = Utils.formatMoneyUSD(actualExpenses);
    $('#budgetRemainingAmount').textContent = Utils.formatMoneyUSD(expenseRemaining);
    
    // Update progress bar visual
    const barFill = $('#budgetBarFill');
    barFill.style.width = `${Math.min(budgetPercentage, 100)}%`;
    barFill.style.background = actualExpenses > budgetedExpenses ? 'var(--bad)' : 'linear-gradient(90deg, var(--brand) 0%, var(--blue-500) 100%)';
  }

  // Render diverging chart and consolidated budget
  function renderCategoryBreakdown() {
    renderDivergingChart();
    renderConsolidatedBudget();
  }

  // Render diverging bar chart
  function renderDivergingChart() {
    const { start, end } = getMonthRange();
    const chartEl = $('#divergingChart');
    if (!chartEl) return;

    // Get budget series
    const budgetSeries = AppState.State.budgets || [];
    
    // Get actual transactions
    const transactions = AppState.State.transactions.filter(t => 
      Utils.within(t.date, start, end) && t.categoryId
    );

    // Calculate budget and actual amounts by category and type
    const budgetData = new Map(); // key: "type|categoryId", value: amount
    const actualData = new Map(); // key: "type|categoryId", value: amount

    // Process budget series
    budgetSeries.forEach(series => {
      let monthlyAmount = series.amount;
      if (series.cadence === 'weekly') {
        monthlyAmount = series.amount * 4.33;
      } else if (series.cadence === 'biweekly') {
        monthlyAmount = series.amount * 2.17;
      }
      
      const key = `${series.type}|${series.categoryId}`;
      budgetData.set(key, (budgetData.get(key) || 0) + monthlyAmount);
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

    // Calculate "Other" categories
    const otherIncomeBudget = incomeCategories.slice(6).reduce((sum, _, i) => 
      sum + (incomeBudgetData[i + 6] || 0), 0);
    const otherIncomeActual = incomeCategories.slice(6).reduce((sum, _, i) => 
      sum + (incomeActualData[i + 6] || 0), 0);
    
    const otherExpenseBudget = expenseCategories.slice(6).reduce((sum, _, i) => 
      sum + (expenseBudgetData[i + 6] || 0), 0);
    const otherExpenseActual = expenseCategories.slice(6).reduce((sum, _, i) => 
      sum + (expenseActualData[i + 6] || 0), 0);

    // Prepare chart data
    const labels = [];
    const budgetDataArray = [];
    const actualDataArray = [];

    // Add expense categories (left side, negative values)
    expenseSorted.forEach(item => {
      labels.push(item.name);
      budgetDataArray.push(-item.budget); // Negative for left side
      actualDataArray.push(-item.actual); // Negative for left side
    });

    // Add "Other Expense" if exists
    if (otherExpenseBudget > 0 || otherExpenseActual > 0) {
      labels.push('Other Expense');
      budgetDataArray.push(-otherExpenseBudget);
      actualDataArray.push(-otherExpenseActual);
    }

    // Add income categories (right side, positive values)
    incomeSorted.forEach(item => {
      labels.push(item.name);
      budgetDataArray.push(item.budget);
      actualDataArray.push(item.actual);
    });

    // Add "Other Income" if exists
    if (otherIncomeBudget > 0 || otherIncomeActual > 0) {
      labels.push('Other Income');
      budgetDataArray.push(otherIncomeBudget);
      actualDataArray.push(otherIncomeActual);
    }

    // Destroy existing chart
    if (window.divergingChartInstance && window.divergingChartInstance.destroy) {
      window.divergingChartInstance.destroy();
    }

    // Create new chart
    const ctx = chartEl.getContext('2d');
    window.divergingChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Budget',
            data: budgetDataArray,
            backgroundColor: '#94a3b8',
            borderColor: '#94a3b8',
            borderWidth: 1
          },
          {
            label: 'Actual',
            data: actualDataArray,
            backgroundColor: '#0ea5e9',
            borderColor: '#0ea5e9',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: {
            display: false // We have custom legend
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const value = Math.abs(context.parsed.x);
                return `${context.dataset.label}: ${Utils.formatMoneyUSD(value)}`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: {
              drawBorder: false
            },
            ticks: {
              callback: function(value) {
                return Utils.formatMoneyUSD(Math.abs(value));
              }
            }
          },
          y: {
            grid: {
              display: false
            }
          }
        }
      }
    });
  }

  // Render consolidated budget summary
  function renderConsolidatedBudget() {
    const { start, end } = getMonthRange();
    
    // Get budget series
    const budgetSeries = AppState.State.budgets || [];
    
    // Get actual transactions
    const transactions = AppState.State.transactions.filter(t => 
      Utils.within(t.date, start, end)
    );

    // Calculate budgeted totals
    let budgetedIncome = 0;
    let budgetedExpenses = 0;

    budgetSeries.forEach(series => {
      let monthlyAmount = series.amount;
      if (series.cadence === 'weekly') {
        monthlyAmount = series.amount * 4.33;
      } else if (series.cadence === 'biweekly') {
        monthlyAmount = series.amount * 2.17;
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
  const amtInp  = $('#bAmount');
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

  // Defaults
  ancInp.value = Utils.todayISO();
  monthInp.value = Utils.todayISO().slice(0,7);

  // Save series
  btnSave.onclick = async () => {
  const b = AppState.newBudget();
    b.type       = typeSel.value;
    b.categoryId = catSel.value;
    b.amount     = Number(amtInp.value||0);
    b.cadence    = cadSel.value || 'monthly';
    b.anchorDate = ancInp.value || Utils.todayISO();
    b.repeatUntil= untilInp.value || '';
    b.createdAt  = Utils.todayISO();

    if(!b.categoryId || !b.amount){ alert('Pick a category and amount.'); return; }

  await AppState.saveItem('budgets', b, 'budgets');
    drawSeries();
    drawMonthly();
    renderBudgetSummary();
    renderCategoryBreakdown();
    btnClear.click();
  };
  
  btnClear.onclick = () => {
    amtInp.value = '';
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
        inst.push({ date: d.toISOString().slice(0,10), amount: series.amount, seriesId: series.id, categoryId: series.categoryId, type: series.type });
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
      cadence: s.cadence || 'monthly',
      anchorDate: s.anchorDate || s.startDate || Utils.todayISO(),
      repeatUntil: s.repeatUntil || s.endDate || ''
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
      return `<tr>
        <td>${b.type}</td>
        <td>${cname}</td>
        <td>${b.cadence}</td>
        <td>${Utils.formatMoneyUSD(b.amount)}</td>
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
    const isoMMMM = monthInp.value || Utils.todayISO().slice(0,7);
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
    incomeTb.innerHTML = incomeRows.map(r => `
      <tr>
        <td>💵 ${r.name}</td>
        <td>${Utils.formatMoneyUSD(r.budget)}</td>
        <td>${Utils.formatMoneyUSD(r.actual)}</td>
        <td class="${r.variance<0?'bad': 'good'}">${Utils.formatMoneyUSD(r.variance)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="muted">No income data</td></tr>';

    $('#bvaIncomeBudTot').textContent = Utils.formatMoneyUSD(incomeBudTot);
    $('#bvaIncomeActTot').textContent = Utils.formatMoneyUSD(incomeActTot);
    $('#bvaIncomeVarTot').textContent = Utils.formatMoneyUSD(incomeVarTot);

    // Render expense table
    const expenseTb = $('#tblBVAExpense tbody');
    expenseTb.innerHTML = expenseRows.map(r => `
      <tr>
        <td>🧾 ${r.name}</td>
        <td>${Utils.formatMoneyUSD(r.budget)}</td>
        <td>${Utils.formatMoneyUSD(r.actual)}</td>
        <td class="${r.variance<0?'bad': 'good'}">${Utils.formatMoneyUSD(r.variance)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="muted">No expense data</td></tr>';

    $('#bvaExpenseBudTot').textContent = Utils.formatMoneyUSD(expenseBudTot);
    $('#bvaExpenseActTot').textContent = Utils.formatMoneyUSD(expenseActTot);
    $('#bvaExpenseVarTot').textContent = Utils.formatMoneyUSD(expenseVarTot);
  }

  // Initialize
  monthInp.addEventListener('change', drawMonthly);
  updateMonthDisplay();
  drawSeries();
  drawMonthly();
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
  const catSel=$('#txnCategory');
  const desc=$('#txnDesc');
  const hiddenId=$('#txnId');
  const btnSubmit=$('#txnSubmit');
  const btnCancel=$('#btnCancelEdit');
  const btnSortAmount=$('#txnSortAmount');
  const bulkDialog=$('#dlgTxnBulk');
  const bulkForm=$('#formTxnBulk');
  const bulkInput=$('#bulkInput');
  const btnBulkClose=$('#btnBulkClose');
  const btnAddMultiple=$('#btnAddMultiple');
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
  function buildFilterCategoryOptions(){
    const roots=AppState.State.categories.filter(c=>!c.parentCategoryId).sort((a,b)=> a.name.localeCompare(b.name));
    return '<option value="">All</option>'+roots.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  }
  function fillAccounts(){
    const sorted=[...AppState.State.accounts].sort((a,b)=> a.name.localeCompare(b.name));
    const opts=sorted.map(a=>`<option value="${a.id}">${Utils.accountIcon(a)} ${a.name}</option>`).join('');
    fromSel.innerHTML=opts;
    
    const filterAccountEl = document.getElementById('filterAccount');
    if (filterAccountEl) {
      filterAccountEl.innerHTML='<option value="">All</option>'+opts;
    }
    
    // Fill "To" field based on transaction type
    fillToField();
  }
  
  function fillToField(){
    const txnType = type.value;
    if (txnType === 'Expense') {
      // For expenses, show categories hierarchically in "To" field
      const expenseCats = AppState.State.categories.filter(c => c.type === 'expense');
      
      // Build hierarchical structure
      const buildHierarchicalOptions = (categories, parentId = '', level = 0) => {
        const children = categories.filter(c => c.parentCategoryId === parentId).sort((a,b) => a.name.localeCompare(b.name));
        let html = '';
        
        children.forEach(cat => {
          const indent = '  '.repeat(level);
          const prefix = level > 0 ? '└─ ' : '';
          html += `<option value="${cat.id}">${indent}${prefix}${cat.name}</option>`;
          html += buildHierarchicalOptions(categories, cat.id, level + 1);
        });
        
        return html;
      };
      
      toSel.innerHTML = buildHierarchicalOptions(expenseCats);
    } else {
      // For income, transfers, etc., show accounts in "To" field
      const sorted=[...AppState.State.accounts].sort((a,b)=> a.name.localeCompare(b.name));
      const opts=sorted.map(a=>`<option value="${a.id}">${Utils.accountIcon(a)} ${a.name}</option>`).join('');
      toSel.innerHTML=opts;
    }
  }
  function fillCats(kind){
    catSel.innerHTML = Utils.buildCategoryOptions(kind==='Expense'?'expense':kind==='Income'?'income':'expense');
  }
  function setVisibility(){
    const t=type.value;
    if (t==='Expense'){
      $('#lblFromAcc').classList.remove('hidden');
      $('#lblToAcc').classList.remove('hidden'); // Show "To" field for expenses (will contain categories)
      fromSel.required=true; toSel.required=true;
      $('#lblCategory').classList.add('hidden'); catSel.required=false; // Hide separate category field
      fillCats('Expense');
    }else if (t==='Income'){
      $('#lblFromAcc').classList.add('hidden');
      $('#lblToAcc').classList.remove('hidden');
      fromSel.required=false; toSel.required=true;
      $('#lblCategory').classList.remove('hidden'); catSel.required=true; fillCats('Income');
    }else{
      $('#lblFromAcc').classList.remove('hidden');
      $('#lblToAcc').classList.remove('hidden');
      fromSel.required=true; toSel.required=true;
      $('#lblCategory').classList.add('hidden'); catSel.required=false;
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
    
    // Update "To" field based on transaction type
    fillToField();
  }
  function validateForm(){
    const t=type.value;
    const amtOk=Number(amount.value)>0;
    const needCat=(t==='Expense'||t==='Income');
    const requiresFx = currency.value !== 'USD';
    const fxVal = requiresFx ? fx.value : (fx.value || '1');
    const fxOk = requiresFx? Number(fxVal)>0 : true;
    let accountsOk=true;
    if(t==='Expense') accountsOk=!!fromSel.value;
    if(t==='Income') accountsOk=!!toSel.value;
    if(t==='Transfer'||t==='Credit Card Payment') accountsOk=!!fromSel.value && !!toSel.value && fromSel.value!==toSel.value;
    Validate.setValidity(amount, amtOk, 'Amount must be > 0');
    Validate.setValidity(fx, fxOk, requiresFx ? 'FX rate required' : '');
    Validate.setValidity(fromSel, (t==='Expense'||t==='Transfer'||t==='Credit Card Payment')?!!fromSel.value:true, 'Required');
    Validate.setValidity(toSel, (t==='Income'||t==='Transfer'||t==='Credit Card Payment')?!!toSel.value:true, 'Required');
    Validate.setValidity(catSel, needCat?!!catSel.value:true, 'Pick a category');
    Validate.setValidity(date, !!date.value, 'Pick a date');
    btnSubmit.disabled = !(amtOk && accountsOk && (!!date.value) && (needCat?!!catSel.value:true) && fxOk);
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
    btnCancel.classList.add('hidden');
    // Scroll to form when resetting
    document.getElementById('formTxn').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    fromSel.value=txn.fromAccountId||'';
    
    // Handle "To" field based on transaction type
    if (txn.transactionType === 'Expense') {
      toSel.value = txn.categoryId || ''; // For expenses, "To" field contains category ID
    } else {
      toSel.value = txn.toAccountId || ''; // For other types, "To" field contains account ID
    }
    
    if(txn.categoryId && txn.transactionType !== 'Expense') catSel.value=txn.categoryId;
    desc.value=txn.description||'';
    validateForm();
    btnSubmit.textContent = duplicate? 'Add' : 'Save Changes';
    btnCancel.classList.toggle('hidden', duplicate);
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
  const debouncedFilters=Utils.debounce(()=> drawTable(), 300);
  
  // Add event listeners for all filters
  if (filterText) filterText.addEventListener('input', debouncedFilters);
  [filterAmountMin, filterAmountMax].forEach(el=> {
    if (el) el.addEventListener('input', debouncedFilters);
  });
  [filterType, filterStart, filterEnd, filterAccount, filterCategory].forEach(el=> {
    if (el) el.addEventListener('change', drawTable);
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
  btnAddMultiple.addEventListener('click', ()=>{ bulkInput.value=''; bulkDialog.showModal(); });
  btnBulkClose.addEventListener('click', ()=> bulkDialog.close());
  bulkForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const lines=bulkInput.value.split(/\n+/).map(l=>l.trim()).filter(Boolean);
    if(!lines.length){ bulkDialog.close(); return; }
    const accountsByName=new Map(AppState.State.accounts.map(a=>[a.name.toLowerCase(), a.id]));
    const categoriesByName=new Map(AppState.State.categories.map(c=>[c.name.toLowerCase(), c.id]));
    for (const line of lines){
      const parts=line.split(',');
      const [d,tt,amt,curr,fromName,toName,catName,description,fxRateValue]=parts.map(p=> (p??'').trim());
      const txn=AppState.newTransaction();
      txn.date=d||Utils.todayISO();
      const typeMap={ 'expense':'Expense', 'income':'Income', 'transfer':'Transfer', 'credit card payment':'Credit Card Payment', 'credit-card payment':'Credit Card Payment' };
      const normalizedType=typeMap[(tt||'Expense').toLowerCase()]||'Expense';
      txn.transactionType=normalizedType;
      txn.amount=Number(amt||0);
      txn.currency=curr||'USD';
      txn.description=description||'';
      const fromId=fromName? accountsByName.get(fromName.toLowerCase())||'':'';
      const toId=toName? accountsByName.get(toName.toLowerCase())||'':'';
      if(txn.transactionType==='Expense'){ txn.fromAccountId=fromId; txn.toAccountId=''; }
      else if(txn.transactionType==='Income'){ txn.fromAccountId=''; txn.toAccountId=toId; }
      else { txn.fromAccountId=fromId; txn.toAccountId=toId; }
      const categoryMatch=catName? categoriesByName.get(catName.toLowerCase()):'';
      txn.categoryId=categoryMatch||'';
      if(txn.currency==='USD'){ txn.fxRate=1; }
      else if(fxRateValue){ txn.fxRate=Number(fxRateValue)||1; }
      else{
        try{ txn.fxRate=await Utils.ensureFxForDate(txn.date); }
        catch(e){ txn.fxRate=1; }
      }
      await AppState.saveItem('transactions', txn, 'transactions');
    }
    bulkDialog.close();
    drawTable();
  });
  btnSortAmount.addEventListener('click', ()=>{ sortKey='amount'; sortDir= sortDir==='desc'?'asc':'desc'; drawTable(); });
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(btnSubmit.disabled) return;
    const txn=editingId? AppState.State.transactions.find(x=>x.id===editingId) : AppState.newTransaction();
    txn.id = editingId || txn.id;
    txn.date = date.value;
    txn.transactionType = type.value;
    txn.amount = Number(amount.value||0);
    txn.currency = currency.value;
    txn.fxRate = Number(fx.value||1);
    txn.description = desc.value.trim();
    txn.fromAccountId = fromSel.value||'';
    
    // Handle "To" field based on transaction type
    if (txn.transactionType === 'Expense') {
      // For expenses, "To" field contains category ID
      txn.toAccountId = ''; // No account for expenses
      txn.categoryId = toSel.value || ''; // Category comes from "To" field
    } else {
      // For other types, "To" field contains account ID
      txn.toAccountId = toSel.value || '';
      txn.categoryId = (txn.transactionType==='Income')? (catSel.value||'') : '';
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
    
    await AppState.saveItem('transactions', txn, 'transactions');
    if (!editingId && AppState.State.settings.defaultTxnDateMode==='selected'){
      AppState.State.settings.lastTxnDate = txn.date;
      await AppState.saveItem('settings', AppState.State.settings, 'settings');
    }
    
    // Show success feedback
    const action = editingId ? 'updated' : 'added';
    const usdAmount = txn.currency === 'USD' ? txn.amount : txn.amount * txn.fxRate;
    const message = `Transaction ${action} successfully! ${txn.transactionType}: ${Utils.formatMoneyUSD(usdAmount)}`;
    
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
    
    drawTable();
    resetForm();
    
    // Focus on the date field for next transaction
    setTimeout(() => {
      if (date && date.focus) {
        date.focus();
      }
    }, 100);
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
// Enhanced transaction filter with debugging and amount filtering
function txFilter(t){
  const txtEl = document.getElementById('filterText');
  const typEl = document.getElementById('filterType');
  const startEl = document.getElementById('filterStart');
  const endEl = document.getElementById('filterEnd');
  const amountMinEl = document.getElementById('filterAmountMin');
  const amountMaxEl = document.getElementById('filterAmountMax');
  const catEl = document.getElementById('filterCategory');
  
  // Check if elements exist (for debugging)
  if (!txtEl || !typEl || !startEl || !endEl || !amountMinEl || !amountMaxEl || !catEl) {
    console.warn('Filter elements not found:', {
      txtEl: !!txtEl, typEl: !!typEl, startEl: !!startEl, endEl: !!endEl,
      amountMinEl: !!amountMinEl, amountMaxEl: !!amountMaxEl, catEl: !!catEl
    });
    return true; // Show all transactions if filters not available
  }

  const txt = (txtEl.value || '').toLowerCase().trim();
  const typ = typEl.value || '';
  const start = startEl.value || '';
  const end = endEl.value || '';
  const amountMin = amountMinEl.value || '';
  const amountMax = amountMaxEl.value || '';
  const cat = catEl.value || '';

  // Debug active filters
  const hasFilters = txt || typ || start || end || amountMin || amountMax || cat;
  if (hasFilters) {
    console.log('Active filters:', { txt, typ, start, end, amountMin, amountMax, cat });
  }

  // Description filter
  if (txt && !((t.description || '').toLowerCase().includes(txt))) {
    console.log('Filtered out by description:', t.description, 'does not include:', txt);
    return false;
  }
  
  // Transaction type filter
  if (typ && t.transactionType !== typ) {
    console.log('Filtered out by type:', t.transactionType, '!==', typ);
    return false;
  }
  
  // Date range filters
  if (start && t.date < start) {
    console.log('Filtered out by start date:', t.date, '<', start);
    return false;
  }
  if (end && t.date > end) {
    console.log('Filtered out by end date:', t.date, '>', end);
    return false;
  }

  // Amount filters (convert to USD for comparison)
  const usdAmount = t.currency === 'USD' ? Number(t.amount) : Number(t.amount) * Number(t.fxRate || 1);
  if (amountMin && usdAmount < Number(amountMin)) {
    console.log('Filtered out by min amount:', usdAmount, '<', Number(amountMin));
    return false;
  }
  if (amountMax && usdAmount > Number(amountMax)) {
    console.log('Filtered out by max amount:', usdAmount, '>', Number(amountMax));
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
      console.log('Filtered out by account:', { fromRaw, toRaw, accId });
      return false;
    }
  }

  // Category filter (root category match)
  if (cat && rootCategoryId(t.categoryId) !== cat) {
    console.log('Filtered out by category:', rootCategoryId(t.categoryId), '!==', cat);
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
let arr=[...AppState.State.transactions].filter(txFilter);
    
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
      tbody.innerHTML = '<tr><td colspan="11" class="muted">No transactions yet</td></tr>';
      return;
    }
    
    // Render grouped transactions
    tbody.innerHTML = sortedMonths.map(month => {
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
        
        return `<div class="transaction-row">
          <div class="transaction-date">${formattedDate}</div>
          <div class="transaction-description">${t.description || '—'}</div>
          <div class="transaction-parties">${parties.from} → ${parties.to}</div>
          <div class="transaction-amount ${amountClass}">$${formattedAmount}</div>
          <div class="transaction-actions">
          <button class="btn" data-edit="${t.id}">Edit</button>
            <button class="btn" data-copy="${t.id}">Copy</button>
            <button class="btn danger" data-del="${t.id}">Del</button>
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
