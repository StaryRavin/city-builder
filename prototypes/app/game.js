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
  r:{name:'Жильё',short:'Ж',type:'res',color:'#3F9A55',cell:'#CDEBC0',edge:'#8CC67A',w:[2,3],d:[3,4],fl:[1,2,3],dens:0.5,unlock:0},
  h:{name:'Многоэтажки',short:'Ж+',type:'res',color:'#23794A',cell:'#B5DEB6',edge:'#5EA978',w:[3,5],d:[3,4],fl:[4,7,10],dens:0.55,unlock:500},
  c:{name:'Торговля',short:'Т',type:'com',color:'#3B7DD8',cell:'#C9DCF6',edge:'#7EA8E0',w:[2,4],d:[3,4],fl:[1,2,3],dens:0.5,unlock:0},
  i:{name:'Промышленность',short:'П',type:'work',color:'#D99A1E',cell:'#F6E2B4',edge:'#E0B65E',w:[3,5],d:[3,4],fl:[1,2,2],dens:0.7,unlock:0},
  o:{name:'Офисы',short:'О',type:'work',color:'#8A5CD0',cell:'#E2D5F5',edge:'#B193E0',w:[2,4],d:[3,4],fl:[3,5,8],dens:1.0,unlock:800}
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
function setLevel(l,lv){var z=ZONE[l.b.z],was=l.b.lv;l.b.lv=lv;l.floors=z.fl[lv-1];l.cap=null;l.cap=capFor(l);
  // вид дома меняется с уровнем: коттедж → городской дом, лавка → современное здание
  if((l.b.z==='r'&&was===1&&lv>=2)||(l.b.z==='c'&&lv===3&&was<3))l.style=pickStyle(l.b.z,lv)}
// стиль фасада по зоне и уровню (наборы — City3D.STYLE_SETS)
function pickStyle(z,lv){var st=City3D.STYLE_SETS,r=rng(),one=function(a){return a[Math.floor(rng()*a.length)]};
  if(z==='r')return lv===1?one(st.cottage):one(r<0.55?st.classic:st.modern);
  if(z==='h')return one(r<0.4?st.panel:r<0.75?st.modern:st.classic);
  if(z==='c')return lv<3?one(r<0.7?st.shop:st.classic):one(st.modern);
  if(z==='i')return one(st.warehouse);
  return one(r<0.6?st.glass:st.modern)}
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
// dry — только пересчитать показатели (после загрузки, правок): без роста, денег и спроса
function hourly(dry){
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
  if(!dry)ZKEYS.forEach(function(k){if(k==='h')return;var v=Math.max(-100,Math.min(100,raw[k]));S.demand[k]+=(v-S.demand[k])*0.25});
  if(!linked)ZKEYS.forEach(function(k){S.demand[k]=Math.min(S.demand[k],0)});
  st.demand=S.demand;S.stats=st;
  if(dry){E.drawLots();ui();return}
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
    toast('Город вырос до '+m+' жителей! Премия '+fmt(m*10)+' $'+(news.length?'. Открыто: '+news.join(', '):''),'good');if(cat)flyout()}
  alerts(st);
  E.drawLots();if(changed){dirty3D=true;treesDirty=true}
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
    l.type=Z.type;l.color=E.nextColor(Z.type);l.style=pickStyle(z,1);l.b={z:z,lv:1,born:S.t,done:S.t+(4+rng()*6)*HOUR,occ:0};l.floors=Z.fl[0];l.cap=capFor(l);
    E.lots.push(l);markLot(occ,l);return true}
  return false}

// ---------- журнал и уведомления ----------
function log(t){S.log.unshift({t:S.t,m:t});S.log.length=Math.min(S.log.length,40)}
// уведомления — стопкой под часами, каждое живёт несколько секунд
function toast(t,kind){var box=$('toasts');for(var i=0;i<box.children.length;i++)if(box.children[i].lastChild.textContent===t)return;var el=document.createElement('div');el.className='toast '+(kind||'');
  el.innerHTML=icon(kind==='bad'?'warn':kind==='good'?'star':'info')+'<span></span>';el.lastChild.textContent=t;box.appendChild(el);
  while(box.children.length>3)box.removeChild(box.firstChild);
  setTimeout(function(){el.classList.add('out');setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el)},300)},kind==='good'?6000:4200)}

// ---------- иконки (24×24, линии цвета текста) ----------
var IC={
  look:'<path d="M6 3l12 7.5-5.2 1.3L10 17z"/><path d="M12.8 11.8l4.2 6.2"/>',
  road:'<path d="M7 21L10 3M17 21L14 3"/><path d="M12 5v2.5M12 10.5v3M12 16.5v3"/>',
  zones:'<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.5"/>',
  power:'<path d="M13.5 2.5L5 13.5h6.5L10.5 21.5 19 10h-6.5z"/>',
  water:'<path d="M12 3c4.2 5 6.3 8.2 6.3 11.2a6.3 6.3 0 0 1-12.6 0C5.7 11.2 7.8 8 12 3z"/>',
  svc:'<path d="M3.5 20.5h17M5 20.5V10l7-5.5 7 5.5v10.5"/><path d="M10 20.5v-5h4v5"/>',
  bull:'<path d="M4 7h16M9.5 7V4.5h5V7M6.2 7l1 13h9.6l1-13"/><path d="M10.2 11v5.5M13.8 11v5.5"/>',
  layers:'<path d="M12 3.5l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  coins:'<ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
  people:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.2" cy="9" r="2.5"/><path d="M16 14.3c2.9.4 5 2.7 5 5.7"/>',
  jobs:'<rect x="3" y="7.5" width="18" height="12.5" rx="2.2"/><path d="M9 7.5V5.2h6v2.3M3 12.5h18"/>',
  heart:'<path d="M12 20s-7.5-4.6-7.5-10.4A4.1 4.1 0 0 1 12 7.2a4.1 4.1 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/>',
  r:'<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
  h:'<rect x="6" y="3" width="12" height="18" rx="1.2"/><path d="M9.2 7h1.6M13.2 7h1.6M9.2 11h1.6M13.2 11h1.6M9.2 15h1.6M13.2 15h1.6"/>',
  c:'<path d="M4 9.5L5.8 4h12.4L20 9.5"/><path d="M4 9.5h16v10.5H4z"/><path d="M9.5 20v-5.5h5V20"/>',
  i:'<path d="M3 20.5V11l5 3v-3l5 3V7h3.2v13.5z"/><path d="M3 20.5h18M19 20.5V4"/>',
  o:'<rect x="5" y="3" width="14" height="18" rx="1.2"/><path d="M5 8.5h14M5 14h14M12 3v18"/>',
  unzone:'<path d="M15.5 3.5l5 5L10 19H5.5l-2-2z"/><path d="M9 9.5l5.5 5.5M13 19h7.5"/>',
  wind:'<path d="M12 12v9.5M9 21.5h6"/><path d="M12 12l.8-8.5M12 12l7.2 4.4M12 12l-8 3.6"/><circle cx="12" cy="12" r="1.4"/>',
  coal:'<path d="M3 21V12.5h5.5V9H12v3.5h3.5V4h3.2v17z"/><path d="M6 16.5h2.2M10.5 16.5h2.2"/>',
  tower:'<path d="M8.2 21l1.8-10.5h4L15.8 21"/><path d="M6.5 10.5h11V7a5.5 3.5 0 0 0-11 0z"/>',
  pump:'<path d="M3 16c2 0 2 2 4.5 2s2.5-2 4.5-2 2.5 2 4.5 2 2.5-2 4.5-2"/><path d="M8 13.5V5h8v8.5M10.5 9h3"/>',
  outlet:'<path d="M3 7.5h8.5v4.5h3.5"/><path d="M15 12c0 2.8 2 3.8 2 5.8a2 2 0 0 1-4 0c0-2 2-3 2-5.8"/><path d="M3 20c2 0 2-1.5 4-1.5"/>',
  park:'<circle cx="12" cy="9" r="5.8"/><path d="M12 14.8V21M8.5 21h7"/>',
  clinic:'<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M12 8v8M8 12h8"/>',
  police:'<path d="M12 3l7.5 2.8v6c0 4.8-3.6 8-7.5 9.2-3.9-1.2-7.5-4.4-7.5-9.2v-6z"/>',
  fire:'<path d="M12 3c1 3.8 6 6 6 11.2a6 6 0 0 1-12 0c0-3 1.8-4.4 3-6.2.2 2 1 3 2.2 3.2C11 8.6 11 6 12 3z"/>',
  school:'<path d="M2.5 9.5L12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5v4.6c0 1.4 2.5 2.9 5.5 2.9s5.5-1.5 5.5-2.9v-4.6M21.5 9.5v5"/>',
  pause:'<path d="M9 5.5v13M15 5.5v13"/>',play:'<path d="M8 5.5l10.5 6.5L8 18.5z"/>',
  ff:'<path d="M4.5 6l7.5 6-7.5 6zM12 6l7.5 6-7.5 6z"/>',fff:'<path d="M2.5 7l6 5-6 5zM9 7l6 5-6 5zM15.5 7l6 5-6 5z"/>',
  cube:'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  map:'<path d="M3 6.2l6-2.2 6 2.2 6-2.2v13.8l-6 2.2-6-2.2-6 2.2z"/><path d="M9 4v13.8M15 6.2V20"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',close:'<path d="M6 6l12 12M18 6L6 18"/>',
  rotl:'<path d="M4.5 9A8 8 0 1 1 5 15.5"/><path d="M4 4.5V9h4.5"/>',rotr:'<path d="M19.5 9A8 8 0 1 0 19 15.5"/><path d="M20 4.5V9h-4.5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',tilt:'<path d="M4 18h16M6 18l6-12 6 12"/>',
  warn:'<path d="M12 3.5L21.5 20h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',star:'<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
  info:'<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.3"/>',lock:'<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
  sewer:'<path d="M3 8.5h9.5a4.5 4.5 0 0 1 4.5 4.5v8M3 13h8.2a1.8 1.8 0 0 1 1.8 1.8V21"/>',life:'<circle cx="7" cy="17" r="2.3"/><circle cx="17" cy="17" r="2.3"/><path d="M4.7 17H3.5v-4.5l2.5-4h8.5l3.5 4H21V17h-1.7M9.3 17h5.4M6 12.5h13"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>'
};
function icon(n,cls){return '<svg class="ic'+(cls?' '+cls:'')+'" viewBox="0 0 24 24" aria-hidden="true">'+(IC[n]||'')+'</svg>'}

