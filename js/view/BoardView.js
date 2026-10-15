/* ── BoardView: "Gerar dashboard" — versão para imprimir (A4 paisagem) do painel de embarques.
   Abre numa janela própria (mesmo padrão do Resumo de Horas) com HTML/CSS/SVG estáticos e tema claro,
   sem Chart.js, pra imprimir nítido e caber numa folha só. Usa o período selecionado no Dashboard. ── */

/* Chave de agrupamento do dia na Distribuição de status. Embarque usa a mesma lógica dos cards (projeto/
   plataforma; o dia "EMB" de viagem entra na plataforma seguinte); treinamento e afins agrupam pelo próprio
   status. As demais situações usam o tipo da fatia (FEMB, DES, DISP, MOB, AF, BASE). */
function _distKey(t,j){
  var kd=_pieKind(t.d[j]);
  if(!kd) return null;
  if(kd!=='EMBPROJ') return kd;
  if(_isEmbKey(_eventKey(t.d[j]))) return 'EMBPROJ|'+_evKey(t,j);
  return 'EMBPROJ|'+String(t.d[j]).trim().toUpperCase();
}
/* Contagem da Distribuição de status.
   Embarcado/Projeto, Folga emb., Desembarque, FOLGA e Mobilização contam por EVENTO: técnicos que começaram
   no mesmo dia, no mesmo projeto/situação, são um evento só, e o evento dura o que durou o técnico que ficou
   mais tempo (2 técnicos por 12 dias = 12 dias; um com 12 e outro com 14 = 14). A duração é a real (do dia em
   que começou até o último dia), mesmo passando das pontas do período, igual aos cards de projeto.
   Afastado e Base/Hotel continuam somando os dias de cada técnico. tc = quantos técnicos passaram por cada situação. */
var _DIST_EVENT={EMBPROJ:1,FEMB:1,DES:1,DISP:1,MOB:1};
function _statusDist(scope){
  var ct={EMBPROJ:0,FEMB:0,DES:0,DISP:0,MOB:0,AF:0,BASE:0};
  var tc={EMBPROJ:0,FEMB:0,DES:0,DISP:0,MOB:0,AF:0,BASE:0};
  var groups={};
  scope.forEach(function(t){
    var seenK={}, start=null, key=null;
    for(var i=dashS;i<=dashE+1;i++){
      var k=i<=dashE?_distKey(t,i):null;
      if(k){ var kd=k.split('|')[0]; seenK[kd]=true; if(!_DIST_EVENT[kd]) ct[kd]++; }
      if(key!==null&&k!==key&&_DIST_EVENT[key.split('|')[0]]){
        var s0=start, end=i-1;
        while(s0>0&&_distKey(t,s0-1)===key) s0--;
        while(end+1<DATES.length&&_distKey(t,end+1)===key) end++;
        var gk=key+'@'+s0, len=end-s0+1;
        if(!groups[gk]) groups[gk]={kd:key.split('|')[0],len:0};
        if(len>groups[gk].len) groups[gk].len=len;
      }
      if(k!==key) start=i;
      key=k;
    }
    Object.keys(seenK).forEach(function(kd){tc[kd]++;});
  });
  Object.keys(groups).forEach(function(gk){ ct[groups[gk].kd]+=groups[gk].len; });
  var total=Object.keys(ct).reduce(function(s,k){return s+ct[k];},0);
  return {ct:ct,tc:tc,ev:_countEvents(scope,dashS,dashE),total:total};
}

/* onde o técnico está/vai ficar: o dia "EMB" genérico (viagem) não diz a plataforma, então olha pra
   frente no mesmo bloco embarcado até o primeiro projeto/plataforma; se não achar, devolve "EMB" */
function _embDest(t,j){
  var k=_eventKey(t.d[j]);
  if(!_isEmbKey(k)) return k;
  if(_projNorm(k)) return k;
  for(var q=j+1;q<DATES.length&&_isEmbKey(_eventKey(t.d[q]));q++){ if(_projNorm(_eventKey(t.d[q]))) return _eventKey(t.d[q]); }
  return k;
}
function _embOrigin(t,j){
  var k=_eventKey(t.d[j]);
  if(!_isEmbKey(k)||_projNorm(k)) return k;
  for(var q=j-1;q>=0&&_isEmbKey(_eventKey(t.d[q]));q--){ if(_projNorm(_eventKey(t.d[q]))) return _eventKey(t.d[q]); }
  return k;
}

