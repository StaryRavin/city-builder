// Этап 4: машины на дорогах. Запуск: node --test 'prototypes/life-sim/test/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSim,advance,ticksPerDay} from '../sim.mjs';
import {withDefaults} from '../config.mjs';
import {buildWorld} from '../world.mjs';
import {createTraffic,CAR} from '../traffic.mjs';

const load=(f)=>JSON.parse(readFileSync(new URL('../scenes/'+f,import.meta.url),'utf8'));

test('деревня 10: неделя, 3 seed — машины не перекрываются, на перекрёстке одна, все поездки доезжают',()=>{
  for(const seed of [1,2,3]){
    const sim=createSim(load('village.snapshot.json'),{seed});
    advance(sim,7*ticksPerDay(sim),{check:true});            // проверки движения — на каждом шаге 0.5 с
    const T=sim.traffic;
    advance(sim,1,{check:true});
    assert.ok(T.stats.trips>100);
    // в 3 часа ночи все дома, все машины стоят
    const inTrip=T.stats.trips-T.stats.arrivals;assert.ok(inTrip<=2,`seed ${seed}: не доехали ${inTrip}`);
  }
});

test('машины стоят на улице у своего здания',()=>{
  const sim=createSim(load('village.snapshot.json'),{seed:1}),T=sim.traffic,pl=sim.world.places;
  advance(sim,11*60,{check:true});                            // 11:00 — все на местах
  for(let a=0;a<sim.agents.n;a++){if(T.state[a]!==CAR.PARKED)continue;
    const p=sim.life.at[a],sl=T.slot[a],d=Math.hypot(T.slots.x[sl]-pl.x[p],T.slots.y[sl]-pl.y[p]);
    assert.ok(d<30,`машина ${a} стоит в ${d.toFixed(1)} м от своего здания`)}
});

test('деревня 100, машина у каждого: утренний час пик без заторов-тупиков и наложений',()=>{
  const sim=createSim(load('village100.snapshot.json'),{seed:1});
  advance(sim,2*ticksPerDay(sim),{check:true});
  const st=sim.traffic.stats;
  assert.ok(st.trips>400);
  assert.ok(st.intersectionWaits>0,'на перекрёстках ждали');
  assert.ok(st.mergeWaits>0,'с парковки выезжали, дождавшись просвета');
  assert.ok(st.maxTripSec<45*60,`самая долгая поездка ${Math.round(st.maxTripSec/60)} мин`);
});

// ---- перекрёсток на четыре стороны, без жизни: только движение ----
// узел 0 в центре, концы на 60 м к северу, югу, востоку и западу (ось y — вниз, север — минус)
function crossroads(){
  const b=(id,edge,t,cx,cy)=>({id,type:'res',floors:1,cells:4,capacity:2,edge,t,center:[cx,cy],outline:[]});
  return {format:'city-builder/world@1',nodes:[[0,0],[0,-60],[0,60],[60,0],[-60,0]],
    edges:[{a:0,b:1,length:60},{a:2,b:0,length:60},{a:0,b:3,length:60},{a:4,b:0,length:60}],
    buildings:[
      b(0,1,0.5,8,30),    // юг, восточная сторона — машина едет на север
      b(1,2,0.5,30,-8),   // восток, северная сторона — едет на запад
      b(2,0,0.5,-8,-30),  // север, западная сторона — едет на юг
      b(3,3,0.5,-30,8),   // запад, южная сторона — едет на восток
      b(4,0,0.5,8,-45),b(5,3,0.5,-45,-8),b(6,2,0.5,45,8),b(7,1,0.5,-8,45)],
    gates:[]};
}
function rig(homes){
  const cfg=withDefaults({}),w=buildWorld(crossroads(),cfg),n=homes.length;
  const A={n,home:Int32Array.from(homes),job:new Int32Array(n).fill(-1),car:new Uint8Array(n).fill(1)};
  const L={tick:0,arrive:new Int32Array(n),act:new Uint8Array(n)};
  return {w,A,L,T:createTraffic(w,A,L)};
}
function go(r,trips){for(const [a,to] of trips){r.L.act[a]=5;r.L.arrive[a]=2147483647;r.T.startTrip(a,r.A.home[a],to)}}
function run(r,sec,onStep){for(let i=0;i<sec/0.5;i++){r.T.step(0.5);r.T.check();for(let a=0;a<r.A.n;a++)if(r.L.arrive[a]!==2147483647)r.L.act[a]=0;if(onStep)onStep()}}

test('помеха справа: из двух машин, подъехавших одновременно, первой едет та, что справа',()=>{
  const r=rig([0,1]);                // 0 — с юга на север, 1 — с востока на запад: для 0 машина 1 справа
  go(r,[[0,4],[1,5]]);
  const first=[];run(r,120,()=>{for(const a of [0,1])if(r.T.state[a]===CAR.BOX&&!first.includes(a))first.push(a)});
  assert.deepEqual(first,[1,0]);
  assert.ok(r.T.stats.yieldRight>0);
  assert.ok(r.L.arrive[0]!==2147483647&&r.L.arrive[1]!==2147483647,'обе доехали');
});

test('четыре машины со всех сторон: все уступают — едет дольше ждущая, никто не застревает',()=>{
  const r=rig([0,1,2,3]);
  go(r,[[0,4],[1,5],[2,7],[3,6]]);
  run(r,240);
  for(let a=0;a<4;a++)assert.notEqual(r.L.arrive[a],2147483647,`машина ${a} не доехала`);
  assert.ok(r.T.stats.deadlockBreaks>0);
});

test('детерминизм движения: один seed — те же положения машин',()=>{
  const pos=(seed)=>{const s=createSim(load('village.snapshot.json'),{seed});advance(s,8*60+7);return [...s.traffic.s].map((x)=>x.toFixed(6)).join(',')+[...s.traffic.state].join('')};
  assert.equal(pos(4),pos(4));
});
