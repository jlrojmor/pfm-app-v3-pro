// excel.js — Export/Import to XLSX
const Excel = {
  exportAll(){
    const wb = XLSX.utils.book_new();
    function sheet(name, rows){ const ws = XLSX.utils.json_to_sheet(rows); XLSX.utils.book_append_sheet(wb, ws, name); }
    const s = AppState.State;
    sheet('accounts', s.accounts.map(a=>({
      id:a.id, name:a.name, accountType:a.accountType||a.type, currency:a.currency, country:a.country,
      balanceAsOfAmount:a.balanceAsOfAmount, balanceAsOfDate:a.balanceAsOfDate,
      creditLimit:a.creditLimit, nextClosingDate:a.nextClosingDate, dueDay:a.dueDay, minimumPaymentDue:a.minimumPaymentDue
    })));
    sheet('categories', s.categories.map(c=>({id:c.id, name:c.name, type:c.type, parentCategoryId:c.parentCategoryId||''})));
    // Create account ID to name mapping for export
    const accountNames = new Map(s.accounts.map(a => [a.id, a.name]));
    
    sheet('transactions', s.transactions.map(t=>({
      id:t.id, date:t.date, transactionType:t.transactionType, amount:t.amount, currency:t.currency, fxRate:t.fxRate,
      fromAccountId:t.fromAccountId, toAccountId:t.toAccountId, // Keep IDs for backward compatibility
      fromAccountName:accountNames.get(t.fromAccountId) || '', toAccountName:accountNames.get(t.toAccountId) || '', // Add readable names
      categoryId:t.categoryId, description:t.description,
      isDeferred:t.isDeferred || false, deferredMonths:t.deferredMonths || 0, remainingMonths:t.remainingMonths || 0, monthlyPaymentAmount:t.monthlyPaymentAmount || 0
    })));
    sheet('budgets', s.budgets.map(b=>({ 
      id:b.id, 
      type:b.type, 
      categoryId:b.categoryId, 
      amount:b.amount,
      currency:b.currency || 'USD',
      fxRate:b.fxRate || 1,
      cadence:b.cadence || 'monthly',
      anchorDate:b.anchorDate,
      repeatUntil:b.repeatUntil || '',
      createdAt:b.createdAt
    })));
    sheet('snapshots', s.snapshots.map(x=>({ id:x.id, date:x.date, netWorthUSD:x.netWorthUSD })));
    sheet('fxRates', s.fxRates.map(x=>({ date:x.date, usdPerMXN:x.usdPerMXN })));
    sheet('settings', [s.settings]);
    XLSX.writeFile(wb, 'pfm-data-export.xlsx');
  },
  async importAll(file){
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type:'array' });
    function rows(name){ const ws = wb.Sheets[name]; if(!ws) return []; return XLSX.utils.sheet_to_json(ws); }
    const accounts = rows('accounts').map(r=> AppState.normalizeAccount({
      id: r.id || crypto.randomUUID(),
      name: r.name || '',
      accountType: r.accountType || r.type || 'checking',
      currency: r.currency || 'USD',
      country: r.country || 'USA',
      balanceAsOfAmount: Number(r.balanceAsOfAmount||0),
      balanceAsOfDate: r.balanceAsOfDate || Utils.todayISO(),
      creditLimit: Number(r.creditLimit||0),
      nextClosingDate: r.nextClosingDate || '',
      dueDay: (r.dueDay===''||r.dueDay===null||typeof r.dueDay==='undefined')? null : Number(r.dueDay),
      minimumPaymentDue: Number(r.minimumPaymentDue||0)
    }));
    const categories = rows('categories').map(r=>({
      id: r.id || crypto.randomUUID(),
      name: r.name || '',
      type: (r.type||'expense').toLowerCase(),
      parentCategoryId: r.parentCategoryId || ''
    }));
    // Create account name to ID mapping
    const accountsByName = new Map(accounts.map(a => [a.name.toLowerCase(), a.id]));
    
    const transactions = rows('transactions').map(r=>{
      // Map account names to IDs if they exist, otherwise use the provided IDs
      const fromAccountId = r.fromAccountName ? 
        (accountsByName.get(r.fromAccountName.toLowerCase()) || '') : 
        (r.fromAccountId || '');
      const toAccountId = r.toAccountName ? 
        (accountsByName.get(r.toAccountName.toLowerCase()) || '') : 
        (r.toAccountId || '');
      
      return {
        id: r.id || crypto.randomUUID(),
        date: r.date || Utils.todayISO(),
        transactionType: r.transactionType || 'Expense',
        amount: Number(r.amount||0),
        currency: r.currency || 'USD',
        fxRate: Number(r.fxRate||1),
        fromAccountId: fromAccountId,
        toAccountId: toAccountId,
        categoryId: r.categoryId || '',
        description: r.description || '',
        isDeferred: Boolean(r.isDeferred) || false,
        deferredMonths: Number(r.deferredMonths||0),
        remainingMonths: Number(r.remainingMonths||0),
        monthlyPaymentAmount: Number(r.monthlyPaymentAmount||0)
      };
    });
    const budgets = rows('budgets').map(r=>({
      id: r.id || crypto.randomUUID(),
      type: (r.type||'expense').toLowerCase(),
      categoryId: r.categoryId || '',
      amount: Number(r.amount||0),
      currency: r.currency || 'USD',
      fxRate: Number(r.fxRate||1),
      cadence: r.cadence || 'monthly',
      anchorDate: r.anchorDate || Utils.todayISO(),
      repeatUntil: r.repeatUntil || '',
      createdAt: r.createdAt || Utils.todayISO()
    }));
    const snapshots = rows('snapshots').map(r=>({ id: r.id||crypto.randomUUID(), date: r.date||Utils.todayISO(), netWorthUSD: Number(r.netWorthUSD||0)}));
    const fxRates = rows('fxRates').map(r=>({ date: r.date||Utils.todayISO(), usdPerMXN: Number(r.usdPerMXN||0.055)}));
    const settings = rows('settings')[0] || {};
    AppState.State.accounts = accounts;
    AppState.State.categories = categories;
    AppState.State.transactions = transactions;
    AppState.State.budgets = budgets;
    AppState.State.snapshots = snapshots;
    AppState.State.fxRates = fxRates;
    AppState.State.settings = Object.assign(AppState.State.settings, settings);
    await AppState.saveAll();
    alert('Import complete. Reloading...');
    location.reload();
  }
};
window.Excel = Excel;
