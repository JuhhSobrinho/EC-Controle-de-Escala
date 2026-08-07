/* ── BlockController: "Previsão em bloco" — status em um intervalo de datas para um técnico ── */
async function confirmBlock(){
  var ti=parseInt(document.getElementById('blockTec').value);
  var s=idxOf(fromISO(document.getElementById('blockStart').value));
  var e=idxOf(fromISO(document.getElementById('blockEnd').value));
  var custom=document.getElementById('blockCustom').value.trim();
  var v=custom||_blkSel;
  if(s===null||e===null||s>e||!v){toast('Preencha todos os campos','#e85b5b');return;}
  closeBlock();

  if(custom && s<e){
    // Status digitado à mão = código de projeto/plataforma específico → é certeza que é
    // embarque: 1º dia MOB., último dia DES., os dias do meio recebem o projeto digitado.
    await applyBlockAsProject(ti, s, e, custom);
  } else {
    await applyDragFill(ti, s, e, v);
  }
}

async function applyBlockAsProject(ti, s, e, custom){
  var t=TECS[ti];
  if(!t._edits) t._edits={};
  for(var i=s;i<=e;i++) t._edits[i]=true;

  if(AppState.offline){
    toast('Sem conexão com o banco — não é possível salvar', '#e85b5b');
    return;
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
      t.rowId[di]=row.id;
    });
    buildTable();
    toast('Bloco aplicado: MOB. → '+custom+' → DES. ('+(e-s+1)+' dias)', '#1fc98e');
    await maybeApplyAutoFolga(t, [e]); // o DES. do fim do bloco também dispara a folga automática
  }catch(err){
    console.error('applyBlockAsProject', err);
    buildTable();
    toast('Erro ao salvar bloco: '+err.message, '#e85b5b');
  }
}
