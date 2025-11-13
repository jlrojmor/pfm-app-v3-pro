// utils.js — helpers, FX, temporal accounting (V5)
function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
function formatMoneyUSD(v){ return (v??0).toLocaleString(undefined,{style:'currency', currency:'USD'}); }
function formatMoneyUSDNoDecimals(v){ return (v??0).toLocaleString(undefined,{style:'currency', currency:'USD', minimumFractionDigits:0, maximumFractionDigits:0}); }
function formatMoney(v, c){ return (v??0).toLocaleString(undefined,{style:'currency', currency:c||'USD'}); }
function formatPercent(v){ if(!isFinite(v)) return '—'; return `${(v*100).toFixed(1)}%`; }

// Standardized amount display: USD primary, native currency secondary
function formatAmountWithNative(usdAmount, account) {
  if (!account) return formatMoneyUSD(usdAmount);
  
  const usdFormatted = formatMoneyUSD(usdAmount);
  
  // If account is in USD, just return USD
  if (account.currency === 'USD') {
    return `<div class="primary-amount">${usdFormatted}</div>`;
  }
  
  // For non-USD accounts, show native currency as secondary
  const nativeAmount = account.currency === 'MXN' 
    ? usdAmount / latestUsdPerMXN() 
    : usdAmount; // Fallback for other currencies
  const nativeFormatted = formatMoney(nativeAmount, account.currency);
  
  return `
    <div class="primary-amount">${usdFormatted}</div>
    <div class="secondary-amount">${nativeFormatted}</div>
  `;
}
function monthKey(iso){ return (iso||'').slice(0,7); }
function todayISO(){ return new Date().toISOString().slice(0,10); }

// Date formatting functions
function formatDate(dateString) {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString + 'T00:00:00'); // Add time to avoid timezone issues
    if (isNaN(date.getTime())) return dateString; // Invalid date, return as-is
    
    const settings = AppState?.State?.settings || {};
    const format = settings.dateFormat || 'US';
    
    const year = date.getFullYear();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[date.getMonth()];
    const day = String(date.getDate()).padStart(2, '0');
    
    if (format === 'MX') {
      // DD MMM YYYY format (e.g., 27 Nov 2025)
      return `${day} ${month} ${year}`;
    } else {
      // US format: MMM DD, YYYY (e.g., Nov 27, 2025)
      return `${month} ${day}, ${year}`;
    }
  } catch (e) {
    return dateString;
  }
}

function formatShortDate(dateString) {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString + 'T00:00:00');
    if (isNaN(date.getTime())) return dateString;
    
    const settings = AppState?.State?.settings || {};
    const format = settings.dateFormat || 'US';
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[date.getMonth()];
    const day = String(date.getDate()).padStart(2, '0');
    
    if (format === 'MX') {
      // DD MMM format (e.g., 27 Nov)
      return `${day} ${month}`;
    } else {
      // US format: MMM DD (e.g., Nov 27)
      return `${month} ${day}`;
    }
  } catch (e) {
    return dateString;
  }
}

function formatMonthHeader(monthKey) {
  if (!monthKey) return '—';
  try {
    // monthKey is in format "YYYY-MM"
    const [year, month] = monthKey.split('-');
    if (!year || !month) return monthKey;
    
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    
    return `${monthNames[date.getMonth()]} ${year}`;
  } catch (e) {
    return monthKey;
  }
}
const _cdnWarnings=new Set();
function showCdnWarning(key, message){
  if(_cdnWarnings.has(key)) return;
  _cdnWarnings.add(key);
  let banner=document.getElementById('cdnWarning');
  if(!banner){
    banner=document.createElement('div');
    banner.id='cdnWarning';
    banner.className='cdn-warning';
    document.body.prepend(banner);
  }
  const item=document.createElement('div');
  item.textContent=message;
  banner.appendChild(item);
  banner.classList.remove('hidden');
}

async function fetchUsdPerMXN(dateIso){
  const day = dateIso || todayISO();
  const set = AppState.State.settings || {};
  if (set.fxApiKey){
    try{
      const url = `https://v6.exchangerate-api.com/v6/${encodeURIComponent(set.fxApiKey)}/latest/USD`;
      const r = await fetch(url); const j = await r.json();
      const mxnPerUSD = j?.conversion_rates?.MXN;
      if (mxnPerUSD) return 1/Number(mxnPerUSD);
    }catch(e){}
  }
  try{
    const url = `https://api.exchangerate.host/${day}?base=MXN&symbols=USD`;
    const r = await fetch(url); const j = await r.json();
    return Number(j?.rates?.USD ?? 0.055);
  }catch(e){ return 0.055; }
}
function latestUsdPerMXN(){ const s=AppState.State.settings; if (s.useManualFx && s.manualUsdPerMXN) return Number(s.manualUsdPerMXN); const fx=[...AppState.State.fxRates].sort((a,b)=> b.date.localeCompare(a.date))[0]; return fx?Number(fx.usdPerMXN):0.055; }

// Enhanced FX rate fetching with multiple API options
async function fetchHistoricalFXRate(from, to, date) {
  if (from === to) return 1;
  
  console.log(`🔄 Fetching historical FX rate: ${from} to ${to} for ${date}`);
  
  // Try multiple APIs in order of preference
  const apis = [
    {
      name: 'ExchangeRate-API (Free, no key needed)',
      url: `https://api.exchangerate-api.com/v4/history/${from}/${date}`,
      parser: (data) => data.rates?.[to]
    },
    {
      name: 'ExchangeRatesAPI.io (CORS-enabled)',
      url: `https://api.exchangeratesapi.io/v1/${date}?access_key=${getApiKey('exchangerates')}&base=${from}&symbols=${to}`,
      parser: (data) => {
        console.log('📊 ExchangeRatesAPI.io response:', data);
        if (data.success === false) {
          throw new Error(`API Error: ${data.error?.info || 'Unknown error'}`);
        }
        return data.rates?.[to];
      },
      requiresKey: true
    },
    {
      name: 'CurrencyAPI (if API key available)',
      url: `https://api.currencyapi.com/v3/historical?apikey=${getApiKey('currency')}&currencies=${to}&base_currency=${from}&date=${date}`,
      parser: (data) => data.data?.[to]?.value,
      requiresKey: true
    },
    {
      name: 'Fixer.io (if API key available)',
      url: `https://api.fixer.io/${date}?access_key=${getApiKey('fixer')}&base=${from}&symbols=${to}`,
      parser: (data) => data.rates?.[to],
      requiresKey: true
    }
  ];
  
  for (const api of apis) {
    if (api.requiresKey) {
      let keyName = 'fixer'; // default
      if (api.name.includes('CurrencyAPI')) keyName = 'currency';
      else if (api.name.includes('ExchangeRatesAPI')) keyName = 'exchangerates';
      
      if (!getApiKey(keyName)) {
        console.log(`⏭️ Skipping ${api.name} - no API key`);
        continue;
      }
    }
    
    try {
      console.log(`🌐 Trying ${api.name}: ${api.url}`);
      const response = await fetch(api.url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`📊 ${api.name} response:`, data);
      
      const rate = api.parser(data);
      if (rate && rate > 0) {
        console.log(`✅ Found rate with ${api.name}: ${rate}`);
        return rate;
      } else {
        console.warn(`⚠️ ${api.name} returned invalid rate: ${rate}`);
        throw new Error(`Rate not found for ${to} or invalid rate: ${rate}`);
      }
      
    } catch (error) {
      console.warn(`❌ ${api.name} failed:`, error.message);
      continue;
    }
  }
  
  // All APIs failed, use fallback
  console.warn('⚠️ All FX APIs failed, using fallback rate');
  const fallbackRate = getFallbackRate(from, to, date);
  console.log(`🔄 Using fallback rate: ${fallbackRate}`);
  return fallbackRate;
}

// Get API key from settings
function getApiKey(provider) {
  const settings = AppState?.State?.settings || {};
  return settings[`${provider}ApiKey`] || '';
}

// Set default API key for ExchangeRatesAPI.io
function setDefaultApiKeys() {
  if (!AppState?.State?.settings) {
    AppState.State.settings = {};
  }
  
  // Set the provided ExchangeRatesAPI.io key
  if (!AppState.State.settings.exchangeratesApiKey) {
    AppState.State.settings.exchangeratesApiKey = '8a2a1505065219394ebe9bed9400a77b';
    console.log('🔑 Set default ExchangeRatesAPI.io key');
  }
}

// Set API key in settings
function setApiKey(provider, key) {
  if (!AppState?.State?.settings) {
    AppState.State.settings = {};
  }
  AppState.State.settings[`${provider}ApiKey`] = key;
  AppState.saveItem('settings', AppState.State.settings, 'settings');
}

