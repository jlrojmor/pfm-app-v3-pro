// FX Rate Diagnostics and Fix Tool
// This module provides comprehensive diagnostics and fixes for FX rate issues

const FXDiagnostics = (function() {
  
  // Test if API is working
  async function testApi(apiName, url, parser) {
    try {
      console.log(`🧪 Testing ${apiName}...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }
      
      const data = await response.json();
      const rate = parser(data);
      
      if (rate && rate > 0 && isFinite(rate)) {
        return { success: true, rate, apiName };
      } else {
        return { success: false, error: `Invalid rate: ${rate}` };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  // Test all available APIs
  async function testAllApis(from = 'USD', to = 'MXN', date = null) {
    const dateStr = date || new Date().toISOString().slice(0, 10);
    const results = [];
    
    // Get API key
    const settings = AppState?.State?.settings || {};
    const apiKey = settings.exchangeratesApiKey || '8a2a1505065219394ebe9bed9400a77b';
    
    const apis = [
      {
        name: 'ExchangeRatesAPI.io',
        url: `https://api.exchangeratesapi.io/v1/${dateStr}?access_key=${apiKey}&base=${from}&symbols=${to}`,
        parser: (data) => {
          if (data.success === false) throw new Error(data.error?.info || 'API Error');
          return data.rates?.[to];
        }
      },
      {
        name: 'ExchangeRate.host (Free)',
        url: `https://api.exchangerate.host/${dateStr}?base=${from}&symbols=${to}`,
        parser: (data) => data.rates?.[to]
      },
      {
        name: 'ExchangeRate-API (Latest)',
        url: `https://api.exchangerate-api.com/v4/latest/${from}`,
        parser: (data) => data.rates?.[to]
      }
    ];
    
    for (const api of apis) {
      const result = await testApi(api.name, api.url, api.parser);
      results.push({ ...result, url: api.url });
    }
    
    return results;
  }
  
  // Check transaction FX rate health
  function checkTransactionHealth(transaction) {
    const issues = [];
    
    // Check if has frozen amounts
    if (transaction.amountPreferred === undefined || transaction.amountPreferred === null) {
      issues.push('Missing amountPreferred');
    }
    
    if (transaction.amountUSD === undefined || transaction.amountUSD === null) {
      issues.push('Missing amountUSD');
    }
    
    // Check if preferred currency matches current setting
    const preferred = Utils.getPreferredCurrency();
    if (transaction.preferredCurrencyAtSave !== preferred) {
      issues.push(`Preferred currency mismatch: ${transaction.preferredCurrencyAtSave} vs ${preferred}`);
    }
    
    // Check if fxRate looks like fallback (20 MXN/USD = 0.05)
    if (transaction.currency === 'MXN' && transaction.fxRate) {
      if (Math.abs(transaction.fxRate - 0.05) < 0.001) {
        issues.push('FX rate looks like fallback (0.05 = 20 MXN/USD)');
      }
    }
    
    return {
      healthy: issues.length === 0,
      issues,
      transaction: {
        id: transaction.id,
        date: transaction.date,
        currency: transaction.currency,
        amount: transaction.amount,
        fxRate: transaction.fxRate,
        amountUSD: transaction.amountUSD,
        amountPreferred: transaction.amountPreferred,
        preferredCurrencyAtSave: transaction.preferredCurrencyAtSave
      }
    };
  }
  
  // Check all transactions
  function checkAllTransactions() {
    const transactions = AppState.State.transactions || [];
    const results = transactions.map(t => checkTransactionHealth(t));
    
    const healthy = results.filter(r => r.healthy).length;
    const unhealthy = results.filter(r => !r.healthy);
    
    return {
      total: transactions.length,
      healthy,
      unhealthy: unhealthy.length,
      issues: unhealthy.map(r => r.issues).flat(),
      details: results
    };
  }
  
  // Fix a single transaction
  async function fixTransaction(transaction) {
    const txnCurrency = transaction.currency || 'USD';
    const txnAmount = Number(transaction.amount);
    const txnDate = transaction.date;
    const preferred = Utils.getPreferredCurrency();
    
    try {
      // Fetch USD rate
      let amountUSD;
      if (txnCurrency === 'USD') {
        amountUSD = txnAmount;
        transaction.fxRate = 1;
      } else {
        const usdRate = await Utils.ensureFxRateForPair(txnCurrency, 'USD', txnDate);
        transaction.fxRate = usdRate;
        amountUSD = txnAmount * usdRate;
      }
      transaction.amountUSD = amountUSD;
      
      // Fetch preferred currency rate
      let amountPreferred;
      if (txnCurrency === preferred) {
        amountPreferred = txnAmount;
      } else {
        const preferredRate = await Utils.ensureFxRateForPair(txnCurrency, preferred, txnDate);
        amountPreferred = txnAmount * preferredRate;
      }
      transaction.amountPreferred = amountPreferred;
      transaction.preferredCurrencyAtSave = preferred;
      
      // Save transaction
      await AppState.saveItem('transactions', transaction, 'transactions');
      
      return { success: true, transaction };
    } catch (error) {
      return { success: false, error: error.message, transaction };
    }
  }
  
  // Fix all transactions
  async function fixAllTransactions(progressCallback = null) {
    const transactions = AppState.State.transactions || [];
    const results = [];
    let fixed = 0;
    let failed = 0;
    
    for (let i = 0; i < transactions.length; i++) {
      const txn = transactions[i];
      const result = await fixTransaction(txn);
      results.push(result);
      
      if (result.success) {
        fixed++;
      } else {
        failed++;
      }
      
      if (progressCallback) {
        progressCallback(i + 1, transactions.length, fixed, failed);
      }
      
      // Small delay to avoid overwhelming APIs
      if (i < transactions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return {
      total: transactions.length,
      fixed,
      failed,
      results
    };
  }
  
  return {
    testAllApis,
    checkTransactionHealth,
    checkAllTransactions,
    fixTransaction,
    fixAllTransactions
  };
})();

// Expose to window for console access
window.FXDiagnostics = FXDiagnostics;




