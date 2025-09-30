// pdf.js — Export a quick insights PDF
const PDF = {
  async generateReport({ startDate, endDate }){
    const { jsPDF } = window.jspdf || {};
    if(!jsPDF){ alert('PDF library not loaded yet. Try again in a moment.'); return; }
    await Utils.ensureTodayFX();
    const doc = new jsPDF({ unit:'pt', format:'letter' });
    const tx = AppState.State.transactions.filter(t=> Utils.within(t.date, startDate, endDate));
    const usd = (t)=> t.currency==='USD'?Number(t.amount):Number(t.amount)*Number(t.fxRate||1);
    const income = tx.filter(t=>t.transactionType==='Income').reduce((s,t)=>s+usd(t),0);
    const expense = tx.filter(t=>t.transactionType==='Expense').reduce((s,t)=>s+usd(t),0);
    const net = income-expense;
    const byParent = {};
    tx.filter(t=>t.transactionType==='Expense').forEach(t=>{
      const p = Utils.parentCategoryName(t.categoryId);
      byParent[p] = (byParent[p]||0) + usd(t);
    });
    const top = Object.entries(byParent).sort((a,b)=> b[1]-a[1]).slice(0,5);

    doc.setFontSize(18); doc.text('Finance – Personal Budget Report', 40, 50);
    doc.setFontSize(12); doc.text(`Period: ${startDate} to ${endDate}`, 40, 70);
    doc.text(`Total Income: ${Utils.formatMoneyUSD(income)}`, 40, 95);
    doc.text(`Total Expenses: ${Utils.formatMoneyUSD(expense)}`, 40, 115);
    doc.text(`Net: ${Utils.formatMoneyUSD(net)}`, 40, 135);

    doc.text('Top Expense Categories:', 40, 165);
    let y=185;
    top.forEach(([name,val])=>{ doc.text(`• ${name}: ${Utils.formatMoneyUSD(val)}`, 50, y); y+=18; });

    const timeline = Utils.netWorthTimeline();
    doc.text('Net Worth snapshots:', 40, y+20);
    let y2=y+40;
    timeline.slice(-6).forEach(p=>{ doc.text(`• ${p.date}: ${Utils.formatMoneyUSD(p.netWorthUSD)}`, 50, y2); y2+=18; });

    doc.save(`finance-report-${startDate}-to-${endDate}.pdf`);
  }
};
window.PDF = PDF;
