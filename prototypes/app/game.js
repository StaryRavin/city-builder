/*
 * Игра-градостроитель поверх редактора дорог (prototypes/road-editor/editor.js).
 *
 * Редактор даёт геометрию: дороги, сетку клеток вдоль улиц, участки под форму
 * квартала, 3D. Игра добавляет:
 *   - карту: плоская земля с рекой; узлы дорог в воде нельзя, звено через воду — мост (дороже);
 *   - зоны кистью по клеткам: жильё (мало- и многоэтажное), торговля, промышленность, офисы;
 *   - спрос (RCI) и рост: на свободных клетках своей зоны сами появляются дома
 *     размером по зоне, растут уровнем (этажами), пустеют и сносятся;
 *   - сети по дорогам (как в Cities: Skylines 2): электричество, водопровод и канализация
 *     идут вдоль дорог; станция питает дома своей связной сети, не хватает — дальние без услуги;
 *   - услуги с радиусом: поликлиника, полиция, пожарная, школа, парк → счастье → уровень дома;
 *   - бюджет: стройка и содержание, налоги по зонам, баланс в день;
 *   - этапы: новые здания открываются по числу жителей;
 *   - живую симуляцию (prototypes/life-sim): жители и машины этого города, пересборка в полночь.
 *
 * Единицы — как в редакторе: 4 единицы = 1 м, клетка 16 = 4 м. Время — игровые секунды от начала.
 */
(function(){
'use strict';
var E,g;                                   // API редактора и его геометрия
var $=function(id){return document.getElementById(id)};
var M=4;                                   // единиц в метре
var MAP={w:1600*M,h:1100*M};
var HOUR=3600,DAY=86400;

// ---------- справочник ----------
// зоны: тип редактора (res/com/work), ширина в колонках, глубина, этажи по уровням, плотность (мест на клетку·этаж)
var ZONE={
  r:{name:'Жильё',short:'Ж',type:'res',color:'#3F8F4E',cell:'#A6D99A',w:[2,3],d:[3,4],fl:[1,2,3],dens:0.5,unlock:0},
  h:{name:'Многоэтажки',short:'Ж+',type:'res',color:'#2E6E3A',cell:'#7CC08A',w:[3,5],d:[3,4],fl:[4,7,10],dens:0.55,unlock:500},
  c:{name:'Торговля',short:'Т',type:'com',color:'#3D7DC8',cell:'#A3C3EC',w:[2,4],d:[3,4],fl:[1,2,3],dens:0.5,unlock:0},
  i:{name:'Промышленность',short:'П',type:'work',color:'#D49A22',cell:'#EFCB82',w:[3,5],d:[3,4],fl:[1,2,2],dens:0.7,unlock:0},
  o:{name:'Офисы',short:'О',type:'work',color:'#8A5CC4',cell:'#CDB6EA',w:[2,4],d:[3,4],fl:[3,5,8],dens:1.0,unlock:800}
};
var ZKEYS=['r','h','c','i','o'];
// здания города: размер (колонки × глубина), цена, содержание в день, рабочие места,
// выработка (МВт, м³/сут), радиус услуги (м), у реки ли, с какого числа жителей
var BLD={
  wind:  {name:'Ветряк',group:'power',w:2,d:2,fl:6,cost:1800,up:35,jobs:1,power:3,color:'#E8ECEF',unlock:0,note:'3 МВт, без загрязнения'},
  coal:  {name:'Угольная ТЭС',group:'power',w:6,d:4,fl:3,cost:16000,up:260,jobs:30,power:40,color:'#6B6461',pollute:180,unlock:400,note:'40 МВт, загрязняет округу'},
  tower: {name:'Водонапорная башня',group:'water',w:2,d:2,fl:5,cost:2200,up:45,jobs:1,water:250,color:'#9DB7C9',use:0.2,unlock:0,note:'250 м³/сут, где угодно'},
  pump:  {name:'Водозабор',group:'water',w:2,d:3,fl:1,cost:5000,up:110,jobs:4,water:1500,color:'#5E93BE',use:0.5,bank:true,unlock:0,note:'1500 м³/сут, на берегу или прямо на реке, выше сброса'},
  outlet:{name:'Сброс стоков',group:'water',w:2,d:2,fl:1,cost:3000,up:70,jobs:2,sewage:1500,color:'#8C7A5B',use:0.2,bank:true,unlock:0,note:'1500 м³/сут, на берегу или прямо на реке'},
  park:  {name:'Сквер',group:'svc',w:2,d:2,fl:0,cost:900,up:15,jobs:0,radius:220,svc:'park',color:'#6DBE5F',unlock:0,note:'радиус 220 м, счастье жильцов'},
  clinic:{name:'Поликлиника',group:'svc',w:3,d:3,fl:2,cost:7000,up:140,jobs:15,radius:600,svc:'health',color:'#F0F0F0',use:0.4,unlock:150,note:'радиус 600 м'},
  police:{name:'Полиция',group:'svc',w:3,d:2,fl:2,cost:5500,up:120,jobs:12,radius:550,svc:'police',color:'#3B5BA5',use:0.3,unlock:150,note:'радиус 550 м'},
  fire:  {name:'Пожарная часть',group:'svc',w:3,d:3,fl:2,cost:5500,up:120,jobs:12,radius:550,svc:'fire',color:'#C83A30',use:0.3,unlock:150,note:'радиус 550 м'},
  school:{name:'Школа',group:'svc',w:4,d:3,fl:2,cost:9000,up:180,jobs:20,radius:700,svc:'school',color:'#E4B65A',use:0.4,unlock:400,note:'радиус 700 м, нужна для 3-го уровня'}
};
var SVC=['health','police','fire','school','park'],SVC_NAME={health:'медицина',police:'полиция',fire:'пожарные',school:'школа',park:'сквер'};
// потребление на жителя / рабочее место: МВт и м³ в сутки
var USE={res:{p:0.01,w:0.3},com:{p:0.02,w:0.15},i:{p:0.05,w:0.35},o:{p:0.03,w:0.12}};
var PRICE={road:8,bridge:45,roadUp:0.04,bridgeUp:0.25};   // за метр; содержание — за метр в сутки
var TAX0=10;                                              // налог по умолчанию, %
var YIELD={r:2.2,h:2.2,c:4,i:3.2,o:5};                    // доход в сутки на жителя / работника при налоге 10%
var MILESTONES=[150,400,800,1500,3000];

// ---------- состояние игры ----------
var S=null;   // {t, money, tax, zones, rng, hist, ...}
function newState(){return {t:7*HOUR,money:60000,tax:{r:10,c:10,i:10,o:10},zones:{},seed:7,demand:{r:60,c:0,i:30,o:0},
  stats:null,log:[],unlocked:0,speed:1,lastH:7,ledger:{inc:{},exp:{}},daily:[]}}
var rng=function(){S.seed=(S.seed*1664525+1013904223)>>>0;return S.seed/4294967296};

// ---------- карта: река ----------
// ось реки — плавная кривая через опорные точки, ширина ~56 м
var RIVER={hw:28*M,ctrl:[[1050,-80],[1080,150],[1010,330],[1060,520],[1180,690],[1170,880],[1240,1180]].map(function(p){return [p[0]*M,p[1]*M]})};
(function(){var c=RIVER.ctrl,out=[];
  for(var i=0;i<c.length-1;i++){var p0=c[Math.max(0,i-1)],p1=c[i],p2=c[i+1],p3=c[Math.min(c.length-1,i+2)];
    for(var k=0;k<12;k++){var t=k/12,t2=t*t,t3=t2*t;
      out.push([0,1].map(function(j){return 0.5*(2*p1[j]+(-p0[j]+p2[j])*t+(2*p0[j]-5*p1[j]+4*p2[j]-p3[j])*t2+(-p0[j]+3*p1[j]-3*p2[j]+p3[j])*t3)}))}}
  out.push(c[c.length-1]);RIVER.pts=out;
  // контур воды: смещения оси влево и вправо (ширина чуть «дышит»)
  var L=[],R=[];out.forEach(function(p,i){var a=out[Math.max(0,i-1)],b=out[Math.min(out.length-1,i+1)],d=[b[0]-a[0],b[1]-a[1]],l=Math.hypot(d[0],d[1]),n=[-d[1]/l,d[0]/l],w=RIVER.hw*(1+0.12*Math.sin(i*0.37));
    L.push([p[0]+n[0]*w,p[1]+n[1]*w]);R.push([p[0]-n[0]*w,p[1]-n[1]*w])});
  RIVER.poly=L.concat(R.reverse());
  // куски контура для 3D: четырёхугольники между соседними поперечниками (выпуклые)
  RIVER.quads=[];for(var i=0;i<out.length-1;i++)RIVER.quads.push([L[i],L[i+1],R[R.length-2-i],R[R.length-1-i]]);
})();
function segD(p,a,b){var ab=[b[0]-a[0],b[1]-a[1]],l2=ab[0]*ab[0]+ab[1]*ab[1],t=l2?Math.max(0,Math.min(1,((p[0]-a[0])*ab[0]+(p[1]-a[1])*ab[1])/l2)):0;return Math.hypot(p[0]-a[0]-ab[0]*t,p[1]-a[1]-ab[1]*t)}
// расстояние от точки до берега: < 0 — в воде; и положение вдоль реки (для «выше/ниже по течению»)
function riverAt(p){var best=Infinity,bi=0,P=RIVER.pts;for(var i=0;i<P.length-1;i++){var d=segD(p,P[i],P[i+1]);if(d<best){best=d;bi=i}}return {d:best-RIVER.hw*(1+0.12*Math.sin(bi*0.37)),along:bi}}
function inWater(p){return riverAt(p).d<0}
function waterLen(A,B){var L=Math.hypot(B[0]-A[0],B[1]-A[1]),n=Math.max(2,Math.ceil(L/8)),w=0;for(var i=0;i<n;i++){var t=(i+0.5)/n;if(inWater([A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t]))w+=L/n}return w}
function polyNearWater(parts,m){return parts.some(function(P){return P.some(function(q){return riverAt(q).d<m})})}
function polyInWater(parts){return parts.some(function(P){var c=[0,0];P.forEach(function(q){c[0]+=q[0]/P.length;c[1]+=q[1]/P.length});return inWater(c)||P.some(function(q){return riverAt(q).d<-2})})}

// ближайшая к p точка в воде (на треть ширины от берега внутрь) — куда тянуть трубу
function waterPoint(p){var P=RIVER.pts,best=Infinity,q=null;for(var i=0;i<P.length-1;i++){var a=P[i],b=P[i+1],ab=[b[0]-a[0],b[1]-a[1]],l2=ab[0]*ab[0]+ab[1]*ab[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*ab[0]+(p[1]-a[1])*ab[1])/l2)),x=[a[0]+ab[0]*t,a[1]+ab[1]*t],d=Math.hypot(p[0]-x[0],p[1]-x[1]);if(d<best){best=d;q=x}}
  var k=Math.max(0,(best-RIVER.hw*0.55)/best);return [p[0]+(q[0]-p[0])*k,p[1]+(q[1]-p[1])*k]}