// ---------- инструменты ----------
var tool='look',place=null,overlay='none',cat=null;
function unlockedPop(u){return !u||(S.stats?S.stats.pop:0)>=u||MILESTONES.indexOf(u)<S.unlocked}
// панель снизу: категории; у категорий с несколькими инструментами — карточки над панелью
var CATS=[
  {id:'look',name:'Смотреть',ic:'look',key:'Esc'},
  {id:'road',name:'Дороги',ic:'road',key:'R',items:[{id:'road',name:'Улица',ic:'road',col:'#8C98AA',price:'8 $ за метр',note:'14 м: две полосы, парковка, тротуары. Через реку — мост, 45 $ за метр'}]},
  {id:'zones',name:'Зоны',ic:'zones',key:'Z',items:ZKEYS.map(function(z){var Z=ZONE[z];return {id:'z:'+z,name:Z.name,ic:z,col:Z.color,note:{r:'коттеджи, потом городские дома',h:'панельные и современные дома',c:'лавки и магазины',i:'склады и цеха, шумят',o:'стекло и бетон, много рабочих мест'}[z],unlock:Z.unlock}}).concat([{id:'z:-',name:'Снять зону',ic:'unzone',col:'#9AA3AE',note:'под домами не снимается'}])},
  {id:'power',name:'Энергия',ic:'power',items:['wind','coal']},
  {id:'water',name:'Вода',ic:'water',items:['tower','pump','outlet']},
  {id:'svc',name:'Услуги',ic:'svc',items:['park','clinic','police','fire','school']},
  {id:'bull',name:'Снос',ic:'bull',key:'B'}
];
CATS.forEach(function(c){if(c.items)c.items=c.items.map(function(it){if(typeof it!=='string')return it;var D=BLD[it];
  return {id:'b:'+it,name:D.name,ic:it,col:D.color,price:fmt(D.cost)+' $ · '+D.up+' $/сут',note:D.note,unlock:D.unlock}})});
function catOf(id){for(var i=0;i<CATS.length;i++){var c=CATS[i];if(c.id===id||c.items&&c.items.some(function(it){return it.id===id}))return c}return null}
function buildDock(){var d=$('dock'),h='';
  CATS.forEach(function(c){var on=catOf(tool)===c;h+='<button type="button" class="dk'+(on?' on':'')+(cat===c.id&&!on?' open':'')+'" data-cat="'+c.id+'" aria-pressed="'+on+'" title="'+c.name+(c.key?' ('+c.key+')':'')+'">'+icon(c.ic)+'<span>'+c.name+'</span></button>'});
  d.innerHTML=h;d.querySelectorAll('[data-cat]').forEach(function(b){b.addEventListener('click',function(){openCat(b.dataset.cat)})})}
function openCat(id){var c=CATS.filter(function(x){return x.id===id})[0];if(!c)return;
  if(!c.items){setTool(c.id);cat=null;flyout();return}
  if(cat===id){cat=null;buildDock();flyout();return}
  cat=id;buildDock();flyout();if(c.items.length===1)setTool(c.items[0].id)}
function flyout(){var f=$('fly');if(!cat){f.hidden=true;return}var c=CATS.filter(function(x){return x.id===cat})[0],h='';
  c.items.forEach(function(it){var lock=it.unlock&&!unlockedPop(it.unlock),on=tool===it.id;
    h+='<button type="button" class="card'+(on?' on':'')+'" data-tool="'+it.id+'"'+(lock?' disabled':'')+' aria-pressed="'+on+'">'+
      '<i class="tile" style="--c:'+it.col+'">'+icon(it.ic)+'</i><b>'+it.name+'</b>'+(it.price?'<em>'+it.price+'</em>':'')+
      '<small>'+(lock?icon('lock','sm')+'откроется при '+it.unlock+' жителях':it.note||'')+'</small></button>'});
  f.innerHTML='<div class="fly-h">'+icon(c.ic)+c.name+'</div><div class="fly-row">'+h+'</div>';f.hidden=false;
  f.querySelectorAll('[data-tool]').forEach(function(b){b.addEventListener('click',function(){setTool(b.dataset.tool)})})}
var HINTS={look:'',
  road:'Тяните от точки до точки. Начните от дороги, чтобы город был связан с шоссе. Нажатие на дорогу удаляет её.',
  bull:'Нажмите на дом или дорогу, чтобы снести. Деньги не возвращаются.',
  zone:'Ведите кистью по клеткам вдоль улиц. Дома вырастут сами, если есть спрос, свет, вода и стоки.',
  unzone:'Ведите по клеткам, чтобы снять зону. Под домами зона не снимается.',
  place:'Наведите на клетку у дороги и нажмите. Сети идут по дорогам.'};
function hint(t){var h=$('tip');h.textContent=t||'';h.hidden=!t}
function setTool(id){if(E.input&&E.input.busy())E.input.cancel();tool=id;place=null;var m;
  if(id==='road')m='road';else if(id==='look')m='look';else if(id==='bull')m='bull';else if(id.indexOf('z:')===0)m='zone';else{m='place';place=id.slice(2)}
  var zoneBefore=E.mode==='zone';E.setMode(m);ov.prev=[];ov.hover=[];overlayApply();
  var c=catOf(id);if(c&&!c.items)cat=null;buildDock();flyout();
  var h=m==='zone'&&id==='z:-'?HINTS.unzone:HINTS[m]||'';if(place)h=BLD[place].name+' — '+BLD[place].note+'. '+HINTS.place;hint(h);$('prev').innerHTML='';
  if(zoneBefore!==(m==='zone'))dirty3D=true}

// ---------- ввод: 2D (через редактор) и 3D (через вид City3D) ----------
var pan=null;
function panDown(P,e){var p=E.svgPt(e);pan={x:p[0],y:p[1],tx:E.view.tx,ty:E.view.ty,moved:false,P:P}}
function panMove(e){if(!pan)return;var p=E.svgPt(e);if(Math.hypot(p[0]-pan.x,p[1]-pan.y)>4)pan.moved=true;if(!pan.moved)return;E.view.tx=pan.tx+p[0]-pan.x;E.view.ty=pan.ty+p[1]-pan.y;E.applyView()}
function lotAt(P){for(var i=E.lots.length-1;i>=0;i--)if(E.inLot(P,E.lots[i]))return E.lots[i];return null}
var sel=null,paint=null;
function inspectAt(P){sel=lotAt(P);info();overlayApply()}
function bullAt(P){var l=lotAt(P);
  if(l){E.lots=E.lots.filter(function(x){return x!==l});if(sel===l){sel=null;info()}dirtySim=true;E.drawLots();dirty3D=true;treesDirty=true;toast('Снесено: '+lname(l));ui();return}
  var s=E.segUnder(P);if(s!==null){if(!canRemoveSeg(s))return;E.removeSeg(s);E.drawStatic();afterRoad();toast('Дорога снесена')}}
