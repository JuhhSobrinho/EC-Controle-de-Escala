/* ── ImportController: importar horas reais de um .xlsx e salvar em escala.hr_reais ── */
var _importData = null; // parsed rows from xlsx
var _importMap  = {};   // xlsxName → ti (tec index), set by user via dropdowns

function normName(s){
  return (s||'').toUpperCase()
    .replace(/[ÁÀÃÂ]/g,'A').replace(/[ÉÊ]/g,'E').replace(/[ÍÎ]/g,'I')
    .replace(/[ÓÔÕ]/g,'O').replace(/[ÚÜ]/g,'U').replace(/Ç/g,'C')
    .replace(/\b(DE|DA|DO|DOS|DAS|E)\b/g,'').replace(/\s+/g,' ').trim();
}
function wordOverlap(a,b){
  var wa=normName(a).split(' ').filter(Boolean);
  var wb=normName(b).split(' ').filter(Boolean);
  if(!wa.length||!wb.length)return 0;
  var inter=wa.filter(function(w){return wb.indexOf(w)>=0;});
  return inter.length/Math.max(wa.length,wb.length);
}
function bestMatch(xlsxName){
  var best=-1, bestTi=-1;
  TECS.forEach(function(t,ti){
    var sc=wordOverlap(xlsxName,t.n);
    if(sc>best){best=sc;bestTi=ti;}
  });
  return {ti:bestTi, score:best};
}

function loadImportFile(input){
  var file=input.files[0];
  if(!file)return;
  input.value=''; // reset so same file can be re-imported
  document.getElementById('importOverlay').classList.add('open');
  document.getElementById('impSub').textContent='Lendo arquivo...';
  document.getElementById('impBody').innerHTML='<div style="text-align:center;padding:2rem;color:var(--text3)">Processando...</div>';
  document.getElementById('impApplyBtn').disabled=true;

  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var wb=XLSX.read(e.target.result,{type:'array'});
      var ws=wb.Sheets[wb.SheetNames[0]];
      var rows=XLSX.utils.sheet_to_json(ws,{defval:''});
      _importData=rows;
      buildImportUI(rows);
    }catch(err){
      document.getElementById('impBody').innerHTML='<div style="color:var(--over);padding:1rem">Erro ao ler arquivo: '+err.message+'</div>';
    }
  };
  reader.readAsArrayBuffer(file);
}

