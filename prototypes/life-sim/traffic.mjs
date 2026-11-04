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
 * Парковка — вдоль бордюра с обеих сторон улицы, места по 5.5 м. Машина едет
 * к ближайшему свободному месту у здания назначения (место бронируется при
 * выезде), а выезжает с места, когда на полосе есть просвет.
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

export const CAR={PARKED:0,MERGE:1,LANE:2,BOX:3,OUT:4,CITY:5,NONE:6};
export const CAR_NAME=['стоит','выезжает с парковки','едет','на перекрёстке','за воротами','в Городе','нет машины'];
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
  // ---- парковочные места: вдоль бордюра справа по ходу полосы ----
  const slots={n:0,lane:[],s:[],x:[],y:[],occ:[]};
  for(let l=0;l<LN;l++){for(let s=cfg.slotLength/2+1;s<=lanes.len[l]-cfg.slotLength/2-1;s+=cfg.slotLength){
    const P=lanePt(l,s),rx=-lanes.dy[l],ry=lanes.dx[l],o=cfg.parkOffset-cfg.laneOffset;
    slots.lane.push(l);slots.s.push(s);slots.x.push(P[0]+rx*o);slots.y.push(P[1]+ry*o);slots.occ.push(-1);slots.n++}}

  // ---- машины: индекс = житель ----
  const n=A.n,T={cfg,lanes,slots,boxes,box,lanePt,deg,gateNode,time:0,
    state:new Uint8Array(n).fill(CAR.NONE),lane:new Int32Array(n).fill(-1),s:new Float64Array(n),v:new Float64Array(n),
    bk:new Array(n).fill(null),bs:new Float64Array(n),slot:new Int32Array(n).fill(-1),tslot:new Int32Array(n).fill(-1),
    route:new Array(n).fill(null),ri:new Int32Array(n),exitGate:new Uint8Array(n),outT:new Float64Array(n),outTotal:new Float64Array(n),
    outbound:new Uint8Array(n),granted:new Uint8Array(n),waitSince:new Float64Array(n).fill(-1),
    dest:new Int32Array(n).fill(-1),origin:new Int32Array(n).fill(-1),nodeOcc:new Int32Array(N).fill(-1),
    stats:{trips:0,arrivals:0,intersectionWaits:0,yieldRight:0,deadlockBreaks:0,mergeWaits:0,maxTripSec:0},tripStart:new Float64Array(n)};

  // ближайшее свободное место к зданию (по прямой до его центра)
  function nearestSlot(p,except){
    let best=-1,bd=Infinity;const cx=w.places.x[p],cy=w.places.y[p];
    for(let i=0;i<slots.n;i++){if(slots.occ[i]!==-1&&slots.occ[i]!==except)continue;const d=Math.hypot(slots.x[i]-cx,slots.y[i]-cy);if(d<bd-1e-9){bd=d;best=i}}
    return best;
  }
  // начальное состояние: машина стоит у дома хозяина
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
    if(!T.exitGate[a]){const ts=nearestSlot(to,a);T.tslot[a]=ts;slots.occ[ts]=a}   // бронь места у цели (своё место — тоже подходит)
    if(pl.kind[from]===KIND.OUTSIDE){T.state[a]=CAR.OUT;T.outbound[a]=0;T.outTotal[a]=pl.extra[from];T.outT[a]=pl.extra[from];T.route[a]=null;return}
    T.state[a]=CAR.MERGE;
  };
  function targetOf(a){return T.exitGate[a]?{gate:w.places.node[T.dest[a]]}:{lane:slots.lane[T.tslot[a]],s:slots.s[T.tslot[a]]}}
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

  T.step=function(dt){
    const pl=w.places;T.time+=dt;
    // 1. выезд с парковки и въезд из Города
    for(let a=0;a<n;a++){
      if(T.state[a]===CAR.MERGE){
        const sl=T.slot[a],l=slots.lane[sl],s=slots.s[sl];
        if(!T.route[a]){T.route[a]=plan(l,s,targetOf(a));T.ri[a]=0;if(!T.route[a])throw new Error('нет пути для машины '+a)}
        if(T.route[a].length===1&&!T.exitGate[a]&&T.tslot[a]===sl){ // уже на своём месте
          T.state[a]=CAR.PARKED;T.route[a]=null;T.tslot[a]=-1;arrive(a);continue}
        if(laneRoom(l,s,cfg.mergeBack,cfg.mergeAhead)){slots.occ[sl]=T.tslot[a]===sl?a:-1;T.slot[a]=-1;T.state[a]=CAR.LANE;T.v[a]=0;addToLane(a,l,s)}
        else T.stats.mergeWaits++;
      }else if(T.state[a]===CAR.OUT){
        T.outT[a]-=dt;if(T.outT[a]>0)continue;
        if(T.outbound[a]){T.state[a]=CAR.CITY;arrive(a);continue}
        const g=pl.node[T.origin[a]],l=out[g][0];
        if(!T.route[a]){T.route[a]=plan(l,0,targetOf(a));T.ri[a]=0;if(!T.route[a])throw new Error('нет пути от ворот для машины '+a)}
        if(laneRoom(l,0,0,len+cfg.minGap+0.5)){T.state[a]=CAR.LANE;T.v[a]=cfg.enterSpeed;addToLane(a,l,0)}
      }
    }
    // 2. перекрёстки: кому можно въехать
    for(let v=0;v<N;v++){
      if(T.nodeOcc[v]>=0)continue;
      const appr=[];for(const l of inn[v])for(const a of lanes.cars[l]){if(!crossing(a))continue;if(lanes.len[l]-T.s[a]>cfg.approach)break;appr.push(a)}
      if(!appr.length)continue;
      const atLine=(a)=>lanes.len[T.lane[a]]-T.s[a]<=len/2+cfg.stopGap+1.0;
      const can=(a)=>entryRoom(T.route[a][T.ri[a]+1]);
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
      if(T.ri[a]+1===T.route[a].length-1&&!T.exitGate[a])gap=Math.min(gap,b.len-T.bs[a]+slots.s[T.tslot[a]]);
      T.v[a]=speed(a,gap);T.bs[a]+=T.v[a]*dt;
      if(T.bs[a]>=b.len){T.nodeOcc[b.node]=-1;T.state[a]=CAR.LANE;T.ri[a]++;T.granted[a]=0;T.waitSince[a]=-1;T.bk[a]=null;addToLane(a,lo,T.bs[a]-b.len)}}
    // машины на полосах: от передней к задней
    for(let l=0;l<LN;l++){const c=lanes.cars[l];
      for(let i=0;i<c.length;i++){const a=c[i];if(T.state[a]!==CAR.LANE||moved[a])continue;
        let gap=Infinity;
        if(i>0)gap=T.s[c[i-1]]-len-cfg.minGap-T.s[a];
        const last=T.ri[a]===T.route[a].length-1;
        if(last&&!T.exitGate[a])gap=Math.min(gap,slots.s[T.tslot[a]]-T.s[a]);                 // своё место парковки
        else if(!last&&!T.granted[a])gap=Math.min(gap,lanes.len[l]-len/2-cfg.stopGap-T.s[a]);  // стоп-линия
        else if(!last){const lo=T.route[a][T.ri[a]+1],b=box(l,lo),cc=lanes.cars[lo];gap=Math.min(gap,lanes.len[l]-T.s[a]+b.len+(cc.length?T.s[cc[cc.length-1]]-len-cfg.minGap:1e9))}
        T.v[a]=speed(a,gap);T.s[a]+=T.v[a]*dt;
        if(last&&!T.exitGate[a]){
          if(slots.s[T.tslot[a]]-T.s[a]<0.3&&T.v[a]<0.5){ // встала на место
            removeFromLane(a);i--;T.state[a]=CAR.PARKED;T.slot[a]=T.tslot[a];T.tslot[a]=-1;T.lane[a]=-1;T.v[a]=0;T.route[a]=null;arrive(a)}
        }else if(last&&T.exitGate[a]&&T.s[a]>=lanes.len[l]){                 // уехала за ворота
          removeFromLane(a);i--;T.state[a]=CAR.OUT;T.outbound[a]=1;T.outTotal[a]=pl.extra[T.dest[a]];T.outT[a]=pl.extra[T.dest[a]];T.lane[a]=-1;T.route[a]=null}
        else if(!last&&T.s[a]>=lanes.len[l]){                                 // въехала на перекрёсток
          const lo=T.route[a][T.ri[a]+1];removeFromLane(a);i--;T.state[a]=CAR.BOX;T.bk[a]=box(l,lo);T.bs[a]=T.s[a]-lanes.len[l];T.lane[a]=-1}
      }}
    for(let l=0;l<LN;l++)lanes.cars[l].sort((x,y)=>T.s[y]-T.s[x]||x-y);
  };
  // нужно ли считать шаги: есть ли машины в движении или ждущие
  T.busy=function(){for(let a=0;a<n;a++){const s=T.state[a];if(s===CAR.MERGE||s===CAR.LANE||s===CAR.BOX||s===CAR.OUT)return true}return false};

  // положение машины для отрисовки: x, y (м), курс h (рад)
  T.pose=function(a){
    const st=T.state[a];
    if(st===CAR.PARKED||(st===CAR.MERGE)){const sl=T.slot[a],l=slots.lane[sl];return {x:slots.x[sl],y:slots.y[sl],h:Math.atan2(lanes.dy[l],lanes.dx[l])}}
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
    const seen=new Int32Array(slots.n);for(let a=0;a<n;a++){if(T.state[a]===CAR.PARKED||T.state[a]===CAR.MERGE){const sl=T.slot[a];if(sl<0)throw new Error(`машина ${a} стоит без места`);seen[sl]++}}
    for(let i=0;i<slots.n;i++)if(seen[i]>1)throw new Error(`место ${i} занято дважды`);
    for(let a=0;a<n;a++){if(!A.car[a])continue;const moving=T.state[a]!==CAR.PARKED&&T.state[a]!==CAR.CITY;
      if(moving!==(L.act[a]===5&&L.arrive[a]===NEVER))throw new Error(`машина ${a} (${CAR_NAME[T.state[a]]}) и её хозяин расходятся`)}
  };
  return T;
}
export {NEVER};