function paintAt(P){var h=E.hitCell(P);if(!h)return;var cs=columns()[h.key+'#'+h.k]||[];paint.cols[h.key+'#'+h.k]=cs}
function paintLine(A,B){var L=Math.hypot(B[0]-A[0],B[1]-A[1]),n=Math.max(1,Math.ceil(L/6));for(var i=0;i<=n;i++)paintAt([A[0]+(B[0]-A[0])*i/n,A[1]+(B[1]-A[1])*i/n])}
function paintPreview(){var z=paint.z,occ=paint.occ,out='',polys=[];Object.keys(paint.cols).forEach(function(k){paint.cols[k].forEach(function(c){if(occ[ckey(c.ce)])return;polys.push(c.poly);
  out+='<polygon class="ns" points="'+g.pts(c.poly)+'" fill="'+(z==='-'?'#F7F6F2':ZONE[z].cell)+'" stroke="'+(z==='-'?'#bbb':ZONE[z].color)+'" stroke-width="1"/>'})});$('prev').innerHTML=out;
  ov.prev=[{polys:polys,color:z==='-'?'#FFFFFF':ZONE[z].color,opacity:z==='-'?0.85:0.45,y:2.0}];overlayApply()}
var MODES={
  look:{down:function(P,e){panDown(P,e)},move:function(P,e){panMove(e)},up:function(){var was=pan;pan=null;if(was&&!was.moved)inspectAt(was.P)}},
  bull:{down:function(P,e){panDown(P,e)},move:function(P,e){panMove(e)},up:function(){var was=pan;pan=null;if(was&&!was.moved)bullAt(was.P)}},
  zone:{down:function(P){var z=tool.slice(2);paint={z:z,cols:{},last:P,occ:occupied()};paintAt(P);paintPreview()},
    move:function(P){if(!paint||!P)return;paintLine(paint.last,P);paint.last=P;paintPreview()},
    up:function(){if(!paint)return;var z=paint.z,n=0;Object.keys(paint.cols).forEach(function(k){paint.cols[k].forEach(function(c){var kk=ckey(c.ce);if(paint.occ[kk])return;
      if(z==='-'){if(S.zones[kk]){delete S.zones[kk];n++}}else if(S.zones[kk]!==z){S.zones[kk]=z;n++}})});
      paint=null;$('prev').innerHTML='';ov.prev=[];overlayApply();if(n){E.drawStatic();dirty3D=true;now3D()}}},
  place:{down:function(P){placeAt(P,true);return false},hover:function(P){placeAt(P,false)}}
};
// 3D: левая кнопка — инструменту (дорога, зоны), у остальных — камере; щелчок — по месту
var last3P=null;
function view3DOpts(){return {tools:{
  wants:function(){return tool==='road'||tool.indexOf('z:')===0},
  down:function(P,e){last3P=P;E.input.down(P,e)},move:function(P,e){last3P=P;E.input.move(P,e)},
  up:function(P,e){E.input.up(P||last3P,e)},cancel:function(){E.input.cancel()},
  solid:function(){return tool==='look'||tool==='bull'},
  hover:function(P,e,Ps){hover3D(Ps&&lotAt(Ps)?Ps:P)},
  click:function(P,e,Ps){var Q=Ps&&lotAt(Ps)?Ps:P;if(tool==='look')inspectAt(Q);else if(tool==='bull')bullAt(Q);else if(place)placeAt(P,true)}}}}
function hover3D(P){
  if(place){placeAt(P,false);return}
  if(tool==='look'||tool==='bull'){var l=lotAt(P),it=[];
    if(l)it.push({polys:E.shape(l).parts,color:tool==='bull'?'#E5484D':'#2F80ED',opacity:0.22,h:lotH(l)+2});
    else if(tool==='bull'){var s=E.segUnder(P);if(s!==null){var e=E.segEnds(E.segs[s]),A=e[0],B=e[1],t=g.nrm(g.sub(B,A)),n=[-t[1],t[0]],W=E.W;it.push({polys:[[g.add(A,g.mul(n,W)),g.add(B,g.mul(n,W)),g.add(B,g.mul(n,-W)),g.add(A,g.mul(n,-W))]],color:'#E5484D',opacity:0.45,y:2.4})}}
    var key=JSON.stringify(l?l.key+l.k0:'')+(it.length);if(key!==hover3D.k){hover3D.k=key;ov.hover=it;overlayApply()}}}
function lotH(l){var b=l.b;if(!b)return 16;if(!done(b))return 7;if(BLD[b.z])return Math.max(4,BLD[b.z].fl*16);return l.floors*16+8}
// подсветка в 3D: превью инструмента, наведение, выбранный дом
var ov={prev:[],hover:[],sel:[]};
function overlayApply(){ov.sel=sel&&E.lots.indexOf(sel)>=0?[{polys:E.shape(sel).parts,color:'#2F80ED',opacity:0.28,h:lotH(sel)+3}]:[];
  if(E&&E.V3.on&&E.V3.view)E.V3.view.setOverlay(ov.prev.concat(ov.hover,ov.sel))}
function placeLot(P){var D=BLD[place],h=E.hitCell(P);
  // водозабор и сброс можно ставить, указав прямо на реку: ищем ближайшую клетку улицы у этого места
  if(!h&&D.bank){var sg=null,bd=Infinity,F=null;Object.keys(E.segs).forEach(function(id){var e=E.segEnds(E.segs[id]),d=segD(P,e[0],e[1]);if(d<bd){bd=d;sg=e}});
    if(sg&&bd<60*M){var ab=[sg[1][0]-sg[0][0],sg[1][1]-sg[0][1]],l2=ab[0]*ab[0]+ab[1]*ab[1],t=Math.max(0,Math.min(1,((P[0]-sg[0][0])*ab[0]+(P[1]-sg[0][1])*ab[1])/l2));F=[sg[0][0]+ab[0]*t,sg[0][1]+ab[1]*t];
      var bh=null,bdd=Infinity;for(var dx=-6;dx<=6;dx++)for(var dy=-6;dy<=6;dy++){var Q=[F[0]+dx*8,F[1]+dy*8],hq=E.hitCell(Q);if(!hq)continue;var dq=Math.hypot(Q[0]-P[0],Q[1]-P[1]);if(dq<bdd){bdd=dq;bh=hq}}h=bh}}
  if(!h)return null;var Sd=E.G.hs[h.key],k0=Math.max(0,Math.min(h.k,Sd.nC-D.w));
  if(Sd.nC<D.w)return null;var l=mkLot(h.key,k0,k0+D.w-1,D.d-1);if(D.bank)l.wet=true;return l}
function placeWhy(l){var D=BLD[place],why=E.check(l,null);if(why)return E.LWHY[why]||why;
  if(D.bank&&!polyNearWater(E.shape(l).parts,30*M))return 'нужно у реки: нажмите на воду рядом с дорогой или на клетку у берега';
  if(S.money<D.cost)return 'не хватает денег';return null}
function placeAt(P,commit){var D=BLD[place],l=placeLot(P);if(!l){$('prev').innerHTML='';if(ov.prev.length){ov.prev=[];overlayApply()}return}
  var why=placeWhy(l);
  if(!commit){$('prev').innerHTML=E.lotSvg(l,why?'#D9363E':'#3E9B5B',why?'#8E1B21':'#1F6B38',0.55,1.6);hint(D.name+': '+(why?'нельзя — '+why:'можно, '+fmt(D.cost)+' $'));
    ov.prev=[{polys:E.shape(l).parts,color:why?'#E5484D':'#30A46C',opacity:0.45,h:Math.max(3,D.fl*16)}];overlayApply();return}
  if(why){toast(D.name+': '+why,'bad');return}
  if(!spend(D.cost,'build'))return;
  l.type='work';l.color=D.color;l.floors=Math.max(1,D.fl);l.b={z:place,lv:1,born:S.t,done:S.t+2*HOUR,occ:0};l.cap=D.jobs;
  E.lots.push(l);$('prev').innerHTML='';ov.prev=[];dirtySim=true;treesDirty=true;E.drawLots();dirty3D=true;now3D();toast('Строится: '+D.name);hourlySoon();ui()}
function canRemoveSeg(id){var g2=E.segs[id];if(E.exits.some(function(x){return x.node===g2.a||x.node===g2.b})){toast('Дорогу к шоссе сносить нельзя','bad');return false}return true}
function afterRoad(){dirtySim=true;dirty3D=true;treesDirty=true;colIx=null;now3D();hourlySoon();ui()}
var soon=null;function hourlySoon(){clearTimeout(soon);soon=setTimeout(function(){hourly(true)},50)}
function now3D(){frame.l3=0}

