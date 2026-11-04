// Этап 2: часы и потребности. Запуск: node --test 'prototypes/life-sim/test/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSim,advance,ticksPerDay} from '../sim.mjs';
import {ACT,hourOf} from '../life.mjs';
import {KIND} from '../world.mjs';

const snap=JSON.parse(readFileSync(new URL('../scenes/village.snapshot.json',import.meta.url),'utf8'));
const DAYS=4;

// прожить DAYS суток с проверкой инвариантов на каждом тике и собрать статистику
function live(seed){
  const sim=createSim(snap,{seed}),T=ticksPerDay(sim),n=sim.agents.n;
  const st={workTicks:[...Array(DAYS)].map(()=>new Int32Array(n)),at3:[],at11:[],maxHunger:0};
  advance(sim,DAYS*T,{check:true,onTick:(s)=>{
    const L=s.life,d=Math.floor((L.tick-1)/T),h=hourOf({tick:L.tick-1},s.cfg);
    for(let a=0;a<n;a++){if(L.act[a]===ACT.WORK)st.workTicks[d][a]++;st.maxHunger=Math.max(st.maxHunger,L.hunger[a])}
    if(L.tick%T===3*60)st.at3.push([...L.act]);
    if(L.tick%T===11*60)st.at11.push([...L.act]);
  }});
  return {sim,st,T};
}

test('инварианты держатся на каждом тике четырёх суток (каждый в одном состоянии, места не переполнены)',()=>{
  for(const seed of [1,2,3])live(seed);
});

test('ночью (3:00) все спят дома',()=>{
  const {st}=live(1);
  for(const acts of st.at3)assert.ok(acts.every((x)=>x===ACT.SLEEP));
});

test('утром выходят из домов: каждый работник уезжает на работу между 6 и 10',()=>{
  const {sim,T}=live(1),{agents:A,life:L,cfg}=sim;
  for(let d=0;d<DAYS;d++)for(let a=0;a<A.n;a++){if(A.job[a]<0)continue;
    const left=L.log.some(([t,ag,act,p])=>ag===a&&act===ACT.TRAVEL&&p===A.job[a]&&t>=d*T+6*60&&t<d*T+10*60);
    assert.ok(left,`житель ${a}, день ${d+1}: не уехал на работу утром`);}
});

test('днём (11:00) места работы заполнены: на работе все работники',()=>{
  const {sim,st}=live(1);
  const workers=[...sim.agents.job].filter((j)=>j>=0).length;
  for(const acts of st.at11){const atWork=acts.filter((x)=>x===ACT.WORK||x===ACT.EAT).length;assert.equal(atWork,workers)}
});

test('вечером магазины: каждый день покупки после работы (15–20), ночью покупок нет',()=>{
  const {sim,T}=live(1),L=sim.life;
  const shops=L.log.filter(([,, act])=>act===ACT.SHOP);
  for(let d=0;d<DAYS;d++)assert.ok(shops.some(([t])=>t>=d*T+15*60&&t<d*T+20*60),`день ${d+1}: нет вечерних покупок`);
  for(const [t,,,p] of shops){const h=(t%T)/60;assert.ok(h>=sim.life.open[p]&&h<sim.life.close[p],'покупка в закрытом магазине')}
});

test('ходят и в магазин деревни, и в магазины внешнего мира',()=>{
  const {sim}=live(1),pl=sim.world.places;
  const kinds=new Set(sim.life.log.filter(([,, act])=>act===ACT.SHOP).map(([,,,p])=>pl.kind[p]));
  assert.ok(kinds.has(KIND.SHOP));assert.ok(kinds.has(KIND.OUTSIDE));
});

test('работают около 8 часов в сутки',()=>{
  const {st}=live(1);
  for(let d=1;d<DAYS;d++)for(const ticks of st.workTicks[d]){const h=ticks/60;assert.ok(h>=6&&h<=10,`работал ${h.toFixed(1)} ч`)}
});

test('никто не голодает дольше ~4 часов: неделя, 5 seed',()=>{
  // голод растёт на 0.2 в час, ест при 0.6: 1.4 — четыре часа голодным (например, утром
  // еды нет, а магазин деревни ещё закрыт — едет в город)
  for(const seed of [1,2,3,4,5]){
    const sim=createSim(snap,{seed});let mx=0;
    advance(sim,7*ticksPerDay(sim),{check:true,onTick:(s)=>{for(let a=0;a<s.agents.n;a++)mx=Math.max(mx,s.life.hunger[a])}});
    assert.ok(mx<1.4,`seed ${seed}: голод дошёл до ${mx.toFixed(2)}`);
  }
});

test('детерминизм: один seed — тот же дневник, другой seed — другой',()=>{
  const a=live(5).sim.life.log,b=live(5).sim.life.log,c=live(6).sim.life.log;
  assert.deepEqual(a,b);assert.notDeepEqual(a,c);
});
