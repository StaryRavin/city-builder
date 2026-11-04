// Сборка симуляции из снимка и настроек. Без графики и без DOM.
import {withDefaults} from './config.mjs';
import {makeRng} from './rng.mjs';
import {buildWorld} from './world.mjs';
import {createPopulation} from './population.mjs';
import {createLife,step,snapshot,checkInvariants} from './life.mjs';

export function createSim(snapshot,cfg={}){
  const c=withDefaults(cfg),rng=makeRng(c.seed);
  const world=buildWorld(snapshot,c);
  const agents=createPopulation(world,rng);
  const life=createLife(world,agents,rng);
  return {cfg:c,rng,world,agents,life};
}
// прожить ticks тиков; onTick(sim) — после каждого (для отчётов и проверок)
export function advance(sim,ticks,{check=false,onTick}={}){
  for(let i=0;i<ticks;i++){step(sim.world,sim.agents,sim.life);if(check)checkInvariants(sim.world,sim.agents,sim.life);if(onTick)onTick(sim)}
}
export const ticksPerDay=(sim)=>Math.round(86400/sim.cfg.tickSeconds);
export {snapshot};
