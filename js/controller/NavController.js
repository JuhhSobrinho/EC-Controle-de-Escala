/* ── NavController: navegação (abas, busca, filtros, mês, tema) ── */
function shift(n){winStart=Math.max(0,Math.min(DATES.length-1-WIN*2,winStart+n));buildTable();}
function goToday(){winStart=T_IDX-WIN;buildTable();}
function shiftMonth(dir){
  var ref = dir > 0 ? winStart + WIN*2 : winStart;
  var refDate = DATES[Math.max(0,Math.min(DATES.length-1,ref))].split('/');
  var d = new Date(+refDate[2], +refDate[1]-1+dir, 1);
  var target = String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
  var idx = DATES.indexOf(target);
  if(idx === -1){
    // find closest date in that month
    var mm = String(d.getMonth()+1).padStart(2,'0'), yy = d.getFullYear();
    idx = DATES.findIndex(function(dt){ return dt.slice(3,5)===mm && dt.slice(6)===String(yy); });
  }
  if(idx !== -1) winStart = Math.max(0, Math.min(DATES.length-1-WIN*2, idx - WIN));
  buildTable();
}
function doSearch(v){search=v.toLowerCase();buildTable();}
function toggleF(f){
  activeF=activeF===f?null:f;
  ['Over','Under','Ideal'].forEach(function(x){document.getElementById('f'+x).classList.toggle('on',activeF===x.toLowerCase());});
  buildTable();
}

function onDateChange(){
  var s=idxOf(fromISO(document.getElementById('dStart').value));
  var e=idxOf(fromISO(document.getElementById('dEnd').value));
  dashS=s!==null?s:0;dashE=e!==null?e:DATES.length-1;
  if(dashS>dashE)dashE=dashS;
  ['Mes','Tri','Sem','Ano'].forEach(function(x){document.getElementById('p'+x).classList.remove('on');});
  refreshDash();
}
function setPeriod(p){
  var now=new Date(),s,e;
  if(p==='mes'){s=new Date(now.getFullYear(),now.getMonth(),1);e=now;}
  else if(p==='tri'){s=new Date(now);s.setDate(s.getDate()-89);e=now;}
  else if(p==='sem'){s=new Date(now.getFullYear(),now.getMonth()<6?0:6,1);e=now;}
  else{s=new Date(2026,0,1);e=new Date(2026,11,31);}
  function fmt(d){return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();}
  var si=idxOf(fmt(s)),ei=idxOf(fmt(e));
  dashS=Math.max(0,si!==null?si:0);dashE=Math.min(DATES.length-1,ei!==null?ei:DATES.length-1);
  document.getElementById('dStart').value=toISO(DATES[dashS]);
  document.getElementById('dEnd').value=toISO(DATES[dashE]);
  ['Mes','Tri','Sem','Ano'].forEach(function(x){document.getElementById('p'+x).classList.remove('on');});
  document.getElementById('p'+p.charAt(0).toUpperCase()+p.slice(1)).classList.add('on');
  refreshDash();
}

function switchTab(id,btn){
  document.querySelectorAll('.panel').forEach(function(p){p.classList.remove('active');});
  document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active');});
  document.getElementById(id).classList.add('active');btn.classList.add('active');
  if(id==='utilizacao' && !switchTab._util){switchTab._util=true; try{ initUtil(); }catch(e){console.warn('util init',e);}}
  if(id==='profissionais'){try{renderProfList();}catch(e){console.warn('prof list',e);}}
}

function toggleTheme(){
  var isLight = document.documentElement.classList.toggle('light');
  localStorage.setItem('ec_theme', isLight?'light':'dark');
  // swap icon: sun in dark mode, moon in light mode
  document.getElementById('themeIcon').innerHTML = isLight
    ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
    : '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
}
(function(){
  var saved = localStorage.getItem('ec_theme');
  if(saved==='light'){
    document.documentElement.classList.add('light');
    document.addEventListener('DOMContentLoaded',function(){
      var icon = document.getElementById('themeIcon');
      if(icon) icon.innerHTML='<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    });
  }
})();

document.getElementById('hDate').textContent=new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});

// arrow key horizontal scroll on table
(function(){
  var STEP=120;
  document.addEventListener('keydown',function(e){
    var outer=document.querySelector('.tbl-outer');
    if(!outer) return;
    // only when no input/modal is focused
    var tag=document.activeElement&&document.activeElement.tagName;
    if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA') return;
    if(document.querySelector('.overlay.open')) return;
    if(e.key==='ArrowLeft'){outer.scrollLeft-=STEP;e.preventDefault();}
    else if(e.key==='ArrowRight'){outer.scrollLeft+=STEP;e.preventDefault();}
  });
})();