// ---------- деньги ----------
function fmt(v){v=Math.round(v);return (v<0?'−':'')+String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g,' ')}
function spend(v,what){if(S.money<v){toast('Не хватает денег: нужно '+fmt(v)+' $','bad');return false}S.money-=v;S.ledger.exp[what]=(S.ledger.exp[what]||0)+v;return true}
function roadCost(A,B){var L=Math.hypot(B[0]-A[0],B[1]-A[1])/M,w=waterLen(A,B)/M;return {cost:Math.round((L-w)*PRICE.road+w*PRICE.bridge),len:L,bridge:w}}

// ---------- зоны ----------
function ckey(ce){return Math.round(ce[0]/4)+':'+Math.round(ce[1]/4)}
function zoneOf(cd){return S.zones[ckey(cd.ce)]||null}
// индекс клеток по колонкам сторон (пересобирается при новой геометрии)
var colIx=null,colG=null;
function columns(){if(colG===E.G&&colIx)return colIx;colIx={};E.G.drawn.forEach(function(c){var k=c.key+'#'+c.i;(colIx[k]=colIx[k]||[]).push(c)});
  Object.keys(colIx).forEach(function(k){colIx[k].sort(function(a,b){return a.j-b.j})});colG=E.G;return colIx}
// занятые домами клетки
// клетки — в сетке корзин по 64 единицы; дом проверяет только клетки своих корзин
var cellHash=null,cellHashG=null;
function cellsNear(bb){if(cellHashG!==E.G||!cellHash){cellHash={};E.G.drawn.forEach(function(c){var k=Math.floor(c.ce[0]/64)+':'+Math.floor(c.ce[1]/64);(cellHash[k]=cellHash[k]||[]).push(c)});cellHashG=E.G}
  var out=[];for(var x=Math.floor(bb[0]/64);x<=Math.floor(bb[2]/64);x++)for(var y=Math.floor(bb[1]/64);y<=Math.floor(bb[3]/64);y++){var b=cellHash[x+':'+y];if(b)out.push.apply(out,b)}return out}
function markLot(occ,l){var sh=E.shape(l);if(!sh.bb||!sh.parts.length)return;cellsNear(sh.bb).forEach(function(c){if(c.ce[0]>=sh.bb[0]&&c.ce[0]<=sh.bb[2]&&c.ce[1]>=sh.bb[1]&&c.ce[1]<=sh.bb[3]&&E.inLot(c.ce,l))occ[ckey(c.ce)]=1})}
function occupied(){var occ={};E.lots.forEach(function(l){markLot(occ,l)});return occ}

// ---------- дома ----------
function mkLot(key,k0,k1,j1){return {key:key,k0:k0,k1:k1,j1:j1,ext:null}}
function bld(l){return l.b}
function isZoneB(b){return !!ZONE[b.z]}
function zoneType(z){return ZONE[z]?ZONE[z].type:'work'}
function capFor(l){var b=l.b;if(BLD[b.z])return BLD[b.z].jobs;var z=ZONE[b.z];return Math.max(1,Math.round(E.cellsOf(Object.assign({},l,{cap:null}))*l.floors*z.dens))}
function setLevel(l,lv){var z=ZONE[l.b.z];l.b.lv=lv;l.floors=z.fl[lv-1];l.cap=null;l.cap=capFor(l)}
function done(b){return S.t>=b.done}
function jobsOf(l){var b=l.b;if(!done(b)||b.aband)return 0;return zoneType(b.z)==='res'?0:l.cap}

// ---------- сети и услуги ----------
function lotCenter(l){return g.partsCenter(E.shape(l).parts)}
// компонента дорог: номер корня по узлу улицы дома
function compOf(comp,l){var s=E.lotSeg(l);if(s===null||!E.segs[s])return null;return comp(E.segs[s].a)}
function useOf(l){var b=l.b;if(!done(b)||b.aband)return {p:0,w:0};
  if(BLD[b.z]){var u=BLD[b.z].use||0;return {p:BLD[b.z].power?0:u,w:BLD[b.z].water||BLD[b.z].sewage?0:u*2}}
  var t=zoneType(b.z),U=t==='res'?USE.res:t==='com'?USE.com:b.z==='o'?USE.o:USE.i,n=t==='res'?(b.occ||0):Math.round(l.cap*(S.stats?S.stats.fill:1));
  return {p:U.p*Math.max(1,n),w:U.w*Math.max(1,n)}}
function networks(){
  var comp=E.components(),nets={},L=E.lots,linked={};
  E.exits.forEach(function(x){if(E.exitValid(x))linked[comp(x.node)]=1});
  L.forEach(function(l){var c=compOf(comp,l);l.b.comp=c;l.b.linked=c!==null&&!!linked[c];l.b.ctr=lotCenter(l);
    if(c===null)return;var N=nets[c]||(nets[c]={P:0,Wt:0,Sw:0,prod:{p:[],w:[],s:[]},cons:[],need:{p:0,w:0,s:0}});
    var b=l.b,D=BLD[b.z];
    if(D&&done(b)){if(D.power){N.P+=D.power;N.prod.p.push(b.ctr)}if(D.water){N.Wt+=b.dirty?0:D.water;N.prod.w.push(b.ctr)}if(D.sewage){N.Sw+=D.sewage;N.prod.s.push(b.ctr)}}
    N.cons.push(l)});
  // раздача: сначала ближним к станции; кому не хватило — без услуги
  Object.keys(nets).forEach(function(c){var N=nets[c];
    function give(kind,cap,prod,flag,amt){var list=N.cons.filter(function(l){return amt(l)>0});
      list.forEach(function(l){var d=Infinity;prod.forEach(function(p){d=Math.min(d,Math.hypot(p[0]-l.b.ctr[0],p[1]-l.b.ctr[1]))});l.b._d=d});
      list.forEach(function(l){if(BLD[l.b.z]&&BLD[l.b.z].group!=='svc')l.b._d-=1e9});   // сначала станции (водокачке нужен свет)
      list.sort(function(a,b){return a.b._d-b.b._d});var left=cap,need=0;
      list.forEach(function(l){var a=amt(l);need+=a;if(prod.length&&left>=a-1e-9){left-=a;l.b[flag]=true}else l.b[flag]=false});
      N.need[kind]=need;
      N.cons.forEach(function(l){if(amt(l)<=0)l.b[flag]=true})}
    // водокачке нужно электричество: сначала свет
    give('p',N.P,N.prod.p,'pow',function(l){return useOf(l).p});
    N.Wt=0;N.Sw=0;N.cons.forEach(function(l){var D=BLD[l.b.z];if(D&&done(l.b)&&l.b.pow){if(D.water&&!l.b.dirty)N.Wt+=D.water;if(D.sewage)N.Sw+=D.sewage}});
    give('w',N.Wt,N.prod.w,'wat',function(l){return useOf(l).w});
    give('s',N.Sw,N.prod.s,'sew',function(l){return useOf(l).w})});
  L.forEach(function(l){if(l.b.comp===null){var u=useOf(l);l.b.pow=u.p<=0;l.b.wat=u.w<=0;l.b.sew=u.w<=0}});
  return nets}
