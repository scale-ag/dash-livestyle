"use strict";
/* ============================================================================
   Dashboard Live Style — lógica + renderização (client-side).
   Dados brutos vêm do build.py (DATA): meta_lsc/meta_evt/seg (extração Meta) e
   leads_lsc/leads_evt (cadastros reais, anúncio Meta, deduplicados), sep_* (separados).
   Tudo (período, filtro cruzado, imposto, KPIs, tabelas, gráficos) é calculado aqui.
   ============================================================================ */
const DATA = JSON.parse(document.getElementById('payload').textContent);
const B = DATA.build;
const TAX = B.tax_factor || 1.0;
const ML = DATA.meta_lsc||[], ME = DATA.meta_evt||[], SEG = DATA.seg||[];
const LL = DATA.leads_lsc||[], LE = DATA.leads_evt||[];
const SEP = {lsc:DATA.sep_lsc||[], evt:DATA.sep_evt||[]};
/* ---------------- format ---------------- */
const nf0=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0});
const nf1=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});
const nf2=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const brl=v=>(v==null||!isFinite(v))?'-':'R$ '+nf2.format(v);
const pct=v=>(v==null||!isFinite(v))?'-':nf2.format(v*100)+'%';
const intf=v=>(v==null||!isFinite(v))?'-':nf0.format(v);
const numf=v=>(v==null||!isFinite(v))?'-':nf1.format(v);
const dimf=v=>v==null?'-':String(v);
const norm=s=>(s==null?'':String(s)).trim().toLowerCase();
const brdate=d=>{ if(!d) return '-'; const p=d.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; };
const WD=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const weekday=d=>{ const dt=new Date(d+'T00:00:00'); return isNaN(dt)?'':WD[dt.getDay()]; };

/* ---------------- date helpers ---------------- */
function pad(n){return String(n).padStart(2,'0');}
function dstr(dt){return dt.getFullYear()+'-'+pad(dt.getMonth()+1)+'-'+pad(dt.getDate());}
function addDays(s,n){const dt=new Date(s+'T00:00:00');dt.setDate(dt.getDate()+n);return dstr(dt);}
const TODAY = B.today || B.date_max;

/* ---------------- STATE ---------------- */
const STATE = {
  page:'geral', from:(()=>{const [y,m]=TODAY.split('-'); return `${y}-${m}-01`;})(), to:TODAY, preset:'mes', tax:true,
  selDays:new Set(),
  sel:{ lsc:{C:new Set(),A:new Set(),D:new Set()}, evt:{C:new Set(),A:new Set(),D:new Set()}, seg:{C:new Set(),A:new Set(),D:new Set()} },
  sort:{}, colw:(()=>{ try{ return JSON.parse(localStorage.getItem('dm_colw')||'{}'); }catch(e){ return {}; } })(),
};
const taxf = ()=> STATE.tax ? TAX : 1;
const escHtml=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const lsSet=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };

/* filtro de data: dias clicados na tabela diária sobrepõem o intervalo De/Até */
function dateActive(d){
  if(!d) return false;
  if(STATE.selDays.size) return STATE.selDays.has(d);
  return (!STATE.from || d>=STATE.from) && (!STATE.to || d<=STATE.to);
}
const act = arr => arr.filter(r=>dateActive(r.d));

/* ---------------- painéis ---------------- */
const PANEL = {
  lsc:{M:ML, L:LL},
  evt:{M:ME, L:LE},
  seg:{M:SEG, L:[]},
};
/* escopo com filtro cruzado: ex = dimensão a NÃO filtrar (a própria tabela) */
function scope(p, ex){
  let fM=act(PANEL[p].M), fL=act(PANEL[p].L); const s=STATE.sel[p];
  [['C','camp'],['A','adset'],['D','ad']].forEach(([k,dim])=>{
    if(ex!==k && s[k].size){ fM=fM.filter(r=>s[k].has(r[dim])); fL=fL.filter(r=>s[k].has(r[dim])); }
  });
  return {fM, fL};
}
const RENDER = {lsc:()=>renderLsc(), evt:()=>renderEvt(), seg:()=>renderSeg()};
function selDim(p, dim, key, ctrl){
  const sets=STATE.sel[p], s=sets[dim];
  if(ctrl){ s.has(key)?s.delete(key):s.add(key); }
  else { const sole=s.has(key)&&s.size===1&&!Object.entries(sets).some(([k2,x])=>k2!==dim&&x.size);
    Object.values(sets).forEach(x=>x.clear()); if(!sole) s.add(key); }
  RENDER[p]();
}

/* ---------------- agregação ---------------- */
const blank=()=>({sp:0,im:0,cl:0,pv:0,leads:0,mql:0,dq:0,na:0,fora:0,outra:0,segs:0,nseg:0,spseg:0});
function addM(a,r){ a.sp+=r.sp; a.im+=r.im; a.cl+=r.cl; a.pv+=r.pv||0;
  /* seguidores: vazio = não preenchido (não entra no custo por seguidor); 0 conta */
  if(r.seg!==undefined && r.seg!==null){ a.segs+=r.seg; a.nseg+=1; a.spseg+=r.sp; } }
function addL(a,r){ a.leads+=1; if(r.st) a[r.st]+=1; }
function totals(fM,fL){ const a=blank(); fM.forEach(r=>addM(a,r)); fL.forEach(r=>addL(a,r)); return a; }
function buildAgg(fM,fL,dim){ const m={}; const g=k=>m[k]||(m[k]=blank());
  fM.forEach(r=>addM(g(r[dim]),r)); fL.forEach(r=>addL(g(r[dim]),r)); return m; }
function daily(fM,fL){ const m={}; const g=d=>m[d]||(m[d]={...blank(),d});
  fM.forEach(r=>addM(g(r.d),r)); fL.forEach(r=>addL(g(r.d),r));
  return Object.values(m).sort((a,b)=>a.d<b.d?-1:1); }
function derive(a){
  const g=a.sp*taxf(), aval=a.mql+a.dq;
  return {gasto:g, cpm:a.im?g/a.im*1000:null, ctr:a.im?a.cl/a.im:null, cpc:a.cl?g/a.cl:null,
    cr:a.cl?a.pv/a.cl:null, cpv:a.pv?g/a.pv:null, convlp:a.pv?a.leads/a.pv:null,
    cpl:a.leads?g/a.leads:null, cpmql:a.mql?g/a.mql:null, txq:aval?a.mql/aval:null, aval,
    seg:a.nseg?a.segs:null, cpseg:a.segs?(a.spseg*taxf())/a.segs:null, segcl:a.nseg&&a.cl?a.segs/a.cl:null};
}
/* hoje ainda está acontecendo: marca o dia nas tabelas e avisa na topbar */
const wdCell=d=> weekday(d)+(d===TODAY?' · parcial':'');
/* ---------------- generic interactive table ---------------- */
/* cfg: {id, cols:[{key,label,type,dim?,heat?:'gasto'|'leads'|'mqls',cls?}], rows:[{k,cells:{}, raw?}],
        total:{}, selectable, selSet, onSelect } */
// medição de texto (canvas) p/ auto-largura de coluna — "caiba o nome inteiro" (dim)
// e auto-ajuste em duplo-clique na borda, como Google Sheets / Looker Studio.
let _measureCtx=null;
function textWidth(s, font){
  if(!_measureCtx) _measureCtx=document.createElement('canvas').getContext('2d');
  _measureCtx.font=font;
  return _measureCtx.measureText(s==null?'':String(s)).width;
}
const fmtStd=(t,v)=> t==='brl'?brl(v):t==='pct'?pct(v):t==='int'?intf(v):t==='num'?numf(v):t==='date'?brdate(v):t==='html'?'':dimf(v);
const FONT_DIM='500 12.5px "Segoe UI",system-ui,-apple-system,Roboto,sans-serif';
const FONT_NUM='12.5px "Segoe UI",system-ui,-apple-system,Roboto,sans-serif';
const FONT_HEAD='700 11px "Segoe UI",system-ui,-apple-system,Roboto,sans-serif';
function autoDimWidth(cfg,c){
  let max=textWidth(c.label||'',FONT_HEAD);
  (cfg.rows||[]).forEach(r=>{ const w=textWidth(fmtStd(c.type,r.cells[c.key]),FONT_DIM); if(w>max) max=w; });
  if(cfg.total && cfg.total[c.key]!=null){ const w=textWidth(fmtStd(c.type,cfg.total[c.key]),FONT_DIM); if(w>max) max=w; }
  return Math.max(140, Math.min(640, Math.round(max)+34)); // + padding (10+10) + folga p/ seta de ordenação
}
function autoColWidth(cfg,c){
  if(c.type==='dim') return autoDimWidth(cfg,c);
  let max=textWidth(c.label||'',FONT_HEAD);
  (cfg.rows||[]).forEach(r=>{ const w=textWidth(fmtStd(c.type,r.cells[c.key]),FONT_NUM); if(w>max) max=w; });
  if(cfg.total && cfg.total[c.key]!=null){ const w=textWidth(fmtStd(c.type,cfg.total[c.key]),FONT_NUM); if(w>max) max=w; }
  return Math.max(60, Math.min(260, Math.round(max)+24));
}
function colWidth(cfg,c){ const saved=(STATE.colw[cfg.id]||{})[c.key];
  if(saved) return saved;
  if(c.w) return c.w;
  if(c.type==='date') return 96;
  if(c.type==='dim') return autoDimWidth(cfg,c);   // por padrão, cabe o nome inteiro
  if(c.type==='brl') return 110;   // "R$ 1.487,42" não cabia nos 92px padrão (cortava com "…")
  return 92; }
