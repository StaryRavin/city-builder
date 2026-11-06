/*
 * Движение машин по дорогам (этап 4): каждая машина физически занимает место
 * на полосе, проезжает перекрёстки и паркуется на улице.
 *
 * Дороги. Каждое звено — две полосы: правая — от узла a к b, левая — обратно
 * (правостороннее движение). Полоса начинается и кончается у границы
 * перекрёстка (box — радиус R вокруг узла). Координата на полосе s — от её
 * начала до центра машины.
 *
 * Машины. Длина 4.5 м. Скорость меняется так, чтобы успеть остановиться
 * перед препятствием: передней машиной (с зазором), стоп-линией перекрёстка,
 * своим местом парковки. Разгон 2 м/с², торможение до 3 м/с², скорость до
 * cfg.speed.car. Обгонов и смены полос нет — на полосе машины идут по очереди.
 *
 * Перекрёстки (равнозначные, как в Европе без знаков):
 *   - на перекрёстке одновременно не больше одной машины;
 *   - въезжать можно, только если на полосе выезда есть место (перекрёсток
 *     не запирают);
 *   - помеха справа: уступает тот, у кого справа есть машина, которая тоже
 *     хочет и может проехать;
 *   - если уступают все (машины со всех сторон) — едет та, что дольше ждёт.
 * В тупике можно развернуться, в том числе у ворот, если ехать не в Город.
 *
 * Парковка. Вдоль улицы через каждые 5.5 м проверяется земля за бордюром:
 *   - свободна (нет зданий и других дорог, и путь заезда ничего не задевает)
 *     — место на земле: машина заезжает носом, перпендикулярно улице, а
 *     выезжает задним ходом; бордюр перед ним — въезд, там не стоят;
 *   - за бордюром здание — место вдоль бордюра (если улица достаточно широка,
 *     чтобы стоящая машина не задевала едущих: при 10 м — да, при 8 м — нет).
 * Машина поворачивает вокруг задней оси, как настоящая: корма не заносится.
 * Машина едет к ближайшему свободному месту у здания назначения (место
 * бронируется при выезде). Заезд и выезд — манёвры по кривой со скоростью
 * manSpeed; всё это время машина занимает полосу, едущие сзади ждут. Выезжает
 * с места, когда на полосе есть просвет.
 *
 * Внешний мир. У ворот машина уезжает с последней полосы и проводит за
 * воротами время пути по Городу (place.extra); обратно — появляется на
 * полосе от ворот, когда там есть место.
 *
 * Жизнь (life.mjs) раз в минуту создаёт поездки; движение считается шагами по
 * dt секунд и, когда машина приехала, ставит жителю тик прибытия (L.arrive).
 * Всё в массивах, порядок обхода фиксирован: детерминированно.
 */
import {KIND} from './world.mjs';

export const CAR={PARKED:0,MERGE:1,LANE:2,BOX:3,OUT:4,CITY:5,NONE:6,PARK_IN:7,PARK_OUT:8};
export const CAR_NAME=['стоит','ждёт просвета, чтобы выехать','едет','на перекрёстке','за воротами','в Городе','нет машины','паркуется','выезжает с места'];
const NEVER=2147483647;

