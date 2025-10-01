// ui.js — all renderers (V5)
function filterTxByRange(tx, s, e){ return tx.filter(t=> Utils.within(t.date, s, e)); }
function toUSD(txn){ return txn.currency==='USD'? Number(txn.amount) : Number(txn.amount)*Number(txn.fxRate||1); }
function creditCardAccounts(){ return AppState.State.accounts.filter(a=> Utils.accountType(a)==='credit-card'); }
function calcNetWorthInsights(series){
  if(!series.length) return { current:0, prev:0, change:0, largestAsset:null, largestLiability:null, ratio:null };
  const current=series[series.length-1].netWorthUSD;
  const lastMonthDate=new Date(series[series.length-1].date);
  lastMonthDate.setMonth(lastMonthDate.getMonth()-1);
  let prev=series[0];
  for(const point of series){
    if(new Date(point.date)<=lastMonthDate){ prev=point; } else break;
  }
  const change=current - (prev?.netWorthUSD||0);
  const assets=AppState.State.accounts.filter(a=> Utils.accountType(a)!=='credit-card').map(a=>({
    account:a,
    balance:Utils.currentBalanceUSD(a)
  }));
  const largestAsset=assets.sort((a,b)=> b.balance-a.balance)[0]||null;
  const liabilities=creditCardAccounts().map(a=>({ account:a, balance:Utils.currentBalanceUSD(a) }));
  const largestLiability=liabilities.sort((a,b)=> Math.abs(b.balance)-Math.abs(a.balance))[0]||null;
  const totalAssets=assets.reduce((s,a)=> s+Math.max(0,a.balance),0);
  const totalDebts=liabilities.reduce((s,a)=> s+Math.max(0,a.balance),0);
  const ratio= totalAssets>0? totalDebts/totalAssets : null;
  return { current, prev:prev?.netWorthUSD||0, change, largestAsset, largestLiability, ratio };
}
function buildDueEvents(monthsToRender=2, cardsInput){
  const cards=(cardsInput||creditCardAccounts()).filter(c=> c.dueDay);
  const today=new Date(); today.setHours(0,0,0,0);
  const months=[];
  const base=new Date(today.getFullYear(), today.getMonth(),1);
  for(let i=0;i<monthsToRender;i++){ months.push(new Date(base.getFullYear(), base.getMonth()+i,1)); }
  return months.map(monthDate=>{
    const days=new Date(monthDate.getFullYear(), monthDate.getMonth()+1,0).getDate();
    const rows=[];
    for(let d=1; d<=days; d++){
      const iso=new Date(monthDate.getFullYear(), monthDate.getMonth(), d).toISOString().slice(0,10);
      const events=cards.flatMap(card=>{
        const dueIso=new Date(monthDate.getFullYear(), monthDate.getMonth(), Math.min(card.dueDay,28)).toISOString().slice(0,10);
        if(dueIso===iso && !Utils.isDuePaid(card, iso)){
          return [{ name:card.name, amount:card.minimumPaymentDue||0 }];
        }
        return [];
      });
      rows.push({ iso, day:d, events });
    }
    return { month:monthDate, rows };
  });
}
function kpisForRange(s,e){
  const tx=filterTxByRange(AppState.State.transactions,s,e);
  const income=tx.filter(t=>t.transactionType==='Income').reduce((a,t)=>a+toUSD(t),0);
  const expenses=tx.filter(t=>t.transactionType==='Expense').reduce((a,t)=>a+toUSD(t),0);
  const net=income-expenses;
  const expOnly=tx.filter(t=>t.transactionType==='Expense');
  const largest=expOnly.reduce((m,t)=> Math.max(m,toUSD(t)),0);
  const byCat=Utils.groupBy(expOnly, t=>{ const cat=Utils.categoryById(t.categoryId); return cat? (cat.parentCategoryId||cat.id) : '—'; }); let top='—', topVal=0;
  Object.entries(byCat).forEach(([cid,arr])=>{ const sum=arr.reduce((s,t)=>s+toUSD(t),0); if(sum>topVal){ topVal=sum; top=Utils.parentCategoryName(cid); } });
  return {income,expenses,net,largest,topCatName:top, txRange:tx};
}

async function renderDashboard(root){
  root.innerHTML = $('#tpl-dashboard').innerHTML;
  const startEl=$('#dashStart'), endEl=$('#dashEnd');
  const today=Utils.todayISO(); const first=new Date(); first.setDate(1); startEl.value=first.toISOString().slice(0,10); endEl.value=today;
  async function apply(){
    await Utils.ensureTodayFX();
    const {income,expenses,net,largest,topCatName,txRange}=kpisForRange(startEl.value,endEl.value);
    $('#kpiTotalIncome').textContent=Utils.formatMoneyUSD(income);
    $('#kpiTotalExpense').textContent=Utils.formatMoneyUSD(expenses);
    $('#kpiNetFlow').textContent=Utils.formatMoneyUSD(net);
    $('#kpiLargestExp').textContent=largest? Utils.formatMoneyUSD(largest) : '—';
    $('#kpiTopCat').textContent=topCatName;
    Charts.renderCashFlow('chartCashFlow', txRange, startEl.value, endEl.value);
    Charts.renderPieByCategory('chartSpendCat', txRange.filter(t=>t.transactionType==='Expense'), AppState.State.categories, 'Spending (USD)');
    Charts.renderPieByCategory('chartIncomeCat', txRange.filter(t=>t.transactionType==='Income'), AppState.State.categories, 'Income (USD)');
    const exp=txRange.filter(t=>t.transactionType==='Expense'); const byCat=Utils.groupBy(exp, t=> t.categoryId||'—'); const li=[];
    Object.values(byCat).forEach(arr=>{ const avg=arr.reduce((s,t)=>s+Number(t.amount),0)/Math.max(1,arr.length); arr.forEach(t=>{ if(Number(t.amount)>=3*avg){ const cat=AppState.State.categories.find(c=>c.id===t.categoryId)?.name||'—'; const from=AppState.State.accounts.find(a=>a.id===t.fromAccountId)?.name||'—'; li.push(`<li><strong>${t.date}</strong> — ${cat} — ${Utils.formatMoneyUSD(toUSD(t))} <span class="muted">(${from})</span></li>`); } }); });
    $('#unusualList').innerHTML = li.join('') || '<li class="muted">None</li>';
    $('#upcomingPayments30').innerHTML = listUpcoming(30);
  }
  $('#dashApply').addEventListener('click', apply); apply();
}
function listUpcoming(days){
  const today=new Date(); const until=new Date(); until.setDate(until.getDate()+days);
  const cards=creditCardAccounts().filter(a=>a.dueDay); const up=[];
  cards.forEach(a=> Utils.nextDueDates(a,3).forEach(d=>{ const dt=new Date(d); if(dt>=today&&dt<=until&&!Utils.isDuePaid(a,d)){up.push({name:a.name,date:d,min:a.minimumPaymentDue||0}); } }));
  up.sort((a,b)=>a.date.localeCompare(b.date)); if(up.length===0) return '<li class="muted">No payments due in range.</li>';
  return up.map(a=> `<li><strong>${a.name}</strong> — Due ${a.date} — Min ${Utils.formatMoneyUSD(a.min)}</li>`).join('');
}