// загрязнённая вода: водозабор ниже по течению от сброса и близко
function checkDirty(){var outs=E.lots.filter(function(l){return l.b.z==='outlet'&&done(l.b)}).map(function(l){return riverAt(lotCenter(l))});
  E.lots.forEach(function(l){if(l.b.z!=='pump')return;var r=riverAt(lotCenter(l));l.b.dirty=outs.some(function(o){return r.along>=o.along&&r.along-o.along<14})})}
function coverage(){
  var svc=E.lots.filter(function(l){return BLD[l.b.z]&&BLD[l.b.z].svc&&done(l.b)&&(l.b.pow||!BLD[l.b.z].use)&&l.b.linked!==false});
  var poll=E.lots.filter(function(l){return done(l.b)&&!l.b.aband&&(l.b.z==='i'||l.b.z==='coal')});
  E.lots.forEach(function(l){var b=l.b,c=b.ctr||lotCenter(l);b.cov={};
    svc.forEach(function(s){var D=BLD[s.b.z];if(Math.hypot(s.b.ctr[0]-c[0],s.b.ctr[1]-c[1])<=D.radius*M)b.cov[D.svc]=1});
    b.poll=0;poll.forEach(function(p){var r=(p.b.z==='coal'?BLD.coal.pollute:110)*M,d=Math.hypot(p.b.ctr[0]-c[0],p.b.ctr[1]-c[1]);if(d<r)b.poll=Math.max(b.poll,p.b.z==='coal'?1:0.6*(1-d/r)+0.2)})})}
function happiness(l){var b=l.b,t=zoneType(b.z),h=40,why=[];
  ['health','police','fire'].forEach(function(k){if(b.cov[k])h+=10;else if(S.stats&&S.stats.pop>=150)why.push('нет: '+SVC_NAME[k])});
  if(t==='res'){if(b.cov.school)h+=10;else if(S.stats&&S.stats.pop>=400)why.push('нет: школа');if(b.cov.park)h+=10;
    if(b.poll){h-=Math.round(30*b.poll);why.push('загрязнение')}}
  if(t!=='res'&&b.cov.park)h+=5;
  if(!b.pow){h-=35;why.push('нет электричества')}if(!b.wat){h-=35;why.push('нет воды')}if(!b.sew){h-=25;why.push('нет канализации')}
  if(b.dirtyW){h-=20;why.push('грязная вода')}
  var tx=S.tax[t==='res'?'r':t==='com'?'c':b.z==='o'?'o':'i'];if(tx>12){h-=(tx-12)*3;why.push('высокий налог')}if(tx<8)h+=(8-tx)*2;
  b.why=why;return Math.max(0,Math.min(100,h))}

// ---------- шаг экономики: раз в игровой час ----------
var dirty3D=false,dirtySim=false;
function hourly(){
  var L=E.lots;
  checkDirty();var nets=networks();coverage();
  var anyDirty=L.some(function(l){return l.b.z==='pump'&&l.b.dirty&&done(l.b)});
  // население и рабочие места
  var pop=0,jobs={c:0,i:0,o:0,x:0},dirtyNet={};
  L.forEach(function(l){var b=l.b;if(b.z==='pump'&&b.dirty)dirtyNet[b.comp]=1});
  L.forEach(function(l){var b=l.b;b.dirtyW=!!dirtyNet[b.comp]&&zoneType(b.z)==='res';
    if(!done(b)||b.aband)return;var t=zoneType(b.z);
    if(t==='res')pop+=b.occ||0;else{var k=t==='com'?'c':b.z==='o'?'o':BLD[b.z]?'x':'i';jobs[k]+=l.cap}});
  var J=jobs.c+jobs.i+jobs.o+jobs.x,workers=Math.round(pop*0.6),linked=E.exits.some(E.exitValid);
  var inComm=linked?Math.round(J*0.25):0,fill=J?Math.min(1,(workers+inComm)/J):1;
  var employed=Math.min(workers,J),outCap=linked?Math.round(30+0.15*workers):0,outJobs=Math.min(workers-employed,outCap),unemployed=workers-employed-outJobs;
  var st={pop:pop,jobs:jobs,J:J,workers:workers,employed:employed,outJobs:outJobs,unemployed:unemployed,fill:fill,nets:nets};
  // спрос
  var vac=Math.max(0,J-workers)/Math.max(20,J),un=unemployed/Math.max(20,workers);
  var hap=0,hn=0;L.forEach(function(l){if(zoneType(l.b.z)==='res'&&done(l.b)&&!l.b.aband){l.b.hap=happiness(l);hap+=l.b.hap;hn++}else if(isZoneB(l.b)&&done(l.b))l.b.hap=happiness(l)});
  st.hap=hn?hap/hn:60;
  var bad=L.filter(function(l){return done(l.b)&&isZoneB(l.b)&&(!l.b.pow||!l.b.wat||!l.b.sew)}).length/Math.max(1,L.filter(function(l){return isZoneB(l.b)}).length);
  var raw={
    r:35+130*vac-160*un+(st.hap-55)*0.6-5*(S.tax.r-TAX0)-60*bad,
    c:(0.12*pop+(linked?4:0)-jobs.c)/Math.max(8,0.12*pop)*100-5*(S.tax.c-TAX0),
    i:25+140*un+60*Math.max(0,0.7*jobs.c-jobs.i)/Math.max(10,0.7*jobs.c)-90*vac-5*(S.tax.i-TAX0),
    o:pop>=ZONE.o.unlock?10+110*un-70*vac-5*(S.tax.o-TAX0):0};
  ZKEYS.forEach(function(k){if(k==='h')return;var v=Math.max(-100,Math.min(100,raw[k]));S.demand[k]+=(v-S.demand[k])*0.25});
  if(!linked)ZKEYS.forEach(function(k){S.demand[k]=Math.min(S.demand[k],0)});
  st.demand=S.demand;S.stats=st;
  // дома: заселение, проблемы, заброшенность, уровень
  var changed=false;
  L.slice().forEach(function(l){var b=l.b;if(!isZoneB(b))return;
    if(!done(b))return;
    if(!b.built){b.built=true;changed=true;dirtySim=true}
    var ok=b.pow&&b.wat&&b.sew&&b.linked,t=zoneType(b.z);
    if(b.aband){if(ok&&b.hap>=35){b.okH=(b.okH||0)+1;if(b.okH>=12){b.aband=0;b.badH=0;b.okH=0;changed=true;dirtySim=true}}
      else if(S.t-b.aband>3*DAY){E.lots=E.lots.filter(function(x){return x!==l});changed=true;dirtySim=true;log('Снесён заброшенный дом')}return}
    if(!ok||b.hap<20){b.badH=(b.badH||0)+1;if(b.badH>=(ok?72:36)){b.aband=S.t;b.occ=0;b.badH=0;changed=true;dirtySim=true;log((ok?'Жильцы уехали: несчастны — ':'Дом заброшен: ')+(b.why||[]).slice(0,2).join(', '))}}else b.badH=0;
    if(t==='res'){var want=l.cap;if(b.linked&&S.demand.r>-30&&(b.occ||0)<want){b.occ=Math.min(want,(b.occ||0)+Math.max(1,Math.ceil(want/4)));dirtySim=true}
      if(b.occ>want)b.occ=want}
    // уровень: счастье держится сутки — +1 уровень (до 3; на 3-й нужна школа у жилья)
    if(ok&&b.lv<3){var need=b.lv===1?60:78;if(b.hap>=need&&(b.lv===1||t!=='res'||b.cov.school)){b.upH=(b.upH||0)+1;if(b.upH>=24){if(tryLevel(l)){changed=true;dirtySim=true}b.upH=0}}else b.upH=0}
  });
  // рост: новые дома на свободных клетках зон
  var occ=null;
  ZKEYS.forEach(function(z){var d=z==='h'?S.demand.r:S.demand[z];if(d<=4||S.stats.pop<ZONE[z].unlock&&z!=='r'&&z!=='c'&&z!=='i')return;
    var n=rng()*100<d?1+(d>45?1:0)+(d>75?1:0):0;for(var i=0;i<n;i++){occ=occ||occupied();if(grow(z,occ))changed=true}});
  // деньги за час
  var inc=0,incBy={r:0,c:0,i:0,o:0};
  L.forEach(function(l){var b=l.b;if(!done(b)||b.aband||!isZoneB(b))return;var t=zoneType(b.z),k=t==='res'?'r':t==='com'?'c':b.z==='o'?'o':'i';
    var n=t==='res'?(b.occ||0):l.cap*fill,y=YIELD[b.z]*S.tax[k]/TAX0*(b.pow&&b.wat?1:0.5)*(1+0.15*(b.lv-1));incBy[k]+=n*y/24});
  Object.keys(incBy).forEach(function(k){inc+=incBy[k]});
  var road=0,bridge=0;Object.keys(E.segs).forEach(function(id){var e=E.segEnds(E.segs[id]),w=waterLen(e[0],e[1])/M;road+=Math.hypot(e[1][0]-e[0][0],e[1][1]-e[0][1])/M-w;bridge+=w});
  var exp={roads:(road*PRICE.roadUp+bridge*PRICE.bridgeUp)/24,power:0,water:0,svc:0};
  L.forEach(function(l){var D=BLD[l.b.z];if(D)exp[D.group==='svc'?'svc':D.group]+=D.up/24});
  var out=exp.roads+exp.power+exp.water+exp.svc;
  S.money+=inc-out;
  S.hourInc=incBy;S.hourExp=exp;S.net=(inc-out)*24;
  // этапы
  while(S.unlocked<MILESTONES.length&&pop>=MILESTONES[S.unlocked]){var m=MILESTONES[S.unlocked];S.unlocked++;S.money+=m*10;
    var news=[];ZKEYS.forEach(function(z){if(ZONE[z].unlock===m)news.push(ZONE[z].name)});Object.keys(BLD).forEach(function(k){if(BLD[k].unlock===m)news.push(BLD[k].name)});
    toast('Город вырос до '+m+' жителей! Премия '+fmt(m*10)+' $'+(news.length?'. Открыто: '+news.join(', '):''),'good');buildTools()}
  alerts(st);
  E.drawLots();if(changed)dirty3D=true;
  ui();
}
// предупреждения о нехватке — не чаще раза в 6 игровых часов на каждую
function alerts(st){var P=0,Pn=0,Wt=0,Wn=0,Sw=0,Sn=0;Object.keys(st.nets).forEach(function(c){var N=st.nets[c];P+=N.P;Pn+=N.need.p;Wt+=N.Wt;Wn+=N.need.w;Sw+=N.Sw;Sn+=N.need.s});
  S.warn=S.warn||{};var msg=null,k=null;
  if(Pn>P+1e-9){k='p';msg='Не хватает электричества: нужно '+Pn.toFixed(1)+' МВт, есть '+P+'. Постройте ветряки или ТЭС.'}
  else if(Wn>Wt+1e-9){k='w';msg='Не хватает воды: нужно '+Math.round(Wn)+' м³/сут, есть '+Math.round(Wt)+'. Нужна водонапорная башня или водозабор у реки.'}
  else if(Sn>Sw+1e-9){k='s';msg='Стокам некуда деваться: нужно '+Math.round(Sn)+' м³/сут, есть '+Math.round(Sw)+'. Постройте сброс стоков у реки.'}
  else if(E.lots.some(function(l){return l.b.z==='pump'&&l.b.dirty&&done(l.b)})){k='d';msg='Водозабор ниже сброса стоков — в домах грязная вода. Поставьте водозабор выше по течению.'}
  if(msg&&(!S.warn[k]||S.t-S.warn[k]>6*HOUR)){S.warn[k]=S.t;toast(msg,'bad')}}
