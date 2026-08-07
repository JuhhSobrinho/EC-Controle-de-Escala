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

/* Aplica o mesmo status a um intervalo [from,to] de um técnico e persiste no Supabase. */
async function applyDragFill(ti, from, to, val){
  var t=TECS[ti];
  if(!t._edits) t._edits={};
  for(var i=from;i<=to;i++) t._edits[i]=true;
  var count = to - from + 1;

  if(AppState.offline){
    toast('Sem conexão com o banco — não é possível salvar', '#e85b5b');
    return;
  }

  var days=[];
  for(var j=from;j<=to;j++){
    days.push({iso: toISO(DATES[j]), rowId: t.rowId[j], patch: {status: val}, di: j});
  }

  var msg = val ? 'Preenchidos '+count+' dias com '+val : 'Limpos '+count+' dias';
  var col = val ? '#1fc98e' : '#e85b5b';

  try{
    var rows = await EscalaModel.saveRange(t.id, days);
    rows.forEach(function(row, idx){
      var di = days[idx].di;
      t.d[di] = row.status||'';
      t.fo[di] = row.folga_override||0;
      t.rowId[di] = row.id;
    });
    buildTable();
    toast(msg, col);
  }catch(e){
    console.error('applyDragFill', e);
    buildTable();
    toast('Erro ao salvar intervalo: '+e.message, '#e85b5b');
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
