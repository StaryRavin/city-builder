/*
 * Сутки жителя: часы и потребности (этап 2).
 *
 * Расписания у жителей нет. Есть потребности, которые растут со временем:
 *   усталость (fatigue) — растёт, пока не спит, и падает во сне;
 *   голод (hunger)       — растёт всегда, быстрее днём; гасится едой;
 *   работа (owed)        — «долг» рабочих часов: +8 часов за сутки, гасится работой;
 *   еда дома (food)      — порции; кончаются — нужен магазин.
 * Расписание есть у МЕСТ: часы работы (магазин 9–20, мастерская 8–17,
 * внешний мир 8–20). Утро, рабочий день и вечерние покупки получаются сами
 * из потребностей и часов работы мест.
 *
 * Каждый тик (1 игровая минута) житель:
 *   1. копит потребности;
 *   2. в пути — до тика прибытия: его ставят движение машин (traffic.mjs)
 *      или пешеходов (peds.mjs); без них — время по формуле;
 *   3. на месте — продолжает занятие, пока оно не кончилось:
 *        сон — до утра (своё время подъёма 5:30–7:00); еда — 30 мин; покупки — 20 мин;
 *        работа — пока есть долг и место открыто (проголодался — ест на месте);
 *   4. свободен — выбирает самое срочное занятие:
 *        сон, если валится с ног > еда (где стоит, из своих запасов) >
 *        ночной сон (дома) > голоден без еды —
 *        магазин (с работы — перерыв на обед) > работа (на своём
 *        месте; выезжает так, чтобы приехать к открытию) > магазин (ближайший
 *        открытый со свободным местом; выбор по полезности — этап 3) > домой.
 *
 * Состояние — пачка массивов, индекс = номер жителя. Жители обходятся по
 * порядку, случайность — только из rng: при одном seed всё повторяется.
 */
import {KIND,KIND_KEY,travelTime,distance} from './world.mjs';

export const MODE={CAR:0,WALK:1};
/*
 * Пешком или на машине (modeFor):
 *   - в Город и из Города — на машине; если сцена разрешает (outside.carOnly
 *     false — город вокруг, есть транспорт), без машины — пешком до выезда;
 *   - по деревне — пешком, если идти не дальше своего порога walkMax (у
 *     каждого свой, 120–450 м), иначе на машине, но только если она здесь;
 *     машина осталась в другом месте — пешком.
 * В Город, а машина не здесь: сначала дойти до неё пешком (travel).
 */
function walkDist(w,L,from,to){return L.walkDist?L.walkDist(from,to):distance(w,from,to)}
export function modeFor(w,A,L,a,from,to){
  const pl=w.places;
  if(pl.kind[to]===KIND.OUTSIDE||pl.kind[from]===KIND.OUTSIDE)
    return w.cfg.outside.carOnly||(A.car[a]&&L.carAt[a]===from)?MODE.CAR:MODE.WALK;
  if(!A.car[a]||L.carAt[a]!==from)return MODE.WALK;
  return walkDist(w,L,from,to)>L.walkMax[a]?MODE.CAR:MODE.WALK;
}
// время в пути для решений (когда выезжать, какой магазин ближе), с
export function tripSeconds(w,A,L,a,from,to){
  if(from===to)return 0;
  const pl=w.places,out=pl.kind[to]===KIND.OUTSIDE;
  const carOnly=w.cfg.outside.carOnly;
  if(out&&!A.car[a]&&carOnly)return Infinity;
  if(out&&carOnly&&L.carAt[a]!==from)return walkDist(w,L,from,L.carAt[a])/w.cfg.speed.walk+travelTime(w,L.carAt[a],to,true);
  return modeFor(w,A,L,a,from,to)===MODE.CAR?travelTime(w,from,to,true):walkDist(w,L,from,to)/w.cfg.speed.walk+pl.extra[from]+pl.extra[to];
}

export const ACT={IDLE:0,SLEEP:1,EAT:2,WORK:3,SHOP:4,TRAVEL:5};
export const ACT_NAME=['дома/свободен','сон','еда','работа','покупки','в пути'];