function tryLevel(l){var z=ZONE[l.b.z],lv=l.b.lv+1,old={floors:l.floors,cap:l.cap,lv:l.b.lv};setLevel(l,lv);return true}
// новый дом зоны z: случайное свободное место на сторонах, где вся глубина — эта зона
function grow(z,occ){
  var Z=ZONE[z],cols=columns(),comp=E.components(),linked={},spots=[];occ=occ||occupied();
  E.exits.forEach(function(x){if(E.exitValid(x))linked[comp(x.node)]=1});
  Object.keys(E.G.hs).forEach(function(key){var Sd=E.G.hs[key],seg=+key.split(':')[0];if(!E.segs[seg]||!linked[comp(E.segs[seg].a)])return;
    var depth=[];for(var i=0;i<Sd.nC;i++){var cs=cols[key+'#'+i]||[],dd=0;for(var j=0;j<cs.length;j++){if(cs[j].j!==j||S.zones[ckey(cs[j].ce)]!==z||occ[ckey(cs[j].ce)])break;dd++}depth.push(dd)}
    for(var i=0;i<Sd.nC;i++){if(depth[i]<Z.d[0])continue;var j=i;while(j+1<Sd.nC&&depth[j+1]>=Z.d[0]&&j+1-i<Z.w[1])j++;
      if(j-i+1>=Z.w[0])spots.push({key:key,k0:i,k1:j,dep:Math.min.apply(null,depth.slice(i,j+1))});}});
  for(var tries=0;tries<12&&spots.length;tries++){var sp=spots[Math.floor(rng()*spots.length)],w=Z.w[0]+Math.floor(rng()*(Z.w[1]-Z.w[0]+1)),w2=Math.min(w,sp.k1-sp.k0+1);
    var d=Math.min(sp.dep,Z.d[0]+Math.floor(rng()*(Z.d[1]-Z.d[0]+1)));
    var l=mkLot(sp.key,sp.k0,sp.k0+w2-1,d-1);if(E.check(l,null))continue;
    l.type=Z.type;l.color=E.nextColor(Z.type);l.b={z:z,lv:1,born:S.t,done:S.t+(4+rng()*6)*HOUR,occ:0};l.floors=Z.fl[0];l.cap=capFor(l);
    E.lots.push(l);markLot(occ,l);return true}
  return false}

// ---------- журнал и подсказки ----------
function log(t){S.log.unshift({t:S.t,m:t});S.log.length=Math.min(S.log.length,40)}
var toastT=null;
function toast(t,kind){var el=$('toast');el.textContent=t;el.className='toast '+(kind||'');el.hidden=false;clearTimeout(toastT);toastT=setTimeout(function(){el.hidden=true},kind==='good'?6000:3500)}

// ---------- инструменты ----------
var tool='look',place=null,overlay='none';
function unlockedPop(u){return !u||(S.stats?S.stats.pop:0)>=u||MILESTONES.indexOf(u)<S.unlocked}
var TOOLS=[
  {id:'look',label:'Смотреть',grp:'Город'},{id:'road',label:'Дорога',grp:'Город'},{id:'bull',label:'Снос',grp:'Город'},
  {id:'z:r',label:'Жильё',grp:'Зоны',z:'r'},{id:'z:h',label:'Многоэтажки',grp:'Зоны',z:'h'},{id:'z:c',label:'Торговля',grp:'Зоны',z:'c'},{id:'z:i',label:'Пром.',grp:'Зоны',z:'i'},{id:'z:o',label:'Офисы',grp:'Зоны',z:'o'},{id:'z:-',label:'Снять',grp:'Зоны',z:'-'}
].concat(Object.keys(BLD).map(function(k){var D=BLD[k];return {id:'b:'+k,label:D.name,grp:{power:'Электричество',water:'Вода',svc:'Услуги'}[D.group],b:k}}));
function toolLocked(t){if(t.z&&ZONE[t.z])return !unlockedPop(ZONE[t.z].unlock);if(t.b)return !unlockedPop(BLD[t.b].unlock);return false}
function buildTools(){var box=$('tools'),grp={},html='';
  TOOLS.forEach(function(t){(grp[t.grp]=grp[t.grp]||[]).push(t)});
  Object.keys(grp).forEach(function(k){html+='<div class="tg"><div class="tgh">'+k+'</div><div class="tgb">';
    grp[k].forEach(function(t){var lock=toolLocked(t),sw=t.z&&ZONE[t.z]?'<i style="background:'+ZONE[t.z].color+'"></i>':t.b?'<i style="background:'+BLD[t.b].color+'"></i>':'';
      var tip=t.b?BLD[t.b].note+' · '+fmt(BLD[t.b].cost)+' $, '+BLD[t.b].up+' $/сут':t.id==='road'?'8 $/м, мост 45 $/м':'';
      var lk=lock?(t.b?BLD[t.b].unlock:ZONE[t.z].unlock):0;
      html+='<button type="button" data-tool="'+t.id+'" aria-pressed="'+(tool===t.id)+'"'+(lock?' disabled title="Откроется при '+lk+' жителях"':' title="'+tip+'"')+'>'+sw+t.label+(t.b?' <small>'+fmt(BLD[t.b].cost)+'</small>':'')+(lock?' <small>🔒'+lk+'</small>':'')+'</button>'});
    html+='</div></div>'});
  box.innerHTML=html;
  box.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){setTool(b.dataset.tool)})})}