function renderTable(cfg){
  // tabelas com colunas travadas EM BANDA (band:'l'/'r' — não confundir com o
  // stk:'l1'/'r' do rel-adt, esquema à parte, só 1 coluna de cada lado) usam
  // um motor separado — ver renderSplitTable — porque aqui há VÁRIAS colunas
  // coladas de cada lado, e a soma delas pode superar a largura do card:
  // position:sticky por célula nesse caso gruda as bandas por cima do miolo
  // em vez de ao lado (o miolo fica permanentemente encoberto, sem posição
  // de scroll que o revele). 3 <table> lado a lado, cada uma só do tamanho
  // que precisa, não tem esse problema.
  if(cfg.cols.some(c=>c.band)) return renderSplitTable(cfg);
  const table=document.getElementById(cfg.id); if(!table) return;
  table.classList.toggle('dt-center', !!cfg.center);   // Mar01: dados centralizados
  const fit=!!cfg.fit;                                  // fit: cabe 100% da largura, sem scroll
  table.classList.toggle('dt-fit', fit);
  const sortState=STATE.sort[cfg.id];
  let rows=cfg.rows.slice();
  if(sortState){ const {key,dir}=sortState; const c=cfg.cols.find(x=>x.key===key);
    rows.sort((a,b)=>{ let va=a.cells[key], vb=b.cells[key];
      if(c && c.type==='dim'){ va=norm(va); vb=norm(vb); return dir==='asc'?(va<vb?-1:va>vb?1:0):(va>vb?-1:va<vb?1:0); }
      va=(va==null||!isFinite(va))?-Infinity:va; vb=(vb==null||!isFinite(vb))?-Infinity:vb;
      return dir==='asc'?va-vb:vb-va; }); }
  const ext={};
  cfg.cols.forEach(c=>{ if(c.heat){ const vs=rows.map(r=>r.cells[c.key]).filter(v=>v!=null&&isFinite(v)); ext[c.key]=[Math.min(...vs),Math.max(...vs)]; }});
  // métricas de custo sempre com "R$" (mesmo em tabelas densas/fit) — % nas de taxa, sem símbolo nas demais
  const fmt=(t,v)=> t==='brl'?brl(v):t==='pct'?pct(v):t==='int'?intf(v):t==='num'?numf(v):t==='date'?brdate(v):t==='html'?(v==null?'-':String(v)):dimf(v);
  const widths=fit?[]:cfg.cols.map(c=>colWidth(cfg,c)); const totalW=widths.reduce((a,b)=>a+b,0);
  // modo fit: dimensão/data com largura fixa; colunas numéricas dividem o resto por igual
  const fitW=c=> c.w?c.w+'px' : c.type==='date'?'74px' : c.type==='dim'?(c.big?'210px':'116px') : '';
  const colgroup='<colgroup>'+cfg.cols.map((c,i)=>{
    const w=fit?fitW(c):(widths[i]+'px'); return `<col${w?` style="width:${w}"`:''}>`;
  }).join('')+'</colgroup>';
  const esc=s=>String(s==null?'':s).replace(/"/g,'&quot;');
  const stkCls=c=>c.stk?' stk-'+c.stk:'';
  let thead='<thead><tr>'+cfg.cols.map((c,i)=>{
    const sc = sortState&&sortState.key===c.key ? (sortState.dir==='asc'?'sorted-asc':'sorted-desc') : '';
    return `<th class="${c.type==='dim'?'dim ':''}${sc}${stkCls(c)}" data-k="${c.key}" data-ci="${i}" title="${esc(c.label)}">${c.label}${fit?'':'<span class="rsz"></span>'}</th>`;
  }).join('')+'</tr></thead>';
  // title = valor SEMPRE completo (mesmo em fit, onde a célula pode abreviar/cortar) — passe o mouse p/ ver
  let tbody='<tbody>'+rows.map(r=>{
    const sel = cfg.selectable && cfg.selSet && cfg.selSet.has(r.k);
    const tds=cfg.cols.map(c=>{
      const v=r.cells[c.key]; let bg='';
      if(c.heat && ext[c.key]) bg=`background:${heat(v,ext[c.key][0],ext[c.key][1],c.heat)}`;
      const cls=(c.type==='dim'?'dim':'')+(c.cls&&c.cls(r)?' '+c.cls(r):'')+stkCls(c);
      const ttl=c.type==='html'?'':` title="${esc(fmtStd(c.type,v))}"`;
      return `<td class="${cls}" style="${bg}"${ttl}>${fmt(c.type,v)}</td>`;
    }).join('');
    return `<tr class="${sel?'sel':''}" data-k="${encodeURIComponent(r.k)}">${tds}</tr>`;
  }).join('')+'</tbody>';
  let tfoot='';
  if(cfg.total){ tfoot='<tfoot><tr>'+cfg.cols.map((c,i)=>{
    const v=cfg.total[c.key]; const isFirst=i===0&&v==null;
    return `<td class="${c.type==='dim'?'dim':''}${stkCls(c)}" title="${isFirst?'Total Geral':esc(fmtStd(c.type,v))}">${isFirst?'Total Geral':fmt(c.type,v)}</td>`;
  }).join('')+'</tr></tfoot>'; }
  table.style.width=fit?'100%':totalW+'px';
  table.innerHTML=colgroup+thead+tbody+tfoot;
  const cols=table.querySelector('colgroup').children;
  // sort handlers
  table.querySelectorAll('thead th').forEach(th=>{
    th.addEventListener('click',e=>{ if(e.target.classList.contains('rsz'))return;
      const k=th.dataset.k, cur=STATE.sort[cfg.id];
      if(!cur||cur.key!==k) STATE.sort[cfg.id]={key:k,dir:'asc'};
      else if(cur.dir==='asc') STATE.sort[cfg.id]={key:k,dir:'desc'};
      else delete STATE.sort[cfg.id];
      renderTable(cfg);
    });
  });
  // resize handlers (drag right border) -> resize the <col>, grow the table
  if(!fit) table.querySelectorAll('thead th .rsz').forEach(g=>{
    g.addEventListener('mousedown',e=>{ e.preventDefault(); e.stopPropagation();
      const th=g.parentElement, k=th.dataset.k, ci=+th.dataset.ci, x0=e.clientX;
      const w0=cols[ci].offsetWidth, tw0=table.offsetWidth;
      document.body.style.userSelect='none';
      const mv=ev=>{ const nw=Math.max(60,w0+(ev.clientX-x0)); cols[ci].style.width=nw+'px'; table.style.width=(tw0-w0+nw)+'px';
        STATE.colw[cfg.id]=STATE.colw[cfg.id]||{}; STATE.colw[cfg.id][k]=nw; };
      const up=()=>{ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); document.body.style.userSelect=''; localStorage.setItem('dm_colw',JSON.stringify(STATE.colw)); };
      document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
    });
    // duplo-clique na borda = auto-ajustar largura ao conteúdo (como Sheets/Looker)
    g.addEventListener('dblclick',e=>{ e.preventDefault(); e.stopPropagation();
      const th=g.parentElement, k=th.dataset.k, c=cfg.cols.find(x=>x.key===k);
      const nw=autoColWidth(cfg,c);
      STATE.colw[cfg.id]=STATE.colw[cfg.id]||{}; STATE.colw[cfg.id][k]=nw;
      localStorage.setItem('dm_colw',JSON.stringify(STATE.colw));
      renderTable(cfg);
    });
  });
  // row select
  if(cfg.selectable && cfg.onSelect){
    table.querySelectorAll('tbody tr').forEach(tr=>{
      tr.addEventListener('click',e=>{ cfg.onSelect(decodeURIComponent(tr.dataset.k), e); });
    });
  }
  // hook pós-renderização (roda de novo em CADA re-render, inclusive ao ordenar,
  // pra chips/cores customizados nunca sumirem ao clicar num cabeçalho)
  if(cfg.afterRender) cfg.afterRender(table, rows);
}
/* ---------------- tabela "split" (colunas travadas em banda) ----------------
   3 <table> independentes lado a lado (esquerda fixa · meio com scroll
   próprio · direita fixa). Cada seção rola VERTICALMENTE por conta própria
   (max-height igual ao do .tbl-wrap ancestral + overflow-y:auto — ver CSS
   .dt-split-fixed/.dt-split-scroll) e um listener de 'scroll' sincroniza as
   3 (scrollTop) pra se comportarem como uma tabela só. Isso evita as 2
   armadilhas de quando isso era 1 única faixa por posição:
   1) cabeçalho "solto": se só o miolo tem overflow-x:auto, o CSS força
      overflow-y a virar "auto" nele também (canonicalização do spec) —
      mas como o miolo nunca chega a rolar de fato sozinho (cresce até
      caber o conteúdo), ele vira um scroll container que nunca se move,
      e o sticky do thead gruda relativo A ELE, não ao .tbl-wrap que
      realmente rola — daí o cabeçalho "sobe" junto com o resto ao rolar.
   2) banda cobrindo o miolo: position:sticky por célula numa única
      <table> não sobra espaço pro miolo quando (banda esquerda + banda
      direita) > largura do card — o miolo fica permanentemente atrás das
      bandas, sem posição de scroll que o revele.
   Cada seção rolando por si (bounded, overflow-y:auto de verdade) faz o
   sticky nativo funcionar sem ressalva nenhuma, e cada uma só ocupa o
   espaço que ela mesma precisa — cabendo tudo, o flex nem mostra barra de
   rolagem e fica idêntico a uma tabela única. */