async function renderAccounts(root){
  root.innerHTML = $('#tpl-accounts').innerHTML;
  const list=$('#accountsList'); const dlg=$('#dlgAccount'); const form=$('#formAccount'); const btnAdd=$('#btnAddAccount'); const btnClose=$('#btnCloseAccount');
  const creditFields=()=>$all('.credit-only', form);
  function draw(){
    const accounts = [...AppState.State.accounts].map(a => AppState.normalizeAccount(a));
    
    // Group accounts by type
    const grouped = {
      'credit-card': accounts.filter(a => Utils.accountType(a) === 'credit-card'),
      'checking': accounts.filter(a => Utils.accountType(a) === 'checking'),
      'savings': accounts.filter(a => Utils.accountType(a) === 'savings'),
      'cash': accounts.filter(a => Utils.accountType(a) === 'cash')
    };
    
    // Sort each group by name
    Object.keys(grouped).forEach(type => {
      grouped[type].sort((a,b) => a.name.localeCompare(b.name));
    });
    
    const typeLabels = {
      'credit-card': '💳 Credit Cards',
      'checking': '🏦 Checking Accounts', 
      'savings': '💰 Savings Accounts',
      'cash': '💵 Cash'
    };
    
    let html = '';
    
    // Render each group in logical order
    const typeOrder = ['credit-card', 'checking', 'savings', 'cash'];
    
    typeOrder.forEach(type => {
      const accountsOfType = grouped[type];
      if (accountsOfType.length === 0) return;
      
      html += `<div class="account-group">
        <h3 class="group-header">${typeLabels[type]} (${accountsOfType.length})</h3>
        <div class="group-accounts">`;
      
      accountsOfType.forEach(account => {
        const balUSD = Utils.currentBalanceUSD(account);
        const limitUSD = Utils.creditLimitUSD(account);
        const accountType = Utils.accountType(account);
        const badgeLabel = accountType.replace('-', ' ');
        
        html += `<div class="card account-card" data-type="${accountType}">
          <div class="header-row">
            <div class="icon">${Utils.accountIcon(account)}</div>
            <div style="flex:1">
              <div style="display:flex; align-items:center; gap:.5rem; flex-wrap:wrap;">
                <strong>${account.name}</strong>
                <span class="badge">${badgeLabel}</span>
                <span class="muted">${account.country}</span>
              </div>
              <div class="muted">Balance As Of: ${Utils.formatMoney(account.balanceAsOfAmount, account.currency)} on ${account.balanceAsOfDate||'—'}</div>
              <div>Computed Balance (USD): <strong>${Utils.formatMoneyUSD(balUSD)}</strong></div>
              ${accountType==='credit-card'? `<div class="muted">Limit: ${Utils.formatMoneyUSD(limitUSD)} • Due day: ${account.dueDay||'—'} • Min: ${Utils.formatMoneyUSD(account.minimumPaymentDue||0)}</div>`:''}
              ${accountType==='cash'? `<div class="muted">Balance As Of Date ensures manual cash tracking stays accurate.</div>`:''}
            </div>
            <div class="row" style="gap:.5rem; align-self:flex-start;">
              <button class="btn" data-edit="${account.id}">Edit</button>
              <button class="btn danger" data-del="${account.id}">Delete</button>
            </div>
          </div>
        </div>`;
      });
      
      html += `</div></div>`;
    });
    
    list.innerHTML = html || '<div class="muted">No accounts yet.</div>';
  }
  function updateAccountFormState(){
    const type=$('#accType').value;
    creditFields().forEach(el=> el.classList.toggle('hidden', type!=='credit-card'));
    validateAccountForm();
  }
  function validateAccountForm(){
    const type=$('#accType').value;
    const creditLimit=Number($('#accCreditLimit').value||0);
    const dueDay=$('#accDueDay').value;
    const balanceAmt=Number($('#accAsOfAmt').value||0);
    const balanceDate=$('#accAsOfDate').value;
    const limitOk = type!=='credit-card' || creditLimit>0;
    const dueOk = type!=='credit-card' || (!!dueDay && Number(dueDay)>=1 && Number(dueDay)<=28);
    const balOk = !isNaN(balanceAmt);
    const dateOk = !!balanceDate;
    Validate.setValidity($('#accCreditLimit'), limitOk, 'Required for credit cards');
    Validate.setValidity($('#accDueDay'), dueOk, 'Required for credit cards');
    Validate.setValidity($('#accAsOfAmt'), balOk, 'Balance is required');
    Validate.setValidity($('#accAsOfDate'), dateOk, 'Balance date required');
    $('#formAccount button[type="submit"]').disabled = !(limitOk && dueOk && balOk && dateOk && $('#accName').value.trim());
  }
  function openForm(account){
    form.reset();
    if(account){
      const normalized=AppState.normalizeAccount(account);
      $('#accountFormTitle').textContent='Edit Account';
      $('#accId').value=normalized.id;
      $('#accName').value=normalized.name;
      $('#accType').value=Utils.accountType(normalized);
      $('#accCurrency').value=normalized.currency||'USD';
      $('#accCountry').value=normalized.country||'USA';
      $('#accAsOfAmt').value=normalized.balanceAsOfAmount||0;
      $('#accAsOfDate').value=normalized.balanceAsOfDate||Utils.todayISO();
      $('#accCreditLimit').value=normalized.creditLimit||0;
      $('#accNextClosing').value=normalized.nextClosingDate||'';
      $('#accDueDay').value=normalized.dueDay||'';
      $('#accMinDue').value=normalized.minimumPaymentDue||0;
    }else{
      $('#accountFormTitle').textContent='Add Account';
      $('#accId').value='';
      $('#accType').value='checking';
      $('#accCurrency').value='USD';
      $('#accCountry').value='USA';
      $('#accAsOfDate').value=Utils.todayISO();
    }
    updateAccountFormState();
    dlg.showModal();
  }
  draw();
  btnAdd.addEventListener('click', ()=> openForm(null));
  btnClose.addEventListener('click', ()=> dlg.close());
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if($('#formAccount button[type="submit"]').disabled) return;
    const id=$('#accId').value||crypto.randomUUID();
    const accountType=$('#accType').value;
    const obj={ id,
      name:$('#accName').value.trim(),
      type:accountType.replace('-', '_'),
      accountType,
      currency:$('#accCurrency').value,
      country:$('#accCountry').value,
      balanceAsOfAmount:Number($('#accAsOfAmt').value||0),
      balanceAsOfDate:$('#accAsOfDate').value||Utils.todayISO(),
      creditLimit:Number($('#accCreditLimit').value||0),
      nextClosingDate:$('#accNextClosing').value||'',
      dueDay: $('#accDueDay').value? Number($('#accDueDay').value):null,
      minimumPaymentDue:Number($('#accMinDue').value||0)
    };
    await AppState.saveItem('accounts', obj, 'accounts');
    draw();
    dlg.close();
  });
  form.addEventListener('input', validateAccountForm);
  $('#accType').addEventListener('change', updateAccountFormState);
  list.addEventListener('click', async (e)=>{
    const t=e.target;
    if (t.dataset.edit){
      const a=AppState.State.accounts.find(x=>x.id===t.dataset.edit);
      openForm(a);
    }
    if (t.dataset.del){
      if (await Utils.confirmDialog('Delete this account?')){
        await AppState.deleteItem('accounts', t.dataset.del, 'accounts');
        renderAccounts(root);
      }
    }
  });
}

