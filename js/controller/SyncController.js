/* ── SyncController: estado visual de sincronização + botão "Sincronizar" no header ──
   Por padrão toda edição de dia (status/folga) já salva sozinha no banco (autosave).
   O botão "Sincronizar" funciona como um liga/desliga (igual o "Marcar folga"): clicar
   pausa o autosave — as edições de célula feitas nesse meio tempo ficam só na tela,
   guardadas em _pendingCells — e um novo clique retoma, enviando tudo que ficou pendente
   de uma vez. Cadastro de técnico e importação de horas continuam salvando na hora,
   pausar aqui só afasta o autosave de status/folga por célula. */
var SYNC_PAUSED = false;
var _pendingCells = {}; // "ti:di" → {t, di, patch}

function isSyncPaused(){ return SYNC_PAUSED; }

function queueCellPatch(t, ti, di, patch, statusChanged){
  var key = ti+':'+di;
  if(!_pendingCells[key]) _pendingCells[key] = {t:t, di:di, patch:{}, statusChanged:false};
  Object.assign(_pendingCells[key].patch, patch);
  if(statusChanged) _pendingCells[key].statusChanged = true;
  if('status' in patch) t.d[di] = patch.status;
  if('folga_override' in patch) t.fo[di] = patch.folga_override||0;
  if('obs' in patch) t.obs[di] = patch.obs||'';
}

function pendingCellCount(){ return Object.keys(_pendingCells).length; }

function markSyncOk(){
  if(SYNC_PAUSED) return;
  var btn=document.getElementById('syncBtn');
  if(btn){ btn.classList.remove('sync-err'); btn.classList.add('sync-ok'); }
  var dot=document.getElementById('unsavedDot');
  if(dot) dot.classList.remove('show');
}
function markSyncError(){
  var dot=document.getElementById('unsavedDot');
  if(dot) dot.classList.add('show');
  if(SYNC_PAUSED) return;
  var btn=document.getElementById('syncBtn');
  if(btn){ btn.classList.remove('sync-ok'); btn.classList.add('sync-err'); }
}

function toggleSync(){
  if(SYNC_PAUSED) resumeSync(); else pauseSync();
}

function pauseSync(){
  SYNC_PAUSED = true;
  var btn=document.getElementById('syncBtn');
  if(btn){
    btn.classList.remove('sync-ok','sync-err');
    btn.classList.add('sync-paused');
    btn.title='Sincronização pausada — as edições de dia ficam pendentes até clicar de novo';
  }
  var label=document.getElementById('syncBtnLabel');
  if(label) label.textContent='Pausado';
  toast('Sincronização pausada — as próximas edições ficam pendentes', '#f5a623');
}

async function resumeSync(){
  SYNC_PAUSED = false;
  var btn=document.getElementById('syncBtn');
  var label=document.getElementById('syncBtnLabel');
  if(label) label.textContent='Sincronizar';
  if(btn){
    btn.classList.remove('sync-paused');
    btn.title='Salvamento automático a cada alteração — clique para pausar/retomar a sincronização com o banco';
  }

  var pending = pendingCellCount();
  if(!pending){ markSyncOk(); toast('Sincronização retomada','#1fc98e'); return; }

  toast('Enviando '+pending+' alteração(ões) pendente(s)...', '#8a91a8');
  var keys=Object.keys(_pendingCells);
  var ok=0, fail=0, autoFolgaDue=[];
  for(var i=0;i<keys.length;i++){
    var entry=_pendingCells[keys[i]];
    var t=entry.t, di=entry.di, patch=entry.patch;
    try{
      var iso=toISO(DATES[di]);
      var row=await EscalaModel.saveDay(t.id, iso, t.rowId[di], patch);
      t.d[di]=row.status||'';
      t.fo[di]=row.folga_override||0;
      t.obs[di]=row.obs||'';
      t.rowId[di]=row.id;
      delete _pendingCells[keys[i]];
      ok++;
      if(entry.statusChanged) autoFolgaDue.push({t:t, di:di});
    }catch(e){
      console.error('resumeSync flush', t.n, di, e);
      fail++;
    }
  }
  buildTable();
  for(var j=0;j<autoFolgaDue.length;j++){
    await maybeApplyAutoFolga(autoFolgaDue[j].t, [autoFolgaDue[j].di]);
  }
  if(fail){
    markSyncError();
    toast(ok+' sincronizada(s), '+fail+' falharam — pausado de novo para tentar depois','#e85b5b');
    SYNC_PAUSED=true; // mantém o que falhou na fila em vez de perder silenciosamente
    if(btn){ btn.classList.add('sync-paused'); }
    if(label) label.textContent='Pausado';
  }else{
    markSyncOk();
    toast(ok+' alteração(ões) sincronizada(s)','#1fc98e');
  }
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
