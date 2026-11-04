/*
 * Запуск без графики:
 *   node prototypes/life-sim/run.mjs [--seed 1] [--cars 20] [--outside-jobs 40] [--scene путь.json]
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createSim} from './sim.mjs';
import {census,formatCensus} from './census.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i>0?process.argv[i+1]:d};
const scene=arg('scene',path.join(here,'scenes/village.snapshot.json'));
const sim=createSim(JSON.parse(readFileSync(scene,'utf8')),{
  seed:+arg('seed',1),cars:+arg('cars',20),outside:{jobs:+arg('outside-jobs',40)}});
console.log(`seed ${sim.cfg.seed}`);
console.log(formatCensus(sim.world,census(sim.world,sim.agents)));
