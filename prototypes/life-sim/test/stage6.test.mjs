// Дорчол: реальный район, ~17 800 жителей, заведения из OpenStreetMap. Запуск: node --test 'prototypes/life-sim/test/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSim,advance,ticksPerDay} from '../sim.mjs';
import {census} from '../census.mjs';
import {KIND} from '../world.mjs';
import {ACT,MODE} from '../life.mjs';
import {PRESETS} from '../presets.mjs';

const snap=JSON.parse(readFileSync(new URL('../scenes/dorcol.snapshot.json',import.meta.url),'utf8'));
const make=(seed,over={})=>createSim(snap,{...PRESETS.dorcol.cfg,seed,...over});

test('Дорчол: жители, кафе, магазины и рабочие места из OSM, 4 выезда, дома со смешанным назначением',()=>{
  const sim=make(1),c=census(sim.world,sim.agents),pl=sim.world.places;
  assert.ok(c.residents>15000,`жителей ${c.residents}`);
  assert.equal(c.places.gates,4);
  assert.ok(c.places.cafes>100&&c.places.shops>30&&c.places.works>100,JSON.stringify(c.places));
  // в одном здании — и жильё, и заведения
  const byB=new Map();for(let p=0;p<pl.n;p++){if(pl.kind[p]===KIND.OUTSIDE)continue;const s=byB.get(pl.src[p])||new Set();s.add(pl.kind[p]);byB.set(pl.src[p],s)}
  assert.ok([...byB.values()].filter((s)=>s.has(KIND.HOME)&&s.size>1).length>100,'домов «внизу кафе, наверху квартиры»');
  assert.ok(pl.name.some((x)=>/«.+»/.test(x||'')),'у заведений настоящие названия');
  assert.ok(c.cars<=sim.traffic.slots.n,'машинам есть где стоять');
});

test('Дорчол: сутки с проверками на каждом шаге — без заторов-тупиков, все возвращаются домой',()=>{
  const sim=make(1);advance(sim,ticksPerDay(sim)+3*60,{check:true});
  const T=sim.traffic.stats,P=sim.peds.stats,L=sim.life,pl=sim.world.places;
  assert.equal(T.trips-T.arrivals,0,'все поездки на машине доехали');
  assert.equal(P.walks-P.arrivals,0,'все пешие дошли');
  // пользуются заведениями
  const eatOut=new Set(),bought=new Set();
  for(const e of L.log){if(e[2]===ACT.EAT&&pl.kind[e[3]]===KIND.CAFE)eatOut.add(e[3]);if(e[2]===ACT.SHOP&&pl.kind[e[3]]===KIND.SHOP)bought.add(e[3])}
  assert.ok(eatOut.size>L.cafeList.length*0.8,`кафе с гостями: ${eatOut.size} из ${L.cafeList.length}`);
  assert.ok(bought.size>20,`магазинов с покупателями: ${bought.size}`);
  // в Город — и пешком (дальше транспортом), и на машине; машины ждут пешеходов, пешеходы — машины
  const toCity=L.log.filter((e)=>e[2]===ACT.TRAVEL&&pl.kind[e[3]]===KIND.OUTSIDE);
  assert.ok(toCity.some((e)=>e[4]===MODE.WALK)&&toCity.some((e)=>e[4]===MODE.CAR));
  assert.ok(T.pedYield>0&&P.crossWaits>0);
});

test('Дорчол: три ночи подряд в 2:00 все дома, все машины у домов хозяев, на дорогах никого',()=>{
  // машина не «теряется»: кто уехал на ней, потом ходил пешком, домой возвращается за ней и на ней
  const sim=make(2),L=sim.life,A=sim.agents,T=sim.traffic,P=sim.peds;
  for(let d=1;d<=3;d++){
    advance(sim,d===1?26*60:24*60);
    let notHome=0,carAway=0;for(let a=0;a<A.n;a++){if(L.at[a]!==A.home[a])notHome++;if(A.car[a]&&L.carAt[a]!==A.home[a])carAway++}
    assert.equal(notHome,0,`ночь ${d}: не дома ${notHome}`);
    assert.equal(carAway,0,`ночь ${d}: машин не у дома хозяина ${carAway}`);
    assert.equal(T.active.length+P.active.length,0,`ночь ${d}: на улицах кто-то есть`);
  }
});
