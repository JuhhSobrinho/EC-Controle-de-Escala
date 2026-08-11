/* ── TrainingController: modal de Tipos de Treinamento (lista configurável usada por
   badgeCls/getCategory pra reconhecer status como treinamento/curso) ── */
function openTrainModal(){
  renderTrainList();
  document.getElementById('trainInput').value='';
  document.getElementById('trainOverlay').classList.add('open');
}
function closeTrainModal(){document.getElementById('trainOverlay').classList.remove('open');}

function renderTrainList(){
  var el=document.getElementById('trainList');
  if(!TRAINING_KEYWORDS.length){
    el.innerHTML='<span style="font-size:11px;color:var(--text3)">Nenhum tipo cadastrado ainda.</span>';
    return;
  }
  el.innerHTML=TRAINING_KEYWORDS.map(function(k,i){
    return '<span class="b btr train-tag">'+k+'<span class="train-tag-x" onclick="removeTrainingKeyword('+i+')" title="Remover">×</span></span>';
  }).join('');
}

function addTrainingKeyword(){
  var input=document.getElementById('trainInput');
  var v=input.value.trim().toUpperCase();
  if(!v) return;
  if(TRAINING_KEYWORDS.indexOf(v)===-1){
    TRAINING_KEYWORDS.push(v);
    saveTrainingKeywords();
    renderTrainList();
    refreshAfterTrainingChange();
    toast('"'+v+'" adicionado aos tipos de treinamento');
  }
  input.value='';
  input.focus();
}

function removeTrainingKeyword(i){
  var removed=TRAINING_KEYWORDS.splice(i,1)[0];
  saveTrainingKeywords();
  renderTrainList();
  refreshAfterTrainingChange();
  if(removed) toast('"'+removed+'" removido dos tipos de treinamento','#f5a623');
}

function refreshAfterTrainingChange(){
  if(typeof buildTable==='function') buildTable();
  if(typeof buildWeeklySummary==='function') buildWeeklySummary();
}
