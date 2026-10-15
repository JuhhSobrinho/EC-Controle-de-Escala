/* ── ScaleImportController: importar a escala (status / folga 100% / observação) de um .xlsx ──
   Lê o mesmo formato que o botão "Relatório" gera: uma aba por técnico, colunas
   Data | Dia | Local / Status | 100% | Horas | Observação. O usuário escolhe o período a importar,
   vê uma prévia do que vai mudar (antes → depois) e só então grava no banco.
   A coluna "Horas" do relatório é a previsão por status (não são horas reais), então é ignorada. */
var _si = null; // {sheets:[{name, ti, rows:{iso:{status,cem,obs}}}], fileMin, fileMax, diffs:[]}

function _siNorm(s){return String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();}
function _siPad(n){return String(n).padStart(2,'0');}

/* aceita Date, serial do Excel ou texto dd/mm/aaaa — devolve ISO (aaaa-mm-dd) ou null */
function _siDateISO(v){
  if(v instanceof Date && !isNaN(v)) return v.getFullYear()+'-'+_siPad(v.getMonth()+1)+'-'+_siPad(v.getDate());
  if(typeof v==='number' && v>20000 && v<80000){
    var p=XLSX.SSF.parse_date_code(v);
    return p?p.y+'-'+_siPad(p.m)+'-'+_siPad(p.d):null;
  }
  var m=String(v==null?'':v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m?m[3]+'-'+_siPad(+m[2])+'-'+_siPad(+m[1]):null;
}

/* A planilha mestre escreve o status de jeitos diferentes do sistema ("FOLGA." x "FOLGA", "TREIN." x
   "TREINAM.", "P-MXL" x "PMXL", "DISP" = disponível = FOLGA, "FÉRIAS"/"FERIAS", "EMB."/"EMB", "DES."/"DES",
   maiúsculas/minúsculas). _siKey ignora essas variações pra não gerar "alteração" onde só mudou a grafia;
   _siCanon devolve a grafia que o sistema usa pro que for realmente importado. */
function _siKey(s){
  var k=String(s==null?'':s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\./g,'').replace(/\s+/g,' ').trim();
  if(k==='TREIN') k='TREINAM';
  if(k==='P-MXL') k='PMXL';
  if(k==='DISP') k='FOLGA';
  return k;
}
var _SI_CANON={'FOLGA.':'FOLGA','DISP':'FOLGA','HOTEL.':'HOTEL','BASE.':'BASE','T.EMB.':'T.EMB','TREIN.':'TREINAM.','P-MXL':'PMXL','MOB':'MOB.','FERIAS':'FÉRIAS'};
function _siCanon(s){
  var u=String(s==null?'':s).trim().toUpperCase();
  return _SI_CANON[u]||u;
}

/* Formato "planilha mestre" (MOD-Projetos): cabeçalho com NOME / FUNÇÃO / SISPAT e uma coluna por data;
   uma linha por técnico, até a primeira linha em branco (abaixo ficam legendas e totais, que são ignorados). */
/* nota/comentário da célula (o Excel grava "Autor:<quebra de linha>Texto" nas notas — tira o prefixo do autor) */
function _siCellNote(ws, r, c){
  var cell=ws[XLSX.utils.encode_cell({r:r,c:c})];
  if(!cell||!cell.c||!cell.c.length) return '';
  var txt=cell.c.map(function(x){return x.t||'';}).join('\n'), a=(cell.c[0].a||'').trim();
  if(a&&txt.indexOf(a+':')===0) txt=txt.slice(a.length+1);
  return txt.replace(/\s+\n/g,'\n').trim();
}

function _siParseGrid(ws){
  var aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});
  var rg=XLSX.utils.decode_range(ws['!ref']||'A1'), r0=rg.s.r, c0=rg.s.c;
  var h=-1, cols=[];
  for(var r=0;r<Math.min(8,aoa.length)&&h<0;r++){
    if(_siNorm(aoa[r][0])!=='nome') continue;
    var c=[];
    aoa[r].forEach(function(v,i){ if(i>=3){var iso=_siDateISO(v); if(iso) c.push({i:i,iso:iso});} });
    if(c.length>=10){h=r;cols=c;}
  }
  if(h<0) return null;
  var techs=[];
  for(var k=h+1;k<aoa.length;k++){
    var name=String(aoa[k][0]==null?'':aoa[k][0]).trim();
    if(!name) break;
    var rows={}, n=0;
    cols.forEach(function(cc){
      var v=aoa[k][cc.i];
      rows[cc.iso]={status:String(v==null?'':v).trim(),cem:false,obs:_siCellNote(ws,r0+k,c0+cc.i),hasCem:false,hasObs:true};
      n++;
    });
    techs.push({name:name,sispat:String(aoa[k][2]==null?'':aoa[k][2]).trim(),rows:rows,count:n,ti:-1});
  }
  return techs.length?techs:null;
}

