/*
 * Жители — пачка массивов, индекс = номер жителя:
 *   home — место (жилой дом), где живёт;
 *   job  — место работы (магазин, рабочий дом, внешний мир) или -1;
 *   car  — 1, если есть машина.
 *
 * Расселение: по жилым домам по порядку, пока есть места.
 * Машины: у cfg.cars случайных жителей (по seed).
 * Работа (временное правило этапа 1, на этапе 3 заменится выбором по
 * полезности): жители в случайном порядке берут ближайшую по времени пути
 * свободную вакансию из тех, куда могут добраться; нет такой — безработный.
 */
import {KIND,travelTime} from './world.mjs';

export function createPopulation(w,rng){
  const pl=w.places,cfg=w.cfg;
  let beds=0;for(let p=0;p<pl.n;p++)beds+=pl.beds[p];
  const n=cfg.population==null?beds:Math.min(cfg.population,beds);
  const A={n,home:new Int32Array(n),job:new Int32Array(n).fill(-1),car:new Uint8Array(n)};
  // расселение
  let a=0;
  for(let p=0;p<pl.n&&a<n;p++)for(let k=0;k<pl.beds[p]&&a<n;k++)A.home[a++]=p;
  // машины
  const order=rng.shuffle([...Array(n).keys()]);
  for(let i=0;i<Math.min(cfg.cars,n);i++)A.car[order[i]]=1;
  assignJobs(w,A,rng);
  return A;
}

export function assignJobs(w,A,rng){
  const pl=w.places,taken=new Int32Array(pl.n);
  const workplaces=[];for(let p=0;p<pl.n;p++)if(pl.jobs[p]>0)workplaces.push(p);
  for(const a of rng.shuffle([...Array(A.n).keys()])){
    let best=-1,bt=Infinity;
    for(const p of workplaces){if(taken[p]>=pl.jobs[p])continue;
      const t=travelTime(w,A.home[a],p,A.car[a]===1);if(t<bt){bt=t;best=p}}
    A.job[a]=best;if(best>=0)taken[best]++;
  }
}