var HINTS={look:'Нажмите на дом — что в нём и чего ему не хватает. Тяните карту, чтобы двигать; колесо — масштаб.',
  road:'Тяните от точки до точки — дорога. Начните от существующей дороги, чтобы город был связан с выездом. Через реку — мост. Тап по дороге удаляет её.',
  bull:'Нажмите на дом или дорогу, чтобы снести. Деньги не возвращаются.',
  zone:'Ведите по клеткам вдоль дорог — зона на всю глубину. Дома вырастут сами, когда есть спрос, дорога к выезду, свет, вода и канализация.',
  unzone:'Ведите по клеткам — снять зону (под домами не снимается).',
  place:'Наведите на клетку у дороги и нажмите — построить. Сети идут по дорогам: станция питает всё, что связано с ней дорогами.'};
function setTool(id){tool=id;place=null;var m;
  if(id==='road')m='road';else if(id==='look')m='look';else if(id==='bull')m='bull';else if(id.indexOf('z:')===0)m='zone';else{m='place';place=id.slice(2)}
  E.setMode(m);
  $('tools').querySelectorAll('button').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.tool===id))});
  var h=m==='zone'&&id==='z:-'?HINTS.unzone:HINTS[m]||'';if(place)h=BLD[place].name+': '+BLD[place].note+'. '+fmt(BLD[place].cost)+' $, содержание '+BLD[place].up+' $/сут. '+HINTS.place;
  $('hint').textContent=h;$('prev').innerHTML=''}

// ---------- режимы ввода (вызываются редактором) ----------
var pan=null;
function panDown(P,e){var p=E.svgPt(e);pan={x:p[0],y:p[1],tx:E.view.tx,ty:E.view.ty,moved:false,P:P}}
function panMove(e){if(!pan)return;var p=E.svgPt(e);if(Math.hypot(p[0]-pan.x,p[1]-pan.y)>4)pan.moved=true;if(!pan.moved)return;E.view.tx=pan.tx+p[0]-pan.x;E.view.ty=pan.ty+p[1]-pan.y;E.applyView()}
function lotAt(P){for(var i=E.lots.length-1;i>=0;i--)if(E.inLot(P,E.lots[i]))return E.lots[i];return null}
var sel=null;
var paint=null;
function paintAt(P){var h=E.hitCell(P);if(!h)return;var cs=columns()[h.key+'#'+h.k]||[];paint.cols[h.key+'#'+h.k]=cs}
function paintLine(A,B){var L=Math.hypot(B[0]-A[0],B[1]-A[1]),n=Math.max(1,Math.ceil(L/6));for(var i=0;i<=n;i++)paintAt([A[0]+(B[0]-A[0])*i/n,A[1]+(B[1]-A[1])*i/n])}
function paintPreview(){var z=paint.z,occ=paint.occ,out='';Object.keys(paint.cols).forEach(function(k){paint.cols[k].forEach(function(c){if(occ[ckey(c.ce)])return;
  out+='<polygon class="ns" points="'+g.pts(c.poly)+'" fill="'+(z==='-'?'#E6E0CC':ZONE[z].cell)+'" stroke="'+(z==='-'?'#bbb':ZONE[z].color)+'" stroke-width="1"/>'})});$('prev').innerHTML=out}
var MODES={
  look:{down:function(P,e){panDown(P,e)},move:function(P,e){panMove(e)},up:function(P){var was=pan;pan=null;if(was&&!was.moved){sel=lotAt(was.P);info()}}},
  bull:{down:function(P,e){panDown(P,e)},move:function(P,e){panMove(e)},up:function(){var was=pan;pan=null;if(!was||was.moved)return;var P=was.P,l=lotAt(P);
    if(l){E.lots=E.lots.filter(function(x){return x!==l});if(sel===l){sel=null;info()}dirtySim=true;E.drawLots();dirty3D=true;toast('Снесено: '+lname(l));ui();return}
    var s=E.segUnder(P);if(s!==null){if(!canRemoveSeg(s))return;E.removeSeg(s);E.drawStatic();afterRoad();toast('Дорога снесена')}}},
  zone:{down:function(P,e){var z=tool.slice(2);paint={z:z,cols:{},last:P,occ:occupied()};paintAt(P);paintPreview()},
    move:function(P){if(!paint)return;paintLine(paint.last,P);paint.last=P;paintPreview()},
    up:function(){if(!paint)return;var z=paint.z,n=0;Object.keys(paint.cols).forEach(function(k){paint.cols[k].forEach(function(c){var kk=ckey(c.ce);if(paint.occ[kk])return;
      if(z==='-'){if(S.zones[kk]){delete S.zones[kk];n++}}else if(S.zones[kk]!==z){S.zones[kk]=z;n++}})});
      paint=null;$('prev').innerHTML='';if(n){E.drawStatic();dirty3D=true}}},
  place:{down:function(P){placeAt(P,true);return false},hover:function(P){placeAt(P,false)}}
};
function placeLot(P){var D=BLD[place],h=E.hitCell(P);
  // водозабор и сброс можно ставить, указав прямо на реку: ищем ближайшую клетку улицы по пути к дороге
  if(!h&&D.bank){var sg=null,bd=Infinity,F=null;Object.keys(E.segs).forEach(function(id){var e=E.segEnds(E.segs[id]),d=segD(P,e[0],e[1]);if(d<bd){bd=d;sg=e}});
    if(sg&&bd<60*M){var ab=[sg[1][0]-sg[0][0],sg[1][1]-sg[0][1]],l2=ab[0]*ab[0]+ab[1]*ab[1],t=Math.max(0,Math.min(1,((P[0]-sg[0][0])*ab[0]+(P[1]-sg[0][1])*ab[1])/l2));F=[sg[0][0]+ab[0]*t,sg[0][1]+ab[1]*t];
      // клетки вокруг ближайшей точки дороги; берём ту, что ближе всего к указанному месту на воде
      var bh=null,bdd=Infinity;for(var dx=-6;dx<=6;dx++)for(var dy=-6;dy<=6;dy++){var Q=[F[0]+dx*8,F[1]+dy*8],hq=E.hitCell(Q);if(!hq)continue;var dq=Math.hypot(Q[0]-P[0],Q[1]-P[1]);if(dq<bdd){bdd=dq;bh=hq}}h=bh}}
  if(!h)return null;var Sd=E.G.hs[h.key],k0=Math.max(0,Math.min(h.k,Sd.nC-D.w));
  if(Sd.nC<D.w)return null;var l=mkLot(h.key,k0,k0+D.w-1,D.d-1);if(D.bank)l.wet=true;return l}
function placeWhy(l){var D=BLD[place],why=E.check(l,null);if(why)return E.LWHY[why]||why;
  if(D.bank&&!polyNearWater(E.shape(l).parts,30*M))return 'нужно у реки: нажмите на воду рядом с дорогой или на клетку у берега (до 30 м от воды)';
  if(S.money<D.cost)return 'не хватает денег';return null}
function placeAt(P,commit){var D=BLD[place],l=placeLot(P);if(!l){$('prev').innerHTML='';return}
  var why=placeWhy(l);
  if(!commit){$('prev').innerHTML=E.lotSvg(l,why?'#D9363E':'#3E9B5B',why?'#8E1B21':'#1F6B38',0.55,1.6);$('hint').textContent=D.name+': '+(why?'нельзя — '+why:'можно, '+fmt(D.cost)+' $');return}
  if(why){toast(D.name+': '+why,'bad');return}
  if(!spend(D.cost,'build'))return;
  l.type='work';l.color=D.color;l.floors=Math.max(1,D.fl);l.b={z:place,lv:1,born:S.t,done:S.t+2*HOUR,occ:0};l.cap=D.jobs;
  E.lots.push(l);$("prev").innerHTML="";dirtySim=true;E.drawLots();dirty3D=true;toast('Строится: '+D.name);hourlySoon();ui()}
function canRemoveSeg(id){var g2=E.segs[id];if(E.exits.some(function(x){return x.node===g2.a||x.node===g2.b})){toast('Дорогу к выезду из города сносить нельзя','bad');return false}return true}
function afterRoad(){dirtySim=true;dirty3D=true;colIx=null;hourlySoon();ui()}
var soon=null;function hourlySoon(){clearTimeout(soon);soon=setTimeout(function(){hourly()},50)}