function buildImportUI(rows){
  // group by name
  var nameSet={};
  rows.forEach(function(r){
    var n=(r['Nome']||'').trim();
    if(n)nameSet[n]=true;
  });
  var xlsxNames=Object.keys(nameSet).sort();

  // auto-match
  _importMap={};
  var scores={};
  xlsxNames.forEach(function(xn){
    var m=bestMatch(xn);
    scores[xn]=m.score;
    _importMap[xn] = m.score>=0.5 ? m.ti : -1;
  });
  // evita que duas pessoas DIFERENTES da planilha (ex: sobrenomes em comum tipo "Silva"/"Souza")
  // caiam auto-mapeadas no mesmo técnico — nesse caso as horas de uma sobrescreveriam
  // silenciosamente as horas da outra nos dias em que ambas trabalharam, e o resultado parece
  // "hora errada em alguns dias". Mantém só a correspondência de maior confiança por técnico;
  // as demais caem em "não mapear" pro usuário resolver manualmente.
  var bestForTi={};
  xlsxNames.forEach(function(xn){
    var ti=_importMap[xn];
    if(ti<0) return;
    if(!bestForTi[ti] || scores[xn]>bestForTi[ti].score) bestForTi[ti]={xn:xn, score:scores[xn]};
  });
  xlsxNames.forEach(function(xn){
    var ti=_importMap[xn];
    if(ti<0) return;
    if(bestForTi[ti].xn!==xn) _importMap[xn]=-1;
  });
  var matched=0, unmatched=0;
  xlsxNames.forEach(function(xn){ if(_importMap[xn]>=0) matched++; else unmatched++; });

  // count data points
  var totalRows=rows.filter(function(r){
    var ht=r['Horas Trabalhadas'];
    return ht && String(ht).trim()!=='';
  }).length;

  // build UI
  var tecOptions='<option value="-1">— não mapear —</option>'+
    TECS.map(function(t,ti){return '<option value="'+ti+'">'+t.n+'</option>';}).join('');

  var statsH='<div class="imp-stats">'
    +'<span><span class="imp-badge-ok"></span>'+matched+' mapeados automaticamente</span>'
    +(unmatched?'<span><span class="imp-badge-warn"></span>'+unmatched+' sem correspondência</span>':'')
    +'<span style="margin-left:auto;color:var(--accent)">'+totalRows+' registros de horas</span>'
    +'</div>';

  var rowsH=xlsxNames.map(function(xn){
    var ti=_importMap[xn];
    var score=bestMatch(xn).score;
    var badge=ti>=0?(score>=0.8?'<span class="imp-badge-ok"></span>':'<span class="imp-badge-warn"></span>'):'<span class="imp-badge-err"></span>';
    var selClass=ti<0?'imp-select no-match':'imp-select';
    var opts=tecOptions.replace('value="'+ti+'"','value="'+ti+'" selected');
    return '<div class="imp-match-row">'
      +'<div class="imp-name">'+badge+xn+'</div>'
      +'<div class="imp-arrow">→</div>'
      +'<select class="'+selClass+'" data-xname="'+xn.replace(/"/g,'&quot;')+'" onchange="updateImportMap(this)">'
      +opts+'</select></div>';
  }).join('');

  document.getElementById('impSub').textContent=xlsxNames.length+' técnicos no arquivo · '+totalRows+' registros';
  document.getElementById('impBody').innerHTML=statsH+'<div style="margin-top:4px">'+rowsH+'</div>';
  document.getElementById('impApplyBtn').disabled=false;
}

function updateImportMap(sel){
  var xn=sel.getAttribute('data-xname');
  _importMap[xn]=parseInt(sel.value);
  sel.className=parseInt(sel.value)<0?'imp-select no-match':'imp-select';
}

function closeImport(){
  document.getElementById('importOverlay').classList.remove('open');
}

async function applyImport(){
  if(!_importData)return;

  if(AppState.offline){
    markSyncError();
    toast('Sem conexão com o banco — não é possível salvar', '#e85b5b');
    return;
  }

  // build lookup: ti → { 'dd/mm/yyyy': 'HH:MM' }
  var hrsMap={};
  _importData.forEach(function(r){
    var xn=(r['Nome']||'').trim();
    var ti=_importMap[xn];
    if(ti===undefined||ti<0)return;
    var dia=r['Dia']||'';
    // normalise date: xlsx may give Date object or string
    var dmy='';
    if(dia instanceof Date){
      dmy=String(dia.getDate()).padStart(2,'0')+'/'+String(dia.getMonth()+1).padStart(2,'0')+'/'+dia.getFullYear();
    } else {
      // string dd/mm/yyyy
      dmy=String(dia).trim();
    }
    var ht=r['Horas Trabalhadas'];
    if(!ht||String(ht).trim()==='')return;
    var htStr=String(ht).trim();
    // Excel may store time as decimal fraction of day
    if(!isNaN(Number(htStr))){
      var mins=Math.round(Number(htStr)*24*60);
      htStr=String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');
    }
    if(!hrsMap[ti])hrsMap[ti]={};
    hrsMap[ti][dmy]=htStr;
  });

  var impApplyBtn=document.getElementById('impApplyBtn');
  if(impApplyBtn) impApplyBtn.disabled=true;
  toast('Salvando horas no banco...', '#8a91a8');

  var applied=0, skipped=0, errors=0;

  await Promise.all(Object.keys(hrsMap).map(async function(tiStr){
    var ti=parseInt(tiStr);
    var t=TECS[ti];
    if(!t) return;
    var days=[];
    Object.keys(hrsMap[ti]).forEach(function(dmy){
      var di=idxOf(dmy);
      if(di===null){ skipped++; return; }
      days.push({iso: toISO(DATES[di]), rowId: t.rowId[di], patch: {hr_reais: hrsMap[ti][dmy]}, di: di});
    });
    if(!days.length) return;
    try{
      var rows=await EscalaModel.saveRange(t.id, days);
      rows.forEach(function(row, idx){
        var di=days[idx].di;
        t.d[di]=row.status||'';
        t.fo[di]=row.folga_override||0;
        t.hr[di]=row.hr_reais?row.hr_reais.slice(0,5):null;
        t.obs[di]=row.obs||'';
        t.rowId[di]=row.id;
        applied++;
      });
    }catch(e){
      console.error('applyImport', t.n, e);
      errors+=days.length;
    }
  }));

  if(impApplyBtn) impApplyBtn.disabled=false;
  closeImport();
  buildTable(); // re-render to show real hrs in leque
  buildWeeklySummary(); // recalcula o Resumo de horas usando as horas reais recém-importadas
  if(errors) markSyncError(); else markSyncOk();
  var msg='✓ '+applied+' horas salvas no banco'+(skipped?' · '+skipped+' fora do calendário':'')+(errors?' · '+errors+' com erro':'');
  toast(msg, errors?'#e85b5b':'#1fc98e');
}
