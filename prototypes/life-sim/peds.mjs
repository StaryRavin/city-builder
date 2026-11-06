/*
 * Пешеходы: жители, идущие пешком, физически идут по тротуарам и переходят
 * улицы по зебрам.
 *
 * Тротуары — по обе стороны каждого звена, между краем проезжей части и
 * домами (w.sidewalk метров; середина тротуара — в O от оси). Зебры — у
 * каждого конца звена, кроме ворот: поперёк улицы, сразу за границей
 * перекрёстка. Сеть для пешехода:
 *   точки — концы тротуаров у зебр (звено, конец, сторона);
 *   тротуар — вдоль звена между его зебрами;
 *   угол — с тротуара одной улицы на тротуар соседней, не переходя дорогу;
 *   зебра — через улицу (только когда можно, см. ниже).
 * Дверь дома — точка на тротуаре его улицы напротив фасада.
 *
 * Зебра. Пешеход ступает на неё, только если в её полосах нет машин, на неё
 * не едет машина с разрешением на перекрёсток и с перекрёстка на эту улицу
 * никто не съезжает. Пока по зебре идут, машины ждут перед ней и на
 * перекрёсток через неё не въезжают (traffic.mjs).
 * Въезды. Машина, заезжающая на место на земле или выезжающая с него,
 * пересекает тротуар: она ждёт, пока у въезда нет пешеходов, а пешеход ждёт,
 * пока она проедет.
 *
 * Пешеходы друг другу не мешают (тротуар 2 м, расходятся). Скорость —
 * cfg.speed.walk. Всё в массивах, порядок обхода фиксирован.
 */
import {NEVER} from './traffic.mjs';

export const PED={NONE:0,WALK:1,WAIT:2,CROSS:3,CAR_WAIT:4};

