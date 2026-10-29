/* ── TomadorController: relatório "Tomador de Obras" ──
   Para cada técnico, em que EMPRESA (tomador) ele estava prestando serviço em cada trecho do período:
   folga / base / férias / treinamento = TISI; plataforma Petrobras = Petrobras (por unidade); MV-22 = MODEC; etc.
   Saída igual ao modelo "4 - Tomador Obra.xlsx": Matrícula | Nome | Início | Final | Retorno | Qtde | Lotação | Descrição Lotação,
   um trecho por linha. Final = último dia no tomador; Retorno = Final + 1 (já é o início do trecho seguinte);
   Qtde = dias do trecho. As regras status → tomador ficam editáveis na própria janela (salvas neste navegador). */
var TM_TISI='TISI DO BRASIL - SERVICOS INDUSTRIAIS LTDA.';
var TM_STORE='ec_tomador_rules_v1';
var TM_PETRO='PETROLEO BRASILEIRO S A PETROBRAS - UN - ';
/* tabela "Locações-Obras" do modelo: nome → CNPJ (só os que têm CNPJ efetivo no modelo; os demais saem 0, como lá) */
var TM_LOCS=[
  {n:TM_TISI,c:'05.217.376/0013-00'},
  {n:'MODEC SERVIÇOS DE PETROLEO DO BRASIL LTDA - M22',c:''},
  {n:'MODEC SERVIÇOS DE PETROLEO DO BRASIL LTDA - M20',c:'20.969.503/0001-87'},
  {n:TM_PETRO+'SAN-1 - P-67',c:''},{n:TM_PETRO+'SAN-1 - P-68',c:''},{n:TM_PETRO+'SAN-1 - P-69',c:''},
  {n:TM_PETRO+'SAN-1 - P-54',c:''},{n:TM_PETRO+'SAN-1 - P-52',c:''},{n:'PETROLEO BRASILEIO S A PETROBRAS - UN - SAN-1 - P-66',c:''},
  {n:TM_PETRO+'SAN-1 - P-62',c:''},{n:TM_PETRO+'SAN-1- P-70',c:''},
  {n:TM_PETRO+'SAN-2 - PNA-1',c:''},{n:TM_PETRO+'SAN-2 - P-MLZ',c:''},{n:TM_PETRO+'SAN-2 - P-MXL',c:''},
  {n:TM_PETRO+'BUZ - P-75',c:''},{n:TM_PETRO+'BUZ - P-74',c:''},{n:TM_PETRO+'BUZ - P-77',c:''},{n:TM_PETRO+'BUZ - P-76',c:''},
  {n:'PETROLEO BRASILEIRO S A PETROBRAS - IBIRITÉ',c:''},
  {n:'FÉRIAS',c:''},{n:'DESLIGADO',c:''},{n:'AFASTADO',c:'33.000.167/0377-06'},
  {n:'ENGIE',c:''},{n:'NOVELIS DO BRASIL LTDA',c:''},{n:'NTS',c:''},{n:'OCYAN - PIONEIRA LIBRA',c:''},{n:'USIMINAS - IPATINGA',c:''},
  {n:'SUZANO MUCURI',c:''},{n:'BRAVA - 3R-3',c:''},{n:'MISC - FPSO',c:''},{n:'GERDAU - OURO BRANCO',c:''},
  {n:'HTT',c:''},{n:'HTS',c:''},{n:'CBSP',c:''},{n:'ASO',c:''},{n:'PEAT',c:''},{n:'T-HUET',c:''}
];
function _tmCnpj(name){
  for(var i=0;i<TM_LOCS.length;i++) if(TM_LOCS[i].n===name) return TM_LOCS[i].c||0;
  return 0;
}

