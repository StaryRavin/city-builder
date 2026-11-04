// Отчёты по прожитым суткам: почасовая таблица и дневник жителя. Только чтение.
import {KIND} from './world.mjs';
import {ACT,ACT_NAME} from './life.mjs';

const hhmm=(tick,cfg)=>{const m=Math.round(tick*cfg.tickSeconds/60)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')};

export function hourlyTable(rows){
  const cols=[['sleep','спят'],['home','дома'],['travel','в пути'],['workLocal','раб.дер'],['workOutside','раб.гор'],
    ['shopLocal','маг.дер'],['shopOutside','маг.гор'],['eat','едят'],['localOther','ждут.дер'],['outsideOther','ждут.гор']];
  const out=['время  '+cols.map(c=>c[1].padStart(9)).join('')];
  for(const r of rows)out.push(r.time.padEnd(7)+cols.map(c=>String(r.s[c[0]]||'·').padStart(9)).join(''));
  return out.join('\n');
}

export function diary(w,A,L,a){
  const pl=w.places,cfg=w.cfg,out=[`Житель ${a}: дом — ${pl.name[A.home[a]]}, работа — ${A.job[a]>=0?pl.name[A.job[a]]:'нет'}, машина — ${A.car[a]?'есть':'нет'}`];
  for(const [t,ag,act,p] of L.log){if(ag!==a)continue;
    const where=p===A.home[a]?'дом':pl.name[p];
    out.push(`  день ${Math.floor(t*cfg.tickSeconds/86400)+1} ${hhmm(t,cfg)}  ${act===ACT.TRAVEL?'едет → '+where:ACT_NAME[act]+(act===ACT.IDLE||act===ACT.SLEEP?'':' — '+where)}`);}
  return out.join('\n');
}