/* quem sobe e quem desce nos próximos N dias (técnicos no mesmo dia/projeto viram uma linha só) */
function _upcomingEvents(days){
  var sobe={}, desce={}, last=Math.min(DATES.length-1,T_IDX+days);
  TECS.forEach(function(t){
    for(var j=T_IDX+1;j<=last;j++){
      var prev=_eventKey(t.d[j-1]), cur=_eventKey(t.d[j]);
      if(!_isEmbKey(prev)&&_isEmbKey(cur)){
        var dest=_embDest(t,j), a=j+'|'+dest; (sobe[a]=sobe[a]||{idx:j,proj:dest,names:[]}).names.push(t.n);
      }else if(_isEmbKey(prev)&&!_isEmbKey(cur)&&(t.d[j]||'').trim()){
        var orig=_embOrigin(t,j-1), b2=j+'|'+orig; (desce[b2]=desce[b2]||{idx:j,proj:orig,names:[]}).names.push(t.n);
      }
    }
  });
  function arr(o){return Object.keys(o).map(function(k){return o[k];}).sort(function(x,y){return x.idx-y.idx||x.proj.localeCompare(y.proj);});}
  return {sobe:arr(sobe),desce:arr(desce)};
}

/* ocupação diária (% da equipe) — mesma série do gráfico de Ocupação no período */
function _occupancySeries(){
  var s=dashS,e=dashE,N=TECS.length||1,total=e-s+1,step=Math.max(1,Math.floor(total/60));
  var out={idx:[],emb:[],femb:[],disp:[]};
  for(var i=s;i<=e;i+=step){
    var st=TECS.map(function(t){return (t.d[i]||'').trim().toUpperCase();});
    out.idx.push(i);
    out.emb.push(st.filter(function(v){return getCategory(v)==='proj';}).length/N*100);
    out.femb.push(st.filter(function(v){return v.indexOf('F.EMB')===0;}).length/N*100);
    out.disp.push(st.filter(function(v){return v.indexOf('FOLGA')===0;}).length/N*100);
  }
  return out;
}

function _boardLineSvg(){
  var o=_occupancySeries(), W=560, H=170, L=30, R=8, T=8, B=20, pw=W-L-R, ph=H-T-B, n=o.idx.length;
  function X(k){return L+(n>1?k/(n-1):0.5)*pw;}
  function Y(v){return T+(1-v/100)*ph;}
  function path(a){return a.map(function(v,k){return (k?'L':'M')+X(k).toFixed(1)+' '+Y(v).toFixed(1);}).join(' ');}
  var g='';
  [0,25,50,75,100].forEach(function(v){
    g+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(v)+'" y2="'+Y(v)+'" stroke="#e3e7ee" stroke-width="1"/>'
      +'<text x="'+(L-4)+'" y="'+(Y(v)+3)+'" font-size="8" fill="#6b7280" text-anchor="end">'+v+'%</text>';
  });
  var ticks=n<=10?n:8, xl='';
  for(var q=0;q<ticks;q++){
    var k=ticks>1?Math.round(q*(n-1)/(ticks-1)):0;
    xl+='<text x="'+X(k).toFixed(1)+'" y="'+(H-6)+'" font-size="8" fill="#6b7280" text-anchor="middle">'+DATES[o.idx[k]].slice(0,5)+'</text>';
  }
  var today='';
  var ti=o.idx.indexOf(T_IDX);
  if(ti<0){ for(var m=0;m<n;m++){ if(o.idx[m]>=T_IDX){ti=m;break;} } if(ti>=0&&o.idx[ti]-T_IDX>3) ti=-1; }
  if(ti>=0) today='<line x1="'+X(ti).toFixed(1)+'" x2="'+X(ti).toFixed(1)+'" y1="'+T+'" y2="'+(T+ph)+'" stroke="#111" stroke-width="1" stroke-dasharray="3 3"/><text x="'+X(ti).toFixed(1)+'" y="'+(T+8)+'" font-size="8" fill="#111" font-weight="700" text-anchor="'+(X(ti)>W*0.85?'end':'start')+'" dx="'+(X(ti)>W*0.85?-4:4)+'">hoje</text>';
  var area=path(o.emb)+' L'+X(n-1).toFixed(1)+' '+Y(0)+' L'+X(0).toFixed(1)+' '+Y(0)+' Z';
  return '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="100%" preserveAspectRatio="none">'+g+xl+today
    +'<path d="'+area+'" fill="rgba(47,75,208,.12)"/>'
    +'<path d="'+path(o.emb)+'" fill="none" stroke="#2f4bd0" stroke-width="2"/>'
    +'<path d="'+path(o.femb)+'" fill="none" stroke="#1fc98e" stroke-width="1.6" stroke-dasharray="5 3"/>'
    +'<path d="'+path(o.disp)+'" fill="none" stroke="#fb923c" stroke-width="1.6" stroke-dasharray="2 3"/></svg>';
}