function renderSplitTable(cfg){
  const root=document.getElementById(cfg.id); if(!root) return;
  const wrap=root.closest('.tbl-wrap');
  const sortState=STATE.sort[cfg.id];
  let rows=cfg.rows.slice();
  if(sortState){ const {key,dir}=sortState; const c=cfg.cols.find(x=>x.key===key);
    rows.sort((a,b)=>{ let va=a.cells[key], vb=b.cells[key];
      if(c && c.type==='dim'){ va=norm(va); vb=norm(vb); return dir==='asc'?(va<vb?-1:va>vb?1:0):(va>vb?-1:va<vb?1:0); }
      va=(va==null||!isFinite(va))?-Infinity:va; vb=(vb==null||!isFinite(vb))?-Infinity:vb;
      return dir==='asc'?va-vb:vb-va; }); }
  const ext={};
  cfg.cols.forEach(c=>{ if(c.heat){ const vs=rows.map(r=>r.cells[c.key]).filter(v=>v!=null&&isFinite(v)); ext[c.key]=[Math.min(...vs),Math.max(...vs)]; }});
  const fmt=(t,v)=> t==='brl'?brl(v):t==='pct'?pct(v):t==='int'?intf(v):t==='num'?numf(v):t==='date'?brdate(v):t==='html'?(v==null?'-':String(v)):dimf(v);
  const esc=s=>String(s==null?'':s).replace(/"/g,'&quot;');
  const leftCols=cfg.cols.filter(c=>c.band==='l'), rightCols=cfg.cols.filter(c=>c.band==='r'), midCols=cfg.cols.filter(c=>!c.band);
  function section(cols){
    const widths=cols.map(c=>colWidth(cfg,c)); const totalW=widths.reduce((a,b)=>a+b,0);
    const colgroup='<colgroup>'+cols.map((c,i)=>`<col style="width:${widths[i]}px">`).join('')+'</colgroup>';
    const thead='<thead><tr>'+cols.map(c=>{
      const sc = sortState&&sortState.key===c.key ? (sortState.dir==='asc'?'sorted-asc':'sorted-desc') : '';
      return `<th class="${c.type==='dim'?'dim ':''}${sc}" data-k="${c.key}" title="${esc(c.label)}">${c.label}<span class="rsz"></span></th>`;
    }).join('')+'</tr></thead>';
    const tbody='<tbody>'+rows.map(r=>{
      const sel = cfg.selectable && cfg.selSet && cfg.selSet.has(r.k);
      const tds=cols.map(c=>{
        const v=r.cells[c.key]; let bg='';
        if(c.heat && ext[c.key]) bg=`background:${heat(v,ext[c.key][0],ext[c.key][1],c.heat)}`;
        const cls=(c.type==='dim'?'dim':'')+(c.cls&&c.cls(r)?' '+c.cls(r):'');
        const ttl=c.type==='html'?'':` title="${esc(fmtStd(c.type,v))}"`;
        return `<td class="${cls}" style="${bg}"${ttl}>${fmt(c.type,v)}</td>`;
      }).join('');
      return `<tr class="${sel?'sel':''}" data-k="${encodeURIComponent(r.k)}">${tds}</tr>`;
    }).join('')+'</tbody>';
    let tfoot='';
    if(cfg.total){ tfoot='<tfoot><tr>'+cols.map(c=>{
      const v=cfg.total[c.key]; const isFirst=cfg.cols.indexOf(c)===0&&v==null;
      return `<td class="${c.type==='dim'?'dim':''}" title="${isFirst?'Total Geral':esc(fmtStd(c.type,v))}">${isFirst?'Total Geral':fmt(c.type,v)}</td>`;
    }).join('')+'</tr></tfoot>'; }
    return `<table class="dt${cfg.center?' dt-center':''}" style="width:${totalW}px">${colgroup}${thead}${tbody}${tfoot}</table>`;
  }
  // altura de cada seção = a mesma altura máxima do .tbl-wrap ancestral
  // (tbl-normal/tbl-double/inline) — rolam juntas dentro do mesmo limite
  // visual de sempre, sem precisar que o .tbl-wrap role por fora.
  const maxH=wrap?parseFloat(getComputedStyle(wrap).maxHeight):NaN;
  const hStyle=isFinite(maxH)?` style="max-height:${maxH}px"`:'';
  // troca a própria tag por <div> (um <table> não pode ter <div> como filho —
  // o parser HTML descarta; outerHTML recria o nó com a tag certa). Funciona
  // tanto na 1ª renderização (raiz ainda é a <table> do template) quanto nas
  // seguintes (raiz já é a <div class="dt-split"> da renderização anterior).
  root.outerHTML =
    `<div id="${cfg.id}" class="dt-split">`+
      `<div class="dt-split-fixed dt-split-l"${hStyle}>${section(leftCols)}</div>`+
      `<div class="dt-split-scroll"${hStyle}>${section(midCols)}</div>`+
      `<div class="dt-split-fixed dt-split-r"${hStyle}>${section(rightCols)}</div>`+
    `</div>`;
  const fresh=document.getElementById(cfg.id);
  // as 3 seções rolam verticalmente cada uma por conta própria (CSS acima) —
  // sincroniza scrollTop entre elas pra se comportarem como 1 tabela só,
  // não importa sobre qual seção o mouse rolou.
  const secs=[...fresh.querySelectorAll('.dt-split-l, .dt-split-scroll, .dt-split-r')];
  let syncing=false;
  secs.forEach(el=>el.addEventListener('scroll',()=>{
    if(syncing) return; syncing=true;
    secs.forEach(o=>{ if(o!==el) o.scrollTop=el.scrollTop; });
    requestAnimationFrame(()=>{ syncing=false; });
  }));
  // sort: clicar em QUALQUER cabeçalho (das 3 tabelas) reordena as 3 juntas
  fresh.querySelectorAll('thead th').forEach(th=>{
    th.addEventListener('click',e=>{ if(e.target.classList.contains('rsz'))return;
      const k=th.dataset.k, cur=STATE.sort[cfg.id];
      if(!cur||cur.key!==k) STATE.sort[cfg.id]={key:k,dir:'asc'};
      else if(cur.dir==='asc') STATE.sort[cfg.id]={key:k,dir:'desc'};
      else delete STATE.sort[cfg.id];
      renderSplitTable(cfg);
    });
  });
  // resize: cada coluna só afeta a largura da SUA seção (as 3 tabelas são
  // independentes, então redimensionar ao vivo não desalinha nada)
  fresh.querySelectorAll('thead th .rsz').forEach(g=>{
    g.addEventListener('mousedown',e=>{ e.preventDefault(); e.stopPropagation();
      const th=g.parentElement, k=th.dataset.k, x0=e.clientX;
      const sectionTable=th.closest('table'), ths=[...th.parentElement.children];
      const ci=ths.indexOf(th), col=sectionTable.querySelector('colgroup').children[ci];
      const w0=col.offsetWidth, tw0=sectionTable.offsetWidth;
      document.body.style.userSelect='none';
      const mv=ev=>{ const nw=Math.max(60,w0+(ev.clientX-x0)); col.style.width=nw+'px'; sectionTable.style.width=(tw0-w0+nw)+'px';
        STATE.colw[cfg.id]=STATE.colw[cfg.id]||{}; STATE.colw[cfg.id][k]=nw; };
      const up=()=>{ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); document.body.style.userSelect=''; localStorage.setItem('dm_colw',JSON.stringify(STATE.colw)); };
      document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
    });
    g.addEventListener('dblclick',e=>{ e.preventDefault(); e.stopPropagation();
      const th=g.parentElement, k=th.dataset.k, c=cfg.cols.find(x=>x.key===k);
      const nw=autoColWidth(cfg,c);
      STATE.colw[cfg.id]=STATE.colw[cfg.id]||{}; STATE.colw[cfg.id][k]=nw;
      localStorage.setItem('dm_colw',JSON.stringify(STATE.colw));
      renderSplitTable(cfg);
    });
  });
  if(cfg.selectable && cfg.onSelect){
    fresh.querySelectorAll('tbody tr').forEach(tr=>{
      tr.addEventListener('click',e=>{ cfg.onSelect(decodeURIComponent(tr.dataset.k), e); });
    });
  }
  if(cfg.afterRender) cfg.afterRender(fresh, rows);
}
/* Heatmap por coluna: cor FIXA por métrica (definida em identidade-visual.css),
   só a OPACIDADE varia com o valor (maior valor = mais vibrante). */
