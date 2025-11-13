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
      lastTxnDate: null,
      // Date and number formatting preferences
      dateFormat: 'US', // 'US' or 'MX'
      numberFormat: 'US', // 'US' or 'MX' 
      currencyFormat: 'US' // 'US' or 'MX'
    }
  };

  function guid(){ return crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)); }

  function normalizeAccount(a){
    const out = { ...a };
    out.accountType = a.accountType || a.type || 'checking';
    out.type = out.accountType.replace('-', '_'); // legacy callers
    out.currency = a.currency || 'USD';
    out.country = a.country || 'USA';
    // Debit cards as sub-items of checking accounts
    out.debitCards = a.debitCards || [];
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
      paymentDueDate: '',
      last4: '', // Last 4 digits of account/card number (optional)
      // Debit cards as sub-items
      debitCards: []
    });
  }

  function newDebitCard(parentAccountId, name = ''){
    return {
      id: guid(),
      parentAccountId: parentAccountId,
      name: name || `Debit Card`,
      cardNumber: '', // Last 4 digits for display
      isActive: true
    };
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
      description: '',
      // Credit card deferred payment fields
      isDeferred: false,
      deferredMonths: 0,
      monthlyPaymentAmount: 0,
      remainingMonths: 0,
      // Recurrent payment fields
      isRecurrent: false,
      recurrentDayOfMonth: 0, // Day of month (1-31) when payment occurs
      recurrentDisabled: false // Set to true to permanently disable
    };
  }

  function newBudget(){
    return {
      id: guid(),
      type: 'expense', // or 'income'
      categoryId: '',
      amount: 0,
      currency: 'USD', // 'USD' | 'MXN'
      fxRate: 1, // USD per MXN rate if currency is MXN
      cadence: 'monthly', // 'monthly' | 'semimonthly' | 'biweekly' | 'weekly' | 'bimonthly'
      anchorDate: Utils.todayISO(), // YYYY-MM-DD - controls repeat alignment
      repeatUntil: '', // YYYY-MM-DD | '' - empty means forever
      createdAt: Utils.todayISO()
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

  function createDefaultCategories(){
    const categories = [];
    
    // EXPENSE CATEGORIES
    const expenseCategories = [
      {
        name: 'Food & Dining',
        type: 'expense',
        subcategories: [
          'Groceries',
          'Restaurants',
          'Coffee & Tea',
          'Fast Food',
          'Alcohol & Bars',
          'Food Delivery'
        ]
      },
      {
        name: 'Transportation',
        type: 'expense',
        subcategories: [
          'Gas & Fuel',
          'Public Transportation',
          'Rideshare & Taxi',
          'Parking',
          'Vehicle Maintenance',
          'Auto Insurance',
          'Registration & DMV'
        ]
      },
      {
        name: 'Housing',
        type: 'expense',
        subcategories: [
          'Rent/Mortgage',
          'Utilities',
          'Internet & Cable',
          'Home Insurance',
          'Property Tax',
          'Home Maintenance',
          'HOA Fees'
        ]
      },
      {
        name: 'Healthcare',
        type: 'expense',
        subcategories: [
          'Doctor Visits',
          'Prescriptions',
          'Health Insurance',
          'Dental',
          'Vision',
          'Mental Health',
          'Emergency Room'
        ]
      },
      {
        name: 'Shopping',
        type: 'expense',
        subcategories: [
          'Clothing & Accessories',
          'Electronics',
          'Home & Garden',
          'Books & Media',
          'Personal Care',
          'Gifts & Donations'
        ]
      },
      {
        name: 'Entertainment',
        type: 'expense',
        subcategories: [
          'Movies & Streaming',
          'Sports & Recreation',
          'Music & Events',
          'Hobbies',
          'Gaming',
          'Vacation & Travel'
        ]
      },
      {
        name: 'Education',
        type: 'expense',
        subcategories: [
          'Tuition',
          'Books & Supplies',
          'Student Loans',
          'Training & Courses',
          'Childcare & School'
        ]
      },
      {
        name: 'Business',
        type: 'expense',
        subcategories: [
          'Office Supplies',
          'Professional Services',
          'Business Meals',
          'Travel & Lodging',
          'Software & Tools'
        ]
      },
      {
        name: 'Financial',
        type: 'expense',
        subcategories: [
          'Bank Fees',
          'Credit Card Interest',
          'Investment Fees',
          'Tax Preparation',
          'Legal Services'
        ]
      },
      {
        name: 'Other Expenses',
        type: 'expense',
        subcategories: [
          'Personal Care',
          'Pet Care',
          'Subscriptions',
          'Miscellaneous'
        ]
      }
    ];

    // INCOME CATEGORIES
    const incomeCategories = [
      {
        name: 'Employment',
        type: 'income',
        subcategories: [
          'Salary',
          'Hourly Wages',
          'Bonus',
          'Commission',
          'Freelance',
          'Contract Work'
        ]
      },
      {
        name: 'Business',
        type: 'income',
        subcategories: [
          'Business Revenue',
          'Consulting',
          'Sales',
          'Royalties',
          'Partnership Income'
        ]
      },
      {
        name: 'Investments',
        type: 'income',
        subcategories: [
          'Dividends',
          'Interest',
          'Capital Gains',
          'Rental Income',
          'Annuities'
        ]
      },
      {
        name: 'Government',
        type: 'income',
        subcategories: [
          'Social Security',
          'Unemployment',
          'Disability',
          'Tax Refund',
          'Stimulus Payments'
        ]
      },
      {
        name: 'Other Income',
        type: 'income',
        subcategories: [
          'Gifts Received',
          'Inheritance',
          'Lottery/Winnings',
          'Side Hustle',
          'Miscellaneous'
        ]
      }
    ];

    // Create categories and subcategories
    [...expenseCategories, ...incomeCategories].forEach(categoryData => {
      // Create main category
      const categoryId = guid();
      categories.push({
        id: categoryId,
        name: categoryData.name,
        type: categoryData.type,
        parentCategoryId: ''
      });

      // Create subcategories
      categoryData.subcategories.forEach(subName => {
        categories.push({
          id: guid(),
          name: subName,
          type: categoryData.type,
          parentCategoryId: categoryId
        });
      });
    });

    return categories;
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
    
    // Initialize default categories if none exist
    if (State.categories.length === 0) {
      State.categories = createDefaultCategories();
      await PFMDB.set('pfm:categories', State.categories);
    }
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

  async function resetToDefaultCategories(){
    State.categories = createDefaultCategories();
    await PFMDB.set('pfm:categories', State.categories);
    return State.categories;
  }

  // Debit card management functions
  async function addDebitCard(parentAccountId, debitCardData){
    const account = State.accounts.find(a => a.id === parentAccountId);
    if (!account || Utils.accountType(account) !== 'checking') {
      throw new Error('Debit cards can only be added to checking accounts');
    }
    
    const debitCard = newDebitCard(parentAccountId, debitCardData.name);
    if (debitCardData.cardNumber) {
      debitCard.cardNumber = debitCardData.cardNumber;
    }
    
    account.debitCards = account.debitCards || [];
    account.debitCards.push(debitCard);
    
    await saveItem('accounts', account, 'accounts');
    return debitCard;
  }

  async function removeDebitCard(parentAccountId, debitCardId){
    const account = State.accounts.find(a => a.id === parentAccountId);
    if (!account) {
      throw new Error('Parent account not found');
    }
    
    account.debitCards = (account.debitCards || []).filter(dc => dc.id !== debitCardId);
    await saveItem('accounts', account, 'accounts');
  }

  async function updateDebitCard(parentAccountId, debitCardId, updates){
    const account = State.accounts.find(a => a.id === parentAccountId);
    if (!account) {
      throw new Error('Parent account not found');
    }
    
    const debitCard = account.debitCards?.find(dc => dc.id === debitCardId);
    if (!debitCard) {
      throw new Error('Debit card not found');
    }
    
    Object.assign(debitCard, updates);
    await saveItem('accounts', account, 'accounts');
    return debitCard;
  }

  return {
    State,
    normalizeAccount,
    newAccount, newTransaction, newBudget, newSnapshot, newFxRate,
    loadAll, saveAll, saveItem, deleteItem, resetToDefaultCategories,
    newDebitCard, addDebitCard, removeDebitCard, updateDebitCard
  };
})();
window.AppState = AppState;