function _siParseSheet(ws){
  var aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});
  var h=-1, col={};
  for(var r=0;r<Math.min(6,aoa.length)&&h<0;r++){
    var c={};
    aoa[r].forEach(function(v,i){
      var n=_siNorm(v);
      if(n==='data') c.data=i;
      else if(n==='local / status'||n==='status'||n==='local') c.status=i;
      else if(n==='100%') c.cem=i;
      else if(n==='observacao'||n==='observacoes') c.obs=i;
    });
    if(c.data!==undefined&&c.status!==undefined){h=r;col=c;}
  }
  if(h<0) return null;
  var rows={}, n=0;
  for(var i=h+1;i<aoa.length;i++){
    var iso=_siDateISO(aoa[i][col.data]);
    if(!iso) continue;
    var cem=col.cem!==undefined?String(aoa[i][col.cem]).trim():'';
    rows[iso]={
      status:String(aoa[i][col.status]==null?'':aoa[i][col.status]).trim(),
      cem:(cem==='100%'||cem==='100'||cem==='1'),
      obs:col.obs!==undefined?String(aoa[i][col.obs]==null?'':aoa[i][col.obs]).trim():'',
      hasCem:col.cem!==undefined, hasObs:col.obs!==undefined
    };
    n++;
  }
  return {rows:rows,count:n};
}

function loadScaleFile(input){
  var file=input.files[0];
  if(!file) return;
  input.value='';
  document.getElementById('scaleImpOverlay').classList.add('open');
  document.getElementById('siSub').textContent='Lendo arquivo...';
  document.getElementById('siBody').innerHTML='<div style="text-align:center;padding:2rem;color:var(--text3)">Processando...</div>';
  document.getElementById('siApplyBtn').disabled=true;
  var reader=new FileReader();
  reader.onload=function(e){
    // setTimeout: deixa a mensagem "Processando..." aparecer antes do parse, que em planilha grande bloqueia a tela
    setTimeout(function(){
      try{
        var data=e.target.result, kind='report', sheets=[], skipped=[];
        // 1) planilha mestre (MOD-Projetos): lê SÓ a aba candidata — o arquivo pode ter abas com 1 milhão de linhas
        var names=XLSX.read(data,{type:'array',bookSheets:true}).SheetNames;
        var cand=names.filter(function(n){return /^mod/i.test(n);});
        if(!cand.length) cand=names.slice(0,1);
        for(var ci=0;ci<cand.length&&!sheets.length;ci++){
          var wbg=XLSX.read(data,{type:'array',cellDates:true,sheets:[cand[ci]]});
          var g=_siParseGrid(wbg.Sheets[cand[ci]]);
          if(g){kind='grid';sheets=g;}
        }
        // 2) senão, formato do Relatório: uma aba por técnico
        if(!sheets.length){
          var wb=XLSX.read(data,{type:'array',cellDates:true});
          wb.SheetNames.forEach(function(name){
            var p=_siParseSheet(wb.Sheets[name]);
            if(p&&p.count) sheets.push({name:name,rows:p.rows,count:p.count,ti:-1}); else skipped.push(name);
          });
        }
        if(!sheets.length) throw new Error('não encontrei nem a planilha mestre (cabeçalho NOME + datas) nem abas no formato do Relatório (colunas Data e Local / Status)');
        _si={kind:kind,sheets:sheets,skipped:skipped,diffs:[]};
        _siAutoMatch();
        var all=[]; sheets.forEach(function(s){all=all.concat(Object.keys(s.rows));});
        all.sort();
        _si.fileMin=all[0]; _si.fileMax=all[all.length-1];
        _siBuildUI();
      }catch(err){
        document.getElementById('siSub').textContent='Erro ao ler o arquivo';
        document.getElementById('siBody').innerHTML='<div style="color:var(--over);padding:1rem">'+escAttr(err.message)+'</div>';
      }
    },60);
  };
  reader.readAsArrayBuffer(file);
}

