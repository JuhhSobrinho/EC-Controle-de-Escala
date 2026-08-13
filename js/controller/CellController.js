/* ── CellController: edição de um único dia (status + folga_override) ── */
async function confirmCell(){
  var val=document.getElementById('cellCustom').value.trim()||_cSel;
  var folga=document.getElementById('cellFolga').checked?1:0;
  var obs=document.getElementById('cellObs').value.trim();
  var ti=_cTi, di=_cDi;
  var t=TECS[ti];

  if(AppState.offline){
    markSyncError();
    toast('Sem conexão com o banco — não é possível salvar', '#e85b5b');
    closeCell();
    return;
  }

  var patch={};
  if((t.d[di]||'')!==val) patch.status=val;
  var statusChanged = 'status' in patch;
  var folgaTurnedOn = false;
  if(!!t.fo[di]!==!!folga){
    patch.folga_override=folga;
    folgaTurnedOn = !!folga; // true = ligando (0→1), false = desligando (1→0)
  }
  if((t.obs[di]||'')!==obs) patch.obs=obs;
  // dispara a folga automática quando o status vira DES. agora OU quando o folga_override
  // é LIGADO manualmente (calcula/estende os dias seguintes de F.EMB). Nunca dispara só por
  // ter DESLIGADO o folga_override — senão a regra reforça o valor de volta pra 1 na hora,
  // que era exatamente o bug de "não consigo desmarcar a folga".
  var shouldAutoFolga = statusChanged || folgaTurnedOn;

  if(!TECS[ti]._edits)TECS[ti]._edits={};
  TECS[ti]._edits[di]=true;
  closeCell();

  if(Object.keys(patch).length===0){ buildTable(); return; }

  if(isSyncPaused()){
    queueCellPatch(t, ti, di, patch, shouldAutoFolga);
    buildTable();
    toast(val?'Pendente: '+val:'Pendente: status removido','#f5a623');
    return;
  }

  try{
    var iso=toISO(DATES[di]);
    var row=await EscalaModel.saveDay(t.id, iso, t.rowId[di], patch);
    t.d[di]=row.status||'';
    t.fo[di]=row.folga_override||0;
    t.obs[di]=row.obs||'';
    t.rowId[di]=row.id;
    buildTable();
    markSyncOk();
    toast(val?'Status salvo: '+val:'Status removido','#a78bfa');
    if(shouldAutoFolga) await maybeApplyAutoFolga(t, [di]);
  }catch(e){
    console.error('confirmCell', e);
    buildTable();
    markSyncError();
    toast('Erro ao salvar: '+e.message,'#e85b5b');
  }
}
