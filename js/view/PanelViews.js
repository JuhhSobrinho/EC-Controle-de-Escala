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
  if(u.indexOf('FOLGA')===0) return 'pto';
  if(u==='BASE'||u==='HOTEL'||u==='T.EMB'||u==='RECAP') return 'pto';
  if(u.indexOf('AFAS')===0) return null;
  if(u.indexOf('FERIAS')===0||u.indexOf('FÉRIAS')===0||u.indexOf('Férias')===0) return 'pto';
  // treinamentos/cursos — lista configurável em Tipos de Treinamento (AppState.js)
  if(isTrainingStatus(u)) return 'trein';
  // everything else = project (plataformas, P-xx, PMXL, MV-xx, OCYAN, ENGIE, MISC, etc.)
  if(u.length>0) return 'proj';
  return null;
}
/* Carga (utilização) de um técnico num intervalo de dias: dias trabalhados (embarcado/projeto,
   categoria 'proj') dividido por dias trabalhados + dias de folga (F.EMB ou FOLGA). Outros
   status (DES, MOB, AFASTADO, BASE, HOTEL, RECAP, Férias, treinamento) não entram nem no
   numerador nem no denominador — não fazem parte dessa conta de utilização/não-utilização. */
function computeCarga(t, fromIdx, toIdx){
  var worked=0, folga=0;
  for(var i=fromIdx;i<=toIdx;i++){
    var u=(t.d[i]||'').trim().toUpperCase();
    if(!u) continue;
    if(getCategory(u)==='proj') worked++;
    else if(u.indexOf('F.EMB')===0||u.indexOf('FOLGA')===0) folga++;
  }
  var total=worked+folga;
  return total>0 ? worked/total : 0;
}
function hrsForCat(cat){
  if(cat==='proj')  return 11;
  if(cat==='mob')   return 12;
  if(cat==='trein') return 8;
  if(cat==='pto')   return 8;
  return 0;
}
function fmtHrs(h){
  if(!h) return '—';
  var totalMin=Math.round(h*60);
  var hh=Math.floor(totalMin/60), mm=totalMin%60;
  return hh+'h'+(mm?String(mm).padStart(2,'0')+'m':'');
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

/* Calcula os dados do Resumo de horas para um mês (usado tanto pra desenhar a tabela
   quanto pra exportar a planilha) — semanas do mês, horas por categoria/semana/técnico,
   e os totais por semana e gerais. */
function computeWeeklySummary(year, month){
  var monStart = new Date(year,month,1);
  var monEnd   = new Date(year,month+1,0); // último dia do mês
  // build week list: find Monday of first week
  var cur = new Date(monStart);
  cur.setDate(cur.getDate() - ((cur.getDay()+6)%7)); // back to Monday
  var weeks=[];
  while(cur <= monEnd){
    var wEnd = new Date(cur); wEnd.setDate(wEnd.getDate()+6);
    var ws = new Date(Math.max(cur.getTime(), monStart.getTime()));
    var we = new Date(Math.min(wEnd.getTime(), monEnd.getTime()));
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
  // precompute: for each date index → week index (only dates within the month)
  var dateWeek=[];
  for(var di=0;di<DATES.length;di++){
    var p=DATES[di].split('/');
    if(+p[1]-1===month && +p[2]===year){
      dateWeek.push({di:di,wi:dateToWeekIdx(DATES[di])});
    }
  }
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
      if(!cat) return;
      // usa a hora real importada (escala.hr_reais) quando existir; senão cai na previsão
      var hrs=hrsForCat(cat);
      var realHr=t.hr[dw.di];
      if(realHr){
        var parts=realHr.split(':');
        if(parts.length===2) hrs=parseInt(parts[0])+(parseInt(parts[1])/60);
      }
      data[ti][dw.wi][cat]+=hrs;
    });
  });
  var colTotals=weeks.map(function(){ return {proj:0,mob:0,trein:0,pto:0}; });
  var grandTotals={proj:0,mob:0,trein:0,pto:0};
  var rowTotals=TECS.map(function(){ return {proj:0,mob:0,trein:0,pto:0}; });
  TECS.forEach(function(t,ti){
    weeks.forEach(function(w,wi){
      cats.forEach(function(cat){
        var hrs=data[ti][wi][cat];
        colTotals[wi][cat]+=hrs;
        rowTotals[ti][cat]+=hrs;
        grandTotals[cat]+=hrs;
      });
    });
  });
  return {weeks:weeks, cats:cats, catLabels:catLabels, catCls:catCls, data:data, colTotals:colTotals, grandTotals:grandTotals, rowTotals:rowTotals};
}