// ---------- деревья ----------
// дикие: рощи по карте и полоса вдоль реки (раз на карту); уличные — вдоль тротуаров;
// в скверах — по четвертям. Деревья, на которые легла дорога или дом, исчезают
var WILD=null,treesDirty=true,treeCache=[];
function wildTrees(){if(WILD)return WILD;var x=987654321,r=function(){x=(x*1664525+1013904223)>>>0;return x/4294967296},out=[];
  function put(p,s,k){if(p[0]<8||p[1]<8||p[0]>MAP.w-8||p[1]>MAP.h-8)return;if(riverAt(p).d<3*M)return;out.push({x:p[0],y:p[1],s:s,k:k,c:Math.floor(r()*5)})}
  for(var gI=0;gI<85;gI++){var c=[r()*MAP.w,r()*MAP.h],R=(22+r()*70)*M,n=8+Math.floor(r()*34),pine=r()<0.25;
    for(var i=0;i<n;i++){var a=r()*Math.PI*2,d=Math.sqrt(r())*R;put([c[0]+Math.cos(a)*d,c[1]+Math.sin(a)*d],0.6+r()*0.45,pine&&r()<0.7?2:r()<0.25?1:0)}}
  var P=RIVER.pts;for(var j=0;j<P.length-1;j++){var A=P[j],B=P[j+1],t=[B[0]-A[0],B[1]-A[1]],L=Math.hypot(t[0],t[1]);t=[t[0]/L,t[1]/L];var nn=[-t[1],t[0]];
    for(var q=0;q<3;q++){var u=r(),side=r()<0.5?-1:1,off=RIVER.hw+(4+r()*22)*M,b=[A[0]+(B[0]-A[0])*u+nn[0]*off*side,A[1]+(B[1]-A[1])*u+nn[1]*off*side];put(b,0.65+r()*0.45,r()<0.3?1:0)}}
  for(var k=0;k<260;k++)put([r()*MAP.w,r()*MAP.h],0.6+r()*0.45,r()<0.2?2:0);
  WILD=out;return out}
function treesNow(){if(!treesDirty)return treeCache;treesDirty=false;
  var segs=Object.keys(E.segs).map(function(id){var e=E.segEnds(E.segs[id]);return {a:e[0],b:e[1],bb:[Math.min(e[0][0],e[1][0]),Math.min(e[0][1],e[1][1]),Math.max(e[0][0],e[1][0]),Math.max(e[0][1],e[1][1])]}});
  var clear=E.W+3*M,lots=E.lots.map(function(l){var sh=E.shape(l);return {l:l,bb:sh.bb}}),pad=2.5*M;
  function free(p,road){for(var i=0;i<segs.length;i++){var s=segs[i];if(p[0]<s.bb[0]-road||p[0]>s.bb[2]+road||p[1]<s.bb[1]-road||p[1]>s.bb[3]+road)continue;if(segD(p,s.a,s.b)<road)return false}
    for(var j=0;j<lots.length;j++){var o=lots[j];if(!o.bb||p[0]<o.bb[0]-pad||p[0]>o.bb[2]+pad||p[1]<o.bb[1]-pad||p[1]>o.bb[3]+pad)continue;
      if(E.inLot(p,o.l)||E.inLot([p[0]+pad,p[1]],o.l)||E.inLot([p[0]-pad,p[1]],o.l)||E.inLot([p[0],p[1]+pad],o.l)||E.inLot([p[0],p[1]-pad],o.l))return false}
    return true}
  var out=wildTrees().filter(function(t){return free([t.x,t.y],clear)});
  // вдоль улиц: на тротуаре через 13 м, не у перекрёстков и не на мостах
  var side=E.W-E.SW/2,step=13*M;
  segs.forEach(function(s,si){var d=[s.b[0]-s.a[0],s.b[1]-s.a[1]],L=Math.hypot(d[0],d[1]);if(L<30*M)return;var t=[d[0]/L,d[1]/L],n=[-t[1],t[0]];
    for(var u=11*M;u<=L-11*M;u+=step)[-1,1].forEach(function(sd){var p=[s.a[0]+t[0]*u+n[0]*side*sd,s.a[1]+t[1]*u+n[1]*side*sd];if(inWater(p))return;
      out.push({x:p[0],y:p[1],s:0.5,k:0,c:(si+Math.round(u))%5})})});
  E.lots.forEach(function(l){if(l.b&&l.b.z==='park'&&done(l.b)){var bb=E.shape(l).bb,cx=(bb[0]+bb[2])/2,cy=(bb[1]+bb[3])/2,wx=(bb[2]-bb[0])*0.27,wy=(bb[3]-bb[1])*0.27;
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(f,i){out.push({x:cx+f[0]*wx,y:cy+f[1]*wy,s:0.62,k:i===3?1:0,c:i})})}});
  treeCache=out;draw2DTrees();return out}
function draw2DTrees(){var o='',T=treeCache,P=City3D.COLORS.tree;for(var i=0;i<T.length;i++){var t=T[i],r=(t.s||1)*3*M*0.95;
  o+='<circle cx="'+t.x.toFixed(0)+'" cy="'+t.y.toFixed(0)+'" r="'+r.toFixed(1)+'" fill="'+(t.k===2?'#8CC79A':P[t.c%P.length])+'"/>'}$('trees').innerHTML=o}

// ---------- вид домов ----------
function lname(l){var b=l.b;return BLD[b.z]?BLD[b.z].name:ZONE[b.z].name}
function hapColor(h){h=Math.max(0,Math.min(100,h));var a=[229,72,77],b=[245,190,60],c=[48,164,108],t=h/100,p=t<0.5?a.map(function(x,i){return Math.round(x+(b[i]-x)*t*2)}):b.map(function(x,i){return Math.round(x+(c[i]-x)*(t-0.5)*2)});return 'rgb('+p.join(',')+')'}
// цвет слоя (свет, вода, счастье, услуги) или null
function ovColor(l){var b=l.b;if(overlay==='none'||!b)return null;
  if(overlay==='power'||overlay==='water'){var u=useOf(l),okk=overlay==='power'?b.pow:(b.wat&&b.sew),prod=BLD[b.z]&&(overlay==='power'?BLD[b.z].power:(BLD[b.z].water||BLD[b.z].sewage));
    return prod?(overlay==='power'?'#F5C33B':'#3E8ED0'):!done(b)?'#D8D2C0':(overlay==='power'?u.p:u.w)>0?(okk?'#8FD19E':'#E5484D'):'#D9D6CE'}
  if(overlay==='happy')return isZoneB(b)&&done(b)?hapColor(b.hap||0):'#D9D6CE';
  if(overlay==='svc')return isZoneB(b)?hapColor(SVC.filter(function(k){return b.cov&&b.cov[k]}).length*25):'#D9D6CE';return null}
function rgbHex(c){if(c.charAt(0)==='#')return c;var m=c.match(/\d+/g);return '#'+m.slice(0,3).map(function(v){return ('0'+(+v).toString(16)).slice(-2)}).join('')}
function lotLook(l){var b=l.b;if(!b)return null;var f,op=1,extra='',st=City3D.STYLES[l.style!=null?l.style:0];
  if(!done(b)){f='#E3DDCE';op=0.9}
  else if(b.aband){f='#9C978F'}
  else if(BLD[b.z])f=BLD[b.z].color;
  else f=City3D.shade(st.roof,0.28);   // на плане — цвет крыши
  var oc=ovColor(l);if(oc)f=rgbHex(oc);
  if(sel===l)extra+=E.lotSvg(l,'none','#2F80ED',1,3);
  if(done(b)&&!b.aband&&BLD[b.z])extra+=glyph(l,b);
  if(overlay==='none'&&done(b)&&!b.aband){var ic=[];if(b.pow===false)ic.push('#F5C33B');if(b.wat===false)ic.push('#3E8ED0');if(b.sew===false)ic.push('#8C7A5B');if(b.linked===false)ic.push('#E5484D');
    if(ic.length){var c=b.ctr||lotCenter(l),r=Math.max(3,5/E.view.k);ic.forEach(function(col,i){extra+='<circle cx="'+(c[0]+(i-(ic.length-1)/2)*r*2.3).toFixed(1)+'" cy="'+c[1].toFixed(1)+'" r="'+r.toFixed(1)+'" fill="'+col+'" stroke="#fff" stroke-width="'+(r*0.35).toFixed(1)+'"/>'})}}
  return {fill:f,stroke:City3D.shade(f,-0.3),op:op,extra:extra}}
