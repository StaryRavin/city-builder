// Этап 1: данные. Запуск: node --test 'prototypes/life-sim/test/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSim} from '../sim.mjs';
import {census} from '../census.mjs';
import {KIND,distance,travelTime} from '../world.mjs';

// деревня на 100 жителей, машина у 20 — проверяет учёт там, где работы не хватает
const snap=JSON.parse(readFileSync(new URL('../scenes/village100.snapshot.json',import.meta.url),'utf8'));

test('деревня: 100 жителей в 100 местах, 20 машин',()=>{
  const {world,agents}=createSim(snap,{seed:1,cars:20});
  const c=census(world,agents);
  assert.equal(c.residents,100);assert.equal(c.beds,100);assert.equal(c.cars,20);
  assert.equal(c.places.gates,1);
});

test('учёт работы сходится: работающие + безработные = жители, вакансии = места − занятые',()=>{
  for(const seed of [1,2,3,42]){
    const {world,agents}=createSim(snap,{seed,cars:20});
    const c=census(world,agents);
    assert.equal(c.employed.local+c.employed.outside+c.unemployed,c.residents);
    assert.equal(c.vacancies.local,c.jobs.local-c.employed.local);
    assert.equal(c.vacancies.outside,c.jobs.outside-c.employed.outside);
    assert.equal(c.overfull,0,'ни одно место не переполнено');
  }
});

test('без машины наружу не ездят; безработный при свободной вакансии — только тот, кому до неё не добраться',()=>{
  const {world,agents}=createSim(snap,{seed:7,cars:20});
  const pl=world.places;
  for(let a=0;a<agents.n;a++){
    const j=agents.job[a];
    if(j>=0&&pl.kind[j]===KIND.OUTSIDE)assert.equal(agents.car[a],1);
  }
  const c=census(world,agents);
  if(c.vacancies.outside>0)assert.equal(c.unemployedWithCar,0);
  if(c.vacancies.local>0)assert.equal(c.unemployed,0);
});

test('расстояния по дорогам: симметричны, на одном звене — по прямой, ворота дальше на путь за воротами',()=>{
  const {world}=createSim(snap,{cars:20});
  const pl=world.places;
  for(let p=0;p<pl.n;p++)for(let q=0;q<pl.n;q++)assert.ok(Math.abs(distance(world,p,q)-distance(world,q,p))<1e-9);
  const gate=[...Array(pl.n).keys()].find((p)=>pl.kind[p]===KIND.OUTSIDE);
  assert.ok(travelTime(world,0,gate,true)>=world.cfg.outside.minutesBeyondGate*60);
  assert.equal(travelTime(world,0,gate,false),Infinity);
});

test('детерминизм: один seed — одинаковый результат, другой seed — другие машины',()=>{
  const a=createSim(snap,{seed:5,cars:20}).agents,b=createSim(snap,{seed:5,cars:20}).agents,c=createSim(snap,{seed:6,cars:20}).agents;
  assert.deepEqual(a.car,b.car);assert.deepEqual(a.job,b.job);assert.deepEqual(a.home,b.home);
  assert.notDeepEqual(a.car,c.car);
});

test('деревня 10: у каждого свой дом и машина, работы в деревне меньше, чем жителей',()=>{
  const s10=JSON.parse(readFileSync(new URL('../scenes/village.snapshot.json',import.meta.url),'utf8'));
  const {world,agents}=createSim(s10,{seed:1});
  const c=census(world,agents);
  assert.equal(c.residents,10);assert.equal(c.places.homes,10);assert.equal(c.cars,10);
  assert.ok(c.jobs.local<c.residents);
  assert.equal(c.unemployed,0);assert.equal(c.employed.local,c.jobs.local);
});