export function createLife(w,A,rng){
  const n=A.n,pl=w.places,cfg=w.cfg;
  const L={tick:0,
    at:new Int32Array(n),         // место, где житель сейчас (-1 — в пути)
    to:new Int32Array(n).fill(-1),// куда едет
    from:new Int32Array(n).fill(-1),
    depart:new Int32Array(n),arrive:new Int32Array(n), // тики выезда и прибытия
    intent:new Uint8Array(n),     // зачем едет
    act:new Uint8Array(n),        // занятие сейчас
    actEnd:new Int32Array(n),     // тик конца занятия на время (еда, покупки)
    fatigue:new Float64Array(n),hunger:new Float64Array(n),owed:new Float64Array(n),food:new Int32Array(n),
    bed:new Float64Array(n),wake:new Float64Array(n), // своя ночь: ложится 21:30–23:00, встаёт 5:30–7:00
    shoppers:new Int32Array(pl.n),workers:new Int32Array(pl.n),
    open:new Float64Array(pl.n),close:new Float64Array(pl.n),
    log:[],                       // события: [тик, житель, занятие, место]
    trips:cfg.traffic.on?[]:null, // новые поездки — их забирает движение (машины и пешеходы)
    mode:new Uint8Array(n),       // как добирается сейчас: MODE.CAR / MODE.WALK
    carAt:new Int32Array(n).fill(-1), // где стоит его машина (место)
    walkMax:new Float64Array(n),  // до скольких метров идёт пешком
    walkDist:null,                // длина пешего пути по тротуарам (задаёт peds.mjs)
    eatOut:new Uint8Array(n),     // ест в кафе и занимает там место
    cafeLove:new Float64Array(n), // насколько любит обедать в кафе (0…1)
    shopList:[],cafeList:[],      // где покупают еду домой; где едят
  };
  // часы работы: свои у места (заведения Дорчола) или по виду места
  for(let p=0;p<pl.n;p++){const h=pl.open[p]>=0?[pl.open[p],pl.close[p]]:cfg.hours[KIND_KEY[pl.kind[p]]];if(h){L.open[p]=h[0];L.close[p]=h[1]}
    if(pl.kind[p]===KIND.CAFE)L.cafeList.push(p);else if(pl.visitors[p]>0)L.shopList.push(p)}
  // начало: полночь, все дома и спят; потребности немного разные
  for(let a=0;a<n;a++){
    L.at[a]=A.home[a];L.act[a]=ACT.SLEEP;
    L.bed[a]=21.5+1.5*rng.next();L.wake[a]=5.5+1.5*rng.next();
    L.fatigue[a]=0.5+0.2*rng.next();
    L.hunger[a]=0.2+0.2*rng.next();
    L.owed[a]=A.job[a]>=0?2+rng.next():0;
    L.food[a]=2+rng.int(5);
    L.carAt[a]=A.home[a];L.walkMax[a]=cfg.peds.walkMin+(cfg.peds.walkMax-cfg.peds.walkMin)*rng.next();
    L.cafeLove[a]=rng.next();
  }
  return L;
}

export const hourOf=(L,cfg)=>(L.tick*cfg.tickSeconds/3600)%24;
export const dayOf=(L,cfg)=>Math.floor(L.tick*cfg.tickSeconds/86400);
function isNight(h,nt){return nt[0]>nt[1]?(h>=nt[0]||h<nt[1]):(h>=nt[0]&&h<nt[1])}
function isOpen(L,p,h){return L.close[p]>L.open[p]&&h>=L.open[p]&&h<L.close[p]}

// дневник: [тик, житель, занятие, место, как добирается (только для поездок)]
function setAct(L,a,act,p,end){L.act[a]=act;L.actEnd[a]=end;L.log.push(act===ACT.TRAVEL?[L.tick,a,act,p,L.mode[a]]:[L.tick,a,act,p])}