/* status → chave normalizada (sem acento/ponto, variações da planilha unificadas) */
function _tmKey(s){
  var k=String(s==null?'':s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\./g,'').replace(/\s+/g,' ').trim();
  if(k==='TREIN') k='TREINAM';
  if(k==='P-MXL') k='PMXL';
  if(k==='P-MLZ') k='PMLZ';
  if(k==='DISP') k='FOLGA';
  if(k==='T-HUET') k='THUET';
  return k;
}
var TM_TRANSIT={MOB:1,EMB:1,TEMB:1};  // dias de viagem: seguem o tomador do destino (próxima plataforma)
function _tmDefaultRules(){
  var r={}, P=function(unit,p){return TM_PETRO+unit+' - '+p;};
  ['FOLGA','F.EMB','BASE','FERIAS','TREINAM','CURSO','IRATA','PT','NR','NRS','JOTUN','MAT','DES','THUET'].forEach(function(k){r[_tmKey(k)]=TM_TISI;});
  r.FEMB=TM_TISI;
  r['REGRA/OURO']='PETROLEO BRASILEIRO S A PETROBRAS - IBIRITÉ';
  r.IBIRITE='PETROLEO BRASILEIRO S A PETROBRAS - IBIRITÉ';
  r.ASO=TM_TISI; r.CBSP=TM_TISI; r.PEAT=TM_TISI;
  r.HTT='HTT'; r.HTS='HTS';
  r.AFASTADO='AFASTADO'; r.INSS='AFASTADO'; r.DESLIGADO='DESLIGADO';
  ['P-67','P-68','P-69','P-54','P-52','P-62'].forEach(function(p){r[p]=P('SAN-1',p);});
  r['P-66']='PETROLEO BRASILEIO S A PETROBRAS - UN - SAN-1 - P-66';
  r['P-70']=TM_PETRO+'SAN-1- P-70';
  r['PNA-1']=P('SAN-2','PNA-1'); r.PMLZ=P('SAN-2','P-MLZ'); r.PMXL=P('SAN-2','P-MXL');
  ['P-75','P-74','P-77','P-76'].forEach(function(p){r[p]=P('BUZ',p);});
  r['MV-22']='MODEC SERVIÇOS DE PETROLEO DO BRASIL LTDA - M22';
  r['MV-20']='MODEC SERVIÇOS DE PETROLEO DO BRASIL LTDA - M20';
  r.ENGIE='ENGIE'; r.NOVELIS='NOVELIS DO BRASIL LTDA'; r.NTS='NTS'; r.OCYAN='OCYAN - PIONEIRA LIBRA'; r.USIMINAS='USIMINAS - IPATINGA';
  r.SUZANO='SUZANO MUCURI'; r['3R-3']='BRAVA - 3R-3'; r.MISC='MISC - FPSO'; r.GERDAU='GERDAU - OURO BRANCO';
  return r;
}
var TM_RULES=(function(){
  var r=_tmDefaultRules();
  try{ var s=JSON.parse(localStorage.getItem(TM_STORE)||'null'); if(s&&typeof s==='object') Object.keys(s).forEach(function(k){r[k]=s[k];}); }catch(e){}
  return r;
})();
function _tmSaveRules(){
  var def=_tmDefaultRules(), diff={};
  Object.keys(TM_RULES).forEach(function(k){ if(def[k]!==TM_RULES[k]) diff[k]=TM_RULES[k]; });
  try{ localStorage.setItem(TM_STORE,JSON.stringify(diff)); }catch(e){}
}

/* tomador de um dia. unknown (opcional) coleta statuses sem regra (caem em TISI). */
function _tmDay(t, i, unknown){
  var key=_tmKey(t.d[i]);
  if(key==='') return TM_TISI;
  if(TM_TRANSIT[key]) return _tmDestino(t,i);
  if(key==='HOTEL'){
    // hotel colado numa viagem (MOB/EMB/T.EMB) é do destino; hotel isolado (esperando embarque a partir da folga) é TISI
    var k=i-1; while(k>=0&&_tmKey(t.d[k])==='HOTEL') k--;
    return (k>=0&&TM_TRANSIT[_tmKey(t.d[k])])?_tmDestino(t,i):TM_TISI;
  }
  var loc=TM_RULES[key];
  if(!loc){ if(unknown) unknown[key]=(unknown[key]||0)+1; return TM_TISI; }
  return loc;
}
function _tmDestino(t, i){
  var j=i; while(j<DATES.length&&(TM_TRANSIT[_tmKey(t.d[j])]||_tmKey(t.d[j])==='HOTEL')) j++;
  var key=j<DATES.length?_tmKey(t.d[j]):'';
  var loc=key?TM_RULES[key]:null;
  return loc||TM_TISI;
}