const HEAT_HUE={gasto:'--heat-gasto', leads:'--heat-leads', mqls:'--heat-mqls', roas:'--heat-roas', vendas:'--heat-vendas'};
function heat(v,lo,hi,kind){
  if(v==null||!isFinite(v)||hi===lo||!HEAT_HUE[kind]) return 'transparent';
  const t=Math.max(0,Math.min(1,(v-lo)/(hi-lo)));
  const c=hx2rgb(cvar(HEAT_HUE[kind]));
  return `rgba(${c[0]},${c[1]},${c[2]},${(0.06+0.5*t).toFixed(3)})`;
}
function toggleSet(set,key,ctrl,others){
  if(ctrl){ set.has(key)?set.delete(key):set.add(key); }
  else { const only=set.has(key)&&set.size===1; set.clear(); if(!only) set.add(key); }
  if(others) others.forEach(s=>s.clear());
}

/* ---------------- funil ---------------- */
function funnelHTML(steps){ return steps.map(s=>`
    <div class="step ${s[3]?'na':''} ${s[4]||''}"><div class="step-main"><div class="m-label">${s[0]}</div><div class="m-val">${s[1]}</div></div>
    <div class="secs">${s[2].map(x=>`<div><span class="s-label">${x[0]}</span><span class="s-val">${x[1]}</span></div>`).join('')}</div></div>`).join(''); }

/* ---------------- charts ---------------- */
const charts={};
const cvar=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const hx2rgb=h=>{h=(h||'').replace('#','').trim();if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h||'888888',16);return [(n>>16)&255,(n>>8)&255,n&255];};
const CHART_SERIES=['--cc1','--cc2','--cc3','--cc4','--cc5','--cc6','--cc7','--cc8','--cc9','--cc10'];
const chartPalette=()=>CHART_SERIES.map(v=>cvar(v)||'#888888');
const cmuted=()=>cvar('--muted')||'#6B7280', cink=()=>cvar('--ink')||'#1A1D2E', cgrid=()=>cvar('--grid')||'#EEF0F5';
function destroy(id){ if(charts[id]){ charts[id].destroy(); delete charts[id]; } }

/* ---------------- funil vertical ---------------- */
function funnelHTML(steps){ return steps.map(s=>`
    <div class="step ${s[3]?'na':''} ${s[4]||''}"><div class="step-main"><div class="m-label">${s[0]}</div><div class="m-val">${s[1]}</div></div>
    <div class="secs">${s[2].map(x=>`<div><span class="s-label">${x[0]}</span><span class="s-val">${x[1]}</span></div>`).join('')}</div></div>`).join(''); }

/* ---------------- gráficos ---------------- */
const legendOpts=()=>({labels:{color:cink(),boxWidth:10,usePointStyle:true,font:{size:11}}});
/* barras = resultado(s) principal(is) · linhas = Gasto e custo por resultado (eixo R$) */
function comboChart(id, d, bars, lines){
  destroy(id); const el=document.getElementById(id); if(!el) return;
  const mut=cmuted();
  const ds=bars.map((b,i)=>({type:'bar',label:b.label,data:d.map(b.fn),backgroundColor:cvar(b.color),yAxisID:'y',borderRadius:3,maxBarThickness:40,order:3+i}))
    .concat(lines.map((l,i)=>({type:'line',label:l.label,data:d.map(x=>{const v=l.fn(x); return v==null?null:+v.toFixed(2);}),
      borderColor:cvar(l.color),backgroundColor:cvar(l.color),yAxisID:'y1',borderWidth:2,pointRadius:3,spanGaps:true,tension:.35,order:i})));
  charts[id]=new Chart(el,{
    data:{labels:d.map(x=>x.d.slice(8)+'/'+x.d.slice(5,7)), datasets:ds},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:legendOpts(),
        tooltip:{callbacks:{label:c=>c.dataset.label+': '+(c.dataset.yAxisID==='y1'?brl(c.raw):(c.raw==null?'não preenchido':intf(c.raw)))}}},
      scales:{x:{ticks:{color:mut,font:{size:10}},grid:{display:false}},
        y:{position:'left',beginAtZero:true,ticks:{color:mut,precision:0,font:{size:10}},grid:{color:cgrid()},title:{display:true,text:bars.map(b=>b.label).join(' · '),color:mut,font:{size:10}}},
        y1:{position:'right',beginAtZero:true,ticks:{color:mut,font:{size:10}},grid:{display:false},title:{display:true,text:'R$',color:mut,font:{size:10}}}}}});
}
/* resultado por dimensão (campanha/conjunto/anúncio) por dia — 1 linha por membro,
   legenda HTML própria (nome completo + custo) e filtro bidirecional com a tabela */
function dimChart(p, id, fM, fL, agg, dim, dimKey, resFn, resLabel, costFn){
  destroy(id); const el=document.getElementById(id), legEl=document.getElementById(id+'Legend'); if(!el) return;
  const selSet=STATE.sel[p][dimKey];
  const days=[...new Set([...fM,...fL].map(r=>r.d))].sort();
  const res=k=>fL.filter(r=>r[dim]===k).reduce((s,r)=>s+resFn(r),0);
  const members=Object.keys(agg).sort((a,b)=>res(b)-res(a) || agg[b].sp-agg[a].sp);
  const pal=chartPalette(), mut=cmuted();
  const plot=selSet.size?members.filter(m=>selSet.has(m)):members;
  const dsets=plot.map(mv=>{ const col=pal[members.indexOf(mv)%pal.length];
    const byDay={}; fL.forEach(r=>{ if(r[dim]===mv) byDay[r.d]=(byDay[r.d]||0)+resFn(r); });
    return {label:String(mv), data:days.map(d=>byDay[d]||0), borderColor:col, backgroundColor:col, borderWidth:2, pointRadius:2, tension:.25}; });
  charts[id]=new Chart(el,{type:'line', data:{labels:days.map(d=>d.slice(8)+'/'+d.slice(5,7)), datasets:dsets},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'nearest',intersect:false},
      onClick:(e,a)=>{ if(a.length&&dsets[a[0].datasetIndex]) selDim(p,dimKey,dsets[a[0].datasetIndex].label,false); },
      plugins:{legend:{display:false}, tooltip:{callbacks:{title:()=>'', label:c=>[c.dataset.label, intf(c.raw)+' '+resLabel]}}},
      scales:{x:{ticks:{color:mut,font:{size:9}},grid:{display:false}},
        y:{beginAtZero:true,ticks:{color:mut,precision:0,font:{size:9}},grid:{color:cgrid()}}}}});
  if(legEl){
    legEl.innerHTML=members.map((mv,i)=>`<div class="cl-row${selSet.has(mv)?' sel':''}" data-mv="${escHtml(mv)}" title="${escHtml(mv)}">`
      +`<span class="cl-swatch" style="background:${pal[i%pal.length]}"></span><span class="cl-name">${escHtml(mv)}</span>`
      +`<span class="cl-val">${intf(res(mv))} ${resLabel} · ${brl(costFn(derive(agg[mv])))}</span></div>`).join('');
    legEl.querySelectorAll('.cl-row').forEach(row=>row.addEventListener('click',()=>selDim(p,dimKey,row.dataset.mv,false)));
  }
}

