/* ── SyncController: estado visual de sincronização + botão "Sincronizar" no header ──
   Toda edição já salva sozinha no banco (autosave); o botão só força uma releitura manual.
   markSyncOk()/markSyncError() são chamados pelos outros controllers depois de cada
   salvamento, pra o botão refletir "tudo sincronizado" (verde) ou "deu erro" (vermelho). */
function markSyncOk(){
  var btn=document.getElementById('syncBtn');
  if(btn){ btn.classList.remove('sync-err'); btn.classList.add('sync-ok'); }
  var dot=document.getElementById('unsavedDot');
  if(dot) dot.classList.remove('show');
}
function markSyncError(){
  var btn=document.getElementById('syncBtn');
  if(btn){ btn.classList.remove('sync-ok'); btn.classList.add('sync-err'); }
  var dot=document.getElementById('unsavedDot');
  if(dot) dot.classList.add('show');
}

async function syncNow(){
  try{
    await AppState.load();
    buildTable();
    refreshDash();
    buildWeeklySummary();
    if(AppState.offline){
      markSyncError();
    } else {
      markSyncOk();
      toast('Sincronizado com o banco','#1fc98e');
    }
  }catch(e){
    console.error('syncNow', e);
    markSyncError();
    toast('Erro ao sincronizar: '+e.message,'#e85b5b');
  }
}
