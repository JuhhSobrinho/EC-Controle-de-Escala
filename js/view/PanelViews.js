/* ── PanelViews: painéis somente-leitura (resumo semanal, dashboard, utilização, profissionais, horas por projeto) ── */

// Chart.js usa '#666' (cinza escuro) como cor de texto padrão, ilegível no tema escuro
// para qualquer elemento (legendas, títulos de escala, etc.) que não define cor própria.
Chart.defaults.color = '#8a91a8';

/* ── WEEKLY SUMMARY ── */
function getCategory(u){
  if(!u) return null;
  // Project-Hours: EMB + any project/platform
  if(u==='EMB'||u==='EMB.') return 'proj';
  if(u.indexOf('F.EMB')===0) return 'pto';
  if(u==='DES'||u==='DES.') return 'mob';
  if(u.indexOf('MOB')===0) return 'mob';
  if(u.indexOf('DISP')===0) return 'pto';
  if(u==='BASE'||u==='HOTEL'||u==='RECAP') return 'pto';
  if(u.indexOf('AFAS')===0) return null;
  if(u.indexOf('FERIAS')===0||u.indexOf('FÉRIAS')===0||u.indexOf('Férias')===0||u==='FOLGA') return 'pto';
  if(u.indexOf('TREIN')===0||u.indexOf('CURSO')===0||u==='IRATA'||u==='ASO'||
     u==='HTS'||u==='NTS'||u==='JOTUN'||u.indexOf('RESG')===0||u.indexOf('IBIRITE')===0||
     u.indexOf('IBIRITÉ')===0||u.indexOf('T-HUET')===0||u.indexOf('THUET')===0) return 'trein';
  // everything else = project (plataformas, P-xx, PMXL, MV-xx, OCYAN, ENGIE, MISC, etc.)
  if(u.length>0) return 'proj';
  return null;
}
function hrsForCat(cat){
  if(cat==='proj')  return 11;
  if(cat==='mob')   return 12;
  if(cat==='trein') return 8;
  if(cat==='pto')   return 8;
  return 0;
}
function fmtHrs(h){
  if(h===0) return '—';
  return h+'h';
}
var MONTH_NAMES_PT=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
var _wsYear=null, _wsMonth=null; // mês selecionado no Resumo de horas (null = ainda não inicializado)

/* Mês padrão = último mês completo (o mês atual ainda está em andamento, então
   um resumo dele fica incompleto — mostrar o anterior faz mais sentido). */
function defaultWeeklySummaryMonth(){
  var now=new Date();
  var m=now.getMonth()-1, y=now.getFullYear();
  if(m<0){ m=11; y--; }
  return {year:y, month:m};
}

function changeWeeklySummaryMonth(value){
  var p=value.split('-');
  buildWeeklySummary(parseInt(p[0]),parseInt(p[1]));
}

