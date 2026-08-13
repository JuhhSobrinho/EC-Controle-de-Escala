/* ── BlockController: "Previsão em bloco" — status em um intervalo de datas para um ou mais técnicos ── */
async function confirmBlock(){
  var tis=getSelectedBlockTecIds();
  var s=idxOf(fromISO(document.getElementById('blockStart').value));
  var e=idxOf(fromISO(document.getElementById('blockEnd').value));
  var custom=document.getElementById('blockCustom').value.trim();
  var v=custom||_blkSel;
  if(!tis.length){toast('Selecione ao menos um técnico','#e85b5b');return;}
  if(s===null||e===null||s>e||!v){toast('Preencha todos os campos','#e85b5b');return;}
  closeBlock();

  var asProject = custom && s<e;
  var ok=0;
  for(var i=0;i<tis.length;i++){
    var ti=tis[i];
    var success = asProject
      ? await applyBlockAsProject(ti, s, e, custom, tis.length>1)
      : await applyDragFill(ti, s, e, v, tis.length>1);
    if(success) ok++;
  }

  var total=tis.length;
  if(total>1){
    if(ok===total) toast('Previsão aplicada a '+total+' técnicos', '#1fc98e');
    else toast(ok+' de '+total+' técnicos atualizados — veja os erros acima', ok>0?'#f5a623':'#e85b5b');
  }
}

/* silent=true suprime o toast individual de sucesso (usado ao aplicar a vários técnicos de uma vez). */
async function applyBlockAsProject(ti, s, e, custom, silent){
  var t=TECS[ti];
  if(!t._edits) t._edits={};
  for(var i=s;i<=e;i++) t._edits[i]=true;

  if(AppState.offline){
    markSyncError();
    toast('Sem conexão com o banco — não é possível salvar', '#e85b5b');
    return false;
  }

  if(isSyncPaused()){
    queueCellPatch(t, ti, s, {status:'MOB.'}, true);
    for(var k=s+1;k<e;k++) queueCellPatch(t, ti, k, {status:custom}, true);
    queueCellPatch(t, ti, e, {status:'DES.'}, true);
    buildTable();
    if(!silent) toast('Bloco pendente — sincronização pausada ('+(e-s+1)+' dias)', '#f5a623');
    return true;
  }

  var days=[];
  days.push({iso: toISO(DATES[s]), rowId: t.rowId[s], patch:{status:'MOB.'}, di:s});
  for(var j=s+1;j<e;j++) days.push({iso: toISO(DATES[j]), rowId: t.rowId[j], patch:{status:custom}, di:j});
  days.push({iso: toISO(DATES[e]), rowId: t.rowId[e], patch:{status:'DES.'}, di:e});

  try{
    var rows=await EscalaModel.saveRange(t.id, days);
    rows.forEach(function(row, idx){
      var di=days[idx].di;
      t.d[di]=row.status||'';
      t.fo[di]=row.folga_override||0;
      t.obs[di]=row.obs||'';
      t.rowId[di]=row.id;
    });
    buildTable();
    markSyncOk();
    if(!silent) toast('Bloco aplicado: MOB. → '+custom+' → DES. ('+(e-s+1)+' dias)', '#1fc98e');
    await maybeApplyAutoFolga(t, [e]); // o DES. do fim do bloco também dispara a folga automática
    return true;
  }catch(err){
    console.error('applyBlockAsProject', t.n, err);
    buildTable();
    markSyncError();
    toast('Erro ao salvar bloco de '+t.n+': '+err.message, '#e85b5b');
    return false;
  }
}