function buildWeeklySummary(year, month){
  if(year===undefined || month===undefined){
    if(_wsYear===null){ var d=defaultWeeklySummaryMonth(); _wsYear=d.year; _wsMonth=d.month; }
    year=_wsYear; month=_wsMonth;
  } else {
    _wsYear=year; _wsMonth=month;
  }
  var summary=computeWeeklySummary(year, month);
  var weeks=summary.weeks, cats=summary.cats, catLabels=summary.catLabels, catCls=summary.catCls;
  var data=summary.data, colTotals=summary.colTotals, grandTotals=summary.grandTotals;
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
    +'<select class="form-input" style="width:auto;margin-left:auto;font-size:12px;padding:4px 8px;text-transform:none;letter-spacing:normal;font-weight:400" onchange="changeWeeklySummaryMonth(this.value)">'+monthOpts+'</select>'
    +'<button class="hdr-btn" style="text-transform:none;letter-spacing:normal;font-weight:400" onclick="exportWeeklySummary()" title="Baixar planilha .xlsx com os dados deste mês">'
    +'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>'
    +'Exportar</button>'
    +'<button class="hdr-btn" style="text-transform:none;letter-spacing:normal;font-weight:400" onclick="exportWeeklySummaryPDF()" title="Gerar PDF do resumo de horas deste mês, com utilização">'
    +'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>'
    +'PDF</button></div>';
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
  TECS.forEach(function(t,ti){
    h+='<tr>';
    h+='<td class="wfx">'+t.n+'</td>';
    weeks.forEach(function(w,wi){
      cats.forEach(function(cat,cati){
        var hrs=data[ti][wi][cat];
        var sep=(cati===0)?'week-sep':'';
        var cls=catCls[cat]+' '+(hrs===0?'w-zero':'')+' '+sep;
        h+='<td class="'+cls.trim()+'">'+fmtHrs(hrs)+'</td>';
      });
    });
    // row totals
    cats.forEach(function(cat,cati){
      var hrs=summary.rowTotals[ti][cat];
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

/* Utilização de um bloco de horas por categoria: Horas de Projeto / Horas Totais do período
   (mesmo conceito do "Utilization %" do relatório LATAM Weekly Man Hours Detail). */
function _weeklyUtilization(catsObj, cats){
  var total=cats.reduce(function(s,c){return s+catsObj[c];},0);
  if(total<=0) return null;
  return catsObj.proj/total;
}
function _fmtPct(u){ return u===null ? '—' : Math.round(u*100)+'%'; }

/* Gera uma planilha .xlsx com a mesma estrutura do PDF (por técnico, por semana,
   com Total + Utilização em cada grupo) — pra planilha e PDF baterem número a número. */
function exportWeeklySummary(){
  if(_wsYear===null){ var d=defaultWeeklySummaryMonth(); _wsYear=d.year; _wsMonth=d.month; }
  var year=_wsYear, month=_wsMonth;
  var summary=computeWeeklySummary(year, month);
  var weeks=summary.weeks, cats=summary.cats, catLabels=summary.catLabels;
  var monthLabel=MONTH_NAMES_PT[month]+' '+year;
  var groupW=cats.length+2; // categorias + Total + Utilização
  var totalCols=1+weeks.length*groupW+groupW;

  function groupHeaderRow(){
    var arr=[]; cats.forEach(function(c){ arr.push(catLabels[c]); });
    arr.push('Total','Utilização'); return arr;
  }
  function groupDataRow(catsObj){
    var arr=[]; cats.forEach(function(c){ arr.push(fmtHrs(catsObj[c])); });
    var total=cats.reduce(function(s,c){return s+catsObj[c];},0);
    arr.push(fmtHrs(total), _fmtPct(_weeklyUtilization(catsObj,cats)));
    return arr;
  }

  var titleRow=['Resumo de Horas — '+monthLabel];
  var subRow=['Gerado em '+new Date().toLocaleDateString('pt-BR')+' · '+TECS.length+' técnicos · Utilização = Horas de Projeto / Horas Totais do período'];
  var head1=['Técnico'];
  weeks.forEach(function(w){ head1.push(w.label); for(var i=1;i<groupW;i++)head1.push(''); });
  head1.push('Total do mês'); for(var i=1;i<groupW;i++)head1.push('');
  var head2=[''];
  weeks.forEach(function(){ head2=head2.concat(groupHeaderRow()); });
  head2=head2.concat(groupHeaderRow());

  var rows=[titleRow,subRow,head1,head2];
  TECS.forEach(function(t,ti){
    var row=[t.n];
    weeks.forEach(function(w,wi){ row=row.concat(groupDataRow(summary.data[ti][wi])); });
    row=row.concat(groupDataRow(summary.rowTotals[ti]));
    rows.push(row);
  });
  var totalsRow=['Total geral'];
  weeks.forEach(function(w,wi){ totalsRow=totalsRow.concat(groupDataRow(summary.colTotals[wi])); });
  totalsRow=totalsRow.concat(groupDataRow(summary.grandTotals));
  rows.push(totalsRow);

  var wb=XLSX.utils.book_new();
  var ws=XLSX.utils.aoa_to_sheet(rows);

  // mescla título/subtítulo (linha inteira), cabeçalho "Técnico" (2 linhas) e cada
  // grupo de semana/total do mês (categorias + Total + Utilização)
  var merges=[
    {s:{r:0,c:0},e:{r:0,c:totalCols-1}},
    {s:{r:1,c:0},e:{r:1,c:totalCols-1}},
    {s:{r:2,c:0},e:{r:3,c:0}}
  ];
  var col=1;
  weeks.forEach(function(){ merges.push({s:{r:2,c:col},e:{r:2,c:col+groupW-1}}); col+=groupW; });
  merges.push({s:{r:2,c:col},e:{r:2,c:col+groupW-1}});
  ws['!merges']=merges;
  ws['!cols']=[{wch:28}].concat(new Array(totalCols-1).fill({wch:12}));

  XLSX.utils.book_append_sheet(wb, ws, monthLabel.slice(0,31));
  var fname='resumo-horas-'+MONTH_NAMES_PT[month].toLowerCase()+'-'+year+'.xlsx';
  XLSX.writeFile(wb, fname);
  toast('Planilha gerada: '+fname, '#1fc98e');
}

/* Gera um PDF (via impressão do navegador) do Resumo de horas do mês exibido,
   no formato inspirado no relatório "LATAM Weekly Man Hours Detail": por técnico,
   por semana, com uma coluna de Utilização (Horas de Projeto / Horas Totais). */
function exportWeeklySummaryPDF(){
  if(_wsYear===null){ var d=defaultWeeklySummaryMonth(); _wsYear=d.year; _wsMonth=d.month; }
  var year=_wsYear, month=_wsMonth;
  var summary=computeWeeklySummary(year, month);
  var weeks=summary.weeks, cats=summary.cats, catLabels=summary.catLabels;
  var monthLabel=MONTH_NAMES_PT[month]+' '+year;

  function catHeaderGroup(){
    var s='';
    cats.forEach(function(c){ s+='<th>'+catLabels[c]+'</th>'; });
    s+='<th>Total</th><th>Utilização</th>';
    return s;
  }
  var head1='<th rowspan="2">Técnico</th>';
  weeks.forEach(function(w){ head1+='<th colspan="'+(cats.length+2)+'">'+w.label+'</th>'; });
  head1+='<th colspan="'+(cats.length+2)+'">Total do mês</th>';
  var head2='';
  weeks.forEach(function(){ head2+=catHeaderGroup(); });
  head2+=catHeaderGroup();

  function rowCells(catsObj){
    var s='';
    cats.forEach(function(c){ s+='<td>'+fmtHrs(catsObj[c])+'</td>'; });
    var total=cats.reduce(function(sum,c){return sum+catsObj[c];},0);
    s+='<td>'+fmtHrs(total)+'</td><td>'+_fmtPct(_weeklyUtilization(catsObj,cats))+'</td>';
    return s;
  }

  var bodyRows='';
  TECS.forEach(function(t,ti){
    var row='<tr><td class="name">'+t.n+'</td>';
    weeks.forEach(function(w,wi){ row+=rowCells(summary.data[ti][wi]); });
    row+=rowCells(summary.rowTotals[ti]);
    row+='</tr>';
    bodyRows+=row;
  });
  var totalRow='<tr class="totals"><td>Total geral</td>';
  weeks.forEach(function(w,wi){ totalRow+=rowCells(summary.colTotals[wi]); });
  totalRow+=rowCells(summary.grandTotals);
  totalRow+='</tr>';

  var html='<!doctype html><html><head><meta charset="utf-8"><title>Resumo de Horas - '+monthLabel+'</title>'
    +'<style>'
    +'body{font-family:Arial,Helvetica,sans-serif;margin:20px;color:#111}'
    +'h1{font-size:17px;margin-bottom:4px}'
    +'.sub{font-size:11px;color:#555;margin-bottom:14px}'
    +'table{border-collapse:collapse;width:100%;font-size:9px}'
    +'th,td{border:1px solid #999;padding:3px 5px;text-align:right;white-space:nowrap}'
    +'th{background:#eee;text-align:center}'
    +'td.name{text-align:left;font-weight:600}'
    +'tr.totals td{font-weight:700;background:#f5f5f5}'
    +'@media print{@page{size:landscape;margin:10mm}}'
    +'</style></head><body>'
    +'<h1>Resumo de Horas — '+monthLabel+'</h1>'
    +'<div class="sub">Gerado em '+new Date().toLocaleDateString('pt-BR')+' · '+TECS.length+' técnicos · Utilização = Horas de Projeto / Horas Totais do período (baseado no LATAM Weekly Man Hours Detail)</div>'
    +'<table><thead><tr>'+head1+'</tr><tr>'+head2+'</tr></thead><tbody>'+bodyRows+totalRow+'</tbody></table>'
    +'</body></html>';

  var win=window.open('', '_blank');
  if(!win){ toast('Habilite pop-ups para gerar o PDF', '#e85b5b'); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(function(){ try{ win.focus(); win.print(); }catch(e){} }, 350);
}

/* ── DASHBOARD ── */
var dashS=0,dashE=DATES.length-1,pieChart=null,lineChart=null;
function computeKpis(){
  var idx=[];for(var i=dashS;i<=dashE;i++)idx.push(i);
  var valid=TECS.filter(function(t){return t.p>0;});
  var avg=valid.length?valid.reduce(function(a,t){return a+t.p;},0)/valid.length*100:0;
  var acima=TECS.filter(function(t){return t.p>0.55;}).length;
  var ev=_countEvents(TECS,dashS,dashE);
  // situação da equipe HOJE
  var hoje={emb:0,folga:0,mob:0,af:0};
  TECS.forEach(function(t){
    var k=_eventKey(t.d[T_IDX]), pk=_pieKind(t.d[T_IDX]);
    if(k==='MOB') hoje.mob++;
    else if(k==='FEMB'||pk==='DISP') hoje.folga++;
    else if(k) hoje.emb++;
    else if(pk==='AF') hoje.af++;
  });
  // ocupação = % da equipe embarcada (EMB/projeto) por dia, mesma regra do gráfico de Ocupação
  // (dias em que ninguém tem status lançado ficam de fora, senão o ano "completo" dilui a média com meses vazios)
  var occSum=0, occN=0, occPk=0, occPkD='—';
  idx.forEach(function(i){
    var c=0, any=false;
    TECS.forEach(function(t){var u=(t.d[i]||'').trim().toUpperCase(); if(u){any=true; if(getCategory(u)==='proj') c++;}});
    if(!any) return;
    var pc=TECS.length?c/TECS.length*100:0;
    occSum+=pc; occN++; if(pc>occPk){occPk=pc;occPkD=DATES[i].slice(0,5);}
  });
  var occAvg=occN?occSum/occN:0;
  document.getElementById('rangeInfo').textContent=idx.length+' dia'+(idx.length!==1?'s':'');
  function chip(color,n,lbl){return '<span class="kpi-chip"><i style="background:'+color+'"></i>'+n+' '+lbl+'</span>';}
  var cards=[
    {lb:'Embarques',val:ev.emb,ml:'#a78bfa',
      nt:chip('#e85b5b',ev.done,ev.done===1?'finalizado':'finalizados')+chip('#2f4bd0',ev.on,'em andamento')+chip('#eab308',ev.next,ev.next===1?'previsto':'previstos'),
      tip:'Técnicos que subiram no mesmo dia pro mesmo projeto contam como 1 embarque'},
    {lb:'Embarcados hoje',val:hoje.emb,ml:'#2f4bd0',nt:'de '+TECS.length+' técnicos · '+(TECS.length?Math.round(hoje.emb/TECS.length*100):0)+'%'},
    {lb:'Ocupação média',val:occAvg.toFixed(1)+'%',ml:'#4a9eff',nt:'pico '+occPk.toFixed(0)+'% em '+occPkD},
    {lb:'Duração média',val:ev.avgDur===null?'—':ev.avgDur.toFixed(1)+' d',ml:'#1fc98e',nt:'embarques finalizados'},
    {lb:'Desembarques',val:ev.des,ml:'#fb923c',nt:hoje.folga+' técnico'+(hoje.folga!==1?'s':'')+' de folga hoje'},
    {lb:'Mobilizações',val:ev.mob,ml:'#7dd3fc',nt:hoje.mob+' em mobilização hoje'},
    {lb:'Carga média',val:avg.toFixed(1)+'%',nt:'ideal = 50%',ml:avg>55?'#e85b5b':avg<45?'#f5a623':'#1fc98e'},
    {lb:'Sobrecarregados',val:acima,nt:'> 55% carga',ml:'#e85b5b'}
  ];
  return cards;
}
function buildMetrics(){
  document.getElementById('metrics').innerHTML=computeKpis().map(function(c){
    return '<div class="metric-card" style="--ml:'+c.ml+'"'+(c.tip?' title="'+escAttr(c.tip)+'"':'')+'><div class="metric-label">'+c.lb+'</div><div class="metric-value" style="color:'+c.ml+'">'+c.val+'</div><div class="metric-note">'+c.nt+'</div></div>';
  }).join('');
}
var _cargaSelectedTi=null; // ti clicado na lista de Carga, ou null = todos os técnicos (filtra a Distribuição de status)
function selectCargaTec(ti){
  _cargaSelectedTi = (_cargaSelectedTi===ti) ? null : ti; // clicar de novo no mesmo nome desmarca
  buildCarga();
  buildPie();
}
/* ── CARGA POR TÉCNICO (aba "Carga"): tabela com situação de hoje, próximo evento, dias no período,
   plataformas e carga. Clicar na linha expande o histórico do técnico e filtra a Distribuição de status. ── */
var _cargaSort={k:'p',d:-1}, _cargaQ='', _cargaSit='';
var CARGA_MIX=[['EMBPROJ','Embarcado','#2f4bd0'],['FEMB','Folga emb.','#1fc98e'],['DES','Desemb.','#7dd3fc'],['DISP','FOLGA','#fb923c'],['MOB','Mobiliz.','#4a9eff'],['AF','Afastado','#e85b5b'],['BASE','Base/Hotel','#64748b']];
function _isEmbKey(k){return !!k&&k!=='MOB'&&k!=='FEMB';}
function _cargaData(){
  var s=dashS, e=dashE;
  return TECS.map(function(t,ti){
    var r={ti:ti,n:t.n,p:computeCarga(t,s,e),embD:0,folgaD:0,embarques:0,plats:{},mix:{},blocks:[],sit:null,next:'—',grp:'outros'};
    CARGA_MIX.forEach(function(m){r.mix[m[0]]=0;});
    var key=null, start=null;
    for(var i=s;i<=e+1;i++){
      var raw=i<=e?(t.d[i]||'').trim().toUpperCase():'';
      var kd=raw?_pieKind(raw):null;
      var k=i<=e?_eventKey(t.d[i]):null;
      if(i<=e){
        if(kd) r.mix[kd]++;
        if(_isEmbKey(k)){ r.embD++; var pn=_projNorm(raw); if(pn) r.plats[pn]=(r.plats[pn]||0)+1; }
        if(kd==='FEMB'||kd==='DISP') r.folgaD++;
      }
      if(key!==null&&k!==key&&_isEmbKey(key)){
        var s0=start, end=i-1;
        while(s0>0&&_eventKey(t.d[s0-1])===key) s0--;
        while(end+1<DATES.length&&_eventKey(t.d[end+1])===key) end++;
        r.embarques++;
        r.blocks.push({key:key,s0:s0,end:end,st:(s0<=T_IDX&&end>=T_IDX)?'on':(s0>T_IDX?'next':'done')});
      }
      if(k!==key) start=i;
      key=k;
    }
    // situação de hoje + há quantos dias está nela
    var u0=(t.d[T_IDX]||'').trim().toUpperCase(), k0=_eventKey(t.d[T_IDX]), pk0=u0?_pieKind(u0):null;
    if(u0){
      var n=1; while(T_IDX-n>=0&&(t.d[T_IDX-n]||'').trim().toUpperCase()===u0) n++;
      r.sit={txt:t.d[T_IDX].trim(),cls:badgeCls(u0),days:n};
    }
    r.grp=_isEmbKey(k0)?'emb':(k0==='MOB'?'mob':(pk0==='FEMB'||pk0==='DISP'?'folga':(pk0==='AF'?'af':'outros')));
    // próximo evento: se está embarcado, quando desembarca; senão, quando sobe de novo
    var lastIdx=DATES.length-1;
    if(_isEmbKey(k0)){
      var j=T_IDX+1; while(j<=lastIdx&&_isEmbKey(_eventKey(t.d[j]))) j++;
      if(j>lastIdx) r.next='—';
      else if((t.d[j]||'').trim()) r.next='desembarca '+DATES[j].slice(0,5);
      else r.next='escala até '+DATES[j-1].slice(0,5);
    }else{
      var q=T_IDX+1; while(q<=lastIdx&&!_isEmbKey(_eventKey(t.d[q]))) q++;
      r.next=q<=lastIdx?'sobe '+DATES[q].slice(0,5)+' · '+escAttr((t.d[q]||'').trim()):'—';
    }
    return r;
  });
}
function buildCarga(){
  var el=document.getElementById('cargaTbl');
  if(!el) return;
  var rows=_cargaData();
  var q=_cargaQ.trim().toLowerCase();
  rows=rows.filter(function(r){
    if(_cargaSit&&r.grp!==_cargaSit) return false;
    if(!q) return true;
    return r.n.toLowerCase().indexOf(q)>=0||Object.keys(r.plats).some(function(p){return p.toLowerCase().indexOf(q)>=0;})||(r.sit&&r.sit.txt.toLowerCase().indexOf(q)>=0);
  });
  var k=_cargaSort.k, d=_cargaSort.d;
  rows.sort(function(a,b){
    if(k==='n') return d*a.n.localeCompare(b.n);
    return d*(a[k]-b[k])||a.n.localeCompare(b.n);
  });
  function th(key,lbl,cls){
    var on=_cargaSort.k===key;
    return '<th class="'+(cls||'')+(on?' sorted':'')+'" onclick="sortCarga(&quot;'+key+'&quot;)">'+lbl+(on?(_cargaSort.d>0?' ▲':' ▼'):'')+'</th>';
  }
  var h='<table class="carga-tbl"><thead><tr>'+th('n','Técnico')+'<th>Hoje</th><th>Próximo</th>'
    +th('embD','Emb.','r')+th('folgaD','Folga','r')+th('embarques','Embarques','r')+'<th class="plats">Plataformas</th>'+th('p','Carga','r')+'</tr></thead><tbody>';
  if(!rows.length) h+='<tr><td colspan="8" class="carga-empty">Nenhum técnico encontrado</td></tr>';
  rows.forEach(function(r){
    var open=_cargaSelectedTi===r.ti, gcol=pctCol(r.p);
    var plats=Object.keys(r.plats).sort(function(a,b){return r.plats[b]-r.plats[a];});
    var chips=plats.slice(0,3).map(function(p){return '<span class="carga-chip">'+escAttr(p)+' <b>'+r.plats[p]+'d</b></span>';}).join('')+(plats.length>3?'<span class="carga-chip more">+'+(plats.length-3)+'</span>':'');
    h+='<tr class="carga-row'+(open?' sel':'')+'" onclick="selectCargaTec('+r.ti+')" title="Ver histórico e filtrar a Distribuição de status">'
      +'<td class="carga-name">'+escAttr(r.n)+'</td>'
      +'<td>'+(r.sit?'<span class="b '+r.sit.cls+'">'+escAttr(r.sit.txt)+'</span> <span class="carga-days">'+r.sit.days+'d</span>':'<span class="carga-days">—</span>')+'</td>'
      +'<td class="carga-next">'+r.next+'</td>'
      +'<td class="r mono">'+r.embD+'</td><td class="r mono">'+r.folgaD+'</td><td class="r mono">'+r.embarques+'</td>'
      +'<td class="plats">'+(chips||'<span class="carga-days">—</span>')+'</td>'
      +'<td class="r"><span class="carga-bar"><i style="width:'+Math.min(r.p*100,100).toFixed(0)+'%;background:'+gcol+'"></i></span><span class="mono" style="color:'+gcol+'">'+(r.p*100).toFixed(0)+'%</span></td></tr>';
    if(open){
      var tot=0; CARGA_MIX.forEach(function(m){tot+=r.mix[m[0]];});
      var used=CARGA_MIX.filter(function(m){return r.mix[m[0]]>0;});
      var seg=used.map(function(m){return '<i style="width:'+(r.mix[m[0]]/tot*100).toFixed(1)+'%;background:'+m[2]+'" title="'+m[1]+': '+r.mix[m[0]]+'d"></i>';}).join('');
      var leg=used.map(function(m){return '<span class="kpi-chip"><i style="background:'+m[2]+'"></i>'+m[1]+' '+r.mix[m[0]]+'d</span>';}).join('');
      var blk=r.blocks.length?r.blocks.map(function(b){
        var len=b.end-b.s0+1;
        return '<div class="carga-blk"><b>'+escAttr(b.key)+'</b><span>'+DATES[b.s0].slice(0,5)+' → '+DATES[b.end].slice(0,5)+' · '+len+'d</span><span class="proj-st st-'+b.st+'">'+PROJ_ST[b.st]+'</span></div>';
      }).join(''):'<div class="carga-days">Nenhum embarque no período</div>';
      h+='<tr class="carga-detail"><td colspan="8"><div class="carga-mixbar">'+seg+'</div><div class="carga-legend">'+(leg||'<span class="carga-days">Sem status no período</span>')+'</div><div class="carga-blks">'+blk+'</div></td></tr>';
    }
  });
  el.innerHTML=h+'</tbody></table>';
}
function sortCarga(k){
  _cargaSort=_cargaSort.k===k?{k:k,d:-_cargaSort.d}:{k:k,d:k==='n'?1:-1};
  buildCarga();
}
function setCargaFilter(){
  _cargaQ=document.getElementById('cargaSearch').value;
  _cargaSit=document.getElementById('cargaSit').value;
  buildCarga();
}
var _loadTab='carga';
function switchLoadTab(tab, btn){
  _loadTab=tab;
  document.querySelectorAll('.chart-card .subtab-btn[data-tab]').forEach(function(b){b.classList.remove('active');});
  if(btn) btn.classList.add('active');
  document.getElementById('cargaWrap').style.display = tab==='carga' ? '' : 'none';
  document.getElementById('loadGrid').classList.toggle('carga-wide', tab==='carga');
  document.getElementById('barsOvertime').style.display = tab==='extras' ? '' : 'none';
  document.getElementById('overtimeFilterRow').style.display = tab==='extras' ? 'flex' : 'none';
  if(tab!=='extras') _overtimeSelectedTi=null;
  if(tab!=='carga') _cargaSelectedTi=null;
  refreshStatusPie();
  buildEmbarquePlaces();
}
/* Alterna qual gráfico aparece no card "Distribuição de status": o normal (por status do dia)
   quando a aba ativa é "Carga", ou o de horas extras (50%/100%) quando é "Horas Extras" —
   nesse segundo caso, clicar no nome de alguém na lista filtra o gráfico só pra essa pessoa. */
function refreshStatusPie(){
  if(_loadTab==='extras') buildOvertimePie(); else buildPie();
}
function _hhmmToDec(s){
  if(!s) return 0;
  var p=s.split(':');
  return p.length===2 ? parseInt(p[0])+(parseInt(p[1])/60) : 0;
}
var _overtimeFilter='total';
function setOvertimeFilter(mode, btn){
  _overtimeFilter=mode;
  document.querySelectorAll('.subtab-btn[data-mode]').forEach(function(b){b.classList.remove('active');});
  if(btn) btn.classList.add('active');
  buildOvertimeBars();
}
/* Horas extras, somadas no período do dashboard. Só considera dias com hora real importada.
   Split pela regra trabalhista:
   - dia normal (folga_override desligado): só o EXCEDENTE sobre a previsão (hrsForStatus)
     conta como hora extra, a 50% — ex. previsto 11:00, trabalhou 11:30 → 0:30 extra.
   - dia marcado como "Dia de folga" (folga_override ligado — inclui F.EMB e, na maioria dos
     casos, DES.): conta TODA hora trabalhada nesse dia a 100%, não só o excedente — não tem
     "previsão normal" num dia de folga, então qualquer hora ali já é extra por inteiro. */
function _overtimeSplit(t, fromIdx, toIdx){
  var extra50=0, extra100=0;
  for(var i=fromIdx;i<=toIdx;i++){
    var realHr=t.hr[i];
    if(!realHr) continue;
    var realDec=_hhmmToDec(realHr);
    if(t.fo[i]){
      if(realDec>0.01) extra100+=realDec;
      continue;
    }
    var prevDec=_hhmmToDec(hrsForStatus((t.d[i]||'').trim().toUpperCase()));
    var diff=realDec-prevDec;
    if(diff>0.01) extra50+=diff;
  }
  return {extra50:extra50, extra100:extra100, total:extra50+extra100};
}
var _overtimeSelectedTi=null; // ti clicado na lista de Horas Extras, ou null = todos os técnicos
function selectOvertimeTec(ti){
  _overtimeSelectedTi = (_overtimeSelectedTi===ti) ? null : ti; // clicar de novo no mesmo nome desmarca
  buildOvertimeBars();
  buildOvertimePie();
  buildEmbarquePlaces();
}
/* Locais/projetos (embarcado ou plataforma — categoria 'proj') em que o técnico selecionado
   ficou no período — um bloco por sequência CONTÍNUA no mesmo local (não soma tudo junto),
   com o período exato (de/até) e a contagem de dias. Se ele voltou pro mesmo local em outra
   leva depois, aparece como um segundo bloco separado, com seu próprio período. Só aparece
   com um técnico selecionado na lista de Horas Extras. */
function _placesBreakdown(t, fromIdx, toIdx){
  var blocks=[], curPlace=null, curStart=null;
  for(var i=fromIdx; i<=toIdx+1; i++){
    var u = i<=toIdx ? (t.d[i]||'').trim().toUpperCase() : '';
    var place = (u && getCategory(u)==='proj') ? u : null;
    if(place!==curPlace){
      if(curPlace!==null) blocks.push({place:curPlace, fromIdx:curStart, toIdx:i-1, days:i-curStart});
      curPlace=place; curStart=i;
    }
  }
  return blocks.sort(function(a,b){return a.fromIdx-b.fromIdx;});
}
function buildEmbarquePlaces(){
  var el=document.getElementById('embarquePlaces');
  if(_overtimeSelectedTi===null || _loadTab!=='extras'){ el.style.display='none'; el.innerHTML=''; return; }
  var t=TECS[_overtimeSelectedTi];
  var places=_placesBreakdown(t, dashS, dashE);
  el.style.display='block';
  var header='<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Locais embarcado no período — '+t.n.split(' ').slice(0,2).join(' ')+'</div>';
  if(!places.length){
    el.innerHTML=header+'<div style="font-size:12px;color:var(--text3)">Nenhum dia embarcado/projeto no período</div>';
    return;
  }
  var max=Math.max.apply(null, places.map(function(p){return p.days;}));
  el.innerHTML=header+places.map(function(p){
    var w=(p.days/max*100).toFixed(1);
    var fromDp=DATES[p.fromIdx].split('/'), toDp=DATES[p.toIdx].split('/');
    var range = p.fromIdx===p.toIdx ? fromDp[0]+'/'+fromDp[1] : fromDp[0]+'/'+fromDp[1]+' – '+toDp[0]+'/'+toDp[1];
    return '<div class="hbar-row"><div class="hbar-name">'+p.place+'</div>'
      +'<div class="hbar-track"><div class="hbar-fill" style="width:'+w+'%;background:#2f4bd0"></div></div>'
      +'<div class="hbar-pct" style="width:auto;white-space:nowrap">'+range+' · '+p.days+' dia'+(p.days!==1?'s':'')+'</div></div>';
  }).join('');
}
function buildOvertimeBars(){
  var data=TECS.map(function(t,ti){
    var s=_overtimeSplit(t, dashS, dashE);
    var val = _overtimeFilter==='50' ? s.extra50 : _overtimeFilter==='100' ? s.extra100 : s.total;
    return {ti:ti, n:t.n, extra:val};
  }).filter(function(d){return d.extra>0.01;}).sort(function(a,b){return b.extra-a.extra;});

  var el=document.getElementById('barsOvertime');
  if(!data.length){
    var emptyMsg = _overtimeFilter==='50' ? 'Nenhuma hora extra de 50% no período'
      : _overtimeFilter==='100' ? 'Nenhuma hora extra de 100% no período'
      : 'Nenhuma hora extra no período (precisa de horas reais importadas acima da previsão)';
    el.innerHTML='<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px">'+emptyMsg+'</div>';
    return;
  }
  var max=data[0].extra;
  var barColor = _overtimeFilter==='50' ? '#eab308' : '#e85b5b'; // 50%=amarelo, 100%/total=vermelho
  el.innerHTML=data.map(function(d){
    var w=(d.extra/max*100).toFixed(1);
    var nm=d.n.split(' ').slice(0,2).join(' ');
    var sel=_overtimeSelectedTi===d.ti?' selected':'';
    return '<div class="hbar-row'+sel+'"><div class="hbar-name" title="Filtrar o gráfico por '+d.n+'" onclick="selectOvertimeTec('+d.ti+')" style="cursor:pointer">'+nm+'</div>'
      +'<div class="hbar-track"><div class="hbar-fill" style="width:'+w+'%;background:'+barColor+'"></div></div>'
      +'<div class="hbar-pct">'+fmtHrs(d.extra)+'</div></div>';
  }).join('');
}
var DAY_BAR_LEGEND=[
  {color:'#2f4bd0', label:'Normal'},
  {color:'#eab308', label:'50%'},
  {color:'#e85b5b', label:'100%'},
  {color:'#4a9eff', label:'Mobilização'},
  {color:'#64748b', label:'Folga'}
];
function buildOvertimePie(){
  var titleEl=document.getElementById('pieTitle');
  var canvasEl=document.getElementById('pieC'), msgEl=document.getElementById('pieEmptyMsg');
  var legendEl=document.getElementById('dayBarLegend');
  if(pieChart){pieChart.destroy();pieChart=null;}

  // com um técnico selecionado: um gráfico de barras, uma barra por dia com previsão de horas
  // definida no período (embarcado/projeto, BASE/HOTEL, DES., MOB., F.EMB — cada um com seu
  // próprio limite via hrsForStatus, ex. BASE são 8h e não 11h) — dá pra ver dia a dia qual
  // teve hora extra ou não, com uma linha guia na altura da previsão daquele dia específico.
  if(_overtimeSelectedTi!==null){
    var t=TECS[_overtimeSelectedTi];
    if(titleEl) titleEl.textContent='Horas por dia — '+t.n.split(' ').slice(0,2).join(' ');
    var labels=[], values=[], colors=[], guide=[], statuses=[];
    for(var i=dashS;i<=dashE;i++){
      var u=(t.d[i]||'').trim().toUpperCase();
      if(!u) continue;
      var prevStr=hrsForStatus(u);
      if(!prevStr) continue; // ex: AFASTADO, sem previsão de horas definida
      var dp=DATES[i].split('/');
      var prevDec=_hhmmToDec(prevStr);
      var realHr=t.hr[i];
      var realDec = realHr ? _hhmmToDec(realHr) : prevDec; // sem hora real importada, mostra a previsão
      labels.push(dp[0]+'/'+dp[1]);
      values.push(+realDec.toFixed(2));
      guide.push(prevDec);
      statuses.push(t.d[i]);
      // dia de folga: QUALQUER hora trabalhada é extra a 100%, não só o excedente sobre a previsão
      var worked = realHr && realDec>0.01;
      var isRestStatus = u.indexOf('F.EMB')===0 || u.indexOf('FOLGA')===0;
      var isMob = u.indexOf('MOB')===0; // só MOB. (não DES. — getCategory agrupa os dois como 'mob', mas aqui é só mobilização mesmo)
      var isOvertime = worked && (t.fo[i] ? true : (realDec-prevDec)>0.01);
      var color;
      if(isOvertime) color = !t.fo[i] ? '#eab308' : (isMob ? '#4a9eff' : '#e85b5b');
      else if(!worked && isRestStatus) color = '#64748b'; // folga de fato (não trabalhou) — cinza, diferente do azul de dia trabalhado
      else color = isMob ? '#4a9eff' : '#2f4bd0'; // MOB. normal também usa o azul mais claro, não o azul padrão de embarcado/projeto
      colors.push(color);
    }
    if(!labels.length){
      canvasEl.style.display='none';
      msgEl.style.display='flex';
      msgEl.textContent='Nenhum dia com previsão de horas desse técnico no período';
      legendEl.style.display='none';
      return;
    }
    canvasEl.style.display='';
    msgEl.style.display='none';
    legendEl.style.display='flex';
    legendEl.innerHTML=DAY_BAR_LEGEND.map(function(l){
      return '<div style="display:flex;align-items:center;gap:4px;white-space:nowrap"><span style="width:8px;height:8px;border-radius:2px;background:'+l.color+';flex-shrink:0;display:inline-block"></span>'+l.label+'</div>';
    }).join('');
    pieChart=new Chart(canvasEl,{
      data:{labels:labels, datasets:[
        {type:'bar', label:'Horas trabalhadas', data:values, backgroundColor:colors, borderRadius:3, order:2, barPercentage:0.7},
        {type:'line', label:'Previsto', data:guide, borderColor:'#8a91a8', borderDash:[5,4], borderWidth:1.5, pointRadius:0, fill:false, order:1}
      ]},
      options:{responsive:true,maintainAspectRatio:false,
        // 'index'+intersect:false: o tooltip é escolhido pelo dia (categoria no eixo x) mais
        // próximo do cursor, não pelo ponto de dado mais próximo em qualquer direção — sem
        // isso, passar o mouse perto da base de uma barra podia "pegar" o topo de uma barra
        // vizinha (mais alta) por estar geometricamente mais perto, mostrando o dia errado.
        interaction:{mode:'index', axis:'x', intersect:false},
        scales:{
          x:{ticks:{color:'#8a91a8',font:{size:9},maxRotation:0,autoSkip:true}, grid:{display:false}},
          y:{ticks:{color:'#8a91a8',font:{size:10}}, grid:{color:'rgba(255,255,255,.05)'}, beginAtZero:true}
        },
        plugins:{
          legend:{display:false},
          tooltip:{mode:'index', intersect:false, callbacks:{label:function(ctx){
            var prefix = ctx.dataset.type==='line' ? 'Previsto: ' : 'Trabalhado: ';
            var statusTxt = statuses[ctx.dataIndex] ? ' ('+statuses[ctx.dataIndex]+')' : '';
            return prefix+fmtHrs(ctx.parsed.y)+statusTxt;
          }}}
        }
      }
    });
    return;
  }

  legendEl.style.display='none';
  var tot50=0, tot100=0;
  TECS.forEach(function(t){
    var s=_overtimeSplit(t, dashS, dashE);
    tot50+=s.extra50; tot100+=s.extra100;
  });
  var total=tot50+tot100;
  if(titleEl) titleEl.textContent='Horas extras — todos os técnicos';
  if(total<=0.01){
    canvasEl.style.display='none';
    msgEl.style.display='flex';
    msgEl.textContent='Nenhuma hora extra no período';
    return;
  }
  canvasEl.style.display='';
  msgEl.style.display='none';
  pieChart=new Chart(canvasEl,{type:'doughnut',plugins:[donutHoverPlugin],
    data:{labels:['Hora extra 50%','Hora extra 100%'],
      datasets:[{data:[+tot50.toFixed(2),+tot100.toFixed(2)],backgroundColor:['#eab308','#e85b5b'],borderWidth:0,hoverOffset:4}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
      plugins:{legend:{position:'right',onHover:_donutLegendHover,onLeave:_donutLegendLeave,labels:{color:'#8a91a8',font:{size:11,family:'Inter'},boxWidth:10,padding:10,
        generateLabels:function(ch){var ds=ch.data.datasets[0];return ch.data.labels.map(function(l,i){
          var v=ds.data[i], pct=total>0?Math.round(v/total*100):0;
          return {text:l+'  '+fmtHrs(v)+' ('+pct+'%)',fillStyle:ds.backgroundColor[i],strokeStyle:'transparent',fontColor:'#8a91a8',index:i};
        });}}},
        tooltip:{callbacks:{label:function(ctx){return ctx.label+': '+fmtHrs(ctx.parsed);}}}}
    }
  });
}
/* O <html> usa CSS zoom (.8): o Chart.js calcula a posição do mouse em px "visuais" (já reduzidos pelo
   zoom) mas desenha em px de layout, então o hit-test ficava deslocado (tooltip errado/ausente, pior
   quanto mais longe da origem do gráfico). Aqui o x/y do evento é reescalado pela razão
   rect/layout do canvas; com zoom 1 a razão é 1 e nada muda. Vale pra todos os gráficos. */
Chart.register({
  id:'cssZoomFix',
  beforeEvent:function(chart,args){
    var e=args.event, c=chart.canvas;
    if(e.x==null||e.y==null||!c.clientWidth||!c.clientHeight) return;
    var r=c.getBoundingClientRect(), zx=r.width/c.clientWidth, zy=r.height/c.clientHeight;
    if(Math.abs(zx-1)<0.001&&Math.abs(zy-1)<0.001) return;
    e.x=e.x/zx; e.y=e.y/zy;
  }
});
/* Hover das rosquinhas: o do Chart.js só mostra o tooltip com o mouse EXATAMENTE em cima do arco,
   então fatia fina, borda e o vão do meio "perdiam" o dado (e o hoverOffset fazia piscar na borda).
   Aqui a fatia é escolhida pelo ÂNGULO do mouse, com folga em volta do anel; passar o mouse na
   legenda também destaca a fatia e mostra o tooltip. */
function _setDonutActive(chart, idx, pos){
  var cur=chart.getActiveElements();
  if(idx<0){
    if(cur.length){ chart.setActiveElements([]); chart.tooltip.setActiveElements([],{x:0,y:0}); chart.update('none'); }
    return;
  }
  if(cur.length===1&&cur[0].index===idx) return;
  var act=[{datasetIndex:0,index:idx}];
  chart.setActiveElements(act);
  chart.tooltip.setActiveElements(act,pos);
  chart.update('none');
}
var donutHoverPlugin={
  id:'donutHover',
  afterEvent:function(chart,args){
    var e=args.event;
    if(e.type==='mouseout'){ _setDonutActive(chart,-1); return; }
    if(e.type!=='mousemove'||e.x==null) return;
    var arcs=chart.getDatasetMeta(0).data, lg=chart.legend;
    if(!arcs.length) return;
    if(lg&&e.x>=lg.left&&e.x<=lg.right&&e.y>=lg.top&&e.y<=lg.bottom) return;
    var a0=arcs[0], dx=e.x-a0.x, dy=e.y-a0.y, d=Math.sqrt(dx*dx+dy*dy), idx=-1;
    if(d>=a0.innerRadius-14&&d<=a0.outerRadius+16){
      var ang=Math.atan2(dy,dx);
      while(ang<a0.startAngle) ang+=Math.PI*2;
      for(var i=0;i<arcs.length;i++){
        if(arcs[i].endAngle-arcs[i].startAngle<=0) continue;
        if(ang>=arcs[i].startAngle&&ang<=arcs[i].endAngle){ idx=i; break; }
      }
    }
    _setDonutActive(chart,idx,{x:e.x,y:e.y});
  }
};
function _donutLegendHover(e,item,legend){
  var arc=legend.chart.getDatasetMeta(0).data[item.index];
  if(arc) _setDonutActive(legend.chart,item.index,arc.tooltipPosition());
}
function _donutLegendLeave(e,item,legend){ _setDonutActive(legend.chart,-1); }
/* Classificação de um status nas fatias da rosquinha de Distribuição de status. */
function _pieKind(v){
  var u=(v||'').trim().toUpperCase();
  if(!u) return null;
  if(u.indexOf('F.EMB')===0) return 'FEMB';
  if(u==='DES'||u==='DES.') return 'DES';
  if(u.indexOf('FOLGA')===0) return 'DISP';
  if(u.indexOf('MOB')===0) return 'MOB';
  if(u.indexOf('AFAS')===0) return 'AF';
  if(u==='BASE'||u==='HOTEL'||u==='T.EMB'||u==='RECAP') return 'BASE';
  return 'EMBPROJ';
}
/* Conta EVENTOS (não dias) de embarque e mobilização no período: técnicos que subiram/mobilizaram
   no MESMO dia (e, no embarque, pro mesmo projeto) contam como um evento só — 3 técnicos subindo
   juntos = 1 embarque. O dia de início é o real (olha pra trás se o bloco começou antes do período).
   Embarque = EMB ou projeto/plataforma (mesma regra dos cards); treinamento/base/afastado não contam. */
function _eventKey(v){
  var u=(v||'').trim().toUpperCase().replace('P-MXL','PMXL').replace('P MXL','PMXL');
  if(!u) return null;
  var pk=_pieKind(u);
  if(pk==='MOB') return 'MOB';
  if(pk==='FEMB') return 'FEMB';
  if(u==='EMB'||u==='EMB.'||_projNorm(u)) return u;
  return null;
}
/* Eventos do período: embarque (EMB/projeto), mobilização (MOB) e desembarque (início de F.EMB).
   Cada evento é um grupo "mesmo tipo/projeto + mesmo dia de início real". Pros embarques, devolve
   também o status de cada grupo em relação a HOJE (on = alguém ainda está nele; next = sobe depois
   de hoje; done = já terminou) e a duração média (dias, bloco inteiro) dos blocos já finalizados. */
function _countEvents(scope, fromIdx, toIdx){
  var seen={}, durSum=0, durN=0;
  scope.forEach(function(t){
    var start=null, key=null;
    for(var i=fromIdx;i<=toIdx+1;i++){
      var k=i<=toIdx?_eventKey(t.d[i]):null;
      if(key!==null&&k!==key){
        var s0=start, end=i-1;
        while(s0>0&&_eventKey(t.d[s0-1])===key) s0--;
        while(end+1<DATES.length&&_eventKey(t.d[end+1])===key) end++;
        var kind=key==='MOB'?'mob':(key==='FEMB'?'des':'emb');
        var g=seen[key+'@'+s0]||(seen[key+'@'+s0]={kind:kind,s0:s0,on:false,dur:0});
        if(s0<=T_IDX&&end>=T_IDX) g.on=true;
        if(end-s0+1>g.dur) g.dur=end-s0+1;
      }
      if(k!==key) start=i;
      key=k;
    }
  });
  var r={emb:0,mob:0,des:0,on:0,done:0,next:0,avgDur:null};
  Object.keys(seen).forEach(function(k){
    var g=seen[k]; r[g.kind]++;
    if(g.kind==='emb'){ if(g.on) r.on++; else if(g.s0>T_IDX) r.next++; else { r.done++; durSum+=g.dur; durN++; } }
  });
  r.avgDur=durN?durSum/durN:null;
  return r;
}
function buildPie(){
  var titleEl=document.getElementById('pieTitle');
  if(titleEl) titleEl.textContent = _cargaSelectedTi!==null
    ? 'Distribuição de status — '+TECS[_cargaSelectedTi].n.split(' ').slice(0,2).join(' ')
    : 'Distribuição de status';
  document.getElementById('pieC').style.display='';
  document.getElementById('pieEmptyMsg').style.display='none';
  document.getElementById('dayBarLegend').style.display='none';
  var scope = _cargaSelectedTi!==null ? [TECS[_cargaSelectedTi]] : TECS;
  // Embarcado (EMB/EMB.) e Projeto são a mesma coisa (estar num projeto/plataforma é estar embarcado) — uma fatia só.
  var sd=_statusDist(scope), ct=sd.ct, tc=sd.tc, ev=sd.ev, total=sd.total;
  if(pieChart){pieChart.destroy();pieChart=null;}
  if(total===0){
    document.getElementById('pieC').style.display='none';
    var emptyEl=document.getElementById('pieEmptyMsg');
    emptyEl.style.display='flex';
    emptyEl.textContent='Nenhum dia com status no período'+(_cargaSelectedTi!==null?' desse técnico':'');
    return;
  }
  var fullLabels=['Embarcado/Projeto','Folga emb.','Desembarque','FOLGA','Mobilização','Afastado','Base/Hotel'];
  var tickLabels=[['Embarcado/','Projeto'],['Folga','emb.'],'Desemb.','FOLGA','Mobiliz.','Afastado',['Base/','Hotel']];
  var values=[ct.EMBPROJ,ct.FEMB,ct.DES,ct.DISP,ct.MOB,ct.AF,ct.BASE];
  // colunas de situação (folga, base, afastado): mostra quantos técnicos estão nela, em vez de eventos
  var techKinds={1:'FEMB',3:'DISP',5:'AF',6:'BASE'};
  var colors=['#2f4bd0','#1fc98e','#7dd3fc','#fb923c','#4a9eff','#e85b5b','#64748b'];
  function evText(i,short){
    if(i===0) return ev.emb+' '+(short?'emb.':(ev.emb!==1?'embarques':'embarque'));
    var tk=techKinds[i];
    if(tk) return tc[tk]+' '+(short?'téc.':(tc[tk]!==1?'técnicos':'técnico'));
    if(i===4) return ev.mob+' '+(short?'mob.':(ev.mob!==1?'mobilizações':'mobilização'));
    return '';
  }
  /* valor e % em cima de cada coluna (+ nº de embarques/mobilizações nas colunas de Embarcado e Mobilização) */
  var barLabels={id:'statusBarLabels',afterDatasetsDraw:function(ch){
    var ctx=ch.ctx, cs=getComputedStyle(document.documentElement), main=cs.getPropertyValue('--text').trim()||'#e6e9f2', muted='#8a91a8', narrow=ch.width<520;
    ctx.save(); ctx.textAlign='center'; ctx.textBaseline='bottom';
    ch.getDatasetMeta(0).data.forEach(function(bar,i){
      var v=values[i]; if(!v) return;
      var y=bar.y-4;
      ctx.font='10px Inter, sans-serif'; ctx.fillStyle=muted;
      ctx.fillText(Math.round(v/total*100)+'%',bar.x,y); y-=12;
      ctx.font='600 12px Inter, sans-serif'; ctx.fillStyle=main;
      ctx.fillText(String(v),bar.x,y); y-=15;
      var et=evText(i,narrow);
      if(et){ ctx.font='10px Inter, sans-serif'; ctx.fillStyle=colors[i]; ctx.fillText(et,bar.x,y); }
    });
    ctx.restore();
  }};
  pieChart=new Chart(document.getElementById('pieC'),{type:'bar',plugins:[barLabels],
    data:{labels:tickLabels,datasets:[{data:values,backgroundColor:colors,borderRadius:4,barPercentage:0.75,categoryPercentage:0.9}]},
    options:{responsive:true,maintainAspectRatio:false,
      // 'index'+intersect:false: passar o mouse em qualquer ponto da coluna (ou acima dela) já mostra o dado
      interaction:{mode:'index',axis:'x',intersect:false},
      scales:{
        x:{ticks:{color:'#8a91a8',font:{size:10},maxRotation:0,autoSkip:false},grid:{display:false}},
        y:{beginAtZero:true,grace:'35%',ticks:{color:'#555e7a',font:{size:10},precision:0},grid:{color:'rgba(255,255,255,.04)'},border:{display:false}}
      },
      plugins:{legend:{display:false},
        tooltip:{callbacks:{
          title:function(items){return fullLabels[items[0].dataIndex];},
          label:function(ctx){var v=ctx.parsed.y, pct=total>0?Math.round(v/total*100):0, et=evText(ctx.dataIndex,false); return v+' dia'+(v!==1?'s':'')+' ('+pct+'%)'+(et?' · '+et:'');}
        }}}
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
    disp.push(+(st.filter(function(v){return v.indexOf('FOLGA')===0;}).length/N*100).toFixed(1));
    todayM.push(i===T_IDX);
  }
  if(lineChart){lineChart.destroy();lineChart=null;}
  lineChart=new Chart(document.getElementById('lineC'),{type:'line',
    data:{labels:labels,datasets:[
      {label:'Embarcados',data:emb,borderColor:'#2f4bd0',backgroundColor:'rgba(47,75,208,.1)',tension:0.3,fill:true,borderWidth:2,
        pointRadius:todayM.map(function(t){return t?5:total>60?0:3;}),pointBackgroundColor:todayM.map(function(t){return t?'#fff':'#2f4bd0';})},
      {label:'Folga emb.',data:femb,borderColor:'#1fc98e',backgroundColor:'transparent',tension:0.3,fill:false,borderWidth:1.5,borderDash:[5,4],pointBackgroundColor:'#1fc98e',pointRadius:total>60?0:3},
      {label:'FOLGA',data:disp,borderColor:'#fb923c',backgroundColor:'transparent',tension:0.3,fill:false,borderWidth:1.5,borderDash:[2,3],pointBackgroundColor:'#fb923c',pointRadius:total>60?0:3}
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
/* Cards por projeto/plataforma (P-66, P-77...) abaixo da Ocupação no período. Conta todos os dias
   de projeto dentro do período do dashboard (passados e futuros). Um EMBARQUE é o grupo de técnicos que
   subiu no MESMO dia pro mesmo projeto (3 técnicos subindo juntos = 1 embarque, não 3). O dia de
   subida é o real: se o técnico já estava embarcado antes do início do período, olha pra trás até
   achar o primeiro dia contínuo no projeto. Horas previstas seguem a regra da tabela de Horas por
   Projeto (11h/dia). Clicar no card expande o detalhe no próprio card (_projSelected).
   Cada embarque tem um status pela data de hoje: em andamento (azul — algum técnico ainda está
   nele hoje), realizado (vermelho — já terminou) ou previsto (amarelo — sobe depois de hoje).
   A barrinha colorida no topo do card tem um segmento por embarque, na ordem de subida. */
var PROJ_ST={on:'Em andamento',done:'Realizado',next:'Previsto'};
var _projCardData={}, _projSelected=null;
function _hrsToNum(v){var p=(v||'').split(':'); return p.length===2?parseInt(p[0])+parseInt(p[1])/60:0;}
function _projNorm(v){
  var u=(v||'').trim().toUpperCase();
  return (u&&_util_isProject(u))?u.replace('P-MXL','PMXL').replace('P MXL','PMXL'):null;
}
function buildProjectCards(){
  var el=document.getElementById('projCards');
  if(!el) return;
  var last=dashE, map={};
  TECS.forEach(function(t){
    var cur=null;
    for(var i=dashS;i<=last+1;i++){
      var proj=i<=last?_projNorm(t.d[i]):null;
      if(cur&&cur.proj!==proj){
        // dias do embarque = dias REAIS embarcados (do dia em que subiu até o último dia), mesmo que
        // o embarque comece antes ou continue depois do período filtrado (o aviso "antes do período" cobre isso)
        var start=cur.from;
        while(start>0&&_projNorm(t.d[start-1])===cur.proj) start--;
        var end=i-1;
        while(end+1<DATES.length&&_projNorm(t.d[end+1])===cur.proj) end++;
        var tdays=end-start+1, treal=0;
        for(var q=start;q<=end;q++) treal+=_hrsToNum(t.hr[q]);
        var m=map[cur.proj]||(map[cur.proj]={proj:cur.proj,techDays:0,days:0,real:0,techs:{},groups:{}});
        m.techDays+=tdays; m.real+=treal; m.techs[t.n]=true;
        var g=m.groups[start]||(m.groups[start]={startIdx:start,techDays:0,days:0,real:0,rows:[]});
        g.techDays+=tdays; g.real+=treal;
        g.rows.push({tec:t.n,toIdx:end,days:tdays,real:treal,on:start<=T_IDX&&end>=T_IDX,endIdx:end,downKnown:!!(t.d[end+1]||'').trim()});
        cur=null;
      }
      if(proj){
        if(!cur) cur={proj:proj,from:i,days:0,real:0};
        cur.days++; cur.real+=_hrsToNum(t.hr[i]);
      }
    }
  });
  Object.keys(map).forEach(function(k){
    var m=map[k];
    m.embarques=Object.keys(m.groups).map(function(s){return m.groups[s];}).sort(function(a,b){return a.startIdx-b.startIdx;});
    m.embarques.forEach(function(g){
      g.rows.sort(function(a,b){return a.tec.localeCompare(b.tec);});
      // duração do embarque = o técnico que ficou mais tempo (não a soma dos técnicos)
      g.days=Math.max.apply(null,g.rows.map(function(b){return b.days;}));
      g.status=g.rows.some(function(b){return b.on;})?'on':(g.startIdx>T_IDX?'next':'done');
      // dia do desembarque (1º dia depois do último embarcado): em andamento = o mais próximo; realizado = quando o último saiu
      var pool=g.status==='on'?g.rows.filter(function(b){return b.on;}):g.rows;
      var endIdx=g.status==='on'?Math.min.apply(null,pool.map(function(b){return b.endIdx;})):Math.max.apply(null,pool.map(function(b){return b.endIdx;}));
      g.downIdx=endIdx+1;
      g.downKnown=pool.filter(function(b){return b.endIdx===endIdx;}).some(function(b){return b.downKnown;});
    });
    m.days=m.embarques.reduce(function(a,g){return a+g.days;},0);
    var done=m.embarques.filter(function(g){return g.status==='done';});
    var on=m.embarques.filter(function(g){return g.status==='on';});
    var nxt=m.embarques.filter(function(g){return g.status==='next';});
    m.lastDown=done.length?Math.max.apply(null,done.map(function(g){return g.downIdx;})):null;
    m.nextDown=on.length?on.reduce(function(a,g){return !a||g.downIdx<a.downIdx?g:a;},null):null;
    m.nextUp=nxt.length?Math.min.apply(null,nxt.map(function(g){return g.startIdx;})):null;
  });
  _projCardData=map;
  renderProjCards();
}
function renderProjCards(){
  var el=document.getElementById('projCards');
  if(!el) return;
  var map=_projCardData;
  var rows=Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){return b.days-a.days||a.proj.localeCompare(b.proj);});
  if(!rows.length){ el.innerHTML='<div class="proj-cards-empty">Nenhum embarque em projeto/plataforma no período</div>'; _projSelected=null; return; }
  if(!map[_projSelected]) _projSelected=null;
  el.innerHTML=rows.map(function(r){
    var nt=Object.keys(r.techs).length, ne=r.embarques.length, open=r.proj===_projSelected;
    return '<div class="proj-card'+(open?' sel':'')+'">'
      +'<div class="proj-card-bar">'+r.embarques.map(function(g){return '<i class="st-'+g.status+'" title="'+PROJ_ST[g.status]+'"></i>';}).join('')+'</div>'
      +'<div class="proj-card-top" role="button" tabindex="0" aria-expanded="'+open+'" title="'+(open?'Recolher':'Ver embarques de ')+escAttr(r.proj)+'" data-proj="'+escAttr(r.proj)+'" onclick="selectProjCard(this.dataset.proj)" onkeydown="projCardKey(event,this)">'
      +'<div class="proj-card-name"><span>'+escAttr(r.proj)+'</span><svg class="proj-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></div>'
      +'<div class="proj-card-days">'+r.days+'<small>dia'+(r.days!==1?'s':'')+'</small></div>'
      +'<div class="proj-card-meta">'+nt+' técnico'+(nt!==1?'s':'')+'<br>'+ne+' embarque'+(ne!==1?'s':'')
      +' · '+(r.techDays*11)+'h previstas'+(r.real>0?' · '+Math.round(r.real)+'h reais':'')+'</div></div>'
      +(open?projDetailHtml(r):'')+'</div>';
  }).join('');
}
function projCardKey(e,el){
  if(e.key==='Enter'||e.key===' '){e.preventDefault();selectProjCard(el.dataset.proj);}
}
function selectProjCard(proj){
  var box=document.getElementById('projCards'), keep=box.scrollTop;
  _projSelected=_projSelected===proj?null:proj;
  renderProjCards();
  box.scrollTop=keep;
  if(_projSelected){
    var card=box.querySelector('.proj-card.sel');
    if(card){
      box.scrollTop=0;
      card.querySelector('.proj-card-top').focus({preventScroll:true});
    }
  }
}
function projDetailHtml(r){
  var html='<div class="proj-groups">';
  r.embarques.forEach(function(g,gi){
    var dp=DATES[g.startIdx].slice(0,5), pre=g.startIdx<dashS;
    html+='<div class="proj-group"><div class="proj-group-head"><span><b>Embarque '+(gi+1)+'</b> · '+(g.startIdx>T_IDX?'sobe ':'subiu ')+dp+(pre?' <span class="proj-pre">antes do período</span>':'')+(g.rows.some(function(b){return b.endIdx>dashE;})?' <span class="proj-pre">continua após o período</span>':'')+' <span class="proj-st st-'+g.status+'">'+PROJ_ST[g.status]+'</span></span>'
      +'<span class="proj-group-sum">'+g.rows.length+' técnico'+(g.rows.length!==1?'s':'')+' · '+g.days+'d · '+(g.techDays*11)+'h</span></div>'
      +'<table class="proj-tbl"><tbody>';
    g.rows.forEach(function(b){
      html+='<tr><td>'+escAttr(b.tec)+'</td>'
        +'<td class="r mono">até '+DATES[b.toIdx].slice(0,5)+'</td>'
        +'<td class="r mono">'+b.days+'d</td>'
        +'<td class="r mono">'+(b.real>0?Math.round(b.real)+'h reais':(b.days*11)+'h')+'</td></tr>';
    });
    html+='</tbody></table></div>';
  });
  return html+'</div>';
}
function refreshDash(){buildMetrics();buildCarga();buildOvertimeBars();refreshStatusPie();buildEmbarquePlaces();buildLine();buildProjectCards();}
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
    h+='<td style="text-align:center;font-family:monospace;color:var(--st-trein)">'+fh(trein)+'</td>';
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

var UTIL_LABELS={operacao:'Em Operação',folga_emb:'Folga Embarque',disponivel:'FOLGA',
  afastado:'Afastado',ferias:'Férias',treinamento:'Treinamento',
  mobilizacao:'Mobilização',cancelado:'Cancelado',embarque:'Embarcando',sem_info:'—'};
var UTIL_COLORS={operacao:'#2ecc71',folga_emb:'#3498db',disponivel:'#f39c12',
  afastado:'#e74c3c',ferias:'#9b59b6',treinamento:'#8e44ad',
  mobilizacao:'#1abc9c',cancelado:'#95a5a6',embarque:'#27ae60',sem_info:'#bdc3c7'};

/* Standard statuses that are NOT a project */
var UTIL_STD=['EMB','EMB.','F.EMB','F. EMB','F.EMBARQUE','FOLGA',
  'DES','DES.','MOB.','MOB','BASE','HOTEL','HOTEL.','T.EMB',
  'RECAP','AFASTADO','INSS','ATESTADO','TREINAM.','TREINAMETO',
  'DESLIGADO','FÉRIAS','FERIAS','ASO','IRATA','T-HUET','THUET','NR','REGRA/OURO',
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
  if(u==='F.EMB'||u==='F. EMB'||u==='F.EMBARQUE') return 'folga_emb';
  if(u.indexOf('FÉRIAS')>=0||u.indexOf('FERIAS')>=0) return 'ferias';
  if(['AFASTADO','INSS','ATESTADO'].some(function(x){return u.indexOf(x)>=0;})) return 'afastado';
  if(isTrainingStatus(u)||['CURSO','IRATA','TREINAM','CBSP','T-HUET','THUET','RESGATE','NRS','NTS','ASO','HTS','JOTUN','IBIRITÉ','IBIRITE','PEAT','NR','REGRA/OURO'].some(function(x){return u.indexOf(x)>=0;})) return 'treinamento';
  if(['FOLGA','BASE','HOTEL','T.EMB','RECAP'].some(function(x){return u.indexOf(x)>=0;})) return 'disponivel';
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
    disponivel:'FOLGA',afastado:'Afastado',treinamento:'Treinamento',mobilizacao:'Mobilização'};
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
