// Пешеходы. Запуск: node --test 'prototypes/life-sim/test/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSim,advance,ticksPerDay} from '../sim.mjs';
import {KIND} from '../world.mjs';
import {ACT,MODE} from '../life.mjs';
import {CAR} from '../traffic.mjs';

const load=(f)=>JSON.parse(readFileSync(new URL('../scenes/'+f,import.meta.url),'utf8'));
const week=(seed,f='village.snapshot.json',cfg={})=>{const sim=createSim(load(f),{seed,...cfg});advance(sim,7*ticksPerDay(sim),{check:true});return sim};

test('в Город — только на машине; по деревне ходят пешком, а кто живёт дальше своего порога — едет',()=>{
  const sim=week(1),pl=sim.world.places,trips=sim.life.log.filter((e)=>e[2]===ACT.TRAVEL);
  const walks=trips.filter((e)=>e[4]===MODE.WALK),drives=trips.filter((e)=>e[4]===MODE.CAR);
  assert.ok(walks.length>0,'кто-то ходит пешком');
  for(const e of walks)assert.notEqual(pl.kind[e[3]],KIND.OUTSIDE,'пешком в Город не ходят');
  assert.ok(drives.some((e)=>pl.kind[e[3]]!==KIND.OUTSIDE),'по деревне кто-то и ездит');
  assert.ok(walks.some((e)=>pl.kind[e[3]]===KIND.SHOP)&&walks.some((e)=>pl.kind[e[3]]===KIND.WORK),'пешком — и в лавку, и на работу');
});

test('скорость пешехода — 1.3 м/с: время в пути не меньше длины пути / 1.3 и ненамного больше',()=>{
  const sim=week(2),v=sim.cfg.speed.walk;
  assert.ok(sim.peds.log.length>20);
  for(const [a,len,sec] of sim.peds.log){
    assert.ok(sec>=len/v-1,`житель ${a}: ${len.toFixed(0)} м за ${sec} с — быстрее пешехода`);
    assert.ok(sec<=len/v+180,`житель ${a}: ${len.toFixed(0)} м за ${sec} с — слишком долго`);
  }
  assert.ok(sim.cfg.speed.walk<sim.cfg.speed.car/4);
});

test('пешеходы не проходят сквозь дома и машины: сутки, каждые 0.5 с',()=>{
  for(const seed of [1,3]){
    const sim=createSim(load('village.snapshot.json'),{seed}),T=sim.traffic,S=sim.peds,n=sim.agents.n;let seen=0;
    const inPoly=(p,poly)=>{let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c}return c};
    for(let i=0;i<24*60*120;i++){
      sim.carry+=0.5;advance(sim,0,{check:true});
      for(let a=0;a<n;a++){const P=S.pose(a);if(!P)continue;seen++;
        for(let k=0;k<sim.world.outlines.length;k++){const o=sim.world.outlines[k];if(o.length>=3&&inPoly([P.x,P.y],o))assert.fail(`seed ${seed}: пешеход ${a} внутри дома ${k}`)}
        for(let c=0;c<n;c++){const Q=T.pose(c);if(!Q||Math.hypot(Q.x-P.x,Q.y-P.y)>4)continue;
          if(inPoly([P.x,P.y],T.carRect([Q.x,Q.y],Q.h,0.2)))assert.fail(`seed ${seed}, ${(T.time/3600).toFixed(3)} ч: пешеход ${a} в машине ${c} (${T.state[c]})`)}}
    }
    assert.ok(seen>100,'пешеходы были на улице');
  }
});

test('зебры: пешеходы переходят по ним, машины их пропускают, а пешеходы ждут машины',()=>{
  // проверка «на зебре с пешеходом нет машины» идёт на каждом шаге (check); здесь — что это всё случалось
  const sim=week(1,'village100.snapshot.json',{cars:60}),S=sim.peds.stats,T=sim.traffic.stats;
  assert.ok(S.crossings>20,`переходов ${S.crossings}`);
  assert.ok(T.pedYield>0,'машины ждали пешеходов на зебре');
});

test('пешеход не ступает на зебру, на которой машина, и переходит, когда она уехала',()=>{
  const sim=createSim(load('village.snapshot.json'),{seed:1}),T=sim.traffic,S=sim.peds,pl=sim.world.places;
  advance(sim,3*60);                                         // ночь: все дома, машины стоят
  // пара мест, путь между которыми идёт через зебру
  let pick=null;
  for(let p=0;p<pl.n&&!pick;p++)for(let q=0;q<pl.n&&!pick;q++){if(p===q)continue;const r=S.route(p,q);if(!r)continue;const k=r.pts.findIndex((x)=>x.cross>=0);if(k>0)pick={p,q,cross:r.pts[k].cross}}
  assert.ok(pick,'есть путь через зебру');
  const e=pick.cross>>1,v=pick.cross&1?sim.world.edges.b[e]:sim.world.edges.a[e],li=T.lanes.to[2*e]===v?2*e:2*e+1;
  // машина 9 (стоит дома) — ставим на полосу прямо на зебру
  const car=9,slot=T.slot[car];T.slots.occ[slot]=-1;T.slot[car]=-1;T.state[car]=CAR.LANE;T.lane[car]=li;T.s[car]=T.lanes.len[li]-1;T.lanes.cars[li].push(car);
  assert.equal(T.crossClear(v,e),false);
  sim.life.act[0]=ACT.TRAVEL;sim.life.arrive[0]=2147483647;sim.life.mode[0]=MODE.WALK;S.startWalk(0,pick.p,pick.q);
  for(let i=0;i<240;i++)S.step(0.5);                         // 2 минуты — машина стоит
  assert.equal(S.state[0],2,'пешеход ждёт у зебры');assert.equal(S.crossN[pick.cross],0);
  T.lanes.cars[li].splice(T.lanes.cars[li].indexOf(car),1);T.state[car]=CAR.PARKED;T.slot[car]=slot;T.slots.occ[slot]=car;T.lane[car]=-1;
  assert.equal(T.crossClear(v,e),true);
  let crossed=false;for(let i=0;i<600&&S.state[0]!==0;i++){S.step(0.5);if(S.state[0]===3)crossed=true}
  assert.ok(crossed,'перешёл по зебре');assert.equal(S.state[0],0,'дошёл');
});

test('машина и её хозяин: кто пришёл пешком, его машина стоит там, где он её оставил',()=>{
  const sim=week(4),L=sim.life,T=sim.traffic,pl=sim.world.places;
  for(let a=0;a<sim.agents.n;a++){
    if(T.state[a]===CAR.PARKED){const sl=T.slot[a],p=L.carAt[a];assert.ok(Math.hypot(T.slots.x[sl]-pl.x[p],T.slots.y[sl]-pl.y[p])<30)}
    if(T.state[a]===CAR.CITY)assert.equal(pl.kind[L.carAt[a]],KIND.OUTSIDE);
  }
});