/* nome da aba → técnico (mesma lógica do import de horas; a aba vem cortada em 28 caracteres) */
function _siAutoMatch(){
  var scores=[];
  _si.sheets.forEach(function(s,i){
    // 1º SISPAT (único por pessoa; "0"/"R7" etc. na planilha não valem), 2º nome parecido
    var bySispat=-1;
    if(s.sispat&&s.sispat!=='0'){
      TECS.forEach(function(t,ti){ if(bySispat<0&&String(t.s||'').trim()===s.sispat) bySispat=ti; });
    }
    if(bySispat>=0){ s.ti=bySispat; scores[i]=2; return; }
    var m=bestMatch(s.name);
    s.ti=m.score>=0.5?m.ti:-1; scores[i]=m.score;
  });
  var best={};
  _si.sheets.forEach(function(s,i){
    if(s.ti<0) return;
    if(!best[s.ti]||scores[i]>scores[best[s.ti]]) best[s.ti]=i;
  });
  _si.sheets.forEach(function(s,i){ if(s.ti>=0&&best[s.ti]!==i) s.ti=-1; });
}

function _siBuildUI(){
  var matched=_si.sheets.filter(function(s){return s.ti>=0;}).length;
  var tecOptions='<option value="-1">— não importar —</option>'+TECS.map(function(t,ti){return '<option value="'+ti+'">'+escAttr(t.n)+'</option>';}).join('');
  var sheetRows=_si.sheets.map(function(s,i){
    var opts=tecOptions.replace('value="'+s.ti+'"','value="'+s.ti+'" selected');
    var badge=s.ti>=0?'<span class="imp-badge-ok"></span>':'<span class="imp-badge-err"></span>';
    return '<div class="imp-match-row"><div class="imp-name">'+badge+escAttr(s.name)+'</div><div class="imp-arrow">→</div>'
      +'<select class="imp-select'+(s.ti<0?' no-match':'')+'" data-si="'+i+'" onchange="siSheetMap(this)">'+opts+'</select></div>';
  }).join('');
  var minISO=_si.fileMin, maxISO=_si.fileMax, grid=_si.kind==='grid';
  document.getElementById('siSub').textContent=(grid?'Planilha mestre · '+_si.sheets.length+' técnicos':_si.sheets.length+' abas')+' · '+matched+' casados · '+fromISO(minISO)+' a '+fromISO(maxISO);
  document.getElementById('siBody').innerHTML=
    '<div class="form-label">Período a importar</div>'
    +'<div class="si-row"><input class="date-input" type="date" id="siFrom" onchange="siRecalc()"><span class="dash-sep">→</span><input class="date-input" type="date" id="siTo" onchange="siRecalc()"></div>'
    +'<div class="si-row"><button class="period-btn" onclick="siQuick(\'file\')">Período do arquivo</button><button class="period-btn" onclick="siQuick(\'month\')">Este mês</button><button class="period-btn" onclick="siQuick(\'future\')">De hoje em diante</button></div>'
    +'<div class="form-label" style="margin-top:6px">O que importar</div>'
    +'<div class="si-row si-opts"><label><input type="checkbox" id="siOptStatus" checked onchange="siRecalc()"> Status</label>'
    +(grid?'<input type="checkbox" id="siOptFolga" style="display:none"><label><input type="checkbox" id="siOptObs" checked onchange="siRecalc()"> Observações (notas das células)</label>'
      :'<label><input type="checkbox" id="siOptFolga" checked onchange="siRecalc()"> Folga (100%)</label>'
       +'<label><input type="checkbox" id="siOptObs" checked onchange="siRecalc()"> Observações</label>')+'</div>'
    +'<label class="si-clear"><input type="checkbox" id="siOptClear" onchange="siRecalc()"> Célula vazia na planilha <b>apaga</b> o valor que está no sistema (desmarcado = só preenche e altera)</label>'
    +(grid?'<div class="si-note">Grafias equivalentes não contam como alteração (FOLGA. = FOLGA, TREIN. = TREINAM., P-MXL = PMXL, DISP = FOLGA, EMB. = EMB, DES. = DES). Ao importar, o status vai na grafia do sistema.</div>':'')
    +'<div id="siPreview"></div>'
    +'<details class="si-sheets"><summary>'+(grid?'Técnicos da planilha':'Abas e técnicos')+' ('+matched+'/'+_si.sheets.length+' casados'+(grid?', por SISPAT ou nome':'')+')</summary><div style="margin-top:6px">'+sheetRows+'</div></details>'
    +(_si.skipped.length?'<div class="si-warn">Abas ignoradas (sem as colunas Data e Local / Status): '+_si.skipped.map(escAttr).join(', ')+'</div>':'');
  var d0=toISO(DATES[0]), d1=toISO(DATES[DATES.length-1]);
  var lo=minISO<d0?d0:minISO, hi=maxISO>d1?d1:maxISO;
  document.getElementById('siFrom').value=lo;
  document.getElementById('siTo').value=hi<lo?lo:hi;
  siRecalc();
}

