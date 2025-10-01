// utils.js — helpers, FX, temporal accounting (V5)
function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
function formatMoneyUSD(v){ return (v??0).toLocaleString(undefined,{style:'currency', currency:'USD'}); }
function formatMoney(v, c){ return (v??0).toLocaleString(undefined,{style:'currency', currency:c||'USD'}); }
function formatPercent(v){ if(!isFinite(v)) return '—'; return `${(v*100).toFixed(1)}%`; }
function monthKey(iso){ return (iso||'').slice(0,7); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
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
  
  if (txn.transactionType==='Expense'){ 
    if (txn.fromAccountId===account.id) return isCard? +usdAmount : -usdAmount; 
  }
  else if (txn.transactionType==='Income'){ 
    if (txn.toAccountId===account.id) return +usdAmount; 
  }
  else if (txn.transactionType==='Transfer'){ 
    if (txn.fromAccountId===account.id) return -usdAmount; 
    if (txn.toAccountId===account.id) return +usdAmount; 
  }
  else if (txn.transactionType==='Credit Card Payment'){ 
    if (txn.fromAccountId===account.id) return -usdAmount; 
    if (txn.toAccountId===account.id) return -usdAmount; 
  }
  return 0;
}
function currentBalanceUSD(account){
  const asOfUSD = convertToUSD(account.balanceAsOfAmount||0, account.currency||'USD', latestUsdPerMXN());
  const delta = AppState.State.transactions.filter(t=> t.date > (account.balanceAsOfDate||'')).reduce((s,t)=> s + txnDeltaUSDForAccount(t, account), 0);
  return asOfUSD + delta;
}
function creditLimitUSD(account){ return convertToUSD(account.creditLimit||0, account.currency||'USD', latestUsdPerMXN()); }

function nextDueDates(account, months=2){
  const out=[]; if (!account.dueDay) return out; const now=new Date(); now.setHours(0,0,0,0);
  let m=now.getMonth(), y=now.getFullYear();
  for (let i=0;i<months;i++){ let d=new Date(y,m,Math.min(account.dueDay,28)); if(d<now) d=new Date(y,m+1,Math.min(account.dueDay,28)); out.push(d.toISOString().slice(0,10)); m++; }
  return Array.from(new Set(out));
}
function isDuePaid(card, dueIso){
  const due=new Date(dueIso), prev=new Date(due); prev.setMonth(prev.getMonth()-1);
  const prevDueIso=new Date(prev.getFullYear(),prev.getMonth(), Math.min(card.dueDay||1,28)).toISOString().slice(0,10);
  const start=new Date(prevDueIso); start.setDate(start.getDate()+1);
  return AppState.State.transactions.some(t=> t.transactionType==='Credit Card Payment' && t.toAccountId===card.id && new Date(t.date)>=start && new Date(t.date)<=due);
}

// Enhanced credit card payment due calculation
function calculateCreditCardPaymentDue(card, dueDate) {
  const due = new Date(dueDate);
  const prevDue = new Date(due);
  prevDue.setMonth(prevDue.getMonth() - 1);
  const prevDueIso = new Date(prevDue.getFullYear(), prevDue.getMonth(), Math.min(card.dueDay || 1, 28)).toISOString().slice(0, 10);
  
  // Get all transactions since last due date
  const startDate = new Date(prevDueIso);
  startDate.setDate(startDate.getDate() + 1);
  
  const relevantTxns = (AppState && AppState.State && AppState.State.transactions) ? AppState.State.transactions.filter(t => 
    t.toAccountId === card.id && 
    new Date(t.date) >= startDate && 
    new Date(t.date) <= due
  ) : [];
  
  let totalDue = 0;
  let installmentPayments = 0;
  
  relevantTxns.forEach(txn => {
    if (txn.transactionType === 'Expense') {
      const usdAmount = txn.currency === 'USD' ? Number(txn.amount) : Number(txn.amount) * Number(txn.fxRate || 1);
      
      if (txn.isDeferred && txn.remainingMonths > 0) {
        // For deferred payments, add the monthly installment amount
        installmentPayments += txn.monthlyPaymentAmount || (usdAmount / txn.deferredMonths);
      } else {
        // For regular expenses, add the full amount
        totalDue += usdAmount;
      }
    }
  });
  
  // Add installment payments
  totalDue += installmentPayments;
  
  // Add any existing minimum payment
  totalDue += card.minimumPaymentDue || 0;
  
  return Math.max(totalDue, card.minimumPaymentDue || 0);
}