// Update remaining months for deferred transactions
function updateDeferredTransactionMonths() {
  if (!AppState || !AppState.State || !AppState.State.transactions) {
    console.warn('AppState not available for updateDeferredTransactionMonths');
    return;
  }
  
  console.log('🔄 Updating deferred transaction months...');
  
  AppState.State.transactions.forEach(txn => {
    if (txn.isDeferred && txn.remainingMonths > 0) {
      // Calculate how many months have passed since the transaction date
      const txnDate = new Date(txn.date);
      const today = new Date();
      const monthsPassed = (today.getFullYear() - txnDate.getFullYear()) * 12 + 
                          (today.getMonth() - txnDate.getMonth());
      
      // Update remaining months
      const newRemainingMonths = Math.max(0, txn.deferredMonths - monthsPassed);
      
      if (newRemainingMonths !== txn.remainingMonths) {
        console.log(`📅 Transaction ${txn.id}: ${txn.remainingMonths} → ${newRemainingMonths} months remaining`);
        txn.remainingMonths = newRemainingMonths;
      }
    }
  });
  
  console.log('✅ Deferred transaction months updated');
}

// Get fallback rates for common currencies with realistic historical variation
function getFallbackRate(from, to, date = null) {
  const baseRates = {
    'USD': { 'MXN': 20.0, 'EUR': 0.85, 'GBP': 0.73, 'CAD': 1.25, 'AUD': 1.35 },
    'MXN': { 'USD': 0.05, 'EUR': 0.043, 'GBP': 0.037, 'CAD': 0.063, 'AUD': 0.068 },
    'EUR': { 'USD': 1.18, 'MXN': 23.5, 'GBP': 0.86, 'CAD': 1.47, 'AUD': 1.59 },
    'GBP': { 'USD': 1.37, 'MXN': 27.4, 'EUR': 1.16, 'CAD': 1.71, 'AUD': 1.85 },
    'CAD': { 'USD': 0.80, 'MXN': 16.0, 'EUR': 0.68, 'GBP': 0.58, 'AUD': 1.08 },
    'AUD': { 'USD': 0.74, 'MXN': 14.8, 'EUR': 0.63, 'GBP': 0.54, 'CAD': 0.93 }
  };
  
  let rate = baseRates[from]?.[to] || 1;
  
  // Add realistic historical variation for MXN/USD based on actual trends
  if (date && from === 'MXN' && to === 'USD') {
    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth() + 1; // 1-12
    const day = dateObj.getDate();
    
    // Historical MXN/USD trends (approximate)
    let historicalRate = 0.05; // Base rate
    
    if (year === 2024) {
      // 2024 MXN/USD was around 0.055-0.060 range
      historicalRate = 0.055 + (month - 1) * 0.0005; // Gradual increase through year
    } else if (year === 2023) {
      // 2023 MXN/USD was around 0.050-0.055 range
      historicalRate = 0.052 + (month - 1) * 0.0003;
    } else if (year === 2022) {
      // 2022 MXN/USD was around 0.045-0.050 range
      historicalRate = 0.047 + (month - 1) * 0.0002;
    } else if (year === 2021) {
      // 2021 MXN/USD was around 0.040-0.045 range
      historicalRate = 0.042 + (month - 1) * 0.0002;
    }
    
    // Add small daily variation (±1%)
    const dayVariation = 0.01 * Math.sin(day * 0.2);
    rate = historicalRate * (1 + dayVariation);
    
    console.log(`📊 Using historical fallback rate for ${date}: ${rate.toFixed(4)} (based on ${year} trends)`);
  }
  
  return rate;
}
async function ensureFxForDate(dateIso){
  const iso=dateIso||todayISO();
  let record=AppState.State.fxRates.find(x=>x.date===iso);
  if(!record){
    try{
      const rate=await fetchUsdPerMXN(iso);
      record=AppState.newFxRate(iso, rate);
      await AppState.saveItem('fxRates', record, 'fxRates');
    }catch(e){
      throw new Error('FX unavailable');
    }
  }
  return Number(record.usdPerMXN||latestUsdPerMXN());
}
async function ensureTodayFX(){ return ensureFxForDate(todayISO()); }
function convertToUSD(amount, currency, usdPerMXN){ return currency==='USD'?Number(amount):Number(amount)*Number(usdPerMXN); }
function within(dateIso, s,e){ if(!s||!e)return true; const d=new Date(dateIso); return d>=new Date(s)&&d<=new Date(e); }

function txnDeltaUSDForAccount(txn, account){
  const usdAmount = txn.currency==='USD'? Number(txn.amount) : Number(txn.amount)*Number(txn.fxRate||1);
  const isCard = accountType(account)==='credit-card';
  
  // Helper function to check if a transaction's fromAccountId matches this account or any of its debit cards
  const matchesAccount = (accountId) => {
    if (accountId === account.id) return true;
    // Check if the accountId is a debit card belonging to this account
    if (account.debitCards && account.debitCards.some(dc => dc.id === accountId)) return true;
    return false;
  };
  
  if (txn.transactionType==='Expense' || txn.transactionType==='Credit Card Interest'){ 
    if (matchesAccount(txn.fromAccountId)) return isCard? +usdAmount : -usdAmount; 
  }
  else if (txn.transactionType==='Income'){ 
    if (txn.toAccountId===account.id) return +usdAmount; 
  }
  else if (txn.transactionType==='Transfer'){ 
    if (matchesAccount(txn.fromAccountId)) return -usdAmount; 
    if (txn.toAccountId===account.id) return +usdAmount; 
  }
  else if (txn.transactionType==='Credit Card Payment'){ 
    if (matchesAccount(txn.fromAccountId)) return -usdAmount; 
    if (txn.toAccountId===account.id) return -usdAmount; 
  }
  return 0;
}
function currentBalanceUSD(account){
  const asOfUSD = convertToUSD(account.balanceAsOfAmount||0, account.currency||'USD', latestUsdPerMXN());
  const delta = AppState.State.transactions.filter(t=> t.date > (account.balanceAsOfDate||'')).reduce((s,t)=> s + txnDeltaUSDForAccount(t, account), 0);
  return asOfUSD + delta;
}

function currentBalanceNative(account){
  const asOfAmount = account.balanceAsOfAmount || 0;
  
  // Calculate delta in native currency by processing each transaction individually
  // This ensures we use each transaction's specific FX rate
  let deltaNative = 0;
  
  AppState.State.transactions
    .filter(t => t.date > (account.balanceAsOfDate || ''))
    .forEach(t => {
      const deltaUSD = txnDeltaUSDForAccount(t, account);
      
      if (account.currency === 'USD') {
        deltaNative += deltaUSD;
    } else {
        // For MXN accounts, convert USD delta to MXN using the transaction's FX rate
        // If transaction is in MXN, use its fxRate; otherwise use latest rate
        const fxRate = t.currency === 'MXN' && t.fxRate ? t.fxRate : latestUsdPerMXN();
        deltaNative += deltaUSD / fxRate;
      }
    });
  
  return asOfAmount + deltaNative;
}
function creditLimitUSD(account){ return convertToUSD(account.creditLimit||0, account.currency||'USD', latestUsdPerMXN()); }

// Helper: Extract day of month from date string, handling edge cases
function getDayOfMonth(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  return date.getDate();
}

// Helper: Get date with specific day of month, handling months with fewer days
function getDateWithDay(year, month, day) {
  // Get last day of month to handle edge cases (e.g., Feb 31 -> Feb 28/29)
  const lastDay = new Date(year, month + 1, 0).getDate();
  const actualDay = Math.min(day, lastDay);
  return new Date(year, month, actualDay);
}

// Calculate grace period correctly
// If due day < closing day, the due date is in the NEXT month
// Example: Closing on Nov 5, Due on Nov 2 → Due is actually Dec 2
// Grace period = days from day after closing to due date in next month
function calculateGracePeriod(closingDateStr, dueDateStr) {
  if (!closingDateStr || !dueDateStr) return 0;
  
  try {
    const closingDate = new Date(closingDateStr + 'T00:00:00');
    const dueDate = new Date(dueDateStr + 'T00:00:00');
    
    if (isNaN(closingDate.getTime()) || isNaN(dueDate.getTime())) return 0;
    
    // Extract day of month
    const closingDay = closingDate.getDate();
    const dueDay = dueDate.getDate();
    const closingMonth = closingDate.getMonth();
    const closingYear = closingDate.getFullYear();
    
    // If due day is before closing day, due date is in the NEXT month
    let actualDueDate;
    if (dueDay < closingDay) {
      // Due date is in next month
      actualDueDate = new Date(closingYear, closingMonth + 1, dueDay);
    } else {
      // Due date is in same month (less common but possible)
      actualDueDate = new Date(closingYear, closingMonth, dueDay);
    }
    
    // Grace period = days from day AFTER closing to due date
    const dayAfterClosing = new Date(closingDate);
    dayAfterClosing.setDate(dayAfterClosing.getDate() + 1);
    
    const graceDays = Math.round((actualDueDate - dayAfterClosing) / (1000 * 60 * 60 * 24));
    
    return graceDays;
  } catch (e) {
    console.error('Error calculating grace period:', e);
    return 0;
  }
}