function glyph(l,b){var c=b.ctr||lotCenter(l),r=6*M,o='',sw=' stroke-width="'+(1.2*M)+'" stroke-linecap="round"';
  if(b.z==='wind'){for(var i=0;i<3;i++){var a=i*2*Math.PI/3-Math.PI/2;o+='<line x1="'+c[0]+'" y1="'+c[1]+'" x2="'+(c[0]+Math.cos(a)*r*1.1).toFixed(1)+'" y2="'+(c[1]+Math.sin(a)*r*1.1).toFixed(1)+'" stroke="#5A6168"'+sw+'/>'}o+='<circle cx="'+c[0]+'" cy="'+c[1]+'" r="'+(1.3*M)+'" fill="#5A6168"/>'}
  if(b.z==='tower')o+='<circle cx="'+c[0]+'" cy="'+c[1]+'" r="'+(r*0.65).toFixed(1)+'" fill="#8FB4CC" stroke="#4F7690" stroke-width="'+(0.8*M)+'"/>';
  if(b.z==='pump'||b.z==='outlet'){var w=waterPoint(c);o+='<line x1="'+c[0].toFixed(1)+'" y1="'+c[1].toFixed(1)+'" x2="'+w[0].toFixed(1)+'" y2="'+w[1].toFixed(1)+'" stroke="#6B747C"'+sw+'/><circle cx="'+w[0].toFixed(1)+'" cy="'+w[1].toFixed(1)+'" r="'+(b.z==='outlet'?3*M:1.6*M)+'" fill="'+(b.z==='outlet'?'#8A7A55':'#6B747C')+'" fill-opacity="0.8"/>'}
  return o}
function lotLabel(){return ''}

// ---------- окно здания ----------
function zIcon(b){return BLD[b.z]?b.z:b.z}
function bar(v,max,col){var p=max>0?Math.max(0,Math.min(100,v/max*100)):0;return '<span class="bar"><i style="width:'+p.toFixed(0)+'%;background:'+col+'"></i></span>'}
function chip(ok,ic,label){return '<span class="chip '+(ok===null?'na':ok?'ok':'no')+'">'+icon(ic,'sm')+label+'</span>'}
function info(){var el=$('info');if(!sel||E.lots.indexOf(sel)<0){el.hidden=true;sel=null;if(info.last){info.last=null;E.drawLots();overlayApply()}return}
  var l=sel,b=l.b,D=BLD[b.z],t=zoneType(b.z),col=D?D.color:ZONE[b.z].color,h='';
  var status=b.aband?'<span class="pill bad">Заброшен</span>':!done(b)?'<span class="pill">Строится · '+Math.ceil((b.done-S.t)/HOUR)+' ч</span>':'<span class="pill ok">Работает</span>';
  h+='<div class="ih"><i class="tile" style="--c:'+col+'">'+icon(zIcon(b))+'</i><div><b>'+lname(l)+'</b><small>'+(D?{power:'Энергия',water:'Вода',svc:'Услуги'}[D.group]:'Уровень '+b.lv+' из 3 · '+l.floors+' эт.')+'</small></div>'+status+'</div>';
  if(D){var rows=[];if(D.power)rows.push(['Выработка',D.power+' МВт']);if(D.water)rows.push(['Вода',(b.dirty?'0 — грязная':D.water)+' м³/сут']);if(D.sewage)rows.push(['Стоки',D.sewage+' м³/сут']);
    if(D.radius)rows.push(['Радиус',D.radius+' м']);rows.push(['Работники',D.jobs]);rows.push(['Содержание',D.up+' $/сут']);
    h+='<dl>'+rows.map(function(r){return '<dt>'+r[0]+'</dt><dd>'+r[1]+'</dd>'}).join('')+'</dl>';if(b.dirty)h+='<p class="warn">'+icon('warn','sm')+'Водозабор ниже сброса стоков — вода грязная.</p>'}
  else{if(t==='res')h+='<div class="row"><span>Жильцы</span><b>'+(b.occ||0)+' / '+l.cap+'</b></div>'+bar(b.occ||0,l.cap,'#30A46C');
    else{var f=S.stats?S.stats.fill:1;h+='<div class="row"><span>Рабочие места</span><b>'+Math.round(l.cap*f)+' / '+l.cap+'</b></div>'+bar(f,1,'#3B7DD8')}
    if(done(b)){h+='<div class="row"><span>Счастье</span><b style="color:'+hapColor(b.hap||0)+'">'+Math.round(b.hap||0)+'</b></div>'+bar(b.hap||0,100,hapColor(b.hap||0));
      if(b.lv<3)h+='<p class="muted">До уровня '+(b.lv+1)+': счастье '+(b.lv===1?60:78)+(b.lv===2&&t==='res'?' и школа рядом':'')+' сутки подряд.</p>'}}
  if(done(b)){var u=useOf(l);h+='<div class="chips">'+chip(u.p>0?!!b.pow:null,'power','Свет')+chip(u.w>0?!!b.wat:null,'water','Вода')+chip(u.w>0?!!b.sew:null,'sewer','Стоки')+'</div>';
    if(isZoneB(b))h+='<div class="chips">'+SVC.map(function(k){return chip(!!(b.cov&&b.cov[k]),{health:'clinic',police:'police',fire:'fire',school:'school',park:'park'}[k],SVC_NAME[k])}).join('')+'</div>';
    if(b.why&&b.why.length&&isZoneB(b))h+='<p class="warn">'+icon('warn','sm')+b.why.join(', ')+'</p>';
    if(b.linked===false)h+='<p class="warn">'+icon('warn','sm')+'Нет дороги к шоссе</p>'}
  el.innerHTML=h+'<button type="button" class="x" id="info-x" aria-label="Закрыть">'+icon('close')+'</button>';el.hidden=false;
  $('info-x').onclick=function(){sel=null;info()};if(info.last!==sel||info.lv!==b.lv){info.last=sel;info.lv=b.lv;E.drawLots();overlayApply()}}

// ---------- верхняя панель ----------
function clock(){var d=Math.floor(S.t/DAY)+1,h=Math.floor(S.t%DAY/HOUR),m=Math.floor(S.t%HOUR/60);return {d:'День '+d,t:(h<10?'0':'')+h+':'+(m<10?'0':'')+m}}
function gauge(id,need,have,unit){var el=$(id);el.querySelector('i').style.width=(have>0?Math.min(100,need/have*100):need>0?100:0).toFixed(0)+'%';
  el.classList.toggle('bad',need>have+1e-9);el.querySelector('em').textContent=(unit==='МВт'?need.toFixed(1):Math.round(need))+' / '+Math.round(have)+' '+unit}
function ui(){if(!S.stats)return;var st=S.stats;
  $('money').textContent=fmt(S.money)+' $';$('money').classList.toggle('bad',S.money<0);
  $('net').textContent=(S.net>=0?'+':'')+fmt(S.net||0)+' $/сут';$('net').className=(S.net||0)<0?'bad':'good';
  $('pop').textContent=fmt(st.pop);$('jobs').textContent=fmt(st.J);
  $('unemp').textContent=st.workers?Math.round(st.unemployed/st.workers*100)+'% без работы':'';
  ['r','c','i','o'].forEach(function(k){var v=Math.max(0,S.demand[k]);$('d-'+k).style.height=Math.max(4,Math.round(v))+'%';$('d-'+k).parentNode.title=ZONE[k].name+': спрос '+Math.round(S.demand[k])});
  var P=0,Pn=0,Wt=0,Wn=0,Sw=0,Sn=0;Object.keys(st.nets).forEach(function(c){var N=st.nets[c];P+=N.P;Pn+=N.need.p;Wt+=N.Wt;Wn+=N.need.w;Sw+=N.Sw;Sn+=N.need.s});
  gauge('u-p',Pn,P,'МВт');gauge('u-w',Wn,Wt,'м³');gauge('u-s',Sn,Sw,'м³');
  var nx=MILESTONES[S.unlocked],prev=S.unlocked?MILESTONES[S.unlocked-1]:0;
  $('mile').innerHTML=nx?'<span>Следующий этап: '+nx+' жителей</span><span class="bar"><i style="width:'+Math.min(100,(st.pop-prev)/(nx-prev)*100).toFixed(0)+'%"></i></span>':'<span>Все этапы пройдены</span>';
  if(!$('budget').hidden)budget();if(sel)info();if(cat)flyout()}
function clockUi(){var c=clock();$('c-day').textContent=c.d;$('c-time').textContent=c.t}
function budget(){var I=S.hourInc||{},X=S.hourExp||{},r=function(v){return fmt(v*24)};
  $('bud-body').innerHTML='<h3>Доходы в сутки</h3>'+
    [['r','Жильё'],['c','Торговля'],['i','Промышленность'],['o','Офисы']].map(function(k){return '<div class="tax"><i class="dot" style="background:'+ZONE[k[0]].color+'"></i><span>'+k[1]+'</span><b class="num">+'+r(I[k[0]]||0)+'</b>'+
      '<label><input type="range" min="1" max="29" value="'+S.tax[k[0]]+'" data-tax="'+k[0]+'" aria-label="Налог: '+k[1]+'"><em>'+S.tax[k[0]]+'%</em></label></div>'}).join('')+
    '<h3>Расходы в сутки</h3>'+[['roads','Дороги и мосты'],['power','Электростанции'],['water','Вода и стоки'],['svc','Услуги']].map(function(k){return '<div class="exp"><span>'+k[1]+'</span><b class="num">−'+r(X[k[0]]||0)+'</b></div>'}).join('')+
    '<div class="tot"><span>Итого</span><b class="num '+((S.net||0)<0?'bad':'good')+'">'+(S.net>=0?'+':'')+fmt(S.net||0)+' $</b></div><p class="muted">Налог выше 12% злит жителей и снижает спрос, ниже 8% — радует.</p>';
  $('bud-body').querySelectorAll('input[data-tax]').forEach(function(inp){inp.addEventListener('input',function(){S.tax[inp.dataset.tax]=+inp.value;inp.nextElementSibling.textContent=inp.value+'%'});inp.addEventListener('change',function(){hourly(true)})})}

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
  if(SIM.sim){var need=S.t-SIM.base;if(need>0)simStep(need)}
}
// сбой симуляции не должен ронять игру: жители пропадают до следующей полуночи
function simStep(sec){try{advanceSeconds(SIM.sim,sec)}catch(err){SIM.err=err.message;SIM.sim=null;if(window.console)console.warn('симуляция остановлена:',err.message)}}
function exportLot(l,rec){var b=l.b;if(!b||!done(b)||b.aband)return false;
  if(zoneType(b.z)==='res'){if(!(b.occ>0))return false;rec.capacity=b.occ}
  else{var n=Math.round(l.cap*(S.stats?S.stats.fill:1));if(n<1)return false;rec.capacity=n}
  rec.floors=l.floors}
