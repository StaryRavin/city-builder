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
 *   2. в пути — едет до тика прибытия: на машине его ставит движение по
 *      дорогам (traffic.mjs), пешком — время по формуле;
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
import {KIND,travelTime} from './world.mjs';

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
    trips:cfg.traffic.on?[]:null, // новые поездки на машине — их забирает движение
  };
  for(let p=0;p<pl.n;p++){const h=cfg.hours[['','shop','work','outside'][pl.kind[p]]];if(h){L.open[p]=h[0];L.close[p]=h[1]}}
  // начало: полночь, все дома и спят; потребности немного разные
  for(let a=0;a<n;a++){
    L.at[a]=A.home[a];L.act[a]=ACT.SLEEP;
    L.bed[a]=21.5+1.5*rng.next();L.wake[a]=5.5+1.5*rng.next();
    L.fatigue[a]=0.5+0.2*rng.next();
    L.hunger[a]=0.2+0.2*rng.next();
    L.owed[a]=A.job[a]>=0?2+rng.next():0;
    L.food[a]=2+rng.int(5);
  }
  return L;
}

export const hourOf=(L,cfg)=>(L.tick*cfg.tickSeconds/3600)%24;
export const dayOf=(L,cfg)=>Math.floor(L.tick*cfg.tickSeconds/86400);
function isNight(h,nt){return nt[0]>nt[1]?(h>=nt[0]||h<nt[1]):(h>=nt[0]&&h<nt[1])}
function isOpen(L,p,h){return L.close[p]>L.open[p]&&h>=L.open[p]&&h<L.close[p]}

function setAct(L,a,act,p,end){L.act[a]=act;L.actEnd[a]=end;L.log.push([L.tick,a,act,p])}

function startAct(w,A,L,a,act){
  const p=L.at[a],nd=w.cfg.needs,mt=60/w.cfg.tickSeconds;
  if(act===ACT.EAT){L.food[a]--;setAct(L,a,act,p,L.tick+Math.round(nd.eatMinutes*mt));return}
  if(act===ACT.SHOP){L.shoppers[p]++;setAct(L,a,act,p,L.tick+Math.round(nd.shopMinutes*mt));return}
  if(act===ACT.WORK){L.workers[p]++;setAct(L,a,act,p,-1);return}
  setAct(L,a,act,p,-1);
}
function endAct(w,A,L,a){
  const p=L.at[a],act=L.act[a];
  if(act===ACT.SHOP){L.shoppers[p]--;L.food[a]+=w.cfg.needs.buyPortions}
  else if(act===ACT.WORK)L.workers[p]--;
  else if(act===ACT.EAT)L.hunger[a]=0;
  L.act[a]=ACT.IDLE;
}
// поездка: на машине — через движение по дорогам (traffic.mjs ставит тик
// прибытия, когда машина встала на место); без машины или без движения —
// время по формуле
function travel(w,A,L,a,dest,intent){
  L.from[a]=L.at[a];L.to[a]=dest;L.at[a]=-1;L.intent[a]=intent;L.depart[a]=L.tick;
  if(L.trips&&A.car[a]){L.arrive[a]=2147483647;L.trips.push(a)}
  else{const sec=travelTime(w,L.from[a],dest,A.car[a]===1);L.arrive[a]=L.tick+Math.max(1,Math.ceil(sec/w.cfg.tickSeconds))}
  setAct(L,a,ACT.TRAVEL,dest,L.arrive[a]);
}
// свободный житель выбирает занятие: возвращает [занятие, место]
function choose(w,A,L,a,h){
  const pl=w.places,nd=w.cfg.needs,here=L.at[a],home=A.home[a],car=A.car[a]===1;
  // сон — только дома; валится с ног — спать, даже голодным
  if(L.fatigue[a]>=nd.sleepAt)return [ACT.SLEEP,home];
  // еда — где стоит, из своих запасов (перед обычным сном тоже поест)
  const hungry=L.hunger[a]>=nd.eatAt;
  if(hungry&&L.food[a]>0)return [ACT.EAT,here];
  if(isNight(h,[L.bed[a],L.wake[a]])&&L.fatigue[a]>=nd.sleepAtNight)return [ACT.SLEEP,home];
  // голоден, а еды нет — сначала магазин (с работы — перерыв на обед)
  if(hungry){const s=nearestShop(w,L,here,car,h);if(s>=0)return [ACT.SHOP,s]}
  // работа — на своём месте; выехать так, чтобы приехать к открытию
  const j=A.job[a];
  // на месте работы — вернуться к работе, если должен хотя бы 15 мин; ехать из другого места — если должен workMinOwed часов
  if(j>=0&&L.owed[a]>(here===j?0.25:nd.workMinOwed)){
    const tt=here===j?0:travelTime(w,here,j,car)/3600;
    if(h+tt>=L.open[j]&&h+tt<L.close[j]-0.5)return [ACT.WORK,j];
  }
  // магазин — когда дома мало еды
  if(L.food[a]<=nd.shopAt){const s=nearestShop(w,L,here,car,h);if(s>=0)return [ACT.SHOP,s]}
  return [ACT.IDLE,home];
}
// ближайший открытый магазин со свободным местом (выбор по полезности — этап 3)
function nearestShop(w,L,here,car,h){
  const pl=w.places;let best=-1,bt=Infinity;
  for(let p=0;p<pl.n;p++){if(pl.visitors[p]<=0||L.shoppers[p]>=pl.visitors[p])continue;
    const tt=p===here?0:travelTime(w,here,p,car);if(tt===Infinity||!isOpen(L,p,h+tt/3600))continue;
    if(tt<bt){bt=tt;best=p}}
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
      L.at[a]=L.to[a];L.to[a]=-1;L.act[a]=ACT.IDLE;
      const it=L.intent[a],p=L.at[a];
      if(it===ACT.SHOP&&(L.shoppers[p]>=w.places.visitors[p]||!isOpen(L,p,h))){}      // занято или закрыто — выберет снова
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
        if(L.hunger[a]>=nd.eatAt){if(L.food[a]>0){endAct(w,A,L,a);startAct(w,A,L,a,ACT.EAT);continue} // обед на работе
          if(nearestShop(w,L,p,A.car[a]===1,h)<0)continue;           // еды нет и купить негде — работает дальше
          endAct(w,A,L,a);}                                          // еды нет — за едой (см. выбор)
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
  const pl=w.places,s={home:0,sleep:0,travel:0,workLocal:0,workOutside:0,shopLocal:0,shopOutside:0,eat:0,outsideOther:0,localOther:0};
  for(let a=0;a<A.n;a++){
    const act=L.act[a],p=L.at[a],out=p>=0&&pl.kind[p]===KIND.OUTSIDE;
    if(act===ACT.TRAVEL)s.travel++;
    else if(act===ACT.SLEEP)s.sleep++;
    else if(act===ACT.WORK)out?s.workOutside++:s.workLocal++;
    else if(act===ACT.SHOP)out?s.shopOutside++:s.shopLocal++;
    else if(act===ACT.EAT)s.eat++;
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
    if(L.act[a]===ACT.SHOP)shop[L.at[a]]++;
    if(L.food[a]<0)throw new Error(`житель ${a}: еды меньше нуля`);
  }
  for(let p=0;p<pl.n;p++){
    if(shop[p]!==L.shoppers[p]||work[p]!==L.workers[p])throw new Error(`место ${p}: счётчики разошлись`);
    if(shop[p]>pl.visitors[p])throw new Error(`место ${p}: покупателей больше мест`);
    if(work[p]>pl.jobs[p])throw new Error(`место ${p}: работников больше мест`);
  }
}
