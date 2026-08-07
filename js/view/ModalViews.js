/* ── ModalViews: abrir/preencher/fechar modais (sem gravar no banco — isso é dos controllers) ── */

function buildStatusGrid(elId,current,onSelect){
  var el=document.getElementById(elId);
  var html=STATUSES.map(function(s){
    var active=current===s.v;
    return '<div class="status-opt b '+s.cls+(active?' sel':'')+'" data-v="'+s.v+'" style="'+(active?'border:2px solid currentColor':'')+'">'+(s.label)+'</div>';
  }).join('')+'<div class="status-opt clear-opt" data-v="" style="'+(current===''?'border:2px solid var(--text3)':'')+'">Limpar</div>';
  el.innerHTML=html;
  el.querySelectorAll('.status-opt').forEach(function(opt){
    opt.addEventListener('click',function(){
      el.querySelectorAll('.status-opt').forEach(function(o){o.classList.remove('sel');o.style.border='';});
      var v=opt.dataset.v;
      opt.classList.add('sel');
      opt.style.border=v?'2px solid currentColor':'2px solid var(--text3)';
      onSelect(v);
    });
  });
}

/* -- célula de status/folga -- */
var _cTi=null,_cDi=null,_cSel='';
function openCellModal(ti,di){
  _cTi=ti;_cDi=di;_cSel=TECS[ti].d[di]||'';
  var dp=DATES[di].split('/');
  document.getElementById('cellSub').textContent=TECS[ti].n+' · '+dp[0]+'/'+dp[1];
  document.getElementById('cellCustom').value='';
  document.getElementById('cellFolga').checked=!!TECS[ti].fo[di];
  buildStatusGrid('statusGrid',_cSel,function(v){_cSel=v;document.getElementById('cellCustom').value='';});
  document.getElementById('cellOverlay').classList.add('open');
}
function closeCell(){document.getElementById('cellOverlay').classList.remove('open');}

/* -- técnico -- */
var _tecIdx=null;
function openTecModal(ti){
  _tecIdx=ti;var t=TECS[ti];
  document.getElementById('tecModalTitle').textContent='Editar técnico';
  document.getElementById('tecModalSub').textContent=t.n;
  document.getElementById('tecName').value=t.n;
  document.getElementById('tecFn').value=t.f;
  document.getElementById('tecSispat').value=t.s;
  document.getElementById('tecDf').value=t.df;
  document.getElementById('tecDt').value=t.dt;
  document.getElementById('tecLrs').value=t.lrs||'';
  document.getElementById('tecLcr').value=t.lcr||'';
  document.getElementById('tecIrata').value=t.irata||'';
  document.getElementById('tecDeleteBtn').style.display='';
  document.getElementById('tecOverlay').classList.add('open');
}
function openNewTecModal(){
  _tecIdx=-1;
  document.getElementById('tecModalTitle').textContent='Novo técnico';
  document.getElementById('tecModalSub').textContent='Será adicionado ao final da lista';
  ['tecName','tecFn','tecSispat'].forEach(function(id){document.getElementById(id).value='';});
  document.getElementById('tecDf').value='0';document.getElementById('tecDt').value='0';
  document.getElementById('tecLrs').value='';
  document.getElementById('tecLcr').value='';
  document.getElementById('tecIrata').value='';
  document.getElementById('tecDeleteBtn').style.display='none';
  document.getElementById('tecOverlay').classList.add('open');
}
function closeTec(){document.getElementById('tecOverlay').classList.remove('open');}

/* -- previsão em bloco -- */
var _blkSel='EMB';
function openBlockModal(){
  var sel=document.getElementById('blockTec');
  sel.innerHTML=TECS.map(function(t,i){return '<option value="'+i+'">'+t.n+'</option>';}).join('');
  document.getElementById('blockStart').value=toISO(DATES[Math.min(T_IDX,DATES.length-1)]);
  document.getElementById('blockEnd').value=toISO(DATES[Math.min(T_IDX+14,DATES.length-1)]);
  _blkSel='EMB';
  buildStatusGrid('blockStatusGrid','EMB',function(v){_blkSel=v;document.getElementById('blockCustom').value='';previewBlock();});
  document.getElementById('blockCustom').value='';
  previewBlock();
  document.getElementById('blockOverlay').classList.add('open');
}
function closeBlock(){document.getElementById('blockOverlay').classList.remove('open');}
function previewBlock(){
  var s=idxOf(fromISO(document.getElementById('blockStart').value));
  var e=idxOf(fromISO(document.getElementById('blockEnd').value));
  var custom=document.getElementById('blockCustom').value.trim();
  var v=custom||_blkSel, bc=badgeCls(v);
  if(s===null||e===null||s>e||!v){
    document.getElementById('previewStrip').innerHTML='<span style="font-size:11px;color:var(--text3)">—</span>';
    document.getElementById('previewCount').textContent='';return;
  }
  var count=e-s+1;
  document.getElementById('previewCount').textContent='('+count+' dia'+(count!==1?'s':'')+')';
  var strip='';
  for(var i=s;i<=Math.min(e,s+19);i++){var dp=DATES[i].split('/');strip+='<span class="b '+bc+'" title="'+dp[0]+'/'+dp[1]+'">'+v+'</span>';}
  if(count>20)strip+='<span style="font-size:10px;color:var(--text3);padding:2px 4px">+'+(count-20)+' mais</span>';
  document.getElementById('previewStrip').innerHTML=strip;
}