// ---------- вид домов ----------
function lname(l){var b=l.b;return BLD[b.z]?BLD[b.z].name:ZONE[b.z].name+' · ур. '+b.lv}
var OVL={none:'Обычный',power:'Электричество',water:'Вода',happy:'Счастье',svc:'Услуги'};
function hapColor(h){h=Math.max(0,Math.min(100,h));var a=[217,54,62],b=[242,190,60],c=[62,155,91],t=h/100,p=t<0.5?a.map(function(x,i){return Math.round(x+(b[i]-x)*t*2)}):b.map(function(x,i){return Math.round(x+(c[i]-x)*(t-0.5)*2)});return 'rgb('+p.join(',')+')'}
function lotLook(l){var b=l.b;if(!b)return null;var f,st,op=1,extra='';
  if(!done(b)){f='#D8D2C0';st='#9A9282';op=0.85}
  else if(b.aband){f='#8A8580';st='#4E4A46'}
  else if(BLD[b.z])f=BLD[b.z].color;
  else f=E.lotFill(l);
  if(overlay==='power'||overlay==='water'){var u=useOf(l),okk=overlay==='power'?b.pow:(b.wat&&b.sew);var prod=BLD[b.z]&&(overlay==='power'?BLD[b.z].power:(BLD[b.z].water||BLD[b.z].sewage));
    f=prod?(overlay==='power'?'#F2C230':'#3C8DD0'):!done(b)?'#D8D2C0':(overlay==='power'?u.p:u.w)>0?(okk?'#7BC47F':'#D9363E'):'#cfcac0'}
  if(overlay==='happy'&&isZoneB(b)&&done(b))f=hapColor(b.hap||0);
  if(overlay==='svc'&&isZoneB(b)){var n=SVC.filter(function(k){return b.cov&&b.cov[k]}).length;f=hapColor(n*25)}
  if(sel===l)extra+=E.lotSvg(l,'none','#1D1D1B',1,3);
  if(done(b)&&!b.aband&&BLD[b.z])extra+=glyph(l,b);
  // значки проблем
  if(overlay==='none'&&done(b)&&!b.aband){var ic=[];if(b.pow===false)ic.push('#F2C230');if(b.wat===false)ic.push('#3C8DD0');if(b.sew===false)ic.push('#8C7A5B');if(b.linked===false)ic.push('#D9363E');
    if(ic.length){var c=b.ctr||lotCenter(l),r=Math.max(3,5/E.view.k);ic.forEach(function(col,i){extra+='<circle cx="'+(c[0]+(i-(ic.length-1)/2)*r*2.3).toFixed(1)+'" cy="'+c[1].toFixed(1)+'" r="'+r.toFixed(1)+'" fill="'+col+'" stroke="#fff" stroke-width="'+(r*0.35).toFixed(1)+'"/>'})}}
  return {fill:f,stroke:E.geom?City3D.shade(f.charAt(0)==='#'?f:'#888888',-0.45):'#333',op:op,extra:extra}}
// значки станций в 2D: лопасти ветряка, бак башни, труба в реку
function glyph(l,b){var c=b.ctr||lotCenter(l),r=6*M,o='',sw=' stroke-width="'+(1.2*M)+'" stroke-linecap="round"';
  if(b.z==='wind'){for(var i=0;i<3;i++){var a=i*2*Math.PI/3-Math.PI/2;o+='<line x1="'+c[0]+'" y1="'+c[1]+'" x2="'+(c[0]+Math.cos(a)*r*1.1).toFixed(1)+'" y2="'+(c[1]+Math.sin(a)*r*1.1).toFixed(1)+'" stroke="#5A6168"'+sw+'/>'}o+='<circle cx="'+c[0]+'" cy="'+c[1]+'" r="'+(1.3*M)+'" fill="#5A6168"/>'}
  if(b.z==='tower')o+='<circle cx="'+c[0]+'" cy="'+c[1]+'" r="'+(r*0.65).toFixed(1)+'" fill="#8FB4CC" stroke="#4F7690" stroke-width="'+(0.8*M)+'"/>';
  if(b.z==='pump'||b.z==='outlet'){var w=waterPoint(c);o+='<line x1="'+c[0].toFixed(1)+'" y1="'+c[1].toFixed(1)+'" x2="'+w[0].toFixed(1)+'" y2="'+w[1].toFixed(1)+'" stroke="#6B747C"'+sw+'/><circle cx="'+w[0].toFixed(1)+'" cy="'+w[1].toFixed(1)+'" r="'+(b.z==='outlet'?3*M:1.6*M)+'" fill="'+(b.z==='outlet'?'#8A7A55':'#6B747C')+'" fill-opacity="0.8"/>'}
  if(b.z==='park')[[-0.3,-0.2],[0.25,-0.25],[0,0.25]].forEach(function(f){o+='<circle cx="'+(c[0]+f[0]*r*2).toFixed(1)+'" cy="'+(c[1]+f[1]*r*2).toFixed(1)+'" r="'+(1.8*M)+'" fill="#3E8E4A"/>'});
  return o}
function lotLabel(l){var b=l.b;if(!b)return null;if(BLD[b.z])return BLD[b.z].name;return ''}

// первый запуск: что делать
function welcome(){var el=$('info');el.innerHTML='<div><b>Новый город у реки</b></div><div>1. <b>Дорога</b>: тяните от шоссе вглубь карты — улицы и кварталы.</div>'+
  '<div>2. <b>Зоны</b>: ведите кистью по клеткам вдоль улиц — жильё, торговля, промышленность. Дома вырастут сами, если есть спрос (столбики Ж·Т·П·О вверху).</div>'+
  '<div>3. Жителям нужны <b>свет</b> (ветряк), <b>вода</b> (башня или водозабор у реки) и <b>сброс стоков</b> у реки — сети идут по дорогам.</div>'+
  '<div>4. Следите за казной и счастьем: услуги, скверы и низкие налоги растят дома до 3-го уровня. Новые здания открываются с ростом города.</div>'+
  '<div class="muted">Пробел — пауза, 1–3 — скорость. Правая кнопка мыши — двигать карту в любом режиме.</div><button type="button" id="info-x" aria-label="Закрыть">×</button>';
  el.hidden=false;$('info-x').onclick=function(){el.hidden=true}}
// ---------- окно сведений ----------
function info(){var el=$('info');if(!sel||E.lots.indexOf(sel)<0){el.hidden=true;sel=null;E.drawLots();return}
  var l=sel,b=l.b,D=BLD[b.z],t=zoneType(b.z),rows=[];
  rows.push('<b>'+lname(l)+'</b>'+(b.aband?' — <span class="bad">заброшен</span>':!done(b)?' — строится, ещё '+Math.ceil((b.done-S.t)/HOUR)+' ч':''));
  if(D){if(D.power)rows.push('Выработка: '+D.power+' МВт');if(D.water)rows.push('Вода: '+D.water+' м³/сут'+(b.dirty?' — <span class="bad">грязная, водозабор ниже сброса</span>':''));if(D.sewage)rows.push('Стоки: '+D.sewage+' м³/сут');
    if(D.radius)rows.push('Радиус: '+D.radius+' м');rows.push('Работников: '+D.jobs+' · содержание '+D.up+' $/сут')}
  else{rows.push(t==='res'?'Жильцов: '+(b.occ||0)+' из '+l.cap:'Рабочих мест: '+l.cap+(S.stats?' (занято '+Math.round(S.stats.fill*100)+'%)':''));
    rows.push('Этажей: '+l.floors+' · клеток: '+E.cellsOf(l));
    if(done(b))rows.push('Счастье: <b style="color:'+hapColor(b.hap||0)+'">'+Math.round(b.hap||0)+'</b>'+(b.lv<3?' · до уровня '+(b.lv+1)+' нужно '+(b.lv===1?60:78)+(b.lv===2&&t==='res'?' и школа':''):''));}
  if(done(b)){var u=useOf(l);rows.push('Свет: '+(u.p>0?(b.pow?'есть':'<span class="bad">нет</span>'):'—')+' · вода: '+(u.w>0?(b.wat?'есть':'<span class="bad">нет</span>'):'—')+' · стоки: '+(u.w>0?(b.sew?'есть':'<span class="bad">нет</span>'):'—'));
    if(isZoneB(b))rows.push('Рядом: '+(SVC.filter(function(k){return b.cov&&b.cov[k]}).map(function(k){return SVC_NAME[k]}).join(', ')||'ничего'));
    if(b.why&&b.why.length&&isZoneB(b))rows.push('<span class="bad">Жалобы: '+b.why.join(', ')+'</span>');
    if(b.linked===false)rows.push('<span class="bad">Нет дороги к выезду из города</span>')}
  el.innerHTML=rows.map(function(r){return '<div>'+r+'</div>'}).join('')+'<button type="button" id="info-x" aria-label="Закрыть">×</button>';el.hidden=false;
  $('info-x').onclick=function(){sel=null;info()};E.drawLots()}

