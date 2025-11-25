// pdf.js — Single-page comprehensive PDF report
const PDF = {
  // Number formatting utilities - use preferred currency
  fmtMoney(n) { 
    return Utils.formatMoneyPreferred(n ?? 0);
  },
  fmtPct(n) { 
    return `${(n ?? 0).toFixed(1)}%`; 
  },
  fmtInt(n) { 
    return (n ?? 0).toLocaleString(); 
  },
  fmtScore(n) { 
    return `${Math.round(n ?? 0)}/100`; 
  },

  async generateReport({ startDate, endDate }){
    console.log('🟢 PDF.generateReport called with:', { startDate, endDate });
    
    try {
      await Utils.ensureTodayFX();
      console.log('🟢 FX rates ensured');
      
      // Use the EXACT same filtering and pre-fetching as Dashboard
      // Pre-fetch FX rates for all transaction dates BEFORE calculating
      const filterFn = typeof filterTxByRange === 'function'
        ? filterTxByRange
        : (tx, s, e) => tx.filter(t => Utils.within(t.date, s, e));
      
      const tx = filterFn(AppState.State.transactions, startDate, endDate);
      console.log('🟢 Filtered transactions:', tx.length);
      
      if (tx && tx.length > 0) {
        await Utils.prefetchFxRatesForTransactions(tx);
      }
      
      // Pre-fetch FX rates for all account balance dates
      const accounts = AppState.State.accounts || [];
      const accountPromises = accounts.map(acc => Utils.ensureAccountBalanceFxRate(acc));
      await Promise.allSettled(accountPromises);
      
      // Calculate comprehensive financial data using the SAME functions as Dashboard
      console.log('🟢 Calculating financial data using Dashboard functions...');
      const financialData = this.calculateFinancialData(tx, null, startDate, endDate);
      console.log('🟢 Financial data calculated:', financialData);
      
      // Generate HTML report
      console.log('🟢 Generating HTML report...');
      try {
        this.generateHTMLReport(financialData, startDate, endDate);
        console.log('🟢 HTML report generated successfully');
      } catch (htmlError) {
        console.error('🟢 Error generating HTML report:', htmlError);
        // Continue with fallback PDF generation
      }
      
      // Wait for charts to render
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Convert to PDF using html2pdf or fallback to jsPDF
      console.log('🟢 Converting to PDF...');
      const element = document.getElementById('report');
      
      if (!element) {
        console.error('🟢 Report element not found, using jsPDF fallback');
        this.fallbackToJSPDF(financialData, startDate, endDate);
        return;
      }
      
      // Check if html2pdf is available
      if (window.html2pdf) {
        console.log('🟢 Using html2pdf for conversion...');
        const opt = {
          margin: 0.2,
          filename: `finance-report-${startDate}-to-${endDate}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        };
        
        try {
          await window.html2pdf().set(opt).from(element).save();
          console.log('🟢 PDF saved successfully with html2pdf!');
        } catch (html2pdfError) {
          console.error('🟢 html2pdf failed, falling back to jsPDF:', html2pdfError);
          this.fallbackToJSPDF(financialData, startDate, endDate);
        }
      } else {
        console.log('🟢 html2pdf not available, using jsPDF fallback...');
        this.fallbackToJSPDF(financialData, startDate, endDate);
      }
      
    } catch (error) {
      console.error('🟢 Error in PDF generation:', error);
      console.error('🟢 Error stack:', error.stack);
      throw error;
    }
  },

  fallbackToJSPDF(financialData, startDate, endDate) {
    console.log('🟢 Using jsPDF fallback method...');
    
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
      console.error('🟢 jsPDF not available either');
      alert('PDF library not loaded. Please refresh and try again.');
      return;
    }
    
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'letter' });
      
      // Simple header
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text('Personal Finance Report', 50, 50);
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(`Period: ${startDate} to ${endDate}`, 50, 70);
      doc.text(`Generated: ${Utils.formatDate(Utils.todayISO())}`, 50, 85);
      
      let y = 120;
      
      // Executive Summary
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text('Executive Summary', 50, y);
      y += 30;
      
      // KPIs in a simple table
      const kpis = [
        { label: 'Total Income', value: this.fmtMoney(financialData.summary.income), color: [34, 197, 94] },
        { label: 'Total Expenses', value: this.fmtMoney(financialData.summary.expenses), color: [239, 68, 68] },
        { label: 'Net Income', value: this.fmtMoney(financialData.summary.net), color: financialData.summary.net >= 0 ? [34, 197, 94] : [239, 68, 68] },
        { label: 'Daily Spending', value: this.fmtMoney(financialData.avgDailySpending), color: [99, 102, 241] },
        { label: 'Total Transactions', value: this.fmtInt(financialData.totalTransactions), color: [168, 85, 247] }
      ];
      
      kpis.forEach((kpi, index) => {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        doc.text(kpi.label, 50, y);
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
        doc.text(kpi.value, 300, y);
        
        y += 20;
      });
      
      y += 20;
      
      // Top Expense Categories
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text('Top Expense Categories', 50, y);
      y += 25;
      
      const expenseEntries = Object.entries(financialData.expenseByCategory)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 8);
      
      const maxExpense = Math.max(...expenseEntries.map(([_, amount]) => amount));
      
      expenseEntries.forEach(([category, amount]) => {
        const percentage = (amount / maxExpense) * 100;
        
        // Category name
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        doc.text(category, 50, y);
        
        // Amount
        const amountText = this.fmtMoney(amount);
        const amountWidth = doc.getTextWidth(amountText);
        doc.text(amountText, 500 - amountWidth, y);
        
        // Simple bar
        const barWidth = (amount / maxExpense) * 200;
        doc.setFillColor(239, 68, 68);
        doc.rect(200, y - 6, barWidth, 8, 'F');
        
        // Bar background
        doc.setFillColor(240, 240, 240);
        doc.rect(200, y - 6, 200, 8, 'F');
        doc.setFillColor(239, 68, 68);
        doc.rect(200, y - 6, barWidth, 8, 'F');
        
        y += 15;
      });
      
      // Save the PDF
      doc.save(`finance-report-${startDate}-to-${endDate}.pdf`);
      console.log('🟢 PDF saved successfully with jsPDF fallback!');
      
    } catch (error) {
      console.error('🟢 Error in jsPDF fallback:', error);
      alert('Error generating PDF. Please try again.');
    }
  },

  calculateFinancialData(tx, usd, startDate, endDate) {
    // Use the EXACT same functions as the Dashboard
    // Filter transactions using the same function the Dashboard uses
    // filterTxByRange is defined in ui.js - access it directly (it's in global scope)
    const filteredTx = typeof filterTxByRange === 'function' 
      ? filterTxByRange(AppState.State.transactions, startDate, endDate)
      : AppState.State.transactions.filter(t => Utils.within(t.date, startDate, endDate));
    
    // Use kpisForRange to get income, expenses, net - this matches Dashboard exactly
    // kpisForRange is defined in ui.js - access it directly (it's in global scope)
    const kpis = typeof kpisForRange === 'function'
      ? kpisForRange(startDate, endDate)
      : (() => {
          // Fallback calculation if kpisForRange not available
          const txRange = filteredTx;
          const income = txRange.filter(t=>t.transactionType==='Income').reduce((a,t)=>a+toUSD(t),0);
          const expenses = txRange.filter(t=>t.transactionType==='Expense' || t.transactionType==='Credit Card Interest').reduce((a,t)=>a+toUSD(t),0);
          return { income, expenses, net: income - expenses, txRange };
        })();
    const income = kpis.income;
    const expenses = kpis.expenses;
    const net = kpis.net;
    const txRange = kpis.txRange;
    
    // Helper function to convert transaction amount (same as Dashboard's toUSD)
    // toUSD is defined in ui.js and converts to preferred currency
    const convertTxn = typeof toUSD === 'function' 
      ? toUSD 
      : (t) => {
          // Fallback: use preferred currency conversion (same logic as toUSD)
          if (!t) return 0;
          const preferred = Utils.getPreferredCurrency();
          if (t.amountPreferred !== undefined && t.amountPreferred !== null && 
              t.preferredCurrencyAtSave === preferred) {
            return Number(t.amountPreferred);
          }
          return Utils.toPreferredCurrencySync(Number(t.amount), t.currency || 'USD', t.date);
        };
    
    // Helper to access Budget tab functions if available
    const getBudgetFunctions = () => {
      // These functions are defined in ui.js renderBudget scope
      // Try to access them via closure or recreate the logic
      return {
        expandSeriesForMonth: typeof expandSeriesForMonth === 'function' ? expandSeriesForMonth : null,
        computeBVA: typeof computeBVA === 'function' ? computeBVA : null,
        actualsForMonth: typeof actualsForMonth === 'function' ? actualsForMonth : null,
        monthParts: typeof monthParts === 'function' ? monthParts : null
      };
    };
    
    // Income analysis - use toUSD() like Dashboard does
    const incomeByCategory = {};
    txRange.filter(t=>t.transactionType==='Income').forEach(t=>{
      const cat = Utils.categoryById(t.categoryId)?.name || 'Uncategorized';
      incomeByCategory[cat] = (incomeByCategory[cat]||0) + convertTxn(t);
    });
    
    // Expense analysis - include Credit Card Interest, use toUSD() like Dashboard
    const expenseByCategory = {};
    const expenseByParent = {};
    txRange.filter(t=>t.transactionType==='Expense' || t.transactionType==='Credit Card Interest').forEach(t=>{
      const cat = Utils.categoryById(t.categoryId);
      // Show subcategory name, not parent category
      const categoryName = cat ? cat.name : 'Uncategorized';
      const amount = convertTxn(t);
      
      expenseByCategory[categoryName] = (expenseByCategory[categoryName]||0) + amount;
      // Also group by parent for summary (but display uses subcategory)
      const parent = Utils.parentCategoryName(t.categoryId);
      expenseByParent[parent] = (expenseByParent[parent]||0) + amount;
    });
    
    // Daily spending patterns - include Credit Card Interest, use toUSD() like Dashboard
    const dailySpending = {};
    txRange.filter(t=>t.transactionType==='Expense' || t.transactionType==='Credit Card Interest').forEach(t=>{
      const day = new Date(t.date).getDay();
      const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day];
      dailySpending[dayName] = (dailySpending[dayName]||0) + convertTxn(t);
    });
    
    // Account analysis - handle all accounts including Cash and debit cards
    const accountAnalysis = {};
    
    // Process regular accounts
    AppState.State.accounts.forEach(acc => {
      let inflow = 0;
      let outflow = 0;
      
      // Check transactions where this account is involved - use toUSD() like Dashboard
      txRange.forEach(t => {
        const usdAmount = convertTxn(t);
        
        // Income: toAccountId matches
        if (t.transactionType === 'Income' && t.toAccountId === acc.id) {
          inflow += usdAmount;
        }
        // Expense: fromAccountId matches
        else if ((t.transactionType === 'Expense' || t.transactionType === 'Credit Card Interest') && t.fromAccountId === acc.id) {
          outflow += usdAmount;
        }
        // Credit Card Payment: fromAccountId matches (outflow) or toAccountId matches (inflow for credit card)
        else if (t.transactionType === 'Credit Card Payment') {
          if (t.fromAccountId === acc.id) {
            outflow += usdAmount;
          } else if (t.toAccountId === acc.id) {
            inflow += usdAmount; // Payment received by credit card
          }
        }
        // Transfer: handle both directions
        else if (t.transactionType === 'Transfer') {
          if (t.fromAccountId === acc.id) {
            outflow += usdAmount;
          }
          if (t.toAccountId === acc.id) {
            inflow += usdAmount;
          }
        }
      });
      
      // Also check for debit card transactions (debit cards belong to parent account)
      if (acc.debitCards && acc.debitCards.length > 0) {
        acc.debitCards.forEach(dc => {
          txRange.forEach(t => {
            const usdAmount = convertTxn(t);
            if (t.fromAccountId === dc.id && (t.transactionType === 'Expense' || t.transactionType === 'Credit Card Interest')) {
              outflow += usdAmount;
            }
          });
        });
      }
      
      accountAnalysis[acc.name] = { inflow, outflow, net: inflow - outflow };
    });
    
    // Handle Cash account (CASH ID)
    if (txRange.some(t => t.fromAccountId === 'CASH' || t.toAccountId === 'CASH')) {
      let cashInflow = 0;
      let cashOutflow = 0;
      
      txRange.forEach(t => {
        const usdAmount = convertTxn(t);
        if (t.transactionType === 'Income' && t.toAccountId === 'CASH') {
          cashInflow += usdAmount;
        } else if ((t.transactionType === 'Expense' || t.transactionType === 'Credit Card Interest') && t.fromAccountId === 'CASH') {
          cashOutflow += usdAmount;
        } else if (t.transactionType === 'Transfer') {
          if (t.fromAccountId === 'CASH') {
            cashOutflow += usdAmount;
          }
          if (t.toAccountId === 'CASH') {
            cashInflow += usdAmount;
          }
        }
      });
      
      accountAnalysis['Cash'] = { inflow: cashInflow, outflow: cashOutflow, net: cashInflow - cashOutflow };
    }
    
    // Credit card analysis - convert to preferred currency
    const creditCards = AppState.State.accounts.filter(a => Utils.accountType(a) === 'credit-card');
    const ccAnalysis = creditCards.map(card => {
      const balanceUSD = Utils.currentBalanceUSD(card);
      const limitUSD = Utils.creditLimitUSD(card);
      const balancePreferred = Utils.convertUSDToPreferred(balanceUSD);
      const limitPreferred = Utils.convertUSDToPreferred(limitUSD);
      return {
        name: card.name,
        balance: balancePreferred,
        limit: limitPreferred,
        utilization: limitPreferred > 0 ? (balancePreferred / limitPreferred) * 100 : 0,
        payments: txRange.filter(t => t.transactionType === 'Credit Card Payment' && t.toAccountId === card.id).reduce((s,t) => s + convertTxn(t), 0),
        purchases: txRange.filter(t => t.fromAccountId === card.id && (t.transactionType === 'Expense' || t.transactionType === 'Credit Card Interest')).reduce((s,t) => s + convertTxn(t), 0)
      };
    });
    
    // Budget analysis - use convertTxn for consistency
    const budgetAnalysis = this.analyzeBudgets(txRange, convertTxn, startDate, endDate);
    
    // Net worth analysis - convert to preferred currency
    const netWorthTimeline = Utils.netWorthTimeline();
    const periodNetWorth = netWorthTimeline.filter(nw => 
      nw.date >= startDate && nw.date <= endDate
    ).map(nw => ({
      ...nw,
      netWorthPreferred: Utils.convertUSDToPreferred(nw.netWorthUSD || 0)
    }));
    
    // Cash flow analysis - use same logic as Dashboard
    // Calculate cash flow exactly like Dashboard does
    let cashIn = 0;
    let cashOut = 0;
    
    txRange.forEach(txn => {
      const preferredAmount = convertTxn(txn);
      
      if (txn.transactionType === 'Income') {
        cashIn += preferredAmount;
      } else if (txn.transactionType === 'Expense') {
        const fromAccount = AppState.State.accounts.find(a => a.id === txn.fromAccountId);
        if (fromAccount && Utils.accountType(fromAccount) !== 'credit-card') {
          cashOut += preferredAmount;
        }
      } else if (txn.transactionType === 'Credit Card Payment') {
        cashOut += preferredAmount;
      }
      // Credit Card Interest and Transfers don't affect cash flow
    });
    
    const cashFlow = {
      inflow: cashIn,
      outflow: cashOut,
      net: cashIn - cashOut,
      byAccount: accountAnalysis // Reuse account analysis for byAccount breakdown
    };
    
    // Calculate days in range consistently (same as Dashboard)
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    const daysInRange = Math.max(1, Math.ceil((endDateObj - startDateObj) / (1000 * 60 * 60 * 24)) + 1);
    
    return {
      period: { startDate, endDate },
      summary: { income, expenses, net },
      incomeByCategory,
      expenseByCategory,
      expenseByParent,
      dailySpending,
      accountAnalysis,
      creditCards: ccAnalysis,
      budgetAnalysis,
      netWorthTimeline: periodNetWorth,
      cashFlow,
      totalTransactions: txRange.length,
      avgDailySpending: expenses / daysInRange
    };
  },

  generateHTMLReport(data, startDate, endDate) {
    // Show the report element
    const reportEl = document.getElementById('report');
    if (!reportEl) {
      console.error('Report element not found');
      return;
    }
    
    reportEl.style.display = 'block';
    
    // Update header
    document.getElementById('report-period').textContent = `Period: ${startDate} to ${endDate}`;
    document.getElementById('report-generated').textContent = `Generated: ${Utils.formatDate(Utils.todayISO())}`;
    
    // Generate executive summary KPIs
    this.generateKPIs(data);
    
    // Generate spending patterns
    this.generateSpendingPatterns(data);
    
    // Generate income vs expenses
    this.generateIncomeExpenses(data);
    
    // Generate account activity
    this.generateAccountActivity(data);
    
    // Generate budget analysis
    this.generateBudgetAnalysis(data);
    
    // Generate cash flow
    this.generateCashFlow(data);
  },

  generateKPIs(data) {
    const kpiGrid = document.getElementById('kpi-grid');
    if (!kpiGrid) return;
    
    const kpis = [
      { label: 'Total Income', value: this.fmtMoney(data.summary.income), color: 'ok' },
      { label: 'Total Expenses', value: this.fmtMoney(data.summary.expenses), color: 'bad' },
      { label: 'Net Income', value: this.fmtMoney(data.summary.net), color: data.summary.net >= 0 ? 'ok' : 'bad' },
      { label: 'Daily Spending', value: this.fmtMoney(data.avgDailySpending), color: 'brand' },
      { label: 'Transactions', value: this.fmtInt(data.totalTransactions), color: 'brand' },
      { label: 'Health Score', value: this.fmtScore(this.calculateFinancialHealthScore(data)), color: 'warn' }
    ];
    
    kpiGrid.innerHTML = kpis.map(kpi => `
      <div class="kpi">
        <div class="label">${kpi.label}</div>
        <div class="val" style="color: var(--${kpi.color})">${kpi.value}</div>
      </div>
    `).join('');
  },

  generateSpendingPatterns(data) {
    const container = document.getElementById('daily-spending');
    if (!container) return;
    
    const dailyEntries = Object.entries(data.dailySpending).sort((a,b) => b[1] - a[1]);
    const maxAmount = Math.max(...dailyEntries.map(([_, amount]) => amount));
    
    container.innerHTML = `
      <div class="barlist">
        ${dailyEntries.slice(0, 7).map(([day, amount]) => {
          const percentage = (amount / maxAmount) * 100;
          return `
            <div class="item">
              <div>${day}</div>
              <div style="text-align: right;">
                <span style="font-weight: 600;">${this.fmtMoney(amount)}</span>
              </div>
              <div class="bar">
                <span style="width: ${percentage}%; background: var(--brand);"></span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  generateIncomeExpenses(data) {
    // Income by category
    const incomeContainer = document.getElementById('income-by-category');
    if (incomeContainer) {
      const incomeEntries = Object.entries(data.incomeByCategory).sort((a,b) => b[1] - a[1]);
      const maxIncome = Math.max(...incomeEntries.map(([_, amount]) => amount));
      
      incomeContainer.innerHTML = `
        <h3 style="font-size: 13px; margin: 0 0 8px 0; color: var(--muted);">Income by Category</h3>
        <div class="barlist">
          ${incomeEntries.slice(0, 5).map(([category, amount]) => {
            const percentage = (amount / maxIncome) * 100;
            return `
              <div class="item">
                <div>${category}</div>
                <div style="text-align: right;">
                  <span style="font-weight: 600;">${this.fmtMoney(amount)}</span>
                </div>
                <div class="bar">
                  <span style="width: ${percentage}%; background: var(--ok);"></span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
    
    // Top expense categories
    const expenseContainer = document.getElementById('top-expense-categories');
    if (expenseContainer) {
      const expenseEntries = Object.entries(data.expenseByCategory).sort((a,b) => b[1] - a[1]);
      const maxExpense = Math.max(...expenseEntries.map(([_, amount]) => amount));
      
      expenseContainer.innerHTML = `
        <h3 style="font-size: 13px; margin: 0 0 8px 0; color: var(--muted);">Top Expense Categories</h3>
        <div class="barlist">
          ${expenseEntries.slice(0, 6).map(([category, amount]) => {
            const percentage = (amount / maxExpense) * 100;
            return `
              <div class="item">
                <div>${category}</div>
                <div style="text-align: right;">
                  <span style="font-weight: 600;">${this.fmtMoney(amount)}</span>
                </div>
                <div class="bar">
                  <span style="width: ${percentage}%; background: var(--bad);"></span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
  },

  generateAccountActivity(data) {
    const container = document.getElementById('account-activity');
    if (!container) return;
    
    const accountEntries = Object.entries(data.accountAnalysis)
      .filter(([_, analysis]) => Math.abs(analysis.net) > 0.01)
      .sort((a,b) => Math.abs(b[1].net) - Math.abs(a[1].net));
    
    const maxNet = Math.max(...accountEntries.map(([_, analysis]) => Math.abs(analysis.net)));
    
    container.innerHTML = `
      <div class="barlist">
        ${accountEntries.slice(0, 8).map(([account, analysis]) => {
          const percentage = (Math.abs(analysis.net) / maxNet) * 100;
          const isPositive = analysis.net >= 0;
          const color = isPositive ? 'var(--ok)' : 'var(--bad)';
          const sign = isPositive ? '+' : '';
          
          return `
            <div class="item">
              <div>${account}</div>
              <div style="text-align: right;">
                <span class="badge ${isPositive ? 'ok' : 'bad'}">${sign}${this.fmtMoney(analysis.net)}</span>
              </div>
              <div class="bar">
                <span style="width: ${percentage}%; background: ${color};"></span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  generateBudgetAnalysis(data) {
    const container = document.getElementById('budget-vs-actual');
    if (!container) return;
    
    container.innerHTML = `
      <div class="table-compact">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Budgeted</th>
              <th>Actual</th>
              <th>Variance</th>
            </tr>
          </thead>
          <tbody>
            ${data.budgetAnalysis ? data.budgetAnalysis.slice(0, 6).map(budget => `
              <tr>
                <td>${budget.category}</td>
                <td>${this.fmtMoney(budget.budgeted)}</td>
                <td>${this.fmtMoney(budget.actual)}</td>
                <td style="color: ${budget.variance >= 0 ? 'var(--ok)' : 'var(--bad)'}">
                  ${budget.variance >= 0 ? '+' : ''}${this.fmtMoney(budget.variance)}
                </td>
              </tr>
            `).join('') : '<tr><td colspan="4">No budget data available</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  },

  generateCashFlow(data) {
    const container = document.getElementById('cashflow-summary');
    if (!container) return;
    
    container.innerHTML = `
      <div class="kpis">
        <div class="kpi">
          <div class="label">Cash Inflow</div>
          <div class="val" style="color: var(--ok)">${this.fmtMoney(data.cashFlow.inflow)}</div>
        </div>
        <div class="kpi">
          <div class="label">Cash Outflow</div>
          <div class="val" style="color: var(--bad)">${this.fmtMoney(data.cashFlow.outflow)}</div>
        </div>
        <div class="kpi">
          <div class="label">Net Cash Flow</div>
          <div class="val" style="color: ${data.cashFlow.net >= 0 ? 'var(--ok)' : 'var(--bad)'}">${this.fmtMoney(data.cashFlow.net)}</div>
        </div>
      </div>
    `;
  },

  analyzeNetWorth() {
    // Use the same corrected logic as UI.calcNetWorthUSD() for consistency
    // ASSETS: Accounts that hold money you own
    const assets = AppState.State.accounts.reduce((s, a) => {
      const type = Utils.accountType(a);
      const balance = Utils.currentBalanceUSD(a);
      
      // Asset accounts: checking, savings, cash, investment
      if (type === 'checking' || type === 'savings' || type === 'cash' || type === 'investment') {
        return s + Math.max(0, balance); // Only positive balances are assets
      }
      
      // Credit cards/loans with NEGATIVE balances (overpayments) are assets
      // Negative balance = bank owes you = asset
      if ((type === 'credit-card' || type === 'loan') && balance < 0) {
        return s + Math.abs(balance); // Convert negative to positive for asset
      }
      
      return s;
    }, 0);
    
    // LIABILITIES: Money you owe
    const liabilities = AppState.State.accounts.reduce((s, a) => {
      const balance = Utils.currentBalanceUSD(a);
      const type = Utils.accountType(a);
      
      // Credit cards and loans: POSITIVE balances are liabilities (what you owe)
      if (type === 'credit-card' || type === 'loan') {
        return s + Math.max(0, balance); // Positive balance = you owe = liability
      }
      
      // Asset accounts with negative balances (overdrawn) are liabilities
      return s + Math.max(0, -balance);
    }, 0);
    
    // Net Worth = Assets - Liabilities
    const netWorth = assets - liabilities;
    
    // Convert to preferred currency for display
    return {
      assets: Utils.convertUSDToPreferred(assets),
      liabilities: Utils.convertUSDToPreferred(liabilities),
      netWorth: Utils.convertUSDToPreferred(netWorth)
    };
  },

  generateNetWorth(data) {
    const container = document.getElementById('networth-summary');
    if (!container) return;
    
    const netWorth = this.analyzeNetWorth();
    
    container.innerHTML = `
      <div class="kpis">
        <div class="kpi">
          <div class="label">Total Assets</div>
          <div class="val" style="color: var(--ok)">${this.fmtMoney(netWorth.assets)}</div>
        </div>
        <div class="kpi">
          <div class="label">Total Liabilities</div>
          <div class="val" style="color: var(--bad)">${this.fmtMoney(netWorth.liabilities)}</div>
        </div>
        <div class="kpi">
          <div class="label">Net Worth</div>
          <div class="val" style="color: ${netWorth.netWorth >= 0 ? 'var(--ok)' : 'var(--bad)'}">${this.fmtMoney(netWorth.netWorth)}</div>
        </div>
      </div>
    `;
  },

  generateCreditCards(data) {
    const container = document.getElementById('cc-list');
    if (!container) return;
    
    container.innerHTML = `
      <div class="table-compact">
        <table>
          <thead>
            <tr>
              <th>Card</th>
              <th>Balance</th>
              <th>Limit</th>
              <th>Utilization</th>
            </tr>
          </thead>
          <tbody>
            ${data.creditCards ? data.creditCards.slice(0, 4).map(card => `
              <tr>
                <td>${card.name}</td>
                <td>${this.fmtMoney(card.balance)}</td>
                <td>${this.fmtMoney(card.limit)}</td>
                <td>
                  <span class="badge ${card.utilization > 80 ? 'bad' : card.utilization > 50 ? 'warn' : 'ok'}">
                    ${this.fmtPct(card.utilization)}
                  </span>
                </td>
              </tr>
            `).join('') : '<tr><td colspan="4">No credit card data available</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  },

  generateInsights(data) {
    const container = document.getElementById('insights-list');
    if (!container) return;
    
    const insights = this.generateFinancialInsights(data);
    
    container.innerHTML = insights.slice(0, 3).map(insight => `
      <li style="margin: 4px 0; font-size: 11px; color: var(--fg);">${insight}</li>
    `).join('');
  },

  // Recreate expandSeriesForMonth logic (exact copy from ui.js)
  expandSeriesForMonth(series, y, m) {
    const startOfMonth = new Date(y, m, 1);
    const endOfMonth = new Date(y, m+1, 0);
    const untilTs = series.repeatUntil ? new Date(series.repeatUntil).getTime() : Infinity;
    const anchor = new Date(series.anchorDate);

    const inst = [];
    const pushIfInRange = (d) => {
      const ts = d.getTime();
      if(ts >= startOfMonth.getTime() && ts <= endOfMonth.getTime() && ts <= untilTs){
        const budgetCurrency = series.currency || 'USD';
        const instanceDate = d.toISOString().slice(0, 10);
        let amountPreferred = series.amount;
        if (budgetCurrency !== Utils.getPreferredCurrency()) {
          amountPreferred = Utils.toPreferredCurrencySync(series.amount, budgetCurrency, instanceDate);
        }
        inst.push({ 
          date: d.toISOString().slice(0,10), 
          amount: amountPreferred, 
          seriesId: series.id, 
          categoryId: series.categoryId, 
          type: series.type 
        });
      }
    };

    if(series.cadence === 'onetime' || series.cadence === 'one-time'){
      // One time only: only show in the exact month of the anchor date
      const anchorYear = anchor.getFullYear();
      const anchorMonth = anchor.getMonth();
      if (y === anchorYear && m === anchorMonth) {
        // Only include if the anchor date falls within the requested month
        const anchorDateOnly = new Date(anchorYear, anchorMonth, anchor.getDate());
        if (anchorDateOnly.getTime() >= startOfMonth.getTime() && anchorDateOnly.getTime() <= endOfMonth.getTime()) {
          pushIfInRange(anchorDateOnly);
        }
      }
    }
    else if(series.cadence === 'monthly'){
      const d = new Date(y, m, Math.min(anchor.getDate(), 28));
      if (d.getTime() >= new Date(series.anchorDate).getTime()) pushIfInRange(d);
    }
    else if(series.cadence === 'bimonthly'){
      const anchorDate = new Date(series.anchorDate);
      const monthsDiff = (y * 12 + m) - (anchorDate.getFullYear() * 12 + anchorDate.getMonth());
      if (monthsDiff >= 0 && monthsDiff % 2 === 0) {
        const d = new Date(y, m, Math.min(anchor.getDate(), 28));
        if (d.getTime() >= new Date(series.anchorDate).getTime()) pushIfInRange(d);
      }
    }
    else if(series.cadence === 'semimonthly'){
      const anchorDay = anchor.getDate();
      const anchorDateObj = new Date(series.anchorDate);
      const firstOccurrence = new Date(y, m, Math.min(anchorDay, 28));
      if (firstOccurrence.getTime() >= anchorDateObj.getTime()) {
        pushIfInRange(firstOccurrence);
      }
      const secondOccurrence = new Date(firstOccurrence);
      secondOccurrence.setDate(secondOccurrence.getDate() + 15);
      if (secondOccurrence.getMonth() === m) {
        if (secondOccurrence.getTime() >= anchorDateObj.getTime()) {
          pushIfInRange(secondOccurrence);
        }
      } else {
        const fifteenth = new Date(y, m, 15);
        if (fifteenth.getTime() >= anchorDateObj.getTime() && fifteenth.getTime() !== firstOccurrence.getTime()) {
          pushIfInRange(fifteenth);
        }
      }
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
  },

  // Recreate monthParts helper (from Budget tab)
  monthParts(isoYYYYMM) {
    const [yy, mm] = isoYYYYMM.split('-').map(Number);
    return { y: yy, m: mm - 1 };
  },

  // Recreate actualsForMonth logic (exact copy from ui.js)
  actualsForMonth(isoYYYYMM) {
    const { y, m } = this.monthParts(isoYYYYMM);
    const start = new Date(y, m, 1).toISOString().slice(0,10);
    const end = new Date(y, m+1, 0).toISOString().slice(0,10);

    const tx = AppState.State.transactions.filter(t => Utils.within(t.date, start, end));
    const byCat = new Map();
    for (const t of tx){
      const keyType = (t.transactionType === 'Expense') ? 'expense' :
                     (t.transactionType === 'Income')  ? 'income'  : '';
      if(!keyType || !t.categoryId) continue;
      const key = `${keyType}|${t.categoryId}`;
      const prev = byCat.get(key) || 0;
      // Convert transaction amount to preferred currency using transaction date
      const amountPreferred = Utils.toPreferredCurrencySync(Number(t.amount), t.currency || 'USD', t.date);
      byCat.set(key, prev + amountPreferred);
    }
    return byCat;
  },

  // Recreate computeBVA logic (exact copy from ui.js)
  computeBVA(isoYYYYMM) {
    const { y, m } = this.monthParts(isoYYYYMM);
    const allSeries = [...AppState.State.budgets];
    const normalizeSeries = (s) => {
      const cadence = s.cadence || 'monthly';
      const isOneTime = cadence === 'onetime' || cadence === 'one-time';
      return {
        ...s,
        currency: s.currency || 'USD',
        cadence: cadence,
        anchorDate: s.anchorDate || s.startDate || Utils.todayISO(),
        // For one-time budgets, clear repeatUntil field
        repeatUntil: isOneTime ? '' : (s.repeatUntil || s.endDate || '')
      };
    };
    const expanded = allSeries.flatMap(s => this.expandSeriesForMonth(normalizeSeries(s), y, m));

    const budByCat = new Map();
    for(const b of expanded){
      const key = `${b.type}|${b.categoryId}`;
      budByCat.set(key, (budByCat.get(key)||0) + b.amount);
    }

    const actByCat = this.actualsForMonth(isoYYYYMM);
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
  },

  analyzeBudgets(tx, usd, startDate, endDate) {
    // Use the EXACT same logic as the Budget tab's computeBVA
    // Calculate budgets and actuals for the date range using the same functions
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const budgetByCategory = new Map();
    
    // Normalize series (same as Budget tab)
    const normalizeSeries = (s) => {
      const cadence = s.cadence || 'monthly';
      const isOneTime = cadence === 'onetime' || cadence === 'one-time';
      return {
        ...s,
        currency: s.currency || 'USD',
        cadence: cadence,
        anchorDate: s.anchorDate || s.startDate || Utils.todayISO(),
        // For one-time budgets, clear repeatUntil field
        repeatUntil: isOneTime ? '' : (s.repeatUntil || s.endDate || '')
      };
    };
    
    // Calculate budgets: expand all series for all months in range, filter by date range
    const allSeries = [...(AppState.State.budgets || [])];
    const budByCat = new Map();
    
    // Process each month in the date range to get budget instances
    const currentMonth = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    
    while (currentMonth <= endMonth) {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const expanded = allSeries.flatMap(s => this.expandSeriesForMonth(normalizeSeries(s), year, month));
      
      expanded.forEach(b => {
        // Only include budget instances within the date range
        if (b.date >= startDate && b.date <= endDate) {
          const key = `${b.type}|${b.categoryId}`;
          budByCat.set(key, (budByCat.get(key) || 0) + b.amount);
        }
      });
      
      currentMonth.setMonth(currentMonth.getMonth() + 1);
    }
    
    // Calculate actuals: use EXACT same logic as actualsForMonth but for date range
    // Filter transactions within date range
    const rangeTx = AppState.State.transactions.filter(t => Utils.within(t.date, startDate, endDate));
    const actByCat = new Map();
    
    for (const t of rangeTx){
      const keyType = (t.transactionType === 'Expense') ? 'expense' :
                     (t.transactionType === 'Income')  ? 'income'  : '';
      if(!keyType || !t.categoryId) continue;
      const key = `${keyType}|${t.categoryId}`;
      const prev = actByCat.get(key) || 0;
      // Convert transaction amount to preferred currency using transaction date (SAME as actualsForMonth)
      const amountPreferred = Utils.toPreferredCurrencySync(Number(t.amount), t.currency || 'USD', t.date);
      actByCat.set(key, prev + amountPreferred);
    }
    
    // Combine budget and actual (same as computeBVA)
    const keys = new Set([...budByCat.keys(), ...actByCat.keys()]);
    
    for(const key of keys){
      const [type, categoryId] = key.split('|');
      const cat = AppState.State.categories.find(c=>c.id===categoryId);
      const name = cat ? cat.name : 'Unknown';

      const budget = budByCat.get(key) || 0;
      const actual = actByCat.get(key) || 0;
      const variance = (type==='expense') ? (budget - actual) : (actual - budget);

      budgetByCategory.set(key, {
        type,
        categoryId,
        category: name,
        budgeted: budget,
        actual: actual,
        variance: variance
      });
    }
    
    // Convert Map to array and format (same as computeBVA)
    const analysis = Array.from(budgetByCategory.values()).map(budget => {
      const variancePercent = budget.budgeted > 0 ? (budget.variance / budget.budgeted) * 100 : 0;
      
      return {
        category: budget.category,
        budgeted: budget.budgeted,
        actual: budget.actual,
        variance: budget.variance,
        variancePercent,
        status: budget.variance >= 0 ? (budget.type === 'expense' ? 'Under Budget' : 'Over Budget') : (budget.type === 'expense' ? 'Over Budget' : 'Under Budget')
      };
    });
    
    // Sort same as computeBVA
    analysis.sort((a,b)=> a.type===b.type ? a.category.localeCompare(b.category) : a.type.localeCompare(b.type));
    
    return analysis.filter(b => b.budgeted > 0 || b.actual > 0)
                  .sort((a,b) => Math.abs(b.variance) - Math.abs(a.variance));
  },
  
  calculateBudgetForPeriod(series, startDate, endDate) {
    if (!series || !series.anchorDate) return 0;
    
    const anchor = new Date(series.anchorDate);
    const start = new Date(startDate);
    const end = new Date(endDate);
    const cadence = series.cadence || 'monthly';
    const isOneTime = cadence === 'onetime' || cadence === 'one-time';
    
    // For one-time budgets, only include if anchor date is within the date range
    if (isOneTime) {
      if (anchor >= start && anchor <= end) {
        // Convert budget amount from its native currency to preferred currency
        const budgetCurrency = series.currency || 'USD';
        const budgetDate = anchor.toISOString().slice(0, 10);
        return Utils.toPreferredCurrencySync(series.amount, budgetCurrency, budgetDate);
      }
      return 0; // One-time budget not in date range
    }
    
    let totalBudgeted = 0;
    let currentDate = new Date(Math.max(anchor.getTime(), start.getTime()));
    
    while (currentDate <= end) {
      // Check if this occurrence should be included
      if (currentDate >= start && currentDate <= end) {
        if (!series.repeatUntil || currentDate <= new Date(series.repeatUntil)) {
      // Convert budget amount from its native currency to preferred currency
      const budgetCurrency = series.currency || 'USD';
      const budgetDate = currentDate.toISOString().slice(0, 10);
      const amountPreferred = Utils.toPreferredCurrencySync(series.amount, budgetCurrency, budgetDate);
      totalBudgeted += amountPreferred;
        }
      }
      
      // Move to next occurrence based on cadence
      switch (cadence) {
        case 'weekly':
          currentDate.setDate(currentDate.getDate() + 7);
          break;
        case 'biweekly':
          currentDate.setDate(currentDate.getDate() + 14);
          break;
        case 'semimonthly':
          // Semi-monthly: twice per month (e.g., 1st and 15th, or anchor day and 15 days later)
          const dayOfMonth = currentDate.getDate();
          const anchorDay = new Date(series.anchorDate).getDate();
          
          if (dayOfMonth < 15) {
            // We're before the 15th, so next occurrence is 15 days from now
            const nextDate = new Date(currentDate);
            nextDate.setDate(nextDate.getDate() + 15);
            
            // If still in same month, use that date
            if (nextDate.getMonth() === currentDate.getMonth()) {
              currentDate = nextDate;
            } else {
              // If crossed month boundary, go to the 15th of current month
              currentDate.setDate(15);
            }
          } else {
            // We're on or after the 15th, so next occurrence is the anchor day of next month
            currentDate.setMonth(currentDate.getMonth() + 1);
            const lastDayOfNextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
            currentDate.setDate(Math.min(anchorDay, lastDayOfNextMonth));
          }
          break;
        case 'bimonthly':
          currentDate.setMonth(currentDate.getMonth() + 2);
          break;
        case 'monthly':
        default:
          currentDate.setMonth(currentDate.getMonth() + 1);
          break;
      }
    }
    
    return totalBudgeted;
  },

  analyzeCashFlow(tx, usd, startDate, endDate) {
    // Replicate the app's calculateCashFlow logic exactly to ensure consistency
    // This matches the dashboard and all other app calculations
    let cashIn = 0;
    let cashOut = 0;
    
    tx.forEach(txn => {
      const usdAmount = usd(txn);
      
      if (txn.transactionType === 'Income') {
        // All income affects cash flow
        cashIn += usdAmount;
      } else if (txn.transactionType === 'Expense') {
        // Only expenses paid with cash/checking/savings affect cash flow
        // Check if fromAccountId is a regular account or a debit card
        let fromAccount = AppState.State.accounts.find(a => a.id === txn.fromAccountId);
        
        // If not found, check if it's a debit card ID
        if (!fromAccount) {
          for (const acc of AppState.State.accounts) {
            if (acc.debitCards && acc.debitCards.some(dc => dc.id === txn.fromAccountId)) {
              fromAccount = acc; // Use the parent account
              break;
            }
          }
        }
        
        // Handle Cash account
        if (txn.fromAccountId === 'CASH') {
          cashOut += usdAmount;
        } else if (fromAccount && Utils.accountType(fromAccount) !== 'credit-card') {
          cashOut += usdAmount;
        }
      } else if (txn.transactionType === 'Credit Card Payment') {
        // Credit card payments reduce cash flow
        cashOut += usdAmount;
      } else if (txn.transactionType === 'Transfer') {
        // Transfers between cash accounts don't affect net cash flow
        // But we track them for completeness
        const fromAccount = AppState.State.accounts.find(a => a.id === txn.fromAccountId);
        const toAccount = AppState.State.accounts.find(a => a.id === txn.toAccountId);
        
        // Handle Cash account
        if (txn.fromAccountId === 'CASH') {
          cashOut += usdAmount;
        } else if (fromAccount && Utils.accountType(fromAccount) !== 'credit-card') {
          cashOut += usdAmount;
        }
        
        if (txn.toAccountId === 'CASH') {
          cashIn += usdAmount;
        } else if (toAccount && Utils.accountType(toAccount) !== 'credit-card') {
          cashIn += usdAmount;
        }
      }
      // Note: Credit Card Interest doesn't affect cash flow (it's already on the card)
    });
    
    // Also calculate by account for detailed breakdown
    const byAccount = {};
    const cashAccounts = AppState.State.accounts.filter(a => {
      const type = Utils.accountType(a);
      return type === 'checking' || type === 'savings' || type === 'cash' || type === 'investment';
    });
    
    // Also include Cash (CASH ID)
    const allCashAccounts = [...cashAccounts];
    if (tx.some(t => t.fromAccountId === 'CASH' || t.toAccountId === 'CASH')) {
      allCashAccounts.push({ id: 'CASH', name: 'Cash' });
    }
    
    allCashAccounts.forEach(acc => {
      let accountInflow = 0;
      let accountOutflow = 0;
      const isCash = acc.id === 'CASH'; // Define isCash outside the inner loop
      
      tx.forEach(t => {
        const usdAmount = usd(t);
        
        // Income: toAccountId matches
        if (t.transactionType === 'Income' && t.toAccountId === acc.id) {
          accountInflow += usdAmount;
        }
        // Expense: fromAccountId matches (and not credit card)
        else if (t.transactionType === 'Expense' && t.fromAccountId === acc.id) {
          accountOutflow += usdAmount;
        }
        // Credit Card Payment: fromAccountId matches
        else if (t.transactionType === 'Credit Card Payment' && t.fromAccountId === acc.id) {
          accountOutflow += usdAmount;
        }
        // Transfer: handle both from and to
        else if (t.transactionType === 'Transfer') {
          if (t.fromAccountId === acc.id) {
            accountOutflow += usdAmount;
          }
          if (t.toAccountId === acc.id) {
            accountInflow += usdAmount;
          }
        }
      });
      
      // Also check for debit card transactions
      if (!isCash && acc.debitCards && acc.debitCards.length > 0) {
        acc.debitCards.forEach(dc => {
          tx.forEach(t => {
            const usdAmount = usd(t);
            if (t.fromAccountId === dc.id && t.transactionType === 'Expense') {
              accountOutflow += usdAmount;
            }
          });
        });
      }
      
      byAccount[acc.name] = {
        inflow: accountInflow,
        outflow: accountOutflow,
        net: accountInflow - accountOutflow
      };
    });
    
    return {
      inflow: cashIn,
      outflow: cashOut,
      net: cashIn - cashOut,
      byAccount: byAccount
    };
  },

  addHeader(doc, startDate, endDate) {
    // Clean header design
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text('Personal Finance Report', 50, 50);
    
    // Period info
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Period: ${startDate} to ${endDate}`, 50, 70);
    doc.text(`Generated: ${Utils.formatDate(Utils.todayISO())}`, 50, 85);
    
    // Simple line separator
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(1);
    doc.line(50, 100, 550, 100);
    
    return 120;
  },

  addVisualElements(doc, x, y) {
    // Add some decorative boxes
    doc.setFillColor(240, 248, 255);
    doc.rect(x, y, 510, 20, 'F');
    doc.setDrawColor(74, 144, 226);
    doc.setLineWidth(1);
    doc.rect(x, y, 510, 20, 'S');
    
    doc.setFontSize(10);
    doc.setTextColor(74, 144, 226);
    doc.text('📊 Comprehensive Financial Analysis Report', x + 10, y + 14);
  },

  addExecutiveSummary(doc, data) {
    let y = 130;
    
    // Section header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text('Executive Summary', 50, y);
    
    y += 30;
    
    // Simple metrics table
    const metrics = [
      { label: 'Total Income', value: Utils.formatMoneyPreferred(data.summary.income), color: [34, 197, 94] },
      { label: 'Total Expenses', value: Utils.formatMoneyPreferred(data.summary.expenses), color: [239, 68, 68] },
      { label: 'Net Income', value: Utils.formatMoneyPreferred(data.summary.net), color: data.summary.net >= 0 ? [34, 197, 94] : [239, 68, 68] },
      { label: 'Daily Spending', value: Utils.formatMoneyPreferred(data.avgDailySpending), color: [99, 102, 241] },
      { label: 'Total Transactions', value: data.totalTransactions.toString(), color: [168, 85, 247] },
      { label: 'Financial Health', value: `${this.calculateFinancialHealthScore(data)}/100`, color: [245, 158, 11] }
    ];
    
    metrics.forEach((metric, index) => {
      // Label
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text(metric.label, 50, y);
      
      // Value
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(metric.color[0], metric.color[1], metric.color[2]);
      doc.text(metric.value, 300, y);
      
      y += 20;
    });
    
    y += 20;
    
    // Simple health score bar
    const healthScore = this.calculateFinancialHealthScore(data);
    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    doc.text('Financial Health Score:', 50, y);
    
    // Bar background
    doc.setFillColor(240, 240, 240);
    doc.rect(200, y - 8, 200, 12, 'F');
    
    // Bar fill
    const barWidth = (healthScore / 100) * 200;
    const barColor = healthScore >= 70 ? [34, 197, 94] : healthScore >= 50 ? [245, 158, 11] : [239, 68, 68];
    doc.setFillColor(barColor[0], barColor[1], barColor[2]);
    doc.rect(200, y - 8, barWidth, 12, 'F');
    
    // Bar border
    doc.setDrawColor(200, 200, 200);
    doc.rect(200, y - 8, 200, 12, 'S');
    
    // Score text
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(`${healthScore}/100`, 290, y - 1);
  },

  addProgressBar(doc, x, y, value, max, label) {
    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    doc.text(`${label}:`, x, y);
    
    // Background bar
    doc.setFillColor(230, 230, 230);
    doc.rect(x, y + 10, 200, 15, 'F');
    
    // Progress bar
    const width = (value / max) * 200;
    const color = value >= 70 ? [34, 197, 94] : value >= 50 ? [245, 158, 11] : [239, 68, 68];
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(x, y + 10, width, 15, 'F');
    
    // Border
    doc.setDrawColor(200, 200, 200);
    doc.rect(x, y + 10, 200, 15, 'S');
    
    // Value text
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(`${value}/${max}`, x + 90, y + 20);
  },

  checkPageBreak(doc, y, requiredSpace = 50) {
    if (y + requiredSpace > 750) {
      doc.addPage();
      return 50; // Return new Y position
    }
    return y;
  },

  addIncomeExpenseAnalysis(doc, data) {
    let y = 300;
    
    // Section header
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text('Income vs Expenses', 50, y);
    
    y += 30;
    
    // Income section
    doc.setFontSize(16);
    doc.setTextColor(50, 50, 50);
    doc.text('Income by Category', 40, y);
    
    y += 25;
    const incomeEntries = Object.entries(data.incomeByCategory).sort((a,b) => b[1] - a[1]);
    incomeEntries.slice(0, 5).forEach(([category, amount]) => {
      this.addCategoryBar(doc, 40, y, category, amount, data.summary.income, [34, 197, 94]);
      y += 25;
    });
    
    y += 20;
    
    // Expense section
    doc.setFontSize(16);
    doc.setTextColor(50, 50, 50);
    doc.text('Top Expense Categories', 40, y);
    
    y += 25;
    const expenseEntries = Object.entries(data.expenseByParent).sort((a,b) => b[1] - a[1]);
    expenseEntries.slice(0, 8).forEach(([category, amount]) => {
      this.addCategoryBar(doc, 40, y, category, amount, data.summary.expenses, [239, 68, 68]);
      y += 25;
    });
    
    // Add separator line
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(1);
    doc.line(40, y + 20, 550, y + 20);
  },

  addCategoryBar(doc, x, y, category, amount, total, color) {
    // Category name
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(category, x, y);
    
    // Amount
    const amountText = Utils.formatMoneyPreferred(amount);
    const amountWidth = doc.getTextWidth(amountText);
    doc.text(amountText, 500 - amountWidth, y);
    
    // Percentage
    const percentage = ((amount / total) * 100).toFixed(1);
    const percentageText = `${percentage}%`;
    const percentageWidth = doc.getTextWidth(percentageText);
    doc.text(percentageText, 450 - percentageWidth, y);
    
    // Simple bar chart
    const barWidth = (amount / total) * 200;
    const barHeight = 8;
    const barY = y - 6;
    
    // Bar background
    doc.setFillColor(240, 240, 240);
    doc.rect(x + 200, barY, 200, barHeight, 'F');
    
    // Bar fill
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(x + 200, barY, barWidth, barHeight, 'F');
    
    // Bar border
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.5);
    doc.rect(x + 200, barY, 200, barHeight, 'S');
  },

  addSpendingAnalysis(doc, data) {
    let y = 350;
    
    // Section header
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text('Spending Analysis', 50, y);
    
    y += 30;
    
    // Daily spending
    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text('Daily Spending Patterns', 50, y);
    
    y += 25;
    const dailyEntries = Object.entries(data.dailySpending).sort((a,b) => b[1] - a[1]);
    
    dailyEntries.forEach(([day, amount]) => {
      y = this.checkPageBreak(doc, y, 30);
      this.addCategoryBar(doc, 50, y, day, amount, data.summary.expenses, [99, 102, 241]);
      y += 20;
    });
    
    y += 30;
    y = this.checkPageBreak(doc, y, 50);
    
    // Account activity
    doc.setFontSize(16);
    doc.setTextColor(50, 50, 50);
    doc.text('Account Activity', 40, y);
    
    y += 25;
    Object.entries(data.accountAnalysis).forEach(([account, analysis]) => {
      if (Math.abs(analysis.net) > 0.01) {
        y = this.checkPageBreak(doc, y, 30);
        const color = analysis.net >= 0 ? [34, 197, 94] : [239, 68, 68];
        const sign = analysis.net >= 0 ? '+' : '';
        this.addCategoryBar(doc, 40, y, account, analysis.net, Math.max(...Object.values(data.accountAnalysis).map(a => Math.abs(a.net))), color);
        doc.text(sign, 40, y);
        y += 25;
      }
    });
    
    // Add separator line
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(1);
    doc.line(40, y + 20, 550, y + 20);
  },

  addBudgetAnalysis(doc, data) {
    if (data.budgetAnalysis.length === 0) return;
    
    let y = 850;
    
    // Section header
    doc.setFontSize(20);
    doc.setTextColor(30, 30, 30);
    doc.text('Budget vs Actual Analysis', 40, y);
    
    y += 30;
    
    data.budgetAnalysis.forEach(budget => {
      // Budget item box
      doc.setFillColor(248, 250, 252);
      doc.rect(40, y, 510, 80, 'F');
      doc.setDrawColor(200, 200, 200);
      doc.rect(40, y, 510, 80, 'S');
      
      // Category name
      doc.setFontSize(14);
      doc.setTextColor(30, 30, 30);
      doc.text(budget.category, 50, y + 20);
      
      // Budget details
      doc.setFontSize(12);
      doc.setTextColor(60, 60, 60);
      doc.text(`Budgeted: ${Utils.formatMoneyPreferred(budget.budgeted)}`, 50, y + 40);
      doc.text(`Actual: ${Utils.formatMoneyPreferred(budget.actual)}`, 50, y + 55);
      
      const varianceColor = budget.variance >= 0 ? [34, 197, 94] : [239, 68, 68];
      doc.setTextColor(varianceColor[0], varianceColor[1], varianceColor[2]);
      doc.text(`Variance: ${Utils.formatMoneyPreferred(budget.variance)} (${budget.variancePercent.toFixed(1)}%)`, 50, y + 70);
      
      // Status indicator
      doc.setFillColor(varianceColor[0], varianceColor[1], varianceColor[2], 0.2);
      doc.rect(450, y + 10, 80, 20, 'F');
      doc.setDrawColor(varianceColor[0], varianceColor[1], varianceColor[2]);
      doc.rect(450, y + 10, 80, 20, 'S');
      
      doc.setFontSize(10);
      doc.setTextColor(varianceColor[0], varianceColor[1], varianceColor[2]);
      doc.text(budget.status, 460, y + 23);
      
      y += 100;
    });
    
    // Add separator line
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(1);
    doc.line(40, y + 20, 550, y + 20);
  },

  addCashFlowAnalysis(doc, data) {
    let y = 1050;
    
    // Section header
    doc.setFontSize(20);
    doc.setTextColor(30, 30, 30);
    doc.text('Cash Flow Analysis', 40, y);
    
    y += 30;
    
    // Cash flow summary box
    doc.setFillColor(248, 250, 252);
    doc.rect(40, y, 510, 100, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.rect(40, y, 510, 100, 'S');
    
    y += 30;
    
    // Cash flow metrics
    const metrics = [
      { label: 'Total Cash Inflow', value: Utils.formatMoneyPreferred(data.cashFlow.inflow), color: [34, 197, 94] },
      { label: 'Total Cash Outflow', value: Utils.formatMoneyPreferred(data.cashFlow.outflow), color: [239, 68, 68] },
      { label: 'Net Cash Flow', value: Utils.formatMoneyPreferred(data.cashFlow.net), color: data.cashFlow.net >= 0 ? [34, 197, 94] : [239, 68, 68] }
    ];
    
    let x = 60;
    metrics.forEach(metric => {
      doc.setFontSize(12);
      doc.setTextColor(60, 60, 60);
      doc.text(metric.label, x, y);
      
      doc.setFontSize(16);
      // metric.color is already RGB array [r, g, b]
      doc.setTextColor(metric.color[0], metric.color[1], metric.color[2]);
      doc.text(metric.value, x, y + 20);
      
      x += 150;
    });
    
    y += 50;
    
    // Account breakdown
    doc.setFontSize(14);
    doc.setTextColor(50, 50, 50);
    doc.text('Cash Flow by Account:', 40, y);
    
    y += 25;
    Object.entries(data.cashFlow.byAccount).forEach(([account, flow]) => {
      const color = flow.net >= 0 ? [34, 197, 94] : [239, 68, 68];
      const sign = flow.net >= 0 ? '+' : '';
      this.addCategoryBar(doc, 40, y, account, flow.net, Math.max(...Object.values(data.cashFlow.byAccount).map(f => Math.abs(f.net))), color);
      doc.text(sign, 40, y);
      y += 25;
    });
    
    // Add separator line
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(1);
    doc.line(40, y + 20, 550, y + 20);
  },

  addNetWorthAnalysis(doc, data) {
    if (data.netWorthTimeline.length === 0) return;
    
    let y = 1200;
    
    // Section header
    doc.setFontSize(20);
    doc.setTextColor(30, 30, 30);
    doc.text('Net Worth Analysis', 40, y);
    
    y += 30;
    
    const startNW = data.netWorthTimeline[0]?.netWorthPreferred || data.netWorthTimeline[0]?.netWorthUSD || 0;
    const endNW = data.netWorthTimeline[data.netWorthTimeline.length - 1]?.netWorthPreferred || data.netWorthTimeline[data.netWorthTimeline.length - 1]?.netWorthUSD || 0;
    const change = endNW - startNW;
    const changePercent = startNW !== 0 ? (change / Math.abs(startNW)) * 100 : 0;
    
    // Net worth summary box
    doc.setFillColor(248, 250, 252);
    doc.rect(40, y, 510, 100, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.rect(40, y, 510, 100, 'S');
    
    y += 30;
    
    // Net worth metrics
    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    doc.text(`Starting Net Worth: ${Utils.formatMoneyPreferred(startNW)}`, 50, y);
    doc.text(`Ending Net Worth: ${Utils.formatMoneyPreferred(endNW)}`, 50, y + 20);
    
    const changeColor = change >= 0 ? [34, 197, 94] : [239, 68, 68];
    doc.setTextColor(changeColor[0], changeColor[1], changeColor[2]);
    doc.text(`Change: ${Utils.formatMoneyPreferred(change)} (${changePercent.toFixed(1)}%)`, 50, y + 40);
    
    // Add separator line
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(1);
    doc.line(40, y + 80, 550, y + 80);
  },

  addCreditCardAnalysis(doc, data) {
    if (data.creditCards.length === 0) return;
    
    let y = 1350;
    
    // Section header
    doc.setFontSize(20);
    doc.setTextColor(30, 30, 30);
    doc.text('Credit Card Analysis', 40, y);
    
    y += 30;
    
    data.creditCards.forEach(card => {
      // Credit card box
      doc.setFillColor(248, 250, 252);
      doc.rect(40, y, 510, 100, 'F');
      doc.setDrawColor(200, 200, 200);
      doc.rect(40, y, 510, 100, 'S');
      
      // Card name
      doc.setFontSize(14);
      doc.setTextColor(30, 30, 30);
      doc.text(card.name, 50, y + 20);
      
      // Card details
      doc.setFontSize(12);
      doc.setTextColor(60, 60, 60);
      doc.text(`Balance: ${Utils.formatMoneyPreferred(card.balance)}`, 50, y + 40);
      doc.text(`Limit: ${Utils.formatMoneyPreferred(card.limit)}`, 50, y + 55);
      doc.text(`Payments: ${Utils.formatMoneyPreferred(card.payments)}`, 50, y + 70);
      doc.text(`Purchases: ${Utils.formatMoneyPreferred(card.purchases)}`, 50, y + 85);
      
      // Utilization bar
      this.addProgressBar(doc, 300, y + 20, card.utilization, 100, `Utilization: ${card.utilization.toFixed(1)}%`);
      
      y += 120;
    });
    
    // Add separator line
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(1);
    doc.line(40, y + 20, 550, y + 20);
  },

  addFinancialInsights(doc, data) {
    let y = 1500;
    
    // Section header
    doc.setFontSize(20);
    doc.setTextColor(30, 30, 30);
    doc.text('Key Financial Insights', 40, y);
    
    y += 30;
    
    const insights = this.generateInsights(data);
    
    // Insights box
    doc.setFillColor(248, 250, 252);
    doc.rect(40, y, 510, insights.length * 25 + 20, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.rect(40, y, 510, insights.length * 25 + 20, 'S');
    
    y += 20;
    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    
    insights.forEach(insight => {
      doc.text(`• ${insight}`, 50, y);
      y += 25;
    });
    
    // Add separator line
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(1);
    doc.line(40, y + 20, 550, y + 20);
  },

  addRecommendations(doc, data) {
    let y = 1650;
    
    // Section header
    doc.setFontSize(20);
    doc.setTextColor(30, 30, 30);
    doc.text('Recommendations', 40, y);
    
    y += 30;
    
    const recommendations = this.generateRecommendations(data);
    
    // Recommendations box
    doc.setFillColor(248, 250, 252);
    doc.rect(40, y, 510, recommendations.length * 25 + 20, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.rect(40, y, 510, recommendations.length * 25 + 20, 'S');
    
    y += 20;
    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    
    recommendations.forEach(rec => {
      doc.text(`• ${rec}`, 50, y);
      y += 25;
    });
  },

  calculateFinancialHealthScore(data) {
    let score = 50; // Base score
    
    // Income vs Expenses ratio
    if (data.summary.income > 0) {
      const ratio = data.summary.expenses / data.summary.income;
      if (ratio < 0.5) score += 20;
      else if (ratio < 0.7) score += 10;
      else if (ratio > 1.0) score -= 30;
    }
    
    // Credit card utilization
    const avgUtilization = data.creditCards.reduce((sum, card) => sum + card.utilization, 0) / Math.max(1, data.creditCards.length);
    if (avgUtilization < 30) score += 15;
    else if (avgUtilization < 50) score += 5;
    else if (avgUtilization > 80) score -= 20;
    
    // Net worth trend
    if (data.netWorthTimeline.length > 1) {
      const start = data.netWorthTimeline[0].netWorthPreferred || data.netWorthTimeline[0].netWorthUSD || 0;
      const end = data.netWorthTimeline[data.netWorthTimeline.length - 1].netWorthPreferred || data.netWorthTimeline[data.netWorthTimeline.length - 1].netWorthUSD || 0;
      if (end > start) score += 15;
      else if (end < start) score -= 10;
    }
    
    return Math.max(0, Math.min(100, score));
  },

  generateInsights(data) {
    const insights = [];
    
    // Spending insights
    const topCategory = Object.entries(data.expenseByParent).sort((a,b) => b[1] - a[1])[0];
    if (topCategory) {
      insights.push(`Your highest spending category is ${topCategory[0]} at ${Utils.formatMoneyPreferred(topCategory[1])}`);
    }
    
    // Daily spending insights
    const highestDay = Object.entries(data.dailySpending).sort((a,b) => b[1] - a[1])[0];
    if (highestDay) {
      insights.push(`You spend most on ${highestDay[0]}s with an average of ${Utils.formatMoneyPreferred(highestDay[1])}`);
    }
    
    // Budget insights
    const overBudget = data.budgetAnalysis.filter(b => b.variance < 0);
    if (overBudget.length > 0) {
      insights.push(`You exceeded budget in ${overBudget.length} category(ies)`);
    }
    
    // Credit card insights
    const highUtilization = data.creditCards.filter(c => c.utilization > 80);
    if (highUtilization.length > 0) {
      insights.push(`${highUtilization.length} credit card(s) have high utilization (>80%)`);
    }
    
    return insights;
  },

  generateRecommendations(data) {
    const recommendations = [];
    
    // Budget recommendations
    const overBudget = data.budgetAnalysis.filter(b => b.variance < 0);
    if (overBudget.length > 0) {
      recommendations.push(`Consider adjusting budgets for categories where you consistently overspend`);
    }
    
    // Credit card recommendations
    const highUtilization = data.creditCards.filter(c => c.utilization > 80);
    if (highUtilization.length > 0) {
      recommendations.push(`Pay down high-utilization credit cards to improve credit score`);
    }
    
    // Spending recommendations
    if (data.summary.expenses > data.summary.income) {
      recommendations.push(`Focus on reducing expenses or increasing income to achieve positive cash flow`);
    }
    
    // Savings recommendations
    if (data.summary.net > 0) {
      recommendations.push(`Consider increasing your savings rate with your positive cash flow`);
    }
    
    return recommendations;
  }
};

window.PDF = PDF;