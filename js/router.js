// router.js — super tiny hash router that also marks active nav
const Router = (function(){
  const routes = {
    'dashboard': UI.renderDashboard,
    'accounts': UI.renderAccounts,
    'transactions': UI.renderTransactions,
    'budget': UI.renderBudget,
    'categories': UI.renderCategories,
    'overview': UI.renderOverview,
    'networth': UI.renderNetWorth,
    'reports': UI.renderReports,
    'settings': UI.renderSettings,
  };
  function go(route){
    location.hash = '#/'+route;
  }
  async function render(){
    const el = document.getElementById('app');
    const hash = (location.hash||'#/dashboard').replace(/^#\//,'');
    const renderer = routes[hash] || routes['dashboard'];
    // active tab highlight
    document.querySelectorAll('[data-route]').forEach(a=>{
      a.classList.toggle('active', a.dataset.route===hash);
      document.querySelectorAll('.mobile-tabbar a').forEach(b=> b.classList.toggle('active', b.dataset.route===hash));
    });
    await renderer(el);
  }
  window.addEventListener('hashchange', render);
  return { go, render };
})();
window.Router = Router;