async function renderCategories(root){
  root.innerHTML = $('#tpl-categories').innerHTML;
  const btnAdd=$('#btnAddCategory'); const dlg=$('#dlgCategory'); const form=$('#formCategory'); const btnClose=$('#btnCloseCategory');
  function options(tp){ return AppState.State.categories.filter(c=>!c.parentCategoryId && (!tp||c.type===tp)).sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<option value="${c.id}">${c.name}</option>`).join(''); }
  function tree(type){
    const roots=AppState.State.categories.filter(c=>c.type===type && !c.parentCategoryId).sort((a,b)=>a.name.localeCompare(b.name));
    const children=pid=> AppState.State.categories.filter(c=>c.parentCategoryId===pid).sort((a,b)=>a.name.localeCompare(b.name));
    const li=roots.map(r=>{ const kids=children(r.id); return `<li>
      <strong>${r.name}</strong> <span class="muted">(${type})</span>
      <div style="margin:.25rem 0;display:flex;gap:.4rem;">
        <button class="btn" data-addsub="${r.id}">Add Subcategory</button>
        <button class="btn" data-edit="${r.id}">Edit</button>
        <button class="btn danger" data-del="${r.id}">Delete</button>
      </div>
      ${kids.length?'<ul>'+kids.map(k=>`<li>— ${k.name} <button class="btn" data-edit="${k.id}">Edit</button> <button class="btn danger" data-del="${k.id}">Delete</button></li>`).join('')+'</ul>':''}
    </li>`; }).join('');
    return li || '<li class="muted">No categories yet</li>';
  }
  function draw(){ $('#expenseCats').innerHTML=tree('expense'); $('#incomeCats').innerHTML=tree('income'); }
  draw();
  btnAdd.addEventListener('click', ()=>{ form.reset(); $('#catId').value=''; $('#catFormTitle').textContent='Add Category'; $('#catType').value='expense'; $('#catParent').innerHTML='<option value="">— none —</option>'+options(); dlg.showModal(); });
  btnClose.addEventListener('click', ()=> dlg.close());
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const id=$('#catId').value||crypto.randomUUID();
    const obj={ id, name:$('#catName').value.trim(), type:$('#catType').value, parentCategoryId: $('#catParent').value||'' };
    await AppState.saveItem('categories', obj, 'categories'); draw(); dlg.close();
  });
  root.addEventListener('click', async (e)=>{
    const t=e.target;
    if (t.dataset.addsub){ form.reset(); $('#catId').value=''; $('#catFormTitle').textContent='Add Subcategory'; const tp=AppState.State.categories.find(c=>c.id===t.dataset.addsub).type; $('#catType').value=tp; $('#catParent').innerHTML='<option value="">— none —</option>'+options(tp); $('#catParent').value=t.dataset.addsub; dlg.showModal(); }
    if (t.dataset.edit){ const c=AppState.State.categories.find(x=>x.id===t.dataset.edit); form.reset(); $('#catId').value=c.id; $('#catFormTitle').textContent='Edit Category'; $('#catName').value=c.name; $('#catType').value=c.type; $('#catParent').innerHTML='<option value="">— none —</option>'+options(c.type); $('#catParent').value=c.parentCategoryId||''; dlg.showModal(); }
    if (t.dataset.del){ if (await Utils.confirmDialog('Delete this category?')){ await AppState.deleteItem('categories', t.dataset.del, 'categories'); renderCategories(root);} }
  });
}

async function renderBudget(root){
  root.innerHTML = $('#tpl-budget').innerHTML;

  // --- form controls
  const typeSel = $('#bType');
  const catSel  = $('#bCategory');
  const amtInp  = $('#bAmount');
  const cadSel  = $('#bCadence');
  const ancInp  = $('#bAnchor');
  const untilInp= $('#bUntil');
  const btnSave = $('#btnBudgetSeriesSave');
  const btnClear= $('#btnBudgetSeriesReset');

  // --- monthly view controls
  const monthInp = $('#bMonth');
  const chartEl  = $('#bvaChart');
  let chartInst  = null;
  let isDeleting = false; // Prevent multiple simultaneous deletions

  // Fill categories by type
  function fillCats(){
    const kind = typeSel.value === 'expense' ? 'expense' : 'income';
    catSel.innerHTML = Utils.buildCategoryOptions(kind);
  }
  typeSel.addEventListener('change', fillCats);
  fillCats();

  // Defaults
  ancInp.value = Utils.todayISO();
  monthInp.value = Utils.todayISO().slice(0,7);

  // Save series
  btnSave.onclick = async () => {
    const b = AppState.newBudget();
    b.type       = typeSel.value;
    b.categoryId = catSel.value;
    b.amount     = Number(amtInp.value||0);
    b.cadence    = cadSel.value || 'monthly';
    b.anchorDate = ancInp.value || Utils.todayISO();
    b.repeatUntil= untilInp.value || '';
    b.createdAt  = Utils.todayISO();

    if(!b.categoryId || !b.amount){ alert('Pick a category and amount.'); return; }

    await AppState.saveItem('budgets', b, 'budgets');
    drawSeries();
    drawMonthly();
    btnClear.click();
  };
  btnClear.onclick = () => {
    amtInp.value = '';
    cadSel.value = 'monthly';
    ancInp.value = Utils.todayISO();
    untilInp.value = '';
  };

  // Remove series
  async function deleteSeries(id){
    if(isDeleting) return; // Prevent multiple simultaneous deletions
    
    if(await Utils.confirmDialog('Delete this budget series?')){
      isDeleting = true;
      try {
        await AppState.deleteItem('budgets', id, 'budgets');
        drawSeries();
        drawMonthly();
      } catch (error) {
        console.error('Error deleting budget series:', error);
        alert('Error deleting budget series. Please try again.');
      } finally {
        isDeleting = false;
      }
    }
  }

  // Expand a series into instances covering a month window
  function expandSeriesForMonth(series, y, m){
    // month span: [first day, last day]
    const startOfMonth = new Date(y, m, 1);
    const endOfMonth   = new Date(y, m+1, 0);
    const untilTs = series.repeatUntil ? new Date(series.repeatUntil).getTime() : Infinity;
    const anchor   = new Date(series.anchorDate);

    const inst = [];
    function pushIfInRange(d){
      const ts = d.getTime();
      if(ts >= startOfMonth.getTime() && ts <= endOfMonth.getTime() && ts <= untilTs){
        inst.push({ date: d.toISOString().slice(0,10), amount: series.amount, seriesId: series.id, categoryId: series.categoryId, type: series.type });
      }
    }

    if(series.cadence === 'monthly'){
      // Generate the one date for that month aligned to the anchor day
      const d = new Date(y, m, Math.min(anchor.getDate(), 28));
      if (d.getTime() >= new Date(series.anchorDate).getTime()) pushIfInRange(d);
    }
    else if(series.cadence === 'weekly' || series.cadence === 'biweekly'){
      const step = series.cadence === 'weekly' ? 7 : 14;
      // find the first occurrence on/after month start
      const first = new Date(anchor);
      while (first < startOfMonth) first.setDate(first.getDate() + step);
      for (let d = new Date(first); d <= endOfMonth; d.setDate(d.getDate()+step)){
        if (d.getTime() >= new Date(series.anchorDate).getTime()) pushIfInRange(new Date(d));
      }
    }
    return inst;
  }

  function monthParts(isoYYYYMM){
    const [yy,mm] = isoYYYYMM.split('-').map(Number);
    return { y: yy, m: mm-1 };
  }

  function actualsForMonth(isoYYYYMM){
    const { y, m } = monthParts(isoYYYYMM);
    const start = new Date(y, m, 1).toISOString().slice(0,10);
    const end   = new Date(y, m+1, 0).toISOString().slice(0,10);

    const tx = AppState.State.transactions.filter(t => Utils.within(t.date, start, end));
    const byCat = new Map(); // key: categoryId + type
    for (const t of tx){
      const keyType = (t.transactionType === 'Expense') ? 'expense' :
                      (t.transactionType === 'Income')  ? 'income'  : '';
      if(!keyType || !t.categoryId) continue;
      const key = `${keyType}|${t.categoryId}`;
      const prev = byCat.get(key) || 0;
      byCat.set(key, prev + (t.currency==='USD' ? Number(t.amount) : Number(t.amount)*Number(t.fxRate||1)));
    }
    return byCat;
  }

  // Build monthly BvA rows
  function computeBVA(isoYYYYMM){
    const { y, m } = monthParts(isoYYYYMM);
    const allSeries = [...AppState.State.budgets];
    const expanded = allSeries.flatMap(s => expandSeriesForMonth(normalizeSeries(s), y, m));

    // Sum budget by type/category
    const budByCat = new Map();
    for(const b of expanded){
      const key = `${b.type}|${b.categoryId}`;
      budByCat.set(key, (budByCat.get(key)||0) + b.amount);
    }

    const actByCat = actualsForMonth(isoYYYYMM);

    // union of keys
    const keys = new Set([...budByCat.keys(), ...actByCat.keys()]);
    const rows = [];
    let budTot=0, actTot=0;

    for(const key of keys){
      const [type, categoryId] = key.split('|');
      const cat = AppState.State.categories.find(c=>c.id===categoryId);
      const name = cat ? cat.name : '—';

      const budget = budByCat.get(key) || 0;
      const actual = actByCat.get(key) || 0;
      const variance = (type==='expense') ? (budget - actual) : (actual - budget);

      budTot += budget;
      actTot += actual;

      rows.push({ type, categoryId, name, budget, actual, variance });
    }

    // sort by type then name
    rows.sort((a,b)=> a.type===b.type ? a.name.localeCompare(b.name) : a.type.localeCompare(b.type));

    return { rows, budTot, actTot, varTot: (actTot - budTot) }; // overall variance sign chosen "actual - budget"
  }

  function normalizeSeries(s){
    return {
      ...s,
      cadence: s.cadence || 'monthly',
      anchorDate: s.anchorDate || s.startDate || Utils.todayISO(),
      repeatUntil: s.repeatUntil || s.endDate || ''
    };
  }

  // Draw Series table
  function drawSeries(){
    const tbody = $('#tblSeries tbody');
    const data = [...AppState.State.budgets].map(normalizeSeries).sort((a,b)=>{
      const an = AppState.State.categories.find(c=>c.id===a.categoryId)?.name||'';
      const bn = AppState.State.categories.find(c=>c.id===b.categoryId)?.name||'';
      return an.localeCompare(bn);
    });

    tbody.innerHTML = data.map(b=>{
      const cname = AppState.State.categories.find(c=>c.id===b.categoryId)?.name || '—';
      return `<tr>
        <td>${b.type}</td>
        <td>${cname}</td>
        <td>${b.cadence}</td>
        <td>${Utils.formatMoneyUSD(b.amount)}</td>
        <td>${b.anchorDate}</td>
        <td>${b.repeatUntil||'—'}</td>
        <td><button class="btn danger" data-del="${b.id}">Delete</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="muted">No series yet</td></tr>';

    // Use onclick to replace any existing handler
    tbody.onclick = (e)=>{
      e.preventDefault();
      e.stopPropagation();
      
      // Only process clicks on delete buttons
      if(e.target && e.target.classList.contains('btn') && e.target.classList.contains('danger')){
        const id = e.target?.dataset?.del;
        if(id) {
          console.log('Delete button clicked for ID:', id);
          deleteSeries(id);
        }
      }
    };
  }

  // Draw Monthly BvA (table + chart)
  function drawMonthly(){
    const isoMMMM = monthInp.value || Utils.todayISO().slice(0,7);
    const { rows, budTot, actTot, varTot } = computeBVA(isoMMMM);

    const tb = $('#tblBVA tbody');
    tb.innerHTML = rows.map(r => `
      <tr>
        <td>${r.type==='expense'?'🧾':'💵'} ${r.name}</td>
        <td>${Utils.formatMoneyUSD(r.budget)}</td>
        <td>${Utils.formatMoneyUSD(r.actual)}</td>
        <td class="${r.variance<0?'bad': 'good'}">${Utils.formatMoneyUSD(r.variance)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="muted">No data</td></tr>';

    $('#bvaBudTot').textContent = Utils.formatMoneyUSD(budTot);
    $('#bvaActTot').textContent = Utils.formatMoneyUSD(actTot);
    $('#bvaVarTot').textContent = Utils.formatMoneyUSD(varTot);

    // Chart: top 8 categories by absolute variance
    const top = [...rows].sort((a,b)=> Math.abs(b.variance) - Math.abs(a.variance)).slice(0,8);
    const labels = top.map(x=>x.name);
    const bud = top.map(x=>x.budget);
    const act = top.map(x=>x.actual);

    if(chartInst && chartInst.destroy) chartInst.destroy();
    // Use Charts.js wrapper if present, else raw Chart.js (already bundled)
    chartInst = new Chart(chartEl.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Budget', data: bud },
          { label: 'Actual', data: act }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // init
  monthInp.addEventListener('change', drawMonthly);
  drawSeries();
  drawMonthly();
}

async function renderTransactions(root){
  root.innerHTML = $('#tpl-transactions').innerHTML;
  const form=$('#formTxn');
  const date=$('#txnDate');
  const type=$('#txnType');
  const amount=$('#txnAmount');
  const currency=$('#txnCurrency');
  const fx=$('#txnFx');
  const fromSel=$('#txnFromAccount');
  const toSel=$('#txnToAccount');
  const catSel=$('#txnCategory');
  const desc=$('#txnDesc');
  const hiddenId=$('#txnId');
  const btnSubmit=$('#txnSubmit');
  const btnCancel=$('#btnCancelEdit');
  const btnSortAmount=$('#txnSortAmount');
  const bulkDialog=$('#dlgTxnBulk');
  const bulkForm=$('#formTxnBulk');
  const bulkInput=$('#bulkInput');
  const btnBulkClose=$('#btnBulkClose');
  const btnAddMultiple=$('#btnAddMultiple');
  const filterText=$('#filterText');
  const filterType=$('#filterType');
  const filterStart=$('#filterStart');
  const filterEnd=$('#filterEnd');
  const filterAccount=$('#filterAccount');
  const filterCategory=$('#filterCategory');
  const filterClear=$('#btnClearFilters');
  let sortKey='date';
  let sortDir='desc';
  let editingId=null;
  function rootCategoryId(catId){ const cat=Utils.categoryById(catId); if(!cat) return ''; return cat.parentCategoryId||cat.id; }
  function buildFilterCategoryOptions(){
    const roots=AppState.State.categories.filter(c=>!c.parentCategoryId).sort((a,b)=> a.name.localeCompare(b.name));
    return '<option value="">All</option>'+roots.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  }
  function fillAccounts(){
    const sorted=[...AppState.State.accounts].sort((a,b)=> a.name.localeCompare(b.name));
    const opts=sorted.map(a=>`<option value="${a.id}">${Utils.accountIcon(a)} ${a.name}</option>`).join('');
    fromSel.innerHTML=opts;
    filterAccount.innerHTML='<option value="">All</option>'+opts;
    
    // Fill "To" field based on transaction type
    fillToField();
  }
  
  function fillToField(){
    const txnType = type.value;
    if (txnType === 'Expense') {
      // For expenses, show categories in "To" field
      const expenseCats = AppState.State.categories.filter(c => c.type === 'expense').sort((a,b) => a.name.localeCompare(b.name));
      const catOpts = expenseCats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      toSel.innerHTML = catOpts;
    } else {
      // For income, transfers, etc., show accounts in "To" field
      const sorted=[...AppState.State.accounts].sort((a,b)=> a.name.localeCompare(b.name));
      const opts=sorted.map(a=>`<option value="${a.id}">${Utils.accountIcon(a)} ${a.name}</option>`).join('');
      toSel.innerHTML=opts;
    }
  }
  function fillCats(kind){
    catSel.innerHTML = Utils.buildCategoryOptions(kind==='Expense'?'expense':kind==='Income'?'income':'expense');
  }
  function setVisibility(){
    const t=type.value;
    if (t==='Expense'){
      $('#lblFromAcc').classList.remove('hidden');
      $('#lblToAcc').classList.remove('hidden'); // Show "To" field for expenses (will contain categories)
      fromSel.required=true; toSel.required=true;
      $('#lblCategory').classList.add('hidden'); catSel.required=false; // Hide separate category field
      fillCats('Expense');
    }else if (t==='Income'){
      $('#lblFromAcc').classList.add('hidden');
      $('#lblToAcc').classList.remove('hidden');
      fromSel.required=false; toSel.required=true;
      $('#lblCategory').classList.remove('hidden'); catSel.required=true; fillCats('Income');
    }else{
      $('#lblFromAcc').classList.remove('hidden');
      $('#lblToAcc').classList.remove('hidden');
      fromSel.required=true; toSel.required=true;
      $('#lblCategory').classList.add('hidden'); catSel.required=false;
    }
    
    // Update "To" field based on transaction type
    fillToField();
  }
  function validateForm(){
    const t=type.value;
    const amtOk=Number(amount.value)>0;
    const needCat=(t==='Expense'||t==='Income');
    const requiresFx = currency.value !== 'USD';
    const fxVal = requiresFx ? fx.value : (fx.value || '1');
    const fxOk = requiresFx? Number(fxVal)>0 : true;
    let accountsOk=true;
    if(t==='Expense') accountsOk=!!fromSel.value;
    if(t==='Income') accountsOk=!!toSel.value;
    if(t==='Transfer'||t==='Credit Card Payment') accountsOk=!!fromSel.value && !!toSel.value && fromSel.value!==toSel.value;
    Validate.setValidity(amount, amtOk, 'Amount must be > 0');
    Validate.setValidity(fx, fxOk, 'FX rate required');
    Validate.setValidity(fromSel, (t==='Expense'||t==='Transfer'||t==='Credit Card Payment')?!!fromSel.value:true, 'Required');
    Validate.setValidity(toSel, (t==='Income'||t==='Transfer'||t==='Credit Card Payment')?!!toSel.value:true, 'Required');
    Validate.setValidity(catSel, needCat?!!catSel.value:true, 'Pick a category');
    Validate.setValidity(date, !!date.value, 'Pick a date');
    btnSubmit.disabled = !(amtOk && accountsOk && (!!date.value) && (needCat?!!catSel.value:true) && fxOk);
  }
  let fxRequestId = 0;
  async function updateFx(){
    fx.placeholder='';
    fx.readOnly = currency.value==='USD';
    if(currency.value==='USD'){ fx.value=1; validateForm(); return; }
    const iso=date.value||Utils.todayISO();
    const requestId = ++fxRequestId;
    try{
      const rate=await Utils.ensureFxForDate(iso);
      if (requestId!==fxRequestId) return;
      fx.value=Number(rate).toFixed(4);
      Validate.setValidity(fx, true, "");
    }catch(e){
      if (requestId!==fxRequestId) return;
      fx.value='';
      fx.placeholder='Enter rate manually';
      Validate.setValidity(fx, false, "Unable to fetch FX rate; enter manually.");
    }
    validateForm();
  }
  function resetForm(){
    form.reset();
    fillAccounts();
    setVisibility();
    validateForm();
    const last=AppState.State.settings.lastTxnDate;
    if (AppState.State.settings.defaultTxnDateMode==='selected' && last){ date.value=last; }
    else { date.value=Utils.todayISO(); }
    updateFx();
    editingId=null;
    hiddenId.value='';
    btnSubmit.textContent='Add';
    btnCancel.classList.add('hidden');
  }
  function prefillForm(txn, duplicate=false){
    form.reset();
    editingId = duplicate? null : txn.id;
    hiddenId.value = duplicate? '' : txn.id;
    type.value=txn.transactionType;
    setVisibility();
    date.value=txn.date;
    amount.value=txn.amount;
    currency.value=txn.currency||'USD';
    fx.value=Number(txn.fxRate||1).toFixed(4);
    fx.placeholder='';
    fromSel.value=txn.fromAccountId||'';
    
    // Handle "To" field based on transaction type
    if (txn.transactionType === 'Expense') {
      toSel.value = txn.categoryId || ''; // For expenses, "To" field contains category ID
    } else {
      toSel.value = txn.toAccountId || ''; // For other types, "To" field contains account ID
    }
    
    if(txn.categoryId && txn.transactionType !== 'Expense') catSel.value=txn.categoryId;
    desc.value=txn.description||'';
    validateForm();
    btnSubmit.textContent = duplicate? 'Add' : 'Save Changes';
    btnCancel.classList.toggle('hidden', duplicate);
  }
  fillAccounts();
  filterCategory.innerHTML = buildFilterCategoryOptions();
  setVisibility();
  validateForm();
  if (AppState.State.settings.defaultTxnDateMode==='selected' && AppState.State.settings.lastTxnDate){ date.value = AppState.State.settings.lastTxnDate; }
  else { date.value = Utils.todayISO(); }
  updateFx();
  type.addEventListener('change', ()=>{ setVisibility(); validateForm(); });
  $all('#formTxn input, #formTxn select').forEach(el=> el.addEventListener('input', validateForm));
  currency.addEventListener('change', updateFx);
  date.addEventListener('change', updateFx);
  const debouncedFilters=Utils.debounce(()=> drawTable(), 200);
  filterText.addEventListener('input', debouncedFilters);
  [filterType, filterStart, filterEnd, filterAccount, filterCategory].forEach(el=> el.addEventListener('change', drawTable));
  filterClear.addEventListener('click', ()=>{ filterText.value=''; filterType.value=''; filterStart.value=''; filterEnd.value=''; filterAccount.value=''; filterCategory.value=''; drawTable(); });
  btnCancel.addEventListener('click', ()=> resetForm());
  btnAddMultiple.addEventListener('click', ()=>{ bulkInput.value=''; bulkDialog.showModal(); });
  btnBulkClose.addEventListener('click', ()=> bulkDialog.close());
  bulkForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const lines=bulkInput.value.split(/\n+/).map(l=>l.trim()).filter(Boolean);
    if(!lines.length){ bulkDialog.close(); return; }
    const accountsByName=new Map(AppState.State.accounts.map(a=>[a.name.toLowerCase(), a.id]));
    const categoriesByName=new Map(AppState.State.categories.map(c=>[c.name.toLowerCase(), c.id]));
    for (const line of lines){
      const parts=line.split(',');
      const [d,tt,amt,curr,fromName,toName,catName,description,fxRateValue]=parts.map(p=> (p??'').trim());
      const txn=AppState.newTransaction();
      txn.date=d||Utils.todayISO();
      const typeMap={ 'expense':'Expense', 'income':'Income', 'transfer':'Transfer', 'credit card payment':'Credit Card Payment', 'credit-card payment':'Credit Card Payment' };
      const normalizedType=typeMap[(tt||'Expense').toLowerCase()]||'Expense';
      txn.transactionType=normalizedType;
      txn.amount=Number(amt||0);
      txn.currency=curr||'USD';
      txn.description=description||'';
      const fromId=fromName? accountsByName.get(fromName.toLowerCase())||'':'';
      const toId=toName? accountsByName.get(toName.toLowerCase())||'':'';
      if(txn.transactionType==='Expense'){ txn.fromAccountId=fromId; txn.toAccountId=''; }
      else if(txn.transactionType==='Income'){ txn.fromAccountId=''; txn.toAccountId=toId; }
      else { txn.fromAccountId=fromId; txn.toAccountId=toId; }
      const categoryMatch=catName? categoriesByName.get(catName.toLowerCase()):'';
      txn.categoryId=categoryMatch||'';
      if(txn.currency==='USD'){ txn.fxRate=1; }
      else if(fxRateValue){ txn.fxRate=Number(fxRateValue)||1; }
      else{
        try{ txn.fxRate=await Utils.ensureFxForDate(txn.date); }
        catch(e){ txn.fxRate=1; }
      }
      await AppState.saveItem('transactions', txn, 'transactions');
    }
    bulkDialog.close();
    drawTable();
  });
  btnSortAmount.addEventListener('click', ()=>{ sortKey='amount'; sortDir= sortDir==='desc'?'asc':'desc'; drawTable(); });
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(btnSubmit.disabled) return;
    const txn=editingId? AppState.State.transactions.find(x=>x.id===editingId) : AppState.newTransaction();
    txn.id = editingId || txn.id;
    txn.date = date.value;
    txn.transactionType = type.value;
    txn.amount = Number(amount.value||0);
    txn.currency = currency.value;
    txn.fxRate = Number(fx.value||1);
    txn.description = desc.value.trim();
    txn.fromAccountId = fromSel.value||'';
    
    // Handle "To" field based on transaction type
    if (txn.transactionType === 'Expense') {
      // For expenses, "To" field contains category ID
      txn.toAccountId = ''; // No account for expenses
      txn.categoryId = toSel.value || ''; // Category comes from "To" field
    } else {
      // For other types, "To" field contains account ID
      txn.toAccountId = toSel.value || '';
      txn.categoryId = (txn.transactionType==='Income')? (catSel.value||'') : '';
    }
    
    await AppState.saveItem('transactions', txn, 'transactions');
    if (!editingId && AppState.State.settings.defaultTxnDateMode==='selected'){
      AppState.State.settings.lastTxnDate = txn.date;
      await AppState.saveItem('settings', AppState.State.settings, 'settings');
    }
    resetForm();
    drawTable();
  });
  async function removeTxn(id){
    if(await Utils.confirmDialog('Delete this transaction?')){
      await AppState.deleteItem('transactions', id, 'transactions');
      drawTable();
    }
  }
  function passesFilter(t){
    const txt=filterText.value.toLowerCase();
    const typ=filterType.value;
    const start=filterStart.value;
    const end=filterEnd.value;
    const acc = filterAccount.value;
if (acc) {
  // Accept either account ID or legacy account NAME stored in the transaction
  const accObj   = AppState.State.accounts.find(a => a.id === acc);
  const accNameL = (accObj?.name || '').toLowerCase();

  const fromRaw = (t.fromAccountId || '');
  const toRaw   = (t.toAccountId   || '');

  const fromMatch =
    fromRaw === acc || fromRaw.toLowerCase() === accNameL;

  const toMatch =
    toRaw === acc || toRaw.toLowerCase() === accNameL;

  if (!(fromMatch || toMatch)) return false;
}
    if(cat && rootCategoryId(t.categoryId)!==cat) return false;
    return true;
  }
  
function passesFilter2(t){
  // --- read filter values safely ---
  const txt   = (filterText.value || '').toLowerCase().trim();
  const typ   = filterType.value || '';
  const start = filterStart.value || '';
  const end   = filterEnd.value || '';
  const cat   = filterCategory.value || '';

  // --- text ---
  if (txt) {
    const desc = (t.description || '').toLowerCase();
    if (!desc.includes(txt)) return false;
  }

  // --- type ---
  if (typ && t.transactionType !== typ) return false;

  // --- date range (inclusive) ---
  if (start && t.date < start) return false;
  if (end   && t.date > end)   return false;

  // --- account (match by ID OR by visible name in the dropdown) ---
  const accSel   = document.querySelector('#filterAccount');
  const accId    = accSel?.value || '';
  const accLabel = accSel?.selectedOptions?.[0]?.text?.trim().toLowerCase() || '';

  if (accId) {
    const fromRaw = String(t.fromAccountId || '').trim();
    const toRaw   = String(t.toAccountId   || '').trim();
    const fromLow = fromRaw.toLowerCase();
    const toLow   = toRaw.toLowerCase();

    const match =
      // Exact ID match (normal case)
      fromRaw === accId || toRaw === accId ||
      // Legacy rows that stored the account NAME instead of ID
      (accLabel && (fromLow === accLabel || toLow === accLabel));

    if (!match) return false;
  }

  // --- category (root category match, like your UI expects) ---
  if (cat && rootCategoryId(t.categoryId) !== cat) return false;

  return true;
}
// NEW: unified transaction filter used by the table
function txFilter(t){
  const txt   = (document.getElementById('filterText')?.value || '').toLowerCase().trim();
  const typ   =  document.getElementById('filterType')?.value || '';
  const start =  document.getElementById('filterStart')?.value || '';
  const end   =  document.getElementById('filterEnd')?.value || '';
  const cat   =  document.getElementById('filterCategory')?.value || '';

  if (txt && !((t.description || '').toLowerCase().includes(txt))) return false;
  if (typ && t.transactionType !== typ) return false;
  if (start && t.date < start) return false;
  if (end   && t.date > end)   return false;

  // Account: match by ID
  const accEl    = document.getElementById('filterAccount');
  const accId    = accEl?.value || '';
  if (accId){
    const fromRaw = String(t.fromAccountId || '').trim();
    const toRaw   = String(t.toAccountId   || '').trim();
    const match = fromRaw === accId || toRaw === accId;
    
    // Account filtering logic is working correctly
    
    if (!match) return false;
  }

  if (cat && rootCategoryId(t.categoryId) !== cat) return false;
  return true;
}

function drawTable(){
    const tbody=$('#txTable tbody');
    const selectedAcc=filterAccount.value;
    const selectedCat=filterCategory.value;
    // refresh filter dropdowns with current accounts/categories
    fillAccounts();
    filterAccount.value=selectedAcc;
    filterCategory.innerHTML=buildFilterCategoryOptions();
    filterCategory.value=selectedCat;
let arr=[...AppState.State.transactions].filter(txFilter);

// Account filtering is working correctly
    arr.sort((a,b)=>{
      if(sortKey==='amount'){
        const diff=toUSD(b)-toUSD(a);
        return sortDir==='desc'? diff : -diff;
      }
      if(sortKey==='description'){
        const diff=(a.description||'').localeCompare(b.description||'');
        return sortDir==='desc'? -diff : diff;
      }
      const diff=b.date.localeCompare(a.date);
      return sortDir==='desc'? diff : -diff;
    });
    tbody.innerHTML = arr.map(t=>{
      const parties=Utils.mapTransactionParties(t);
      const catName=t.categoryId? Utils.parentCategoryName(t.categoryId):'—';
      const usd=toUSD(t);
      return `<tr data-id="${t.id}">
        <td data-label="Date">${t.date}</td>
        <td data-label="Type">${t.transactionType}</td>
        <td data-label="Amount">${Number(t.amount).toFixed(2)}</td>
        <td data-label="Currency">${t.currency}</td>
        <td data-label="FX">${Number(t.fxRate||1).toFixed(4)}</td>
        <td data-label="USD">${usd.toFixed(2)}</td>
        <td data-label="Category">${catName}</td>
        <td data-label="From">${parties.from}</td>
        <td data-label="To">${parties.to}</td>
        <td data-label="Description" class="truncate">${t.description||''}</td>
        <td data-label="Actions" class="actions">
          <button class="btn" data-edit="${t.id}">Edit</button>
          <button class="btn" data-copy="${t.id}">Add Similar</button>
          <button class="btn danger" data-del="${t.id}">Delete</button>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="11" class="muted">No transactions yet</td></tr>';
    tbody.onclick = (e) => {
  const target = e.target;

  // Use closest() so clicks on inner spans/icons still resolve to the right button
  const btnDel  = target.closest?.('button[data-del]');
  const btnEdit = target.closest?.('button[data-edit]');
  const btnCopy = target.closest?.('button[data-copy]');

  if (btnDel) {
    return removeTxn(btnDel.dataset.del);
  }

  if (btnEdit) {
    const tx = AppState.State.transactions.find(x => x.id === btnEdit.dataset.edit);
    if (tx) {
      prefillForm(tx);
      btnCancel.classList.remove('hidden');
      btnSubmit.textContent = 'Save Changes';
    }
    return;
  }

  if (btnCopy) {
    const tx = AppState.State.transactions.find(x => x.id === btnCopy.dataset.copy);
    if (tx) {
      prefillForm(tx, true);
      btnSubmit.textContent = 'Add';
    }
    return;
  }
};
  }
  $all('#txTable th[data-sort]').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key=th.dataset.sort;
      if(sortKey===key){ sortDir = sortDir==='desc'?'asc':'desc'; }
      else { sortKey=key; sortDir='desc'; }
      drawTable();
    });
  });
  resetForm();
  drawTable();
}

