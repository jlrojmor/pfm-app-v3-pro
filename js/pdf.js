// pdf.js — Export a comprehensive insights PDF
const PDF = {
  async generateReport({ startDate, endDate }){
    const { jsPDF } = window.jspdf || {};
    if(!jsPDF){ alert('PDF library not loaded yet. Try again in a moment.'); return; }
    
    await Utils.ensureTodayFX();
    const doc = new jsPDF({ unit:'pt', format:'letter' });
    const tx = AppState.State.transactions.filter(t=> Utils.within(t.date, startDate, endDate));
    const usd = (t)=> t.currency==='USD'?Number(t.amount):Number(t.amount)*Number(t.fxRate||1);
    
    // Calculate comprehensive financial data
    const financialData = this.calculateFinancialData(tx, usd, startDate, endDate);
    
    // Generate the report
    this.addHeader(doc, startDate, endDate);
    this.addExecutiveSummary(doc, financialData);
    this.addIncomeExpenseAnalysis(doc, financialData);
    this.addSpendingAnalysis(doc, financialData);
    this.addBudgetAnalysis(doc, financialData);
    this.addCashFlowAnalysis(doc, financialData);
    this.addNetWorthAnalysis(doc, financialData);
    this.addCreditCardAnalysis(doc, financialData);
    this.addFinancialInsights(doc, financialData);
    this.addRecommendations(doc, financialData);

    doc.save(`comprehensive-finance-report-${startDate}-to-${endDate}.pdf`);
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
    doc.setFontSize(24);
    doc.setTextColor(40, 40, 40);
    doc.text('Personal Finance Report', 40, 50);
    
    doc.setFontSize(14);
    doc.setTextColor(100, 100, 100);
    doc.text(`Period: ${startDate} to ${endDate}`, 40, 80);
    
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 40, 100);
    
    // Add a line separator
    doc.setDrawColor(200, 200, 200);
    doc.line(40, 110, 550, 110);
  },

  addExecutiveSummary(doc, data) {
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text('Executive Summary', 40, 140);
    
    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    
    const y = 170;
    doc.text(`Total Income: ${Utils.formatMoneyUSD(data.summary.income)}`, 40, y);
    doc.text(`Total Expenses: ${Utils.formatMoneyUSD(data.summary.expenses)}`, 40, y + 20);
    doc.text(`Net Income: ${Utils.formatMoneyUSD(data.summary.net)}`, 40, y + 40);
    doc.text(`Average Daily Spending: ${Utils.formatMoneyUSD(data.avgDailySpending)}`, 40, y + 60);
    doc.text(`Total Transactions: ${data.totalTransactions}`, 40, y + 80);
    
    // Financial health indicator
    const healthScore = this.calculateFinancialHealthScore(data);
    doc.text(`Financial Health Score: ${healthScore}/100`, 40, y + 100);
    
    // Add line separator
    doc.setDrawColor(200, 200, 200);
    doc.line(40, y + 120, 550, y + 120);
  },

  addIncomeExpenseAnalysis(doc, data) {
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text('Income vs Expenses Analysis', 40, 320);
    
    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    
    let y = 350;
    
    // Income breakdown
    doc.text('Income by Category:', 40, y);
    y += 20;
    const incomeEntries = Object.entries(data.incomeByCategory).sort((a,b) => b[1] - a[1]);
    incomeEntries.slice(0, 5).forEach(([category, amount]) => {
      doc.text(`• ${category}: ${Utils.formatMoneyUSD(amount)}`, 50, y);
      y += 18;
    });
    
    y += 20;
    
    // Expense breakdown
    doc.text('Top Expense Categories:', 40, y);
    y += 20;
    const expenseEntries = Object.entries(data.expenseByParent).sort((a,b) => b[1] - a[1]);
    expenseEntries.slice(0, 8).forEach(([category, amount]) => {
      const percentage = (amount / data.summary.expenses) * 100;
      doc.text(`• ${category}: ${Utils.formatMoneyUSD(amount)} (${percentage.toFixed(1)}%)`, 50, y);
      y += 18;
    });
    
    // Add line separator
    doc.setDrawColor(200, 200, 200);
    doc.line(40, y + 20, 550, y + 20);
  },

  addSpendingAnalysis(doc, data) {
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text('Spending Patterns Analysis', 40, 520);
    
    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    
    let y = 550;
    
    // Daily spending patterns
    doc.text('Daily Spending Patterns:', 40, y);
    y += 20;
    const dailyEntries = Object.entries(data.dailySpending).sort((a,b) => b[1] - a[1]);
    dailyEntries.forEach(([day, amount]) => {
      doc.text(`• ${day}: ${Utils.formatMoneyUSD(amount)}`, 50, y);
      y += 18;
    });
    
    y += 20;
    
    // Account analysis
    doc.text('Account Activity:', 40, y);
    y += 20;
    Object.entries(data.accountAnalysis).forEach(([account, analysis]) => {
      if (Math.abs(analysis.net) > 0.01) {
        doc.text(`• ${account}: Net ${analysis.net >= 0 ? '+' : ''}${Utils.formatMoneyUSD(analysis.net)}`, 50, y);
        y += 18;
      }
    });
    
    // Add line separator
    doc.setDrawColor(200, 200, 200);
    doc.line(40, y + 20, 550, y + 20);
  },

  addBudgetAnalysis(doc, data) {
    if (data.budgetAnalysis.length === 0) return;
    
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text('Budget vs Actual Analysis', 40, 700);
    
    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    
    let y = 730;
    
    data.budgetAnalysis.forEach(budget => {
      doc.text(`${budget.category}:`, 40, y);
      doc.text(`  Budgeted: ${Utils.formatMoneyUSD(budget.budgeted)}`, 50, y + 18);
      doc.text(`  Actual: ${Utils.formatMoneyUSD(budget.actual)}`, 50, y + 36);
      doc.text(`  Variance: ${Utils.formatMoneyUSD(budget.variance)} (${budget.variancePercent.toFixed(1)}%)`, 50, y + 54);
      doc.text(`  Status: ${budget.status}`, 50, y + 72);
      y += 100;
    });
    
    // Add line separator
    doc.setDrawColor(200, 200, 200);
    doc.line(40, y + 20, 550, y + 20);
  },

  addCashFlowAnalysis(doc, data) {
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text('Cash Flow Analysis', 40, 800);
    
    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    
    let y = 830;
    
    doc.text(`Total Cash Inflow: ${Utils.formatMoneyUSD(data.cashFlow.inflow)}`, 40, y);
    doc.text(`Total Cash Outflow: ${Utils.formatMoneyUSD(data.cashFlow.outflow)}`, 40, y + 20);
    doc.text(`Net Cash Flow: ${Utils.formatMoneyUSD(data.cashFlow.net)}`, 40, y + 40);
    
    y += 80;
    
    doc.text('Cash Flow by Account:', 40, y);
    y += 20;
    Object.entries(data.cashFlow.byAccount).forEach(([account, flow]) => {
      doc.text(`• ${account}: ${Utils.formatMoneyUSD(flow.net)}`, 50, y);
      y += 18;
    });
    
    // Add line separator
    doc.setDrawColor(200, 200, 200);
    doc.line(40, y + 20, 550, y + 20);
  },

  addNetWorthAnalysis(doc, data) {
    if (data.netWorthTimeline.length === 0) return;
    
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text('Net Worth Analysis', 40, 1000);
    
    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    
    let y = 1030;
    
    const startNW = data.netWorthTimeline[0]?.netWorthUSD || 0;
    const endNW = data.netWorthTimeline[data.netWorthTimeline.length - 1]?.netWorthUSD || 0;
    const change = endNW - startNW;
    const changePercent = startNW !== 0 ? (change / Math.abs(startNW)) * 100 : 0;
    
    doc.text(`Starting Net Worth: ${Utils.formatMoneyUSD(startNW)}`, 40, y);
    doc.text(`Ending Net Worth: ${Utils.formatMoneyUSD(endNW)}`, 40, y + 20);
    doc.text(`Change: ${Utils.formatMoneyUSD(change)} (${changePercent.toFixed(1)}%)`, 40, y + 40);
    
    y += 80;
    
    doc.text('Net Worth Timeline:', 40, y);
    y += 20;
    data.netWorthTimeline.slice(-6).forEach(point => {
      doc.text(`• ${point.date}: ${Utils.formatMoneyUSD(point.netWorthUSD)}`, 50, y);
      y += 18;
    });
    
    // Add line separator
    doc.setDrawColor(200, 200, 200);
    doc.line(40, y + 20, 550, y + 20);
  },

  addCreditCardAnalysis(doc, data) {
    if (data.creditCards.length === 0) return;
    
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text('Credit Card Analysis', 40, 1200);
    
    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    
    let y = 1230;
    
    data.creditCards.forEach(card => {
      doc.text(`${card.name}:`, 40, y);
      doc.text(`  Current Balance: ${Utils.formatMoneyUSD(card.balance)}`, 50, y + 18);
      doc.text(`  Credit Limit: ${Utils.formatMoneyUSD(card.limit)}`, 50, y + 36);
      doc.text(`  Utilization: ${card.utilization.toFixed(1)}%`, 50, y + 54);
      doc.text(`  Payments Made: ${Utils.formatMoneyUSD(card.payments)}`, 50, y + 72);
      doc.text(`  New Purchases: ${Utils.formatMoneyUSD(card.purchases)}`, 50, y + 90);
      y += 120;
    });
    
    // Add line separator
    doc.setDrawColor(200, 200, 200);
    doc.line(40, y + 20, 550, y + 20);
  },

  addFinancialInsights(doc, data) {
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text('Key Financial Insights', 40, 1400);
    
    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    
    let y = 1430;
    const insights = this.generateInsights(data);
    
    insights.forEach(insight => {
      doc.text(`• ${insight}`, 40, y);
      y += 20;
    });
    
    // Add line separator
    doc.setDrawColor(200, 200, 200);
    doc.line(40, y + 20, 550, y + 20);
  },

  addRecommendations(doc, data) {
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text('Recommendations', 40, 1600);
    
    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    
    let y = 1630;
    const recommendations = this.generateRecommendations(data);
    
    recommendations.forEach(rec => {
      doc.text(`• ${rec}`, 40, y);
      y += 20;
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
