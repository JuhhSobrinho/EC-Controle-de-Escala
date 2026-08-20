/* ── TableView: grade principal de escala ── */
var _toastTimer;
function toast(msg,color){
  color=color||'#1fc98e';
  document.getElementById('toastMsg').textContent=msg;
  document.getElementById('toastDot').style.background=color;
  var t=document.getElementById('toast');t.classList.add('show');
  clearTimeout(_toastTimer);_toastTimer=setTimeout(function(){t.classList.remove('show');},2800);
}

function hrsForStatus(u){
  if(!u) return '';
  if(u==='EMB') return '11:00';
  if(u.indexOf('F.EMB')===0) return '08:00';
  if(u==='DES'||u==='DES.') return '12:00';
  if(u.indexOf('MOB')===0) return '12:00';
  if(u.indexOf('FOLGA')===0||u==='BASE'||u==='HOTEL'||u==='RECAP'||isTrainingStatus(u)) return '08:00';
  if(u.indexOf('AFAS')===0||u.indexOf('FÉRIAS')===0||u.indexOf('FERIAS')===0) return '';
  if(u) return '11:00';
  return '';
}
function hrsColor(u){
  if(!u) return 'var(--text3)';
  if(u==='EMB') return 'var(--emb)';
  if(isTrainingStatus(u)) return 'var(--st-trein)';
  if(u.indexOf('FÉRIAS')===0||u.indexOf('FERIAS')===0) return 'var(--af)';
  if(u.indexOf('F.EMB')===0||u.indexOf('FOLGA')===0||u==='BASE'||u==='HOTEL'||u==='RECAP') return 'var(--disp)';
  if(u==='DES'||u==='DES.'||u.indexOf('MOB')===0) return 'var(--des)';
  return 'var(--proj)';
}

