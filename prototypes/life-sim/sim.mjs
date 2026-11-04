// Сборка симуляции из снимка и настроек. Без графики и без DOM.
import {withDefaults} from './config.mjs';
import {makeRng} from './rng.mjs';
import {buildWorld} from './world.mjs';
import {createPopulation} from './population.mjs';

export function createSim(snapshot,cfg={}){
  const c=withDefaults(cfg),rng=makeRng(c.seed);
  const world=buildWorld(snapshot,c);
  const agents=createPopulation(world,rng);
  return {cfg:c,rng,world,agents};
}