var CAR_COL=['#D9534F','#3B7DD8','#F4F2EC','#3A3F47','#9AA1A9','#E8B33C','#4FA16E','#8A63C2'],SHIRT=['#E05D44','#4A7FC1','#F2C14E','#5BAA6B','#9B6BC2','#E58FB0','#3FB5B0','#F28C38'];
function agentsDraw(){var sim=SIM.sim,el=$('agents'),three=E.V3.on&&E.V3.view;if(!sim){el.innerHTML='';if(three){E.V3.view.setMarkers([]);E.V3.view.render()}return}
  var T=sim.traffic,P=sim.peds,L=sim.life,A=sim.agents,k=M,out='',list=[];
  var vb=$('sv').viewBox.baseVal,v=E.view,x0=(-v.tx)/v.k,y0=(-v.ty)/v.k,x1=x0+vb.width/v.k,y1=y0+vb.height/v.k,big=A.n>1500;
  for(var a=0;a<A.n;a++){var car=null,per=null;
    if(T&&A.car[a]){var st=T.state[a];if(st!==CAR.CITY&&st!==CAR.OUT&&st!==CAR.NONE){var q=T.pose(a);if(q&&!(big&&st===CAR.PARKED&&!three))car={x:q.x*k,y:q.y*k,heading:q.h,color:CAR_COL[a%8]}}}
    if(P&&L.act[a]===ACT.TRAVEL&&L.mode[a]===MODE.WALK&&P.state[a]!==PED.BEYOND){var pp=P.pose(a);if(pp)per={x:pp.x*k,y:pp.y*k,heading:pp.h,color:SHIRT[a%8]}}
    if(three){if(car||per)list.push({car:car,person:per});continue}
    if(car&&car.x>x0-20&&car.x<x1+20&&car.y>y0-20&&car.y<y1+20)out+='<rect x="-9" y="-3.8" width="18" height="7.6" rx="2" fill="'+car.color+'" stroke="#3A3F47" stroke-width="0.8" transform="translate('+car.x.toFixed(1)+' '+car.y.toFixed(1)+') rotate('+(car.heading*180/Math.PI).toFixed(1)+')"/>';
    if(per&&per.x>x0&&per.x<x1&&per.y>y0&&per.y<y1)out+='<circle cx="'+per.x.toFixed(1)+'" cy="'+per.y.toFixed(1)+'" r="2.6" fill="'+per.color+'" stroke="#fff" stroke-width="0.6"/>'}
  if(three){E.V3.view.setMarkers(list.concat(problemMarks()));E.V3.view.render();el.innerHTML=''}else el.innerHTML=out}
// значки над домами с бедой (как в градостроителях): свет, вода, стоки, нет дороги, заброшен
function problemMarks(){var out=[];if(overlay!=='none')return out;E.lots.forEach(function(l){var b=l.b;if(!b||!done(b))return;var c=null,t=null;
  if(b.aband){c='#7D7A75';t='×'}else if(b.linked===false){c='#E5484D';t='!'}else if(b.pow===false){c='#E5A823';t='⚡'}else if(b.wat===false){c='#3E8ED0';t='💧'}else if(b.sew===false){c='#8C7A5B';t='!'}
  if(!c)return;var p=b.ctr||lotCenter(l);out.push({x:p[0],y:p[1],z:lotH(l)+10,color:c,label:t})});return out}

// ---------- время ----------
var SPEEDS=[0,60,300,1800],lastFrame=0,keys={};
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
  // камера с клавиатуры: WASD / стрелки — двигать, Q / E — вращать
  var kx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),ky=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0),kr=(keys.e?1:0)-(keys.q?1:0);
  if((kx||ky||kr)&&dt){if(E.V3.on&&E.V3.view){if(kx||ky)E.V3.view.pan(-kx*dt*700,-ky*dt*700);if(kr)E.V3.view.rotate(-kr*dt*1.6)}else{E.view.tx-=kx*dt*700;E.view.ty-=ky*dt*700;E.applyView()}}
  if(dirty3D&&E.V3.on&&E.V3.view&&ts-(frame.l3||0)>400){frame.l3=ts;dirty3D=false;E.build3D();overlayApply()}
  if(ts-(frame.la||0)>(S.speed>=3?110:50)){frame.la=ts;agentsDraw()}
  if(ts-(frame.ls||0)>120000){frame.ls=ts;if(frame.ls>1000)autosave()}   // автосохранение раз в 2 минуты
  requestAnimationFrame(frame)}
// смена часа и суток (по целым номерам, без сравнения дробных секунд)
function tick(){var h=Math.floor(S.t/HOUR+1e-9);while(S.lastH<h){S.lastH++;if(S.lastH%24===0)midnight();hourly()}}
function midnight(){S.daily.push({d:Math.floor(S.lastH/24),pop:S.stats?S.stats.pop:0,money:Math.round(S.money)});if(S.daily.length>60)S.daily.shift();
  simBuild()}

// ---------- сохранения ----------
/*
 * Где лежат сохранения: в установленном приложении — файлы в папке пользователя
 * (window.cityHost из desktop/preload.js; обновление и переустановка их не трогают),
 * в браузере — localStorage. Формат и миграции между версиями — saves.js (CitySaves).
 * Слоты: auto-1..3 — автосохранения по кругу, save-… — сохранения игрока.
 */
var APP_VERSION=(window.cityHost&&cityHost.version)||'__APP_VERSION__',LEGACY_KEY='city-builder-app-v1';
var Store=window.cityHost?{files:true,
  list:function(){return cityHost.list()},read:function(id){return cityHost.read(id)},write:function(id,o){return cityHost.write(id,o)},
  remove:function(id){return cityHost.remove(id)},writeSync:function(id,o){return cityHost.writeSync(id,o)}}:(function(){
  // в браузере: каждое сохранение — отдельный ключ, заголовки — в общем списке
  var P='city-builder-save:',IX='city-builder-saves';
  function ix(){try{return JSON.parse(localStorage.getItem(IX)||'[]')}catch(e){return []}}
  function head(id,o){return {id:id,name:o.name,saved:o.saved,schema:o.schema,app:o.app,meta:o.meta||{}}}
  function put(id,o){var raw=JSON.stringify(o);localStorage.setItem(P+id,raw);var L=ix().filter(function(h){return h.id!==id});L.push(head(id,o));localStorage.setItem(IX,JSON.stringify(L))}
  return {files:false,
    list:function(){return Promise.resolve(ix())},
    read:function(id){try{return Promise.resolve(JSON.parse(localStorage.getItem(P+id)))}catch(e){return Promise.reject(e)}},
    write:function(id,o){try{put(id,o);return Promise.resolve(true)}catch(e){return Promise.reject(e)}},
    writeSync:function(id,o){try{put(id,o)}catch(e){}},
    remove:function(id){try{localStorage.removeItem(P+id);localStorage.setItem(IX,JSON.stringify(ix().filter(function(h){return h.id!==id})))}catch(e){}return Promise.resolve(true)}}})();
function snapshot(){return {ed:E.dump(),S:Object.assign({},S,{stats:null,warn:null})}}
function saveFile(name){return CitySaves.make(snapshot(),{app:APP_VERSION,name:name||S.name||'Городок у реки',
  meta:{day:Math.floor(S.t/DAY)+1,pop:S.stats?S.stats.pop:0,money:Math.round(S.money)}})}
// сохранить в слот (по умолчанию — текущий слот игрока, иначе новый)
function saveGame(id,name,quiet){id=id||S.slot||('save-'+Date.now());if(id.indexOf('save-')===0){S.slot=id;if(name)S.name=name}
  return Store.write(id,saveFile(name)).then(function(){if(!quiet)toast('Сохранено: '+(name||S.name||'Город'),'good');if(!$('saves').hidden)savesPanel()},
    function(e){toast('Не удалось сохранить: '+(e&&e.message||e),'bad')})}