// ---------- панель ----------
function clock(){var d=Math.floor(S.t/DAY)+1,h=Math.floor(S.t%DAY/HOUR),m=Math.floor(S.t%HOUR/60);return 'День '+d+', '+(h<10?'0':'')+h+':'+(m<10?'0':'')+m}
function ui(){if(!S.stats)return;var st=S.stats;
  $('money').textContent=fmt(S.money)+' $';$('money').className=S.money<0?'bad':'';
  $('net').textContent=(S.net>=0?'+':'')+fmt(S.net||0)+' $/сут';$('net').className=(S.net||0)<0?'bad':'good';
  $('pop').textContent=fmt(st.pop);$('jobs').textContent=fmt(st.J);
  $('unemp').textContent=st.workers?Math.round(st.unemployed/st.workers*100)+'%':'—';
  ['r','c','i','o'].forEach(function(k){var v=Math.max(0,S.demand[k]);$('d-'+k).style.height=Math.round(v)+'%';$('d-'+k).parentNode.title=ZONE[k].name+': спрос '+Math.round(S.demand[k])});
  var P=0,Pn=0,Wt=0,Wn=0,Sw=0,Sn=0;Object.keys(st.nets).forEach(function(c){var N=st.nets[c];P+=N.P;Pn+=N.need.p;Wt+=N.Wt;Wn+=N.need.w;Sw+=N.Sw;Sn+=N.need.s});
  $('u-p').textContent=Pn.toFixed(1)+' / '+P+' МВт';$('u-p').className=Pn>P+1e-9?'bad':'';
  $('u-w').textContent=Math.round(Wn)+' / '+Wt+' м³';$('u-w').className=Wn>Wt+1e-9?'bad':'';
  $('u-s').textContent=Math.round(Sn)+' / '+Sw+' м³';$('u-s').className=Sn>Sw+1e-9?'bad':'';
  var nx=MILESTONES[S.unlocked];$('mile').textContent=nx?'Следующий этап — '+nx+' жителей':'Все этапы пройдены';
  if(!$('budget').hidden)budget();
  if(sel)info()}
function clockUi(){$('clock').textContent=clock()}
function budget(){var I=S.hourInc||{},X=S.hourExp||{},r=function(v){return fmt(v*24)};
  $('bud-body').innerHTML='<table><tr><th>Доходы в сутки</th><th></th></tr>'+
    [['r','Жильё'],['c','Торговля'],['i','Промышленность'],['o','Офисы']].map(function(k){return '<tr><td>'+k[1]+' <label class="tax">налог <input type="range" min="1" max="29" value="'+S.tax[k[0]]+'" data-tax="'+k[0]+'"> <b>'+S.tax[k[0]]+'%</b></label></td><td class="num">'+r(I[k[0]]||0)+'</td></tr>'}).join('')+
    '<tr><th>Расходы в сутки</th><th></th></tr>'+[['roads','Дороги и мосты'],['power','Электростанции'],['water','Вода и стоки'],['svc','Услуги']].map(function(k){return '<tr><td>'+k[1]+'</td><td class="num">−'+r(X[k[0]]||0)+'</td></tr>'}).join('')+
    '<tr><th>Итого</th><th class="num">'+(S.net>=0?'+':'')+fmt(S.net||0)+'</th></tr></table><p class="muted">Налог выше 12% злит жителей и снижает спрос, ниже 8% — радует.</p>';
  $('bud-body').querySelectorAll('input[data-tax]').forEach(function(inp){inp.addEventListener('input',function(){S.tax[inp.dataset.tax]=+inp.value;inp.nextElementSibling.textContent=inp.value+'%'});inp.addEventListener('change',function(){hourly()})})}

// ---------- живая симуляция ----------
var SIM={on:true,sim:null,base:0,err:null,agents:0};
function simBuild(){SIM.sim=null;SIM.err=null;dirtySim=false;
  if(!SIM.on||typeof createSim!=='function')return;
  var snap=E.exportSim();if(!snap.gates.length||!snap.buildings.some(function(b){return b.type==='res'})){return}
  var cfg={seed:Math.floor(S.t/DAY)+1,carShare:0.5,outside:{jobs:Math.max(40,Math.round((S.stats?S.stats.outJobs:0)*1.2)),carOnly:false}};
  SIM.snap=snap;SIM.cfg=cfg;
  try{SIM.sim=createSim(snap,cfg)}catch(err){var m=/мест парковки (\d+)/.exec(err.message);
    if(m){try{cfg.cars=Math.floor(+m[1]*0.85);SIM.sim=createSim(snap,cfg)}catch(e2){SIM.err=e2.message}}else SIM.err=err.message}
  SIM.base=Math.floor(S.t/DAY+1e-9)*DAY;SIM.agents=SIM.sim?SIM.sim.agents.n:0;
  // симуляция начинается в полночь; если строим днём — догоняем текущее время
  if(SIM.sim){var need=S.t-SIM.base;if(need>0)simStep(need)}
}
// сбой симуляции не должен ронять игру: жители пропадают до следующей полуночи
function simStep(sec){try{advanceSeconds(SIM.sim,sec)}catch(err){SIM.err=err.message;SIM.sim=null;if(window.console)console.warn('симуляция остановлена:',err.message)}}
function exportLot(l,rec){var b=l.b;if(!b||!done(b)||b.aband)return false;
  if(zoneType(b.z)==='res'){if(!(b.occ>0))return false;rec.capacity=b.occ}
  else{var n=Math.round(l.cap*(S.stats?S.stats.fill:1));if(n<1)return false;rec.capacity=n}
  rec.floors=l.floors}
var CAR_COL=['#C8423A','#2F6DB5','#E8E6E0','#2A2D33','#8C9097','#D9A93A','#3E8E5B','#7A4E9C'],SHIRT=['#E05D44','#4A7FC1','#F2C14E','#5BAA6B','#9B6BC2','#E58FB0','#3FB5B0','#F28C38'];
function agentsDraw(){var sim=SIM.sim,el=$('agents');if(!sim){el.innerHTML='';if(E.V3.on&&E.V3.view){E.V3.view.setMarkers([]);}return}
  var T=sim.traffic,P=sim.peds,L=sim.life,A=sim.agents,k=M,out='',list=[],three=E.V3.on&&E.V3.view;
  var vb=$('sv').viewBox.baseVal,v=E.view,x0=(-v.tx)/v.k,y0=(-v.ty)/v.k,x1=x0+vb.width/v.k,y1=y0+vb.height/v.k,big=A.n>1500;
  for(var a=0;a<A.n;a++){var car=null,per=null;
    if(T&&A.car[a]){var st=T.state[a];if(st!==CAR.CITY&&st!==CAR.OUT&&st!==CAR.NONE){var q=T.pose(a);if(q&&!(big&&st===CAR.PARKED&&!three))car={x:q.x*k,y:q.y*k,heading:q.h,color:CAR_COL[a%8]}}}
    if(P&&L.act[a]===ACT.TRAVEL&&L.mode[a]===MODE.WALK&&P.state[a]!==PED.BEYOND){var pp=P.pose(a);if(pp)per={x:pp.x*k,y:pp.y*k,heading:pp.h,color:SHIRT[a%8]}}
    if(three){if(car||per)list.push({car:car,person:per});continue}
    if(car&&car.x>x0-20&&car.x<x1+20&&car.y>y0-20&&car.y<y1+20)out+='<rect x="-9" y="-3.8" width="18" height="7.6" rx="2" fill="'+car.color+'" stroke="#1E1F22" stroke-width="0.8" transform="translate('+car.x.toFixed(1)+' '+car.y.toFixed(1)+') rotate('+(car.heading*180/Math.PI).toFixed(1)+')"/>';
    if(per&&per.x>x0&&per.x<x1&&per.y>y0&&per.y<y1)out+='<circle cx="'+per.x.toFixed(1)+'" cy="'+per.y.toFixed(1)+'" r="2.6" fill="'+per.color+'" stroke="#fff" stroke-width="0.6"/>'}
  if(three){E.V3.view.setMarkers(list);E.V3.view.render();el.innerHTML=''}else el.innerHTML=out}

// ---------- время ----------
var SPEEDS=[0,60,300,1800],lastFrame=0,acc=0;
function setSpeed(i){S.speed=i;document.querySelectorAll('[data-speed]').forEach(function(b){b.setAttribute('aria-pressed',String(+b.dataset.speed===i))})}
function frame(ts){
  var dt=lastFrame?Math.min(0.1,(ts-lastFrame)/1000):0;lastFrame=ts;
  if(S.speed>0){var want=dt*SPEEDS[S.speed],t0=performance.now();
    // время игры идёт вместе с симуляцией: если она не успевает — игра замедляется
    while(want>0){var step=Math.min(want,Math.max(1,(Math.floor(S.t/HOUR)+1)*HOUR-S.t));
      if(SIM.sim){var k=Math.min(step,60);simStep(k);step=k}
      S.t+=step;want-=step;tick();
      if(performance.now()-t0>28)break}
    clockUi()}
  if(dirty3D&&E.V3.on&&ts-(frame.l3||0)>1500){frame.l3=ts;dirty3D=false;E.build3D()}
  if(ts-(frame.la||0)>(S.speed>=3?120:60)){frame.la=ts;agentsDraw()}
  if(ts-(frame.ls||0)>15000){frame.ls=ts;save()}
  requestAnimationFrame(frame)}
