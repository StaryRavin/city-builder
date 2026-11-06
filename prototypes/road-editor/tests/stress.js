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
 * 4. Новая улица из середины существующей не меняет и не удаляет построенные
 *    дома (если новая дорога прошла по дому — он становится невалидным).
 * 5. Участки не пересекаются друг с другом и не заходят на дороги: на сетях
 *    ставится много случайных участков так же, как это делает интерфейс, и
 *    каждая пара проверяется независимо — по площади пересечения.
 * 6. Контур каждого дома (для 3D) собирается в один замкнутый многоугольник
 *    с площадью, равной площади объединения его частей.
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
// ширина улицы (единицы, клетка = 16): node stress.js 60 28 — улицы 14 м с тротуарами, как в деревнях
const WIDE=+process.argv[3]||0,WIDE_SW=WIDE?8:0;
const res=await p.evaluate(([nets,WIDE,WIDE_SW])=>{
const A=window.__dbg.api,s=16,D=4;
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]],mul=(a,k)=>[a[0]*k,a[1]*k];
let seed=1;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const bugs=[],stats={nets:0,segs:0,cells:0,corners:0,ok:0},legit={};
const ok=k=>{legit[k]=(legit[k]||0)+1};
for(let sd=1;sd<=nets;sd++){
 seed=sd*7919;A.reset();if(WIDE)A.setWidth(WIDE,WIDE_SW);
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
// 4. Участки не пересекаются друг с другом и с дорогами. На каждой сети ставим
// много случайных участков так же, как интерфейс (selFrom → check → добавить),
// и проверяем каждую пару независимым способом — площадью пересечения выпуклых
// частей (отсечение многоугольника многоугольником).
function dedup(P){const o=[];P.forEach(p=>{const q=o[o.length-1];if(!q||Math.hypot(p[0]-q[0],p[1]-q[1])>1e-6)o.push(p)});while(o.length>1&&Math.hypot(o[0][0]-o[o.length-1][0],o[0][1]-o[o.length-1][1])<=1e-6)o.pop();return o}
function clipConvex(P,Q){ // P ∩ Q, оба выпуклые
 P=dedup(P);Q=dedup(Q);
 let out=P.slice();
 const sQ=Math.sign(Q.reduce((a,p,i)=>{const q=Q[(i+1)%Q.length];return a+p[0]*q[1]-q[0]*p[1]},0))||1;
 for(let i=0;i<Q.length&&out.length;i++){const a=Q[i],b=Q[(i+1)%Q.length],inp=out;out=[];
  const side=p=>sQ*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]));
  for(let k=0;k<inp.length;k++){const p=inp[k],q=inp[(k+1)%inp.length],sp=side(p),sq=side(q);
   if(sp>=0)out.push(p);if((sp>=0)!==(sq>=0)){const t=sp/(sp-sq);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t])}}}
 return out;
}
function area(p){let a=0;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length];a+=p[i][0]*q[1]-q[0]*p[i][1]}return Math.abs(a)/2}
function interArea(PA,PB){let s=0;PA.forEach(a=>PB.forEach(b=>{if(area(a)<1e-6||area(b)<1e-6)return;const c=clipConvex(a,b);if(c.length>=3)s+=area(c)}));return s}
const LIM=0.05; // допустимая площадь пересечения (погрешность вычислений)
for(let sd=1;sd<=Math.min(nets,40);sd++){
 seed=sd*104729;A.reset();if(WIDE)A.setWidth(WIDE,WIDE_SW);
 for(let t=0;t<40;t++){
  const st=window.__dbg.state(),ns=Object.values(st.nodes),sg=Object.values(st.segs);
  let P0;const r=rnd();
  if(ns.length&&r<0.6){const n=ns[Math.floor(rnd()*ns.length)];P0=[n.x,n.y]}
  else if(sg.length&&r<0.85){const g=sg[Math.floor(rnd()*sg.length)],a=st.nodes[g.a],bb=st.nodes[g.b],f=0.2+0.6*rnd();P0=[a.x+(bb.x-a.x)*f,a.y+(bb.y-a.y)*f]}
  else P0=[100+rnd()*480,80+rnd()*300];
  const S=A.snap(P0,null),ang=rnd()*2*Math.PI,L=(6+Math.floor(rnd()*16))*s;
  let P1=add(S.P,[L*Math.cos(ang),L*Math.sin(ang)]);
  if(ns.length&&rnd()<0.3){const n=ns[Math.floor(rnd()*ns.length)];P1=[n.x+(rnd()-0.5)*10,n.y+(rnd()-0.5)*10]}
  const E=A.endFor(S,P1);if(!A.validate(S,E))A.addRoad(S,E);
 }
 A.redraw();const G=A.G(),keys=Object.keys(G.hs).filter(k=>G.hs[k].nC>0);
 const placed=[];
 for(let t=0;t<300&&keys.length;t++){
  const key=keys[Math.floor(rnd()*keys.length)],S=G.hs[key];
  const k=Math.floor(rnd()*S.nC),uEnd=-2*s+rnd()*(S.E+4*s),j=Math.floor(rnd()*D);
  const Pt=add(add(S.ends.a.K,mul(S.d,uEnd)),mul(S.n,(j+0.5)*s));
  let sel;try{sel=A.selFrom({key,k,j:0},Pt);if(A.check(sel,null))continue;}catch(ex){bugs.push({net:sd,type:'exception-lot',msg:String(ex)});continue}
  A.addLot(sel);placed.push(sel);
 }
 stats.lots=(stats.lots||0)+placed.length;
 // 5. Новая улица из середины существующей не трогает чужие дома: после
 //    разреза звена каждый участок сохраняет ровно ту же форму (или, если
 //    новая дорога прошла по нему, становится невалидным), и не исчезает.
 const before=placed.map(l=>{const ps=A.shape(l).parts;return {l,area:ps.reduce((a,p)=>a+area(p),0),ps}});
 let splits=0;
 for(let t=0;t<12;t++){
  const st=window.__dbg.state(),ids=Object.keys(st.segs);if(!ids.length)break;
  const g=st.segs[ids[Math.floor(rnd()*ids.length)]],a=st.nodes[g.a],bb=st.nodes[g.b],f=0.25+0.5*rnd();
  const S=A.snap([a.x+(bb.x-a.x)*f,a.y+(bb.y-a.y)*f],null);if(S.type!=='split')continue;
  const ang=rnd()*2*Math.PI,L=(4+Math.floor(rnd()*8))*s,E=A.endFor(S,add(S.P,[L*Math.cos(ang),L*Math.sin(ang)]));
  if(A.validate(S,E))continue;A.addRoad(S,E);splits++;
 }
 A.redraw();stats.splits=(stats.splits||0)+splits;
 const now=window.__dbg.lotsRaw();
 for(const bf of before){
  if(!now.includes(bf.l)){bugs.push({net:sd,type:'lot-vanished-after-split',lot:bf.l});continue}
  const ps=A.shape(bf.l).parts,ar=ps.reduce((a,p)=>a+area(p),0);
  const same=Math.abs(ar-bf.area)<0.05&&interArea(ps,bf.ps)>bf.area-0.05;
  if(same)continue;
  if(A.check(bf.l,bf.l)){stats.lotsBrokenByRoad=(stats.lotsBrokenByRoad||0)+1;continue}
  bugs.push({net:sd,type:'lot-changed-after-split',lot:{key:bf.l.key,k0:bf.l.k0,k1:bf.l.k1,j1:bf.l.j1,ext:bf.l.ext},areaBefore:+bf.area.toFixed(2),areaAfter:+ar.toFixed(2),inter:+interArea(ps,bf.ps).toFixed(2),before:bf.ps.map(p=>p.map(q=>q.map(x=>+x.toFixed(1)))),after:ps.map(p=>p.map(q=>q.map(x=>+x.toFixed(1))))});
 }
 const shapes=placed.map(l=>A.shape(l).parts);
 // 6. Для 3D дом вытягивается одной фигурой: контур объединения частей должен
 //    собираться в один замкнутый многоугольник с площадью объединения.
 shapes.forEach((ps,i)=>{const o=A.unionOutline(ps);stats.outlines=(stats.outlines||0)+1;
  if(!o.loop||o.loop.length<3){bugs.push({net:sd,type:'outline-not-closed',lot:placed[i],parts:ps.map(p=>p.map(q=>q.map(x=>+x.toFixed(3))))});return}
  const sum=ps.reduce((a,p)=>a+area(p),0),mx=Math.max(...ps.map(area)),la=area(o.loop);
  // площадь объединения: сумма минус попарные пересечения частей
  let inter=0;for(let x=0;x<ps.length;x++)for(let y=x+1;y<ps.length;y++)inter+=interArea([ps[x]],[ps[y]]);
  if(Math.abs(la-(sum-inter))>0.5||la<mx-0.5)bugs.push({net:sd,type:'outline-wrong-area',lot:placed[i],loop:+la.toFixed(1),union:+(sum-inter).toFixed(1)});
 });
 for(let i=0;i<placed.length;i++){
  for(let k=i+1;k<placed.length;k++){const ia=interArea(shapes[i],shapes[k]);if(ia>LIM)bugs.push({net:sd,type:'lots-overlap',area:+ia.toFixed(3),a:placed[i],b:placed[k]})}
  const ra=interArea(shapes[i],G.bands.map(b=>b.poly));if(ra>LIM)bugs.push({net:sd,type:'lot-on-road',area:+ra.toFixed(3),lot:placed[i]});
 }
}
const by={};bugs.forEach(f=>{by[f.type]=(by[f.type]||0)+1});
return {stats,legit,by,sample:bugs.slice(0,200)};
},[nets,WIDE,WIDE_SW]);
console.log('проверено:',JSON.stringify(res.stats));
console.log('законные отказы:',JSON.stringify(res.legit));
if(errs.length)console.log('ошибки страницы:',errs.slice(0,5));
const n=res.sample.length+errs.length;
if(!n){console.log('багов не найдено');await b.close();return}
console.log('БАГИ:',JSON.stringify(res.by));
for(const t of Object.keys(res.by))console.log(' ',t,JSON.stringify(res.sample.filter(f=>f.type===t).slice(0,3)));
await b.close();process.exitCode=1;
})();
