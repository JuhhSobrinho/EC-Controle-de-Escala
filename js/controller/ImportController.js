/* ── ImportController: importar horas reais de um .xlsx (fica em memória, window._realHrs) ── */
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
  var matched=0, unmatched=0;
  xlsxNames.forEach(function(xn){
    var m=bestMatch(xn);
    if(m.score>=0.5){_importMap[xn]=m.ti;matched++;}
    else{_importMap[xn]=-1;unmatched++;}
  });

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

function applyImport(){
  if(!_importData)return;
  var applied=0, skipped=0;

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

  // apply to _realHrs store (separate from status data)
  if(!window._realHrs)window._realHrs={};
  Object.keys(hrsMap).forEach(function(ti){
    if(!window._realHrs[ti])window._realHrs[ti]={};
    Object.keys(hrsMap[ti]).forEach(function(dmy){
      window._realHrs[ti][dmy]=hrsMap[ti][dmy];
      applied++;
    });
  });

  closeImport();
  buildTable(); // re-render to show real hrs in leque
  toast('✓ '+applied+' horas importadas','#1fc98e');
}
