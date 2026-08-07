/* ── app.js: ponto de entrada — carrega os dados do Supabase e faz a primeira renderização ── */
(async function(){
  await AppState.load();
  buildTable();
  initDashDates();
  refreshDash();
  buildWeeklySummary();
})();