// Calculate next due dates based on day-of-month logic
// Credit cards have fixed due days each month (e.g., always on the 1st)
function nextDueDates(account, months=2){
  const out = [];
  if (!account.paymentDueDate) return out;
  
  const dueDay = getDayOfMonth(account.paymentDueDate);
  if (!dueDay) return out;
  
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  let currentMonth = now.getMonth();
  let currentYear = now.getFullYear();
  
  for (let i = 0; i < months; i++) {
    const dueDate = getDateWithDay(currentYear, currentMonth, dueDay);
    
    // Only include future due dates
    if (dueDate >= now) {
      out.push(dueDate.toISOString().slice(0, 10));
    }
    
    // Move to next month
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
  }
  
  return Array.from(new Set(out));
}

// Check if a due date has been paid
function isDuePaid(card, dueIso){
  if (!card.paymentDueDate || !dueIso) return false;
  
  const due = new Date(dueIso);
  const dueDay = getDayOfMonth(card.paymentDueDate);
  if (!dueDay) return false;
  
  // Calculate previous due date (one month before)
  const prevDue = new Date(due);
  prevDue.setMonth(prevDue.getMonth() - 1);
  const prevDueDate = getDateWithDay(prevDue.getFullYear(), prevDue.getMonth(), dueDay);
  
  // Payment period starts the day after previous due date
  const paymentStartDate = new Date(prevDueDate);
  paymentStartDate.setDate(paymentStartDate.getDate() + 1);
  
  // Check if there's a payment between payment start date and due date
  return AppState.State.transactions.some(t => 
    t.transactionType === 'Credit Card Payment' && 
    t.toAccountId === card.id && 
    new Date(t.date) >= paymentStartDate && 
    new Date(t.date) <= due
  );
}

// Enhanced credit card payment due calculation
// Uses day-of-month logic: closing day and due day are the same each month
function calculateCreditCardPaymentDue(card, dueDate) {
  // Validate inputs - use paymentDueDate and nextClosingDate (full dates)
  if (!card || !dueDate || !card.paymentDueDate || !card.nextClosingDate) {
    return 0;
  }
  
  const due = new Date(dueDate);
  const closingDate = new Date(card.nextClosingDate);
  const originalDueDate = new Date(card.paymentDueDate);
  
  // Extract day of month from stored dates
  const closingDay = getDayOfMonth(card.nextClosingDate);
  const dueDay = getDayOfMonth(card.paymentDueDate);
  
  if (!closingDay || !dueDay) {
    console.error('Invalid closing or due date');
    return 0;
  }
  
  // Calculate grace period correctly (handles due date in next month)
  const graceDays = calculateGracePeriod(card.nextClosingDate, card.paymentDueDate);
  
  // Calculate which closing date corresponds to this due date
  // If due day < closing day, closing was in previous month
  const dueYear = due.getFullYear();
  const dueMonth = due.getMonth();
  
  let billingCloseDate;
  if (dueDay < closingDay) {
    // Due is in next month after closing (common case: close on 3rd, due on 1st of next month)
    billingCloseDate = getDateWithDay(dueYear, dueMonth - 1, closingDay);
  } else {
    // Due is in same month as closing (less common)
    billingCloseDate = getDateWithDay(dueYear, dueMonth, closingDay);
  }
  
  // Verify the calculated closing date makes sense
  // Due date should be approximately graceDays after closing
  const calculatedDue = new Date(billingCloseDate);
  calculatedDue.setDate(calculatedDue.getDate() + graceDays);
  
  // If there's a significant mismatch, recalculate using grace period (fallback)
  const daysDiff = Math.abs((due - calculatedDue) / (1000 * 60 * 60 * 24));
  if (daysDiff > 2) {
    billingCloseDate = new Date(due);
    billingCloseDate.setDate(due.getDate() - graceDays);
  }
  
  // Billing period starts the day after the previous closing date
  // Handle month-end edge cases correctly
  const billingStartDate = new Date(billingCloseDate);
  billingStartDate.setMonth(billingStartDate.getMonth() - 1);
  
  // If we went to a month with fewer days, adjust to the last day of that month
  // Example: March 31 - 1 month = February, but Feb doesn't have 31 days
  // So we need to set to the last day of February
  const targetMonth = billingStartDate.getMonth();
  const targetYear = billingStartDate.getFullYear();
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  
  // Set to the day after the previous closing date
  // If closing was on day X, billing starts on day X+1 of previous month
  // Use the closingDay variable we already have (no need to redeclare)
  const startDay = Math.min(closingDay + 1, lastDayOfTargetMonth);
  billingStartDate.setDate(startDay);
  
  // If we're at the end of the month, make sure we're on the correct day
  // For example, if closing is on 31st and previous month has 30 days, use 30th
  if (billingStartDate.getMonth() !== targetMonth) {
    billingStartDate.setDate(lastDayOfTargetMonth);
  }
  
  console.log(`💳 Credit Card Payment Due Calculation for ${card.name}:`);
  console.log(`   Due Date: ${due.toISOString().slice(0, 10)}`);
  console.log(`   Closing Day: ${closingDay}, Due Day: ${dueDay}`);
  console.log(`   Billing Period: ${billingStartDate.toISOString().slice(0, 10)} to ${billingCloseDate.toISOString().slice(0, 10)}`);
  
  // Get all expense transactions in this billing period
  const expenseTxns = (AppState && AppState.State && AppState.State.transactions) ? AppState.State.transactions.filter(t => 
    t.fromAccountId === card.id && 
    (t.transactionType === 'Expense' || t.transactionType === 'Credit Card Interest') &&
    new Date(t.date) >= billingStartDate && 
    new Date(t.date) <= billingCloseDate
  ) : [];
  
  console.log(`   Expense transactions in billing period: ${expenseTxns.length}`);
  
  // Get all payments made after closing date but before due date
  const paymentTxns = (AppState && AppState.State && AppState.State.transactions) ? AppState.State.transactions.filter(t => 
    t.toAccountId === card.id && 
    t.transactionType === 'Credit Card Payment' &&
    new Date(t.date) > billingCloseDate && 
    new Date(t.date) <= due
  ) : [];
  
  console.log(`   Payments after closing: ${paymentTxns.length}`);
  
  // Calculate charges for this billing period
  let totalCharges = 0;
  
  // 1. Add regular (non-installment) expenses
  expenseTxns.forEach(txn => {
    if (!txn.isDeferred) {
      const usdAmount = txn.currency === 'USD' ? Number(txn.amount) : Number(txn.amount) * Number(txn.fxRate || 1);
      totalCharges += usdAmount;
    }
  });
  
  // 2. Add installment charges for this billing period
  const installmentCharges = calculateInstallmentChargesForPeriod(card, billingStartDate, billingCloseDate);
  totalCharges += installmentCharges;
  
  // 3. Subtract payments made after closing but before due
  let totalPayments = 0;
  paymentTxns.forEach(txn => {
    const usdAmount = txn.currency === 'USD' ? Number(txn.amount) : Number(txn.amount) * Number(txn.fxRate || 1);
    totalPayments += usdAmount;
  });
  
  // Net amount due (cannot be negative)
  const netAmountDue = Math.max(0, totalCharges - totalPayments);
  
  console.log(`   Total charges: $${totalCharges.toFixed(2)}, Payments: $${totalPayments.toFixed(2)}, Net due: $${netAmountDue.toFixed(2)}`);
  
  return netAmountDue;
}

// Calculate monthly payment for deferred transactions
function calculateMonthlyPayment(amount, months) {
  if (!months || months <= 0 || !amount || amount <= 0) {
    return 0;
  }
  return amount / months;
}

