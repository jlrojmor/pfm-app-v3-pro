// charts.js — Chart.js helpers
const Charts = {
  _instances: new Map(),
  _get(id){
    const ctx = document.getElementById(id);
    if(!ctx) return null;
    if(this._instances.has(id)){ this._instances.get(id).destroy(); this._instances.delete(id); }
    const inst = { ctx, id, chart: null };
    this._instances.set(id, inst);
    return inst;
  },
  renderCashFlow(canvasId, tx, s, e){
    const inst=this._get(canvasId); if(!inst) return;
    const usd = (t)=> t.currency==='USD'? Number(t.amount) : Number(t.amount)*Number(t.fxRate||1);
    const byMonth = {};
    tx.forEach(t=>{
      if(!Utils.within(t.date,s,e)) return;
      const key = t.date.slice(0,7);
      byMonth[key] = byMonth[key] || { income:0, expense:0 };
      if (t.transactionType==='Income') byMonth[key].income += usd(t);
      if (t.transactionType==='Expense') byMonth[key].expense += usd(t);
    });
    const labels = Object.keys(byMonth).sort();
    const income = labels.map(k=> byMonth[k].income);
    const expense = labels.map(k=> byMonth[k].expense);
    inst.chart = new Chart(inst.ctx, {
      type: 'bar',
      data: { labels, datasets: [
        { label:'Income', data: income },
        { label:'Expenses', data: expense }
      ]},
      options: { responsive:true, plugins:{ legend:{ position:'bottom' }}, scales:{ x:{ stacked:true }, y:{ stacked:false, beginAtZero:true } } }
    });
  },
  renderPieByCategory(canvasId, tx, categories, title){
    const inst=this._get(canvasId); if(!inst) return;
    const byParent={};
    tx.forEach(t=>{
      const parent = Utils.parentCategoryName(t.categoryId);
      byParent[parent] = (byParent[parent]||0) + (t.currency==='USD'?Number(t.amount):Number(t.amount)*Number(t.fxRate||1));
    });
    const labels = Object.keys(byParent);
    const values = labels.map(k=> byParent[k]);
    inst.chart = new Chart(inst.ctx, {
      type: 'pie',
      data: { labels, datasets: [{ label: title, data: values }] },
      options: { plugins:{ legend:{ position:'bottom' }, title:{ display:true, text:title } } }
    });
  },
  renderNetWorth(canvasId, timeline){
    const inst=this._get(canvasId); if(!inst) return;
    const labels = timeline.map(p=>p.date);
    const data = timeline.map(p=>p.netWorthUSD);
    inst.chart = new Chart(inst.ctx, {
      type: 'line',
      data: { labels, datasets: [{ label:'Net Worth (USD)', data }] },
      options: { responsive:true, plugins:{ legend:{ display:false }}, scales:{ y:{ beginAtZero:false } } }
    });
  }
};
window.Charts = Charts;
