/* ── TecnicoController: cadastro de técnicos (novo/editar/remover) ── */
async function confirmTec(){
  var name=document.getElementById('tecName').value.trim().toUpperCase();
  var fn=document.getElementById('tecFn').value.trim();
  var sp=document.getElementById('tecSispat').value.trim();
  var df=parseInt(document.getElementById('tecDf').value)||0;
  var dt=parseInt(document.getElementById('tecDt').value)||0;
  var lrs=document.getElementById('tecLrs').value;
  var lcr=document.getElementById('tecLcr').value;
  var irata=document.getElementById('tecIrata').value;
  if(!name){toast('Nome obrigatório','#e85b5b');return;}

  if(AppState.offline){
    markSyncError();
    toast('Sem conexão com o banco — não é possível salvar', '#e85b5b');
    return;
  }

  var payload={nome:name,funcao:fn,sispat:sp,dias_folga:df,dias_trab:dt,lrs:lrs,lcr:lcr,irata:irata};

  try{
    if(_tecIdx===-1){
      var row=await TecnicoModel.create(payload);
      var t=AppState.tecnicoRowFrom(row);
      TECS.push(t);
      toast(name+' adicionado','#1fc98e');
    }else{
      var t2=TECS[_tecIdx];
      await TecnicoModel.update(t2.id, payload);
      Object.assign(t2,{n:name,f:fn,s:sp,df:df,dt:dt,lrs:lrs,lcr:lcr,irata:irata});
      toast('Técnico atualizado','#1fc98e');
    }
    closeTec();
    buildTable();
    markSyncOk();
  }catch(e){
    console.error('confirmTec', e);
    markSyncError();
    toast('Erro ao salvar técnico: '+e.message,'#e85b5b');
  }
}

async function deleteTec(){
  if(!confirm('Remover '+TECS[_tecIdx].n+'?'))return;
  if(AppState.offline){
    markSyncError();
    toast('Sem conexão com o banco — não é possível remover', '#e85b5b');
    return;
  }
  var t=TECS[_tecIdx];
  try{
    await TecnicoModel.remove(t.id);
    var nm=t.n;
    TECS.splice(_tecIdx,1);
    closeTec();
    buildTable();
    markSyncOk();
    toast(nm+' removido','#f5a623');
  }catch(e){
    console.error('deleteTec', e);
    markSyncError();
    toast('Erro ao remover técnico: '+e.message,'#e85b5b');
  }
}