function _boardStatusCols(){
  var sd=_statusDist(TECS), ct=sd.ct, tc=sd.tc, ev=sd.ev, total=sd.total;
  var defs=[['EMBPROJ','Embarcado/ Projeto','#2f4bd0'],['FEMB','Folga emb.','#1fc98e'],['DES','Desemb.','#7dd3fc'],['DISP','FOLGA','#fb923c'],['MOB','Mobiliz.','#4a9eff'],['AF','Afastado','#e85b5b'],['BASE','Base/ Hotel','#64748b']];
  var max=Math.max.apply(null,defs.map(function(d){return ct[d[0]];}))||1;
  function sub(k){
    if(k==='EMBPROJ') return ev.emb+' embarque'+(ev.emb!==1?'s':'');
    if(k==='MOB') return ev.mob+' '+(ev.mob!==1?'mobilizações':'mobilização');
    if(k==='DES') return '';
    return tc[k]+' técnico'+(tc[k]!==1?'s':'');
  }
  return '<div class="cols">'+defs.map(function(d){
    var v=ct[d[0]], h=Math.max(v?2:0,v/max*100);
    return '<div class="col"><div class="col-top"><span class="col-sub" style="color:'+d[2]+'">'+sub(d[0])+'</span><b>'+v+'</b><span class="col-pct">'+(total?Math.round(v/total*100):0)+'%</span></div>'
      +'<div class="col-bar"><i style="height:'+h.toFixed(1)+'%;background:'+d[2]+'"></i></div><div class="col-lbl">'+d[1]+'</div></div>';
  }).join('')+'</div>';
}

function _boardProjDates(r){
  var out=[];
  function dt(i){return DATES[Math.min(i,DATES.length-1)].slice(0,5);}
  if(r.lastDown!==null) out.push('<div class="pd" style="color:#c0392b">desceu '+dt(r.lastDown)+'</div>');
  if(r.nextDown) out.push('<div class="pd" style="color:#2f4bd0">'+(r.nextDown.downKnown?'desce '+dt(r.nextDown.downIdx):'escala até '+dt(r.nextDown.downIdx-1))+'</div>');
  if(r.nextUp!==null) out.push('<div class="pd" style="color:#a67c00">sobe '+dt(r.nextUp)+'</div>');
  return '<div class="pds">'+out.join('')+'</div>';
}
function _boardProjects(){
  var rows=Object.keys(_projCardData).map(function(k){return _projCardData[k];}).sort(function(a,b){return b.days-a.days||a.proj.localeCompare(b.proj);});
  var shown=rows.slice(0,12), more=rows.length-shown.length;
  if(!rows.length) return '<div class="empty">Nenhum embarque em projeto/plataforma no período</div>';
  var stCol={on:'#2f4bd0',done:'#e85b5b',next:'#eab308'};
  return '<div class="projs">'+shown.map(function(r){
    var nt=Object.keys(r.techs).length, ne=r.embarques.length;
    var bar=r.embarques.map(function(g){return '<i style="background:'+stCol[g.status]+'"></i>';}).join('');
    return '<div class="proj"><div class="proj-bar">'+bar+'</div><div class="proj-name">'+escAttr(r.proj)+'</div>'
      +'<div class="proj-days">'+r.days+'<small>'+(r.days!==1?'dias':'dia')+'</small></div>'
      +'<div class="proj-meta">'+nt+' téc. · '+ne+' emb.</div>'+_boardProjDates(r)+'</div>';
  }).join('')+'</div>'+(more>0?'<div class="more">+ '+more+' outros projetos/plataformas</div>':'');
}