var autoN=0,ready=false;   // ready — после попытки продолжить прошлую игру (раньше автосохранение затёрло бы её)
function autosave(){if(!E||!S||!ready)return;autoN=autoN%3+1;S.autoSlot='auto-'+autoN;return saveGame('auto-'+autoN,null,true)}
// загрузить: миграция старых версий, отказ для сохранений новее игры
function applySave(obj,id){var m=CitySaves.migrate(obj);
  if(!m.ok){toast(m.reason==='newer'?'Это сохранение сделано более новой версией игры'+(m.app?' ('+m.app+')':'')+'. Обновите игру, чтобы открыть его.':
    m.reason==='broken'?'Сохранение повреждено: '+(m.errors||[]).join(', '):'Это не сохранение игры','bad');return false}
  E.setWidth(28,8);E.load(m.data.ed);S=Object.assign(newState(),m.data.S);if(id&&id.indexOf('save-')===0)S.slot=id;
  sel=null;info();colIx=null;cellHash=null;treesDirty=true;cat=null;flyout();
  E.drawStatic();hourly(true);treesNow();simBuild();setSpeed(S.speed||1);ui();clockUi();$('city-name').textContent=S.name||'Городок у реки';
  if(E.V3.on&&E.V3.view){frame3DToCity();E.build3D();overlayApply()}
  toast('Загружено: '+(m.name||S.name||'город')+(m.steps.length?' · сохранение из прошлой версии обновлено':''),'good');return true}
function loadGame(id){return Store.read(id).then(function(o){if(!o){toast('Сохранение не найдено','bad');return}applySave(o,id);$('saves').hidden=true},function(e){toast('Не удалось прочитать сохранение: '+(e&&e.message||e),'bad')})}
// при запуске: последнее сохранение; иначе — старое браузерное (до файлов сохранений)
function resumeLatest(){return Store.list().then(function(L){L=L.filter(function(h){return !h.broken&&h.schema!=null&&h.schema<=CitySaves.SCHEMA}).sort(function(a,b){return String(b.saved).localeCompare(String(a.saved))});
  if(L.length)return Store.read(L[0].id).then(function(o){if(applySave(o,L[0].id))$('welcome').hidden=true});
  var raw=null;try{raw=localStorage.getItem(LEGACY_KEY)}catch(e){}
  if(raw){try{if(applySave(JSON.parse(raw))){$('welcome').hidden=true;return saveGame(null,'Городок у реки',true)}}catch(e){}}})}
function when(iso){var d=new Date(iso);if(isNaN(d))return '';var p=function(n){return (n<10?'0':'')+n};return p(d.getDate())+'.'+p(d.getMonth()+1)+'.'+d.getFullYear()+' '+p(d.getHours())+':'+p(d.getMinutes())}
function savesPanel(){var box=$('save-list');box.innerHTML='<p class="muted">Загружаю…</p>';
  $('save-name').value=S.name||'Городок у реки';$('save-where').textContent=Store.files?'Сохранения лежат файлами в папке пользователя: обновление игры их не трогает.':'Сохранения хранятся в этом браузере.';
  $('b-folder').hidden=!Store.files;$('b-import').hidden=!Store.files;
  Store.list().then(function(L){L.sort(function(a,b){return String(b.saved).localeCompare(String(a.saved))});
    if(!L.length){box.innerHTML='<p class="muted">Сохранений пока нет.</p>';return}
    box.innerHTML=L.map(function(h){var auto=h.id.indexOf('auto-')===0,newer=h.schema>CitySaves.SCHEMA,old=h.schema!=null&&h.schema<CitySaves.SCHEMA,m=h.meta||{};
      return '<div class="sv'+(h.id===S.slot?' cur':'')+'"><div class="sv-t"><b>'+esc(h.broken?'Повреждённый файл':h.name||'Город')+'</b>'+(auto?'<span class="pill">авто</span>':'')+(newer?'<span class="pill bad">новее игры</span>':old?'<span class="pill">старая версия</span>':'')+'</div>'+
        '<small>'+when(h.saved)+(m.day?' · день '+m.day:'')+(m.pop!=null?' · '+fmt(m.pop)+' жит.':'')+(m.money!=null?' · '+fmt(m.money)+' $':'')+(h.app?' · v'+esc(h.app):'')+'</small>'+
        '<div class="sv-b"><button type="button" class="sbtn" data-load="'+h.id+'"'+(newer||h.broken?' disabled':'')+'>Загрузить</button>'+(Store.files?'<button type="button" class="sbtn ghost" data-exp="'+h.id+'">Файл…</button>':'')+'<button type="button" class="sbtn ghost" data-del="'+h.id+'">Удалить</button></div></div>'}).join('');
    box.querySelectorAll('[data-load]').forEach(function(b){b.onclick=function(){loadGame(b.dataset.load)}});
    box.querySelectorAll('[data-exp]').forEach(function(b){b.onclick=function(){cityHost.exportSave(b.dataset.exp)}});
    box.querySelectorAll('[data-del]').forEach(function(b){b.onclick=function(){if(!b.dataset.armed){b.dataset.armed=1;b.textContent='Точно?';return}
      Store.remove(b.dataset.del).then(function(){if(S.slot===b.dataset.del)S.slot=null;savesPanel()})}})})}
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function newGame(){E.reset();E.setWidth(28,8);S=newState();
  var y=Math.round(560*M/16)*16,a=E.newNode(0,y),b=E.newNode(80*16,y);E.newSeg(a,b);E.addExit(a,'Шоссе на запад');
  SIM.sim=null;treesDirty=true}

// ---------- 2D-подложка ----------
function terrain(){var K=City3D.COLORS,r='<rect x="'+(-MAP.w)+'" y="'+(-MAP.h)+'" width="'+3*MAP.w+'" height="'+3*MAP.h+'" fill="#E2E0D8"/>'+
  '<rect x="0" y="0" width="'+MAP.w+'" height="'+MAP.h+'" fill="'+K.ground+'"/>'+
  '<polygon points="'+g.pts(RIVER.poly)+'" fill="'+K.water+'" stroke="#8EC3E6" stroke-width="3"/>';$('terrain').innerHTML=r}

// ---------- первый запуск ----------
function welcome(){var w=$('welcome');w.hidden=false;$('w-go').onclick=function(){w.hidden=true;openCat('road')}}

// ---------- камера: показать город ----------
function cityBox(){var xs=[],ys=[];Object.keys(E.nodes).forEach(function(n){xs.push(E.nodes[n].x);ys.push(E.nodes[n].y)});
  return [Math.min.apply(null,xs),Math.min.apply(null,ys),Math.max.apply(null,xs),Math.max.apply(null,ys)]}
function frame3DToCity(){var b=cityBox(),V=E.V3.view;if(!V)return;var v=V._v;v.bearing=-0.55;v.elev=48;
  V.look((b[0]+b[2])/2+60,(b[1]+b[3])/2,Math.max(520,Math.min(2600,Math.max(b[2]-b[0],b[3]-b[1])*0.9+300)))}
function set3DButton(on){var b=$('b-3d');b.innerHTML=on?icon('map')+'<span>План</span>':icon('cube')+'<span>3D</span>';b.setAttribute('aria-pressed','false');b.title=on?'Показать план сверху':'Показать город в 3D';
  document.body.classList.toggle('is3d',on)}