function siSheetMap(sel){
  var s=_si.sheets[+sel.getAttribute('data-si')];
  s.ti=parseInt(sel.value);
  sel.className='imp-select'+(s.ti<0?' no-match':'');
  siRecalc();
}
function siQuick(kind){
  var f=document.getElementById('siFrom'), t=document.getElementById('siTo');
  var now=new Date(), iso=function(d){return d.getFullYear()+'-'+_siPad(d.getMonth()+1)+'-'+_siPad(d.getDate());};
  if(kind==='file'){f.value=_si.fileMin;t.value=_si.fileMax;}
  else if(kind==='month'){f.value=iso(new Date(now.getFullYear(),now.getMonth(),1));t.value=iso(new Date(now.getFullYear(),now.getMonth()+1,0));}
  else{f.value=iso(now);t.value=_si.fileMax<iso(now)?iso(now):_si.fileMax;}
  siRecalc();
}

/* monta a lista de diferenças (arquivo × sistema) dentro do período e das opções marcadas */
function siRecalc(){
  var from=document.getElementById('siFrom').value, to=document.getElementById('siTo').value;
  var oS=document.getElementById('siOptStatus').checked, oF=document.getElementById('siOptFolga').checked,
      oO=document.getElementById('siOptObs').checked, oC=document.getElementById('siOptClear').checked;
  var diffs=[], outside=0, byField={status:0,folga:0,obs:0}, techs={};
  _si.sheets.forEach(function(s){
    if(s.ti<0) return;
    var t=TECS[s.ti];
    Object.keys(s.rows).sort().forEach(function(iso){
      if((from&&iso<from)||(to&&iso>to)) return;
      var di=idxOf(fromISO(iso));
      if(di===null){outside++;return;}
      var r=s.rows[iso], patch={}, lines=[];
      var oldS=(t.d[di]||'').trim(), oldF=t.fo[di]?1:0, oldO=(t.obs[di]||'').trim();
      var newS=oldS;
      if(oS&&(r.status!==''||oC)&&_siKey(r.status)!==_siKey(oldS)){
        var ns=_siCanon(r.status);
        patch.status=ns;newS=ns;lines.push(['Status',oldS||'—',ns||'—']);byField.status++;
      }
      if(oF&&r.hasCem){
        var impliedByStatus=newS.toUpperCase().indexOf('F.EMB')===0;
        if(r.cem&&!impliedByStatus&&!oldF){patch.folga_override=1;lines.push(['Folga','não','100%']);byField.folga++;}
        else if(!r.cem&&oldF&&oC){patch.folga_override=0;lines.push(['Folga','100%','não']);byField.folga++;}
      }
      if(oO&&r.hasObs&&(r.obs!==''||oC)&&r.obs!==oldO){patch.obs=r.obs;lines.push(['Obs.',oldO||'—',r.obs||'—']);byField.obs++;}
      if(lines.length){diffs.push({ti:s.ti,di:di,iso:iso,patch:patch,lines:lines});techs[s.ti]=true;}
    });
  });
  diffs.sort(function(a,b){return a.ti-b.ti||a.di-b.di;});
  _si.diffs=diffs;
  var nT=Object.keys(techs).length, el=document.getElementById('siPreview');
  var h='<div class="imp-stats" style="margin-top:12px"><span><b>'+diffs.length+'</b> dia'+(diffs.length!==1?'s':'')+' com alteração em <b>'+nT+'</b> técnico'+(nT!==1?'s':'')+'</span>'
    +'<span style="margin-left:auto;color:var(--text3)">status '+byField.status+' · folga '+byField.folga+' · obs. '+byField.obs+'</span></div>';
  if(outside) h+='<div class="si-warn">'+outside+' linha(s) fora do calendário do sistema foram ignoradas.</div>';
  if(!diffs.length) h+='<div class="si-empty">Nada para alterar nesse período — o sistema já está igual à planilha.</div>';
  else{
    var max=200;
    h+='<div class="si-diff"><table class="si-tbl"><thead><tr><th>Técnico</th><th>Dia</th><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead><tbody>'
      +diffs.slice(0,max).map(function(d){
        return d.lines.map(function(l,k){
          return '<tr>'+(k===0?'<td rowspan="'+d.lines.length+'">'+escAttr(TECS[d.ti].n.split(' ').slice(0,2).join(' '))+'</td><td rowspan="'+d.lines.length+'" class="mono">'+d.iso.slice(8)+'/'+d.iso.slice(5,7)+'</td>':'')
            +'<td>'+l[0]+'</td><td class="si-old">'+escAttr(l[1])+'</td><td class="si-new">'+escAttr(l[2])+'</td></tr>';
        }).join('');
      }).join('')+'</tbody></table></div>'
      +(diffs.length>max?'<div class="si-warn">Mostrando as primeiras '+max+' alterações — todas as '+diffs.length+' serão aplicadas.</div>':'');
  }
  el.innerHTML=h;
  var btn=document.getElementById('siApplyBtn');
  btn.disabled=!diffs.length;
  document.getElementById('siApplyLbl').textContent=diffs.length?'Aplicar '+diffs.length+' alteraç'+(diffs.length!==1?'ões':'ão'):'Aplicar';
}

