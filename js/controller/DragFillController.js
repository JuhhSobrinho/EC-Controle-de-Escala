/* ── DragFillController: arrastar para preencher vários dias de uma vez ──
   Aqui é onde o bug relatado (seleção múltipla/arrasto não salva) é corrigido:
   toda aplicação de intervalo agora grava no Supabase (EscalaModel.saveRange),
   em vez de só marcar "dirty" em memória. */
var _df = null; // {ti, diStart, diEnd, val} durante o arrasto

function dfStart(e, ti, di){
  if(window.folgaMode){ ffStart(ti, di); return; }
  // right-click or shift-click → ignore, let normal click through
  if(e.button !== 0) return;
  var srcVal = TECS[ti].d[di] || '';
  e.preventDefault();
  _df = {ti: ti, diStart: di, diEnd: di, val: srcVal};
  dfHighlight();
}

function dfOver(e, ti, di){
  if(window.folgaMode){ ffOver(ti, di); return; }
  if(!_df || _df.ti !== ti) return;
  _df.diEnd = di;
  dfHighlight();
}

function dfEnd(e, ti, di){
  if(window.folgaMode){ ffEnd(ti, di); return; }
  if(!_df){ return; }
  // if start === end: it was just a click, open modal
  if(_df.diStart === _df.diEnd){
    dfClear();
    openCellModal(ti, di); // clique simples: sempre abre modal
    return;
  }
  var from = Math.min(_df.diStart, _df.diEnd);
  var to   = Math.max(_df.diStart, _df.diEnd);
  var val  = _df.val;
  dfClear();
  applyDragFill(_df ? _df.ti : ti, from, to, val);
}

function dfHighlight(){
  // clear all
  document.querySelectorAll('.drag-origin,.drag-preview').forEach(function(el){
    el.classList.remove('drag-origin','drag-preview');
  });
  if(!_df) return;
  var from = Math.min(_df.diStart, _df.diEnd);
  var to   = Math.max(_df.diStart, _df.diEnd);
  var row  = document.querySelector('.data-row[data-ti="'+_df.ti+'"]');
  if(!row) return;
  var isClear = (_df.val === '');
  row.querySelectorAll('.day-cell').forEach(function(td){
    var di = parseInt(td.getAttribute('data-di'));
    if(di === _df.diStart) td.classList.add('drag-origin');
    else if(di >= from && di <= to) td.classList.add(isClear ? 'drag-clear' : 'drag-preview');
  });
}

function dfClear(){
  _df = null;
  document.querySelectorAll('.drag-origin,.drag-preview,.drag-clear').forEach(function(el){
    el.classList.remove('drag-origin','drag-preview','drag-clear');
  });
}

/* Aplica o mesmo status a um intervalo [from,to] de um técnico e persiste no Supabase.
   silent=true suprime o toast de sucesso (usado quando aplicado a vários técnicos de uma vez,
   pra não disparar um toast atrás do outro) — erro sempre é mostrado. Retorna true/false. */
async function applyDragFill(ti, from, to, val, silent){
  var t=TECS[ti];
  if(!t._edits) t._edits={};
  for(var i=from;i<=to;i++) t._edits[i]=true;
  var count = to - from + 1;

  if(AppState.offline){
    markSyncError();
    toast('Sem conexão com o banco — não é possível salvar', '#e85b5b');
    return false;
  }

  var msg = val ? 'Preenchidos '+count+' dias com '+val : 'Limpos '+count+' dias';
  var col = val ? '#1fc98e' : '#e85b5b';

  if(isSyncPaused()){
    for(var k=from;k<=to;k++) queueCellPatch(t, ti, k, {status: val}, true);
    buildTable();
    if(!silent) toast(msg+' (pendente — sincronização pausada)', '#f5a623');
    return true;
  }

  var days=[];
  for(var j=from;j<=to;j++){
    days.push({iso: toISO(DATES[j]), rowId: t.rowId[j], patch: {status: val}, di: j});
  }

  try{
    var rows = await EscalaModel.saveRange(t.id, days);
    rows.forEach(function(row, idx){
      var di = days[idx].di;
      t.d[di] = row.status||'';
      t.fo[di] = row.folga_override||0;
      t.obs[di] = row.obs||'';
      t.rowId[di] = row.id;
    });
    buildTable();
    markSyncOk();
    if(!silent) toast(msg, col);
    await maybeApplyAutoFolga(t, days.map(function(d){return d.di;}));
    return true;
  }catch(e){
    console.error('applyDragFill', e);
    markSyncError();
    buildTable();
    toast('Erro ao salvar intervalo de '+t.n+': '+e.message, '#e85b5b');
    return false;
  }
}

/* ── Folga automática após DES. ──
   Regra: N dias consecutivos embarcado/projeto antes do DES. geram N dias de folga NO TOTAL,
   contando o próprio DES. como 1 desses dias — então marca folga_override no DES. e cria
   F.EMB (folga_override=1) nos N-1 dias seguintes. Nunca sobrescreve um dia que já tem status;
   para a sequência assim que encontrar um. Só passa a valer para DES. salvos daqui pra frente. */
async function maybeApplyAutoFolga(t, savedIndices){
  if(AppState.offline) return;
  for(var i=0;i<savedIndices.length;i++){
    var di=savedIndices[i];
    var u=(t.d[di]||'').trim().toUpperCase();
    if(u==='DES'||u==='DES.') await applyAutoFolgaForDes(t, di);
  }
}

async function applyAutoFolgaForDes(t, desDi){
  var n=0, k=desDi-1;
  while(k>=0 && getCategory((t.d[k]||'').trim().toUpperCase())==='proj'){ n++; k--; }
  if(n===0) return; // DES. sem bloco embarcado antes — não é o caso desta regra

  var days=[];
  if(!t.fo[desDi]) days.push({iso: toISO(DATES[desDi]), rowId: t.rowId[desDi], patch:{folga_override:1}, di:desDi});

  for(var i=1;i<=n-1;i++){
    var di2=desDi+i;
    if(di2>=DATES.length || t.d[di2]) break; // fim do calendário ou dia já ocupado: para a sequência
    days.push({iso: toISO(DATES[di2]), rowId: t.rowId[di2], patch:{status:'F.EMB', folga_override:1}, di:di2});
  }
  if(!days.length) return;

  try{
    var rows=await EscalaModel.saveRange(t.id, days);
    rows.forEach(function(row, idx){
      var di3=days[idx].di;
      t.d[di3]=row.status||'';
      t.fo[di3]=row.folga_override||0;
      t.rowId[di3]=row.id;
    });
    buildTable();
    toast('Folga automática aplicada após DES. ('+days.length+' dia'+(days.length!==1?'s':'')+')', '#1fc98e');
  }catch(e){
    console.error('applyAutoFolgaForDes', t.n, e);
    toast('Erro ao aplicar folga automática: '+e.message, '#e85b5b');
  }
}

// cancel drag if mouse released outside table
document.addEventListener('mouseup', function(e){
  if(window.folgaMode){
    if(_ff && e.button === 0){ ffEnd(_ff.ti, _ff.diEnd); }
    return;
  }
  if(_df && e.button === 0){
    if(_df.diStart !== _df.diEnd){
      var from = Math.min(_df.diStart, _df.diEnd);
      var to   = Math.max(_df.diStart, _df.diEnd);
      var val  = _df.val;
      var ti   = _df.ti;
      dfClear();
      applyDragFill(ti, from, to, val);
    } else {
      dfClear();
    }
  }
});
document.addEventListener('mouseleave', function(){ dfClear(); if(window.folgaMode) ffClear(); });
