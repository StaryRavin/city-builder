/*
 * Мир симуляции: снимок редактора (scenes/*.snapshot.json) → плоские массивы.
 *
 * Места (places) — всё, куда агент может пойти: жилой дом, магазин, рабочее
 * место, внешний мир за воротами. Агенты взаимодействуют только с местами,
 * не друг с другом. Каждое место — индекс во всех массивах places.*:
 *   kind     — HOME / SHOP / WORK / OUTSIDE
 *   beds     — мест для жизни (жилой дом)
 *   jobs     — рабочих мест (магазин, рабочий дом, внешний мир)
 *   visitors — покупателей одновременно (магазин, внешний мир)
 *   edge, t  — точка примыкания к дороге: звено и доля от его узла a;
 *              у внешнего мира edge = -1, а node — узел ворот
 *   extra    — секунды пути за воротами (только внешний мир)
 *
 * Дороги — звенья с длиной (м). Кратчайшие расстояния между узлами считаются
 * один раз (Флойд — Уоршелл: в деревне 5 узлов; для тысяч узлов заменить на
 * Дейкстру от нужных узлов). Время проезда = расстояние / скорость способа.
 * Пробки и загрузка — этап 4.
 */
export const KIND={HOME:0,SHOP:1,WORK:2,OUTSIDE:3,CAFE:4};
export const KIND_NAME=['дом','магазин','работа','внешний мир','кафе'];
export const KIND_KEY=['home','shop','work','outside','cafe'];   // ключ часов работы в cfg.hours
const TYPE_KIND={res:KIND.HOME,com:KIND.SHOP,work:KIND.WORK};
const USE_KIND={food:KIND.SHOP,cafe:KIND.CAFE,work:KIND.WORK};
// места здания: без uses — одно по типу; с uses (смешанное назначение) — жильё, если есть
// жильцы, и по месту на каждое заведение (кафе, продукты, работа) с его числами и часами
function placesOf(b){
  if(!b.uses){const k=TYPE_KIND[b.type];if(k===undefined)throw new Error('неизвестный тип дома: '+b.type);return [{kind:k}]}
  const out=[];if(b.uses.beds>0)out.push({kind:KIND.HOME,beds:b.uses.beds});
  for(const u of b.uses.places){const k=USE_KIND[u.kind];if(k===undefined)throw new Error('неизвестный вид заведения: '+u.kind);
    out.push({kind:k,jobs:u.jobs,visitors:u.visitors,hours:u.hours,cat:u.cat,name:u.name})}
  return out;
}