async function renderOverview(root){
  root.innerHTML = $('#tpl-overview').innerHTML;
  const countrySel=$('#ovCountry');
  function apply(){
    const filterCountry=countrySel.value; const accs=AppState.State.accounts.filter(a=> !filterCountry || a.country===filterCountry);
    const banks=accs.filter(a=> Utils.accountType(a)!=='credit-card').reduce((s,a)=> s+Utils.currentBalanceUSD(a),0);
    const cards=accs.filter(a=> Utils.accountType(a)==='credit-card');
    const debt=cards.reduce((s,a)=> s+Utils.currentBalanceUSD(a),0); const limit=cards.reduce((s,a)=> s+Utils.creditLimitUSD(a),0); const util=limit>0? (debt/limit*100):0;
    $('#ovCash').textContent=Utils.formatMoneyUSD(banks); $('#ovDebt').textContent=Utils.formatMoneyUSD(debt); $('#ovLimit').textContent=Utils.formatMoneyUSD(limit); $('#ovUtil').textContent=`${util.toFixed(1)}%`;
    const today=new Date(); const until=new Date(); until.setMonth(until.getMonth()+1);
    const upcoming=cards.flatMap(a=> Utils.nextDueDates(a,2).map(d=>({a,d}))).filter(x=>{ const dt=new Date(x.d); return (dt>=today && dt<=until) && !Utils.isDuePaid(x.a,x.d); }).sort((x,y)=> x.d.localeCompare(y.d));
    $('#ovUpcoming').textContent=upcoming.length;
    const cal=$('#dueCalendar'); const dueList=$('#dueList');
    const months=buildDueEvents(2, cards);
    const eventsIndex={};
    cal.innerHTML=months.map(m=>{ const label=m.month.toLocaleString(undefined,{month:'long',year:'numeric'});
      const days=m.rows.map(row=>{ const has=row.events.length>0; if(has) eventsIndex[row.iso]=row.events; const spans=row.events.map(ev=>`<span class="payment">${ev.name}: ${Utils.formatMoneyUSD(ev.amount)}</span>`).join('');
        return `<div class="day ${has?'has':''}" data-date="${row.iso}"><strong>${row.day}</strong>${spans}</div>`; }).join('');
      return `<div class="month">${label}</div>${days}`; }).join('');
    dueList.innerHTML='<div class="muted">Select a highlighted day to view payments.</div>';
    cal.onclick=(e)=>{ const cell=e.target.closest('.day'); if(!cell) return; const iso=cell.dataset.date; const items=eventsIndex[iso]||[]; dueList.innerHTML = items.length? items.map(ev=>`<div>• <strong>${ev.name}</strong> — ${Utils.formatMoneyUSD(ev.amount)}</div>`).join('') : '<div class="muted">No payments on this day.</div>'; };
    const cardList=$('#cardList');
    cardList.innerHTML = cards.map(c=>{ const used=Utils.currentBalanceUSD(c); const lim=Utils.creditLimitUSD(c); const pct=lim>0? Math.min(100,Math.max(0,used/lim*100)):0;
      return `<div class="card" style="margin-bottom:.6rem;"><div style="display:flex;justify-content:space-between;align-items:center;gap:.75rem;"><div>
        <div><strong>${c.name}</strong> <span class="muted">(${c.country})</span></div>
        <div class="muted">Balance (USD): ${Utils.formatMoneyUSD(used)} • Limit (USD): ${Utils.formatMoneyUSD(lim)} • Util: ${pct.toFixed(1)}%</div>
        <div class="progress mt-sm"><span style="width:${pct}%"></span></div></div>
        <div><button class="btn" data-pay="${c.id}">Pay Now</button></div></div></div>`; }).join('') || '<div class="muted">No credit cards yet.</div>';
    cardList.onclick=(e)=>{ const id=e.target.dataset.pay; if(!id)return; Router.go('transactions'); setTimeout(()=>{ const card=AppState.State.accounts.find(a=>a.id===id); const tSel=$('#txnType'); if(!tSel)return; tSel.value='Credit Card Payment'; tSel.dispatchEvent(new Event('change')); const bank=AppState.State.accounts.find(a=>Utils.accountType(a)!=='credit-card'); if(bank) $('#txnFromAccount').value=bank.id; $('#txnToAccount').value=card.id; },50); };
  }
  countrySel.addEventListener('change', apply); apply();
}