function buildWeeklySummary(year, month){
  if(year===undefined || month===undefined){
    if(_wsYear===null){ var d=defaultWeeklySummaryMonth(); _wsYear=d.year; _wsMonth=d.month; }
    year=_wsYear; month=_wsMonth;
  } else {
    _wsYear=year; _wsMonth=month;
  }
  var JUN_YEAR=year, JUN_MONTH=month; // 0-indexed
  var junStart = new Date(JUN_YEAR,JUN_MONTH,1);
  var junEnd   = new Date(JUN_YEAR,JUN_MONTH+1,0); // último dia do mês
  // build week list: find Monday of first week
  var cur = new Date(junStart);
  cur.setDate(cur.getDate() - ((cur.getDay()+6)%7)); // back to Monday
  var weeks=[];
  while(cur <= junEnd){
    var wEnd = new Date(cur); wEnd.setDate(wEnd.getDate()+6);
    var ws = new Date(Math.max(cur.getTime(), junStart.getTime()));
    var we = new Date(Math.min(wEnd.getTime(), junEnd.getTime()));
    function fmtD(d){ return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'); }
    weeks.push({label: fmtD(ws)+' – '+fmtD(we), fullStart: new Date(cur), fullEnd: new Date(wEnd)});
    cur.setDate(cur.getDate()+7);
  }
  // for each date in DATES, determine which week it belongs to
  function dateToWeekIdx(dmy){
    var p=dmy.split('/'), d=new Date(+p[2],+p[1]-1,+p[0]);
    for(var wi=0;wi<weeks.length;wi++){
      if(d>=weeks[wi].fullStart && d<=weeks[wi].fullEnd) return wi;
    }
    return -1;
  }
  // precompute: for each date index → week index (only June dates)
  var dateWeek=[];
  var junDates=[];
  for(var di=0;di<DATES.length;di++){
    var p=DATES[di].split('/');
    if(+p[1]-1===JUN_MONTH && +p[2]===JUN_YEAR){
      var wi=dateToWeekIdx(DATES[di]);
      dateWeek.push({di:di,wi:wi});
      junDates.push(di);
    }
  }
  // for each tec, compute hours per category per week
  var cats=['proj','mob','trein','pto'];
  var catLabels={'proj':'Project-Hrs','mob':'On-Call/Mob','trein':'Training','pto':'PTO'};
  var catCls={'proj':'w-proj','mob':'w-mob','trein':'w-trein','pto':'w-pto'};
  // data[ti][wi][cat] = hours
  var data=TECS.map(function(){
    return weeks.map(function(){ return {proj:0,mob:0,trein:0,pto:0}; });
  });
  dateWeek.forEach(function(dw){
    if(dw.wi<0) return;
    TECS.forEach(function(t,ti){
      var u=(t.d[dw.di]||'').trim().toUpperCase();
      var cat=getCategory(u);
      if(cat) data[ti][dw.wi][cat]+=hrsForCat(cat);
    });
  });
  // opções do seletor de mês: mês atual + 12 meses anteriores
  var now=new Date(), monthOpts='';
  for(var mi=0; mi<13; mi++){
    var my=now.getFullYear(), mm=now.getMonth()-mi;
    while(mm<0){ mm+=12; my--; }
    var sel=(my===year && mm===month)?' selected':'';
    monthOpts+='<option value="'+my+'-'+mm+'"'+sel+'>'+MONTH_NAMES_PT[mm]+' '+my+'</option>';
  }
  // build HTML
  var COLS=cats.length; // 4 categories per week
  var h='<div class="weekly-wrap">';
  h+='<div class="weekly-title"><span>Resumo de horas — '+MONTH_NAMES_PT[month]+' '+year+'</span>'
    +'<select class="form-input" style="width:auto;margin-left:auto;font-size:12px;padding:4px 8px;text-transform:none;letter-spacing:normal;font-weight:400" onchange="changeWeeklySummaryMonth(this.value)">'+monthOpts+'</select></div>';
  h+='<div class="weekly-outer"><table class="wtbl">';
  // header row 1: name + week labels (spanning 4 cols each) + total
  h+='<thead><tr>';
  h+='<th class="wfx" rowspan="2">Técnico</th>';
  weeks.forEach(function(w,wi){
    h+='<th class="week-head" colspan="'+COLS+'">'+(wi===0?'':'')+w.label+'</th>';
  });
  h+='<th class="week-head" colspan="'+COLS+'">Total '+MONTH_NAMES_PT[month].slice(0,3)+'.</th>';
  h+='</tr>';
  // header row 2: category labels per week
  h+='<tr class="cat-row">';
  var totalCols=weeks.length+1;
  for(var ci=0;ci<totalCols;ci++){
    cats.forEach(function(cat,cati){
      var sep=(cati===0)?'week-sep':'';
      h+='<th class="'+sep+'">'+catLabels[cat]+'</th>';
    });
  }
  h+='</tr></thead>';
  // body
  h+='<tbody>';
  // column totals accumulators
  var colTotals=weeks.map(function(){ return {proj:0,mob:0,trein:0,pto:0}; });
  var grandTotals={proj:0,mob:0,trein:0,pto:0};
  TECS.forEach(function(t,ti){
    h+='<tr>';
    h+='<td class="wfx">'+t.n+'</td>';
    var rowGrand={proj:0,mob:0,trein:0,pto:0};
    weeks.forEach(function(w,wi){
      cats.forEach(function(cat,cati){
        var hrs=data[ti][wi][cat];
        var sep=(cati===0)?'week-sep':'';
        var cls=catCls[cat]+' '+(hrs===0?'w-zero':'')+' '+sep;
        h+='<td class="'+cls.trim()+'">'+fmtHrs(hrs)+'</td>';
        colTotals[wi][cat]+=hrs;
        rowGrand[cat]+=hrs;
        grandTotals[cat]+=hrs;
      });
    });
    // row totals
    cats.forEach(function(cat,cati){
      var hrs=rowGrand[cat];
      var sep=(cati===0)?'week-sep':'';
      var cls=catCls[cat]+' w-total '+sep+(hrs===0?' w-zero':'');
      h+='<td class="'+cls.trim()+'">'+fmtHrs(hrs)+'</td>';
    });
    h+='</tr>';
  });
  // totals row
  h+='<tr class="totals-row">';
  h+='<td class="wfx">Total</td>';
  weeks.forEach(function(w,wi){
    cats.forEach(function(cat,cati){
      var hrs=colTotals[wi][cat];
      var sep=(cati===0)?'week-sep':'';
      h+='<td class="'+catCls[cat]+' '+(hrs===0?'w-zero':'')+' '+sep+'">'+fmtHrs(hrs)+'</td>';
    });
  });
  cats.forEach(function(cat,cati){
    var hrs=grandTotals[cat];
    var sep=(cati===0)?'week-sep':'';
    h+='<td class="'+catCls[cat]+' w-total '+sep+(hrs===0?' w-zero':'')+'">'+fmtHrs(hrs)+'</td>';
  });
  h+='</tr>';
  h+='</tbody></table></div></div>';
  document.getElementById('weekly-summary').innerHTML=h;
}

/* ── DASHBOARD ── */
var dashS=0,dashE=DATES.length-1,pieChart=null,lineChart=null;
function buildMetrics(){
  var idx=[];for(var i=dashS;i<=dashE;i++)idx.push(i);
  var valid=TECS.filter(function(t){return t.p>0;});
  var avg=valid.reduce(function(a,t){return a+t.p;},0)/valid.length*100;
  var acima=TECS.filter(function(t){return t.p>1.15;}).length;
  var abx=TECS.filter(function(t){return t.p<0.9&&t.p>0;}).length;
  var ideal=TECS.filter(function(t){return t.p>=0.9&&t.p<=1.15;}).length;
  var avgEmb=idx.length?(idx.reduce(function(s,i){return s+TECS.filter(function(t){return ['EMB','EMB.'].indexOf((t.d[i]||'').toUpperCase())>=0;}).length;},0)/idx.length).toFixed(1):'—';
  var pk=0,pkD='—';
  idx.forEach(function(i){var c=TECS.filter(function(t){return ['EMB','EMB.'].indexOf((t.d[i]||'').toUpperCase())>=0;}).length;if(c>pk){pk=c;pkD=DATES[i];}});
  document.getElementById('rangeInfo').textContent=idx.length+' dia'+(idx.length!==1?'s':'');
  var cards=[
    {lb:'Total técnicos',val:TECS.length,nt:'cadastrados',ml:'#4a9eff'},
    {lb:'Carga média',val:avg.toFixed(1)+'%',nt:'ideal = 100%',ml:avg>115?'#e85b5b':avg<90?'#f5a623':'#1fc98e'},
    {lb:'Sobrecarregados',val:acima,nt:'> 115% carga',ml:'#e85b5b'},
    {lb:'Faixa ideal',val:ideal,nt:'90% – 115%',ml:'#1fc98e'},
    {lb:'Subutilizados',val:abx,nt:'< 90% carga',ml:'#f5a623'},
    {lb:'Média emb./dia',val:avgEmb,nt:'no período',ml:'#a78bfa'},
    {lb:'Pico de embarque',val:pk,nt:pkD,ml:'#1fc98e'}
  ];
  document.getElementById('metrics').innerHTML=cards.map(function(c){
    return '<div class="metric-card" style="--ml:'+c.ml+'"><div class="metric-label">'+c.lb+'</div><div class="metric-value" style="color:'+c.ml+'">'+c.val+'</div><div class="metric-note">'+c.nt+'</div></div>';
  }).join('');
}
function buildBars(){
  // Escala 0%–100%–200% de carga (t.p, o mesmo "Carga" usado no resto do app):
  // 0% = muito mal utilizado, 100% = uso moderado (ideal), 200% = muito utilizado.
  var data=TECS.map(function(t){ return {n:t.n,p:t.p}; }).sort(function(a,b){return b.p-a.p;});
  document.getElementById('bars').innerHTML=data.map(function(t){
    var p=(t.p*100).toFixed(0), w=Math.min(t.p/2*100,100).toFixed(1);
    var gcol=pctCol(t.p);
    var label = t.p>1.15?'Muito utilizado':t.p<0.9?'Muito mal utilizado':'Uso moderado';
    var nm=t.n.split(' ').slice(0,2).join(' ');
    return '<div class="hbar-row"><div class="hbar-name" title="'+t.n+' — '+label+'">'+nm+'</div>'
      +'<div class="hbar-track"><div class="hbar-fill" style="width:'+w+'%;background:'+gcol+'"></div></div>'
      +'<div class="hbar-pct">'+p+'%</div>'
      +'<div style="font-size:10px;color:'+gcol+';font-family:JetBrains Mono,monospace;width:100px;text-align:right;flex-shrink:0">'+label+'</div></div>';
  }).join('');
}
function buildPie(){
  var idx=[];for(var i=dashS;i<=dashE;i++)idx.push(i);
  // Embarcado (EMB/EMB.) e Projeto são a mesma coisa (estar num projeto/plataforma é estar embarcado) — uma fatia só.
  var ct={EMBPROJ:0,FEMB:0,DES:0,DISP:0,MOB:0,AF:0,BASE:0};
  TECS.forEach(function(t){idx.forEach(function(i){var v=t.d[i];if(!v)return;var u=v.trim().toUpperCase();if(u.indexOf('F.EMB')===0)ct.FEMB++;else if(u==='DES'||u==='DES.')ct.DES++;else if(u.indexOf('DISP')===0)ct.DISP++;else if(u.indexOf('MOB')===0)ct.MOB++;else if(u.indexOf('AFAS')===0)ct.AF++;else if(u==='BASE'||u==='HOTEL'||u==='RECAP')ct.BASE++;else if(u)ct.EMBPROJ++;});});
  var total=Object.keys(ct).reduce(function(s,k){return s+ct[k];},0);
  if(pieChart){pieChart.destroy();pieChart=null;}
  pieChart=new Chart(document.getElementById('pieC'),{type:'doughnut',
    data:{labels:['Embarcado/Projeto','Folga emb.','Desembarque','Disponível','Mobilização','Afastado','Base/Hotel'],
      datasets:[{data:[ct.EMBPROJ,ct.FEMB,ct.DES,ct.DISP,ct.MOB,ct.AF,ct.BASE],
        backgroundColor:['#2f4bd0','#1fc98e','#7dd3fc','#fb923c','#4a9eff','#e85b5b','#64748b'],borderWidth:0,hoverOffset:4}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
      plugins:{legend:{position:'right',labels:{color:'#8a91a8',font:{size:11,family:'Inter'},boxWidth:10,padding:10,
        generateLabels:function(ch){var ds=ch.data.datasets[0];return ch.data.labels.map(function(l,i){
          var v=ds.data[i], pct=total>0?Math.round(v/total*100):0;
          return {text:l+'  '+v+' ('+pct+'%)',fillStyle:ds.backgroundColor[i],strokeStyle:'transparent',fontColor:'#8a91a8',index:i};
        });}}},
        tooltip:{callbacks:{label:function(ctx){var v=ctx.parsed, pct=total>0?Math.round(v/total*100):0; return ctx.label+': '+v+' ('+pct+'%)';}}}}
    }
  });
}
function buildLine(){
  var s=dashS,e=dashE,N=TECS.length,total=e-s+1,step=Math.max(1,Math.floor(total/60));
  var labels=[],emb=[],femb=[],disp=[],todayM=[];
  for(var i=s;i<=e;i+=step){
    var dp=DATES[i].split('/');labels.push(dp[0]+'/'+dp[1]);
    var st=TECS.map(function(t){return (t.d[i]||'').trim().toUpperCase();});
    // "Embarcados" = EMB propriamente dito + qualquer projeto/plataforma (P-52, MV-22, NOVELIS...),
    // já que estar num projeto embarcado também é estar embarcado.
    emb.push(+(st.filter(function(v){return getCategory(v)==='proj';}).length/N*100).toFixed(1));
    femb.push(+(st.filter(function(v){return v.indexOf('F.EMB')===0;}).length/N*100).toFixed(1));
    disp.push(+(st.filter(function(v){return v.indexOf('DISP')===0;}).length/N*100).toFixed(1));
    todayM.push(i===T_IDX);
  }
  if(lineChart){lineChart.destroy();lineChart=null;}
  lineChart=new Chart(document.getElementById('lineC'),{type:'line',
    data:{labels:labels,datasets:[
      {label:'Embarcados',data:emb,borderColor:'#2f4bd0',backgroundColor:'rgba(47,75,208,.1)',tension:0.3,fill:true,borderWidth:2,
        pointRadius:todayM.map(function(t){return t?5:total>60?0:3;}),pointBackgroundColor:todayM.map(function(t){return t?'#fff':'#2f4bd0';})},
      {label:'Folga emb.',data:femb,borderColor:'#1fc98e',backgroundColor:'transparent',tension:0.3,fill:false,borderWidth:1.5,borderDash:[5,4],pointBackgroundColor:'#1fc98e',pointRadius:total>60?0:3},
      {label:'Disponível',data:disp,borderColor:'#fb923c',backgroundColor:'transparent',tension:0.3,fill:false,borderWidth:1.5,borderDash:[2,3],pointBackgroundColor:'#fb923c',pointRadius:total>60?0:3}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      scales:{
        y:{min:0,max:100,ticks:{callback:function(v){return v+'%';},color:'#555e7a',font:{size:11}},grid:{color:'rgba(255,255,255,.04)'},border:{color:'rgba(255,255,255,.07)'}},
        x:{ticks:{color:'#555e7a',font:{size:10},maxRotation:45,maxTicksLimit:12},grid:{color:'rgba(255,255,255,.03)'},border:{color:'rgba(255,255,255,.07)'}}
      },
      plugins:{legend:{labels:{color:'#8a91a8',font:{size:11,family:'Inter'},boxWidth:10,padding:14,usePointStyle:true}}}
    }
  });
}
function refreshDash(){buildMetrics();buildBars();buildPie();buildLine();}
function initDashDates(){
  var now=new Date();
  function fmt(d){return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();}
  var ms=new Date(now.getFullYear(),now.getMonth(),1);
  var si=idxOf(fmt(ms));
  dashS=Math.max(0,si!==null?si:0);dashE=T_IDX;
  document.getElementById('dStart').value=toISO(DATES[dashS]);
  document.getElementById('dEnd').value=toISO(DATES[dashE]);
  document.getElementById('pMes').classList.add('on');
}

/* ── PROFISSIONAIS LIST ── */
function renderProfList(){
  var q=(document.getElementById('profSearch')||{value:''}).value.toLowerCase();
  var h='';
  TECS.forEach(function(t,ti){
    if(q && t.n.toLowerCase().indexOf(q)<0 && (t.f||'').toLowerCase().indexOf(q)<0) return;
    // calc hours for current month from DATES/data
    var now=new Date();
    var yr=now.getFullYear(), mo=now.getMonth();
    var proj=0,mob=0,trein=0,pto=0;
    DATES.forEach(function(dmy,di){
      var p=dmy.split('/');
      if(+p[2]!==yr||+p[1]-1!==mo) return;
      var u=(t.d[di]||'').trim().toUpperCase();
      var cat=getCategory(u);
      if(cat) {var hrs=hrsForCat(cat); if(cat==='proj')proj+=hrs; else if(cat==='mob')mob+=hrs; else if(cat==='trein')trein+=hrs; else if(cat==='pto')pto+=hrs;}
    });
    function fh(v){return v?v+'h':'<span style="opacity:.3">—</span>';}
    function badge(val,cls){return val?'<span class="prof-badge '+cls+'">'+val+'</span>':'<span style="opacity:.25;font-size:11px">—</span>';}
    h+='<tr>';
    h+='<td class="wfx" style="font-weight:500">'+t.n+'</td>';
    h+='<td style="font-size:11px;color:var(--text3)">'+( t.f||'—')+'</td>';
    h+='<td style="text-align:center;font-size:11px;font-family:monospace;color:var(--text3)">'+(t.s||'—')+'</td>';
    h+='<td style="text-align:center">'+badge(t.lrs,'lrs')+'</td>';
    h+='<td style="text-align:center">'+badge(t.lcr,'lcr')+'</td>';
    h+='<td style="text-align:center">'+badge(t.irata,'irata')+'</td>';
    h+='<td style="text-align:center;font-family:monospace;color:var(--emb)">'+fh(proj)+'</td>';
    h+='<td style="text-align:center;font-family:monospace;color:var(--des)">'+fh(mob)+'</td>';
    h+='<td style="text-align:center;font-family:monospace;color:var(--proj)">'+fh(trein)+'</td>';
    h+='<td style="text-align:center;font-family:monospace;color:var(--femb)">'+fh(pto)+'</td>';
    h+='<td style="text-align:center"><button class="prof-edit-btn" onclick="openTecModal('+ti+')" title="Editar técnico">✏</button></td>';
    h+='</tr>';
  });
  var tbody=document.getElementById('profListBody');
  if(tbody) tbody.innerHTML=h||'<tr><td colspan="11" style="text-align:center;padding:2rem;color:var(--text3)">Nenhum técnico encontrado</td></tr>';
}

/* ════════════════════════════════════════════════════
   UTILIZAÇÃO — lê direto de TECS e DATES
   ════════════════════════════════════════════════════ */
var _utilFrom='', _utilTo='', _utilFilter='todos';
var _utilTrendChart=null, _utilDonutChart=null;

var UTIL_LABELS={operacao:'Em Operação',folga_emb:'Folga Embarque',disponivel:'Disponível',
  afastado:'Afastado',ferias:'Férias',treinamento:'Treinamento',
  mobilizacao:'Mobilização',cancelado:'Cancelado',embarque:'Embarcando',sem_info:'—'};
var UTIL_COLORS={operacao:'#2ecc71',folga_emb:'#3498db',disponivel:'#f39c12',
  afastado:'#e74c3c',ferias:'#9b59b6',treinamento:'#8e44ad',
  mobilizacao:'#1abc9c',cancelado:'#95a5a6',embarque:'#27ae60',sem_info:'#bdc3c7'};

/* Standard statuses that are NOT a project */
var UTIL_STD=['EMB','EMB.','F.EMB','F. EMB','F.EMBARQUE','FOLGA',
  'DES','DES.','MOB.','MOB','DISP.','DISP','BASE','HOTEL','HOTEL.',
  'RECAP','AFASTADO','INSS','ATESTADO','TREINAM.','TREINAMETO',
  'DESLIGADO','FÉRIAS','FERIAS','ASO','IRATA','T-HUET','THUET',
  'CURSO','HTT','PEAT','PT','NRS','NTS','HTS','JOTUN','CBSP',
  'RESGATE','IBIRITÉ','IBIRITE','CURSO PT','PT (BR)'];

function _util_isProject(s){
  if(!s||s==='') return false;
  var u=s.toUpperCase().trim();
  return UTIL_STD.indexOf(u)<0;
}

function _util_classify(s){
  if(!s||s==='') return 'sem_info';
  var u=s.toUpperCase().trim();
  if(u==='F.EMB'||u==='F. EMB'||u==='F.EMBARQUE'||u==='FOLGA') return 'folga_emb';
  if(u.indexOf('FÉRIAS')>=0||u.indexOf('FERIAS')>=0) return 'ferias';
  if(['AFASTADO','INSS','ATESTADO'].some(function(x){return u.indexOf(x)>=0;})) return 'afastado';
  if(['CURSO','IRATA','TREINAM','CBSP','T-HUET','THUET','RESGATE','NRS','NTS','ASO','HTS','JOTUN','IBIRITÉ','IBIRITE','PEAT'].some(function(x){return u.indexOf(x)>=0;})) return 'treinamento';
  if(['DISP','BASE','HOTEL','RECAP'].some(function(x){return u.indexOf(x)>=0;})) return 'disponivel';
  if(['MOB','MOBILIZ'].some(function(x){return u.indexOf(x)>=0;})) return 'mobilizacao';
  if(u==='DES'||u==='DES.'||u.indexOf('DESLIGADO')>=0) return 'cancelado';
  if(u==='EMB'||u==='EMB.') return 'embarque';
  if(u.length>0) return 'operacao';
  return 'sem_info';
}

function _util_dmy2iso(dmy){var p=dmy.split('/');return p[2]+'-'+p[1]+'-'+p[0];}
function _util_iso2dmy(iso){var p=iso.split('-');return p[2]+'/'+p[1]+'/'+p[0];}

function _util_statsForDate(iso){
  var dmy=_util_iso2dmy(iso), di=DATES.indexOf(dmy);
  if(di<0) return null;
  var r={total:TECS.length,op:0,folga:0,disp:0,af:0,cats:{}};
  TECS.forEach(function(t){
    var cat=_util_classify(t.d[di]||'');
    r.cats[cat]=(r.cats[cat]||0)+1;
    if(cat==='operacao'||cat==='embarque') r.op++;
    else if(cat==='folga_emb') r.folga++;
    else if(cat==='disponivel'||cat==='mobilizacao') r.disp++;
    else if(cat==='afastado'||cat==='ferias') r.af++;
  });
  r.util=r.total>0?Math.round((r.op/r.total)*100):0;
  return r;
}

/* Estatísticas agregadas do período [fromISO,toISO]: % médio de cada categoria
   (dias sem status lançado não entram no denominador das porcentagens, só na
   distribuição do gráfico de rosca, como "sem_info"). */
function _util_statsForPeriod(fromISOv, toISOv){
  if(!fromISOv || !toISOv) return null;
  var catCounts={}, withData=0, opN=0, folgaN=0, dispN=0, afN=0;
  TECS.forEach(function(t){
    DATES.forEach(function(dmy,di){
      var iso=toISO(dmy);
      if(iso<fromISOv || iso>toISOv) return;
      var v=t.d[di]||'';
      var cat=_util_classify(v);
      catCounts[cat]=(catCounts[cat]||0)+1;
      if(!v) return;
      withData++;
      if(cat==='operacao'||cat==='embarque') opN++;
      else if(cat==='folga_emb') folgaN++;
      else if(cat==='disponivel'||cat==='mobilizacao') dispN++;
      else if(cat==='afastado'||cat==='ferias') afN++;
    });
  });
  function pct(n){ return withData>0 ? Math.round(n/withData*100) : 0; }
  return {total:TECS.length, opPct:pct(opN), folgaPct:pct(folgaN), dispPct:pct(dispN), afPct:pct(afN), util:pct(opN), cats:catCounts};
}
function toISO_local(dmy){ return toISO(dmy); } // apelido só pra deixar claro, dentro desta função, que é conversão DMY→ISO

function setUtilPeriod(){
  var fromEl=document.getElementById('util-from');
  var toEl=document.getElementById('util-to');
  _utilFrom=fromEl?fromEl.value:'';
  _utilTo=toEl?toEl.value:'';
  if(_utilFrom && _utilTo && _utilFrom>_utilTo){
    var tmp=_utilFrom; _utilFrom=_utilTo; _utilTo=tmp;
    if(fromEl) fromEl.value=_utilFrom;
    if(toEl) toEl.value=_utilTo;
  }
  var lbl=document.getElementById('current-date-label');
  if(lbl){
    if(_utilFrom && _utilTo){
      var days=Math.round((new Date(_utilTo)-new Date(_utilFrom))/86400000)+1;
      lbl.textContent=days+' dia'+(days!==1?'s':'')+' no período';
    } else lbl.textContent='';
  }
  _util_updateKPIs();
  _util_renderTable();
  _util_updateDonut();
  _util_renderTrend();
}

function shiftUtilPeriod(dir){
  if(!_utilFrom || !_utilTo) return;
  var from=new Date(_utilFrom+'T12:00:00'), to=new Date(_utilTo+'T12:00:00');
  var spanDays=Math.round((to-from)/86400000)+1;
  from.setDate(from.getDate()+dir*spanDays);
  to.setDate(to.getDate()+dir*spanDays);
  document.getElementById('util-from').value=from.toISOString().slice(0,10);
  document.getElementById('util-to').value=to.toISOString().slice(0,10);
  setUtilPeriod();
}

function _util_updateKPIs(){
  var s=_util_statsForPeriod(_utilFrom,_utilTo); if(!s) return;
  function el(id,v){var e=document.getElementById(id);if(e)e.textContent=v;}
  el('kpi-total',s.total); el('kpi-op',s.opPct+'%'); el('kpi-folga',s.folgaPct+'%');
  el('kpi-disp',s.dispPct+'%'); el('kpi-af',s.afPct+'%');
  el('kpi-util',s.util+'%'); el('kpi-idle','ociosidade: '+(100-s.util)+'%');
}

function _util_updateDonut(){
  var s=_util_statsForPeriod(_utilFrom,_utilTo); if(!s) return;
  var el=document.getElementById('donut-pct'); if(el) el.textContent=s.util+'%';
  var ctx=document.getElementById('donutChart'); if(!ctx) return;
  if(_utilDonutChart){_utilDonutChart.destroy();_utilDonutChart=null;}
  var cats=Object.keys(s.cats).filter(function(k){return s.cats[k]>0;});
  _utilDonutChart=new Chart(ctx,{
    type:'doughnut',
    data:{labels:cats.map(function(k){return UTIL_LABELS[k]||k;}),
          datasets:[{data:cats.map(function(k){return s.cats[k];}),
            backgroundColor:cats.map(function(k){return UTIL_COLORS[k]||'#999';}),borderWidth:0}]},
    options:{cutout:'72%',plugins:{legend:{display:false}},responsive:true,maintainAspectRatio:false}
  });
}

function _util_renderTrend(){
  var ctx=document.getElementById('trendChart'); if(!ctx) return;
  if(_utilTrendChart){_utilTrendChart.destroy();_utilTrendChart=null;}
  if(!_utilFrom || !_utilTo) return;
  var slice=DATES.map(_util_dmy2iso).filter(function(iso){return iso>=_utilFrom && iso<=_utilTo;});
  // período longo: amostra os pontos pra não poluir o eixo X (igual ao gráfico do Dashboard)
  var step=Math.max(1,Math.floor(slice.length/60));
  slice=slice.filter(function(_,i){return i%step===0;});
  var utilPct=slice.map(function(d){var s=_util_statsForDate(d);return s?s.util:0;});
  var labels=slice.map(function(d){return d.slice(5);});
  _utilTrendChart=new Chart(ctx,{
    type:'line',
    data:{labels:labels,datasets:[
      {label:'Utilização %',data:utilPct,borderColor:'#2ecc71',backgroundColor:'rgba(46,204,113,.08)',tension:.3,fill:true,pointRadius:2},
      {label:'Ociosidade %',data:utilPct.map(function(v){return 100-v;}),borderColor:'#e74c3c',backgroundColor:'rgba(231,76,60,.05)',tension:.3,fill:true,pointRadius:2}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      scales:{
        y:{min:0,max:100,ticks:{color:'rgba(200,200,200,.5)',font:{size:10}},grid:{color:'rgba(255,255,255,.04)'}},
        x:{ticks:{color:'rgba(200,200,200,.5)',font:{size:9},maxTicksLimit:10},grid:{display:false}}
      },
      plugins:{legend:{labels:{color:'rgba(200,200,200,.6)',font:{size:11}}}}}
  });
}

function _util_renderTable(){
  // "Status"/"Projeto" mostram a foto do último dia do período selecionado
  var di = _utilTo ? idxOf(_util_iso2dmy(_utilTo)) : null;
  var search=(document.getElementById('search')||{value:''}).value.toLowerCase();
  var rows='';
  TECS.forEach(function(t){
    if(search&&t.n.toLowerCase().indexOf(search)<0&&(t.f||'').toLowerCase().indexOf(search)<0) return;
    var status=(di!==null?t.d[di]:'')||'';
    var cat=_util_classify(status);
    if(_utilFilter!=='todos'&&cat!==_utilFilter) return;
    // Utilização % escopada ao mesmo período De/Até selecionado acima
    var opD=0,totD=0;
    DATES.forEach(function(d2,di2){
      var iso=toISO(d2);
      if(_utilFrom && iso<_utilFrom) return;
      if(_utilTo && iso>_utilTo) return;
      if(!t.d[di2]) return; totD++;
      var c2=_util_classify(t.d[di2]);
      if(c2==='operacao'||c2==='embarque') opD++;
    });
    var pctV=totD>0?Math.round(opD/totD*100):0;
    var fillCls=''; if(pctV<70&&pctV>=40) fillCls='medium'; else if(pctV<40) fillCls='low';
    rows+='<tr>';
    rows+='<td style="font-weight:500;color:var(--text)">'+t.n+'</td>';
    rows+='<td style="color:var(--text3);font-size:11px">'+(t.f||'—')+'</td>';
    rows+='<td><span class="cert-badge">'+(t.lrs?'LRS '+t.lrs:'—')+'</span></td>';
    rows+='<td><span class="badge badge-'+cat+'">'+(UTIL_LABELS[cat]||cat)+'</span></td>';
    rows+='<td style="font-size:11px;color:var(--text3)">'+(status||'—')+'</td>';
    rows+='<td><span class="util-bar"><span class="util-fill '+fillCls+'" style="width:'+pctV+'%"></span></span>'+pctV+'%</td>';
    rows+='</tr>';
  });
  var tb=document.getElementById('table-body');
  if(tb) tb.innerHTML=rows||'<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text3)">Sem dados para este período</td></tr>';
}
function renderTable(){_util_renderTable();}

function _util_setFilter(f,el){
  _utilFilter=f;
  document.querySelectorAll('#utilizacao .filter-btn').forEach(function(b){b.classList.remove('active');});
  if(el) el.classList.add('active');
  _util_renderTable();
}

function _util_buildFilters(){
  var row=document.getElementById('filters'); if(!row) return;
  var cats=['todos','operacao','folga_emb','disponivel','afastado','treinamento','mobilizacao'];
  var labels={todos:'Todos',operacao:'Em Operação',folga_emb:'Folga Emb.',
    disponivel:'Disponível',afastado:'Afastado',treinamento:'Treinamento',mobilizacao:'Mobilização'};
  row.innerHTML=cats.map(function(c){
    var act=c==='todos'?' active':'';
    return '<button class="filter-btn'+act+'" data-cat="'+c+'" onclick="_util_setFilter(this.dataset.cat,this)">'+labels[c]+'</button>';
  }).join('');
}

/* ── HORAS POR PROJETO ── */
function _util_renderHours(){
  var fromEl=document.getElementById('hrs-from');
  var toEl=document.getElementById('hrs-to');
  var searchEl=document.getElementById('hrs-search');
  var fromISOv=fromEl?fromEl.value:'';
  var toISOv=toEl?toEl.value:'';
  var q=searchEl?searchEl.value.toLowerCase():'';

  // Collect: project → {days, techs:Set, horasPrev, horasReais}
  var projMap={};

  TECS.forEach(function(t){
    DATES.forEach(function(dmy,di){
      // Filter by date range — compara em ISO (YYYY-MM-DD), nunca a string DD/MM/YYYY
      // (comparar "08/07/2026" com "07/08/2026" como texto dá resultado errado: dia "08" > dia "07")
      var iso=toISO(dmy);
      if(fromISOv&&iso<fromISOv) return;
      if(toISOv&&iso>toISOv) return;
      var s=(t.d[di]||'').trim();
      if(!s) return;
      var u=s.toUpperCase();
      if(!_util_isProject(u)) return;
      // Normalize project name (PMXL/P-MXL → same)
      var proj=u.replace('P-MXL','PMXL').replace('P MXL','PMXL');
      if(q&&proj.toLowerCase().indexOf(q)<0&&s.toLowerCase().indexOf(q)<0) return;
      if(!projMap[proj]) projMap[proj]={proj:proj,days:0,techs:{},horasPrev:0,horasReais:0};
      projMap[proj].days++;
      projMap[proj].techs[t.n]=true;
      // Hours
      var hrs=11; // default EMB hours
      projMap[proj].horasPrev+=hrs;
      // Real hours if imported (persistido em escala.hr_reais)
      var realHr=t.hr[di];
      if(realHr){
        var parts=realHr.split(':');
        if(parts.length===2) projMap[proj].horasReais+=parseInt(parts[0])+(parseInt(parts[1])/60);
      }
    });
  });

  // Sort by days desc
  var rows=Object.values(projMap).sort(function(a,b){return b.days-a.days;});
  var maxDays=rows.length?rows[0].days:1;

  var html='';
  rows.forEach(function(r){
    var tecList=Object.keys(r.techs);
    var pct=Math.round(r.days/maxDays*100);
    var horasPrevStr=r.horasPrev+'h';
    var horasReaisStr=r.horasReais>0?Math.round(r.horasReais)+'h':'—';
    html+='<tr data-proj="'+r.proj+'" onclick="_util_showHoursDetail(this.dataset.proj)">';
    html+='<td style="font-weight:500;color:var(--text)">'+r.proj+'</td>';
    html+='<td style="font-size:11px;color:var(--text3)">'+tecList.slice(0,3).join(', ')+(tecList.length>3?' +'+( tecList.length-3)+' mais':'')+'</td>';
    html+='<td style="text-align:right;font-family:monospace;color:var(--text2)">'+r.days+'</td>';
    html+='<td style="text-align:right;font-family:monospace;color:var(--femb)">'+horasPrevStr+'</td>';
    html+='<td style="text-align:right;font-family:monospace;color:var(--emb)">'+horasReaisStr+'</td>';
    html+='<td><div class="proj-bar"><div class="proj-bar-fill" style="width:'+pct+'%"></div></div></td>';
    html+='</tr>';
  });

  var tb=document.getElementById('hrs-body');
  if(tb) tb.innerHTML=html||'<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text3)">Nenhum projeto encontrado no período</td></tr>';
  document.getElementById('hrs-detail').style.display='none';
  _util_renderTecHours(); // mesmo período De/Até, mantém o card de busca por técnico em sincronia
}

/* ── HORAS POR TÉCNICO (busca por nome, mesmo período do card acima) ── */
function _util_renderTecHours(){
  var body=document.getElementById('tec-hrs-body');
  var summary=document.getElementById('tec-hrs-summary');
  if(!body) return;
  var searchEl=document.getElementById('tec-hrs-search');
  var q=searchEl?searchEl.value.trim().toLowerCase():'';

  function empty(msg){
    body.innerHTML='<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text3)">'+msg+'</td></tr>';
    if(summary) summary.style.display='none';
  }

  if(!q){ empty('Digite o nome de um técnico para ver o detalhamento'); return; }

  var matches=TECS.filter(function(t){return t.n.toLowerCase().indexOf(q)>=0;});
  if(matches.length===0){ empty('Nenhum técnico encontrado'); return; }
  if(matches.length>1){
    var names=matches.slice(0,8).map(function(t){return t.n;}).join(', ')+(matches.length>8?'…':'');
    empty(matches.length+' técnicos encontrados — refine a busca<br><span style="font-size:11px">'+names+'</span>');
    return;
  }

  var t=matches[0];
  var fromEl=document.getElementById('hrs-from');
  var toEl=document.getElementById('hrs-to');
  var fromISOv=fromEl?fromEl.value:'';
  var toISOv=toEl?toEl.value:'';

  var projMap={};
  var totalPrev=0, totalReal=0, totalPto=0, totalFolgaProj=0;
  DATES.forEach(function(dmy,di){
    var iso=toISO(dmy);
    if(fromISOv&&iso<fromISOv) return;
    if(toISOv&&iso>toISOv) return;
    var s=(t.d[di]||'').trim();
    if(!s) return;
    var u=s.toUpperCase();
    var cat=getCategory(u);
    if(cat==='pto') totalPto+=hrsForCat('pto');
    // dia marcado como folga (folga_override) mas o status é embarque/projeto —
    // ou seja, trabalhou num dia que deveria ser de folga
    if(t.fo[di] && cat==='proj') totalFolgaProj+=hrsForCat('proj');
    if(cat!=='proj') return; // só entra na tabela se for embarque/projeto de fato
    var proj=u.replace('P-MXL','PMXL').replace('P MXL','PMXL');
    if(!projMap[proj]) projMap[proj]={proj:proj,days:0,prev:0,real:0};
    projMap[proj].days++;
    projMap[proj].prev+=11;
    totalPrev+=11;
    var realHr=t.hr[di];
    if(realHr){
      var parts=realHr.split(':');
      if(parts.length===2){ var hh=parseInt(parts[0])+(parseInt(parts[1])/60); projMap[proj].real+=hh; totalReal+=hh; }
    }
  });

  var rows=Object.values(projMap).sort(function(a,b){return b.days-a.days;});
  var totalDays=rows.reduce(function(s,r){return s+r.days;},0);
  var html=rows.map(function(r){
    return '<tr>'
      +'<td style="font-weight:500;color:var(--text)">'+r.proj+'</td>'
      +'<td style="text-align:right;font-family:monospace;color:var(--text2)">'+r.days+'</td>'
      +'<td style="text-align:right;font-family:monospace;color:var(--femb)">'+r.prev+'h</td>'
      +'<td style="text-align:right;font-family:monospace;color:var(--emb)">'+(r.real>0?Math.round(r.real)+'h':'—')+'</td>'
      +'</tr>';
  }).join('');
  if(rows.length){
    html+='<tr style="font-weight:600;border-top:2px solid var(--border)">'
      +'<td style="color:var(--text)">Total — '+t.n+'</td>'
      +'<td style="text-align:right;font-family:monospace;color:var(--text2)">'+totalDays+'</td>'
      +'<td style="text-align:right;font-family:monospace;color:var(--femb)">'+totalPrev+'h</td>'
      +'<td style="text-align:right;font-family:monospace;color:var(--emb)">'+(totalReal>0?Math.round(totalReal)+'h':'—')+'</td>'
      +'</tr>';
  }
  body.innerHTML=html||'<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text3)">Nenhum dia embarcado/projeto no período para '+t.n+'</td></tr>';

  if(summary){
    summary.style.display='flex';
    summary.innerHTML='<span>Horas Totais Prev.: <b style="color:var(--femb)">'+totalPrev+'h</b></span>'
      +'<span>Horas Totais Reais: <b style="color:var(--emb)">'+(totalReal>0?Math.round(totalReal)+'h':'—')+'</b></span>'
      +'<span>Folga/Disponível: <b style="color:var(--accent)">'+totalPto+'h</b></span>'
      +'<span>Horas 100% Projeto (trabalhou em dia de folga): <b style="color:var(--st-femb)">'+totalFolgaProj+'h</b></span>';
  }
}

function _util_showHoursDetail(proj){
  var fromEl=document.getElementById('hrs-from');
  var toEl=document.getElementById('hrs-to');
  var fromISOv=fromEl?fromEl.value:'';
  var toISOv=toEl?toEl.value:'';

  var tecData={};
  TECS.forEach(function(t,ti){
    DATES.forEach(function(dmy,di){
      var iso=toISO(dmy);
      if(fromISOv&&iso<fromISOv) return;
      if(toISOv&&iso>toISOv) return;
      var s=(t.d[di]||'').trim().toUpperCase().replace('P-MXL','PMXL');
      if(s!==proj) return;
      if(!tecData[t.n]) tecData[t.n]={days:0,prev:0,real:0};
      tecData[t.n].days++;
      tecData[t.n].prev+=11;
      var realHr=t.hr[di];
      if(realHr){
        var parts=realHr.split(':');
        if(parts.length===2) tecData[t.n].real+=parseInt(parts[0])+(parseInt(parts[1])/60);
      }
    });
  });

  var rows=Object.entries(tecData).sort(function(a,b){return b[1].days-a[1].days;});
  var html=rows.map(function(e){
    return '<tr><td style="color:var(--text)">'+e[0]+'</td>'
      +'<td style="text-align:right;font-family:monospace">'+e[1].days+'</td>'
      +'<td style="text-align:right;font-family:monospace;color:var(--femb)">'+e[1].prev+'h</td>'
      +'<td style="text-align:right;font-family:monospace;color:var(--emb)">'+(e[1].real>0?Math.round(e[1].real)+'h':'—')+'</td>'
      +'</tr>';
  }).join('');

  document.getElementById('hrs-detail-proj').textContent=proj;
  document.getElementById('hrs-detail-body').innerHTML=html;
  document.getElementById('hrs-detail').style.display='';
  document.getElementById('hrs-detail').scrollIntoView({behavior:'smooth',block:'nearest'});
}

function initUtil(){
  var allISO=DATES.map(_util_dmy2iso);
  if(!allISO.length) return;
  var todayISO=new Date().toISOString().slice(0,10);
  var closest=allISO.filter(function(d){return d<=todayISO;}).pop()||allISO[0];

  // Período padrão dos KPIs/gráficos/tabela: últimos 30 dias até hoje
  var utilFromEl=document.getElementById('util-from');
  var utilToEl=document.getElementById('util-to');
  if(utilToEl) utilToEl.value=closest;
  if(utilFromEl){
    var d0=new Date(closest+'T12:00:00');
    d0.setDate(d0.getDate()-29);
    utilFromEl.value=d0.toISOString().slice(0,10);
  }
  setUtilPeriod();
  _util_buildFilters();

  // Set default date range: last 30 days (Horas por Projeto / Horas por Técnico)
  var toEl=document.getElementById('hrs-to');
  var fromEl=document.getElementById('hrs-from');
  if(toEl) toEl.value=closest;
  if(fromEl){
    var d=new Date(closest+'T12:00:00');
    d.setDate(d.getDate()-30);
    fromEl.value=d.toISOString().slice(0,10);
  }
  _util_renderHours();
}