function startAct(w,A,L,a,act){
  const p=L.at[a],nd=w.cfg.needs,mt=60/w.cfg.tickSeconds;
  if(act===ACT.EAT){
    // в кафе: еда своя не нужна; посетитель занимает место (работник кафе ест там же, без места)
    if(w.places.kind[p]===KIND.CAFE){if(A.job[a]!==p){L.shoppers[p]++;L.eatOut[a]=1}setAct(L,a,act,p,L.tick+Math.round(nd.cafeMinutes*mt));return}
    L.food[a]--;setAct(L,a,act,p,L.tick+Math.round(nd.eatMinutes*mt));return}
  if(act===ACT.SHOP){L.shoppers[p]++;setAct(L,a,act,p,L.tick+Math.round(nd.shopMinutes*mt));return}
  if(act===ACT.WORK){L.workers[p]++;setAct(L,a,act,p,-1);return}
  setAct(L,a,act,p,-1);
}
function endAct(w,A,L,a){
  const p=L.at[a],act=L.act[a];
  if(act===ACT.SHOP){L.shoppers[p]--;L.food[a]+=w.cfg.needs.buyPortions}
  else if(act===ACT.WORK)L.workers[p]--;
  else if(act===ACT.EAT){L.hunger[a]=0;if(L.eatOut[a]){L.shoppers[p]--;L.eatOut[a]=0}}
  L.act[a]=ACT.IDLE;
}
// поездка: на машине — через движение по дорогам (traffic.mjs ставит тик
// прибытия, когда машина встала на место); без машины или без движения —
// время по формуле
function travel(w,A,L,a,dest,intent){
  const from=L.at[a];
  // в Город, а машина в другом месте — сначала к машине пешком (на месте решит снова)
  if(w.places.kind[dest]===KIND.OUTSIDE&&w.cfg.outside.carOnly&&L.carAt[a]!==from&&L.carAt[a]>=0){dest=L.carAt[a];intent=ACT.IDLE}
  const mode=modeFor(w,A,L,a,from,dest);
  L.from[a]=from;L.to[a]=dest;L.at[a]=-1;L.intent[a]=intent;L.depart[a]=L.tick;L.mode[a]=mode;
  if(L.trips){L.arrive[a]=2147483647;L.trips.push(a)}
  else{const sec=mode===MODE.CAR?travelTime(w,from,dest,true):walkDist(w,L,from,dest)/w.cfg.speed.walk;L.arrive[a]=L.tick+Math.max(1,Math.ceil(sec/w.cfg.tickSeconds))}
  setAct(L,a,ACT.TRAVEL,dest,L.arrive[a]);
}
// свободный житель выбирает занятие: возвращает [занятие, место]
function choose(w,A,L,a,h){
  const pl=w.places,nd=w.cfg.needs,here=L.at[a],home=A.home[a],car=A.car[a]===1;
  // сон — только дома; валится с ног — спать, даже голодным
  if(L.fatigue[a]>=nd.sleepAt)return [ACT.SLEEP,home];
  // еда (перед обычным сном тоже поест):
  //   в кафе — прямо здесь; дома — из своих запасов;
  //   не дома — в кафе неподалёку, если любит кафе (или своей еды нет), иначе из своих запасов (обед с собой);
  //   еды нет — кафе или магазин, что ближе
  const hungry=L.hunger[a]>=nd.eatAt;
  if(hungry){
    if(w.places.kind[here]===KIND.CAFE&&(A.job[a]===here||L.shoppers[here]<w.places.visitors[here]))return [ACT.EAT,here];
    if(here===home&&L.food[a]>0)return [ACT.EAT,here];
    if(here!==home&&(L.cafeLove[a]>=nd.cafeLoveAt||L.food[a]===0)){const c=nearestCafe(w,A,L,a,here,h,nd.cafeNearSeconds);if(c>=0)return [ACT.EAT,c]}
    if(L.food[a]>0)return [ACT.EAT,here];
  }
  if(isNight(h,[L.bed[a],L.wake[a]])&&L.fatigue[a]>=nd.sleepAtNight)return [ACT.SLEEP,home];
  // голоден, а еды нет — кафе или магазин, что ближе (с работы — перерыв на обед)
  if(hungry){const c=nearestCafe(w,A,L,a,here,h,Infinity),s=nearestShop(w,A,L,a,here,h);
    if(c>=0&&(s<0||tripSeconds(w,A,L,a,here,c)<=tripSeconds(w,A,L,a,here,s)))return [ACT.EAT,c];if(s>=0)return [ACT.SHOP,s]}
  // работа — на своём месте; выехать так, чтобы приехать к открытию
  const j=A.job[a];
  // на месте работы — вернуться к работе, если должен хотя бы 15 мин; ехать из другого места — если должен workMinOwed часов
  if(j>=0&&L.owed[a]>(here===j?0.25:nd.workMinOwed)){
    const tt=tripSeconds(w,A,L,a,here,j)/3600;
    if(h+tt>=L.open[j]&&h+tt<L.close[j]-0.5)return [ACT.WORK,j];
  }
  // магазин — когда дома мало еды
  if(L.food[a]<=nd.shopAt){const s=nearestShop(w,A,L,a,here,h);if(s>=0)return [ACT.SHOP,s]}
  return [ACT.IDLE,home];
}
// ближайший открытый магазин со свободным местом (выбор по полезности — этап 3)
function nearestShop(w,A,L,a,here,h){return nearestOf(w,A,L,a,here,h,L.shopList,Infinity)}
// ближайшее открытое кафе со свободным местом не дальше maxSec
function nearestCafe(w,A,L,a,here,h,maxSec){return nearestOf(w,A,L,a,here,h,L.cafeList,maxSec)}
function nearestOf(w,A,L,a,here,h,list,maxSec){
  const pl=w.places;let best=-1,bt=maxSec;
  for(const p of list){if(L.shoppers[p]>=pl.visitors[p])continue;
    const tt=tripSeconds(w,A,L,a,here,p);if(tt>bt||tt===Infinity||!isOpen(L,p,h+tt/3600))continue;
    if(tt<bt||best<0){bt=tt;best=p}}
  return best;
}