function buildTable(){
  var ws=Math.max(0,winStart), we=Math.min(DATES.length-1,winStart+WIN*2);
  // Carga (t.p) = utilização real na janela de dias VISÍVEL na tela (mesma ws–we usada pra
  // desenhar as colunas) — não a escala inteira de ~2 anos. Assim o número bate com o que dá
  // pra contar "de olho" olhando a tabela, em vez de incluir meses de histórico fora de vista.
  TECS.forEach(function(t){ t.p=computeCarga(t, ws, we); });
  var wp=DATES[ws].split('/'), ep=DATES[we].split('/');
  document.getElementById('winLabel').textContent=wp[0]+'/'+wp[1]+' – '+ep[0]+'/'+ep[1];
  var rows=TECS.slice();
  if(search)rows=rows.filter(function(t){return t.n.toLowerCase().indexOf(search)>=0||t.f.toLowerCase().indexOf(search)>=0;});
  if(activeF==='over')rows=rows.filter(function(t){return t.p>0.55;});
  if(activeF==='under')rows=rows.filter(function(t){return t.p<0.45&&t.p>0;});
  if(activeF==='ideal')rows=rows.filter(function(t){return t.p>=0.45&&t.p<=0.55;});
  var h='<thead><tr>';
  h+='<th class="fx th-info" style="min-width:215px">Nome</th>';
  for(var i=ws;i<=we;i++){
    var isT=(i===T_IDX), dp=DATES[i].split('/');
    var tc=isT?' today-col':'', pill=isT?'<span class="today-pill">hoje</span>':'';
    var wk=isWeekend(DATES[i])?' weekend-col':'';
    h+='<th class="th-date'+tc+wk+'">'+pill+'<span class="d-day">'+dp[0]+'/'+dp[1]+'</span><span class="d-dow">'+dow(DATES[i])+'</span></th>';
  }
  h+='</tr></thead><tbody>';
  rows.forEach(function(t){
    var ti=TECS.indexOf(t);
    var pLabel=t.p>0?(t.p*100).toFixed(0)+'%':'—';
    var barW=Math.min(t.p/2.2*100,100).toFixed(1), col=pctCol(t.p);
    var isOpen = expandedRows[ti];
    // main row
    h+='<tr class="data-row" data-ti="'+ti+'">';
    h+='<td class="fx"><div class="name-cell">'
      +'<span class="expand-toggle'+(isOpen?' open':'')+'" onclick="toggleRow('+ti+')" title="Ver detalhes">'
      +'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>'
      +'</span>'
      +'<span class="name-text" onclick="toggleRow('+ti+')">'+t.n+'</span>'
      +'<span class="edit-icon" onclick="openTecModal('+ti+')" title="Editar técnico">'
      +'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
      +'</span></div></td>';
    for(var i=ws;i<=we;i++){
      var v=t.d[i]||'', bc=badgeCls(v);
      var tc2=i===T_IDX?' today-col':'', ec=(t._edits&&t._edits[i])?' edited':'';
      var wk2=isWeekend(DATES[i])?' weekend-col':'';
      var folgaCls = t.fo[i] ? ' folga-over' : '';
      var obsText = t.obs && t.obs[i] ? t.obs[i] : '';
      var obsCls = obsText ? ' has-obs' : '';
      var cellCls = 'tc day-cell'+(bc?' '+bc:'')+tc2+ec+wk2+folgaCls+obsCls;
      var obsAttr = obsText ? ' title="'+escAttr('Observação: '+obsText)+'"' : '';
      var inner = bc ? v : '<span class="empty-dot">&middot;</span>';
      h+='<td class="'+cellCls+'" data-ti="'+ti+'" data-di="'+i+'"'+obsAttr+' onmousedown="dfStart(event,'+ti+','+i+')" onmouseover="dfOver(event,'+ti+','+i+')" onmouseup="dfEnd(event,'+ti+','+i+')">'+inner+'</td>';
    }
    h+='</tr>';
    // detail row — info panel fixo + células de horas por dia
    h+='<tr class="detail-row" id="detail-'+ti+'">';
    h+='<td class="fx" style="padding:0;vertical-align:top">'
      +'<div class="detail-collapse'+(isOpen?' open':'')+'" id="detail-col-'+ti+'">'
      +'<div class="detail-collapse-inner">'
      +'<div class="detail-info">'
      +'<div class="detail-fn-text">'+t.f+'</div>'
      +'<div class="detail-sispat">SISPAT '+t.s+'</div>'
      +'<div class="detail-stats">'
      +'<div class="detail-stat"><div class="detail-stat-label">Dia.F</div><div class="detail-stat-val" style="color:var(--text2)">'+t.df+'</div></div>'
      +'<div class="detail-stat"><div class="detail-stat-label">Dia.T</div><div class="detail-stat-val" style="color:var(--text2)">'+t.dt+'</div></div>'
      +'<div class="detail-stat"><div class="detail-stat-label">Carga</div><div class="detail-stat-val" style="color:'+col+'">'+pLabel+'</div></div>'
      +'</div>'
      +'</div></div></div></td>';
    h+='<td colspan="'+(we-ws+1)+'" style="padding:0;vertical-align:top">'
      +'<div class="detail-collapse'+(isOpen?' open':'')+'" id="detail-days-'+ti+'">'
      +'<div class="detail-collapse-inner"><div style="display:flex">'
      +'<div class="hrs-row">';
    for(var hi=ws;hi<=we;hi++){
      var hv=(t.d[hi]||'').trim().toUpperCase();
      var hrsVal=hrsForStatus(hv), hColor=hrsColor(hv);
      var tcH=hi===T_IDX?' today-col':'';
      var wkH=isWeekend(DATES[hi])?' weekend-col':'';
      var isPrev = hi >= T_IDX;
      var prevCls = isPrev ? ' hrs-future' : '';
      // check for imported real hours (persistido em escala.hr_reais)
      var realHr = t.hr[hi];
      h+='<div class="hrs-cell'+tcH+wkH+'">'
        +(realHr
          ? '<span class="hrs-real'+(isPrev?' fut':'')+'" title="Horas reais">'+realHr+'</span>'
          : (hrsVal?'<span class="hrs-time'+prevCls+'" style="color:'+hColor+'">'+hrsVal+'</span>'
                   :'<span class="hrs-empty">—</span>')
        )
        +'</div>';
    }
    h+='</div>'
      +'<div class="detail-cards">'
      +'<div class="detail-card"><div class="detail-label">Dia.F</div><div class="detail-value" style="color:var(--text2)">'+t.df+'</div></div>'
      +'<div class="detail-card"><div class="detail-label">Dia.T</div><div class="detail-value" style="color:var(--text2)">'+t.dt+'</div></div>'
      +'<div class="detail-card"><div class="detail-label">Carga</div><div class="detail-value" style="color:'+col+'">'+pLabel+'</div></div>'
      +'</div>'
      +'</div></div></div></td>';
    h+='</tr>';
  });
  h+='</tbody>';
  document.getElementById('tbl').innerHTML=h;
  if(!buildTable._scrolled){buildTable._scrolled=true;requestAnimationFrame(function(){var th=document.querySelector('thead th.today-col');if(th)th.scrollIntoView({inline:'center',behavior:'smooth'});});}
}

function toggleRow(ti){
  expandedRows[ti] = !expandedRows[ti];
  var isOpen = !!expandedRows[ti];
  var toggle = document.querySelector('.data-row[data-ti="'+ti+'"] .expand-toggle');
  if(toggle) toggle.classList.toggle('open', isOpen);
  ['detail-col-'+ti, 'detail-days-'+ti].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.classList.toggle('open', isOpen);
  });
}