// Calculate installment charges for a billing period
function calculateInstallmentChargesForPeriod(card, billingStartDate, billingEndDate) {
  if (!AppState || !AppState.State || !AppState.State.transactions) {
    return 0;
  }
  
  const startDate = new Date(billingStartDate);
  const endDate = new Date(billingEndDate);
  
  // Get all installment transactions for this card
  const installmentTxns = AppState.State.transactions.filter(txn => 
    txn.transactionType === 'Expense' && 
    txn.fromAccountId === card.id && 
    txn.isDeferred && 
    txn.deferredMonths > 0
  );
  
  let totalCharges = 0;
  
  installmentTxns.forEach(txn => {
    // Only count installments that haven't been fully paid
    if (txn.remainingMonths <= 0) {
      return; // Skip fully paid installments
    }
    
    const txnDate = new Date(txn.date);
    const monthlyAmount = txn.monthlyPaymentAmount || 
      (txn.currency === 'USD' ? Number(txn.amount) : Number(txn.amount) * Number(txn.fxRate || 1)) / txn.deferredMonths;
    
    // Calculate which installments have been paid
    const installmentsPaid = (txn.deferredMonths || 0) - (txn.remainingMonths || 0);
    
    // Calculate which installment month(s) fall in this billing period
    // Installments start from the month after the transaction date
    // Only count installments that haven't been paid yet
    let monthOffset = installmentsPaid + 1; // Start from the next unpaid installment
    const maxMonths = txn.deferredMonths || 0;
    
    while (monthOffset <= maxMonths) {
      // Calculate the date when this installment would be charged
      const installmentDate = new Date(txnDate);
      installmentDate.setMonth(installmentDate.getMonth() + monthOffset);
      
      // Check if this installment falls within the billing period
      if (installmentDate >= startDate && installmentDate <= endDate) {
        totalCharges += monthlyAmount;
      }
      
      monthOffset++;
    }
  });
  
  return totalCharges;
}

// Update remaining months for deferred transactions
// NOTE: This function should be used carefully as it can conflict with manual installment payments
// It's better to rely on remainingMonths being decremented when payments are created
function updateDeferredTransactionMonths() {
  if (!AppState || !AppState.State || !AppState.State.transactions) return;
  
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  
  AppState.State.transactions.forEach(txn => {
    if (txn.isDeferred && txn.remainingMonths > 0 && txn.deferredMonths > 0) {
      const txnDate = new Date(txn.date);
      const txnMonth = txnDate.getMonth();
      const txnYear = txnDate.getFullYear();
      
      // Calculate months elapsed since transaction
      const monthsElapsed = (currentYear - txnYear) * 12 + (currentMonth - txnMonth);
      
      // Only update if the calculated remaining months is LESS than current
      // This prevents overwriting manual decrements from installment payments
      const calculatedRemaining = Math.max(0, (txn.deferredMonths || 0) - monthsElapsed);
      
      // Only update if calculated is less (meaning time has passed and we haven't accounted for it)
      // But don't update if remainingMonths is already less (meaning payments were made)
      if (calculatedRemaining < txn.remainingMonths) {
        txn.remainingMonths = calculatedRemaining;
      }
      
      // Update monthly payment amount if not set and deferredMonths is valid
      if (!txn.monthlyPaymentAmount && txn.deferredMonths > 0) {
        const usdAmount = txn.currency === 'USD' ? Number(txn.amount) : Number(txn.amount) * Number(txn.fxRate || 1);
        txn.monthlyPaymentAmount = calculateMonthlyPayment(usdAmount, txn.deferredMonths);
      }
    }
  });
}

// Get credit card utilization percentage
function getCreditCardUtilization(card) {
  const currentBalance = currentBalanceUSD(card);
  const creditLimit = creditLimitUSD(card);
  return creditLimit > 0 ? (currentBalance / creditLimit) * 100 : 0;
}

// Get available credit
function getAvailableCredit(card) {
  const currentBalance = currentBalanceUSD(card);
  const creditLimit = creditLimitUSD(card);
  return Math.max(0, creditLimit - currentBalance);
}

// Get installment information for a credit card
function getCreditCardInstallmentInfo(card) {
  if (!AppState || !AppState.State || !AppState.State.transactions) {
    return { totalInstallments: 0, totalMonthlyPayment: 0, activeInstallments: [] };
  }
  
  const installmentTxns = AppState.State.transactions.filter(txn => 
    txn.transactionType === 'Expense' && 
    txn.fromAccountId === card.id && 
    txn.isDeferred && 
    txn.remainingMonths > 0
  );
  
  const totalMonthlyPayment = installmentTxns.reduce((sum, txn) => {
    if (txn.monthlyPaymentAmount) {
      return sum + txn.monthlyPaymentAmount;
    }
    if (txn.deferredMonths > 0) {
      const usdAmount = txn.currency === 'USD' ? Number(txn.amount) : Number(txn.amount) * Number(txn.fxRate || 1);
      return sum + (usdAmount / txn.deferredMonths);
    }
    return sum;
  }, 0);
  
  const activeInstallments = installmentTxns.map(txn => {
    let monthlyPayment = 0;
    if (txn.monthlyPaymentAmount) {
      monthlyPayment = txn.monthlyPaymentAmount;
    } else if (txn.deferredMonths > 0) {
      const usdAmount = txn.currency === 'USD' ? Number(txn.amount) : Number(txn.amount) * Number(txn.fxRate || 1);
      monthlyPayment = usdAmount / txn.deferredMonths;
    }
    
    return {
        id: txn.id,
        description: txn.description,
      monthlyPayment: monthlyPayment,
      remainingMonths: txn.remainingMonths,
      totalAmount: txn.currency === 'USD' ? Number(txn.amount) : Number(txn.amount) * Number(txn.fxRate || 1)
    };
  });
  
  return {
    totalInstallments: installmentTxns.length,
    totalMonthlyPayment: totalMonthlyPayment,
    activeInstallments: activeInstallments
  };
}