/* ---------------- colunas ---------------- */
const C_DATE=[{key:'date',label:'Data',type:'date'},{key:'wd',label:'Dia',type:'dim',w:100}];
const C_GASTO={key:'gasto',label:'Gasto',type:'brl',heat:'gasto'};
const C_MEDIA=[
  {key:'im',label:'Impr.',type:'int'},{key:'cpm',label:'CPM',type:'brl'},
  {key:'cl',label:'Cliques',type:'int'},{key:'ctr',label:'CTR',type:'pct'},{key:'cpc',label:'CPC',type:'brl'},
  {key:'pv',label:'Page Views',type:'int'},{key:'cr',label:'CR',type:'pct'},{key:'cpv',label:'CPV',type:'brl'},
];
/* Gasto · Leads · CPL ficam SEMPRE à esquerda (visíveis sem rolar); mídia no fim */
const C_LSC=[C_GASTO,
  {key:'leads',label:'Leads',type:'int',heat:'leads'},{key:'cpl',label:'CPL',type:'brl'},
  {key:'txq',label:'Tx‑Qualif.',type:'pct'},
  {key:'mql',label:'MQLs',type:'int',heat:'mqls'},{key:'cpmql',label:'CPMQL',type:'brl'},
  {key:'dq',label:'Desqualif.',type:'int'},{key:'na',label:'Não aval.',type:'int'},
].concat(C_MEDIA);
const C_EVT=[C_GASTO,
  {key:'leads',label:'Inscrições',type:'int',heat:'leads'},{key:'cpl',label:'CPL',type:'brl'},{key:'convlp',label:'ConvLP',type:'pct'},
].concat(C_MEDIA);
const C_SEG=[C_GASTO,
  {key:'seg',label:'Seguidores',type:'int',heat:'mqls',w:110},{key:'cpseg',label:'C/Seguidor',type:'brl'},{key:'segcl',label:'Seg./Clique',type:'pct',w:105},
  {key:'im',label:'Impr.',type:'int'},{key:'cpm',label:'CPM',type:'brl'},
  {key:'cl',label:'Cliques',type:'int'},{key:'ctr',label:'CTR',type:'pct'},{key:'cpc',label:'CPC',type:'brl'},
];
function cells(a){ const d=derive(a);
  return {gasto:d.gasto, im:a.im, cpm:d.cpm, cl:a.cl, ctr:d.ctr, cpc:d.cpc, pv:a.pv, cr:d.cr, cpv:d.cpv,
    leads:a.leads, cpl:d.cpl, convlp:d.convlp, mql:a.mql, cpmql:d.cpmql, dq:a.dq, na:a.na, txq:d.txq,
    seg:d.seg, cpseg:d.cpseg, segcl:d.segcl}; }
function onDay(k,e){ toggleSet(STATE.selDays,k,e&&(e.ctrlKey||e.metaKey)); syncDateInputs(); renderAll(); }

/* tabela diária (último dia no topo) + total */
function dailyTable(id, cols, fM, fL){
  const dd=daily(fM,fL).slice().reverse();
  renderTable({id, cols:C_DATE.concat(cols), center:true,
    rows:dd.map(x=>({k:x.d, cells:{date:x.d, wd:wdCell(x.d), ...cells(x)}})),
    total:{date:null, wd:'', ...cells(totals(fM,fL))},
    selectable:true, selSet:STATE.selDays, onSelect:onDay});
}
/* 3 tabelas Campanha → Conjunto → Anúncio com filtro cruzado (+ gráfico por dimensão) */
function hierTables(p, prefix, cols, chart){
  [['C','camp','Camp','Campanha'],['A','adset','Adset','Conjunto'],['D','ad','Ad','Anúncio']].forEach(([dk,dim,suf,label])=>{
    const S=scope(p,dk), agg=buildAgg(S.fM,S.fL,dim);
    renderTable({id:prefix+suf, cols:[{key:'dim',label,type:'dim',big:true,band:'l'}].concat(cols.map((c,i)=>i<3?{...c,band:'l'}:c)),
      rows:Object.entries(agg).map(([k,a])=>({k, cells:{dim:k, ...cells(a)}})),
      total:{dim:null, ...cells(totals(S.fM,S.fL))},
      selectable:true, selSet:STATE.sel[p][dk], onSelect:(k,e)=>selDim(p,dk,k,e&&(e.ctrlKey||e.metaKey))});
    if(chart) dimChart(p, prefix+'Ch'+suf, S.fM, S.fL, agg, dim, dk, chart.res, chart.label, chart.cost);
  });
}

/* ---------------- cards de destaque (topo de cada página) ---------------- */
function kpiRow(id, ks){ const el=document.getElementById(id); if(!el) return;
  el.innerHTML=ks.map(k=>`<div class="kpi ${k.hero?'hero':''}"><div class="kl"><span>${k.label}</span></div><div class="kv">${k.val}</div><div class="ka">${k.aux||''}</div></div>`).join(''); }

/* ---------------- avisos ---------------- */
const plural=(n,a,b)=>intf(n)+' '+(n===1?a:b);
function sepNote(p){
  const s=act(SEP[p]); if(!s.length) return '';
  const c={teste:0,duplicado:0,nao_meta:0}; s.forEach(r=>c[r.g]=(c[r.g]||0)+1);
  const parts=[]; if(c.duplicado) parts.push(plural(c.duplicado,'duplicado','duplicados'));
  if(c.teste) parts.push(plural(c.teste,'teste','testes'));
  if(c.nao_meta) parts.push(plural(c.nao_meta,'sem origem Meta Ads','sem origem Meta Ads'));
  return parts.join(' · ');
}
function warnHTML(p, fL){
  const out=[]; const nome=p==='lsc'?['cadastro','cadastros']:['inscrição','inscrições'];
  const sv=fL.filter(r=>!r.v).length;
  if(sv) out.push(`<b>${plural(sv,nome[0],nome[1])} sem vínculo</b> com campanha (UTM incompleta mesmo após conferir a página de entrada): ${sv===1?'entra':'entram'} no total, sem campanha.`);
  const sn=sepNote(p); if(sn) out.push(`<b>Fora da contagem</b> (não são resultado de anúncio): ${sn}.`);
  if(p==='lsc'){ const o=fL.filter(r=>r.st==='outra');
    if(o.length) out.push(`<b>Etapa fora das 5 conhecidas</b>: ${[...new Set(o.map(r=>escHtml(r.et)))].join(', ')} (${intf(o.length)}) — conta no total de leads, fora da classificação.`); }
  return out.join('<br>');
}
function setWarn(id, html){ const el=document.getElementById(id); if(!el) return; el.innerHTML=html; el.hidden=!html; }

