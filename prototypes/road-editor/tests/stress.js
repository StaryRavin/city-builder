/*
 * Стресс-тест редактора дорог.
 *
 * Строит много случайных дорожных сетей той же логикой, что и рисование
 * пальцем (snap → endFor → validate → addRoad), и для каждой проверяет:
 *
 * 1. Инвариант сетки: каждый узел стоит на линии сетки каждой своей дороги.
 * 2. Каждая нарисованная клетка нажимается, и нажатие выбирает именно её
 *    сетку, колонку и ряд.
 * 3. В каждом углу каждой стороны выделение, протянутое от середины к углу
 *    (в тупом углу — за угол), на глубину 1–4 клетки:
 *    - доходит до угла (острый — угловой участок, тупой — добавка вдоль
 *      соседней улицы);
 *    - не падает с ошибкой;
 *    - строится, если не мешают чужие дороги.
 *
 * Законные отказы (не баги) считаются отдельно:
 * - участок задевает третью дорогу, не из этого угла;
 * - сторона слишком короткая (меньше 6 клеток) или участок охватывает оба
 *   угла стороны — тогда он может задеть дорогу другого угла;
 * - у соседней улицы в тупом углу нет ни одной свободной клетки под добавку.
 *
 * Запуск (нужен Playwright с Chromium):
 *   node prototypes/road-editor/tests/stress.js [число сетей, по умолчанию 60]
 * Код выхода 1, если найдены баги.
 */
const path=require('path');
const {chromium}=require('playwright');
(async()=>{
const b=await chromium.launch();const p=await b.newPage({viewport:{width:900,height:820}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+path.resolve(__dirname,'../index.html'));
const nets=+process.argv[2]||60;
const res=await p.evaluate((nets)=>{
const A=window.__dbg.api,s=16,D=4;
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]],mul=(a,k)=>[a[0]*k,a[1]*k];
let seed=1;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const bugs=[],stats={nets:0,segs:0,cells:0,corners:0,ok:0},legit={};
const ok=k=>{legit[k]=(legit[k]||0)+1};
for(let sd=1;sd<=nets;sd++){
 seed=sd*7919;A.reset();
 // случайная сеть: 40 попыток провести звено от узла, от точки на дороге или из пустоты
 for(let t=0;t<40;t++){
  const st=window.__dbg.state(),ns=Object.values(st.nodes),sg=Object.values(st.segs);
  let P0;const r=rnd();
  if(ns.length&&r<0.6){const n=ns[Math.floor(rnd()*ns.length)];P0=[n.x,n.y]}
  else if(sg.length&&r<0.85){const g=sg[Math.floor(rnd()*sg.length)],a=st.nodes[g.a],bb=st.nodes[g.b],f=0.2+0.6*rnd();P0=[a.x+(bb.x-a.x)*f,a.y+(bb.y-a.y)*f]}
  else P0=[100+rnd()*480,80+rnd()*300];
  const S=A.snap(P0,null),ang=rnd()*2*Math.PI,L=(6+Math.floor(rnd()*16))*s;
  let P1=add(S.P,[L*Math.cos(ang),L*Math.sin(ang)]);
  if(ns.length&&rnd()<0.3){const n=ns[Math.floor(rnd()*ns.length)];P1=[n.x+(rnd()-0.5)*10,n.y+(rnd()-0.5)*10]} // замыкание на узел
  const E=A.endFor(S,P1);
  if(!A.validate(S,E))A.addRoad(S,E);
 }
 A.redraw();stats.nets++;
 const G=A.G();stats.segs+=Object.keys(window.__dbg.state().segs).length;
 // 1. инвариант сетки
 const viol=window.__dbg.gridCheck();if(viol.length)bugs.push({net:sd,type:'grid-invariant',viol});
 // 2. нажатие на каждую нарисованную клетку
 for(const c of G.drawn){stats.cells++;
  const h=A.hitCell(c.ce);
  if(!h)bugs.push({net:sd,type:'cell-not-hittable',key:c.key,i:c.i,j:c.j});
  else if(h.key!==c.key||h.k!==c.i||h.j!==c.j)bugs.push({net:sd,type:'cell-hits-other',key:c.key,i:c.i,j:c.j,got:[h.key,h.k,h.j]});
 }
 // 3. угловые участки
 for(const key in G.hs){const S=G.hs[key];if(S.nC<2)continue;
  for(const e of ['a','b']){const en=S.ends[e],c=en.corner;if(!c)continue;
   const obt=c.alpha>Math.PI/2+1e-6,ang=Math.round(c.alpha*180/Math.PI);
   const kS=e==='a'?Math.min(S.nC-1,3):Math.max(0,S.nC-4);
   for(let j=0;j<D;j++){
    stats.corners++;
    const u=e==='a'?(obt?-1.5*s:0.3*S.cw):(obt?S.E+1.5*s:S.E-0.3*S.cw);
    const Pt=add(add(S.ends.a.K,mul(S.d,u)),mul(S.n,(j+0.5)*s));
    let sel,sh,why;
    try{sel=A.selFrom({key,k:kS,j:0},Pt);sh=A.shape(sel);why=A.check(sel,null)}
    catch(ex){bugs.push({net:sd,type:'exception',key,end:e,j,msg:String(ex)});continue}
    const reached=obt?(sel.ext&&sel.ext.end===e):(sh.flags&&sh.flags[e]==='acute');
    if(!reached){
     if(obt){const of=A.otherFrame(en);if(of.nC-(of.off<-1e-6?1:0)<1){ok('нет места вдоль соседней улицы');continue}}
     bugs.push({net:sd,type:'corner-not-reached',key,end:e,j,ang,sel});continue}
    if(why==='road'){
     const own=new Set([S.seg,+en.other.split(':')[0]]);let mine=false;
     sh.parts.forEach(pp=>G.bands.forEach(bd=>{if(A.overlaps(pp,bd.poly,0.5)&&((bd.seg!==undefined&&own.has(bd.seg))||bd.node===c.node))mine=true}));
     if(!mine){ok('мешает третья дорога');continue}
     if(S.nC<6){ok('короткая сторона');continue}
     if(sh.flags&&sh.flags.a&&sh.flags.b){ok('участок охватывает оба угла стороны');continue}
     bugs.push({net:sd,type:'corner-lot-hits-own-road',key,end:e,j,ang,sel});continue}
    if(why){bugs.push({net:sd,type:'corner-lot-invalid:'+why,key,end:e,j,ang,sel});continue}
    stats.ok++;
   }}}
}
const by={};bugs.forEach(f=>{by[f.type]=(by[f.type]||0)+1});
return {stats,legit,by,sample:bugs.slice(0,200)};
},nets);
console.log('проверено:',JSON.stringify(res.stats));
console.log('законные отказы:',JSON.stringify(res.legit));
if(errs.length)console.log('ошибки страницы:',errs.slice(0,5));
const n=res.sample.length+errs.length;
if(!n){console.log('багов не найдено');await b.close();return}
console.log('БАГИ:',JSON.stringify(res.by));
for(const t of Object.keys(res.by))console.log(' ',t,JSON.stringify(res.sample.filter(f=>f.type===t).slice(0,3)));
await b.close();process.exitCode=1;
})();