export function createTraffic(w,A,L){
  const cfg=w.cfg.traffic,N=w.nodes.n,E=w.edges.n,R=cfg.box,len=cfg.carLength;
  const nx=w.nodes.x,ny=w.nodes.y,deg=new Int32Array(N),gateNode=new Uint8Array(N);
  for(let e=0;e<E;e++){deg[w.edges.a[e]]++;deg[w.edges.b[e]]++}
  for(let p=0;p<w.places.n;p++)if(w.places.kind[p]===KIND.OUTSIDE)gateNode[w.places.node[p]]=1;

  // ---- полосы ----
  const LN=2*E,lanes={n:LN,from:new Int32Array(LN),to:new Int32Array(LN),len:new Float64Array(LN),
    x0:new Float64Array(LN),y0:new Float64Array(LN),dx:new Float64Array(LN),dy:new Float64Array(LN),cars:[]};
  for(let l=0;l<LN;l++){const e=l>>1,fwd=(l&1)===0,f=fwd?w.edges.a[e]:w.edges.b[e],t=fwd?w.edges.b[e]:w.edges.a[e];
    const L0=Math.hypot(nx[t]-nx[f],ny[t]-ny[f]),dx=(nx[t]-nx[f])/L0,dy=(ny[t]-ny[f])/L0,rx=-dy,ry=dx;
    lanes.from[l]=f;lanes.to[l]=t;lanes.len[l]=Math.max(1,L0-2*R);lanes.dx[l]=dx;lanes.dy[l]=dy;
    lanes.x0[l]=nx[f]+dx*R+rx*cfg.laneOffset;lanes.y0[l]=ny[f]+dy*R+ry*cfg.laneOffset;lanes.cars.push([])}
  const reverse=(l)=>l^1;
  // зебры: у каждого конца звена, кроме ворот (туда пешком не ходят). Полоса держит свободными
  // свои первые / последние crossLen метров: машины ждут перед зеброй, пока по ней идут
  const CW=w.cfg.peds.crossLen,cwS=new Float64Array(LN),cwE=new Float64Array(LN);
  for(let l=0;l<LN;l++){cwS[l]=gateNode[lanes.from[l]]?0:CW;cwE[l]=gateNode[lanes.to[l]]?0:CW}
  // где машина ждёт перед перекрёстком (центр): до зебры, с зазором
  const stopS=(l)=>lanes.len[l]-cwE[l]-len/2-cfg.stopGap;
  const out=[...Array(N)].map(()=>[]),inn=[...Array(N)].map(()=>[]);
  for(let l=0;l<LN;l++){out[lanes.from[l]].push(l);inn[lanes.to[l]].push(l)}
  // переходы через перекрёсток: кривая (квадратичная Безье) от конца полосы к началу следующей
  const boxes=new Map();
  function lanePt(l,s){return [lanes.x0[l]+lanes.dx[l]*s,lanes.y0[l]+lanes.dy[l]*s]}
  // разворот — только в тупике (и у ворот: машина, которой не в Город, разворачивается перед ними)
  function allowed(li,lo){if(lanes.to[li]!==lanes.from[lo])return false;if(lo!==reverse(li))return true;return deg[lanes.to[li]]===1}
  function box(li,lo){
    const k=li*LN+lo;let b=boxes.get(k);if(b)return b;
    const v=lanes.to[li],P0=lanePt(li,lanes.len[li]),P1=lanePt(lo,0),d0=[lanes.dx[li],lanes.dy[li]],d1=[lanes.dx[lo],lanes.dy[lo]];
    const cr=d0[0]*d1[1]-d0[1]*d1[0];let C;
    if(lo===reverse(li))C=[nx[v]+d0[0]*R*1.3,ny[v]+d0[1]*R*1.3];                 // разворот
    else if(Math.abs(cr)<1e-3)C=[(P0[0]+P1[0])/2,(P0[1]+P1[1])/2];                // прямо
    else{const t=((P1[0]-P0[0])*d1[1]-(P1[1]-P0[1])*d1[0])/cr;C=[P0[0]+d0[0]*t,P0[1]+d0[1]*t]}
    const pts=[],cum=[0];for(let i=0;i<=12;i++){const t=i/12,u=1-t;pts.push([u*u*P0[0]+2*u*t*C[0]+t*t*P1[0],u*u*P0[1]+2*u*t*C[1]+t*t*P1[1]]);
      if(i)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]))}
    b={node:v,pts,cum,len:cum[12]};boxes.set(k,b);return b;
  }
  // ---- парковочные места ----
  const RW=w.roadHalfWidth,CURB=RW-w.sidewalk,clr=cfg.clearance;   // RW — до домов, CURB — край проезжей части
  // прямоугольник машины (с запасом) в точке P с курсом h
  function carRect(P,h,m){const c=Math.cos(h),s=Math.sin(h),hl=len/2+m,hw=0.95+m;return [[hl,hw],[hl,-hw],[-hl,-hw],[-hl,hw]].map(([x,y])=>[P[0]+x*c-y*s,P[1]+x*s+y*c])}
  function inPoly(P,poly){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>P[1])!==(b[1]>P[1])&&P[0]<(b[0]-a[0])*(P[1]-a[1])/(b[1]-a[1])+a[0])c=!c}return c}
  function segX(p,q,r,s){const d=(q[0]-p[0])*(s[1]-r[1])-(q[1]-p[1])*(s[0]-r[0]);if(Math.abs(d)<1e-12)return false;
    const t=((r[0]-p[0])*(s[1]-r[1])-(r[1]-p[1])*(s[0]-r[0]))/d,u=((r[0]-p[0])*(q[1]-p[1])-(r[1]-p[1])*(q[0]-p[0]))/d;return t>=0&&t<=1&&u>=0&&u<=1}
  function polysHit(A,B){if(A.some((p)=>inPoly(p,B))||B.some((p)=>inPoly(p,A)))return true;
    for(let i=0;i<A.length;i++)for(let j=0;j<B.length;j++)if(segX(A[i],A[(i+1)%A.length],B[j],B[(j+1)%B.length]))return true;return false}
  function segDist(P,a,b){const ab=[b[0]-a[0],b[1]-a[1]],l2=ab[0]*ab[0]+ab[1]*ab[1],t=l2?Math.max(0,Math.min(1,((P[0]-a[0])*ab[0]+(P[1]-a[1])*ab[1])/l2)):0;return Math.hypot(P[0]-a[0]-ab[0]*t,P[1]-a[1]-ab[1]*t)}
  // прямоугольник не задевает здания и чужие дороги (своё звено — можно)
  function landFree(rect,ownEdge){
    if(w.outlines.some((o)=>o.length>=3&&polysHit(rect,o)))return false;
    for(let e=0;e<E;e++){if(e===ownEdge)continue;const a=[nx[w.edges.a[e]],ny[w.edges.a[e]]],b=[nx[w.edges.b[e]],ny[w.edges.b[e]]];
      if(rect.some((p)=>segDist(p,a,b)<RW))return false}
    for(let v=0;v<N;v++)if(rect.some((p)=>Math.hypot(p[0]-nx[v],p[1]-ny[v])<RW+0.5))return false;   // и не на перекрёстке
    return true;
  }
  // кубическая кривая [P0, C1, C2, P1]: курс в начале — к C1, в конце — от C2 (машина въезжает и встаёт ровно)
  function bez(c,t){const u=1-t,a=u*u*u,b=3*u*u*t,d=3*u*t*t,e=t*t*t;return [a*c[0][0]+b*c[1][0]+d*c[2][0]+e*c[3][0],a*c[0][1]+b*c[1][1]+d*c[2][1]+e*c[3][1]]}
  function bezDir(c,t){const u=1-t;return [3*u*u*(c[1][0]-c[0][0])+6*u*t*(c[2][0]-c[1][0])+3*t*t*(c[3][0]-c[2][0]),3*u*u*(c[1][1]-c[0][1])+6*u*t*(c[2][1]-c[1][1])+3*t*t*(c[3][1]-c[2][1])]}
  function bezLen(c){let L0=0,p=c[0];for(let i=1;i<=24;i++){const q=bez(c,i/24);L0+=Math.hypot(q[0]-p[0],q[1]-p[1]);p=q}return L0}
  const along=(P,d,k)=>[P[0]+d[0]*k,P[1]+d[1]*k];
  // kind: 0 — у бордюра, 1 — на земле. sStop — где на полосе начинается заезд, sOut — где кончается выезд.
  // in/out — кривые манёвров [P0, C, P1, длина, задним ходом]
  const slots={n:0,kind:[],lane:[],s:[],sStop:[],sOut:[],x:[],y:[],h:[],occ:[],pin:[],pout:[],wx:[],wy:[]};
  const lotRects=[],RA=cfg.rearAxle;
  // у бордюра — только если между стоящей и едущей машиной остаётся зазор (улица достаточно широкая)
  const parkC=CURB-0.95-cfg.curbGap,curbOK=parkC-0.95-(cfg.laneOffset+0.95)>=cfg.sideGap;
  // путь задней оси: из точки A0 с курсом d0 в A1 с курсом d1
  const axlePath=(C0,d0,C1,d1,k0,k1)=>{const A0=along(C0,d0,-RA),A1=along(C1,d1,-RA);return [A0,along(A0,d0,k0),along(A1,d1,-k1),A1]};
  // центр и курс машины в точке пути задней оси (back — задним ходом: машина смотрит против движения)
  function manPose(m,t){const B=bez(m.c,t),d=bezDir(m.c,Math.min(0.999,Math.max(0.001,t))),l0=Math.hypot(d[0],d[1])||1,f=m.back?-1:1,fx=f*d[0]/l0,fy=f*d[1]/l0;
    return {x:B[0]+fx*RA,y:B[1]+fy*RA,h:Math.atan2(fy,fx)}}
  for(let l=0;l<LN;l++){const e=l>>1,dx=lanes.dx[l],dy=lanes.dy[l],rx=-dy,ry=dx,hd=Math.atan2(dy,dx);
    for(let s=cfg.slotLength+1;s<=lanes.len[l]-cfg.slotLength/2-1;s+=cfg.slotLength){
      const P=lanePt(l,s),sStop=s-5,D=[dx,dy],Rn=[rx,ry];
      // место на земле за бордюром: носом от дороги
      const off=RW+cfg.lotDepthGap+len/2-cfg.laneOffset,Q=[P[0]+rx*off,P[1]+ry*off],hq=Math.atan2(ry,rx);
      // машина на месте и во время манёвров не заходит на зебры у концов полосы
      const lo0=Math.min(sStop,s)-len/2,hi0=s+cfg.slotLength+len/2;
      if(lo0<cwS[l]+0.2)continue;
      let lot=true;
      if(lot){const rect=carRect(Q,hq,clr);lot=landFree(rect,e)&&!lotRects.some((r)=>polysHit(r,rect));
        if(lot){const m={c:axlePath(lanePt(l,sStop),D,Q,Rn,2.5,3),back:0};for(let k=1;k<=40;k++){const ps=manPose(m,k/40);
          // весь путь заезда (и выезда задним ходом — тот же путь): только своя дорога и свободная земля
          const r2=carRect([ps.x,ps.y],ps.h,0.1);if(w.outlines.some((o)=>o.length>=3&&polysHit(r2,o))){lot=false;break}}}
        if(lot)lotRects.push(rect)}
      if(lot&&s+len/2>lanes.len[l]-cwE[l]-0.2)lot=false;
      if(!lot&&(!curbOK||hi0>lanes.len[l]-cwE[l]-0.2))continue;   // узкая улица (или зебра): у бордюра не стоят
      const o=parkC-cfg.laneOffset,K=lot?Q:[P[0]+rx*o,P[1]+ry*o];
      let pin,pout;
      // пути манёвров: {c — кривая, len — длина, back — задним ходом}
      if(lot){const c=axlePath(lanePt(l,sStop),D,Q,Rn,2.5,3);pin={c,len:bezLen(c),back:0};pout={c:[c[3],c[2],c[1],c[0]],len:pin.len,back:1}} // выезд — задним ходом тем же путём
      // у бордюра — как настоящие водители: проезжает место, встаёт на корпус впереди и сдаёт назад; выезжает вперёд
      else{const ahead=lanePt(l,s+cfg.slotLength),A0=along(ahead,D,-RA),A1=along(K,D,-RA),ci=[A0,along(A0,D,-2.5),along(A1,D,2.5),A1],co=axlePath(K,D,ahead,D,2.5,2.5);
        pin={c:ci,len:bezLen(ci),back:1};pout={c:co,len:bezLen(co),back:0}}
      slots.kind.push(lot?1:0);slots.lane.push(l);slots.s.push(s);slots.sStop.push(lot?sStop:s+cfg.slotLength);slots.sOut.push(lot?sStop:s+cfg.slotLength);
      // точка, где путь заезда на землю пересекает тротуар (въезд)
      const wo=(CURB+RW)/2-cfg.laneOffset;slots.wx.push(P[0]+rx*wo);slots.wy.push(P[1]+ry*wo);
      slots.x.push(K[0]);slots.y.push(K[1]);slots.h.push(lot?hq:hd);slots.occ.push(-1);slots.pin.push(pin);slots.pout.push(pout);slots.n++}}

  // ---- места не мешают друг другу ----
  // у каждого места — что заметает машина при заезде и выезде (sweep) и где она стоит (park).
  // Места на земле берутся первыми, потом у бордюра; место остаётся, только если его манёвры
  // не задевают стоящие на соседних местах машины и наоборот. Соседние места, чьи манёвры
  // пересекаются (conf), одновременно не паркуются: второй ждёт.
  {
    const sw=[],pk=[],bb=[];
    for(let i=0;i<slots.n;i++){const r=[];for(const m of [slots.pin[i],slots.pout[i]])for(let k=0;k<=16;k++){const ps=manPose(m,k/16);r.push(carRect([ps.x,ps.y],ps.h,0.05))}
      sw.push(r);pk.push(carRect([slots.x[i],slots.y[i]],slots.h[i],0.05));bb.push(bboxOf([].concat(...r)))}
    const near=(i,j)=>!(bb[i][2]<bb[j][0]||bb[j][2]<bb[i][0]||bb[i][3]<bb[j][1]||bb[j][3]<bb[i][1]);
    const sweepHits=(i,rect)=>sw[i].some((r)=>polysHit(r,rect));
    const order=[...Array(slots.n).keys()].sort((i,j)=>slots.kind[j]-slots.kind[i]||i-j),keep=[];
    for(const i of order){if(keep.every((j)=>!near(i,j)||(!sweepHits(i,pk[j])&&!sweepHits(j,pk[i])&&!polysHit(pk[i],pk[j]))))keep.push(i)}
    keep.sort((i,j)=>i-j);
    const conf=keep.map((i)=>keep.map((j,jj)=>jj).filter((jj)=>keep[jj]!==i&&near(i,keep[jj])&&sw[i].some((r)=>sw[keep[jj]].some((q)=>polysHit(r,q)))));
    for(const k of ['kind','lane','s','sStop','sOut','x','y','h','occ','pin','pout','wx','wy'])slots[k]=keep.map((i)=>slots[k][i]);
    slots.n=keep.length;slots.conf=conf;slots.man=new Int32Array(slots.n).fill(-1);
  }
  function bboxOf(P){let b=[Infinity,Infinity,-Infinity,-Infinity];for(const p of P){b[0]=Math.min(b[0],p[0]);b[1]=Math.min(b[1],p[1]);b[2]=Math.max(b[2],p[0]);b[3]=Math.max(b[3],p[1])}return b}
  // занят ли манёвром соседний пересекающийся путь
  const manBlocked=(sl)=>slots.conf[sl].some((j)=>slots.man[j]>=0);
  // манёвр через тротуар (место на земле) ждёт пешеходов у въезда; пешеходы задаёт peds.mjs
  const drivewayFree=(sl)=>slots.kind[sl]!==1||!T.pedsNear||!T.pedsNear(slots.wx[sl],slots.wy[sl],w.cfg.peds.drivewayClear);
  // зебра на звене e у узла v свободна от пешеходов
  const crossFree=(v,e)=>!T.crossBusy||!T.crossBusy(v,e);

  // ---- машины: индекс = житель ----
  const n=A.n,T={cfg,lanes,slots,boxes,box,lanePt,deg,gateNode,time:0,carRect,landFree,polysHit,cwS,cwE,manPose,inn,out,
    state:new Uint8Array(n).fill(CAR.NONE),lane:new Int32Array(n).fill(-1),s:new Float64Array(n),v:new Float64Array(n),
    bk:new Array(n).fill(null),bs:new Float64Array(n),slot:new Int32Array(n).fill(-1),tslot:new Int32Array(n).fill(-1),
    route:new Array(n).fill(null),ri:new Int32Array(n),exitGate:new Uint8Array(n),outT:new Float64Array(n),outTotal:new Float64Array(n),
    outbound:new Uint8Array(n),mp:new Float64Array(n),granted:new Uint8Array(n),waitSince:new Float64Array(n).fill(-1),
    dest:new Int32Array(n).fill(-1),origin:new Int32Array(n).fill(-1),nodeOcc:new Int32Array(N).fill(-1),
    stats:{trips:0,arrivals:0,noSpotWaits:0,pedYield:0,intersectionWaits:0,yieldRight:0,deadlockBreaks:0,mergeWaits:0,maxTripSec:0},tripStart:new Float64Array(n)};

  // ближайшее свободное место к зданию (по прямой до его центра)
  function nearestSlot(p,except){
    let best=-1,bd=Infinity;const cx=w.places.x[p],cy=w.places.y[p];
    for(let i=0;i<slots.n;i++){if(slots.occ[i]!==-1&&slots.occ[i]!==except)continue;const d=Math.hypot(slots.x[i]-cx,slots.y[i]-cy);if(d<bd-1e-9){bd=d;best=i}}
    return best;
  }
  // начальное состояние: машина стоит у дома хозяина
  const nCars=A.car.reduce((s,x)=>s+x,0);
  if(nCars>slots.n)throw new Error(`мест парковки ${slots.n}, а машин ${nCars}: машинам негде стоять`);
  for(let a=0;a<n;a++){if(!A.car[a])continue;const sl=nearestSlot(A.home[a]);T.state[a]=CAR.PARKED;T.slot[a]=sl;slots.occ[sl]=a}

  // ---- маршрут по полосам (Дейкстра; в деревне полос — десятки) ----
  function plan(l0,s0,target){
    if(target.lane===l0&&target.s>=s0-1e-6)return [l0];
    if(target.gate!=null&&lanes.to[l0]===target.gate)return [l0];
    const dist=new Float64Array(LN).fill(Infinity),prev=new Int32Array(LN).fill(-1),done=new Uint8Array(LN);
    dist[l0]=lanes.len[l0]-s0;let best=Infinity,last=-1,lastPrev=-1;   // последняя полоса маршрута и откуда на неё въехали
    for(;;){let u=-1,du=Infinity;for(let l=0;l<LN;l++)if(!done[l]&&dist[l]<du){du=dist[l];u=l}
      if(u<0||du>=best)break;done[u]=1;
      for(const lo of out[lanes.to[u]]){if(!allowed(u,lo))continue;const bl=box(u,lo).len;
        if(target.lane===lo&&du+bl+target.s<best){best=du+bl+target.s;last=lo;lastPrev=u}
        if(target.gate!=null&&lanes.to[lo]===target.gate&&du+bl+lanes.len[lo]<best){best=du+bl+lanes.len[lo];last=lo;lastPrev=u}
        const c=du+bl+lanes.len[lo];if(!done[lo]&&c<dist[lo]){dist[lo]=c;prev[lo]=u}}}
    if(last<0)return null;
    const r=[last];let x=lastPrev;while(x!==-1){r.push(x);if(x===l0)break;x=prev[x]}
    if(r[r.length-1]!==l0)return null;return r.reverse();
  }

  // ---- поездки ----
  T.startTrip=function(a,from,to){
    const pl=w.places;T.origin[a]=from;T.dest[a]=to;T.granted[a]=0;T.waitSince[a]=-1;T.tripStart[a]=T.time;T.stats.trips++;
    T.exitGate[a]=pl.kind[to]===KIND.OUTSIDE?1:0;
    T.tslot[a]=-1;if(!T.exitGate[a])reserve(a);   // бронь места у цели (своё место — тоже подходит); нет свободных — подождёт
    if(pl.kind[from]===KIND.OUTSIDE){T.state[a]=CAR.OUT;T.outbound[a]=0;T.outTotal[a]=pl.extra[from];T.outT[a]=pl.extra[from];T.route[a]=null;return}
    T.state[a]=CAR.MERGE;
  };
  function reserve(a){const ts=nearestSlot(T.dest[a],a);if(ts>=0){T.tslot[a]=ts;slots.occ[ts]=a}return ts>=0}
  function targetOf(a){return T.exitGate[a]?{gate:w.places.node[T.dest[a]]}:{lane:slots.lane[T.tslot[a]],s:slots.sStop[T.tslot[a]]}}
  function arrive(a){
    L.arrive[a]=L.tick;T.stats.arrivals++;T.stats.maxTripSec=Math.max(T.stats.maxTripSec,T.time-T.tripStart[a]);
  }
  function laneCars(l){return lanes.cars[l]}
  function removeFromLane(a){const c=lanes.cars[T.lane[a]],i=c.indexOf(a);if(i>=0)c.splice(i,1)}
  function addToLane(a,l,s){T.lane[a]=l;T.s[a]=s;const c=lanes.cars[l];c.push(a);c.sort((x,y)=>T.s[y]-T.s[x]||x-y)}
  // свободно ли место на полосе l около s (для выезда с парковки и въезда от ворот)
  function laneRoom(l,s,back,ahead){for(const b of lanes.cars[l]){if(T.s[b]>=s-back-1e-9&&T.s[b]<=s+ahead+1e-9)return false}
    const v=lanes.from[l],o=T.nodeOcc[v];if(o>=0&&s<back&&T.route[o]&&T.route[o][T.ri[o]+1]===l)return false;return true}
  // свободно ли начало полосы для въезда с перекрёстка
  function entryRoom(l){const c=lanes.cars[l];if(!c.length)return true;const last=c[c.length-1];return T.s[last]-len-cfg.minGap>=len/2+0.5}
  // подъезжает ли машина к перекрёстку (ей нужно пересечь узел в конце полосы)
  function crossing(a){return T.state[a]===CAR.LANE&&T.route[a]&&T.ri[a]<T.route[a].length-1}

  // впереди машина собирается сдать назад к бордюру — держаться на место дальше
  function reversing(b){const sl=T.tslot[b];if(sl<0||slots.kind[sl]!==0)return 0;
    if(T.state[b]===CAR.PARK_IN)return cfg.slotLength;
    return T.state[b]===CAR.LANE&&T.route[b]&&T.ri[b]===T.route[b].length-1&&slots.sStop[sl]-T.s[b]<25?cfg.slotLength:0}
  T.step=function(dt){
    const pl=w.places;T.time+=dt;
    // 1. выезд с парковки и въезд из Города
    for(let a=0;a<n;a++){
      if(T.state[a]===CAR.MERGE){
        if(!T.exitGate[a]&&T.tslot[a]<0&&!reserve(a)){T.stats.noSpotWaits++;continue}   // все места заняты — ждёт, пока освободится
        const sl=T.slot[a],l=slots.lane[sl],s=slots.sOut[sl];
        if(!T.route[a]){T.route[a]=plan(l,s,targetOf(a));T.ri[a]=0;if(!T.route[a])throw new Error('нет пути для машины '+a)}
        if(T.route[a].length===1&&!T.exitGate[a]&&T.tslot[a]===sl){ // уже на своём месте
          T.state[a]=CAR.PARKED;T.route[a]=null;T.tslot[a]=-1;arrive(a);continue}
        // выезд: машина сразу занимает полосу (едущие сзади ждут), место освобождается после манёвра
        if(!manBlocked(sl)&&drivewayFree(sl)&&laneRoom(l,s,cfg.mergeBack,cfg.mergeAhead)){T.state[a]=CAR.PARK_OUT;T.mp[a]=0;T.v[a]=0;slots.man[sl]=a;addToLane(a,l,s)}
        else T.stats.mergeWaits++;
      }else if(T.state[a]===CAR.OUT){
        T.outT[a]-=dt;if(T.outT[a]>0)continue;
        if(T.outbound[a]){T.state[a]=CAR.CITY;arrive(a);continue}
        if(T.tslot[a]<0&&!reserve(a)){T.stats.noSpotWaits++;continue}
        const g=pl.node[T.origin[a]],l=out[g][0];
        if(!T.route[a]){T.route[a]=plan(l,0,targetOf(a));T.ri[a]=0;if(!T.route[a])throw new Error('нет пути от ворот для машины '+a)}
        if(laneRoom(l,0,0,len+cfg.minGap+0.5)){T.state[a]=CAR.LANE;T.v[a]=cfg.enterSpeed;addToLane(a,l,0)}
      }
    }
    // манёвры на парковке
    for(let a=0;a<n;a++){const st=T.state[a];if(st!==CAR.PARK_IN&&st!==CAR.PARK_OUT)continue;
      const sl=st===CAR.PARK_IN?T.tslot[a]:T.slot[a],path=st===CAR.PARK_IN?slots.pin[sl]:slots.pout[sl];
      T.mp[a]+=cfg.manSpeed*dt;if(T.mp[a]<path.len)continue;
      slots.man[sl]=-1;
      if(st===CAR.PARK_IN){removeFromLane(a);T.state[a]=CAR.PARKED;T.slot[a]=sl;T.tslot[a]=-1;T.lane[a]=-1;T.v[a]=0;T.route[a]=null;arrive(a)}
      else{slots.occ[sl]=T.tslot[a]===sl?a:-1;T.slot[a]=-1;T.state[a]=CAR.LANE;T.v[a]=0}}
    // 2. перекрёстки: кому можно въехать
    for(let v=0;v<N;v++){
      if(T.nodeOcc[v]>=0)continue;
      const appr=[];for(const l of inn[v])for(const a of lanes.cars[l]){if(!crossing(a))continue;if(lanes.len[l]-T.s[a]>cfg.approach)break;appr.push(a)}
      if(!appr.length)continue;
      const atLine=(a)=>stopS(T.lane[a])-T.s[a]<=1.0;
      // на перекрёсток — только если есть место на выезде и обе зебры (въезда и выезда) свободны
      const can=(a)=>{const lo=T.route[a][T.ri[a]+1];if(!entryRoom(lo))return false;
        if(!crossFree(v,T.lane[a]>>1)||!crossFree(v,lo>>1)){T.stats.pedYield++;return false}return true};
      for(const a of appr)if(atLine(a)&&T.waitSince[a]<0)T.waitSince[a]=T.time;
      const cand=appr.filter((a)=>atLine(a)&&can(a)&&appr.indexOf(a)===appr.findIndex((b)=>T.lane[b]===T.lane[a]));  // только первая машина полосы
      if(!cand.length)continue;
      // помеха справа: машина с правой стороны, которая хочет и может проехать (или ещё едет к перекрёстку)
      const fromRight=(a,b)=>{const la=T.lane[a],lb=T.lane[b];if(la===lb)return false;const rx=-lanes.dy[la],ry=lanes.dx[la];return lanes.dx[lb]*rx+lanes.dy[lb]*ry<-0.5};
      const rivals=appr.filter((b)=>(atLine(b)&&can(b))||T.v[b]>0.5);
      let ok=cand.filter((a)=>!rivals.some((b)=>b!==a&&fromRight(a,b)));
      if(ok.length<cand.length)T.stats.yieldRight++;
      if(!ok.length){ok=cand;T.stats.deadlockBreaks++}                 // уступают все — едет тот, кто дольше ждёт
      ok.sort((x,y)=>T.waitSince[x]-T.waitSince[y]||x-y);
      const g=ok[0];T.granted[g]=1;T.nodeOcc[v]=g;if(T.waitSince[g]>=0&&T.time-T.waitSince[g]>1)T.stats.intersectionWaits++;
    }
    // 3. движение: скорость, чтобы успеть остановиться перед препятствием
    const vmax=w.cfg.speed.car,acc=cfg.accel,dec=cfg.decel;
    const speed=(a,gap)=>{let v=Math.min(T.v[a]+acc*dt,vmax,Math.sqrt(2*dec*Math.max(0,gap)));v=Math.min(v,Math.max(0,gap)/dt);return Math.max(0,v)};
    const moved=new Uint8Array(n);
    // машины на перекрёстках
    for(let a=0;a<n;a++){if(T.state[a]!==CAR.BOX)continue;moved[a]=1;
      const b=T.bk[a],lo=T.route[a][T.ri[a]+1],c=lanes.cars[lo];
      let gap=b.len-T.bs[a]+(c.length?T.s[c[c.length-1]]-len-cfg.minGap:1e9);
      if(T.ri[a]+1===T.route[a].length-1&&!T.exitGate[a])gap=Math.min(gap,b.len-T.bs[a]+slots.sStop[T.tslot[a]]);
      T.v[a]=speed(a,gap);T.bs[a]+=T.v[a]*dt;
      if(T.bs[a]>=b.len){T.nodeOcc[b.node]=-1;T.state[a]=CAR.LANE;T.ri[a]++;T.granted[a]=0;T.waitSince[a]=-1;T.bk[a]=null;addToLane(a,lo,T.bs[a]-b.len)}}
    // машины на полосах: от передней к задней
    for(let l=0;l<LN;l++){const c=lanes.cars[l];
      for(let i=0;i<c.length;i++){const a=c[i];if(T.state[a]!==CAR.LANE||moved[a])continue;
        let gap=Infinity;
        if(i>0)gap=T.s[c[i-1]]-len-cfg.minGap-T.s[a]-reversing(c[i-1]);
        const last=T.ri[a]===T.route[a].length-1;
        if(last&&!T.exitGate[a])gap=Math.min(gap,slots.sStop[T.tslot[a]]-T.s[a]);             // начало заезда на своё место
        else if(!last&&!T.granted[a])gap=Math.min(gap,stopS(l)-T.s[a]);                       // стоп-линия перед зеброй
        else if(!last){const lo=T.route[a][T.ri[a]+1],b=box(l,lo),cc=lanes.cars[lo];gap=Math.min(gap,lanes.len[l]-T.s[a]+b.len+(cc.length?T.s[cc[cc.length-1]]-len-cfg.minGap:1e9))}
        T.v[a]=speed(a,gap);T.s[a]+=T.v[a]*dt;
        if(last&&!T.exitGate[a]){
          const ts=T.tslot[a];if(slots.sStop[ts]-T.s[a]<0.3&&T.v[a]<0.5&&!manBlocked(ts)&&drivewayFree(ts)){T.state[a]=CAR.PARK_IN;T.mp[a]=0;T.v[a]=0;slots.man[ts]=a} // начинает парковаться
        }else if(last&&T.exitGate[a]&&T.s[a]>=lanes.len[l]){                 // уехала за ворота
          removeFromLane(a);i--;T.state[a]=CAR.OUT;T.outbound[a]=1;T.outTotal[a]=pl.extra[T.dest[a]];T.outT[a]=pl.extra[T.dest[a]];T.lane[a]=-1;T.route[a]=null}
        else if(!last&&T.s[a]>=lanes.len[l]){                                 // въехала на перекрёсток
          const lo=T.route[a][T.ri[a]+1];removeFromLane(a);i--;T.state[a]=CAR.BOX;T.bk[a]=box(l,lo);T.bs[a]=T.s[a]-lanes.len[l];T.lane[a]=-1}
      }}
    for(let l=0;l<LN;l++)lanes.cars[l].sort((x,y)=>T.s[y]-T.s[x]||x-y);
  };
  // может ли пешеход ступить на зебру звена e у узла v: в её полосе машин нет, на неё не едет
  // машина с разрешением на перекрёсток, с перекрёстка на эту полосу никто не съезжает
  T.crossClear=function(v,e){
    const li=lanes.to[2*e]===v?2*e:2*e+1,lo=reverse(li);
    for(const a of lanes.cars[li]){if(T.s[a]+len/2>lanes.len[li]-cwE[li]-0.3)return false;if(T.granted[a])return false}
    for(const a of lanes.cars[lo])if(T.s[a]-len/2<cwS[lo]+0.3)return false;
    const o=T.nodeOcc[v];if(o>=0&&T.route[o]&&(T.route[o][T.ri[o]+1]===lo||T.route[o][T.ri[o]]===li))return false;
    return true;
  };
  // машины, задевающие сейчас точку (x, y) с запасом m: для пешеходов у въездов
  T.carsNear=function(x,y,m){for(let a=0;a<n;a++){const st=T.state[a];if(st!==CAR.PARK_IN&&st!==CAR.PARK_OUT)continue;
    const P=T.pose(a);if(Math.hypot(P.x-x,P.y-y)>len)continue;const r=carRect([P.x,P.y],P.h,m);if(inPoly([x,y],r))return true}return false};
  // нужно ли считать шаги: есть ли машины в движении или ждущие
  T.busy=function(){for(let a=0;a<n;a++){const s=T.state[a];if(s!==CAR.PARKED&&s!==CAR.CITY&&s!==CAR.NONE)return true}return false};

  // положение машины для отрисовки: x, y (м), курс h (рад)
  T.pose=function(a){
    const st=T.state[a];
    if(st===CAR.PARKED||st===CAR.MERGE){const sl=T.slot[a];return {x:slots.x[sl],y:slots.y[sl],h:slots.h[sl]}}
    if(st===CAR.PARK_IN||st===CAR.PARK_OUT){const sl=st===CAR.PARK_IN?T.tslot[a]:T.slot[a],m=st===CAR.PARK_IN?slots.pin[sl]:slots.pout[sl];
      return manPose(m,Math.min(1,T.mp[a]/m.len))}   // по кривой задней оси (приближённо — по параметру)
    if(st===CAR.LANE){const P=lanePt(T.lane[a],T.s[a]);return {x:P[0],y:P[1],h:Math.atan2(lanes.dy[T.lane[a]],lanes.dx[T.lane[a]])}}
    if(st===CAR.BOX){const b=T.bk[a],d=T.bs[a];let i=1;while(i<12&&b.cum[i]<d)i++;const k=Math.min(1,Math.max(0,(d-b.cum[i-1])/((b.cum[i]-b.cum[i-1])||1)));
      const p=b.pts[i-1],q=b.pts[i];return {x:p[0]+(q[0]-p[0])*k,y:p[1]+(q[1]-p[1])*k,h:Math.atan2(q[1]-p[1],q[0]-p[0])}}
    return null;
  };
  // инварианты: машины не перекрываются, на перекрёстке не больше одной, места не заняты дважды
  T.check=function(){
    for(let l=0;l<LN;l++){const c=lanes.cars[l];for(let i=1;i<c.length;i++)if(T.s[c[i-1]]-T.s[c[i]]<len-1e-6)throw new Error(`полоса ${l}: машины ${c[i-1]} и ${c[i]} перекрываются`)}
    const inBox=new Int32Array(N);for(let a=0;a<n;a++)if(T.state[a]===CAR.BOX){inBox[T.bk[a].node]++;if(T.nodeOcc[T.bk[a].node]!==a)throw new Error(`машина ${a} на перекрёстке без разрешения`)}
    for(let v=0;v<N;v++)if(inBox[v]>1)throw new Error(`на перекрёстке ${v} больше одной машины`);
    const seen=new Int32Array(slots.n);for(let a=0;a<n;a++){if(T.state[a]===CAR.PARKED||T.state[a]===CAR.MERGE||T.state[a]===CAR.PARK_OUT){const sl=T.slot[a];if(sl<0)throw new Error(`машина ${a} стоит без места`);seen[sl]++}}
    for(let i=0;i<slots.n;i++)if(seen[i]>1)throw new Error(`место ${i} занято дважды`);
    for(let a=0;a<n;a++){if(!A.car[a])continue;const moving=T.state[a]!==CAR.PARKED&&T.state[a]!==CAR.CITY;
      if(moving!==(L.act[a]===5&&L.arrive[a]===NEVER&&L.mode[a]===0))throw new Error(`машина ${a} (${CAR_NAME[T.state[a]]}) и её хозяин расходятся`)}
  };
  return T;
}
export {NEVER};