/* ---------------- VISÃO GERAL ---------------- */
function renderGeralCore(ids){
  const fML=act(ML), fME=act(ME), fMS=act(SEG), fLL=act(LL), fLE=act(LE);
  const tL=totals(fML,fLL), tE=totals(fME,fLE), tS=totals(fMS,[]);
  const dL=derive(tL), dE=derive(tE), dS=derive(tS);
  const gTot=dL.gasto+dE.gasto+dS.gasto;
  /* leads de TODAS as campanhas de captação (cantores + evento) e CPL sobre o gasto dessas campanhas */
  const nLeads=tL.leads+tE.leads, cplTot=nLeads?(dL.gasto+dE.gasto)/nLeads:null;
  kpiRow(ids.kpis,[
    {label:'Investimento total',val:brl(gTot),aux:'todas as campanhas · '+(STATE.tax?'com imposto':'bruto')},
    {label:'Leads (todas as campanhas)',val:intf(nLeads),aux:`${intf(tL.leads)} cantores + ${intf(tE.leads)} evento`,hero:true},
    {label:'Custo por lead',val:brl(cplTot),aux:'gasto cantores + evento ÷ leads',hero:true},
    {label:'Taxa de qualificação',val:pct(dL.txq),aux:`cantores · ${intf(tL.mql)} MQLs ÷ ${intf(dL.aval)} avaliados`,hero:true},
    {label:'Seguidores',val:intf(dS.seg),aux:'Instagram'},
    {label:'Custo por seguidor',val:brl(dS.cpseg),aux:'só dias preenchidos'},
  ]);
  document.getElementById(ids.funnel).innerHTML=funnelHTML([
    ['Investimento total', brl(gTot), [['Cantores',brl(dL.gasto)],['Evento',brl(dE.gasto)],['Seguidores',brl(dS.gasto)]], false, 'hl-gasto'],
    ['Leads (cantores + evento)', intf(nLeads), [['CPL',brl(cplTot)]], false, 'hl-mql'],
    ['Leads de cantores', intf(tL.leads), [['CPL',brl(dL.cpl)]]],
    ['MQLs (Reunião CEO)', intf(tL.mql), [['Tx‑Qualif.',pct(dL.txq)],['CPMQL',brl(dL.cpmql)]], false, 'hl-mql'],
    ['Inscrições evento SP', intf(tE.leads), [['CPL',brl(dE.cpl)]]],
    ['Seguidores Instagram', intf(dS.seg), [['C/Seguidor',brl(dS.cpseg)]]],
  ]);
  const w=[warnHTML('lsc',fLL), warnHTML('evt',fLE)];
  const lbl=['Cantores','Evento'];
  setWarn(ids.warn, w.map((h,i)=>h?`<div><b>${lbl[i]}:</b> ${h}</div>`:'').join(''));
  /* diário combinado */
  const days={}; const g=d=>days[d]||(days[d]={d,L:blank(),E:blank(),S:blank()});
  fML.forEach(r=>addM(g(r.d).L,r)); fLL.forEach(r=>addL(g(r.d).L,r));
  fME.forEach(r=>addM(g(r.d).E,r)); fLE.forEach(r=>addL(g(r.d).E,r));
  fMS.forEach(r=>addM(g(r.d).S,r));
  const dd=Object.values(days).sort((a,b)=>a.d<b.d?-1:1);
  const row=x=>{ const a=derive(x.L), b=derive(x.E), c=derive(x.S);
    const nl=x.L.leads+x.E.leads;
    return {gasto:a.gasto+b.gasto+c.gasto, lt:nl, cplt:nl?(a.gasto+b.gasto)/nl:null, txq:a.txq,
      gL:a.gasto, leads:x.L.leads, cpl:a.cpl, mql:x.L.mql, cpmql:a.cpmql,
      gE:b.gasto, insc:x.E.leads, cplE:b.cpl, gS:c.gasto, seg:c.seg, cpseg:c.cpseg}; };
  comboChart(ids.combo, dd,
    [{label:'MQLs',fn:x=>x.L.mql,color:'--chart-mqls'},{label:'Inscrições',fn:x=>x.E.leads,color:'--chart-leads'},{label:'Seguidores',fn:x=>derive(x.S).seg,color:'--cc2'}],
    [{label:'Gasto total',fn:x=>row(x).gasto,color:'--chart-gasto'}]);
  renderTable({id:ids.daily, center:true,
    cols:C_DATE.concat([
      {key:'gasto',label:'Gasto total',type:'brl',heat:'gasto'},
      {key:'lt',label:'Leads total',type:'int',heat:'leads',w:110},{key:'cplt',label:'CPL total',type:'brl'},
      {key:'leads',label:'Leads cantores',type:'int',w:125},{key:'cpl',label:'CPL cantores',type:'brl'},
      {key:'txq',label:'Tx‑Qualif.',type:'pct'},{key:'mql',label:'MQLs',type:'int',heat:'mqls'},{key:'cpmql',label:'CPMQL',type:'brl'},
      {key:'insc',label:'Inscrições',type:'int',w:105},{key:'cplE',label:'CPL evento',type:'brl'},
      {key:'seg',label:'Seguidores',type:'int'},{key:'cpseg',label:'C/Seguidor',type:'brl'},
      {key:'gL',label:'Gasto cantores',type:'brl'},{key:'gE',label:'Gasto evento',type:'brl'},{key:'gS',label:'Gasto seguidores',type:'brl'}]),
    rows:dd.slice().reverse().map(x=>({k:x.d, cells:{date:x.d, wd:wdCell(x.d), ...row(x)}})),
    total:{date:null, wd:'', ...row({L:tL,E:tE,S:tS})},
    selectable:true, selSet:STATE.selDays, onSelect:onDay});
}
function renderGeral(){ renderGeralCore({kpis:'geralKpis',funnel:'geralFunnel',warn:'geralWarn',combo:'gCombo',daily:'gDaily'}); }

/* ---------------- CANTORES (LSC) ---------------- */
const temp=c=>/QUENTE/i.test(c)?'q':/FRIO/i.test(c)?'f':'o';
function renderLsc(){
  const {fM,fL}=scope('lsc',null), t=totals(fM,fL), d=derive(t);
  kpiRow('lscKpis',[
    {label:'Investimento',val:brl(d.gasto),aux:STATE.tax?'com imposto':'bruto'},
    {label:'Leads',val:intf(t.leads),aux:'cadastros de anúncio Meta',hero:true},
    {label:'Custo por lead',val:brl(d.cpl),aux:'gasto ÷ leads',hero:true},
    {label:'Taxa de qualificação',val:pct(d.txq),aux:`${intf(t.mql)} MQLs ÷ ${intf(d.aval)} avaliados`,hero:true},
    {label:'MQLs (Reunião CEO)',val:intf(t.mql),aux:'CPMQL '+brl(d.cpmql)},
  ]);
  document.getElementById('lscFunnel').innerHTML=funnelHTML([
    ['Gasto', brl(d.gasto), [], false, 'hl-gasto'],
    ['Impressões', intf(t.im), [['CPM',brl(d.cpm)]]],
    ['Cliques', intf(t.cl), [['CTR',pct(d.ctr)],['CPC',brl(d.cpc)]]],
    ['Page Views', intf(t.pv), [['CR',pct(d.cr)],['CPV',brl(d.cpv)]]],
    ['Leads', intf(t.leads), [['CPL',brl(d.cpl)],['Tx‑Qualif.',pct(d.txq)]], false, 'hl-mql'],
    ['MQLs (Reunião CEO)', intf(t.mql), [['Tx‑Qualif.',pct(d.txq)],['CPMQL',brl(d.cpmql)]], false, 'hl-mql'],
  ]);
  setWarn('lscWarn', warnHTML('lsc',fL));
  document.getElementById('lscQual').innerHTML=[
    ['q-mql','MQLs','Reunião CEO',t.mql,'CPMQL '+brl(d.cpmql)],
    ['q-dq','Desqualificados','Rejeitado',t.dq,''],
    ['q-na','Não avaliados','Formulário preenchido',t.na,'fora da taxa'],
    ['q-fora','Removidos / Arquivados','fora da classificação',t.fora,'contam no total de leads'],
    ['','Taxa de qualificação','MQLs ÷ (MQLs + desqualificados)',null,`${intf(t.mql)} ÷ ${intf(d.aval)}`],
  ].map(([c,l,s,v,a])=>`<div class="qual-box ${c}"><div class="ql">${l}</div><div class="qv">${v==null?pct(d.txq):intf(v)}</div><div class="qa">${s}${a?' · '+a:''}</div></div>`).join('');
  /* quente × frio */
  const grp={q:[blank(),'Quente'],f:[blank(),'Frio']};
  fM.forEach(r=>{const k=temp(r.camp); if(grp[k]) addM(grp[k][0],r);});
  fL.forEach(r=>{const k=temp(r.camp); if(grp[k]) addL(grp[k][0],r);});
  const cols=[grp.q[0],grp.f[0],t], dv=cols.map(derive);
  const lines=[
    ['Gasto',x=>brl(dv[x].gasto)],['Impressões',x=>intf(cols[x].im)],['CTR',x=>pct(dv[x].ctr),dv.map(v=>v.ctr),'max'],
    ['Leads',x=>intf(cols[x].leads)],['CPL',x=>brl(dv[x].cpl),dv.map(v=>v.cpl),'min'],
    ['MQLs',x=>intf(cols[x].mql)],['Desqualificados',x=>intf(cols[x].dq)],['Não avaliados',x=>intf(cols[x].na)],
    ['Tx‑Qualif.',x=>pct(dv[x].txq)+` <span style="color:var(--muted);font-weight:400">(${intf(cols[x].mql)}/${intf(dv[x].aval)})</span>`,dv.map(v=>v.txq),'max'],
    ['CPMQL',x=>brl(dv[x].cpmql),dv.map(v=>v.cpmql),'min'],
  ];
  const best=(vals,how)=>{ const v=vals.slice(0,2); if(v.some(x=>x==null)) return -1; return how==='min'?(v[0]<v[1]?0:v[1]<v[0]?1:-1):(v[0]>v[1]?0:v[1]>v[0]?1:-1); };
  document.getElementById('lscCmp').innerHTML='<thead><tr><th></th><th>Quente (engajamento IG)</th><th>Frio (Lookalike)</th><th>Total</th></tr></thead><tbody>'
    +lines.map(([l,f,vals,how])=>{ const b=vals?best(vals,how):-1;
      return `<tr><td>${l}</td>${[0,1,2].map(x=>`<td class="${x===b?'best':''}">${f(x)}</td>`).join('')}</tr>`; }).join('')+'</tbody>';
  comboChart('lscCombo', daily(fM,fL), [{label:'MQLs',fn:x=>x.mql,color:'--chart-mqls'}],
    [{label:'Gasto',fn:x=>x.sp*taxf(),color:'--chart-gasto'},{label:'CPMQL',fn:x=>derive(x).cpmql,color:'--chart-cpmql'}]);
  dailyTable('lscDaily', C_LSC, fM, fL);
  hierTables('lsc','lsc', C_LSC, {res:r=>r.st==='mql'?1:0, label:'MQLs', cost:x=>x.cpmql});
}

