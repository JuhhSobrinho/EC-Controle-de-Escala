/* ── CellController: edição de um único dia (status + folga_override) ── */
async function confirmCell(){
  var val=document.getElementById('cellCustom').value.trim()||_cSel;
  var folga=document.getElementById('cellFolga').checked?1:0;
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
  if(!!t.fo[di]!==!!folga) patch.folga_override=folga;

  if(!TECS[ti]._edits)TECS[ti]._edits={};
  TECS[ti]._edits[di]=true;
  closeCell();

  if(Object.keys(patch).length===0){ buildTable(); return; }

  try{
    var iso=toISO(DATES[di]);
    var row=await EscalaModel.saveDay(t.id, iso, t.rowId[di], patch);
    t.d[di]=row.status||'';
    t.fo[di]=row.folga_override||0;
    t.rowId[di]=row.id;
    buildTable();
    markSyncOk();
    toast(val?'Status salvo: '+val:'Status removido','#a78bfa');
    await maybeApplyAutoFolga(t, [di]);
  }catch(e){
    console.error('confirmCell', e);
    buildTable();
    markSyncError();
    toast('Erro ao salvar: '+e.message,'#e85b5b');
  }
}
