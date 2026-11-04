// Сборка симуляции из снимка и настроек. Без графики и без DOM.
import {withDefaults} from './config.mjs';
import {makeRng} from './rng.mjs';
import {buildWorld} from './world.mjs';
import {createPopulation} from './population.mjs';
import {createLife,step,snapshot,checkInvariants} from './life.mjs';
import {createTraffic} from './traffic.mjs';

export function createSim(snapshot,cfg={}){
  const c=withDefaults(cfg),rng=makeRng(c.seed);
  const world=buildWorld(snapshot,c);
  const agents=createPopulation(world,rng);
  const life=createLife(world,agents,rng);
  const traffic=c.traffic.on?createTraffic(world,agents,life):null;
  return {cfg:c,rng,world,agents,life,traffic,sub:0,carry:0};
}
/*
 * Время идёт шагами движения по dt секунд (0.5 с); в начале каждой игровой
 * минуты — шаг жизни (решения жителей). Пока машин в пути нет, шаги движения
 * пропускаются до следующей минуты — это ничего не меняет, но быстро.
 */
function subPerTick(sim){return Math.round(sim.cfg.tickSeconds/(sim.traffic?sim.cfg.traffic.dt:sim.cfg.tickSeconds))}
function subStep(sim,{check,onTick}){
  const per=subPerTick(sim),T=sim.traffic;
  if(sim.sub%per===0){
    step(sim.world,sim.agents,sim.life);
    if(T)for(const a of sim.life.trips.splice(0))T.startTrip(a,sim.life.from[a],sim.life.to[a]);
    if(check)checkInvariants(sim.world,sim.agents,sim.life);
    if(onTick)onTick(sim);
  }
  if(T){T.step(sim.cfg.traffic.dt);if(check)T.check()}
  sim.sub++;
}
// прожить sec игровых секунд (можно дробно — остаток копится)
export function advanceSeconds(sim,sec,opts={}){
  const dt=sim.traffic?sim.cfg.traffic.dt:sim.cfg.tickSeconds,per=subPerTick(sim);
  sim.carry+=sec;
  while(sim.carry>=dt-1e-9){
    if(sim.traffic&&sim.sub%per!==0&&!sim.traffic.busy()&&sim.carry>=(per-sim.sub%per)*dt){ // пусто — сразу к следующей минуте
      const k=per-sim.sub%per;sim.traffic.time+=k*dt;sim.sub+=k;sim.carry-=k*dt;continue}
    subStep(sim,opts);sim.carry-=dt;
  }
}
// прожить ticks игровых минут; onTick(sim) — после шага жизни каждой минуты
export function advance(sim,ticks,opts={}){advanceSeconds(sim,ticks*sim.cfg.tickSeconds,opts)}
// игровое время, секунды
export const simSeconds=(sim)=>sim.traffic?sim.sub*sim.cfg.traffic.dt:sim.sub*sim.cfg.tickSeconds;
export const ticksPerDay=(sim)=>Math.round(86400/sim.cfg.tickSeconds);
export {snapshot};