/* ---------------- EVENTO SP (EVT) ---------------- */
function renderEvt(){
  /* meta: inscrições de anúncio na janela de captação, independente do período/filtros */
  const inWin=r=>r.d>=B.evt_start&&r.d<=B.evt_end;
  const n=LE.filter(inWin).length, goal=B.evt_goal||150, p=goal?n/goal:0;
  const gWin=ME.filter(inWin).reduce((s,r)=>s+r.sp,0)*taxf();
  const dLeft=TODAY>B.evt_end?0:Math.round((new Date(B.evt_end+'T00:00:00')-new Date((TODAY<B.evt_start?B.evt_start:TODAY)+'T00:00:00'))/86400000)+1;
  document.getElementById('evtWindow').textContent=`captação ${brdate(B.evt_start)} a ${brdate(B.evt_end)}`;
  document.getElementById('evtGoal').innerHTML=
    `<div class="goal-top"><div class="goal-val">${intf(n)} <small>/ ${intf(goal)} inscrições</small></div><div class="goal-pct">${pct(p)}</div></div>`
    +`<div class="goal-bar"><div class="goal-fill" style="width:${Math.min(100,p*100).toFixed(1)}%"></div></div>`
    +`<div class="goal-sub">Faltam <b>${intf(Math.max(0,goal-n))}</b> · ${dLeft?plural(dLeft,'dia restante','dias restantes')+' (incluindo hoje)':'captação encerrada'} · gasto na janela ${brl(gWin)} · CPL ${brl(n?gWin/n:null)}</div>`;
  const {fM,fL}=scope('evt',null), t=totals(fM,fL), d=derive(t);
  kpiRow('evtKpis',[
    {label:'Investimento',val:brl(d.gasto),aux:STATE.tax?'com imposto':'bruto'},
    {label:'Inscrições (leads)',val:intf(t.leads),aux:'cadastros de anúncio Meta',hero:true},
    {label:'Custo por lead',val:brl(d.cpl),aux:'gasto ÷ inscrições',hero:true},
    {label:'Meta de inscrições',val:pct(p),aux:`${intf(n)} de ${intf(goal)} · ${brdate(B.evt_start).slice(0,5)} a ${brdate(B.evt_end).slice(0,5)}`},
  ]);
  document.getElementById('evtFunnel').innerHTML=funnelHTML([
    ['Gasto', brl(d.gasto), [], false, 'hl-gasto'],
    ['Impressões', intf(t.im), [['CPM',brl(d.cpm)]]],
    ['Cliques', intf(t.cl), [['CTR',pct(d.ctr)],['CPC',brl(d.cpc)]]],
    ['Page Views', intf(t.pv), [['CR',pct(d.cr)],['CPV',brl(d.cpv)]]],
    ['Inscrições', intf(t.leads), [['CPL',brl(d.cpl)],['ConvLP',pct(d.convlp)]], false, 'hl-mql'],
  ]);
  setWarn('evtWarn', warnHTML('evt',fL));
  comboChart('evtCombo', daily(fM,fL), [{label:'Inscrições',fn:x=>x.leads,color:'--chart-leads'}],
    [{label:'Gasto',fn:x=>x.sp*taxf(),color:'--chart-gasto'},{label:'CPL',fn:x=>derive(x).cpl,color:'--chart-cpmql'}]);
  dailyTable('evtDaily', C_EVT, fM, fL);
  hierTables('evt','evt', C_EVT, {res:()=>1, label:'inscrições', cost:x=>x.cpl});
}

/* ---------------- SEGUIDORES INSTAGRAM ---------------- */
function renderSeg(){
  const {fM}=scope('seg',null), t=totals(fM,[]), d=derive(t);
  kpiRow('segKpis',[
    {label:'Investimento',val:brl(d.gasto),aux:STATE.tax?'com imposto':'bruto'},
    {label:'Seguidores',val:intf(d.seg),aux:'coluna H (lançados à mão)',hero:true},
    {label:'Custo por seguidor',val:brl(d.cpseg),aux:'só linhas preenchidas',hero:true},
  ]);
  document.getElementById('segFunnel').innerHTML=funnelHTML([
    ['Gasto', brl(d.gasto), [], false, 'hl-gasto'],
    ['Impressões', intf(t.im), [['CPM',brl(d.cpm)]]],
    ['Cliques', intf(t.cl), [['CTR',pct(d.ctr)],['CPC',brl(d.cpc)]]],
    ['Seguidores', intf(d.seg), [['C/Seguidor',brl(d.cpseg)],['Seg./Clique',pct(d.segcl)]], false, 'hl-mql'],
  ]);
  const pend=fM.filter(r=>r.seg==null), spPend=pend.reduce((x,r)=>x+r.sp,0)*taxf();
  const dPend=[...new Set(pend.map(r=>r.d))].sort().map(brdate);
  setWarn('segFill', pend.length
    ? `<b>${brl(spPend)}</b> de gasto em ${plural(pend.length,'linha','linhas')} com seguidores <b>não preenchidos</b> (${dPend.join(', ')}): entra no gasto, mas não no custo por seguidor.`
    : '');
  comboChart('segCombo', daily(fM,[]), [{label:'Seguidores',fn:x=>derive(x).seg,color:'--chart-mqls'}],
    [{label:'Gasto',fn:x=>x.sp*taxf(),color:'--chart-gasto'},{label:'Custo/Seguidor',fn:x=>derive(x).cpseg,color:'--chart-cpmql'}]);
  dailyTable('segDaily', C_SEG, fM, []);
  hierTables('seg','seg', C_SEG, null);
}

/* ---------------- date presets ---------------- */
const PRESETS=[
  ['hoje','Hoje',()=>[TODAY,TODAY]],
  ['ontem','Ontem',()=>[addDays(TODAY,-1),addDays(TODAY,-1)]],
  ['3d','3 dias',()=>[addDays(TODAY,-2),TODAY]],
  ['7d','7 dias',()=>[addDays(TODAY,-6),TODAY]],
  ['14d','14 dias',()=>[addDays(TODAY,-13),TODAY]],
  ['30d','30 dias',()=>[addDays(TODAY,-29),TODAY]],
  ['mes','Este mês',()=>{const [y,m]=TODAY.split('-');return [`${y}-${m}-01`,TODAY];}],
  ['mespass','Mês passado',()=>{const dt=new Date(TODAY+'T00:00:00');const f=new Date(dt.getFullYear(),dt.getMonth()-1,1);const l=new Date(dt.getFullYear(),dt.getMonth(),0);return [dstr(f),dstr(l)];}],
  ['todo','Todo período',()=>[B.date_min,B.date_max]],
];
/* rótulo do botão de período — mostra o intervalo aplicado dentro do próprio botão */
function syncDateInputs(){
  const el=document.getElementById('periodBtnLabel'); if(!el) return;
  if(STATE.selDays.size){ el.textContent=STATE.selDays.size+(STATE.selDays.size>1?' dias selecionados':' dia selecionado'); return; }
  const pr=PRESETS.find(p=>p[0]===STATE.preset);
  if(STATE.from&&STATE.to) el.textContent=brdate(STATE.from)+' – '+brdate(STATE.to)+(pr?' · '+pr[1]:'');
  else el.textContent='Selecionar período';
}
function applyPreset(id){ const p=PRESETS.find(x=>x[0]===id); if(!p)return; const [f,t]=p[2]();
  STATE.from=f; STATE.to=t; STATE.preset=id; STATE.selDays.clear(); ppClose(); syncDateInputs(); renderAll(); }

/* ---- popover do seletor de período (estilo Data Studio) ---- */
const MONTHS_PT=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DOW_PT=['D','S','T','Q','Q','S','S'];
const PP={from:null,to:null,preset:'',fromView:'',toView:''};
function ymView(ds){ return (ds||TODAY).slice(0,7); }
function shiftView(view,delta){ const [y,m]=view.split('-').map(Number); const dt=new Date(y,m-1+delta,1); return dt.getFullYear()+'-'+pad(dt.getMonth()+1); }
function ppIsOpen(){ const pop=document.getElementById('periodPop'); return pop && !pop.hidden; }
function ppOpen(){
  PP.from=STATE.from; PP.to=STATE.to; PP.preset=STATE.selDays.size?'':STATE.preset;
  PP.fromView=ymView(STATE.from); PP.toView=ymView(STATE.to);
  document.getElementById('periodPop').hidden=false;
  document.getElementById('periodBtn').setAttribute('aria-expanded','true');
  ppRenderAll();
}
function ppClose(){ const pop=document.getElementById('periodPop'); if(pop) pop.hidden=true;
  const b=document.getElementById('periodBtn'); if(b) b.setAttribute('aria-expanded','false'); }
