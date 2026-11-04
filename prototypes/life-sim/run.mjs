/*
 * Запуск без графики:
 *   node prototypes/life-sim/run.mjs [--seed 1] [--days 1] [--diary 0] [--cars N] [--outside-jobs 40] [--scene путь.json]
 * Печатает перепись, почасовую таблицу (что делают жители в начале каждого
 * часа) и дневник одного жителя.
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createSim,advance,ticksPerDay,snapshot} from './sim.mjs';
import {census,formatCensus} from './census.mjs';
import {hourlyTable,diary} from './report.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i>0?process.argv[i+1]:d};
const scene=arg('scene',path.join(here,'scenes/village.snapshot.json'));
const sim=createSim(JSON.parse(readFileSync(scene,'utf8')),{
  seed:+arg('seed',1),cars:arg('cars',null)==null?null:+arg('cars'),outside:{jobs:+arg('outside-jobs',40)}});
console.log(`seed ${sim.cfg.seed}`);
console.log(formatCensus(sim.world,census(sim.world,sim.agents)));
const days=+arg('days',1),perHour=Math.round(3600/sim.cfg.tickSeconds);
for(let d=0;d<days;d++){
  const rows=[];
  for(let hr=0;hr<24;hr++){
    rows.push({time:String(hr).padStart(2,'0')+':00',s:snapshot(sim.world,sim.agents,sim.life)});
    advance(sim,perHour,{check:true});   // инварианты проверяются на каждом тике
  }
  console.log(`\nДень ${d+1} — что делают жители в начале часа (д. — деревня, гор. — внешний мир)`);
  console.log(hourlyTable(rows));
}
const who=arg('diary',null);
if(who!=null)console.log('\n'+diary(sim.world,sim.agents,sim.life,+who));
