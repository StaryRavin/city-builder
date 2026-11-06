/*
 * Запуск без графики:
 *   node prototypes/life-sim/run.mjs [--preset village|village100|dorcol] [--seed 1] [--days 1] [--diary 0] [--cars N] [--outside-jobs N] [--scene путь.json]
 * Печатает перепись, почасовую таблицу (что делают жители в начале каждого
 * часа) и дневник одного жителя.
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createSim,advance,ticksPerDay,snapshot} from './sim.mjs';
import {census,formatCensus} from './census.mjs';
import {hourlyTable,diary} from './report.mjs';
import {PRESETS} from './presets.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const arg=(k,d)=>{const i=process.argv.indexOf('--'+k);return i>0?process.argv[i+1]:d};
// --preset village | village100 | dorcol — снимок и настройки сцены; --scene — свой снимок
const pre=PRESETS[arg('preset','village')];if(!pre)throw new Error('нет такой сцены: '+arg('preset'));
const scene=arg('scene',path.join(here,'scenes',pre.file));
const over={seed:+arg('seed',1)};if(arg('cars',null)!=null)over.cars=+arg('cars');if(arg('outside-jobs',null)!=null)over.outside={...pre.cfg.outside,jobs:+arg('outside-jobs')};
const sim=createSim(JSON.parse(readFileSync(scene,'utf8')),{...pre.cfg,...over});
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