function ppRenderAll(){ ppRenderPresets(); ppRenderCal('from'); ppRenderCal('to'); ppRenderRange(); }
function ppRenderPresets(){
  const host=document.getElementById('ppPresets');
  host.innerHTML=PRESETS.map(p=>`<button class="pp-preset ${PP.preset===p[0]?'active':''}" data-p="${p[0]}">${p[1]}</button>`).join('');
  host.querySelectorAll('.pp-preset').forEach(c=>c.addEventListener('click',()=>{
    const p=PRESETS.find(x=>x[0]===c.dataset.p); const [f,t]=p[2]();
    PP.from=f; PP.to=t; PP.preset=p[0]; PP.fromView=ymView(f); PP.toView=ymView(t); ppRenderAll();
  }));
}
function ppRenderCal(side){
  const host=document.getElementById(side==='from'?'ppCalFrom':'ppCalTo');
  const view=side==='from'?PP.fromView:PP.toView;
  const [y,m]=view.split('-').map(Number);
  const startDow=new Date(y,m-1,1).getDay(), dim=new Date(y,m,0).getDate();
  let cells='';
  for(let i=0;i<startDow;i++) cells+='<span class="pp-day empty"></span>';
  for(let d=1;d<=dim;d++){
    const ds=view+'-'+pad(d);
    const inR=PP.from&&PP.to&&ds>=PP.from&&ds<=PP.to, isEdge=(ds===PP.from||ds===PP.to);
    const cls=['pp-day']; if(inR) cls.push('in'); if(ds===PP.from) cls.push('edge-l'); if(ds===PP.to) cls.push('edge-r'); if(isEdge) cls.push('sel');
    cells+=`<button class="${cls.join(' ')}" data-side="${side}" data-d="${ds}">${d}</button>`;
  }
  host.innerHTML=`<div class="pp-cal-head"><span class="pp-cal-title">${side==='from'?'Data de início':'Data de término'}</span></div>
    <div class="pp-cal-nav"><button class="pp-nav" data-nav="-1">‹</button><span class="pp-cal-month">${MONTHS_PT[m-1]} ${y}</span><button class="pp-nav" data-nav="1">›</button></div>
    <div class="pp-dow">${DOW_PT.map(x=>`<span>${x}</span>`).join('')}</div>
    <div class="pp-grid">${cells}</div>`;
  host.querySelectorAll('.pp-nav').forEach(b=>b.addEventListener('click',()=>{
    const nv=shiftView(view,+b.dataset.nav); if(side==='from') PP.fromView=nv; else PP.toView=nv; ppRenderCal(side);
  }));
  host.querySelectorAll('.pp-day[data-d]').forEach(b=>b.addEventListener('click',()=>ppPickDay(side,b.dataset.d)));
}
function ppPickDay(side,ds){
  PP.preset='';
  if(side==='from'){ PP.from=ds; if(PP.to&&PP.from>PP.to) PP.to=PP.from; }
  else { PP.to=ds; if(PP.from&&PP.to<PP.from) PP.from=PP.to; }
  ppRenderAll();
}
function ppRenderRange(){
  const el=document.getElementById('ppRange');
  if(PP.from&&PP.to){ const n=Math.round((new Date(PP.to+'T00:00:00')-new Date(PP.from+'T00:00:00'))/86400000)+1;
    el.textContent=brdate(PP.from)+' – '+brdate(PP.to)+(n>0?' · '+n+(n>1?' dias':' dia'):''); }
  else el.textContent='Selecione as datas';
}
function ppApply(){
  if(!PP.from||!PP.to){ ppClose(); return; }
  STATE.from=PP.from; STATE.to=PP.to; STATE.preset=PP.preset||''; STATE.selDays.clear();
  ppClose(); syncDateInputs(); renderAll();
}

/* ---------------- navegação & boot ---------------- */
const PAGE_TITLES={geral:'Visão Geral', lsc:'Funil de Cantores (LSC)', evt:'Funil Evento SP (EVT)', seg:'Seguidores Instagram'};
function setPage(p){ STATE.page=p;
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===p));
  Object.keys(PAGE_TITLES).forEach(k=>document.getElementById('page-'+k).classList.toggle('active',k===p));
  document.getElementById('ptitle').textContent=PAGE_TITLES[p];
  document.getElementById('navToggle').checked=false;
  history.replaceState(null,'','#'+p);
  renderAll();
}
/* aviso de dia parcial: o período ativo inclui hoje, que ainda não terminou */
function syncPartial(){
  const el=document.getElementById('partialPill'); if(!el) return;
  const on=dateActive(TODAY);
  el.hidden=!on;
  if(on) el.textContent=`Hoje (${brdate(TODAY).slice(0,5)}) parcial · dados até ${B.now_hm||'-'}`;
}
function renderAll(){
  syncPartial();
  if(STATE.page==='lsc') renderLsc(); else if(STATE.page==='evt') renderEvt(); else if(STATE.page==='seg') renderSeg();
  else renderGeral();
}

function applyTheme(){ let t=null; try{ t=localStorage.getItem('dm_theme'); }catch(e){}
  if(t==='light') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme','dark'); }
applyTheme();
document.getElementById('themeBtn').addEventListener('click',()=>{ const dark=document.documentElement.getAttribute('data-theme')==='dark'; lsSet('dm_theme',dark?'light':'dark'); applyTheme(); renderAll(); });

document.querySelectorAll('.nav-item').forEach(n=>n.addEventListener('click',()=>setPage(n.dataset.page)));
document.getElementById('taxToggle').addEventListener('click',function(){ STATE.tax=!STATE.tax; this.classList.toggle('on',STATE.tax); renderAll(); });
document.getElementById('periodBtn').addEventListener('click',e=>{ e.stopPropagation(); ppIsOpen()?ppClose():ppOpen(); });
document.getElementById('ppApply').addEventListener('click',ppApply);
document.getElementById('ppCancel').addEventListener('click',ppClose);
document.getElementById('periodPop').addEventListener('click',e=>e.stopPropagation());
document.addEventListener('click',()=>{ if(ppIsOpen()) ppClose(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&ppIsOpen()) ppClose(); });
document.getElementById('clearBtn').addEventListener('click',()=>{
  Object.values(STATE.sel).forEach(p=>Object.values(p).forEach(s=>s.clear())); STATE.selDays.clear(); applyPreset('mes'); });
document.getElementById('refreshBtn').addEventListener('click',function(){ this.classList.add('loading'); goRefresh(); });

document.getElementById('logoSub').textContent=B.client_sub||'';
document.getElementById('updated').innerHTML='Última atualização:<br>'+B.generated_at_brt+' (BRT)';
document.getElementById('buildFoot').textContent='build '+B.build_id;
document.getElementById('buildFoot2').textContent='· build '+B.build_id;

syncDateInputs();
document.getElementById('taxToggle').classList.toggle('on', STATE.tax);  /* imposto Meta ON por padrão */
setPage(PAGE_TITLES[location.hash.slice(1)]?location.hash.slice(1):'geral');

/* ---------------- Aviso de nova versão (sem recarregar por cima do usuário) ----------------
   O GitHub Pages serve o HTML com cache próprio (as metatags http-equiv NÃO controlam o
   cache HTTP). Em vez de recarregar sozinho (o que apagava filtros e seleção no meio do
   uso), a página CONSULTA a versão publicada com cache:'no-store' e, se houver build novo,
   mostra um aviso. Quem decide a hora de atualizar é o usuário. */
const UPD_CHECK_MS = 5*60*1000;
let updPending = false;
function goRefresh(){ location.replace(location.pathname+'?t='+Date.now()+location.hash); }
function updShowBanner(){
  if(updPending || document.getElementById('updBanner')) return;
  updPending = true;
  const el = document.createElement('div');
  el.id = 'updBanner';
  el.innerHTML = '<span>Novos dados publicados.</span>'
               + '<button class="btn primary" id="updNow">Atualizar agora</button>'
               + '<button class="btn" id="updLater" title="Continuar nesta versão">Depois</button>';
  document.body.appendChild(el);
  document.getElementById('updNow').addEventListener('click', goRefresh);
  document.getElementById('updLater').addEventListener('click', ()=>{ el.remove(); });
}
async function updCheck(){
  if(updPending || document.hidden || location.protocol==='file:') return;
  try{
    const r = await fetch(location.pathname+'?v='+Date.now(), {cache:'no-store'});
    if(!r.ok) return;
    const m = (await r.text()).match(/<meta\s+name="build"\s+content="([^"]+)"/i);
    if(m && B.build_id && m[1] !== B.build_id) updShowBanner();
  }catch(e){ /* offline: tenta de novo no próximo ciclo */ }
}
setInterval(updCheck, UPD_CHECK_MS);
setTimeout(updCheck, 15*1000);
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) updCheck(); });
