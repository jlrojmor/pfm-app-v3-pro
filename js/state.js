// state.js — in-memory app state + helpers (V5)
const AppState = (function(){
  const State = {
    accounts: [],
    categories: [],
    transactions: [],
    budgets: [],
    snapshots: [],
    fxRates: [],
    settings: {
      fiscalStartDay: 1,
      manualUsdPerMXN: null,
      useManualFx: false,
      fxApiKey: '',
      defaultTxnDateMode: 'today',
      lastTxnDate: null
    }
  };

  function guid(){ return crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)); }

  function normalizeAccount(a){
    const out = { ...a };
    out.accountType = a.accountType || a.type || 'checking';
    out.type = out.accountType.replace('-', '_'); // legacy callers
    out.currency = a.currency || 'USD';
    out.country = a.country || 'USA';
    return out;
  }

  function newAccount(){
    return normalizeAccount({
      id: guid(),
      name: '',
      accountType: 'checking',
      currency: 'USD',
      country: 'USA',
      balanceAsOfAmount: 0,
      balanceAsOfDate: Utils.todayISO(),
      creditLimit: 0,
      nextClosingDate: '',
      dueDay: null,
      minimumPaymentDue: 0
    });
  }

  function newTransaction(){
    return {
      id: guid(),
      date: Utils.todayISO(),
      transactionType: 'Expense',
      amount: 0,
      currency: 'USD',
      fxRate: 1,
      fromAccountId: '',
      toAccountId: '',
      categoryId: '',
      description: ''
    };
  }

  function newBudget(){
    return {
      id: guid(),
      type: 'expense', // or 'income'
      period: 'custom',
      startDate: Utils.todayISO(),
      endDate: Utils.todayISO(),
      categoryId: '',
      amount: 0
    };
  }

  function newSnapshot(){
    return {
      id: guid(),
      date: Utils.todayISO(),
      netWorthUSD: 0
    };
  }

  function newFxRate(date, usdPerMXN){
    return { date, usdPerMXN: Number(usdPerMXN||0.055) };
  }

  async function loadAll(){
    await PFMDB.dbInit();
    const keys = ['accounts','categories','transactions','budgets','snapshots','fxRates','settings'];
    for (const key of keys){
      const val = await PFMDB.get('pfm:'+key);
      if (val){
        State[key] = val;
      }
    }
    // Safety: normalize any accounts loaded from older exports
    State.accounts = State.accounts.map(normalizeAccount);
  }

  async function saveAll(){
    const keys = ['accounts','categories','transactions','budgets','snapshots','fxRates','settings'];
    for (const key of keys){
      await PFMDB.set('pfm:'+key, State[key]);
    }
  }

  async function saveItem(kind, obj, collectionKey){
    const arr = State[collectionKey] || State[kind] || [];
    const idx = arr.findIndex(x=> x.id===obj.id);
    if (idx>=0) arr[idx] = obj; else arr.push(obj);
    State[collectionKey] = arr;
    await PFMDB.set('pfm:'+collectionKey, arr);
  }

  async function deleteItem(kind, id, collectionKey){
    const arr = State[collectionKey] || State[kind] || [];
    const next = arr.filter(x=> x.id!==id);
    State[collectionKey] = next;
    await PFMDB.set('pfm:'+collectionKey, next);
  }

  return {
    State,
    normalizeAccount,
    newAccount, newTransaction, newBudget, newSnapshot, newFxRate,
    loadAll, saveAll, saveItem, deleteItem
  };
})();
window.AppState = AppState;