function closeScaleImport(){document.getElementById('scaleImpOverlay').classList.remove('open');}

/* roda as tarefas com no máximo n requisições ao mesmo tempo */
async function _siPool(tasks, n){
  var i=0;
  async function worker(){ while(i<tasks.length){ var k=i++; await tasks[k](); } }
  var ws=[]; for(var w=0;w<Math.min(n,tasks.length);w++) ws.push(worker());
  await Promise.all(ws);
}

/* Grava em LOTE, porque importar um ano inteiro dá milhares de dias:
   - dias que já têm linha no banco: agrupa os que recebem exatamente o mesmo valor e faz UM update por grupo
     (update ... where id in (...)), em vez de um pedido por dia;
   - dias novos: insert em blocos de 200 linhas.
   Cada linha devolvida atualiza a tela (status, folga, obs, id) igual ao salvamento célula a célula. */
async function applyScaleImport(){
  if(!_si||!_si.diffs.length) return;
  if(AppState.offline){ markSyncError(); toast('Sem conexão com o banco — não é possível salvar','#e85b5b'); return; }
  if(isSyncPaused()){ toast('Sincronização pausada — clique em "Sincronizar" para retomar antes de importar','#f5a623'); return; }
  var btn=document.getElementById('siApplyBtn'); btn.disabled=true;
  var diffs=_si.diffs, total=diffs.length, done=0, errors=0, touched={}, now=new Date().toISOString();
  var lbl=document.getElementById('siApplyLbl');
  lbl.textContent='Salvando 0/'+total+'...';

  var tecIdx={}; TECS.forEach(function(t,ti){tecIdx[t.id]=ti;});
  var byRowId={}; // id da linha → diff (pra devolver o resultado ao lugar certo)
  var updGroups={}, inserts=[];
  diffs.forEach(function(d){
    var t=TECS[d.ti], rid=t.rowId[d.di];
    if(rid){
      byRowId[rid]=d;
      var k=JSON.stringify(d.patch);
      (updGroups[k]=updGroups[k]||{patch:d.patch,ids:[]}).ids.push(rid);
    }else inserts.push(d);
  });

  function apply(row, d){
    var t=TECS[d.ti];
    t.d[d.di]=row.status||'';
    t.fo[d.di]=row.folga_override||0;
    t.obs[d.di]=row.obs||'';
    t.rowId[d.di]=row.id;
    touched[d.ti]=true;
  }
  function tick(n){ done+=n; lbl.textContent='Salvando '+done+'/'+total+'...'; }

  var tasks=[];
  Object.keys(updGroups).forEach(function(k){
    var g=updGroups[k];
    for(var o=0;o<g.ids.length;o+=100){
      (function(ids){
        tasks.push(async function(){
          try{
            var res=await supabaseClient.from(EscalaModel.TABLE).update(Object.assign({},g.patch,{updated_at:now})).in('id',ids).select();
            if(res.error) throw res.error;
            res.data.forEach(function(row){ if(byRowId[row.id]) apply(row, byRowId[row.id]); });
            tick(ids.length);
          }catch(e){ console.error('applyScaleImport update', e); errors+=ids.length; tick(ids.length); }
        });
      })(g.ids.slice(o,o+100));
    }
  });
  for(var o2=0;o2<inserts.length;o2+=200){
    (function(chunk){
      tasks.push(async function(){
        try{
          var payload=chunk.map(function(d){
            return Object.assign({tecnico_id:TECS[d.ti].id, data:d.iso, status:''}, d.patch, {updated_at:now});
          });
          var res=await supabaseClient.from(EscalaModel.TABLE).insert(payload).select();
          if(res.error) throw res.error;
          res.data.forEach(function(row){
            var ti=tecIdx[row.tecnico_id], di=idxOf(fromISO(String(row.data).slice(0,10)));
            if(ti!==undefined&&di!==null) apply(row, {ti:ti,di:di});
          });
          tick(chunk.length);
        }catch(e){ console.error('applyScaleImport insert', e); errors+=chunk.length; tick(chunk.length); }
      });
    })(inserts.slice(o2,o2+200));
  }
  await _siPool(tasks, 4);

  closeScaleImport();
  buildTable();
  try{ buildWeeklySummary(); }catch(e){}
  try{ refreshDash(); }catch(e){}
  if(errors) markSyncError(); else markSyncOk();
  var ok=total-errors;
  toast('✓ '+ok+' alteraç'+(ok!==1?'ões':'ão')+' importada'+(ok!==1?'s':'')+' em '+Object.keys(touched).length+' técnico(s)'+(errors?' · '+errors+' com erro':''), errors?'#e85b5b':'#1fc98e');
}
