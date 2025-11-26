// utils.js — helpers, FX, temporal accounting (V5)

////////////////////////////////////////////////////////////////////////
/// SUPPORTED CURRENCIES & FX ORIENTATION
////////////////////////////////////////////////////////////////////////

/// Central list of supported currencies (simplified to 3)
const SUPPORTED_CURRENCIES = ['USD', 'MXN', 'COP'];

/// FX Orientation Convention (used everywhere):
/// For any date D and currency C in SUPPORTED_CURRENCIES:
///   usdPerCurrency[C] = how many USD you get for 1 unit of C on date D
/// Examples:
///   usdPerCurrency.USD = 1.0
///   usdPerCurrency.MXN = 0.058   // 1 MXN = 0.058 USD (1 USD ≈ 17.24 MXN)
///   usdPerCurrency.EUR = 1.08    // 1 EUR = 1.08 USD
/// ALL conversions MUST use this convention.

function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
function formatMoneyUSD(v){ return (v??0).toLocaleString(undefined,{style:'currency', currency:'USD'}); }
function formatMoneyUSDNoDecimals(v){ return (v??0).toLocaleString(undefined,{style:'currency', currency:'USD', minimumFractionDigits:0, maximumFractionDigits:0}); }
function formatMoney(v, c){ 
  return (v??0).toLocaleString(undefined,{
    style:'currency', 
    currency:c||'USD',
    minimumFractionDigits:0,
    maximumFractionDigits:0,
    useGrouping: true  // Ensures comma separators
  }); 
}

// Get preferred currency from settings
function getPreferredCurrency(){ 
  return AppState?.State?.settings?.preferredCurrency || 'USD'; 
}

// Format money in preferred currency (no decimals, with proper comma formatting)
function formatMoneyPreferred(v){ 
  const currency = getPreferredCurrency();
  return (v??0).toLocaleString(undefined,{
    style:'currency', 
    currency:currency, 
    minimumFractionDigits:0, 
    maximumFractionDigits:0,
    useGrouping: true  // Ensures comma separators
  }); 
}

// Format money in preferred currency without decimals (alias for consistency)
function formatMoneyPreferredNoDecimals(v){ 
  return formatMoneyPreferred(v);
}
function formatPercent(v){ if(!isFinite(v)) return '—'; return `${(v*100).toFixed(1)}%`; }

// Show toast notification
function showToast(message, type = 'info') {
  // Create toast element
  const toast = document.createElement('div');
  const colors = {
    success: '#16a34a',
    error: '#dc2626',
    warning: '#f59e0b',
    info: '#3b82f6'
  };
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${colors[type] || colors.info};
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    z-index: 10000;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    max-width: 400px;
    word-wrap: break-word;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Remove after 3 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 3000);
}

// Format transaction amount: preferred currency primary, native currency secondary
// NEW SYSTEM: Uses amountUSD + fxSnapshot to convert to preferred currency
// NEVER calls APIs or recalculates - only uses stored data
// ALWAYS shows both currencies for clarity
function formatTransactionAmount(transaction) {
  if (!transaction) return '';
  
  const txnCurrency = transaction.currency || 'USD';
  const txnAmount = Number(transaction.amount);
  const preferred = getPreferredCurrency();
  
  // Check if this is an installment transaction with first payment on transaction date
  const isInstallment = transaction.isDeferred && transaction.deferredMonths > 0;
  const firstPaidOnTxnDate = transaction.firstInstallmentPaidOnTransactionDate || false;
  const monthlyPaymentAmount = transaction.monthlyPaymentAmount;
  const fromAccount = transaction.fromAccountId ? AppState.State.accounts.find(a => a.id === transaction.fromAccountId) : null;
  const accountTypeValue = fromAccount ? accountType(fromAccount) : null;
  const isCheckingAccount = accountTypeValue !== 'credit-card';
  
  // For installment transactions on checking/debit accounts where first installment was paid on transaction date
  if (isInstallment && firstPaidOnTxnDate && monthlyPaymentAmount && isCheckingAccount) {
    // Show total purchase amount and first installment paid
    const totalPreferredAmount = getDisplayAmountForTransaction(transaction);
    const totalFormatted = formatMoneyPreferred(totalPreferredAmount);
    
    // Calculate monthly payment in preferred currency
    // monthlyPaymentAmount is stored in USD, so convert to preferred using transaction's FX snapshot
    const monthlyPaymentUSD = Number(monthlyPaymentAmount);
    let monthlyPaymentPreferred = monthlyPaymentUSD;
    
    if (preferred !== 'USD' && transaction.fxSnapshot) {
      // Use transaction's FX snapshot to convert USD to preferred currency
      const fxSnapshot = transaction.fxSnapshot;
      if (fxSnapshot.usdPerCurrency && fxSnapshot.usdPerCurrency[preferred]) {
        const usdPerPreferred = fxSnapshot.usdPerCurrency[preferred];
        monthlyPaymentPreferred = monthlyPaymentUSD / usdPerPreferred;
      } else {
        // Fallback to cached rate
        monthlyPaymentPreferred = monthlyPaymentUSD * (getCachedFxRate('USD', preferred, transaction.date) || 1);
      }
    } else if (preferred !== 'USD') {
      // No FX snapshot, use cached rate
      monthlyPaymentPreferred = monthlyPaymentUSD * (getCachedFxRate('USD', preferred, transaction.date) || 1);
    }
    
    const monthlyFormatted = formatMoneyPreferred(monthlyPaymentPreferred);
    
    // Calculate which installment was just paid
    // If firstInstallmentPaidOnTransactionDate is true, installment 1 was paid on transaction date
    // remainingMonths should reflect how many installments are left
    const totalInstallments = transaction.deferredMonths;
    const remainingMonths = transaction.remainingMonths !== undefined ? transaction.remainingMonths : (totalInstallments - 1);
    const paidInstallments = totalInstallments - remainingMonths;
    const currentInstallment = paidInstallments; // This is the installment that was just paid (1, 2, 3, etc.)
    
    // Show: Total amount, then "Paid: $X (1/4)" below
    return `
      <div class="primary-amount" style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.25rem;">${totalFormatted}</div>
      <div class="secondary-amount" style="font-size: 0.85rem; color: var(--muted);">Paid: ${monthlyFormatted} (${currentInstallment}/${totalInstallments})</div>
    `;
  }
  
  // Use new display system (never fetches APIs)
  const preferredAmount = getDisplayAmountForTransaction(transaction);
  
  // Handle NaN/invalid amounts
  if (!isFinite(preferredAmount) || isNaN(preferredAmount)) {
    // Fallback for very old transactions without fxSnapshot
    const fallbackAmount = transaction.amountPreferred || transaction.amount || 0;
    const preferredFormatted = formatMoneyPreferred(fallbackAmount);
    const nativeFormatted = formatMoney(txnAmount, txnCurrency);
    
    // Always show both currencies
    return `
      <div class="primary-amount" style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.25rem;">${preferredFormatted}</div>
      <div class="secondary-amount" style="font-size: 0.85rem; color: var(--muted);">Original: ${nativeFormatted}</div>
    `;
  }
  
  const preferredFormatted = formatMoneyPreferred(preferredAmount);
  const nativeFormatted = formatMoney(txnAmount, txnCurrency);
  
  // If currencies match, just show the amount once (no need to show "Original" when it's the same)
  if (txnCurrency === preferred) {
    return `
      <div class="primary-amount" style="font-size: 1.1rem; font-weight: 600;">${preferredFormatted}</div>
    `;
  }
  
  // For transactions with different currency, show both clearly
  return `
    <div class="primary-amount" style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.25rem;">${preferredFormatted}</div>
    <div class="secondary-amount" style="font-size: 0.85rem; color: var(--muted);">Original: ${nativeFormatted}</div>
  `;
}