async function renderNetWorth(root){
  root.innerHTML = $('#tpl-networth').innerHTML; await Utils.ensureTodayFX();
  const timeline=Utils.netWorthTimeline();
  const effectiveSeries = timeline.length? timeline : AppState.State.snapshots;
  const currentNet= timeline.length? timeline[timeline.length-1].netWorthUSD : UI.calcNetWorthUSD();
  $('#nwNow').textContent=Utils.formatMoneyUSD(currentNet);
  const insights=calcNetWorthInsights(timeline.length? timeline : [{ date: Utils.todayISO(), netWorthUSD: currentNet }]);
  $('#nwChange').textContent = Utils.formatMoneyUSD(insights.change);
  $('#nwAsset').textContent = insights.largestAsset? `${insights.largestAsset.account.name} (${Utils.formatMoneyUSD(insights.largestAsset.balance)})` : '—';
  $('#nwLiability').textContent = insights.largestLiability? `${insights.largestLiability.account.name} (${Utils.formatMoneyUSD(insights.largestLiability.balance)})` : '—';
  $('#nwRatio').textContent = insights.ratio!=null? Utils.formatPercent(insights.ratio): '—';
  Charts.renderNetWorth('chartNetWorth', effectiveSeries);
  $('#btnSnapshot').addEventListener('click', async ()=>{ const s=AppState.newSnapshot(); s.netWorthUSD=UI.calcNetWorthUSD(); await AppState.saveItem('snapshots', s, 'snapshots'); renderNetWorth(root); });
}