export function step(w,A,L){
  const cfg=w.cfg,nd=cfg.needs,dtH=cfg.tickSeconds/3600,h=hourOf(L,cfg);
  for(let a=0;a<A.n;a++){
    // 1. потребности
    const asleep=L.act[a]===ACT.SLEEP;
    L.fatigue[a]=Math.max(0,L.fatigue[a]+(asleep?nd.fatigueSleep:nd.fatigueAwake)*dtH);
    L.hunger[a]=Math.min(1.5,L.hunger[a]+(asleep?nd.hungerSleep:nd.hungerAwake)*dtH);
    if(A.job[a]>=0)L.owed[a]+=nd.workHoursPerDay/24*dtH-(L.act[a]===ACT.WORK?dtH:0);
    // 2. в пути
    if(L.act[a]===ACT.TRAVEL){
      if(L.tick<L.arrive[a])continue;
      L.at[a]=L.to[a];L.to[a]=-1;L.act[a]=ACT.IDLE;if(L.mode[a]===MODE.CAR)L.carAt[a]=L.at[a];
      const it=L.intent[a],p=L.at[a];
      if((it===ACT.SHOP||it===ACT.EAT&&w.places.kind[p]===KIND.CAFE&&A.job[a]!==p)&&(L.shoppers[p]>=w.places.visitors[p]||!isOpen(L,p,h))){}  // занято или закрыто — выберет снова
      else if(it===ACT.WORK&&!isOpen(L,p,h)){}
      else if(it!==ACT.IDLE){startAct(w,A,L,a,it);continue}
      else setAct(L,a,ACT.IDLE,p,-1);
    }
    // 3. занятие продолжается?
    const act=L.act[a],p=L.at[a];
    if(act===ACT.SLEEP){if(L.fatigue[a]>0||isNight(h,[L.bed[a],L.wake[a]]))continue;endAct(w,A,L,a)} // спит до утра
    else if(act===ACT.EAT||act===ACT.SHOP){if(L.tick<L.actEnd[a])continue;endAct(w,A,L,a)}
    else if(act===ACT.WORK){
      if(L.owed[a]>0&&isOpen(L,p,h)){
        // работает в магазине — там же и покупает еду домой, если её мало
        if(w.places.kind[p]===KIND.SHOP&&L.food[a]<=nd.shopAt){L.food[a]+=nd.buyPortions;L.log.push([L.tick,a,ACT.SHOP,p])}
        // проголодался — перерыв на обед (где — решит выбор: с собой, в кафе, в магазин); поесть негде — работает дальше
        if(L.hunger[a]>=nd.eatAt){if(L.food[a]===0&&w.places.kind[p]!==KIND.CAFE&&nearestShop(w,A,L,a,p,h)<0&&nearestCafe(w,A,L,a,p,h,Infinity)<0)continue;
          endAct(w,A,L,a);}
        else continue;}
      else endAct(w,A,L,a);
    }
    // 4. свободен — выбрать занятие
    const [na,dest]=choose(w,A,L,a,h);
    if(dest===L.at[a]){if(na!==ACT.IDLE||act!==ACT.IDLE)startAct(w,A,L,a,na)}
    else travel(w,A,L,a,dest,na);
  }
  L.tick++;
}

