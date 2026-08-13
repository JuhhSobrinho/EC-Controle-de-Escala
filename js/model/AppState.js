/* ── AppState: estado em memória da aplicação + helpers de data/status ──
   TECS[ti] = {id (tecnico_id no banco), n,f,s,df,dt,p,lrs,lcr,irata,
               d[] (status por dia), fo[] (folga_override por dia), hr[] (hr_reais por dia, importado),
               rowId[] (id da linha em `escala`, ou null), _edits{}} */
/* Calendário gerado dinamicamente (1 ano antes até 1 ano depois de hoje), em vez do
   SEED.dates fixo — que parava em 02/07/2026 e por isso "hoje" e os meses seguintes
   deixavam de existir na grade (avançar mês não fazia nada, Utilização ficava vazia). */
function buildCalendarDates(){
  var now = new Date();
  var start = new Date(now.getFullYear()-1, 0, 1);
  var end   = new Date(now.getFullYear()+1, 11, 31);
  var out = [];
  var cur = new Date(start);
  while(cur <= end){
    out.push(String(cur.getDate()).padStart(2,'0')+'/'+String(cur.getMonth()+1).padStart(2,'0')+'/'+cur.getFullYear());
    cur.setDate(cur.getDate()+1);
  }
  return out;
}
var DATES   = buildCalendarDates();
var _today  = new Date();
var _todayStr = String(_today.getDate()).padStart(2,'0')+'/'+String(_today.getMonth()+1).padStart(2,'0')+'/'+_today.getFullYear();
var T_IDX   = DATES.indexOf(_todayStr);
if(T_IDX === -1){
  T_IDX = DATES.length - 1;
}
var WIN     = 16;
var DOW_MAP = {0:'Dom',1:'Seg',2:'Ter',3:'Qua',4:'Qui',5:'Sex',6:'Sáb'};
var TECS = [];
var winStart = T_IDX - WIN, activeF = null, search = '';
var expandedRows = {};

var STATUSES=[
  {v:'EMB',cls:'be',label:'EMB'},{v:'F.EMB',cls:'bfe',label:'F.EMB'},
  {v:'DES',cls:'bde',label:'DES'},{v:'DISP.',cls:'bdi',label:'DISP.'},
  {v:'MOB.',cls:'bmo',label:'MOB.'},{v:'TREINAM.',cls:'btr',label:'TREINAM.'},
  {v:'BASE',cls:'bba',label:'BASE'},{v:'AFASTADO',cls:'baf',label:'AFAS'}
];

/* palavras-chave que classificam um status como "treinamento" — usadas tanto pra
   colorir a célula (badgeCls) quanto pra contabilizar as horas no Resumo (getCategory
   em PanelViews.js). Editável pelo usuário no modal de Tipos de Treinamento;
   persiste só neste navegador (localStorage), não sincroniza com o banco. */
var TRAINING_KEYWORDS = loadTrainingKeywords();
function loadTrainingKeywords(){
  try{
    var saved = localStorage.getItem('ec_training_kw');
    if(saved){ var arr = JSON.parse(saved); if(Array.isArray(arr)) return arr; }
  }catch(e){}
  return ['TREINAM','CURSO','IRATA','ASO','HTS','NTS','JOTUN','RESG','IBIRITE','IBIRITÉ','T-HUET','THUET','NR'];
}
function saveTrainingKeywords(){
  localStorage.setItem('ec_training_kw', JSON.stringify(TRAINING_KEYWORDS));
}
function isTrainingStatus(u){
  if(!u) return false;
  var s=u.trim().toUpperCase();
  return TRAINING_KEYWORDS.some(function(k){return s.indexOf(k.trim().toUpperCase())===0;});
}

function dow(dmy){var p=dmy.split('/');return DOW_MAP[new Date(+p[2],+p[1]-1,+p[0]).getDay()];}
function isWeekend(dmy){var p=dmy.split('/');var d=new Date(+p[2],+p[1]-1,+p[0]).getDay();return d===0||d===6;}
function toISO(dmy){var p=dmy.split('/');return p[2]+'-'+p[1]+'-'+p[0];}
function fromISO(iso){if(!iso)return '';var p=iso.split('-');return p[2]+'/'+p[1]+'/'+p[0];}
function idxOf(dmy){var i=DATES.indexOf(dmy);return i===-1?null:i;}
function pctCol(p){return p>1.15?'#e85b5b':p<0.9&&p>0?'#f5a623':p===0?'#555e7a':'#1fc98e';}
function badgeCls(v){
  if(!v)return '';
  var u=v.trim().toUpperCase();
  if(u==='EMB'||u==='EMB.')return 'be';
  if(u.indexOf('F.EMB')===0)return 'bfe';
  if(u==='DES'||u==='DES.')return 'bde';
  if(u.indexOf('DISP')===0)return 'bdi';
  if(u.indexOf('MOB')===0)return 'bmo';
  if(u.indexOf('AFAS')===0)return 'baf';
  if(u==='BASE'||u==='HOTEL'||u==='RECAP')return 'bba';
  if(isTrainingStatus(u))return 'btr';
  if(u)return 'bpr';
  return '';
}

var AppState = {
  offline: false,

  tecnicoRowFrom: function(r){
    var dt = r.dias_trab || 0;
    return {
      id: r.id, n: r.nome, f: r.funcao, s: r.sispat, df: r.dias_folga || 0, dt: dt,
      p: dt>0 ? +(dt/15).toFixed(4) : 0,
      lrs: r.lrs, lcr: r.lcr, irata: r.irata,
      d: new Array(DATES.length).fill(''),
      fo: new Array(DATES.length).fill(0),
      hr: new Array(DATES.length).fill(null),
      rowId: new Array(DATES.length).fill(null),
      _edits: {}
    };
  },

  /* Carrega técnicos + escala do Supabase. Se falhar (rede/RLS), cai para o SEED local (modo offline). */
  load: async function(){
    try{
      var tecRows = await TecnicoModel.fetchAll();
      var escalaRows = await EscalaModel.fetchAll();
      var byId = {};
      TECS = tecRows.map(function(r){
        var t = AppState.tecnicoRowFrom(r);
        byId[r.id] = t;
        return t;
      });
      var skipped = 0;
      escalaRows.forEach(function(row){
        var t = byId[row.tecnico_id];
        if(!t) { skipped++; return; }
        var di = idxOf(fromISO(row.data));
        if(di === null) { skipped++; return; }
        t.d[di] = row.status || '';
        t.fo[di] = row.folga_override || 0;
        t.hr[di] = row.hr_reais ? row.hr_reais.slice(0,5) : null;
        t.rowId[di] = row.id;
      });
      if(skipped) console.warn('AppState.load: '+skipped+' linhas de escala fora do calendário carregado (ignoradas).');
      AppState.offline = false;
    }catch(e){
      console.error('AppState.load: falha ao conectar no Supabase, usando dados de exemplo (offline).', e);
      TECS = JSON.parse(JSON.stringify(SEED.tec));
      TECS.forEach(function(t){
        t.fo = new Array(DATES.length).fill(0);
        t.hr = new Array(DATES.length).fill(null);
        t.rowId = new Array(DATES.length).fill(null);
        t.id = null;
      });
      AppState.offline = true;
      toast('Sem conexão com o banco — exibindo dados de exemplo, edições não serão salvas', '#e85b5b');
    }
  }
};
