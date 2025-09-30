// app.js — boot
(async function(){
  // Check CDNs after 2s
  setTimeout(()=>{
    if (!window.jspdf) Utils.showCdnWarning('jspdf','PDF library failed to load (jsPDF). The Report export may not work offline.');
    if (!window.Chart) Utils.showCdnWarning('chart','Chart library failed to load (Chart.js). Charts may not render offline.');
    if (!window.XLSX) Utils.showCdnWarning('xlsx','Excel library failed to load (xlsx). Import/Export may not work offline.');
  }, 2000);
  await AppState.loadAll();
  if (!location.hash){ location.hash = '#/dashboard'; }
  Router.render();
})();
