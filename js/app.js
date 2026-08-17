/* ── app.js: ponto de entrada — carrega os dados do Supabase e faz a primeira renderização.
   Só roda depois do login (ver AuthController.js initAuth()), pra não buscar/exibir
   nenhum dado antes de autenticar. ── */
async function bootApp(){
  await AppState.load();
  buildTable();
  initDashDates();
  refreshDash();
  buildWeeklySummary();
  if(AppState.offline) markSyncError(); else markSyncOk();
}
initAuth();
