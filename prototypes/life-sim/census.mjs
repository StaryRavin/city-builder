// Перепись: жильё, работа, вакансии, машины, путь до работы. Только чтение.
import {KIND,travelTime} from './world.mjs';

export function census(w,A){
  const pl=w.places,filled=new Int32Array(pl.n),living=new Int32Array(pl.n);
  for(let a=0;a<A.n;a++){living[A.home[a]]++;if(A.job[a]>=0)filled[A.job[a]]++}
  const c={residents:A.n,beds:0,cars:0,
    jobs:{local:0,outside:0},employed:{local:0,outside:0},vacancies:{local:0,outside:0},
    unemployed:0,unemployedWithCar:0,unemployedNoCar:0,commuteMin:{avg:0,max:0},
    places:{homes:0,shops:0,works:0,gates:0},shopVisitors:0,roadKm:0,overfull:0};
  for(let p=0;p<pl.n;p++){
    const k=pl.kind[p],out=k===KIND.OUTSIDE?'outside':'local';
    c.beds+=pl.beds[p];
    if(pl.jobs[p]>0){c.jobs[out]+=pl.jobs[p];c.employed[out]+=filled[p];c.vacancies[out]+=pl.jobs[p]-filled[p]}
    if(filled[p]>pl.jobs[p]||living[p]>pl.beds[p])c.overfull++;
    c.places[['homes','shops','works','gates'][k]]++;
    if(k===KIND.SHOP)c.shopVisitors+=pl.visitors[p];
  }
  let sum=0,n=0;
  for(let a=0;a<A.n;a++){
    c.cars+=A.car[a];
    if(A.job[a]<0){c.unemployed++;if(A.car[a])c.unemployedWithCar++;else c.unemployedNoCar++;continue}
    const t=travelTime(w,A.home[a],A.job[a],A.car[a]===1)/60;sum+=t;n++;if(t>c.commuteMin.max)c.commuteMin.max=t;
  }
  c.commuteMin.avg=n?sum/n:0;
  for(let e=0;e<w.edges.n;e++)c.roadKm+=w.edges.len[e]/1000;
  return c;
}

export function formatCensus(w,c){
  const f=(x)=>Math.round(x*10)/10;
  return [
    `${w.name}: дорог ${f(c.roadKm*1000)} м, ворот ${c.places.gates}`,
    `Места: жилых домов ${c.places.homes} (мест ${c.beds}), магазинов ${c.places.shops} (покупателей одновременно ${c.shopVisitors}), рабочих домов ${c.places.works}`,
    `Жителей ${c.residents}, с машиной ${c.cars}`,
    `Рабочих мест: в деревне ${c.jobs.local}, снаружи ${c.jobs.outside}`,
    `Работают: в деревне ${c.employed.local}, снаружи ${c.employed.outside}`,
    `Безработных ${c.unemployed} (с машиной ${c.unemployedWithCar}, без машины ${c.unemployedNoCar})`,
    `Свободных вакансий: в деревне ${c.vacancies.local}, снаружи ${c.vacancies.outside}`,
    `Путь до работы: в среднем ${f(c.commuteMin.avg)} мин, максимум ${f(c.commuteMin.max)} мин`,
  ].join('\n');
}