/* trechos do técnico no período: dias seguidos no mesmo tomador viram uma linha */
function _tmSegments(t, s, e, unknown){
  var segs=[], cur=null;
  for(var i=s;i<=e;i++){
    var loc=_tmDay(t,i,unknown);
    if(cur&&cur.loc===loc){ cur.end=i; }
    else{ cur={loc:loc,start:i,end:i}; segs.push(cur); }
  }
  return segs;
}
function _tmDate(idx){ var p=DATES[idx].split('/'); return new Date(+p[2],+p[1]-1,+p[0]); }
function _tmValidMat(t){ return /^\d{5,}$/.test(String(t.s==null?'':t.s).trim())&&String(t.s).trim()!=='0'; }

/* linhas do relatório: [matrícula, nome, início, final, retorno, qtde, cnpj, descrição] */
function tmBuildRows(s, e, tis){
  var rows=[], unknown={}, perLoc={};
  tis.slice().sort(function(a,b){return TECS[a].n.localeCompare(TECS[b].n);}).forEach(function(ti){
    var t=TECS[ti];
    _tmSegments(t,s,e,unknown).forEach(function(g){
      var ret=_tmDate(g.end); ret.setDate(ret.getDate()+1);
      var qtd=g.end-g.start+1;
      rows.push([_tmValidMat(t)?+String(t.s).trim():'', t.n, _tmDate(g.start), _tmDate(g.end), ret, qtd, _tmCnpj(g.loc), g.loc]);
      perLoc[g.loc]=(perLoc[g.loc]||0)+qtd;
    });
  });
  return {rows:rows,unknown:unknown,perLoc:perLoc};
}

/* ── janela ──
   O relatório é MENSAL: do dia 1 ao último dia do mês escolhido; o Retorno do último trecho é o dia 1 do mês seguinte. */