async function renderReports(root){
  root.innerHTML = $('#tpl-reports').innerHTML;
  const start=$('#reportStart'); const end=$('#reportEnd');
  const today=Utils.todayISO(); const first=new Date(); first.setDate(1);
  start.value=start.value||first.toISOString().slice(0,10);
  end.value=end.value||today;
  $('#btnGenReport').addEventListener('click', async ()=>{
    const startDate=start.value||first.toISOString().slice(0,10);
    const endDate=end.value||today;
    if(startDate>endDate){ alert('Start date must be before end date.'); return; }
    await PDF.generateReport({ startDate, endDate });
  });
}

async function renderSettings(root){
  root.innerHTML = $('#tpl-settings').innerHTML;
  $('#setFiscalStart').value = AppState.State.settings.fiscalStartDay || 1;
  $('#setManualFX').value = AppState.State.settings.manualUsdPerMXN || '';
  $('#setUseManualFX').value = String(!!AppState.State.settings.useManualFx);
  $('#setFxApiKey').value = AppState.State.settings.fxApiKey || '';
  $('#setDefaultTxnDate').value = AppState.State.settings.defaultTxnDateMode || 'today';
  $('#btnFetchFX').addEventListener('click', async ()=>{ const r=await Utils.ensureTodayFX(); alert('Fetched. Latest USD per MXN = '+r); });
  $('#btnSaveSettings').addEventListener('click', async ()=>{
    AppState.State.settings.fiscalStartDay = Number($('#setFiscalStart').value||1);
    AppState.State.settings.manualUsdPerMXN = $('#setManualFX').value? Number($('#setManualFX').value):null;
    AppState.State.settings.useManualFx = $('#setUseManualFX').value==='true';
    AppState.State.settings.fxApiKey = $('#setFxApiKey').value.trim();
    AppState.State.settings.defaultTxnDateMode = $('#setDefaultTxnDate').value;
    await AppState.saveItem('settings', AppState.State.settings, 'settings'); alert('Settings saved.');
  });
  $('#btnExportExcel').addEventListener('click', ()=> Excel.exportAll());
  $('#btnImportExcel').addEventListener('click', ()=> $('#fileImportExcel').click());
  $('#fileImportExcel').addEventListener('change', (e)=> Excel.importAll(e.target.files?.[0]));
  $('#btnWipeAll').addEventListener('click', async ()=>{ if (await Utils.confirmDialog('This will erase ALL local data. Proceed?')){ await PFMDB.dbClearAll(); location.reload(); } });
  $('#btnManageCategories').addEventListener('click', ()=> Router.go('categories'));
}

function calcNetWorthUSD(){ const banks=AppState.State.accounts.filter(a=>Utils.accountType(a)!=='credit-card').reduce((s,a)=> s+Utils.currentBalanceUSD(a),0); const debts=AppState.State.accounts.filter(a=>Utils.accountType(a)==='credit-card').reduce((s,a)=> s+Utils.currentBalanceUSD(a),0); return banks - debts; }
window.UI = { renderDashboard, renderAccounts, renderCategories, renderBudget, renderTransactions, renderOverview, renderNetWorth, renderReports, renderSettings, calcNetWorthUSD };
