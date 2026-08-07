/* ── BlockController: "Previsão em bloco" — status em um intervalo de datas para um técnico ── */
async function confirmBlock(){
  var ti=parseInt(document.getElementById('blockTec').value);
  var s=idxOf(fromISO(document.getElementById('blockStart').value));
  var e=idxOf(fromISO(document.getElementById('blockEnd').value));
  var custom=document.getElementById('blockCustom').value.trim();
  var v=custom||_blkSel;
  if(s===null||e===null||s>e||!v){toast('Preencha todos os campos','#e85b5b');return;}
  closeBlock();
  await applyDragFill(ti, s, e, v);
}