export function createPeds(w,A,L,T){
  const cfg=w.cfg.peds,N=w.nodes.n,E=w.edges.n,nx=w.nodes.x,ny=w.nodes.y;
  const RW=w.roadHalfWidth,SW=w.sidewalk,CURB=RW-SW,O=SW>0?CURB+SW/2:RW+0.6,D=w.cfg.traffic.box+cfg.crossAt;
  const ea=w.edges.a,eb=w.edges.b,el=w.edges.len,gate=T.gateNode;
  const dirAB=(e)=>{const l=el[e];return [(nx[eb[e]]-nx[ea[e]])/l,(ny[eb[e]]-ny[ea[e]])/l]};
  // точка у зебры: звено e, конец end (0 — у a, 1 — у b), сторона side (+1 — справа от a→b)
  const pid=(e,end,side)=>e*4+end*2+(side>0?0:1);
  const P=[];for(let e=0;e<E;e++){const d=dirAB(e),n=[-d[1],d[0]];
    for(const end of [0,1])for(const side of [1,-1]){const v=end?eb[e]:ea[e],u=end?-1:1;P[pid(e,end,side)]=[nx[v]+d[0]*u*D+n[0]*side*O,ny[v]+d[1]*u*D+n[1]*side*O]}}
  // связи: {to, len, via (точки между), cross (номер зебры или -1)}
  const adj=[...Array(4*E)].map(()=>[]);
  const link=(a,b,len,via,cross)=>{adj[a].push({to:b,len,via,cross});adj[b].push({to:a,len,via:via.slice().reverse(),cross})};
  const dist=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1]);
  for(let e=0;e<E;e++)for(const side of [1,-1])link(pid(e,0,side),pid(e,1,side),dist(P[pid(e,0,side)],P[pid(e,1,side)]),[],-1);
  // зебры: номер = e*2 + конец
  for(let e=0;e<E;e++)for(const end of [0,1]){const v=end?eb[e]:ea[e];if(gate[v])continue;
    link(pid(e,end,1),pid(e,end,-1),dist(P[pid(e,end,1)],P[pid(e,end,-1)]),[],e*2+end)}
  // углы: между соседними (по кругу) улицами узла — по тротуару, через угловую точку
  for(let v=0;v<N;v++){if(gate[v])continue;
    const inc=[];for(let e=0;e<E;e++){if(ea[e]===v){const d=dirAB(e);inc.push({e,end:0,r:d})}if(eb[e]===v){const d=dirAB(e);inc.push({e,end:1,r:[-d[0],-d[1]]})}}
    if(inc.length<2)continue;
    inc.forEach((x)=>x.ang=Math.atan2(x.r[1],x.r[0]));inc.sort((x,y)=>x.ang-y.ang);
    // сторона звена x, обращённая в сектор «повернуть от r на +90°» (s=+1) или «−90°» (s=−1), относительно a→b
    const sideRel=(x,s)=>x.end===0?s:-s;
    for(let i=0;i<inc.length;i++){const x=inc[i],y=inc[(i+1)%inc.length];let phi=y.ang-x.ang;if(phi<=1e-9)phi+=2*Math.PI;
      const a=pid(x.e,x.end,sideRel(x,1)),b=pid(y.e,y.end,sideRel(y,-1));let via=[];
      if(phi<Math.PI*0.95){const m=[x.r[0]+y.r[0],x.r[1]+y.r[1]],ml=Math.hypot(m[0],m[1]),k=O/Math.sin(phi/2);via=[[nx[v]+m[0]/ml*k,ny[v]+m[1]/ml*k]]}
      const pts=[P[a],...via,P[b]];let L0=0;for(let j=1;j<pts.length;j++)L0+=dist(pts[j-1],pts[j]);link(a,b,L0,via,-1)}}

  // двери: место p — на тротуаре своей улицы напротив фасада (звено, сторона, расстояние от a)
  const door=new Array(w.places.n).fill(null);
  for(let p=0;p<w.places.n;p++){if(w.places.edge[p]<0)continue;const e=w.places.edge[p],d=dirAB(e),n=[-d[1],d[0]];
    const ax=nx[ea[e]]+d[0]*w.places.t[p]*el[e],ay=ny[ea[e]]+d[1]*w.places.t[p]*el[e],side=((w.places.x[p]-ax)*n[0]+(w.places.y[p]-ay)*n[1])>=0?1:-1;
    const u=Math.max(D,Math.min(el[e]-D,w.places.t[p]*el[e]));door[p]={e,side,u,x:nx[ea[e]]+d[0]*u+n[0]*side*O,y:ny[ea[e]]+d[1]*u+n[1]*side*O}}

  // маршрут от двери до двери: [{x, y, cross}] — cross ≥ 0 у отрезка, идущего по зебре
  function route(p,q){
    const s=door[p],t=door[q];if(!s||!t)return null;
    if(s.e===t.e&&s.side===t.side)return {len:Math.abs(s.u-t.u),pts:[{x:s.x,y:s.y,cross:-1},{x:t.x,y:t.y,cross:-1}]};
    const M=4*E,dd=new Float64Array(M).fill(Infinity),prev=new Int32Array(M).fill(-1),pl=new Array(M).fill(null),done=new Uint8Array(M);
    dd[pid(s.e,0,s.side)]=s.u-D;dd[pid(s.e,1,s.side)]=el[s.e]-D-s.u;
    const goal=new Map([[pid(t.e,0,t.side),t.u-D],[pid(t.e,1,t.side),el[t.e]-D-t.u]]);let best=Infinity,bestEnd=-1;
    for(;;){let u=-1,du=Infinity;for(let i=0;i<M;i++)if(!done[i]&&dd[i]<du){du=dd[i];u=i}
      if(u<0||du>=best)break;done[u]=1;if(goal.has(u)&&du+goal.get(u)<best){best=du+goal.get(u);bestEnd=u}
      for(const k of adj[u]){const c=du+k.len;if(!done[k.to]&&c<dd[k.to]){dd[k.to]=c;prev[k.to]=u;pl[k.to]=k}}}
    if(bestEnd<0)return null;
    const chain=[];let x=bestEnd;while(prev[x]>=0){chain.push(pl[x]);x=prev[x]}chain.reverse();
    const pts=[{x:s.x,y:s.y,cross:-1},{x:P[x][0],y:P[x][1],cross:-1}];
    for(const k of chain){for(const v of k.via)pts.push({x:v[0],y:v[1],cross:-1});pts.push({x:P[k.to][0],y:P[k.to][1],cross:k.cross})}
    pts.push({x:t.x,y:t.y,cross:-1});
    return {len:best,pts};
  }
  const cache=new Map();
  function walkDist(p,q){if(p===q)return 0;const k=p*w.places.n+q;if(!cache.has(k)){const r=route(p,q);cache.set(k,r?r.len:Infinity)}return cache.get(k)}

  const n=A.n,S={door,P,adj,route,walkDist,O,D,
    state:new Uint8Array(n),path:new Array(n).fill(null),wi:new Int32Array(n),x:new Float64Array(n),y:new Float64Array(n),hx:new Float64Array(n),hy:new Float64Array(n).fill(1),
    crossN:new Int32Array(2*E),crossId:new Int32Array(n).fill(-1),start:new Float64Array(n),
    stats:{walks:0,arrivals:0,crossings:0,crossWaits:0,drivewayWaits:0,maxWalkSec:0},
    rlen:new Float64Array(n),log:[]};   // log: [житель, длина пути м, секунд в пути] — для проверок скорости

  S.startWalk=function(a,from,to){
    const r=route(from,to);if(!r)throw new Error(`пешком не дойти: житель ${a}, места ${from} → ${to}`);
    S.path[a]=r.pts;S.wi[a]=1;S.rlen[a]=r.len;S.x[a]=r.pts[0].x;S.y[a]=r.pts[0].y;S.state[a]=PED.WALK;S.start[a]=T.time;S.stats.walks++;
  };
  // машины ждут пешеходов: на зебре (traffic.mjs спрашивает crossBusy) и у въездов (pedsNear)
  T.crossBusy=(v,e)=>S.crossN[e*2+(ea[e]===v?0:1)]>0;
  T.pedsNear=(x,y,r)=>{for(let a=0;a<n;a++)if(S.state[a]!==PED.NONE&&Math.hypot(S.x[a]-x,S.y[a]-y)<r)return true;return false};

  S.step=function(dt){
    const v0=w.cfg.speed.walk;
    for(let a=0;a<n;a++){const st=S.state[a];if(st===PED.NONE)continue;
      let left=v0*dt;
      while(left>1e-9){
        const pts=S.path[a],nxt=pts[S.wi[a]];
        // впереди зебра: ступить, только когда можно
        if(nxt.cross>=0&&S.state[a]!==PED.CROSS){
          const e=nxt.cross>>1,v=nxt.cross&1?eb[e]:ea[e];
          if(!T.crossClear(v,e)){if(S.state[a]!==PED.WAIT)S.stats.crossWaits++;S.state[a]=PED.WAIT;break}
          S.state[a]=PED.CROSS;S.crossId[a]=nxt.cross;S.crossN[nxt.cross]++;S.stats.crossings++}
        const dx=nxt.x-S.x[a],dy=nxt.y-S.y[a],d=Math.hypot(dx,dy);
        if(d>1e-9){S.hx[a]=dx/d;S.hy[a]=dy/d}
        const step=Math.min(left,d),X=S.x[a]+S.hx[a]*step,Y=S.y[a]+S.hy[a]*step;
        // въезд: машина пересекает тротуар — подождать
        if(S.state[a]!==PED.CROSS&&step>0&&T.carsNear(X,Y,0.6)){if(S.state[a]!==PED.CAR_WAIT)S.stats.drivewayWaits++;S.state[a]=PED.CAR_WAIT;break}
        if(S.state[a]===PED.CAR_WAIT||S.state[a]===PED.WAIT)S.state[a]=PED.WALK;
        S.x[a]=X;S.y[a]=Y;left-=step;
        if(step>=d-1e-9){
          if(S.state[a]===PED.CROSS&&nxt.cross>=0){S.crossN[nxt.cross]--;S.crossId[a]=-1;S.state[a]=PED.WALK}
          S.wi[a]++;
          if(S.wi[a]>=pts.length){S.state[a]=PED.NONE;S.path[a]=null;L.arrive[a]=L.tick;S.stats.arrivals++;S.stats.maxWalkSec=Math.max(S.stats.maxWalkSec,T.time-S.start[a]);S.log.push([a,S.rlen[a],T.time-S.start[a]]);break}
        }
      }
    }
  };
  S.busy=function(){for(let a=0;a<n;a++)if(S.state[a]!==PED.NONE)return true;return false};
  // положение для отрисовки: правее середины тротуара по ходу (на зебре — посередине)
  S.pose=function(a){if(S.state[a]===PED.NONE)return null;const k=S.state[a]===PED.CROSS?0:cfg.keepRight;
    return {x:S.x[a]-S.hy[a]*k,y:S.y[a]+S.hx[a]*k,h:Math.atan2(S.hy[a],S.hx[a])}};
  // инварианты: счётчики зебр сходятся; пешеход на зебре — в её полосах нет машин; идёт ⇔ хозяин в пути пешком
  S.check=function(){
    const cnt=new Int32Array(2*E);
    for(let a=0;a<n;a++){const walking=S.state[a]!==PED.NONE;
      if(walking!==(L.act[a]===5&&L.arrive[a]===NEVER&&L.mode[a]===1))throw new Error(`пешеход ${a} и его занятие расходятся`);
      if(S.state[a]===PED.CROSS)cnt[S.crossId[a]]++}
    for(let c=0;c<2*E;c++){if(cnt[c]!==S.crossN[c])throw new Error(`зебра ${c}: счётчик разошёлся`);
      if(cnt[c]>0){const e=c>>1,v=c&1?eb[e]:ea[e],li=T.lanes.to[2*e]===v?2*e:2*e+1,lo=li^1,len=w.cfg.traffic.carLength;
        for(const b of T.lanes.cars[li])if(T.s[b]+len/2>T.lanes.len[li]-T.cwE[li]+0.05)throw new Error(`зебра ${c}: на ней машина ${b}, а по ней идут`);
        for(const b of T.lanes.cars[lo])if(T.s[b]-len/2<T.cwS[lo]-0.05)throw new Error(`зебра ${c}: на ней машина ${b}, а по ней идут`)}}
  };
  return S;
}
