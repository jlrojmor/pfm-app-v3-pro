// pdf.js — Single-page comprehensive PDF report
const PDF = {
  // Number formatting utilities
  fmtMoney(n) { 
    return (n ?? 0).toLocaleString(undefined, {style:'currency', currency:'USD', maximumFractionDigits:2}); 
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
      
      const tx = AppState.State.transactions.filter(t=> Utils.within(t.date, startDate, endDate));
      console.log('🟢 Filtered transactions:', tx.length);
      
      const usd = (t)=> t.currency==='USD'?Number(t.amount):Number(t.amount)*Number(t.fxRate||1);
      
      // Calculate comprehensive financial data
      console.log('🟢 Calculating financial data...');
      const financialData = this.calculateFinancialData(tx, usd, startDate, endDate);
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
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 50, 85);
      
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
        
        // Percentage
        const percentageText = this.fmtPct(percentage);
        const percentageWidth = doc.getTextWidth(percentageText);
        doc.text(percentageText, 450 - percentageWidth, y);
        
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
    // Basic calculations
    const income = tx.filter(t=>t.transactionType==='Income').reduce((s,t)=>s+usd(t),0);
    const expenses = tx.filter(t=>t.transactionType==='Expense').reduce((s,t)=>s+usd(t),0);
    const net = income - expenses;
    
    // Income analysis
    const incomeByCategory = {};
    tx.filter(t=>t.transactionType==='Income').forEach(t=>{
      const cat = Utils.categoryById(t.categoryId)?.name || 'Uncategorized';
      incomeByCategory[cat] = (incomeByCategory[cat]||0) + usd(t);
    });
    
    // Expense analysis
    const expenseByCategory = {};
    const expenseByParent = {};
    tx.filter(t=>t.transactionType==='Expense').forEach(t=>{
      const cat = Utils.categoryById(t.categoryId);
      const parent = Utils.parentCategoryName(t.categoryId);
      const amount = usd(t);
      
      if (cat) expenseByCategory[cat.name] = (expenseByCategory[cat.name]||0) + amount;
      expenseByParent[parent] = (expenseByParent[parent]||0) + amount;
    });
    
    // Daily spending patterns
    const dailySpending = {};
    tx.filter(t=>t.transactionType==='Expense').forEach(t=>{
      const day = new Date(t.date).getDay();
      const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day];
      dailySpending[dayName] = (dailySpending[dayName]||0) + usd(t);
    });
    
    // Account analysis
    const accountAnalysis = {};
    AppState.State.accounts.forEach(acc => {
      const accountTx = tx.filter(t => t.fromAccountId === acc.id || t.toAccountId === acc.id);
      const inflow = accountTx.filter(t => t.toAccountId === acc.id).reduce((s,t) => s + usd(t), 0);
      const outflow = accountTx.filter(t => t.fromAccountId === acc.id).reduce((s,t) => s + usd(t), 0);
      accountAnalysis[acc.name] = { inflow, outflow, net: inflow - outflow };
    });
    
    // Credit card analysis
    const creditCards = AppState.State.accounts.filter(a => Utils.accountType(a) === 'credit-card');
    const ccAnalysis = creditCards.map(card => ({
      name: card.name,
      balance: Utils.currentBalanceUSD(card),
      limit: Utils.creditLimitUSD(card),
      utilization: Utils.creditLimitUSD(card) > 0 ? (Utils.currentBalanceUSD(card) / Utils.creditLimitUSD(card)) * 100 : 0,
      payments: tx.filter(t => t.transactionType === 'Credit Card Payment' && t.toAccountId === card.id).reduce((s,t) => s + usd(t), 0),
      purchases: tx.filter(t => t.fromAccountId === card.id && t.transactionType === 'Expense').reduce((s,t) => s + usd(t), 0)
    }));
    
    // Budget analysis
    const budgetAnalysis = this.analyzeBudgets(tx, usd, startDate, endDate);
    
    // Net worth analysis
    const netWorthTimeline = Utils.netWorthTimeline();
    const periodNetWorth = netWorthTimeline.filter(nw => 
      nw.date >= startDate && nw.date <= endDate
    );
    
    // Cash flow analysis
    const cashFlow = this.analyzeCashFlow(tx, usd);
    
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
      totalTransactions: tx.length,
      avgDailySpending: expenses / Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)))
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
    document.getElementById('report-generated').textContent = `Generated: ${new Date().toLocaleDateString()}`;
    
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
                <span style="font-size: 11px; color: var(--muted);">${this.fmtPct(percentage)}</span>
                <span style="font-weight: 600; margin-left: 8px;">${this.fmtMoney(amount)}</span>
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
                  <span style="font-size: 11px; color: var(--muted);">${this.fmtPct(percentage)}</span>
                  <span style="font-weight: 600; margin-left: 8px;">${this.fmtMoney(amount)}</span>
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
                  <span style="font-size: 11px; color: var(--muted);">${this.fmtPct(percentage)}</span>
                  <span style="font-weight: 600; margin-left: 8px;">${this.fmtMoney(amount)}</span>
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

  analyzeBudgets(tx, usd, startDate, endDate) {
    const budgets = AppState.State.budgets || [];
    const analysis = [];
    
    budgets.forEach(budget => {
      const budgetTx = tx.filter(t => 
        t.categoryId === budget.categoryId && 
        t.transactionType === 'Expense'
      );
      const actual = budgetTx.reduce((s,t) => s + usd(t), 0);
      const variance = budget.amount - actual;
      const variancePercent = budget.amount > 0 ? (variance / budget.amount) * 100 : 0;
      
      analysis.push({
        category: Utils.categoryById(budget.categoryId)?.name || 'Unknown',
        budgeted: budget.amount,
        actual,
        variance,
        variancePercent,
        status: variance >= 0 ? 'Under Budget' : 'Over Budget'
      });
    });
    
    return analysis.sort((a,b) => Math.abs(b.variance) - Math.abs(a.variance));
  },

  analyzeCashFlow(tx, usd) {
    const cashAccounts = AppState.State.accounts.filter(a => 
      ['checking', 'savings', 'cash'].includes(Utils.accountType(a))
    );
    
    const cashFlow = {
      inflow: 0,
      outflow: 0,
      net: 0,
      byAccount: {}
    };
    
    cashAccounts.forEach(acc => {
      const inflow = tx.filter(t => t.toAccountId === acc.id).reduce((s,t) => s + usd(t), 0);
      const outflow = tx.filter(t => t.fromAccountId === acc.id).reduce((s,t) => s + usd(t), 0);
      const net = inflow - outflow;
      
      cashFlow.inflow += inflow;
      cashFlow.outflow += outflow;
      cashFlow.byAccount[acc.name] = { inflow, outflow, net };
    });
    
    cashFlow.net = cashFlow.inflow - cashFlow.outflow;
    return cashFlow;
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
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 50, 85);
    
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
      { label: 'Total Income', value: Utils.formatMoneyUSD(data.summary.income), color: [34, 197, 94] },
      { label: 'Total Expenses', value: Utils.formatMoneyUSD(data.summary.expenses), color: [239, 68, 68] },
      { label: 'Net Income', value: Utils.formatMoneyUSD(data.summary.net), color: data.summary.net >= 0 ? [34, 197, 94] : [239, 68, 68] },
      { label: 'Daily Spending', value: Utils.formatMoneyUSD(data.avgDailySpending), color: [99, 102, 241] },
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
    const amountText = Utils.formatMoneyUSD(amount);
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
      doc.text(`Budgeted: ${Utils.formatMoneyUSD(budget.budgeted)}`, 50, y + 40);
      doc.text(`Actual: ${Utils.formatMoneyUSD(budget.actual)}`, 50, y + 55);
      
      const varianceColor = budget.variance >= 0 ? [34, 197, 94] : [239, 68, 68];
      doc.setTextColor(varianceColor[0], varianceColor[1], varianceColor[2]);
      doc.text(`Variance: ${Utils.formatMoneyUSD(budget.variance)} (${budget.variancePercent.toFixed(1)}%)`, 50, y + 70);
      
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
      { label: 'Total Cash Inflow', value: Utils.formatMoneyUSD(data.cashFlow.inflow), color: [34, 197, 94] },
      { label: 'Total Cash Outflow', value: Utils.formatMoneyUSD(data.cashFlow.outflow), color: [239, 68, 68] },
      { label: 'Net Cash Flow', value: Utils.formatMoneyUSD(data.cashFlow.net), color: data.cashFlow.net >= 0 ? [34, 197, 94] : [239, 68, 68] }
    ];
    
    let x = 60;
    metrics.forEach(metric => {
      doc.setFontSize(12);
      doc.setTextColor(60, 60, 60);
      doc.text(metric.label, x, y);
      
      doc.setFontSize(16);
      // Convert hex color to RGB for jsPDF
      const rgbColor = this.hexToRgb(metric.color);
      doc.setTextColor(rgbColor.r, rgbColor.g, rgbColor.b);
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
    
    const startNW = data.netWorthTimeline[0]?.netWorthUSD || 0;
    const endNW = data.netWorthTimeline[data.netWorthTimeline.length - 1]?.netWorthUSD || 0;
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
    doc.text(`Starting Net Worth: ${Utils.formatMoneyUSD(startNW)}`, 50, y);
    doc.text(`Ending Net Worth: ${Utils.formatMoneyUSD(endNW)}`, 50, y + 20);
    
    const changeColor = change >= 0 ? [34, 197, 94] : [239, 68, 68];
    doc.setTextColor(changeColor[0], changeColor[1], changeColor[2]);
    doc.text(`Change: ${Utils.formatMoneyUSD(change)} (${changePercent.toFixed(1)}%)`, 50, y + 40);
    
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
      doc.text(`Balance: ${Utils.formatMoneyUSD(card.balance)}`, 50, y + 40);
      doc.text(`Limit: ${Utils.formatMoneyUSD(card.limit)}`, 50, y + 55);
      doc.text(`Payments: ${Utils.formatMoneyUSD(card.payments)}`, 50, y + 70);
      doc.text(`Purchases: ${Utils.formatMoneyUSD(card.purchases)}`, 50, y + 85);
      
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
      const start = data.netWorthTimeline[0].netWorthUSD;
      const end = data.netWorthTimeline[data.netWorthTimeline.length - 1].netWorthUSD;
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
      insights.push(`Your highest spending category is ${topCategory[0]} at ${Utils.formatMoneyUSD(topCategory[1])}`);
    }
    
    // Daily spending insights
    const highestDay = Object.entries(data.dailySpending).sort((a,b) => b[1] - a[1])[0];
    if (highestDay) {
      insights.push(`You spend most on ${highestDay[0]}s with an average of ${Utils.formatMoneyUSD(highestDay[1])}`);
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