function _boardUpcoming(){
  var u=_upcomingEvents(14);
  function nm(n){return escAttr(n.split(' ').slice(0,2).join(' '));}
  function list(items,verb,color){
    if(!items.length) return '<div class="empty">Nenhum nos próximos 14 dias</div>';
    var max=6, rows=items.slice(0,max).map(function(it){
      var names=it.names.map(nm), txt=names.slice(0,3).join(', ')+(names.length>3?' +'+(names.length-3):'');
      return '<div class="up"><span class="up-date" style="background:'+color+'">'+DATES[it.idx].slice(0,5)+'</span>'
        +'<span class="up-body"><b>'+escAttr(it.proj)+'</b> · '+it.names.length+' técnico'+(it.names.length!==1?'s':'')+'<br><span class="up-names">'+txt+'</span></span></div>';
    }).join('');
    return rows+(items.length>max?'<div class="more">+ '+(items.length-max)+' outros</div>':'');
  }
  return '<div class="two"><div><div class="sub-h">Sobem</div>'+list(u.sobe,'sobe','#2f4bd0')+'</div>'
    +'<div><div class="sub-h">Desembarcam</div>'+list(u.desce,'desce','#fb923c')+'</div></div>';
}

function _boardToday(){
  var hoje={emb:0,folga:0,mob:0,af:0,outros:0}, byProj={};
  TECS.forEach(function(t){
    var k=_eventKey(t.d[T_IDX]), pk=_pieKind(t.d[T_IDX]);
    if(_isEmbKey(k)){ hoje.emb++; var dp=_embDest(t,T_IDX); byProj[dp]=(byProj[dp]||0)+1; }
    else if(k==='MOB') hoje.mob++;
    else if(k==='FEMB'||pk==='DISP') hoje.folga++;
    else if(pk==='AF') hoje.af++;
    else hoje.outros++;
  });
  var N=TECS.length||1;
  var defs=[['emb','Embarcados','#2f4bd0'],['folga','De folga','#fb923c'],['mob','Mobilização','#4a9eff'],['af','Afastados','#e85b5b'],['outros','Outros / sem status','#94a3b8']];
  var bar='<div class="stack">'+defs.filter(function(d){return hoje[d[0]]>0;}).map(function(d){return '<i style="width:'+(hoje[d[0]]/N*100).toFixed(1)+'%;background:'+d[2]+'"></i>';}).join('')+'</div>';
  var leg='<div class="leg">'+defs.map(function(d){return '<div><i style="background:'+d[2]+'"></i>'+d[1]+'<b>'+hoje[d[0]]+'</b></div>';}).join('')+'</div>';
  var projs=Object.keys(byProj).sort(function(a,b){return byProj[b]-byProj[a]||a.localeCompare(b);});
  var maxp=projs.length?byProj[projs[0]]:1;
  var pl=projs.length?projs.slice(0,8).map(function(p){
    return '<div class="hp"><span class="hp-n">'+escAttr(p)+'</span><span class="hp-t"><i style="width:'+(byProj[p]/maxp*100).toFixed(0)+'%"></i></span><b>'+byProj[p]+'</b></div>';
  }).join('')+(projs.length>8?'<div class="more">+ '+(projs.length-8)+' outras</div>':''):'<div class="empty">Ninguém embarcado hoje</div>';
  return bar+leg+'<div class="sub-h" style="margin-top:10px">Embarcados agora por plataforma</div>'+pl;
}

