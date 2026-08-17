/* ── ReportController: gerar relatório Excel (.xlsx) quinzenal ── */
function buildPeriods(){
  // Build quinzenal periods from DATES range
  var periods=[];
  var seen={};
  DATES.forEach(function(dmy){
    var p=dmy.split('/');
    var y=+p[2], m=+p[1]-1;
    // Period A: 15 prev month → 15 this month
    // Period B: 15 this month → 15 next month
    [[m-1,m],[m,m+1]].forEach(function(pair){
      var from=new Date(y,pair[0],15);
      var to  =new Date(y,pair[1],15);
      var key=from.getTime()+'';
      if(!seen[key]){
        seen[key]=true;
        var fmtD=function(d){return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();};
        periods.push({label:fmtD(from)+' → '+fmtD(to), from:from, to:to});
      }
    });
  });
  periods.sort(function(a,b){return a.from-b.from;});
  // deduplicate
  var out=[], prev=null;
  periods.forEach(function(p){if(p.from.getTime()!==prev){out.push(p);prev=p.from.getTime();}});
  return out;
}
var _periods=[];
function openReportModal(){
  _periods=buildPeriods();
  var sel=document.getElementById('repPeriod');
  sel.innerHTML=_periods.map(function(p,i){return '<option value="'+i+'">'+p.label+'</option>';}).join('');
  // default: find period that contains today
  var now=new Date();
  var best=0;
  _periods.forEach(function(p,i){if(now>=p.from && now<p.to)best=i;});
  sel.value=best;
  updateReportPreview();
  document.getElementById('reportOverlay').classList.add('open');
}
function closeReport(){document.getElementById('reportOverlay').classList.remove('open');}
function updateReportPreview(){
  var idx=parseInt(document.getElementById('repPeriod').value);
  var p=_periods[idx];
  if(!p)return;
  var days=getDatesInRange(p.from,p.to);
  document.getElementById('repPreview').textContent=days.length+' dias · '+TECS.length+' técnicos · '+TECS.length+' abas';
}
function getDatesInRange(from,to){
  var out=[], cur=new Date(from);
  while(cur<=to){
    var dmy=String(cur.getDate()).padStart(2,'0')+'/'+String(cur.getMonth()+1).padStart(2,'0')+'/'+cur.getFullYear();
    var idx=DATES.indexOf(dmy);
    out.push({dmy:dmy,idx:idx,date:new Date(cur)});
    cur.setDate(cur.getDate()+1);
  }
  return out;
}
function isPTO(u){
  if(!u)return false;
  if(u.indexOf('F.EMB')===0)return true;
  if(u.indexOf('FOLGA')===0)return true;
  if(u==='BASE'||u==='HOTEL'||u==='RECAP')return true;
  if(u.indexOf('FERIAS')===0||u.indexOf('FÉRIAS')===0||u.indexOf('Férias')===0)return true;
  return false;
}
function generateReport(){
  var idx=parseInt(document.getElementById('repPeriod').value);
  var period=_periods[idx];
  if(!period){toast('Selecione um período','#e85b5b');return;}
  var days=getDatesInRange(period.from,period.to);
  var wb=XLSX.utils.book_new();
  var DOW_PT_FULL={0:'Domingo',1:'Segunda',2:'Terça',3:'Quarta',4:'Quinta',5:'Sexta',6:'Sábado'};
  TECS.forEach(function(t){
    var rows=[['Data','Dia','Local / Status','100%','Horas','Observação']];
    days.forEach(function(d){
      var status = d.idx>=0 ? (t.d[d.idx]||'') : '';
      var u=status.trim().toUpperCase();
      var cem=isPTO(u)?'100%':'';
      var hrs=hrsForStatus(u);
      var dowLabel=DOW_PT_FULL[d.date.getDay()];
      var obs = d.idx>=0 && t.obs ? (t.obs[d.idx]||'') : '';
      rows.push([d.dmy, dowLabel, status, cem, hrs||'', obs]);
    });
    // safe sheet name: max 31 chars, no special chars
    var sheetName=t.n.replace(/[:\\\/\?\*\[\]]/g,'').substring(0,28);
    var ws=XLSX.utils.aoa_to_sheet(rows);
    // column widths
    ws['!cols']=[{wch:12},{wch:10},{wch:22},{wch:6},{wch:8},{wch:40}];
    // header style (via SheetJS CE — limited, just bold via s property)
    ['A1','B1','C1','D1','E1','F1'].forEach(function(cell){
      if(ws[cell]) ws[cell].s={font:{bold:true}};
    });
    XLSX.utils.book_append_sheet(wb,ws,sheetName);
  });
  // file name: relatorio-15maio-15jun.xlsx
  var fmtFile=function(d){return String(d.getDate()).padStart(2,'0')+String(d.getMonth()+1).padStart(2,'0')+d.getFullYear();};
  var fname='relatorio-'+fmtFile(period.from)+'-'+fmtFile(period.to)+'.xlsx';
  XLSX.writeFile(wb,fname);
  closeReport();
  toast('Relatório gerado: '+fname,'#1fc98e');
}