// снимок: сколько жителей где и чем заняты
export function snapshot(w,A,L){
  const pl=w.places,s={home:0,sleep:0,travel:0,walk:0,cafe:0,workLocal:0,workOutside:0,shopLocal:0,shopOutside:0,eat:0,outsideOther:0,localOther:0};
  for(let a=0;a<A.n;a++){
    const act=L.act[a],p=L.at[a],out=p>=0&&pl.kind[p]===KIND.OUTSIDE;
    if(act===ACT.TRAVEL){if(L.mode[a]===MODE.WALK)s.walk++;else s.travel++}
    else if(act===ACT.SLEEP)s.sleep++;
    else if(act===ACT.WORK)out?s.workOutside++:s.workLocal++;
    else if(act===ACT.SHOP)out?s.shopOutside++:s.shopLocal++;
    else if(act===ACT.EAT){if(pl.kind[p]===KIND.CAFE)s.cafe++;else s.eat++}
    else if(p===A.home[a])s.home++;
    else if(out)s.outsideOther++;else s.localOther++;
  }
  return s;
}
// инварианты тика: каждый житель ровно в одном состоянии, места не переполнены
export function checkInvariants(w,A,L){
  const pl=w.places,shop=new Int32Array(pl.n),work=new Int32Array(pl.n);
  for(let a=0;a<A.n;a++){
    const traveling=L.act[a]===ACT.TRAVEL;
    if(traveling!==(L.at[a]<0))throw new Error(`житель ${a}: в пути, но стоит на месте (или наоборот)`);
    if(L.act[a]===ACT.SLEEP&&L.at[a]!==A.home[a])throw new Error(`житель ${a} спит не дома`);
    if(L.act[a]===ACT.WORK){if(L.at[a]!==A.job[a])throw new Error(`житель ${a} работает не на своём месте`);work[L.at[a]]++}
    if(L.act[a]===ACT.SHOP||L.act[a]===ACT.EAT&&L.eatOut[a])shop[L.at[a]]++;
    if(L.eatOut[a]&&L.act[a]!==ACT.EAT)throw new Error(`житель ${a}: занимает место в кафе, но не ест`);
    if(L.food[a]<0)throw new Error(`житель ${a}: еды меньше нуля`);
  }
  for(let p=0;p<pl.n;p++){
    if(shop[p]!==L.shoppers[p]||work[p]!==L.workers[p])throw new Error(`место ${p}: счётчики разошлись`);
    if(shop[p]>pl.visitors[p])throw new Error(`место ${p}: посетителей больше мест`);
    if(work[p]>pl.jobs[p])throw new Error(`место ${p}: работников больше мест`);
  }
}