// смена часа и суток (по целым номерам, без сравнения дробных секунд)
function tick(){var h=Math.floor(S.t/HOUR+1e-9);while(S.lastH<h){S.lastH++;if(S.lastH%24===0)midnight();hourly()}}
function midnight(){S.daily.push({d:Math.floor(S.lastH/24),pop:S.stats?S.stats.pop:0,money:Math.round(S.money)});if(S.daily.length>60)S.daily.shift();
  simBuild()}

// ---------- сохранение ----------
var KEY='city-builder-app-v1';
function save(){try{localStorage.setItem(KEY,JSON.stringify({ed:E.dump(),S:Object.assign({},S,{stats:null})}))}catch(e){}}
function load(){try{var raw=localStorage.getItem(KEY);if(!raw)return false;var o=JSON.parse(raw);E.setWidth(28,8);E.load(o.ed);S=Object.assign(newState(),o.S);return true}catch(e){return false}}
function newGame(){E.reset();E.setWidth(28,8);S=newState();
  // шоссе с запада: выезд на краю карты, дорога вглубь
  var y=Math.round(560*M/16)*16,a=E.newNode(0,y),b=E.newNode(80*16,y);E.newSeg(a,b);E.addExit(a,'Шоссе на запад');
  SIM.sim=null}

// ---------- 2D-подложка: земля, река, край карты ----------
function terrain(){var r='<rect x="'+(-MAP.w)+'" y="'+(-MAP.h)+'" width="'+3*MAP.w+'" height="'+3*MAP.h+'" fill="#CFC8B2"/>'+
  '<rect x="0" y="0" width="'+MAP.w+'" height="'+MAP.h+'" fill="#E6E0CC"/>'+
  '<polygon points="'+g.pts(RIVER.poly)+'" fill="#7FB3D5" stroke="#5E93BE" stroke-width="2"/>';$('terrain').innerHTML=r}

// ---------- крючки редактора ----------
var hooks={
  init:function(api){E=api;g=E.geom;
    E.WHY.water='узел в реке';E.WHY.bounds='за краем карты';E.WHY.money='не хватает денег';E.LWHY.water='нельзя — в воде';
    var fresh=!load();if(fresh)newGame();
    resize();terrain();buildTools();setTool('look');
    E.drawStatic();hourly();
    // вид: на выезд и начало дороги
    var xs=[],ys=[];Object.keys(E.nodes).forEach(function(n){xs.push(E.nodes[n].x);ys.push(E.nodes[n].y)});
    var cx=(Math.min.apply(null,xs)+Math.max.apply(null,xs))/2,cy=(Math.min.apply(null,ys)+Math.max.apply(null,ys))/2,vb=$('sv').viewBox.baseVal;
    E.view.k=Math.min(1.2,Math.max(0.15,vb.width/((Math.max.apply(null,xs)-Math.min.apply(null,xs))+900)));E.view.tx=vb.width/2-cx*E.view.k;E.view.ty=vb.height/2-cy*E.view.k;E.applyView();E.drawLots();
    simBuild();setSpeed(S.speed||1);ui();clockUi();if(fresh)welcome();requestAnimationFrame(frame)},
  roadWhy:function(A,B){
    if([A,B].some(function(p){return p[0]<0||p[1]<0||p[0]>MAP.w||p[1]>MAP.h}))return 'bounds';
    if(inWater(A)||inWater(B))return 'water';
    if(roadCost(A,B).cost>S.money)return 'money';return null},
  roadInfo:function(Sx,Ex){var c=roadCost(Sx.P,Ex.P);return ' · '+fmt(c.cost)+' $'+(c.bridge>0?' (мост '+Math.round(c.bridge)+' м)':'')},
  beforeRoad:function(Sx,Ex){return spend(roadCost(Sx.P,Ex.P).cost,'roads')},
  beforeRemoveSeg:function(id){return canRemoveSeg(id)},
  afterRoad:function(){afterRoad()},
  cellSkip:function(c,ce){return inWater(ce)||c.some(function(q){return riverAt(q).d<-1})},
  cellStyle:function(cd){var z=S.zones[ckey(cd.ce)];if(z&&ZONE[z])return {fill:ZONE[z].cell,stroke:ZONE[z].color,op:0.8};return {fill:'#EFEBDD',stroke:'#D2CCB8',op:0.9}},
  lotCheck:function(l,sh){return !l.wet&&polyInWater(sh.parts)?'water':null},   // водозабор и сброс могут стоять в воде
  lotLook:lotLook,lotLabel:lotLabel,
  modes:MODES,
  hint:function(){return ''},
  idle:function(){},
  exportLot:exportLot,
  building3D:function(l,b){var B=l.b;if(!B)return;b.floors=l.floors;
    if(!done(B)){b.plain=true;b.color='#CFC6B0';b.floors=0.4}else if(B.aband){b.plain=true;b.color='#77716B'}
    else if(BLD[B.z]){b.model=B.z;b.color=BLD[B.z].color;b.floors=Math.max(1,BLD[B.z].fl);if(BLD[B.z].bank)b.pipeTo=waterPoint(lotCenter(l))}},
  zoneCells3D:function(){return []},
  areas3D:function(){var ar=[{polys:RIVER.quads,color:'#7FB3D5',y:0.6}],by={};
    E.G.drawn.forEach(function(c){var z=S.zones[ckey(c.ce)];if(z&&ZONE[z])(by[z]=by[z]||[]).push(c.poly)});
    Object.keys(by).forEach(function(z){ar.push({polys:by[z],color:ZONE[z].cell,y:1.0})});return ar}
};
window.CITY_APP=hooks;

// ---------- страница ----------
function resize(){var w=$('stage').clientWidth||800,h=$('stage').clientHeight||500;$('sv').setAttribute('viewBox','0 0 '+w+' '+h)}
window.addEventListener('resize',function(){if(!E)return;resize();E.drawLots()});
// размер карты меняется не только с окном (панели, подсказки) — следим за самой сценой
if(window.ResizeObserver)new ResizeObserver(function(){if(E){resize();E.drawLots()}}).observe(document.getElementById('stage')||document.body);
document.addEventListener('DOMContentLoaded',function(){});
window.addEventListener('load',function(){
  document.querySelectorAll('[data-speed]').forEach(function(b){b.addEventListener('click',function(){setSpeed(+b.dataset.speed)})});
  document.querySelectorAll('[data-ovl]').forEach(function(b){b.addEventListener('click',function(){overlay=b.dataset.ovl;document.querySelectorAll('[data-ovl]').forEach(function(x){x.setAttribute('aria-pressed',String(x===b))});E.drawLots()})});
  $('b-budget').addEventListener('click',function(){$('budget').hidden=!$('budget').hidden;if(!$('budget').hidden)budget()});
  $('bud-x').addEventListener('click',function(){$('budget').hidden=true});
  // подтверждение — вторым нажатием (окна confirm() в просмотрщике артефактов нет)
  var armT=null;$('b-new').addEventListener('click',function(){var b=this;
    if(!b.dataset.armed){b.dataset.armed='1';b.textContent='Точно? Нажмите ещё раз';clearTimeout(armT);armT=setTimeout(function(){delete b.dataset.armed;b.textContent='Новый город'},3000);return}
    delete b.dataset.armed;b.textContent='Новый город';try{localStorage.removeItem(KEY)}catch(e){}
    newGame();colIx=null;E.drawStatic();hourly();simBuild();if(E.V3.on){E.fit3();E.build3D()}welcome()});
  $('b-life').addEventListener('click',function(){SIM.on=!SIM.on;this.setAttribute('aria-pressed',String(SIM.on));if(SIM.on)simBuild();else SIM.sim=null});
  document.addEventListener('keydown',function(e){if(e.target.tagName==='INPUT')return;if(e.key===' '){e.preventDefault();setSpeed(S.speed?0:1)}if(e.key>='1'&&e.key<='3')setSpeed(+e.key);if(e.key==='Escape')setTool('look')});
});
window.__game={riverAt:riverAt,S:function(){return S},hourly:hourly,grow:grow,setTool:setTool,sim:function(){return SIM},BLD:BLD,ZONE:ZONE,save:save,
  // для тестов: зона на все клетки вокруг стороны, поставить здание по клетке
  zoneAll:function(z,filter){E.G.drawn.forEach(function(c){if(!filter||filter(c))S.zones[ckey(c.ce)]=z});E.drawStatic()},
  placeAt:function(kind,P){place=kind;placeAt(P,true)},advance:function(sec){var end=S.t+sec;while(S.t<end-1e-6){var step=Math.min(end-S.t,(Math.floor(S.t/HOUR)+1)*HOUR-S.t);if(SIM.sim)simStep(step);S.t+=step;tick()}clockUi()}};
})();