// ---------- крючки редактора ----------
var hooks={
  init:function(api){E=api;g=E.geom;
    E.WHY.water='узел в реке';E.WHY.bounds='за краем карты';E.WHY.money='не хватает денег';E.LWHY.water='нельзя — в воде';
    newGame();
    resize();terrain();buildDock();setTool('look');
    E.drawStatic();hourly(true);treesNow();
    var b=cityBox(),vb=$('sv').viewBox.baseVal;E.view.k=Math.min(1.2,Math.max(0.15,vb.width/((b[2]-b[0])+900)));E.view.tx=vb.width/2-(b[0]+b[2])/2*E.view.k;E.view.ty=vb.height/2-(b[1]+b[3])/2*E.view.k;E.applyView();E.drawLots();
    simBuild();setSpeed(S.speed||1);ui();clockUi();welcome();resumeLatest().then(function(){ready=true},function(){ready=true});
    set3DButton(false);E.set3D(true);
    requestAnimationFrame(frame)},
  on3D:function(on,fresh,failed){set3DButton(!!on);if(failed){toast('3D не загрузилось — показываю план. Строить можно и в нём.','bad');return}
    if(on&&fresh){frame3DToCity();E.build3D()}if(on){dirty3D=false;overlayApply()}},
  view3DOpts:view3DOpts,
  preview3D:function(items){ov.prev=items||[];overlayApply()},
  roadWhy:function(A,B){
    if([A,B].some(function(p){return p[0]<0||p[1]<0||p[0]>MAP.w||p[1]>MAP.h}))return 'bounds';
    if(inWater(A)||inWater(B))return 'water';
    if(roadCost(A,B).cost>S.money)return 'money';return null},
  roadInfo:function(Sx,Ex){var c=roadCost(Sx.P,Ex.P);hint('Улица '+Math.round(c.len)+' м'+(c.bridge>0?', из них мост '+Math.round(c.bridge)+' м':'')+' · '+fmt(c.cost)+' $');return ' · '+fmt(c.cost)+' $'},
  beforeRoad:function(Sx,Ex){return spend(roadCost(Sx.P,Ex.P).cost,'roads')},
  beforeRemoveSeg:function(id){return canRemoveSeg(id)},
  afterRoad:function(){afterRoad()},
  cellSkip:function(c,ce){return inWater(ce)||c.some(function(q){return riverAt(q).d<-1})},
  cellStyle:function(cd){var z=S.zones[ckey(cd.ce)];if(z&&ZONE[z])return {fill:ZONE[z].cell,stroke:ZONE[z].edge,op:0.95};return {fill:'#F8F7F3',stroke:'#E2E0D8',op:1}},
  lotCheck:function(l,sh){return !l.wet&&polyInWater(sh.parts)?'water':null},   // водозабор и сброс могут стоять в воде
  lotLook:lotLook,lotLabel:lotLabel,
  modes:MODES,
  hint:function(){return ''},
  idle:function(){},
  afterDraw:function(){},
  exportLot:exportLot,
  building3D:function(l,b){var B=l.b;if(!B)return;b.floors=l.floors;if(l.style!=null)b.style=l.style;
    if(!done(B)){b.plain=true;b.color='#E3DDCE';b.floors=0.45}
    else if(BLD[B.z]){b.model=B.z;b.color=BLD[B.z].color;b.floors=Math.max(1,BLD[B.z].fl);if(BLD[B.z].bank)b.pipeTo=waterPoint(lotCenter(l))}
    var oc=ovColor(l);if(oc){b.plain=true;b.model=null;b.color=rgbHex(oc)}},
  zoneCells3D:function(){return []},
  trees3D:function(){return treesNow()},
  lines3D:function(){if(E.mode!=='zone')return [];var segs=[];E.G.drawn.forEach(function(c){var P=c.poly;for(var i=0;i<P.length;i++)segs.push([P[i],P[(i+1)%P.length]])});return [{segs:segs,color:'#B9C0CA',opacity:0.9,y:1.4}]},
  areas3D:function(){var K=City3D.COLORS,ar=[{polys:RIVER.quads,color:K.water,y:0.6}],by={},free=[];
    E.G.drawn.forEach(function(c){var z=S.zones[ckey(c.ce)];if(z&&ZONE[z])(by[z]=by[z]||[]).push(c.poly);else free.push(c.poly)});
    if(E.mode==='zone')ar.push({polys:free,color:'#FBFAF6',y:1.0});
    Object.keys(by).forEach(function(z){ar.push({polys:by[z],color:ZONE[z].cell,y:1.0})});return ar}
};
window.CITY_APP=hooks;

// ---------- страница ----------
function resize(){var w=$('stage').clientWidth||800,h=$('stage').clientHeight||500;$('sv').setAttribute('viewBox','0 0 '+w+' '+h)}
window.addEventListener('resize',function(){if(!E)return;resize();E.drawLots()});
if(window.ResizeObserver)new ResizeObserver(function(){if(E){resize();E.drawLots()}}).observe(document.getElementById('stage')||document.body);
window.addEventListener('load',function(){
  document.querySelectorAll('[data-speed]').forEach(function(b){b.addEventListener('click',function(){setSpeed(+b.dataset.speed)})});
  document.querySelectorAll('[data-ovl]').forEach(function(b){b.addEventListener('click',function(){overlay=b.dataset.ovl;document.querySelectorAll('[data-ovl]').forEach(function(x){x.setAttribute('aria-pressed',String(x===b))});E.drawLots();dirty3D=true;now3D()})});
  function pop(btn,id){$(btn).addEventListener('click',function(){var p=$(id),open=p.hidden;['budget','layers','menu','saves'].forEach(function(x){$(x).hidden=true});p.hidden=!open;if(open&&id==='budget')budget()})}
  pop('b-budget','budget');pop('b-layers','layers');pop('b-menu','menu');
  $('b-saves').addEventListener('click',function(){['budget','layers','menu'].forEach(function(x){$(x).hidden=true});$('saves').hidden=false;savesPanel()});
  $('b-save').addEventListener('click',function(){saveGame(S.slot,$('save-name').value.trim()||S.name)});
  $('b-saveas').addEventListener('click',function(){saveGame('save-'+Date.now(),$('save-name').value.trim()||S.name)});
  $('b-folder').addEventListener('click',function(){cityHost.openFolder()});
  $('b-import').addEventListener('click',function(){cityHost.importSave().then(function(r){if(r&&r.obj){if(applySave(r.obj)){S.slot=null;saveGame('save-'+Date.now(),r.obj.name||S.name,true);$('saves').hidden=true}}})});
  $('app-ver').textContent='Версия '+APP_VERSION+' · формат сохранений '+CitySaves.SCHEMA;
  // при закрытии окна — автосохранение
  window.addEventListener('beforeunload',function(){if(!ready)return;try{autoN=autoN%3+1;Store.writeSync('auto-'+autoN,saveFile())}catch(e){}});
  document.querySelectorAll('[data-close]').forEach(function(b){b.addEventListener('click',function(){$(b.dataset.close).hidden=true})});
  // новый город — подтверждение вторым нажатием (окна confirm() в просмотрщике артефактов нет)
  var armT=null;$('b-new').addEventListener('click',function(){var b=this;
    if(!b.dataset.armed){b.dataset.armed='1';b.lastChild.textContent='Точно? Нажмите ещё раз';clearTimeout(armT);armT=setTimeout(function(){delete b.dataset.armed;b.lastChild.textContent='Новый город'},3000);return}
    delete b.dataset.armed;b.lastChild.textContent='Новый город';$('menu').hidden=true;autosave();
    sel=null;info();newGame();S.slot=null;$('city-name').textContent='Городок у реки';colIx=null;E.drawStatic();hourly(true);treesNow();simBuild();if(E.V3.on){frame3DToCity();E.build3D()}welcome()});
  $('b-life').addEventListener('click',function(){SIM.on=!SIM.on;this.setAttribute('aria-pressed',String(SIM.on));if(SIM.on)simBuild();else SIM.sim=null});
  $('b-home').addEventListener('click',function(){if(E.V3.on)frame3DToCity()});
  document.addEventListener('keydown',function(e){if(e.target.tagName==='INPUT')return;var k=e.key.toLowerCase();
    if(['w','a','s','d','q','e','arrowup','arrowdown','arrowleft','arrowright'].indexOf(k)>=0){keys[k]=true;if(k.indexOf('arrow')===0)e.preventDefault();return}
    if((e.ctrlKey||e.metaKey)&&k==='s'){e.preventDefault();saveGame(S.slot);return}
    if(e.key===' '){e.preventDefault();setSpeed(S.speed?0:1)}if(e.key>='1'&&e.key<='3')setSpeed(+e.key);
    if(e.key==='Escape'){setTool('look');cat=null;flyout()}if(k==='r')openCat('road');if(k==='z')openCat('zones');if(k==='b')openCat('bull')});
  document.addEventListener('keyup',function(e){keys[e.key.toLowerCase()]=false});
  window.addEventListener('blur',function(){keys={}});
});
window.__game={riverAt:riverAt,S:function(){return S},hourly:hourly,grow:grow,setTool:setTool,sim:function(){return SIM},BLD:BLD,ZONE:ZONE,save:saveGame,applySave:applySave,saveFile:saveFile,Store:Store,resume:resumeLatest,trees:function(){return treeCache},
  zoneAll:function(z,filter){E.G.drawn.forEach(function(c){if(!filter||filter(c))S.zones[ckey(c.ce)]=z});E.drawStatic();dirty3D=true},
  placeAt:function(kind,P){place=kind;placeAt(P,true);place=null},advance:function(sec){var end=S.t+sec;while(S.t<end-1e-6){var step=Math.min(end-S.t,(Math.floor(S.t/HOUR)+1)*HOUR-S.t);if(SIM.sim)simStep(step);S.t+=step;tick()}clockUi()},
  quiet:function(){ready=false},   // для тестов: не сохранять при закрытии
  frameCity:frame3DToCity,lotScreen:function(l){var c=lotCenter(l);return E.V3.view.project(c[0],c[1],lotH(l)/2)}};
})();