// Get pending installment payments that are due
function getPendingInstallmentPayments() {
  if (!AppState || !AppState.State || !AppState.State.transactions) {
    return [];
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const pendingPayments = [];
  
  // Find all deferred transactions with remaining months
  const deferredTxns = AppState.State.transactions.filter(txn => 
    txn.transactionType === 'Expense' && 
    txn.isDeferred && 
    txn.remainingMonths > 0 &&
    txn.deferredMonths > 0
  );
  
  deferredTxns.forEach(txn => {
    const txnDate = new Date(txn.date);
    txnDate.setHours(0, 0, 0, 0);
    
    // Calculate which installment should be paid
    // If deferredMonths = 12 and remainingMonths = 10, then 2 installments have been paid
    const installmentsPaid = txn.deferredMonths - txn.remainingMonths;
    const nextInstallmentNumber = installmentsPaid + 1;
    
    // Calculate the due date for the next installment
    // Installments start 1 month after the original transaction date
    // If original was Jan 15, 2024: Installment 1 due Feb 15, Installment 2 due Mar 15, etc.
    const nextDueDate = new Date(txnDate);
    nextDueDate.setMonth(nextDueDate.getMonth() + nextInstallmentNumber);
    
    // Use the same day of the month as the original transaction
    const dueDay = txnDate.getDate();
    
    // Try to set the date, but handle months with fewer days (e.g., Jan 31 -> Feb 28)
    const targetMonth = nextDueDate.getMonth();
    nextDueDate.setDate(dueDay);
    
    // If the month changed, it means the day doesn't exist in that month
    // (e.g., trying to set Feb 31 results in March 3)
    if (nextDueDate.getMonth() !== targetMonth) {
      // Go to the last day of the target month
      nextDueDate.setMonth(targetMonth + 1, 0); // Day 0 = last day of previous month
    }
    
    // Check if payment is due (today is on or past the due date)
    // and if there are still installments remaining
    if (today >= nextDueDate && nextInstallmentNumber <= txn.deferredMonths && txn.remainingMonths > 0) {
      // Calculate monthly payment amount in native currency
      let monthlyPayment = 0;
      if (txn.monthlyPaymentAmount) {
        // If monthlyPaymentAmount is stored, use it (it's always in USD)
        // For MXN transactions, we need to convert back to MXN using the original FX rate
        if (txn.currency === 'MXN' && txn.fxRate && txn.fxRate > 0) {
          // Convert USD monthlyPaymentAmount back to MXN
          monthlyPayment = txn.monthlyPaymentAmount / txn.fxRate;
        } else {
          // For USD, use it directly
          monthlyPayment = txn.monthlyPaymentAmount;
        }
      } else if (txn.deferredMonths > 0) {
        // Calculate from the original transaction amount
        // If currency is MXN, the amount is already in MXN, so divide by deferredMonths
        // If currency is USD, the amount is already in USD, so divide by deferredMonths
        monthlyPayment = Number(txn.amount) / txn.deferredMonths;
      }
      
      // Get account and category info
      const account = AppState.State.accounts.find(a => a.id === txn.fromAccountId);
      const category = AppState.State.categories.find(c => c.id === txn.categoryId);
      
      pendingPayments.push({
        originalTxnId: txn.id,
        description: txn.description || 'Monthly installment',
        accountId: txn.fromAccountId,
        accountName: account ? account.name : 'Unknown Account',
        categoryId: txn.categoryId,
        categoryName: category ? category.name : 'Uncategorized',
        amount: monthlyPayment,
        currency: txn.currency || 'USD',
        fxRate: txn.fxRate || 1,
        dueDate: nextDueDate.toISOString().slice(0, 10), // YYYY-MM-DD
        installmentNumber: nextInstallmentNumber,
        totalInstallments: txn.deferredMonths,
        remainingMonths: txn.remainingMonths
      });
    }
  });
  
  // Sort by due date (earliest first)
  pendingPayments.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  
  return pendingPayments;
}

// Create an Expense transaction for a monthly installment payment
async function createInstallmentPayment(pendingPayment) {
  if (!AppState || !AppState.State) {
    throw new Error('AppState not available');
  }
  
  // Find the original transaction
  const originalTxn = AppState.State.transactions.find(t => t.id === pendingPayment.originalTxnId);
  if (!originalTxn) {
    throw new Error('Original transaction not found');
  }
  
  // Create new Expense transaction
  const paymentTxn = AppState.newTransaction();
  paymentTxn.transactionType = 'Expense';
  paymentTxn.date = pendingPayment.dueDate;
  paymentTxn.amount = pendingPayment.amount;
  paymentTxn.currency = pendingPayment.currency;
  
  // For MXN, fetch today's FX rate; for USD, use 1
  if (pendingPayment.currency === 'MXN') {
    await Utils.ensureTodayFX();
    paymentTxn.fxRate = Utils.latestUsdPerMXN();
  } else {
    paymentTxn.fxRate = 1;
  }
  
  paymentTxn.fromAccountId = pendingPayment.accountId;
  paymentTxn.toAccountId = ''; // Not used for Expense
  paymentTxn.categoryId = pendingPayment.categoryId;
  paymentTxn.description = pendingPayment.description;
  paymentTxn.isDeferred = false; // This is the actual payment, not deferred
  paymentTxn.deferredMonths = 0;
  paymentTxn.monthlyPaymentAmount = 0;
  paymentTxn.remainingMonths = 0;
  
  // Save the payment transaction
  await AppState.saveItem('transactions', paymentTxn, 'transactions');
  
  // Update the original transaction: decrement remainingMonths
  originalTxn.remainingMonths = Math.max(0, originalTxn.remainingMonths - 1);
  await AppState.saveItem('transactions', originalTxn, 'transactions');
  
  return paymentTxn;
}

// Detect unusual transactions based on actual spending patterns
function detectUnusualTransactions(transactions, startDate, endDate) {
  if (!AppState || !AppState.State) return [];
  
  const toUSD = t => t.currency === 'USD' ? Number(t.amount) : Number(t.amount) * Number(t.fxRate || 1);
  
  // Filter expenses in the date range
  const expenses = transactions.filter(t => 
    (t.transactionType === 'Expense' || t.transactionType === 'Credit Card Interest') &&
    t.date >= startDate && 
    t.date <= endDate
  );
  
  if (expenses.length === 0) return [];
  
  // Get all historical expenses for comparison (last 90 days before start date)
  const historicalStart = new Date(startDate);
  historicalStart.setDate(historicalStart.getDate() - 90);
  const historicalExpenses = AppState.State.transactions.filter(t =>
    (t.transactionType === 'Expense' || t.transactionType === 'Credit Card Interest') &&
    t.date >= historicalStart.toISOString().slice(0, 10) &&
    t.date < startDate
  );
  
  // Calculate average daily spending from historical data
  const historicalAmounts = historicalExpenses.map(t => toUSD(t));
  const totalHistoricalSpending = historicalAmounts.reduce((sum, a) => sum + a, 0);
  const daysInHistory = Math.max(1, Math.ceil((new Date(startDate) - historicalStart) / (1000 * 60 * 60 * 24)));
  const averageDailySpending = totalHistoricalSpending / daysInHistory;
  
  // Calculate average transaction size from historical data
  const averageTransactionSize = historicalAmounts.length > 0 
    ? totalHistoricalSpending / historicalAmounts.length 
    : 0;
  
  // Use the higher of the two averages as baseline (more conservative)
  const baseline = Math.max(averageDailySpending, averageTransactionSize);
  
  // If no historical data, use current period average
  const currentAmounts = expenses.map(t => toUSD(t));
  const currentAverage = currentAmounts.length > 0 
    ? currentAmounts.reduce((sum, a) => sum + a, 0) / currentAmounts.length 
    : 0;
  
  const effectiveBaseline = baseline > 0 ? baseline : currentAverage;
  
  // Flag transactions that are 400%+ above the baseline
  const threshold = effectiveBaseline * 4; // 400% = 4x
  
  const unusual = [];
  
  expenses.forEach(txn => {
    const amount = toUSD(txn);
    
    // Only flag if significantly above baseline (400%+)
    if (amount > threshold && threshold > 0) {
      const multiplier = (amount / effectiveBaseline).toFixed(1);
      unusual.push({
        transaction: txn,
        amount: amount,
        reason: `${multiplier}x average spending`,
        categoryId: txn.categoryId || '—'
      });
    }
  });
  
  // Sort by amount (largest first)
  unusual.sort((a, b) => b.amount - a.amount);
  
  return unusual;
}

// Get pending recurrent payments that are due
function getPendingRecurrentPayments() {
  if (!AppState || !AppState.State || !AppState.State.transactions) {
    return [];
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentDay = today.getDate();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  
  const pendingPayments = [];
  
  // Find all recurrent expense transactions that are not disabled
  const recurrentTxns = AppState.State.transactions.filter(txn => 
    txn.transactionType === 'Expense' && 
    txn.isRecurrent && 
    !txn.recurrentDisabled &&
    txn.recurrentDayOfMonth > 0
  );
  
  recurrentTxns.forEach(originalTxn => {
    const dayOfMonth = originalTxn.recurrentDayOfMonth;
    
    // Check if payment is due (current day >= day of month, or we're past it this month)
    // This handles cases where user opens app after the due day
    const isDueThisMonth = currentDay >= dayOfMonth;
    
    if (isDueThisMonth) {
      // Check if this payment has already been created this month
      // Look for a transaction with the same description, amount, fromAccount, category
      // created this month
      const monthStart = new Date(currentYear, currentMonth, 1).toISOString().slice(0, 10);
      const monthEnd = new Date(currentYear, currentMonth + 1, 0).toISOString().slice(0, 10);
      
      const alreadyCreated = AppState.State.transactions.some(txn => 
        txn.id !== originalTxn.id &&
        txn.transactionType === 'Expense' &&
        txn.description === originalTxn.description &&
        txn.fromAccountId === originalTxn.fromAccountId &&
        txn.categoryId === originalTxn.categoryId &&
        txn.amount === originalTxn.amount &&
        txn.currency === originalTxn.currency &&
        txn.date >= monthStart &&
        txn.date <= monthEnd &&
        !txn.isRecurrent // The created transaction is not itself recurrent
      );
      
      if (!alreadyCreated && isDueThisMonth) {
        // Calculate the due date (use the day of month, or last day if it doesn't exist)
        let dueDate = new Date(currentYear, currentMonth, dayOfMonth);
        
        // If the day doesn't exist in this month, use the last day
        if (dueDate.getDate() !== dayOfMonth || dueDate.getMonth() !== currentMonth) {
          dueDate = new Date(currentYear, currentMonth + 1, 0); // Last day of month
        }
        
        // Get account and category info
        const account = AppState.State.accounts.find(a => a.id === originalTxn.fromAccountId);
        const category = AppState.State.categories.find(c => c.id === originalTxn.categoryId);
        
        pendingPayments.push({
          originalTxnId: originalTxn.id,
          description: originalTxn.description || 'Recurrent payment',
          accountId: originalTxn.fromAccountId,
          accountName: account ? account.name : (originalTxn.fromAccountId === 'CASH' ? 'Cash' : 'Unknown Account'),
          categoryId: originalTxn.categoryId,
          categoryName: category ? category.name : 'Uncategorized',
          amount: originalTxn.amount,
          currency: originalTxn.currency || 'USD',
          fxRate: originalTxn.fxRate || 1,
          dueDate: dueDate.toISOString().slice(0, 10), // YYYY-MM-DD
          dayOfMonth: dayOfMonth
        });
      }
    }
  });
  
  // Sort by due date (earliest first)
  pendingPayments.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  
  return pendingPayments;
}

// Create an Expense transaction for a recurrent payment
async function createRecurrentPayment(pendingPayment) {
  if (!AppState || !AppState.State) {
    throw new Error('AppState not available');
  }
  
  // Find the original transaction
  const originalTxn = AppState.State.transactions.find(t => t.id === pendingPayment.originalTxnId);
  if (!originalTxn) {
    throw new Error('Original transaction not found');
  }
  
  // Create new Expense transaction
  const paymentTxn = AppState.newTransaction();
  paymentTxn.transactionType = 'Expense';
  paymentTxn.date = pendingPayment.dueDate;
  paymentTxn.amount = pendingPayment.amount;
  paymentTxn.currency = pendingPayment.currency;
  
  // For MXN, fetch today's FX rate; for USD, use 1
  if (pendingPayment.currency === 'MXN') {
    await Utils.ensureTodayFX();
    paymentTxn.fxRate = Utils.latestUsdPerMXN();
  } else {
    paymentTxn.fxRate = 1;
  }
  
  paymentTxn.fromAccountId = pendingPayment.accountId;
  paymentTxn.toAccountId = ''; // Not used for Expense
  paymentTxn.categoryId = pendingPayment.categoryId;
  paymentTxn.description = pendingPayment.description;
  paymentTxn.isDeferred = false;
  paymentTxn.deferredMonths = 0;
  paymentTxn.monthlyPaymentAmount = 0;
  paymentTxn.remainingMonths = 0;
  paymentTxn.isRecurrent = false; // The created transaction is not itself recurrent
  paymentTxn.recurrentDayOfMonth = 0;
  paymentTxn.recurrentDisabled = false;
  
  // Save the payment transaction
  await AppState.saveItem('transactions', paymentTxn, 'transactions');
  
  return paymentTxn;
}

// Disable a recurrent payment permanently
async function disableRecurrentPayment(originalTxnId) {
  if (!AppState || !AppState.State) {
    throw new Error('AppState not available');
  }
  
  const originalTxn = AppState.State.transactions.find(t => t.id === originalTxnId);
  if (!originalTxn) {
    throw new Error('Original transaction not found');
  }
  
  originalTxn.recurrentDisabled = true;
  await AppState.saveItem('transactions', originalTxn, 'transactions');
  
  return originalTxn;
}

// Financial Statements Calculations
function calculatePandL(transactions, startDate, endDate) {
  const filtered = transactions.filter(t => 
    t.date >= startDate && t.date <= endDate
  );
  
  let totalIncome = 0;
  let totalExpenses = 0;
  
  filtered.forEach(txn => {
    const usdAmount = txn.currency === 'USD' ? Number(txn.amount) : Number(txn.amount) * Number(txn.fxRate || 1);
    
    if (txn.transactionType === 'Income') {
      totalIncome += usdAmount;
    } else if (txn.transactionType === 'Expense' || txn.transactionType === 'Credit Card Interest') {
      totalExpenses += usdAmount;
    }
    // Note: Transfers and Credit Card Payments don't affect P&L
  });
  
  return {
    income: totalIncome,
    expenses: totalExpenses,
    net: totalIncome - totalExpenses
  };
}

function calculateCashFlow(transactions, startDate, endDate) {
  const filtered = transactions.filter(t => 
    t.date >= startDate && t.date <= endDate
  );
  
  let cashIn = 0;
  let cashOut = 0;
  
  filtered.forEach(txn => {
    const usdAmount = txn.currency === 'USD' ? Number(txn.amount) : Number(txn.amount) * Number(txn.fxRate || 1);
    
    if (txn.transactionType === 'Income') {
      // All income affects cash flow
      cashIn += usdAmount;
    } else if (txn.transactionType === 'Expense') {
      // Only expenses paid with cash/checking/savings affect cash flow
      // Check if fromAccountId is a regular account or a debit card
      let fromAccount = AppState && AppState.State ? AppState.State.accounts.find(a => a.id === txn.fromAccountId) : null;
      
      // If not found, check if it's a debit card ID
      if (!fromAccount && AppState && AppState.State) {
        for (const acc of AppState.State.accounts) {
          if (acc.debitCards && acc.debitCards.some(dc => dc.id === txn.fromAccountId)) {
            fromAccount = acc; // Use the parent account
            break;
          }
        }
      }
      
      if (fromAccount && accountType(fromAccount) !== 'credit-card') {
        cashOut += usdAmount;
      }
    } else if (txn.transactionType === 'Credit Card Payment') {
      // Credit card payments reduce cash flow
      cashOut += usdAmount;
    } else if (txn.transactionType === 'Transfer') {
      // Transfers between cash accounts don't affect net cash flow
      // But we track them for completeness
      const fromAccount = AppState && AppState.State ? AppState.State.accounts.find(a => a.id === txn.fromAccountId) : null;
      const toAccount = AppState && AppState.State ? AppState.State.accounts.find(a => a.id === txn.toAccountId) : null;
      
      if (fromAccount && accountType(fromAccount) !== 'credit-card') {
        cashOut += usdAmount;
      }
      if (toAccount && accountType(toAccount) !== 'credit-card') {
        cashIn += usdAmount;
      }
    }
  });
  
  return {
    cashIn: cashIn,
    cashOut: cashOut,
    net: cashIn - cashOut
  };
}

// Enhanced KPI calculation that includes both P&L and Cash Flow
function calculateFinancialKPIs(transactions, startDate, endDate) {
  // Safety check for function availability
  if (!calculatePandL || !calculateCashFlow) {
    console.warn('Financial calculation functions not available, using fallback');
    return {
      plIncome: 0,
      plExpenses: 0,
      plNet: 0,
      cfIn: 0,
      cfOut: 0,
      cfNet: 0,
      income: 0,
      expenses: 0,
      net: 0,
      largest: 0,
      topCatName: 'None'
    };
  }
  
  const pandl = calculatePandL(transactions, startDate, endDate);
  const cashflow = calculateCashFlow(transactions, startDate, endDate);
  
  // Legacy calculations for backward compatibility
  const income = pandl.income;
  const expenses = pandl.expenses;
  const net = pandl.net;
  
  // Find largest expense
  const expenseTxns = transactions.filter(t => 
    (t.transactionType === 'Expense' || t.transactionType === 'Credit Card Interest') && 
    t.date >= startDate && 
    t.date <= endDate
  );
  const largest = expenseTxns.reduce((max, t) => {
    const usdAmount = t.currency === 'USD' ? Number(t.amount) : Number(t.amount) * Number(t.fxRate || 1);
    return usdAmount > max.amount ? { amount: usdAmount, txn: t } : max;
  }, { amount: 0, txn: null });
  
  // Find top spending category
  const categorySpending = {};
  expenseTxns.forEach(t => {
    const categoryId = t.categoryId || t.toCategoryId;
    const category = AppState && AppState.State ? AppState.State.categories.find(c => c.id === categoryId) : null;
    const categoryName = category ? category.name : 'Other';
    const usdAmount = t.currency === 'USD' ? Number(t.amount) : Number(t.amount) * Number(t.fxRate || 1);
    categorySpending[categoryName] = (categorySpending[categoryName] || 0) + usdAmount;
  });
  
  const topCategory = Object.entries(categorySpending).reduce((max, [name, amount]) => 
    amount > max.amount ? { name, amount } : max, 
    { name: 'None', amount: 0 }
  );
  
  return {
    // P&L Statement
    plIncome: pandl.income,
    plExpenses: pandl.expenses,
    plNet: pandl.net,
    
    // Cash Flow Statement
    cfIn: cashflow.cashIn,
    cfOut: cashflow.cashOut,
    cfNet: cashflow.net,
    
    // Legacy KPIs (for backward compatibility)
    income: income,
    expenses: expenses,
    net: net,
    largest: largest.amount,
    topCatName: topCategory.name
  };
}
function groupBy(arr, fn){ return arr.reduce((a,x)=>{ const k=fn(x); (a[k]=a[k]||[]).push(x); return a; },{}); }
function confirmDialog(msg){ return new Promise(r=> r(window.confirm(msg))); }
function debounce(fn, wait=200){ let to; return (...args)=>{ clearTimeout(to); to=setTimeout(()=> fn(...args), wait); }; }
function accountById(id){ return AppState.State.accounts.find(a=>a.id===id); }
function accountName(id){ 
  if (!id) return '—';
  // Handle special "Cash" account
  if (id === 'CASH') return 'Cash';
  // First check if it's a regular account
  const account = accountById(id);
  if (account) return account.name;
  
  // If not found, check if it's a debit card ID
  for (const acc of AppState.State.accounts) {
    if (acc.debitCards) {
      const debitCard = acc.debitCards.find(dc => dc.id === id);
      if (debitCard) {
        return `${debitCard.name} (${acc.name})`;
      }
    }
  }
  
  return '—';
}
function categoryById(id){ return AppState.State.categories.find(c=>c.id===id); }
function parentCategoryName(id){
  const cat=categoryById(id);
  if(!cat) return 'Uncategorized';
  if(!cat.parentCategoryId) return cat.name;
  const parent=categoryById(cat.parentCategoryId);
  return parent? parent.name : cat.name;
}
function accountType(account){ return AppState.normalizeAccount(account||{}).accountType; }
function accountIcon(account){
  const type=accountType(account);
  if(type==='checking') return '🏦';
  if(type==='savings') return '💰';
  if(type==='credit-card') return '💳';
  if(type==='cash') return '💵';
  return '🏦';
}
function accountThemeVar(account){
  const type=accountType(account);
  return {
    'checking':'var(--checking-color)',
    'savings':'var(--savings-color)',
    'credit-card':'var(--creditcard-color)',
    'cash':'var(--cash-color)'
  }[type] || 'var(--primary)';
}
function mapTransactionParties(txn){
  const type=txn.transactionType;
  if(type==='Expense'){
    return { from: accountName(txn.fromAccountId), to: parentCategoryName(txn.categoryId)||'—' };
  }
  if(type==='Income'){
    return { from: parentCategoryName(txn.categoryId)||'—', to: accountName(txn.toAccountId) };
  }
  if(type==='Transfer'){
    return { from: accountName(txn.fromAccountId), to: accountName(txn.toAccountId) };
  }
  if(type==='Credit Card Payment'){
    return { from: accountName(txn.fromAccountId), to: accountName(txn.toAccountId) };
  }
  return { from:'—', to:'—' };
}
function netWorthTimeline(){
  // SUPER SIMPLE: Calculate net worth for EVERY DAY
  // Formula: Net Worth = Assets - Liabilities
  
  if (!AppState || !AppState.State) return [];
  
  const accounts = [...AppState.State.accounts].map(AppState.normalizeAccount);
  const allTransactions = [...AppState.State.transactions].sort((a, b) => a.date.localeCompare(b.date));
  
  if (accounts.length === 0) return [];
  
  // Find date range
  const transactionDates = allTransactions.map(t => t.date);
  const balanceAsOfDates = accounts.map(a => a.balanceAsOfDate).filter(d => d);
  const allRelevantDates = [...transactionDates, ...balanceAsOfDates, todayISO()].filter(d => d);
  
  if (allRelevantDates.length === 0) return [];
  
  const startDate = allRelevantDates.sort()[0];
  const endDate = todayISO();
  
  // Generate EVERY day from start to end
  const allDates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    allDates.push(d.toISOString().slice(0, 10));
  }
  
  if (allDates.length === 0) return [];
  
  console.log('🔍 Net Worth Timeline Debug:');
  console.log(`  Date range: ${startDate} to ${endDate} (${allDates.length} days)`);
  console.log(`  Total transactions: ${allTransactions.length}`);
  console.log(`  Accounts: ${accounts.map(a => `${a.name} (${a.balanceAsOfDate || 'no date'})`).join(', ')}`);
  
  // Show sample transactions
  if (allTransactions.length > 0) {
    console.log('  Sample transactions:');
    allTransactions.slice(0, 10).forEach(t => {
      console.log(`    ${t.date} | ${t.transactionType} | $${t.amount} ${t.currency} | From: ${t.fromAccountId || 'none'} | To: ${t.toAccountId || 'none'}`);
    });
  }
  
  const timeline = [];
  const fxLatest = latestUsdPerMXN();
  let prevNetWorth = null;
  let changeCount = 0;
  let lastDayBalances = {}; // Store last day's balances for verification
  
  // For EACH day, calculate net worth
  for (const currentDate of allDates) {
    const transactionsUpToDate = allTransactions.filter(t => t.date <= currentDate);
    const accountBalances = {};
    
    accounts.forEach(acc => {
      const accountAsOfDate = acc.balanceAsOfDate || '';
      
      // Determine starting balance for this account
      // If currentDate is BEFORE balanceAsOfDate, we can't use balanceAsOfAmount yet
      // If currentDate is ON or AFTER balanceAsOfDate, start with balanceAsOfAmount
      let startingBalance = 0;
      
      if (!accountAsOfDate || currentDate >= accountAsOfDate) {
        // Use balanceAsOfAmount as starting point
        startingBalance = convertToUSD(acc.balanceAsOfAmount || 0, acc.currency || 'USD', fxLatest);
      } else {
        // For dates before balanceAsOfDate, we need to work backwards
        // Start from balanceAsOfAmount and subtract transactions between currentDate and balanceAsOfDate
        const asOfUSD = convertToUSD(acc.balanceAsOfAmount || 0, acc.currency || 'USD', fxLatest);
        const txnsBetween = allTransactions.filter(t => {
          const affectsAccount = (t.fromAccountId === acc.id || t.toAccountId === acc.id) ||
            (acc.debitCards && acc.debitCards.some(dc => dc.id === t.fromAccountId || dc.id === t.toAccountId));
          return affectsAccount && t.date > currentDate && t.date <= accountAsOfDate;
        });
        const reverseDelta = txnsBetween.reduce((sum, t) => sum + txnDeltaUSDForAccount(t, acc), 0);
        startingBalance = asOfUSD - reverseDelta;
      }
      
      // Add transactions after balanceAsOfDate (or all if no balanceAsOfDate) up to currentDate
      const relevantTxns = transactionsUpToDate.filter(t => {
        const affectsAccount = (t.fromAccountId === acc.id || t.toAccountId === acc.id) ||
          (acc.debitCards && acc.debitCards.some(dc => dc.id === t.fromAccountId || dc.id === t.toAccountId));
        // Include if no balanceAsOfDate OR transaction is after balanceAsOfDate
        return affectsAccount && (!accountAsOfDate || t.date > accountAsOfDate);
      });
      
      const delta = relevantTxns.reduce((sum, t) => {
        const txnDelta = txnDeltaUSDForAccount(t, acc);
        return sum + txnDelta;
      }, 0);
      
      accountBalances[acc.id] = startingBalance + delta;
    });
    
    // For today's date, use currentBalanceUSD directly to ensure accuracy
    let netWorth;
    if (currentDate === allDates[allDates.length - 1]) {
      // Use the exact same calculation as the current display for today
      const todayAssets = accounts
        .filter(a => {
          const type = accountType(a);
          return type === 'checking' || type === 'savings' || type === 'cash' || type === 'investment';
        })
        .reduce((sum, a) => sum + Math.max(0, currentBalanceUSD(a)), 0);
      
      const todayLiabilities = accounts.reduce((sum, a) => {
        const balance = currentBalanceUSD(a);
        const type = accountType(a);
        if (type === 'credit-card' || type === 'loan') {
          return sum + Math.abs(balance);
        }
        return sum + Math.max(0, -balance);
      }, 0);
      
      netWorth = todayAssets - todayLiabilities;
      lastDayBalances = {};
      accounts.forEach(acc => {
        lastDayBalances[acc.id] = currentBalanceUSD(acc);
      });
    } else {
      // For historical dates, use calculated balances
      // Calculate net worth: Assets - Liabilities
      const assets = accounts
        .filter(a => {
          const type = accountType(a);
          return type === 'checking' || type === 'savings' || type === 'cash' || type === 'investment';
        })
        .reduce((sum, a) => sum + Math.max(0, accountBalances[a.id] || 0), 0);
      
      const liabilities = accounts.reduce((sum, a) => {
        const balance = accountBalances[a.id] || 0;
        const type = accountType(a);
        if (type === 'credit-card' || type === 'loan') {
          return sum + Math.abs(balance);
        }
        return sum + Math.max(0, -balance);
      }, 0);
      
      netWorth = assets - liabilities;
    }
    
    if (prevNetWorth !== null && Math.abs(netWorth - prevNetWorth) > 0.01) {
      changeCount++;
      console.log(`📈 ${currentDate}: Net Worth CHANGED from $${prevNetWorth.toFixed(2)} to $${netWorth.toFixed(2)} (Δ${(netWorth - prevNetWorth).toFixed(2)})`);
    }
    prevNetWorth = netWorth;
    
    timeline.push({ date: currentDate, netWorthUSD: netWorth });
  }
  
  console.log(`✅ Timeline complete: ${timeline.length} data points, ${changeCount} changes detected`);
  
  // VERIFICATION: Check that today's net worth matches the current calculation
  if (timeline.length > 0) {
    const todayNW = timeline[timeline.length - 1].netWorthUSD;
    const currentNW = UI.calcNetWorthUSD();
    const diff = Math.abs(todayNW - currentNW);
    
    if (diff > 0.01) {
      console.error(`❌ VERIFICATION FAILED: Today's net worth in timeline ($${todayNW.toFixed(2)}) doesn't match current calculation ($${currentNW.toFixed(2)}) - difference: $${diff.toFixed(2)}`);
      console.error('   This means the timeline calculation logic doesn\'t match the current balance calculation.');
      console.error('   Checking account balances...');
      
      // Debug: Compare individual account balances
      accounts.forEach(acc => {
        const timelineBalance = lastDayBalances[acc.id] || 0;
        const currentBalance = currentBalanceUSD(acc);
        const accDiff = Math.abs(timelineBalance - currentBalance);
        if (accDiff > 0.01) {
          console.error(`   ${acc.name}: Timeline=$${timelineBalance.toFixed(2)}, Current=$${currentBalance.toFixed(2)}, Diff=$${accDiff.toFixed(2)}`);
        }
      });
    } else {
      console.log(`✅ VERIFICATION PASSED: Today's net worth matches current calculation ($${todayNW.toFixed(2)})`);
    }
  }
  
  if (changeCount === 0) {
    console.error('❌ PROBLEM: Net worth never changed! This means either:');
    console.error('   1. All transactions are transfers (which don\'t change net worth)');
    console.error('   2. All transactions are before balanceAsOfDate (so they\'re excluded)');
    console.error('   3. Transactions aren\'t affecting account balances correctly');
  }
  
  // Use snapshots where available
  if (AppState.State.snapshots && AppState.State.snapshots.length > 0) {
    const snapshotMap = new Map();
    AppState.State.snapshots.forEach(snap => {
      if (snap.date && snap.netWorthUSD !== undefined) {
        snapshotMap.set(snap.date, snap.netWorthUSD);
      }
    });
    timeline.forEach(point => {
      if (snapshotMap.has(point.date)) {
        point.netWorthUSD = snapshotMap.get(point.date);
      }
    });
  }
  
  return timeline;
}
function buildCategoryOptions(type){
  const cats=AppState.State.categories.filter(c=>c.type===type);
  const roots=cats.filter(c=>!c.parentCategoryId).sort((a,b)=> a.name.localeCompare(b.name));
  const children=pid=> cats.filter(c=>c.parentCategoryId===pid).sort((a,b)=> a.name.localeCompare(b.name));
  const out=[]; roots.forEach(r=>{ const kids=children(r.id); if(kids.length){ out.push(`<optgroup label="${r.name}">`); kids.forEach(k=> out.push(`<option value="${k.id}">— ${k.name}</option>`)); out.push(`</optgroup>`);} else { out.push(`<option value="${r.id}">${r.name}</option>`);} });   return out.join('');
}

// Simple credit card cycle validation - just checks that required values are set correctly
function validateCreditCardCycle(input) {
  if (!input) {
    return {
      confidence: 'LOW',
      status: 'ERROR',
      headline: 'Invalid input',
      bullets: ['Please provide credit card information'],
      warnings: ['No input provided'],
      actions: ['Fill in the credit card form'],
      inferred: {},
      cycle: {}
    };
  }
  
  const warnings = [];
  const actions = [];
  const bullets = [];
  
  // Check required fields
  const hasClosingDate = !!(input.statementPeriodEnd || input.nextClosingDate);
  const hasDueDate = !!input.paymentDueDate;
  const hasCreditLimit = !!(input.creditLimit && input.creditLimit > 0);
  const hasBalance = !!(input.statementBalance !== undefined && input.statementBalance !== null) || 
                     !!(input.currentBalance !== undefined && input.currentBalance !== null);
  
  // Validate dates and calculate grace period correctly
  let datesValid = false;
  let graceDays = 0;
  if (hasClosingDate && hasDueDate) {
    try {
      const closingDateStr = input.statementPeriodEnd || input.nextClosingDate;
      const dueDateStr = input.paymentDueDate;
      
      const closingDate = new Date(closingDateStr + 'T00:00:00');
      const dueDate = new Date(dueDateStr + 'T00:00:00');
      
      if (!isNaN(closingDate.getTime()) && !isNaN(dueDate.getTime())) {
        // Calculate grace period correctly (handles due date in next month)
        graceDays = calculateGracePeriod(closingDateStr, dueDateStr);
        
        // Grace period should be reasonable (typically 20-30 days, but allow 15-35 for flexibility)
        datesValid = graceDays >= 15 && graceDays <= 35;
        
        if (!datesValid) {
          warnings.push(`Grace period is ${graceDays} days, which seems unusual. Most cards have 20-30 days.`);
          actions.push('Verify that the closing date and due date are correct');
        }
      } else {
        warnings.push('Invalid date format detected');
        actions.push('Check that dates are in YYYY-MM-DD format');
      }
    } catch (e) {
      warnings.push('Error validating dates: ' + e.message);
    }
  }
  
  // Check missing fields
  if (!hasClosingDate) {
    warnings.push('Closing date is not set');
    actions.push('Set the billing cycle closing date');
  }
  
  if (!hasDueDate) {
    warnings.push('Payment due date is not set');
    actions.push('Set the payment due date');
  }
  
  // Credit limit is optional - don't show as warning, just note in actions if missing
  if (!hasCreditLimit) {
    // Don't add to warnings - it's optional
    // actions.push('Set your credit limit for accurate tracking (optional)');
  }
  
  if (!hasBalance) {
    warnings.push('Current balance is not set');
    actions.push('Set the current balance from your credit card app');
  }
  
  // Determine status and confidence
  let status = 'OK';
  let confidence = 'HIGH';
  let headline = 'Credit card setup is complete';
  
  if (warnings.length > 0) {
    // Only show WARNING status if critical fields are missing
    const criticalMissing = !hasClosingDate || !hasDueDate || !hasBalance;
    status = criticalMissing ? 'WARNING' : 'OK';
    confidence = criticalMissing ? 'MEDIUM' : 'HIGH';
    headline = warnings.length === 1 ? 'One item needs attention' : `${warnings.length} items need attention`;
  }
  
  // If everything is set correctly, show simple success message
  if (warnings.length === 0 && hasClosingDate && hasDueDate && datesValid) {
    headline = 'Setup is correct ✓';
    status = 'OK';
    confidence = 'HIGH';
  } else if (warnings.length > 0) {
    // Show what needs to be fixed
    headline = warnings.length === 1 ? 'Setup issue found' : `${warnings.length} issues found`;
  } else {
    headline = 'Setup incomplete';
  }
  
  return {
    confidence: confidence,
    status: status,
    headline: headline,
    bullets: [], // Don't repeat information - it's already shown above
    warnings: warnings,
    actions: actions,
    inferred: {}, // No inference needed - user provides all values
    cycle: {
      closingDate: input.statementPeriodEnd || input.nextClosingDate || '',
      dueDate: input.paymentDueDate || '',
      graceDays: graceDays,
      creditLimit: input.creditLimit || 0,
      availableCredit: (input.creditLimit > 0 && hasBalance) 
        ? Math.max(0, input.creditLimit - (input.currentBalance || input.statementBalance || 0)) 
        : 0
    }
  };
}

window.Utils = {
  $, $all, formatMoneyUSD, formatMoneyUSDNoDecimals, formatMoney, formatPercent, monthKey, todayISO,
  formatDate, formatShortDate, formatMonthHeader,
  fetchUsdPerMXN, latestUsdPerMXN, ensureTodayFX, ensureFxForDate, convertToUSD,
  within, txnDeltaUSDForAccount, currentBalanceUSD, currentBalanceNative, creditLimitUSD, nextDueDates, formatAmountWithNative,
  isDuePaid, groupBy, confirmDialog, debounce, buildCategoryOptions,
  accountById, accountName, categoryById, parentCategoryName, accountType,
  accountIcon, accountThemeVar, mapTransactionParties, netWorthTimeline,
  showCdnWarning, fetchHistoricalFXRate, updateDeferredTransactionMonths,
  getApiKey, setApiKey, getFallbackRate, setDefaultApiKeys,
  calculateCreditCardPaymentDue, calculateMonthlyPayment, getCreditCardUtilization, getAvailableCredit,
  getCreditCardInstallmentInfo, validateCreditCardCycle, calculateGracePeriod,
  getPendingInstallmentPayments, createInstallmentPayment, detectUnusualTransactions,
  getPendingRecurrentPayments, createRecurrentPayment, disableRecurrentPayment
};