var _tm={s:0,e:0,sel:{}};
function _tmMonthVal(offset){
  var n=new Date(), d=new Date(n.getFullYear(),n.getMonth()+offset,1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function openTomadorModal(){
  document.getElementById('tmMonth').value=_tmMonthVal(-1);
  document.getElementById('tomadorOverlay').classList.add('open');
  tmAutoSelect();
  tmRecalc();
}
/* por padrão entram os técnicos com matrícula OU com algum status lançado no período (quem não tem nenhum dos dois, em geral, saiu) */
function tmAutoSelect(){
  var rg=_tmRange(); _tm.sel={};
  TECS.forEach(function(t,ti){
    var any=false;
    if(rg){ for(var i=rg.s;i<=rg.e&&!any;i++) if((t.d[i]||'').trim()) any=true; }
    _tm.sel[ti]=_tmValidMat(t)||any;
  });
}
function closeTomador(){document.getElementById('tomadorOverlay').classList.remove('open');}
function tmQuick(kind){
  document.getElementById('tmMonth').value=_tmMonthVal(kind==='prev'?-1:0);
  tmMonthChange();
}
function tmMonthChange(){ tmAutoSelect(); tmRecalc(); }
function tmToggleTec(ti,on){ _tm.sel[ti]=!!on; tmRecalc(); }
function tmSetRule(sel){ TM_RULES[sel.getAttribute('data-k')]=sel.value; _tmSaveRules(); tmRecalc(); }
function tmResetRules(){
  TM_RULES=_tmDefaultRules(); try{localStorage.removeItem(TM_STORE);}catch(e){}
  tmRecalc();
}
/* mês escolhido (aaaa-mm) → índices do 1º e do último dia no calendário do sistema */
function _tmRange(){
  var m=String(document.getElementById('tmMonth').value||'').match(/^(\d{4})-(\d{2})$/);
  if(!m) return null;
  var y=+m[1], mo=+m[2];
  var last=new Date(y,mo,0).getDate(), pad=function(n){return String(n).padStart(2,'0');};
  var f=idxOf('01/'+pad(mo)+'/'+y), t=idxOf(pad(last)+'/'+pad(mo)+'/'+y);
  return (f===null||t===null)?null:{s:f,e:t};
}

function tmRecalc(){
  var rg=_tmRange(), box=document.getElementById('tmPreview');
  var applyBtn=document.getElementById('tmGenBtn');
  if(!rg){ box.innerHTML='<div class="si-warn">Escolha um período válido dentro do calendário do sistema.</div>'; applyBtn.disabled=true; return; }
  _tm.s=rg.s; _tm.e=rg.e;
  var nxt=_tmDate(rg.e); nxt.setDate(nxt.getDate()+1);
  var f2=function(d){return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();};
  document.getElementById('tmRangeLbl').textContent=DATES[rg.s]+' a '+DATES[rg.e]+' · '+(rg.e-rg.s+1)+' dias · Retorno do último trecho: '+f2(nxt);
  var tis=Object.keys(_tm.sel).filter(function(k){return _tm.sel[k];}).map(Number);
  var res=tmBuildRows(rg.s,rg.e,tis);
  _tm.last=res;
  // técnicos (marcar/desmarcar)
  document.getElementById('tmTecs').innerHTML=TECS.map(function(t,ti){
    return '<label class="tm-tec"><input type="checkbox" '+(_tm.sel[ti]?'checked':'')+' onchange="tmToggleTec('+ti+',this.checked)"> '+escAttr(t.n)+(_tmValidMat(t)?'':' <span class="tm-nomat">sem matrícula</span>')+'</label>';
  }).join('');
  // regras: statuses presentes no período (dos técnicos marcados) + os sem regra
  var present={}; tis.forEach(function(ti){ for(var i=rg.s;i<=rg.e;i++){ var k=_tmKey(TECS[ti].d[i]); if(k&&!TM_TRANSIT[k]&&k!=='HOTEL') present[k]=(present[k]||0)+1; } });
  var locOpts=TM_LOCS.map(function(l){return l.n;});
  var rulesH=Object.keys(present).sort().map(function(k){
    var cur=TM_RULES[k], known=!!cur;
    var opts=locOpts.map(function(n){return '<option value="'+escAttr(n)+'"'+(n===(cur||TM_TISI)?' selected':'')+'>'+escAttr(n.length>52?n.slice(0,50)+'…':n)+'</option>';}).join('');
    return '<div class="tm-rule"><span class="tm-st">'+escAttr(k)+'</span><span class="tm-n">'+present[k]+'d</span>'
      +'<select class="imp-select'+(known?'':' no-match')+'" data-k="'+escAttr(k)+'" onchange="tmSetRule(this)">'+opts+'</select>'+(known?'':'<span class="tm-warn">sem regra → TISI</span>')+'</div>';
  }).join('');
  document.getElementById('tmRules').innerHTML=rulesH||'<div class="si-empty">Nenhum status no período.</div>';
  // resumo + tabela
  var nT=tis.length, nR=res.rows.length;
  var locs=Object.keys(res.perLoc).sort(function(a,b){return res.perLoc[b]-res.perLoc[a];});
  var h='<div class="imp-stats"><span><b>'+nR+'</b> linha'+(nR!==1?'s':'')+' · <b>'+nT+'</b> técnico'+(nT!==1?'s':'')+' · '+(rg.e-rg.s+1)+' dias</span></div>'
    +'<div class="tm-sum">'+locs.slice(0,8).map(function(l){return '<span class="tm-chip"><b>'+res.perLoc[l]+'d</b> '+escAttr(l.length>40?l.slice(0,38)+'…':l)+'</span>';}).join('')+(locs.length>8?'<span class="tm-chip">+'+(locs.length-8)+' tomadores</span>':'')+'</div>';
  var unk=Object.keys(res.unknown);
  if(unk.length) h+='<div class="si-warn">Status sem regra (contados como TISI): '+unk.map(function(k){return escAttr(k)+' ('+res.unknown[k]+'d)';}).join(', ')+' — ajuste em "Regras" abaixo.</div>';
  h+='<div class="si-diff"><table class="si-tbl"><thead><tr><th>Matrícula</th><th>Nome</th><th>Início</th><th>Final</th><th>Retorno</th><th>Qtde</th><th>Tomador</th></tr></thead><tbody>'
    +res.rows.map(function(r){
      var d=function(x){return String(x.getDate()).padStart(2,'0')+'/'+String(x.getMonth()+1).padStart(2,'0');};
      return '<tr><td class="mono">'+(r[0]||'')+'</td><td>'+escAttr(r[1])+'</td><td class="mono">'+d(r[2])+'</td><td class="mono">'+d(r[3])+'</td><td class="mono">'+d(r[4])+'</td><td class="mono">'+r[5]+'</td><td>'+escAttr(r[7].length>46?r[7].slice(0,44)+'…':r[7])+'</td></tr>';
    }).join('')+'</tbody></table></div>';
  box.innerHTML=h;
  applyBtn.disabled=!nR;
}

function generateTomador(){
  var rg=_tmRange(); if(!rg||!_tm.last||!_tm.last.rows.length) return;
  var rows=_tm.last.rows;
  var mm=String(_tmDate(rg.s).getMonth()+1).padStart(2,'0'), yy=String(_tmDate(rg.s).getFullYear()).slice(2);
  var aoa=[['Matrícula','Nome','Início','Final','Retorno','Qtde','Lotação','Descrição Lotação']].concat(rows);
  var ws=XLSX.utils.aoa_to_sheet(aoa,{cellDates:true});
  ws['!cols']=[{wch:12},{wch:38},{wch:12},{wch:12},{wch:12},{wch:7},{wch:20},{wch:56}];
  for(var r=1;r<aoa.length;r++) ['C','D','E'].forEach(function(c){ var cell=ws[c+(r+1)]; if(cell) cell.z='dd/mm/yyyy'; });
  var legend=[['Locações','CNPJ']].concat(TM_LOCS.map(function(l){return [l.n,l.c];}));
  var ws2=XLSX.utils.aoa_to_sheet(legend); ws2['!cols']=[{wch:60},{wch:22}];
  var wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Tomador-Obras-'+mm+'-'+yy);
  XLSX.utils.book_append_sheet(wb,ws2,'Locações-Obras');
  var fname='Tomador Obra '+mm+'-'+yy+'.xlsx';
  XLSX.writeFile(wb,fname,{cellDates:true});
  closeTomador();
  toast('Relatório gerado: '+fname,'#1fc98e');
}

/* leques do cabeçalho (Relatório e Importar): um aberto por vez; fecha ao clicar fora ou com Esc */
function _toggleMenu(ev, id){
  if(ev) ev.stopPropagation();
  var m=document.getElementById(id), was=m.classList.contains('open');
  closeReportMenu();
  if(!was) m.classList.add('open');
}
function toggleReportMenu(ev){ _toggleMenu(ev,'reportMenu'); }
function toggleImportMenu(ev){ _toggleMenu(ev,'importMenu'); }
function closeReportMenu(){ document.querySelectorAll('.rep-menu.open').forEach(function(m){m.classList.remove('open');}); }
document.addEventListener('click',function(e){ if(!e.target.closest||!e.target.closest('.rep-wrap')) closeReportMenu(); });
document.addEventListener('keydown',function(e){ if(e.key==='Escape') closeReportMenu(); });