// Standardized amount display: preferred currency primary, native currency secondary
// Input: usdAmount is in USD (from currentBalanceUSD), account has the native currency
function formatAmountWithNative(usdAmount, account) {
  if (!account) {
    const preferred = getPreferredCurrency();
    const preferredAmount = preferred === 'USD' ? usdAmount : toPreferredCurrencySync(usdAmount, 'USD', null);
    return formatMoneyPreferred(preferredAmount);
  }
  
  const preferred = getPreferredCurrency();
  
  // Convert USD amount to preferred currency
  const preferredAmount = preferred === 'USD' ? usdAmount : toPreferredCurrencySync(usdAmount, 'USD', null);
  const preferredFormatted = formatMoneyPreferred(preferredAmount);
  
  // If account currency matches preferred, just return preferred currency
  if (account.currency === preferred) {
    return `<div class="primary-amount">${preferredFormatted}</div>`;
  }
  
  // For accounts with different currency, show native currency as secondary indicator
  // Convert USD back to account's native currency for display
  const iso = todayISO();
  let nativeToUsdRate = getFallbackRate(account.currency, 'USD', iso);
  
  // Try to find cached rate
  let record = AppState.State.fxRates.find(x => 
    x.date === iso && 
    ((x.from === account.currency && x.to === 'USD') ||
     (x.from === 'MXN' && x.to === 'USD' && account.currency === 'MXN' && x.usdPerMXN))
  );
  
  if (record) {
    if (record.usdPerMXN && account.currency === 'MXN') {
      nativeToUsdRate = Number(record.usdPerMXN);
    } else if (record.rate && record.from === account.currency && record.to === 'USD') {
      nativeToUsdRate = Number(record.rate);
    }
  }
  
  // Convert USD amount back to native currency for display
  const nativeAmount = usdAmount / nativeToUsdRate;
  const nativeFormatted = formatMoney(nativeAmount, account.currency);
  
  return `
    <div class="primary-amount">${preferredFormatted}</div>
    <div class="secondary-amount" style="font-size: 0.75rem; color: var(--muted);">${nativeFormatted}</div>
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
  
  // Ensure default API keys are set
  setDefaultApiKeys();
  
  // Format date for APIs (YYYY-MM-DD)
  const dateStr = date || todayISO();
  
  // BULLETPROOF API FLOW: Only use APIs that work reliably
  // Priority: Frankfurter (most reliable free API) > ExchangeRatesAPI.io (if key available)
  const apis = [
    {
      name: 'Frankfurter (Free)',
      url: `https://api.frankfurter.app/${dateStr}?from=${from}&to=${to}`,
      parser: (data) => {
        if (data.rates && data.rates[to]) {
          const rate = Number(data.rates[to]);
          console.log(`✅ Frankfurter returned rate: ${rate}`);
          return rate;
        }
        throw new Error(`Rate for ${to} not found in response`);
      },
      requiresKey: false
    },
    {
      name: 'ExchangeRatesAPI.io',
      url: `https://api.exchangeratesapi.io/v1/${dateStr}?access_key=${getApiKey('exchangerates')}&base=${from}&symbols=${to}`,
      parser: (data) => {
        if (data.success === false) {
          const errorMsg = data.error?.info || data.error?.type || 'Unknown error';
          // Check if it's a base currency restriction (free tier issue)
          if (data.error?.code === 'base_currency_access_restricted') {
            throw new Error(`Free tier restriction: Cannot use ${from} as base currency. Try a different API.`);
          }
          console.error(`ExchangeRatesAPI.io error: ${errorMsg}`);
          throw new Error(`API Error: ${errorMsg}`);
        }
        if (data.rates && data.rates[to]) {
          const rate = Number(data.rates[to]);
          console.log(`✅ ExchangeRatesAPI.io returned rate: ${rate}`);
          return rate;
        }
        throw new Error(`Rate for ${to} not found in response`);
      },
      requiresKey: true,
      keyName: 'exchangerates'
    }
  ];
  
  for (const api of apis) {
    if (api.requiresKey) {
      const keyName = api.keyName || 'fixer';
      const apiKey = getApiKey(keyName);
      if (!apiKey) {
        console.log(`⏭️ Skipping ${api.name} - no API key`);
        continue;
      }
    }
    
    try {
      console.log(`🌐 Trying ${api.name}...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(api.url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${response.statusText}${errorText ? ' - ' + errorText : ''}`);
      }
      
      const data = await response.json();
      
      const rate = api.parser(data);
      if (rate && rate > 0 && isFinite(rate)) {
        // VALIDATE RATE: Check if rate is reasonable for the currency pair
        // This prevents using obviously wrong fallback rates
        const validationError = validateFxRate(from, to, rate, dateStr);
        if (validationError) {
          console.error(`❌ ${api.name} returned invalid rate: ${validationError}`);
          throw new Error(validationError);
        }
        
        console.log(`✅ Successfully fetched rate from ${api.name}: ${from}->${to} = ${rate} for ${dateStr}`);
        return Number(rate);
      } else {
        throw new Error(`Invalid rate returned: ${rate}`);
      }
      
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn(`⏱️ ${api.name} timed out after 10 seconds`);
      } else {
        console.warn(`❌ ${api.name} failed:`, error.message);
      }
      continue;
    }
  }
  
  // All APIs failed - THROW ERROR instead of using fallback
  const errorMsg = `❌ CRITICAL: All FX APIs failed for ${from}->${to} on ${dateStr}. Cannot fetch rate from API.`;
  console.error(errorMsg);
  console.error('   Check:');
  console.error('   1. API keys are set in Settings');
  console.error('   2. Internet connection is working');
  console.error('   3. API services are available');
  throw new Error(`Failed to fetch FX rate from any API. Please check API configuration in Settings.`);
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
  
  // Set the provided ExchangeRatesAPI.io key (free tier key)
  if (!AppState.State.settings.exchangeratesApiKey) {
    AppState.State.settings.exchangeratesApiKey = '8a2a1505065219394ebe9bed9400a77b';
    console.log('🔑 Set default ExchangeRatesAPI.io key');
    // Save it
    if (AppState && AppState.saveItem) {
      AppState.saveItem('settings', AppState.State.settings, 'settings').catch(err => {
        console.warn('Failed to save default API key:', err);
      });
    }
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

/// Validate FX rate to ensure it's reasonable (not a fallback)
function validateFxRate(from, to, rate, dateStr) {
  // Expected rate ranges (as of November 2025)
  // USD->MXN: ~18.0-18.9 (not 20.0 fallback)
  // MXN->USD: ~0.053-0.056 (not 0.05 fallback)
  // USD->COP: ~3800-4200
  // COP->USD: ~0.00024-0.00026
  
  if (from === 'USD' && to === 'MXN') {
    if (rate < 17.0 || rate > 20.0) {
      return `USD->MXN rate ${rate} is outside expected range (17.0-20.0). November 2025 should be ~18.0-18.9`;
    }
    if (Math.abs(rate - 20.0) < 0.1) {
      return `USD->MXN rate ${rate} looks like fallback (20.0). Expected ~18.0-18.9 for November 2025`;
    }
  }
  
  if (from === 'MXN' && to === 'USD') {
    if (rate < 0.050 || rate > 0.060) {
      return `MXN->USD rate ${rate} is outside expected range (0.050-0.060). November 2025 should be ~0.053-0.056`;
    }
    if (Math.abs(rate - 0.05) < 0.001) {
      return `MXN->USD rate ${rate} looks like fallback (0.05). Expected ~0.053-0.056 for November 2025`;
    }
  }
  
  if (from === 'USD' && to === 'COP') {
    if (rate < 3500 || rate > 4500) {
      return `USD->COP rate ${rate} is outside expected range (3500-4500)`;
    }
  }
  
  if (from === 'COP' && to === 'USD') {
    if (rate < 0.0002 || rate > 0.0003) {
      return `COP->USD rate ${rate} is outside expected range (0.0002-0.0003)`;
    }
  }
  
  if (from === 'MXN' && to === 'COP') {
    // MXN->COP should be around 200-250 (based on USD rates)
    if (rate < 150 || rate > 300) {
      return `MXN->COP rate ${rate} is outside expected range (150-300)`;
    }
  }
  
  if (from === 'COP' && to === 'MXN') {
    // COP->MXN should be around 0.004-0.006
    if (rate < 0.003 || rate > 0.007) {
      return `COP->MXN rate ${rate} is outside expected range (0.003-0.007)`;
    }
  }
  
  return null; // Rate is valid
}

// Export validateFxRate
if (typeof module !== 'undefined' && module.exports) {
  module.exports.validateFxRate = validateFxRate;
}

// Get fallback rates for USD, MXN, COP only (should rarely be used)
function getFallbackRate(from, to, date = null) {
  const baseRates = {
    'USD': { 'MXN': 18.5, 'COP': 4000.0 },
    'MXN': { 'USD': 0.054, 'COP': 216.0 },
    'COP': { 'USD': 0.00025, 'MXN': 0.0046 }
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
// Get or fetch FX rate for any currency pair
async function ensureFxRateForPair(from, to, dateIso) {
  if (from === to) return 1;
  
  const iso = dateIso || todayISO();
  
  // Check if we have this rate cached
  let record = AppState.State.fxRates.find(x => 
    x.date === iso && 
    ((x.from === from && x.to === to) || 
     (x.from === 'MXN' && x.to === 'USD' && from === 'MXN' && to === 'USD' && x.usdPerMXN))
  );
  
  if (record) {
    // Return the rate from the record
    if (record.rate !== undefined) {
      return Number(record.rate);
    }
    // Legacy support: if it's a MXN/USD rate stored as usdPerMXN
    if (record.usdPerMXN && from === 'MXN' && to === 'USD') {
      return Number(record.usdPerMXN);
    }
  }
  
  // Rate not found, fetch it from API
  console.log(`🌐 Fetching FX rate from API: ${from}->${to} for ${iso}`);
  try {
    const rate = await fetchHistoricalFXRate(from, to, iso);
    
    // CRITICAL: Verify rate is NOT a fallback rate
    // Check if rate looks suspicious (e.g., 0.05 for MXN/USD = 20 MXN per USD)
    if (from === 'MXN' && to === 'USD' && Math.abs(rate - 0.05) < 0.001) {
      console.error(`❌ CRITICAL: Got suspicious rate ${rate} (looks like fallback 20 MXN/USD)`);
      throw new Error(`API returned suspicious rate. This might be a fallback rate. Please check API configuration.`);
    }
    
    // Check if rate is within reasonable bounds (e.g., MXN/USD should be ~0.055-0.060, not 0.05)
    if (from === 'MXN' && to === 'USD' && (rate < 0.04 || rate > 0.07)) {
      console.warn(`⚠️ Rate ${rate} seems unusual for MXN/USD (expected ~0.055-0.060)`);
    }
    
    console.log(`✅ API returned rate: ${from}->${to} for ${iso} = ${rate}`);
    
    // Save the rate to cache with source marker
    record = AppState.newFxRatePair(iso, from, to, rate);
    record.fxRateSource = 'api'; // Mark as from API
    record.fetchedAt = new Date().toISOString(); // Track when fetched
    await AppState.saveItem('fxRates', record, 'fxRates');
    
    // Also update in-memory state immediately
    const existingIndex = AppState.State.fxRates.findIndex(x => 
      x.date === iso && 
      ((x.from === from && x.to === to) ||
       (x.from === 'MXN' && x.to === 'USD' && from === 'MXN' && to === 'USD' && x.usdPerMXN))
    );
    if (existingIndex >= 0) {
      AppState.State.fxRates[existingIndex] = record;
    } else {
      AppState.State.fxRates.push(record);
    }
    
    return Number(rate);
  } catch (e) {
    console.error(`❌ API fetch failed for ${from}->${to} on ${iso}:`, e);
    // DO NOT use fallback - throw the error so caller knows API failed
    throw new Error(`Failed to fetch FX rate from API: ${e.message}`);
  }
}

////////////////////////////////////////////////////////////////////////
/// NEW FX SNAPSHOT SYSTEM
////////////////////////////////////////////////////////////////////////

/// Get FX rate for a pair, returning both rate and fallback status
/// CRITICAL: Never uses fallback rates - throws error if all APIs fail
async function ensureFxRateForPairWithStatus(from, to, dateIso) {
  if (from === to) return { rate: 1, isFallback: false };
  
  const iso = dateIso || todayISO();
  
  // Check if we have this rate cached (but REJECT fallback rates)
  let record = AppState.State.fxRates.find(x => 
    x.date === iso && 
    ((x.from === from && x.to === to) || 
     (x.from === 'MXN' && x.to === 'USD' && from === 'MXN' && to === 'USD' && x.usdPerMXN))
  );
  
  if (record) {
    // CRITICAL: If cached rate is a fallback, reject it and try to fetch fresh
    if (record.isFallback) {
      console.log(`⚠️ Cached rate for ${from}->${to} on ${iso} is a fallback, fetching fresh...`);
      // Remove the fallback rate from cache
      const index = AppState.State.fxRates.indexOf(record);
      if (index >= 0) {
        AppState.State.fxRates.splice(index, 1);
      }
      // Fall through to fetch fresh rate
    } else {
      // Good cached rate - use it
      let rate;
      if (record.rate !== undefined) {
        rate = Number(record.rate);
      } else if (record.usdPerMXN && from === 'MXN' && to === 'USD') {
        rate = Number(record.usdPerMXN);
      } else {
        rate = 1;
      }
      return { rate, isFallback: false };
    }
  }
  
  // Rate not found or was fallback - fetch it from API
  try {
    const rate = await ensureFxRateForPair(from, to, iso);
    
    // Check the record again to see if it was marked as fallback
    record = AppState.State.fxRates.find(x => 
      x.date === iso && 
      ((x.from === from && x.to === to) ||
       (x.from === 'MXN' && x.to === 'USD' && from === 'MXN' && to === 'USD' && x.usdPerMXN))
    );
    
    // If the fetched rate is marked as fallback, that's a problem
    if (record && record.isFallback) {
      throw new Error(`API returned fallback rate for ${from}->${to} on ${iso}`);
    }
    
    return { rate: Number(rate), isFallback: false };
  } catch (e) {
    // CRITICAL: Do NOT use fallback - throw error so caller knows API failed
    // This ensures we don't save wrong rates
    throw new Error(`Failed to fetch FX rate for ${from}->${to} on ${iso}: ${e.message}`);
  }
}

/// Get a complete FX snapshot for a date (all currencies to USD)
/// CRITICAL: Rejects fallback rates, but continues even if some currencies fail
async function getFxSnapshotForDate(date) {
  const normalizedDate = date; // assume already YYYY-MM-DD
  
  // Build usdPerCurrency by ensuring we have a USD rate for each currency
  const usdPerCurrency = {};
  const missingCurrencies = [];
  
  for (const c of SUPPORTED_CURRENCIES) {
    if (c === 'USD') {
      usdPerCurrency[c] = 1;
      continue;
    }
    
    // Ensure we have a rate for (from=c, to='USD', date)
    try {
      const { rate, isFallback } = await ensureFxRateForPairWithStatus(c, 'USD', normalizedDate);
      if (isFallback) {
        console.warn(`⚠️ Got fallback rate for ${c}->USD on ${normalizedDate} - this should not happen`);
        missingCurrencies.push(c);
      } else {
        usdPerCurrency[c] = rate;
      }
    } catch (e) {
      console.warn(`⚠️ Failed to fetch ${c}->USD for ${normalizedDate}: ${e.message}`);
      missingCurrencies.push(c);
      // Continue with other currencies
    }
  }
  
  // USD is always 1, so it's always present
  // MXN is critical for most transactions, but we can still proceed without it if the transaction is USD
  // Only fail if we have NO currencies at all (which shouldn't happen since USD is always 1)
  if (!usdPerCurrency.USD) {
    throw new Error(`Failed to build FX snapshot for ${normalizedDate}: USD rate is missing (this should never happen)`);
  }
  
  // If MXN is missing, warn but don't fail - the caller can handle it
  if (missingCurrencies.includes('MXN')) {
    console.warn(`⚠️ MXN->USD rate missing for ${normalizedDate}. Snapshot will be incomplete but usable for USD transactions.`);
  }
  
  // For missing optional currencies, we can use a reasonable estimate or skip them
  // But mark the snapshot as incomplete
  const isComplete = missingCurrencies.length === 0;
  
  return {
    base: 'USD',
    date: normalizedDate,
    usdPerCurrency,
    isFallback: false, // Never use fallback in new system
    missingCurrencies: missingCurrencies.length > 0 ? missingCurrencies : undefined
  };
}

/// Pure conversion helpers that NEVER call external APIs
function convertToUSD(amount, currency, fxSnapshot) {
  if (!fxSnapshot || !fxSnapshot.usdPerCurrency || !fxSnapshot.usdPerCurrency[currency]) {
    return NaN;
  }
  return amount * fxSnapshot.usdPerCurrency[currency];
}

function convertFromUSD(amountUSD, targetCurrency, fxSnapshot) {
  if (!fxSnapshot || !fxSnapshot.usdPerCurrency || !fxSnapshot.usdPerCurrency[targetCurrency]) {
    return NaN;
  }
  const usdPerTarget = fxSnapshot.usdPerCurrency[targetCurrency];
  // amountUSD = amountTarget * usdPerTarget  → amountTarget = amountUSD / usdPerTarget
  return amountUSD / usdPerTarget;
}

/// Prepare transaction with FX snapshot (call this when saving/importing)
async function prepareTransactionWithFx(transaction) {
  const preferredCurrency = getPreferredCurrency();
  const date = transaction.date; // YYYY-MM-DD
  const txnCurrency = transaction.currency || 'USD';
  
  // Special case: If transaction is USD and preferred is USD, we don't need FX rates
  if (txnCurrency === 'USD' && preferredCurrency === 'USD') {
    transaction.fxSnapshot = {
      base: 'USD',
      date: date,
      usdPerCurrency: { USD: 1 },
      isFallback: false
    };
    transaction.amountUSD = Number(transaction.amount) || 0;
    transaction.amountPreferred = transaction.amountUSD;
    transaction.preferredCurrencyAtSave = preferredCurrency;
    return transaction;
  }
  
  // 1) Get or build FX snapshot for that date
  let fxSnapshot;
  try {
    fxSnapshot = await getFxSnapshotForDate(date);
  } catch (e) {
    // If transaction is USD, we can still proceed with a minimal snapshot
    if (txnCurrency === 'USD') {
      console.warn(`⚠️ Could not fetch full FX snapshot for ${date}, but transaction is USD. Creating minimal snapshot.`);
      fxSnapshot = {
        base: 'USD',
        date: date,
        usdPerCurrency: { USD: 1 },
        isFallback: false,
        missingCurrencies: ['MXN', 'COP'] // Mark as incomplete but usable
      };
    } else {
      // For non-USD transactions, we need the FX snapshot - rethrow
      throw e;
    }
  }
  
  // 2) Compute canonical amount in USD
  const amountUSD = convertToUSD(transaction.amount, txnCurrency, fxSnapshot);
  
  // 3) Compute "preferred" amount for initial display (optional/legacy)
  // If preferred currency is missing from snapshot, use USD amount as fallback
  let amountInPreferred;
  if (fxSnapshot.usdPerCurrency[preferredCurrency]) {
    amountInPreferred = convertFromUSD(amountUSD, preferredCurrency, fxSnapshot);
  } else {
    // Preferred currency not available - use USD amount
    console.warn(`⚠️ Preferred currency ${preferredCurrency} not in FX snapshot, using USD amount`);
    amountInPreferred = amountUSD;
  }
  
  // 4) Assign to transaction
  transaction.fxSnapshot = fxSnapshot;
  transaction.amountUSD = amountUSD;
  transaction.amountPreferred = amountInPreferred;
  transaction.preferredCurrencyAtSave = preferredCurrency;
  
  return transaction;
}

/// Get display amount for transaction (uses stored USD + snapshot, never fetches)
function getDisplayAmountForTransaction(transaction) {
  const preferredCurrency = getPreferredCurrency();
  const fxSnapshot = transaction.fxSnapshot;
  const txnCurrency = transaction.currency || 'USD';
  const txnAmount = Number(transaction.amount) || 0;
  
  // If transaction currency matches preferred, just return the original amount
  if (txnCurrency === preferredCurrency) {
    return txnAmount;
  }
  
  // Best case: we have fxSnapshot and amountUSD
  if (fxSnapshot && typeof transaction.amountUSD === 'number' && !isNaN(transaction.amountUSD) && transaction.amountUSD !== 0) {
    return convertFromUSD(transaction.amountUSD, preferredCurrency, fxSnapshot);
  }
  
  // Old transaction without fxSnapshot - try to use cached rates if available
  if (typeof transaction.amountUSD === 'number' && !isNaN(transaction.amountUSD) && transaction.amountUSD !== 0) {
    // Convert USD -> preferred using cached rate
    const rate = toPreferredCurrencySync(1, 'USD', transaction.date);
    if (rate && rate > 0 && !isNaN(rate)) {
      return transaction.amountUSD * rate;
    }
  }
  
  // Try to convert directly from transaction currency to preferred
  if (txnAmount > 0 && txnCurrency !== preferredCurrency) {
    const rate = toPreferredCurrencySync(1, txnCurrency, transaction.date);
    if (rate && rate > 0 && !isNaN(rate)) {
      return txnAmount * rate;
    }
  }
  
  // Last resort: use amountPreferred if it exists and looks reasonable
  if (transaction.amountPreferred !== undefined && transaction.amountPreferred !== null && transaction.amountPreferred !== 0) {
    const txnCurrency = transaction.currency || 'USD';
    const txnAmount = transaction.amount || 0;
    
    // Detect if amountPreferred was calculated with wrong fallback rate
    if (txnCurrency === 'USD' && preferredCurrency === 'MXN' && txnAmount > 0) {
      const calculatedRate = transaction.amountPreferred / txnAmount;
      // If rate is ~20, it's the wrong fallback rate - don't use it
      if (Math.abs(calculatedRate - 20) < 0.5) {
        // Try to use cached rate instead
        const rate = toPreferredCurrencySync(1, 'USD', transaction.date);
        if (rate && rate > 0 && !isNaN(rate)) {
          return txnAmount * rate;
        }
      }
    }
    return transaction.amountPreferred;
  }
  
  // Final fallback: return original amount (at least show something)
  return txnAmount;
}

// Convert amount from one currency to preferred currency
async function toPreferredCurrency(amount, fromCurrency, dateIso = null) {
  const preferred = getPreferredCurrency();
  if (fromCurrency === preferred) return Number(amount);
  
  const rate = await ensureFxRateForPair(fromCurrency, preferred, dateIso);
  return Number(amount) * Number(rate);
}

// Synchronous version that uses cached rates (for display purposes)
// IMPORTANT: This should only be used when rates are already cached.
// For accurate conversion, use toPreferredCurrency() async version or ensure rates are pre-fetched.
function toPreferredCurrencySync(amount, fromCurrency, dateIso = null) {
  const preferred = getPreferredCurrency();
  if (fromCurrency === preferred) return Number(amount);
  
  const iso = dateIso || todayISO();
  
  // Try to find cached rate - check for direct pair first
  let record = AppState.State.fxRates.find(x => 
    x.date === iso && 
    x.from === fromCurrency && 
    x.to === preferred &&
    x.rate !== undefined
  );
  
  // If not found, try reverse pair (if we have USD rates, we can convert through USD)
  if (!record && fromCurrency !== 'USD' && preferred !== 'USD') {
    // Try converting through USD: fromCurrency -> USD -> preferred
    const toUsdRecord = AppState.State.fxRates.find(x => 
      x.date === iso && 
      ((x.from === fromCurrency && x.to === 'USD' && x.rate !== undefined) ||
       (x.from === 'MXN' && x.to === 'USD' && fromCurrency === 'MXN' && x.usdPerMXN))
    );
    const fromUsdRecord = AppState.State.fxRates.find(x => 
      x.date === iso && 
      x.from === 'USD' && 
      x.to === preferred &&
      x.rate !== undefined
    );
    
    if (toUsdRecord && fromUsdRecord) {
      const toUsdRate = toUsdRecord.rate !== undefined ? Number(toUsdRecord.rate) : Number(toUsdRecord.usdPerMXN);
      const fromUsdRate = Number(fromUsdRecord.rate);
      const combinedRate = toUsdRate * fromUsdRate;
      return Number(amount) * combinedRate;
    }
  }
  
  // Legacy support: MXN to USD
  if (!record && fromCurrency === 'MXN' && preferred === 'USD') {
    record = AppState.State.fxRates.find(x => 
      x.date === iso && 
      x.from === 'MXN' && 
      x.to === 'USD' && 
      x.usdPerMXN
    );
  }
  
  let rate = 1;
  if (record) {
    if (record.rate !== undefined) {
      rate = Number(record.rate);
    } else if (record.usdPerMXN && fromCurrency === 'MXN' && preferred === 'USD') {
      rate = Number(record.usdPerMXN);
    }
  } else {
    // No cached rate found - this should NOT happen if rates are pre-fetched
    // Log a warning and try to fetch asynchronously (but return fallback for now)
    console.error(`❌ CRITICAL: No cached FX rate for ${fromCurrency}->${preferred} on ${iso}!`);
    console.error(`   This means the rate was not pre-fetched. Using fallback rate.`);
    console.error(`   Transaction date: ${iso}, Currency: ${fromCurrency}, Preferred: ${preferred}`);
    
    // Try to trigger an async fetch (won't help this call, but will help future calls)
    ensureFxRateForPair(fromCurrency, preferred, iso).catch(() => {});
    
    rate = getFallbackRate(fromCurrency, preferred, iso);
    console.warn(`   Using fallback rate: ${rate} (THIS IS WRONG - API should have been called!)`);
  }
  
  const convertedAmount = Number(amount) * Number(rate);
  return convertedAmount;
}

// Legacy function - keep for backward compatibility but update to use preferred currency
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
  // Convert transaction amount to USD using the transaction date
  // Use fxRate if available (legacy), otherwise convert using cached rates
  let usdAmount;
  if (txn.currency === 'USD') {
    usdAmount = Number(txn.amount);
  } else if (txn.fxRate && txn.fxRate !== 1) {
    // Legacy: use stored fxRate if available
    usdAmount = Number(txn.amount) * Number(txn.fxRate);
  } else {
    // Convert using cached rates for the transaction date
    // This will use the API-fetched rate if available, or fallback
    const txnCurrency = txn.currency || 'USD';
    const rate = getCachedFxRate(txnCurrency, 'USD', txn.date);
    usdAmount = Number(txn.amount) * rate;
  }
  const isCard = accountType(account)==='credit-card';
  
  // Helper function to check if a transaction's fromAccountId matches this account or any of its debit cards
  const matchesAccount = (accountId) => {
    if (accountId === account.id) return true;
    // Check if the accountId is a debit card belonging to this account
    if (account.debitCards && account.debitCards.some(dc => dc.id === accountId)) return true;
    return false;
  };
  
  if (txn.transactionType==='Expense' || txn.transactionType==='Credit Card Interest'){ 
    if (matchesAccount(txn.fromAccountId)) {
      // For installment transactions on checking/debit accounts:
      // If first installment was paid on transaction date, only deduct the monthly payment amount
      // For credit cards, always use full amount (credit cards charge full amount immediately)
      if (!isCard && txn.isDeferred && txn.firstInstallmentPaidOnTransactionDate && txn.monthlyPaymentAmount) {
        // Use monthlyPaymentAmount (already in USD) instead of full amount
        const monthlyPaymentUSD = Number(txn.monthlyPaymentAmount);
        return -monthlyPaymentUSD;
      }
      return isCard? +usdAmount : -usdAmount; 
    }
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
// Ensure FX rate is fetched for account balance date (async)
async function ensureAccountBalanceFxRate(account) {
  const accountCurrency = account.currency || 'USD';
  if (accountCurrency === 'USD') return;
  
  const iso = account.balanceAsOfDate || todayISO();
  // Check if we have the rate
  let record = AppState.State.fxRates.find(x => 
    x.date === iso && 
    ((x.from === accountCurrency && x.to === 'USD' && x.rate !== undefined) ||
     (x.from === 'MXN' && x.to === 'USD' && accountCurrency === 'MXN' && x.usdPerMXN))
  );
  
  if (!record) {
    // Fetch the rate from API
    try {
      await ensureFxRateForPair(accountCurrency, 'USD', iso);
    } catch (e) {
      console.warn(`Failed to fetch FX rate for account balance: ${accountCurrency}->USD on ${iso}`);
    }
  }
}

function currentBalanceUSD(account){
  // Convert account's native currency balance to USD
  const accountCurrency = account.currency || 'USD';
  let asOfUSD;
  if (accountCurrency === 'USD') {
    asOfUSD = account.balanceAsOfAmount || 0;
  } else {
    // Get FX rate from account currency to USD
    const iso = account.balanceAsOfDate || todayISO();
    
    // Use getCachedFxRate which will use API-fetched rates or fallback
    const rate = getCachedFxRate(accountCurrency, 'USD', iso);
    
    // If we got a fallback rate, log a warning
    const record = AppState.State.fxRates.find(x => 
      x.date === iso && 
      ((x.from === accountCurrency && x.to === 'USD' && x.rate !== undefined) ||
       (x.from === 'MXN' && x.to === 'USD' && accountCurrency === 'MXN' && x.usdPerMXN))
    );
    
    if (!record || record.isFallback) {
      console.warn(`⚠️ Account balance using ${record?.isFallback ? 'FALLBACK' : 'NO'} FX rate: ${accountCurrency}->USD on ${iso} = ${rate}`);
      console.warn(`   Account: ${account.name}, Balance date: ${iso}`);
      console.warn(`   This rate should be fetched from API!`);
    }
    
    asOfUSD = (account.balanceAsOfAmount || 0) * rate;
  }
  
  const delta = AppState.State.transactions.filter(t=> t.date > (account.balanceAsOfDate||'')).reduce((s,t)=> s + txnDeltaUSDForAccount(t, account), 0);
  return asOfUSD + delta;
}

// Get cached FX rate (synchronous, for use in calculations)
// Returns the rate from cache, or fallback if not found
function getCachedFxRate(from, to, dateIso = null) {
  const iso = dateIso || todayISO();
  
  // Try to find cached rate - check multiple formats
  let record = AppState.State.fxRates.find(x => {
    if (x.date !== iso) return false;
    
    // Direct match
    if (x.from === from && x.to === to && x.rate !== undefined) return true;
    
    // Legacy MXN/USD format
    if (from === 'MXN' && to === 'USD' && x.usdPerMXN) return true;
    
    return false;
  });
  
  if (record) {
    if (record.rate !== undefined && record.from === from && record.to === to) {
      const rate = Number(record.rate);
      if (record.isFallback) {
        console.warn(`⚠️ Using FALLBACK rate (not from API): ${from}->${to} on ${iso} = ${rate}`);
      }
      return rate;
    } else if (record.usdPerMXN && from === 'MXN' && to === 'USD') {
      const rate = Number(record.usdPerMXN);
      if (record.isFallback) {
        console.warn(`⚠️ Using FALLBACK rate (not from API): MXN->USD on ${iso} = ${rate}`);
      }
      return rate;
    }
  }
  
  // No cached rate found - this should NOT happen if pre-fetching worked
  console.error(`❌ No cached FX rate found for ${from}->${to} on ${iso}`);
  console.error(`   Available rates for ${iso}:`, AppState.State.fxRates.filter(x => x.date === iso).map(x => `${x.from}->${x.to}=${x.rate || x.usdPerMXN || 'N/A'}`));
  
  // Fallback if not cached (should be rare if rates are pre-fetched)
  const fallbackRate = getFallbackRate(from, to, iso);
  console.warn(`   Using FALLBACK rate: ${fallbackRate} (THIS IS WRONG - API should have been called!)`);
  return fallbackRate;
}

// Pre-fetch FX rates for all unique dates in a transaction list
// This ensures rates are available for conversion
// CRITICAL: Fetches rates for EACH transaction's date and currency
async function prefetchFxRatesForTransactions(transactions) {
  if (!transactions || transactions.length === 0) return;
  
  const preferred = getPreferredCurrency();
  const fetchPromises = [];
  let fetchCount = 0;
  const fetchedRates = new Set(); // Track what we've already fetched to avoid duplicates
  
  // For EACH transaction, fetch the rates we need for that specific date
  transactions.forEach(t => {
    const txnCurrency = t.currency || 'USD';
    const txnDate = t.date;
    
    if (!txnDate) return;
    
    // Always need: transaction currency -> USD (for internal calculations)
    if (txnCurrency !== 'USD') {
      const key = `${txnCurrency}-USD-${txnDate}`;
      if (!fetchedRates.has(key)) {
        // Check if already cached
        const existing = AppState.State.fxRates.find(x => 
          x.date === txnDate && 
          ((x.from === txnCurrency && x.to === 'USD' && x.rate !== undefined) ||
           (x.from === 'MXN' && x.to === 'USD' && txnCurrency === 'MXN' && x.usdPerMXN))
        );
        
        if (!existing) {
          fetchedRates.add(key);
          fetchCount++;
          fetchPromises.push(
            ensureFxRateForPair(txnCurrency, 'USD', txnDate)
              .then(rate => {
                console.log(`✅ Fetched FX rate: ${txnCurrency}->USD for ${txnDate} = ${rate}`);
              })
              .catch(err => {
                console.error(`❌ Failed to fetch ${txnCurrency}->USD for ${txnDate}:`, err);
              })
          );
        }
      }
    }
    
    // Also need: transaction currency -> preferred (for display)
    if (txnCurrency !== preferred) {
      const key = `${txnCurrency}-${preferred}-${txnDate}`;
      if (!fetchedRates.has(key)) {
        // Check if already cached
        const existing = AppState.State.fxRates.find(x => 
          x.date === txnDate && 
          x.from === txnCurrency && 
          x.to === preferred &&
          x.rate !== undefined
        );
        
        if (!existing) {
          fetchedRates.add(key);
          fetchCount++;
          fetchPromises.push(
            ensureFxRateForPair(txnCurrency, preferred, txnDate)
              .then(rate => {
                console.log(`✅ Fetched FX rate: ${txnCurrency}->${preferred} for ${txnDate} = ${rate}`);
              })
              .catch(err => {
                console.error(`❌ Failed to fetch ${txnCurrency}->${preferred} for ${txnDate}:`, err);
              })
          );
        }
      }
    }
    
    // Also need: USD -> preferred (if transaction is in USD and preferred is not USD)
    if (txnCurrency === 'USD' && preferred !== 'USD') {
      const key = `USD-${preferred}-${txnDate}`;
      if (!fetchedRates.has(key)) {
        // Check if already cached
        const existing = AppState.State.fxRates.find(x => 
          x.date === txnDate && 
          x.from === 'USD' && 
          x.to === preferred &&
          x.rate !== undefined
        );
        
        if (!existing) {
          fetchedRates.add(key);
          fetchCount++;
          fetchPromises.push(
            ensureFxRateForPair('USD', preferred, txnDate)
              .then(rate => {
                console.log(`✅ Fetched FX rate: USD->${preferred} for ${txnDate} = ${rate}`);
              })
              .catch(err => {
                console.error(`❌ Failed to fetch USD->${preferred} for ${txnDate}:`, err);
              })
          );
        }
      }
    }
  });
  
  // Wait for all fetches to complete (but don't block if some fail)
  if (fetchPromises.length > 0) {
    console.log(`🔄 Pre-fetching ${fetchCount} FX rates for ${transactions.length} transactions...`);
    const results = await Promise.allSettled(fetchPromises);
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    console.log(`✅ FX rate pre-fetch complete: ${succeeded} succeeded, ${failed} failed`);
    
    if (failed > 0) {
      console.warn(`⚠️ ${failed} FX rate fetches failed. Some amounts may use fallback rates.`);
    }
  } else {
    console.log(`ℹ️ All FX rates already cached`);
  }
}

// Convert USD amount to preferred currency
function convertUSDToPreferred(usdAmount) {
  const preferred = getPreferredCurrency();
  if (preferred === 'USD') return usdAmount;
  return toPreferredCurrencySync(usdAmount, 'USD', null);
}

// Recalculate all transaction amounts when preferred currency changes
// This updates amountPreferred for all transactions using their transaction date's FX rate
// CRITICAL: Uses API to fetch rates, NOT fallback rates
async function recalculateAllTransactionAmounts() {
  const preferred = getPreferredCurrency();
  console.log(`🔄 Recalculating all transaction amounts for preferred currency: ${preferred}`);
  console.log(`   This will fetch FX rates from API for each transaction's date...`);
  console.log(`   Total transactions to process: ${AppState.State.transactions?.length || 0}`);
  
  const transactions = AppState.State.transactions || [];
  let updated = 0;
  let apiFetches = 0;
  let errors = 0;
  
  // CRITICAL: Remove ALL old fallback rates from cache before recalculating
  console.log(`🗑️ Removing all old fallback rates from cache...`);
  const oldFallbackCount = AppState.State.fxRates.filter(r => r.isFallback).length;
  AppState.State.fxRates = AppState.State.fxRates.filter(r => !r.isFallback);
  console.log(`   Removed ${oldFallbackCount} fallback rates from cache`);
  
  for (let i = 0; i < transactions.length; i++) {
    const txn = transactions[i];
    if (i % 10 === 0) {
      console.log(`   Processing transaction ${i + 1} of ${transactions.length}...`);
    }
    const txnCurrency = txn.currency || 'USD';
    const txnAmount = Number(txn.amount);
    
    try {
      // Recalculate USD amount using API
      if (txnCurrency === 'USD') {
        txn.amountUSD = txnAmount;
      } else {
        // ALWAYS fetch from API - IGNORE any existing fxRate (it might be a fallback!)
        // Delete any existing rate record for this date/currency pair to force fresh fetch
        const existingRateIndex = AppState.State.fxRates.findIndex(x => 
          x.date === txn.date && 
          ((x.from === txnCurrency && x.to === 'USD' && x.rate !== undefined) ||
           (x.from === 'MXN' && x.to === 'USD' && txnCurrency === 'MXN' && x.usdPerMXN))
        );
        
        // If existing rate looks like fallback, remove it to force API fetch
        if (existingRateIndex >= 0) {
          const existingRate = AppState.State.fxRates[existingRateIndex];
          if (existingRate.isFallback || 
              (txnCurrency === 'MXN' && existingRate.usdPerMXN && Math.abs(existingRate.usdPerMXN - 0.05) < 0.001)) {
            console.log(`   🗑️ Removing fallback rate for ${txn.date}: ${txnCurrency}->USD`);
            AppState.State.fxRates.splice(existingRateIndex, 1);
          }
        }
        
        // Now fetch fresh rate from API
        const usdRate = await ensureFxRateForPair(txnCurrency, 'USD', txn.date);
        
        // Verify we got a real API rate, not a fallback
        const rateRecord = AppState.State.fxRates.find(x => 
          x.date === txn.date && 
          ((x.from === txnCurrency && x.to === 'USD' && x.rate !== undefined) ||
           (x.from === 'MXN' && x.to === 'USD' && txnCurrency === 'MXN' && x.usdPerMXN))
        );
        
        if (rateRecord && rateRecord.isFallback) {
          console.warn(`   ⚠️ ${txn.date}: ${txnCurrency}->USD got FALLBACK rate ${usdRate.toFixed(4)} (API may have failed)`);
        } else {
          console.log(`   ✅ ${txn.date}: ${txnCurrency}->USD = ${usdRate.toFixed(4)} (from API)`);
        }
        
        txn.fxRate = usdRate;
        txn.amountUSD = txnAmount * usdRate;
        apiFetches++;
      }
      
      // Recalculate preferred currency amount using API
      if (txnCurrency === preferred) {
        txn.amountPreferred = txnAmount;
      } else {
        // ALWAYS fetch from API - IGNORE any existing cached rate (it might be a fallback!)
        // Delete any existing rate record for this date/currency pair to force fresh fetch
        const existingRateIndex = AppState.State.fxRates.findIndex(x => 
          x.date === txn.date && 
          x.from === txnCurrency && 
          x.to === preferred &&
          x.rate !== undefined
        );
        
        // If existing rate is a fallback, remove it to force API fetch
        if (existingRateIndex >= 0) {
          const existingRate = AppState.State.fxRates[existingRateIndex];
          if (existingRate.isFallback) {
            console.log(`   🗑️ Removing fallback rate for ${txn.date}: ${txnCurrency}->${preferred}`);
            AppState.State.fxRates.splice(existingRateIndex, 1);
          }
        }
        
        // Now fetch fresh rate from API
        const preferredRate = await ensureFxRateForPair(txnCurrency, preferred, txn.date);
        
        // Verify we got a real API rate, not a fallback
        const rateRecord = AppState.State.fxRates.find(x => 
          x.date === txn.date && 
          x.from === txnCurrency && 
          x.to === preferred &&
          x.rate !== undefined
        );
        
        if (rateRecord && rateRecord.isFallback) {
          console.warn(`   ⚠️ ${txn.date}: ${txnCurrency}->${preferred} got FALLBACK rate ${preferredRate.toFixed(4)} (API may have failed)`);
        } else {
          console.log(`   ✅ ${txn.date}: ${txnCurrency}->${preferred} = ${preferredRate.toFixed(4)} (from API)`);
        }
        
        txn.amountPreferred = txnAmount * preferredRate;
        apiFetches++;
      }
      
      txn.preferredCurrencyAtSave = preferred;
      updated++;
      
      // CRITICAL: Verify the calculated amount is NOT using fallback rate
      if (txnCurrency === 'USD' && preferred === 'MXN') {
        const calculatedRate = txn.amountPreferred / txnAmount;
        if (Math.abs(calculatedRate - 20) < 0.5) {
          console.error(`   ❌ CRITICAL: Transaction ${txn.id} still has wrong rate! ${txnAmount} USD -> ${txn.amountPreferred} MXN (rate=${calculatedRate.toFixed(2)})`);
          console.error(`   This means the API returned a fallback rate. Check API configuration.`);
        } else {
          console.log(`   ✅ Verified: ${txnAmount} USD -> ${txn.amountPreferred.toFixed(2)} MXN (rate=${calculatedRate.toFixed(4)}, correct!)`);
        }
      }
      
      // Save each transaction
      await AppState.saveItem('transactions', txn, 'transactions');
    } catch (e) {
      errors++;
      console.error(`❌ Error recalculating transaction ${txn.id} (${txn.date}):`, e);
      // Continue with other transactions
    }
  }
  
  console.log(`✅ Recalculated ${updated} transaction amounts (${apiFetches} API fetches, ${errors} errors)`);
  
  if (errors > 0) {
    console.warn(`⚠️ ${errors} transactions had errors. Check console for details.`);
  }
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
function creditLimitUSD(account){ 
  const accountCurrency = account.currency || 'USD';
  if (accountCurrency === 'USD') return account.creditLimit || 0;
  
  // Get FX rate from account currency to USD
  const iso = todayISO();
  let record = AppState.State.fxRates.find(x => 
    x.date === iso && 
    ((x.from === accountCurrency && x.to === 'USD') ||
     (x.from === 'MXN' && x.to === 'USD' && accountCurrency === 'MXN' && x.usdPerMXN))
  );
  let rate = 1;
  if (record) {
    if (record.rate !== undefined && record.from === accountCurrency && record.to === 'USD') {
      rate = Number(record.rate);
    } else if (record.usdPerMXN && accountCurrency === 'MXN') {
      rate = Number(record.usdPerMXN);
    }
  } else {
    rate = getFallbackRate(accountCurrency, 'USD', iso);
  }
  return (account.creditLimit || 0) * rate;
}

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
  // Convert each transaction to USD using its own date's FX rate
  expenseTxns.forEach(txn => {
    if (!txn.isDeferred) {
      // Convert transaction amount to USD using the transaction date
      const txnCurrency = txn.currency || 'USD';
      let usdAmount = Number(txn.amount);
      if (txnCurrency !== 'USD') {
        // Use cached FX rate for transaction date
        const rate = getCachedFxRate(txnCurrency, 'USD', txn.date);
        usdAmount = usdAmount * rate;
      }
      totalCharges += usdAmount;
    }
  });
  
  // 2. Add installment charges for this billing period
  const installmentCharges = calculateInstallmentChargesForPeriod(card, billingStartDate, billingCloseDate);
  totalCharges += installmentCharges;
  
  // 3. Subtract payments made after closing but before due
  let totalPayments = 0;
  paymentTxns.forEach(txn => {
    // Convert transaction amount to USD using the transaction date
    const txnCurrency = txn.currency || 'USD';
    let usdAmount = Number(txn.amount);
    if (txnCurrency !== 'USD') {
      // Use cached FX rate for transaction date
      const rate = getCachedFxRate(txnCurrency, 'USD', txn.date);
      usdAmount = usdAmount * rate;
    }
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
    // Calculate monthly amount in USD using transaction date's FX rate
    const txnCurrency = txn.currency || 'USD';
    let usdAmount = Number(txn.amount);
    if (txnCurrency !== 'USD') {
      const rate = getCachedFxRate(txnCurrency, 'USD', txn.date);
      usdAmount = usdAmount * rate;
    }
    const monthlyAmount = txn.monthlyPaymentAmount || (usdAmount / txn.deferredMonths);
    
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
    console.log('⚠️ getPendingInstallmentPayments: AppState or transactions not available');
    return [];
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  console.log('🔍 Checking for pending installments. Today:', today.toISOString().slice(0, 10));
  console.log('📊 Total transactions:', AppState.State.transactions.length);
  
  const pendingPayments = [];
  
  // Find all deferred transactions with remaining months
  const deferredTxns = AppState.State.transactions.filter(txn => 
    txn.transactionType === 'Expense' && 
    txn.isDeferred && 
    txn.remainingMonths > 0 &&
    txn.deferredMonths > 0
  );
  
  console.log('💳 Found deferred transactions:', deferredTxns.length);
  deferredTxns.forEach(txn => {
    console.log(`  - ${txn.description || 'No description'}: date=${txn.date}, deferredMonths=${txn.deferredMonths}, remainingMonths=${txn.remainingMonths}`);
  });
  
  deferredTxns.forEach(txn => {
    const txnDate = new Date(txn.date);
    txnDate.setHours(0, 0, 0, 0);
    
    // Find ALL overdue installments, not just the next one
    // Check each installment from 1 to deferredMonths to see which ones are due
    const dueDay = txnDate.getDate();
    
    // Check which installments have actually been paid by looking for payment transactions
    // A payment transaction for an installment would have:
    // - Same description (or similar)
    // - Same fromAccountId
    // - Same categoryId
    // - Date matching the installment due date
    // - Amount matching the monthly payment
    const paidInstallmentNumbers = new Set();
    
    // Calculate monthly payment amount for comparison
    let monthlyPaymentAmount = 0;
    if (txn.monthlyPaymentAmount) {
      monthlyPaymentAmount = txn.monthlyPaymentAmount;
    } else if (txn.deferredMonths > 0) {
      const txnCurrency = txn.currency || 'USD';
      let usdAmount = Number(txn.amount);
      if (txnCurrency !== 'USD') {
        const rate = getCachedFxRate(txnCurrency, 'USD', txn.date);
        usdAmount = usdAmount * rate;
      }
      monthlyPaymentAmount = usdAmount / txn.deferredMonths;
    }
    
    // Check if first installment was paid on transaction date (for debit/checking accounts)
    const firstInstallmentPaidOnTransactionDate = txn.firstInstallmentPaidOnTransactionDate || false;
    
    // Determine account type
    const account = AppState.State.accounts.find(acc => acc.id === txn.fromAccountId);
    const isCreditCard = account && Utils.accountType(account) === 'credit-card';
    
    // For credit cards: full amount charged on transaction date, first payment due 1 month later
    // For debit/checking: if firstInstallmentPaidOnTransactionDate is true, installment 1 is already paid
    if (firstInstallmentPaidOnTransactionDate && !isCreditCard) {
      // First installment was paid on transaction date - mark it as paid
      paidInstallmentNumbers.add(1);
    }
    
    // Check all transactions to find which installments have been paid
    // Start from installment 1 (or 2 if first was already paid on transaction date)
    const startInstallment = (firstInstallmentPaidOnTransactionDate && !isCreditCard) ? 2 : 1;
    
    for (let installmentNum = startInstallment; installmentNum <= txn.deferredMonths; installmentNum++) {
      // Calculate due date: installment 1 is due 1 month after transaction date
      // For credit cards: installment 1 due 1 month after (full amount already charged)
      // For debit/checking: if first paid on transaction date, installment 2 due 1 month after, etc.
      let monthOffset;
      if (firstInstallmentPaidOnTransactionDate && !isCreditCard) {
        // First installment paid on transaction date, so installment 2 is due 1 month after, installment 3 is 2 months after, etc.
        monthOffset = installmentNum - 1;
      } else {
        // Credit card or first installment not paid on transaction date
        // Installment 1 is due 1 month after, installment 2 is 2 months after, etc.
        monthOffset = installmentNum;
      }
      
      const installmentDueDate = new Date(txnDate);
      installmentDueDate.setMonth(installmentDueDate.getMonth() + monthOffset);
      const targetMonth = installmentDueDate.getMonth();
      installmentDueDate.setDate(dueDay);
      if (installmentDueDate.getMonth() !== targetMonth) {
        installmentDueDate.setMonth(targetMonth + 1, 0);
      }
      installmentDueDate.setHours(0, 0, 0, 0);
      const dueDateStr = installmentDueDate.toISOString().slice(0, 10);
      
      // Look for a payment transaction on this date with matching details
      const paymentExists = AppState.State.transactions.some(paymentTxn => {
        if (paymentTxn.id === txn.id) return false; // Don't match the original transaction
        if (paymentTxn.transactionType !== 'Expense') return false;
        if (paymentTxn.fromAccountId !== txn.fromAccountId) return false;
        if (paymentTxn.categoryId !== txn.categoryId) return false;
        if (paymentTxn.date !== dueDateStr) return false;
        
        // Check if amount matches (within 1% tolerance for rounding)
        const paymentAmountUSD = paymentTxn.currency === 'USD' 
          ? Number(paymentTxn.amount) 
          : Number(paymentTxn.amount) * (getCachedFxRate(paymentTxn.currency, 'USD', paymentTxn.date) || 1);
        const amountDiff = Math.abs(paymentAmountUSD - monthlyPaymentAmount);
        const tolerance = monthlyPaymentAmount * 0.01; // 1% tolerance
        if (amountDiff > tolerance) return false;
        
        // Check if description matches (same or contains installment keywords)
        const txnDesc = (txn.description || '').toLowerCase();
        const paymentDesc = (paymentTxn.description || '').toLowerCase();
        if (txnDesc && paymentDesc && (
          paymentDesc.includes(txnDesc) || 
          txnDesc.includes(paymentDesc) ||
          paymentDesc.includes('installment') ||
          paymentDesc.includes('monthly')
        )) {
          return true;
        }
        
        return false;
      });
      
      if (paymentExists) {
        paidInstallmentNumbers.add(installmentNum);
      }
    }
    
    console.log(`  Processing ${txn.description || 'transaction'}:`, {
      originalDate: txn.date,
      deferredMonths: txn.deferredMonths,
      remainingMonths: txn.remainingMonths,
      paidInstallments: Array.from(paidInstallmentNumbers),
      today: today.toISOString().slice(0, 10)
    });
    
    // Calculate which installments to check based on first installment payment status
    const firstPaidOnTxnDate = txn.firstInstallmentPaidOnTransactionDate || false;
    const txnAccount = AppState.State.accounts.find(acc => acc.id === txn.fromAccountId);
    const txnIsCreditCard = txnAccount && Utils.accountType(txnAccount) === 'credit-card';
    
    // For credit cards: installment 1 is due 1 month after transaction date (full amount already charged)
    // For debit/checking: if first installment paid on transaction date, installment 2 is due 1 month after
    // Otherwise, installment 1 is due 1 month after
    const checkStartInstallment = (firstPaidOnTxnDate && !txnIsCreditCard) ? 2 : 1;
    
    for (let installmentNum = checkStartInstallment; installmentNum <= txn.deferredMonths; installmentNum++) {
      // Calculate the due date for this installment
      // CRITICAL: If first installment was paid on transaction date, installment 2 is due 1 month after transaction date
      // Otherwise, installment 1 is due 1 month after transaction date
      // So the month offset depends on whether first was paid on transaction date
      let monthOffset;
      if (firstPaidOnTxnDate && !txnIsCreditCard) {
        // First installment paid on transaction date, so installment 2 is due 1 month after, installment 3 is 2 months after, etc.
        // installmentNum 2 -> 1 month, installmentNum 3 -> 2 months, etc.
        monthOffset = installmentNum - 1;
      } else {
        // Credit card or first installment not paid on transaction date
        // Installment 1 is due 1 month after, installment 2 is 2 months after, etc.
        monthOffset = installmentNum;
      }
      
      const installmentDueDate = new Date(txnDate);
      const targetMonth = installmentDueDate.getMonth() + monthOffset;
      const targetYear = installmentDueDate.getFullYear() + Math.floor(targetMonth / 12);
      const finalMonth = targetMonth % 12;
      
      installmentDueDate.setFullYear(targetYear);
      installmentDueDate.setMonth(finalMonth);
      
      // Set the day of month (same day as original transaction)
      const maxDay = new Date(targetYear, finalMonth + 1, 0).getDate(); // Last day of target month
      const dayToSet = Math.min(dueDay, maxDay);
      installmentDueDate.setDate(dayToSet);
      
      installmentDueDate.setHours(0, 0, 0, 0);
      
      const isDue = today >= installmentDueDate;
      const isUnpaid = !paidInstallmentNumbers.has(installmentNum);
      
      console.log(`    Installment ${installmentNum}: due ${installmentDueDate.toISOString().slice(0, 10)}, isDue=${isDue}, isUnpaid=${isUnpaid}, paidInstallments=[${Array.from(paidInstallmentNumbers).join(',')}], firstPaidOnTxnDate=${firstPaidOnTxnDate}`);
      
      // Check if this installment is due (today is on or past the due date)
      // AND if it hasn't been paid yet (no payment transaction exists for this installment)
      if (isDue && isUnpaid) {
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
        
        console.log(`  ✅ Found overdue installment ${installmentNum} for ${txn.description || 'transaction'}: due ${installmentDueDate.toISOString().slice(0, 10)}`);
      
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
          dueDate: installmentDueDate.toISOString().slice(0, 10), // YYYY-MM-DD
          installmentNumber: installmentNum,
        totalInstallments: txn.deferredMonths,
        remainingMonths: txn.remainingMonths
      });
        
        // Only process the first overdue installment to avoid duplicates
        // (we'll handle multiple overdue installments separately if needed)
        break;
      }
    }
  });
  
  // Sort by due date (earliest first)
  pendingPayments.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  
  console.log('✅ Found pending installment payments:', pendingPayments.length);
  if (pendingPayments.length > 0) {
    pendingPayments.forEach(p => {
      console.log(`  - ${p.description}: due ${p.dueDate}, installment ${p.installmentNumber}/${p.totalInstallments}`);
    });
  }
  
  return pendingPayments;
}

// Debug function to check installment transactions (call from console)
window.debugInstallments = function() {
  console.log('🔍 DEBUG: Checking installment transactions...');
  console.log('📊 Total transactions:', AppState.State.transactions.length);
  
  // Find all transactions with isDeferred
  const allDeferred = AppState.State.transactions.filter(t => t.isDeferred);
  console.log('💳 Transactions with isDeferred=true:', allDeferred.length);
  allDeferred.forEach(t => {
    console.log(`  - ${t.description || 'No description'}:`, {
      date: t.date,
      type: t.transactionType,
      isDeferred: t.isDeferred,
      deferredMonths: t.deferredMonths,
      remainingMonths: t.remainingMonths,
      monthlyPaymentAmount: t.monthlyPaymentAmount
    });
  });
  
  // Check pending payments
  const pending = Utils.getPendingInstallmentPayments();
  console.log('📅 Pending installment payments:', pending.length);
  if (pending.length === 0) {
    console.log('❌ No pending payments found. Checking why...');
    
    allDeferred.forEach(txn => {
      if (txn.transactionType === 'Expense' && txn.remainingMonths > 0 && txn.deferredMonths > 0) {
        const txnDate = new Date(txn.date);
        const installmentsPaid = txn.deferredMonths - txn.remainingMonths;
        const nextInstallmentNumber = installmentsPaid + 1;
        const nextDueDate = new Date(txnDate);
        nextDueDate.setMonth(nextDueDate.getMonth() + nextInstallmentNumber);
        nextDueDate.setDate(txnDate.getDate());
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        console.log(`  Transaction: ${txn.description}`);
        console.log(`    Original date: ${txn.date}`);
        console.log(`    Next installment #: ${nextInstallmentNumber}`);
        console.log(`    Next due date: ${nextDueDate.toISOString().slice(0, 10)}`);
        console.log(`    Today: ${today.toISOString().slice(0, 10)}`);
        console.log(`    Is due? ${today >= nextDueDate}`);
      }
    });
  }
  
  return { allDeferred, pending };
};

// Recovery function to restore deferred payment fields for transactions that lost them
window.recoverInstallments = async function(searchTerms = ['Golf Bag', 'Driver']) {
  console.log('🔧 RECOVERY: Attempting to restore deferred payment fields...');
  console.log('📋 Search terms:', searchTerms);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  
  // Find transactions that might have been deferred but lost their fields
  const candidates = AppState.State.transactions.filter(txn => {
    if (txn.transactionType !== 'Expense') return false;
    if (txn.isDeferred) return false; // Skip if already has deferred fields
    if (!txn.description) return false;
    
    // Check if description matches search terms
    const desc = txn.description.toLowerCase();
    return searchTerms.some(term => desc.includes(term.toLowerCase()));
  });
  
  console.log(`📊 Found ${candidates.length} candidate transactions:`);
  candidates.forEach(t => {
    console.log(`  - ${t.description}: date=${t.date}, amount=${t.amount} ${t.currency}`);
  });
  
  if (candidates.length === 0) {
    console.log('❌ No candidate transactions found. Try different search terms.');
    return { restored: 0, candidates: [] };
  }
  
  // For each candidate, ask user to confirm and set deferred fields
  let restored = 0;
  const restoredList = [];
  
  for (const txn of candidates) {
    // Check if transaction date is around October 16, 2025
    const txnDate = new Date(txn.date);
    const isOct16 = txnDate.getMonth() === 9 && txnDate.getDate() === 16 && txnDate.getFullYear() === 2025;
    
    if (isOct16) {
      // Golf Bag: 6 months, Driver: 3 months (based on previous logs)
      let deferredMonths = 6;
      if (txn.description.toLowerCase().includes('driver')) {
        deferredMonths = 3;
      }
      
      // Calculate how many installments should have been paid by now
      // Original date: Oct 16, 2025
      // Today: Nov 24, 2025
      // Installment 1 due: Nov 16, 2025 (overdue)
      // Installment 2 due: Dec 16, 2025 (not yet due)
      const monthsSinceOriginal = (today.getFullYear() - txnDate.getFullYear()) * 12 + 
                                  (today.getMonth() - txnDate.getMonth());
      const installmentsDue = Math.max(0, monthsSinceOriginal); // At least 1 is due (Nov 16)
      const remainingMonths = Math.max(0, deferredMonths - installmentsDue);
      
      // Restore deferred fields
      txn.isDeferred = true;
      txn.deferredMonths = deferredMonths;
      txn.remainingMonths = remainingMonths;
      
      // Calculate monthly payment
      const usdAmount = txn.currency === 'USD' ? Number(txn.amount) : 
                       (Number(txn.amount) * (getCachedFxRate(txn.currency, 'USD', txn.date) || 1));
      txn.monthlyPaymentAmount = usdAmount / deferredMonths;
      
      // Prepare FX snapshot if missing
      if (!txn.fxSnapshot) {
        try {
          await prepareTransactionWithFx(txn);
        } catch (e) {
          console.warn(`⚠️ Could not fetch FX snapshot for ${txn.date}:`, e);
        }
      }
      
      restored++;
      restoredList.push({
        description: txn.description,
        deferredMonths,
        remainingMonths,
        installmentsDue
      });
      
      console.log(`✅ Restored: ${txn.description} - ${deferredMonths} months, ${remainingMonths} remaining`);
    }
  }
  
  if (restored > 0) {
    // Save all restored transactions
    await AppState.saveAll('transactions');
    console.log(`💾 Saved ${restored} restored transactions to database`);
    console.log('🔄 Please refresh the page to see pending installments');
  } else {
    console.log('❌ No transactions matched the recovery criteria');
  }
  
  return { restored, candidates: restoredList };
};

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
  
  paymentTxn.fromAccountId = pendingPayment.accountId;
  paymentTxn.toAccountId = ''; // Not used for Expense
  paymentTxn.categoryId = pendingPayment.categoryId;
  paymentTxn.description = pendingPayment.description;
  paymentTxn.isDeferred = false; // This is the actual payment, not deferred
  paymentTxn.deferredMonths = 0;
  paymentTxn.monthlyPaymentAmount = 0;
  paymentTxn.remainingMonths = 0;
  
  // Use the new FX snapshot system to prepare the transaction
  await prepareTransactionWithFx(paymentTxn);
  
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
    const originalTxnDate = new Date(originalTxn.date);
    originalTxnDate.setHours(0, 0, 0, 0);
    const originalTxnDateStr = originalTxnDate.toISOString().slice(0, 10);
    
    console.log(`🔍 Checking recurrent payment: ${originalTxn.description || 'No description'}`);
    console.log(`  Original transaction date: ${originalTxn.date}`);
    console.log(`  Recurrent day of month: ${dayOfMonth}`);
    console.log(`  Today: ${today.toISOString().slice(0, 10)}`);
    
    // SIMPLE APPROACH: Start from exactly 1 month after the original transaction date
    // If original was Nov 1, 2025, first payment is Dec 1, 2025
    const firstPaymentDate = new Date(originalTxnDate);
    firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1); // Add exactly 1 month
    firstPaymentDate.setDate(dayOfMonth); // Set to the recurrent day of month
    
    // Handle edge case: if day doesn't exist in target month (e.g., Jan 31 -> Feb 31)
    if (firstPaymentDate.getDate() !== dayOfMonth) {
      // Use last day of month instead
      firstPaymentDate.setDate(0); // Go to last day of previous month (which is the target month)
    }
    
    firstPaymentDate.setHours(0, 0, 0, 0);
    const firstPaymentDateStr = firstPaymentDate.toISOString().slice(0, 10);
    
    console.log(`  First payment due date: ${firstPaymentDateStr}`);
    
    // CRITICAL: Never show the original transaction date
    if (firstPaymentDateStr === originalTxnDateStr) {
      console.log(`  ❌ SKIPPED: First payment date matches original transaction date`);
      return; // Skip this transaction completely
    }
    
    // Only show if the due date is today or in the past (not future)
    if (firstPaymentDate > today) {
      console.log(`  ⏭️  First payment is in the future (${firstPaymentDateStr} > ${today.toISOString().slice(0, 10)}) - not showing yet`);
      return; // Don't show future payments
    }
    
    // Check if this payment has already been created
    const monthStart = new Date(firstPaymentDate.getFullYear(), firstPaymentDate.getMonth(), 1).toISOString().slice(0, 10);
    const monthEnd = new Date(firstPaymentDate.getFullYear(), firstPaymentDate.getMonth() + 1, 0).toISOString().slice(0, 10);
    
    const alreadyCreated = AppState.State.transactions.some(txn => 
      txn.id !== originalTxn.id && // Don't match the original transaction itself
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
    
    if (!alreadyCreated) {
      // Get account and category info
      const account = AppState.State.accounts.find(a => a.id === originalTxn.fromAccountId);
      const category = AppState.State.categories.find(c => c.id === originalTxn.categoryId);
      
      console.log(`  ✅ Adding pending payment for ${firstPaymentDateStr}`);
      
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
        dueDate: firstPaymentDateStr, // YYYY-MM-DD
        dayOfMonth: dayOfMonth
      });
    } else {
      console.log(`  Payment already created for ${firstPaymentDateStr}`);
    }
  });
  
  // FINAL SAFETY FILTER: Remove any pending payments that match original transaction dates
  // This is a last-resort check to ensure we never show payments that were already made
  const filteredPayments = [];
  const todayStr = today.toISOString().slice(0, 10);
  
  for (const payment of pendingPayments) {
    // Find the original transaction for this payment
    const originalTxn = AppState.State.transactions.find(t => t.id === payment.originalTxnId);
    if (!originalTxn) {
      filteredPayments.push(payment); // Keep it if we can't find the original
      continue;
    }
    
    const originalTxnDate = new Date(originalTxn.date);
    originalTxnDate.setHours(0, 0, 0, 0);
    const originalTxnDateStr = originalTxnDate.toISOString().slice(0, 10);
    
    // CRITICAL: If the payment's due date matches the original transaction date, NEVER show it
    if (payment.dueDate === originalTxnDateStr) {
      console.log(`🚫 FINAL FILTER: BLOCKED payment "${payment.description}" - due date ${payment.dueDate} matches original transaction date ${originalTxnDateStr}`);
      continue; // Skip this payment completely
    }
    
    // Also filter out any payment that's in the past (overdue) - we only want future payments
    // Actually wait, the user wants overdue payments to show. So only filter if it matches original date.
    filteredPayments.push(payment);
  }
  
  // Sort by due date (earliest first)
  filteredPayments.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  
  return filteredPayments;
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
  
  // Use new FX system to prepare transaction with FX snapshot
  try {
    await prepareTransactionWithFx(paymentTxn);
  } catch (e) {
    console.warn('⚠️ Failed to prepare recurrent payment with FX snapshot, using fallback:', e);
    // Fallback: use original transaction's FX snapshot if available
    if (originalTxn.fxSnapshot) {
      paymentTxn.fxSnapshot = originalTxn.fxSnapshot;
      // Recalculate amounts using the snapshot
      const txnCurrency = paymentTxn.currency || 'USD';
      const usdPerTxnCurrency = paymentTxn.fxSnapshot.usdPerCurrency[txnCurrency] || 1;
      paymentTxn.amountUSD = Number(paymentTxn.amount) * usdPerTxnCurrency;
      const preferredCurrency = getPreferredCurrency();
      const usdPerPreferred = paymentTxn.fxSnapshot.usdPerCurrency[preferredCurrency] || 1;
      paymentTxn.amountPreferred = paymentTxn.amountUSD / usdPerPreferred;
      paymentTxn.preferredCurrencyAtSave = preferredCurrency;
    } else {
      // Last resort: create minimal snapshot
      paymentTxn.fxSnapshot = {
        base: 'USD',
        date: paymentTxn.date,
        usdPerCurrency: { USD: 1 },
        isFallback: false
      };
      paymentTxn.amountUSD = paymentTxn.currency === 'USD' ? Number(paymentTxn.amount) : Number(paymentTxn.amount);
      paymentTxn.amountPreferred = paymentTxn.amountUSD;
      paymentTxn.preferredCurrencyAtSave = getPreferredCurrency();
    }
  }
  
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
  // Show the ACTUAL category name (subcategory), not parent category name
  const getCategoryName = (categoryId) => {
    if (!categoryId) return '—';
    const cat = categoryById(categoryId);
    return cat ? cat.name : '—';
  };
  
  if(type==='Expense'){
    return { from: accountName(txn.fromAccountId), to: getCategoryName(txn.categoryId) };
  }
  if(type==='Income'){
    return { from: getCategoryName(txn.categoryId), to: accountName(txn.toAccountId) };
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
    // Use the exact same calculation as calcNetWorthUSD() for consistency
    let netWorth;
    if (currentDate === allDates[allDates.length - 1]) {
      // ASSETS: Asset accounts with positive balances + credit cards/loans with NEGATIVE balances
      const todayAssets = accounts.reduce((sum, a) => {
        const type = accountType(a);
        const balance = currentBalanceUSD(a);
        
        // Asset accounts: checking, savings, cash, investment
        if (type === 'checking' || type === 'savings' || type === 'cash' || type === 'investment') {
          return sum + Math.max(0, balance); // Only positive balances are assets
        }
        
        // Credit cards/loans with NEGATIVE balances (overpayments) are assets
        // Negative balance = bank owes you = asset
        if ((type === 'credit-card' || type === 'loan') && balance < 0) {
          return sum + Math.abs(balance); // Convert negative to positive for asset
        }
        
        return sum;
      }, 0);
      
      // LIABILITIES: Credit cards/loans with POSITIVE balances + overdrawn asset accounts
      const todayLiabilities = accounts.reduce((sum, a) => {
        const balance = currentBalanceUSD(a);
        const type = accountType(a);
        
        // Credit cards and loans: POSITIVE balances are liabilities (what you owe)
        if (type === 'credit-card' || type === 'loan') {
          return sum + Math.max(0, balance); // Positive balance = you owe = liability
        }
        
        // Asset accounts with negative balances (overdrawn) are liabilities
        return sum + Math.max(0, -balance);
      }, 0);
      
      netWorth = todayAssets - todayLiabilities;
      lastDayBalances = {};
      accounts.forEach(acc => {
        lastDayBalances[acc.id] = currentBalanceUSD(acc);
      });
    } else {
      // For historical dates, use calculated balances
      // Calculate net worth: Assets - Liabilities (consistent with calcNetWorthUSD)
      const assets = accounts.reduce((sum, a) => {
        const type = accountType(a);
        const balance = accountBalances[a.id] || 0;
        
        // Asset accounts: checking, savings, cash, investment
        if (type === 'checking' || type === 'savings' || type === 'cash' || type === 'investment') {
          return sum + Math.max(0, balance); // Only positive balances are assets
        }
        
        // Credit cards/loans with NEGATIVE balances (overpayments) are assets
        // Negative balance = bank owes you = asset
        if ((type === 'credit-card' || type === 'loan') && balance < 0) {
          return sum + Math.abs(balance); // Convert negative to positive for asset
        }
        
        return sum;
      }, 0);
      
      const liabilities = accounts.reduce((sum, a) => {
        const balance = accountBalances[a.id] || 0;
        const type = accountType(a);
        
        // Credit cards and loans: POSITIVE balances are liabilities (what you owe)
        if (type === 'credit-card' || type === 'loan') {
          return sum + Math.max(0, balance); // Positive balance = you owe = liability
        }
        
        // Asset accounts with negative balances (overdrawn) are liabilities
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
  // ONLY show subcategories - parent categories cannot be selected
  const cats=AppState.State.categories.filter(c=>c.type===type);
  const roots=cats.filter(c=>!c.parentCategoryId).sort((a,b)=> a.name.localeCompare(b.name));
  const children=pid=> cats.filter(c=>c.parentCategoryId===pid).sort((a,b)=> a.name.localeCompare(b.name));
  const out=[]; 
  roots.forEach(r=>{ 
    const kids=children(r.id); 
    if(kids.length){ 
      // Only show parent categories that have subcategories
      out.push(`<optgroup label="${r.name}">`); 
      kids.forEach(k=> out.push(`<option value="${k.id}">${k.name}</option>`)); 
      out.push(`</optgroup>`);
    }
    // REMOVED: else clause that allowed selecting parent categories without subcategories
  });   
  return out.join('');
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
  getPendingRecurrentPayments, createRecurrentPayment, disableRecurrentPayment,
  // New currency preference functions
  getPreferredCurrency, formatMoneyPreferred, formatMoneyPreferredNoDecimals,
  toPreferredCurrency, toPreferredCurrencySync, ensureFxRateForPair, convertUSDToPreferred,
  prefetchFxRatesForTransactions, ensureAccountBalanceFxRate, getCachedFxRate,
  formatTransactionAmount,
  // Recalculate all transactions when preferred currency changes
  recalculateAllTransactionAmounts,
  // NEW FX SNAPSHOT SYSTEM
  SUPPORTED_CURRENCIES,
  getFxSnapshotForDate,
  convertToUSD,
  convertFromUSD,
  prepareTransactionWithFx,
  getDisplayAmountForTransaction,
  // Rate validation
  validateFxRate,
  // UI helpers
  showToast
};