// Calculate monthly payment for deferred transactions
function calculateMonthlyPayment(amount, months) {
  return amount / months;
}

// Update remaining months for deferred transactions
function updateDeferredTransactionMonths() {
  if (!AppState || !AppState.State || !AppState.State.transactions) return;
  
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  
  AppState.State.transactions.forEach(txn => {
    if (txn.isDeferred && txn.remainingMonths > 0) {
      const txnDate = new Date(txn.date);
      const txnMonth = txnDate.getMonth();
      const txnYear = txnDate.getFullYear();
      
      // Calculate months elapsed since transaction
      const monthsElapsed = (currentYear - txnYear) * 12 + (currentMonth - txnMonth);
      
      // Update remaining months
      txn.remainingMonths = Math.max(0, txn.deferredMonths - monthsElapsed);
      
      // Update monthly payment amount if not set
      if (!txn.monthlyPaymentAmount) {
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
function groupBy(arr, fn){ return arr.reduce((a,x)=>{ const k=fn(x); (a[k]=a[k]||[]).push(x); return a; },{}); }
function confirmDialog(msg){ return new Promise(r=> r(window.confirm(msg))); }
function debounce(fn, wait=200){ let to; return (...args)=>{ clearTimeout(to); to=setTimeout(()=> fn(...args), wait); }; }
function accountById(id){ return AppState.State.accounts.find(a=>a.id===id); }
function accountName(id){ return accountById(id)?.name||'—'; }
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
  const accounts=[...AppState.State.accounts].map(AppState.normalizeAccount);
  const balances={};
  const asOf={};
  const fxLatest=latestUsdPerMXN();
  accounts.forEach(acc=>{
    balances[acc.id]=convertToUSD(acc.balanceAsOfAmount||0, acc.currency||'USD', fxLatest);
    asOf[acc.id]=acc.balanceAsOfDate||'';
  });
  const sortedTx=[...AppState.State.transactions].sort((a,b)=> a.date.localeCompare(b.date));
  const dates=[...new Set(sortedTx.map(t=>t.date))].sort();
  const timeline=[];
  let idx=0;
  for(const date of dates){
    while(idx<sortedTx.length && sortedTx[idx].date<=date){
      const tx=sortedTx[idx];
      const affected=new Set();
      if(tx.fromAccountId) affected.add(tx.fromAccountId);
      if(tx.toAccountId) affected.add(tx.toAccountId);
      affected.forEach(id=>{
        const acc=accounts.find(a=>a.id===id);
        if(!acc) return;
        if(tx.date> (asOf[id]||'')){
          balances[id]+=txnDeltaUSDForAccount(tx, acc);
        }
      });
      idx++;
    }
    const assets=accounts.filter(a=>accountType(a)!=='credit-card').reduce((s,a)=> s+(balances[a.id]||0),0);
    const liabilities=accounts.filter(a=>accountType(a)==='credit-card').reduce((s,a)=> s+(balances[a.id]||0),0);
    timeline.push({ date, netWorthUSD: assets - liabilities });
  }
  return timeline;
}
function buildCategoryOptions(type){
  const cats=AppState.State.categories.filter(c=>c.type===type);
  const roots=cats.filter(c=>!c.parentCategoryId).sort((a,b)=> a.name.localeCompare(b.name));
  const children=pid=> cats.filter(c=>c.parentCategoryId===pid).sort((a,b)=> a.name.localeCompare(b.name));
  const out=[]; roots.forEach(r=>{ const kids=children(r.id); if(kids.length){ out.push(`<optgroup label="${r.name}">`); kids.forEach(k=> out.push(`<option value="${k.id}">— ${k.name}</option>`)); out.push(`</optgroup>`);} else { out.push(`<option value="${r.id}">${r.name}</option>`);} }); return out.join('');
}
window.Utils = {
  $, $all, formatMoneyUSD, formatMoney, formatPercent, monthKey, todayISO,
  fetchUsdPerMXN, latestUsdPerMXN, ensureTodayFX, ensureFxForDate, convertToUSD,
  within, txnDeltaUSDForAccount, currentBalanceUSD, creditLimitUSD, nextDueDates,
  isDuePaid, groupBy, confirmDialog, debounce, buildCategoryOptions,
  accountById, accountName, categoryById, parentCategoryName, accountType,
  accountIcon, accountThemeVar, mapTransactionParties, netWorthTimeline,
  showCdnWarning
};