export function buildWorld(snap,cfg){
  if(snap.format!=='city-builder/world@1')throw new Error('неизвестный формат снимка: '+snap.format);
  const N=snap.nodes.length,E=snap.edges.length;
  const nodes={n:N,x:new Float64Array(N),y:new Float64Array(N)};
  snap.nodes.forEach((p,i)=>{nodes.x[i]=p[0];nodes.y[i]=p[1]});
  const edges={n:E,a:new Int32Array(E),b:new Int32Array(E),len:new Float64Array(E)};
  snap.edges.forEach((e,i)=>{edges.a[i]=e.a;edges.b[i]=e.b;edges.len[i]=e.length});

  // кратчайшие расстояния по дорогам между узлами, м
  const dist=new Float64Array(N*N).fill(Infinity);
  for(let i=0;i<N;i++)dist[i*N+i]=0;
  for(let e=0;e<E;e++){const a=edges.a[e],b=edges.b[e],l=edges.len[e];
    if(l<dist[a*N+b]){dist[a*N+b]=l;dist[b*N+a]=l}}
  for(let k=0;k<N;k++)for(let i=0;i<N;i++){const ik=dist[i*N+k];if(ik===Infinity)continue;
    for(let j=0;j<N;j++){const v=ik+dist[k*N+j];if(v<dist[i*N+j])dist[i*N+j]=v}}

  const per=snap.buildings.map(placesOf),P=per.reduce((s,x)=>s+x.length,0)+snap.gates.length;
  // src — номер здания (у ворот — номер ворот); open/close — свои часы работы (−1 — по виду, cfg.hours)
  const places={n:P,kind:new Uint8Array(P),beds:new Int32Array(P),jobs:new Int32Array(P),visitors:new Int32Array(P),
    edge:new Int32Array(P),t:new Float64Array(P),node:new Int32Array(P).fill(-1),extra:new Float64Array(P),
    x:new Float64Array(P),y:new Float64Array(P),src:new Int32Array(P),name:new Array(P),cat:new Array(P),
    open:new Float64Array(P).fill(-1),close:new Float64Array(P).fill(-1)};
  let i=0;
  snap.buildings.forEach((b,bi)=>{for(const u of per[bi]){
    const k=u.kind;places.kind[i]=k;places.edge[i]=b.edge;places.t[i]=b.t;places.x[i]=b.center[0];places.y[i]=b.center[1];places.src[i]=b.id;
    if(b.uses){places.beds[i]=u.beds||0;places.jobs[i]=u.jobs||0;places.visitors[i]=u.visitors||0;if(u.hours){places.open[i]=u.hours[0];places.close[i]=u.hours[1]}
      places.cat[i]=u.cat||KIND_NAME[k];places.name[i]=u.name?u.cat+' «'+u.name+'»':(u.cat||KIND_NAME[k])+' #'+b.id}
    else{
      if(k===KIND.HOME)places.beds[i]=b.capacity;else places.jobs[i]=b.capacity;
      if(k===KIND.SHOP)places.visitors[i]=Math.max(1,Math.round(b.cells*b.floors*cfg.shopVisitorsPerCell));
      places.cat[i]=KIND_NAME[k];places.name[i]=KIND_NAME[k]+' #'+b.id}
    i++}});
  for(const g of snap.gates){
    places.kind[i]=KIND.OUTSIDE;places.edge[i]=-1;places.node[i]=g.node;places.x[i]=nodes.x[g.node];places.y[i]=nodes.y[g.node];
    places.jobs[i]=cfg.outside.jobs;places.visitors[i]=1e9;places.extra[i]=cfg.outside.minutesBeyondGate*60;places.src[i]=g.id;
    places.name[i]='внешний мир: '+g.name;places.cat[i]='внешний мир';i++;
  }
  // для парковки на свободной земле движению нужны контуры зданий и ширина дороги
  const outlines=snap.buildings.map((b)=>b.outline||[]);
  // ширина улицы — от оси до домов, вместе с тротуаром (sidewalk; 0 — тротуара нет)
  const roadHalfWidth=(snap.render&&snap.render.roadHalfWidth)||cfg.traffic.roadHalfWidth;
  const sidewalk=(snap.render&&snap.render.sidewalk)||0;
  return {name:snap.name||'',nodes,edges,dist,places,cfg,outlines,roadHalfWidth,sidewalk};
}

// расстояние по дорогам между местами p и q, м (без пути за воротами)
export function distance(w,p,q){
  const {places:pl,edges:ed,dist,nodes}=w,N=nodes.n;
  if(pl.edge[p]>=0&&pl.edge[p]===pl.edge[q])return Math.abs(pl.t[p]-pl.t[q])*ed.len[pl.edge[p]];
  const ends=(x)=>pl.edge[x]<0?[[pl.node[x],0]]:[[ed.a[pl.edge[x]],pl.t[x]*ed.len[pl.edge[x]]],[ed.b[pl.edge[x]],(1-pl.t[x])*ed.len[pl.edge[x]]]];
  let best=Infinity;
  for(const [u,du] of ends(p))for(const [v,dv] of ends(q)){const d=du+dist[u*N+v]+dv;if(d<best)best=d}
  return best;
}
// может ли агент добраться до места: наружу без машины — нет, если cfg.outside.carOnly (автобусов нет)
export function reachable(w,q,hasCar){return !(w.places.kind[q]===KIND.OUTSIDE&&w.cfg.outside.carOnly&&!hasCar)}
// время в пути, с: по дорогам с ровной скоростью способа + путь за воротами
export function travelTime(w,p,q,hasCar){
  if(!reachable(w,q,hasCar)||!reachable(w,p,hasCar))return Infinity;
  const v=hasCar?w.cfg.speed.car:w.cfg.speed.walk;
  return distance(w,p,q)/v+w.places.extra[p]+w.places.extra[q];
}