function buildBoardHtml(){
  var cards=computeKpis();
  var s0=DATES[dashS], e0=DATES[dashE], nd=dashE-dashS+1;
  var kpi=cards.map(function(c){
    return '<div class="kpi" style="border-top-color:'+c.ml+'"><div class="kpi-l">'+c.lb+'</div><div class="kpi-v" style="color:'+c.ml+'">'+c.val+'</div><div class="kpi-n">'+c.nt+'</div></div>';
  }).join('');
  var css=[
    '@page{size:A4 landscape;margin:7mm}',
    '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    'html,body{margin:0;padding:0;background:#e9ecf1;font-family:Arial,Helvetica,sans-serif;color:#111}',
    '.toolbar{position:fixed;bottom:14px;right:18px;z-index:5}',
    '.toolbar button{font:600 12px Arial;padding:7px 14px;border:0;border-radius:6px;background:#1fc98e;color:#06281d;cursor:pointer}',
    '.page{width:283mm;height:196mm;margin:14px auto;background:#fff;padding:6mm 7mm;display:flex;flex-direction:column;gap:9px;overflow:hidden;box-shadow:0 2px 14px rgba(0,0,0,.18)}',
    '.hd{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:5px}',
    '.hd h1{font-size:19px;margin:0;letter-spacing:.2px}',
    '.hd .per{font-size:11px;color:#444;text-align:right;line-height:1.5}',
    '.hd .per b{font-size:13px;color:#111}',
    '.kpis{display:grid;grid-template-columns:repeat(8,1fr);gap:7px}',
    '.kpi{border:1px solid #d6dae3;border-top:3px solid;border-radius:5px;padding:6px 8px;min-width:0}',
    '.kpi-l{font-size:7.5px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280}',
    '.kpi-v{font-size:22px;font-weight:700;line-height:1.15;margin-top:2px}',
    '.kpi-n{font-size:8px;color:#555;line-height:1.5}',
    '.kpi-chip{display:inline-flex;align-items:center;gap:3px;margin-right:5px;white-space:nowrap}',
    '.kpi-chip i{width:6px;height:6px;border-radius:50%;display:inline-block}',
    '.row{display:grid;gap:9px;min-height:0}',
    '.r2{grid-template-columns:1fr 1.15fr;height:250px}',
    '.r3{grid-template-columns:1.35fr 1.2fr .9fr;flex:1}',
    '.box{border:1px solid #d6dae3;border-radius:6px;padding:7px 9px;min-width:0;min-height:0;overflow:hidden;display:flex;flex-direction:column}',
    '.box-h{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#444;margin-bottom:6px;display:flex;justify-content:space-between}',
    '.box-h span{font-weight:400;text-transform:none;letter-spacing:0;color:#777;display:flex;gap:8px;white-space:nowrap;align-items:center}',
    '.box-h span i{display:inline-block;width:12px;height:3px;border-radius:2px;margin-right:3px;vertical-align:middle}',
    '.cols{display:flex;gap:6px;flex:1;min-height:0}',
    '.col{flex:1;display:flex;flex-direction:column;align-items:center;min-width:0}',
    '.col-top{display:flex;flex-direction:column;align-items:center;line-height:1.25;height:34px;justify-content:flex-end}',
    '.col-top b{font-size:12px}.col-pct{font-size:8px;color:#666}.col-sub{font-size:7.5px;white-space:nowrap}',
    '.col-bar{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center;border-bottom:1px solid #cfd4de;min-height:0}',
    '.col-bar i{display:block;width:70%;border-radius:3px 3px 0 0}',
    '.col-lbl{font-size:8px;color:#444;text-align:center;margin-top:3px;height:20px;line-height:1.2}',
    '.chart{flex:1;min-height:0}',
    '.projs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}',
    '.proj{border:1px solid #d6dae3;border-radius:5px;padding:5px 7px;position:relative;overflow:hidden;min-width:0}',
    '.proj-bar{position:absolute;top:0;left:0;right:0;height:3px;display:flex;gap:1px}.proj-bar i{flex:1;display:block}',
    '.proj-name{font-size:10px;font-weight:700;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.proj-days{font-size:17px;font-weight:700;line-height:1.1}.proj-days small{font-size:8px;font-weight:400;color:#777;margin-left:3px}',
    '.proj-meta{font-size:7.5px;color:#666}',
    '.pds{margin-top:3px;border-top:1px dashed #e1e5ec;padding-top:3px}.pd{font-size:8px;font-weight:700;line-height:1.35}',
    '.more{font-size:8px;color:#777;margin-top:4px}',
    '.empty{font-size:9px;color:#888;padding:6px 0}',
    '.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
    '.sub-h{font-size:8px;font-weight:700;text-transform:uppercase;color:#555;margin-bottom:4px;letter-spacing:.05em}',
    '.up{display:flex;gap:6px;margin-bottom:4px;font-size:9px;line-height:1.3}',
    '.up-date{flex-shrink:0;color:#fff;font-weight:700;font-size:8.5px;border-radius:3px;padding:2px 5px;height:16px}',
    '.up-names{color:#666;font-size:8px}',
    '.stack{display:flex;height:10px;border-radius:5px;overflow:hidden;gap:1px;background:#eef0f5}.stack i{display:block;height:100%}',
    '.leg{margin-top:6px;font-size:9px}.leg div{display:flex;align-items:center;gap:5px;margin-bottom:2px}.leg i{width:8px;height:8px;border-radius:50%;display:inline-block}.leg b{margin-left:auto}',
    '.hp{display:flex;align-items:center;gap:6px;font-size:9px;margin-bottom:3px}.hp-n{width:44px;font-weight:700}.hp-t{flex:1;height:6px;background:#eef0f5;border-radius:3px;overflow:hidden}.hp-t i{display:block;height:100%;background:#2f4bd0}',
    '.ft{font-size:7.5px;color:#888;display:flex;justify-content:space-between}',
    '@media print{html,body{background:#fff}.toolbar{display:none}.page{margin:0;box-shadow:none;width:100%;height:196mm}}'
  ].join('\n');
  var legend='<span><i style="background:#2f4bd0"></i>Embarcados</span><span><i style="background:#1fc98e"></i>Folga emb.</span><span><i style="background:#fb923c"></i>FOLGA</span>';
  return '<!doctype html><html><head><meta charset="utf-8"><title>Painel de Embarques — '+s0+' a '+e0+'</title><style>'+css+'</style></head><body>'
    +'<div class="toolbar"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>'
    +'<div class="page">'
    +'<div class="hd"><h1>Painel de Embarques</h1><div class="per"><b>'+s0+' → '+e0+'</b> · '+nd+' dia'+(nd!==1?'s':'')+'<br>Hoje: '+DATES[T_IDX]+'</div></div>'
    +'<div class="kpis">'+kpi+'</div>'
    +'<div class="row r2"><div class="box"><div class="box-h">Distribuição de status <span>dias · técnicos juntos contam uma vez</span></div>'+_boardStatusCols()+'</div>'
    +'<div class="box"><div class="box-h">Ocupação no período <span>'+legend+'</span></div><div class="chart">'+_boardLineSvg()+'</div></div></div>'
    +'<div class="row r3"><div class="box"><div class="box-h">Embarques por projeto <span><span><i style="background:#e85b5b"></i>Realizado</span><span><i style="background:#2f4bd0"></i>Em andamento</span><span><i style="background:#eab308"></i>Previsto</span></span></div>'+_boardProjects()+'</div>'
    +'<div class="box"><div class="box-h">Próximos 14 dias</div>'+_boardUpcoming()+'</div>'
    +'<div class="box"><div class="box-h">Equipe hoje <span>'+TECS.length+' técnicos</span></div>'+_boardToday()+'</div></div>'
    +'<div class="ft"><span>Controle de Escala — Técnicos Embarcados</span><span>Gerado em '+new Date().toLocaleString('pt-BR')+' · Embarque = técnicos que subiram no mesmo dia pro mesmo projeto</span></div>'
    +'</div></body></html>';
}

function openBoard(){
  var html=buildBoardHtml();
  var win=window.open('', '_blank');
  if(!win){ toast('Habilite pop-ups para gerar o dashboard', '#e85b5b'); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(function(){ try{ win.focus(); win.print(); }catch(e){} }, 450);
}
