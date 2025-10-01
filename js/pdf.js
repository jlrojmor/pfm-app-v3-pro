// pdf.js — Export a comprehensive insights PDF with visual elements
const PDF = {
  // Helper function to convert hex color to RGB
  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  },

  async generateReport({ startDate, endDate }){
    console.log('🟢 PDF.generateReport called with:', { startDate, endDate });
    console.log('🟢 window.jspdf:', window.jspdf);
    
    const { jsPDF } = window.jspdf || {};
    if(!jsPDF){ 
      console.error('🟢 jsPDF not available');
      alert('PDF library not loaded yet. Try again in a moment.'); 
      return; 
    }
    
    console.log('🟢 jsPDF available, creating document...');
    
    try {
      await Utils.ensureTodayFX();
      console.log('🟢 FX rates ensured');
      
      const doc = new jsPDF({ unit:'pt', format:'letter' });
      console.log('🟢 PDF document created');
      
      const tx = AppState.State.transactions.filter(t=> Utils.within(t.date, startDate, endDate));
      console.log('🟢 Filtered transactions:', tx.length);
      
      const usd = (t)=> t.currency==='USD'?Number(t.amount):Number(t.amount)*Number(t.fxRate||1);
      
      // Calculate comprehensive financial data
      console.log('🟢 Calculating financial data...');
      const financialData = this.calculateFinancialData(tx, usd, startDate, endDate);
      console.log('🟢 Financial data calculated:', financialData);
      
      // Generate the report with proper spacing
      console.log('🟢 Adding header...');
      this.addHeader(doc, startDate, endDate);
      
      console.log('🟢 Adding executive summary...');
      this.addExecutiveSummary(doc, financialData);
      
      console.log('🟢 Adding income/expense analysis...');
      this.addIncomeExpenseAnalysis(doc, financialData);
      
      console.log('🟢 Adding spending analysis...');
      this.addSpendingAnalysis(doc, financialData);
      
      console.log('🟢 Adding budget analysis...');
      this.addBudgetAnalysis(doc, financialData);
      
      console.log('🟢 Adding cash flow analysis...');
      this.addCashFlowAnalysis(doc, financialData);
      
      console.log('🟢 Adding net worth analysis...');
      this.addNetWorthAnalysis(doc, financialData);
      
      console.log('🟢 Adding credit card analysis...');
      this.addCreditCardAnalysis(doc, financialData);
      
      console.log('🟢 Adding financial insights...');
      this.addFinancialInsights(doc, financialData);
      
      console.log('🟢 Adding recommendations...');
      this.addRecommendations(doc, financialData);

      console.log('🟢 Saving PDF...');
      doc.save(`comprehensive-finance-report-${startDate}-to-${endDate}.pdf`);
      console.log('🟢 PDF saved successfully!');
      
    } catch (error) {
      console.error('🟢 Error in PDF generation:', error);
      console.error('🟢 Error stack:', error.stack);
      throw error;
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
    // Title
    doc.setFontSize(28);
    doc.setTextColor(30, 30, 30);
    doc.text('Personal Finance Report', 40, 60);
    
    // Period info
    doc.setFontSize(16);
    doc.setTextColor(80, 80, 80);
    doc.text(`Period: ${startDate} to ${endDate}`, 40, 90);
    
    // Generated date
    doc.setFontSize(12);
    doc.setTextColor(120, 120, 120);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 40, 110);
    
    // Decorative line
    doc.setDrawColor(74, 144, 226);
    doc.setLineWidth(3);
    doc.line(40, 120, 550, 120);
    
    // Add some visual elements
    this.addVisualElements(doc, 40, 130);
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
    let y = 180;
    
    // Section header
    doc.setFontSize(20);
    doc.setTextColor(30, 30, 30);
    doc.text('Executive Summary', 40, y);
    
    // Summary box
    doc.setFillColor(248, 250, 252);
    doc.rect(40, y + 10, 510, 120, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(1);
    doc.rect(40, y + 10, 510, 120, 'S');
    
    y += 40;
    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    
    // Key metrics in a grid
    const metrics = [
      { label: 'Total Income', value: Utils.formatMoneyUSD(data.summary.income), color: [34, 197, 94] },
      { label: 'Total Expenses', value: Utils.formatMoneyUSD(data.summary.expenses), color: [239, 68, 68] },
      { label: 'Net Income', value: Utils.formatMoneyUSD(data.summary.net), color: data.summary.net >= 0 ? [34, 197, 94] : [239, 68, 68] },
      { label: 'Daily Spending', value: Utils.formatMoneyUSD(data.avgDailySpending), color: [99, 102, 241] },
      { label: 'Transactions', value: data.totalTransactions.toString(), color: [168, 85, 247] },
      { label: 'Health Score', value: `${this.calculateFinancialHealthScore(data)}/100`, color: [245, 158, 11] }
    ];
    
    let x = 60;
    metrics.forEach((metric, index) => {
      if (index % 3 === 0 && index > 0) {
        x = 60;
        y += 50;
      }
      
      // Metric box
      doc.setFillColor(255, 255, 255);
      doc.rect(x, y, 140, 35, 'F');
      doc.setDrawColor(220, 220, 220);
      doc.rect(x, y, 140, 35, 'S');
      
      // Label
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(metric.label, x + 8, y + 15);
      
      // Value
      doc.setFontSize(16);
      // Convert hex color to RGB for jsPDF
      const rgbColor = this.hexToRgb(metric.color);
      doc.setTextColor(rgbColor.r, rgbColor.g, rgbColor.b);
      doc.text(metric.value, x + 8, y + 30);
      
      x += 150;
    });
    
    // Add progress bar for health score
    y += 60;
    this.addProgressBar(doc, 60, y, this.calculateFinancialHealthScore(data), 100, 'Financial Health');
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

  addIncomeExpenseAnalysis(doc, data) {
    let y = 350;
    
    // Section header
    doc.setFontSize(20);
    doc.setTextColor(30, 30, 30);
    doc.text('Income vs Expenses Analysis', 40, y);
    
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
    doc.setFontSize(12);
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
    
    // Visual bar
    const barWidth = (amount / total) * 200;
    doc.setFillColor(color[0], color[1], color[2], 0.3);
    doc.rect(x + 200, y - 8, barWidth, 12, 'F');
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.rect(x + 200, y - 8, barWidth, 12, 'S');
  },

  addSpendingAnalysis(doc, data) {
    let y = 650;
    
    // Section header
    doc.setFontSize(20);
    doc.setTextColor(30, 30, 30);
    doc.text('Spending Patterns Analysis', 40, y);
    
    y += 30;
    
    // Daily spending
    doc.setFontSize(16);
    doc.setTextColor(50, 50, 50);
    doc.text('Daily Spending Patterns', 40, y);
    
    y += 25;
    const dailyEntries = Object.entries(data.dailySpending).sort((a,b) => b[1] - a[1]);
    const maxDaily = Math.max(...dailyEntries.map(([_, amount]) => amount));
    
    dailyEntries.forEach(([day, amount]) => {
      this.addCategoryBar(doc, 40, y, day, amount, maxDaily, [99, 102, 241]);
      y += 25;
    });
    
    y += 30;
    
    // Account activity
    doc.setFontSize(16);
    doc.setTextColor(50, 50, 50);
    doc.text('Account Activity', 40, y);
    
    y += 25;
    Object.entries(data.accountAnalysis).forEach(([account, analysis]) => {
      if (Math.abs(analysis.net) > 0.01) {
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
    doc.setTextColor(changeColor);
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