/* ── SyncController: recarrega os dados do Supabase (botão "Sincronizar" no header) ── */
async function syncNow(){
  document.getElementById('unsavedDot').classList.remove('show');
  try{
    await AppState.load();
    buildTable();
    refreshDash();
    buildWeeklySummary();
    if(!AppState.offline) toast('Sincronizado com o banco','#1fc98e');
  }catch(e){
    console.error('syncNow', e);
    document.getElementById('unsavedDot').classList.add('show');
    toast('Erro ao sincronizar: '+e.message,'#e85b5b');
  }
}
