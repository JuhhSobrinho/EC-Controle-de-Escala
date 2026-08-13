/* ── FolgaToggleController: modo dedicado para marcar/desmarcar folga_override em massa,
   sem alterar o status do dia. Ativado pelo botão "Marcar folga" na barra de ferramentas. ── */
var folgaMode = false;
var _ff = null; // {ti, diStart, diEnd, targetValue} durante o arrasto em modo folga

function toggleFolgaMode(){
  folgaMode = !folgaMode;
  document.getElementById('folgaToggleBtn').classList.toggle('on', folgaMode);
  toast(folgaMode ? 'Modo folga ativado — clique ou arraste dias para marcar/desmarcar' : 'Modo folga desativado', folgaMode?'#4a9eff':'#8a91a8');
}

function ffStart(ti, di){
  var current = !!TECS[ti].fo[di];
  _ff = {ti: ti, diStart: di, diEnd: di, targetValue: current ? 0 : 1};
  ffHighlight();
}

function ffOver(ti, di){
  if(!_ff || _ff.ti !== ti) return;
  _ff.diEnd = di;
  ffHighlight();
}

function ffEnd(ti, di){
  if(!_ff) return;
  var from = Math.min(_ff.diStart, _ff.diEnd);
  var to   = Math.max(_ff.diStart, _ff.diEnd);
  var targetValue = _ff.targetValue;
  var t = _ff.ti;
  ffClear();
  applyFolgaRange(t, from, to, targetValue);
}

function ffHighlight(){
  document.querySelectorAll('.folga-preview').forEach(function(el){el.classList.remove('folga-preview');});
  if(!_ff) return;
  var from = Math.min(_ff.diStart, _ff.diEnd);
  var to   = Math.max(_ff.diStart, _ff.diEnd);
  var row  = document.querySelector('.data-row[data-ti="'+_ff.ti+'"]');
  if(!row) return;
  row.querySelectorAll('.day-cell').forEach(function(td){
    var di = parseInt(td.getAttribute('data-di'));
    if(di >= from && di <= to) td.classList.add('folga-preview');
  });
}

function ffClear(){
  _ff = null;
  document.querySelectorAll('.folga-preview').forEach(function(el){el.classList.remove('folga-preview');});
}

async function applyFolgaRange(ti, from, to, value){
  var t = TECS[ti];
  if(!t._edits) t._edits={};
  for(var i=from;i<=to;i++) t._edits[i]=true;
  var count = to - from + 1;

  if(AppState.offline){
    markSyncError();
    toast('Sem conexão com o banco — não é possível salvar', '#e85b5b');
    return;
  }

  var msg = value ? 'Marcado como folga: '+count+' dia'+(count!==1?'s':'') : 'Folga removida: '+count+' dia'+(count!==1?'s':'');
  var col = value ? '#4a9eff' : '#8a91a8';

  if(isSyncPaused()){
    for(var k=from;k<=to;k++) queueCellPatch(t, ti, k, {folga_override: value}, false);
    buildTable();
    toast(msg+' (pendente — sincronização pausada)', '#f5a623');
    return;
  }

  var days=[];
  for(var j=from;j<=to;j++){
    days.push({iso: toISO(DATES[j]), rowId: t.rowId[j], patch: {folga_override: value}, di: j});
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
    toast(msg, col);
  }catch(e){
    console.error('applyFolgaRange', e);
    buildTable();
    markSyncError();
    toast('Erro ao salvar folga: '+e.message, '#e85b5b');
  }
}
