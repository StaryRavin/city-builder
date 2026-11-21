// Сохранения: миграции между версиями и загрузка в игре.
// Запуск: node --test prototypes/app/test/*.test.mjs   (браузерные проверки — если есть playwright)
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url);
const here=path.dirname(fileURLToPath(import.meta.url));
const Saves=require('../saves.js');
const fixture=(f)=>JSON.parse(readFileSync(path.join(here,'fixtures',f),'utf8'));

test('старое сохранение (схема 1, из браузера) переводится в текущую схему',()=>{
  const old=fixture('save-v1.json'),before=JSON.stringify(old);
  assert.equal(Saves.schemaOf(old),1);
  const m=Saves.migrate(old);
  assert.ok(m.ok,JSON.stringify(m));
  assert.equal(m.from,1);
  assert.deepEqual(m.steps,['1→2']);
  assert.deepEqual(Saves.check(m.data),[]);
  // у всех домов зон появился стиль фасада; число домов, дорог и деньги — те же
  const zoned=m.data.ed.lots.filter((l)=>l.b&&['r','h','c','i','o'].includes(l.b.z));
  assert.ok(zoned.length>0);
  assert.ok(zoned.every((l)=>Number.isInteger(l.style)));
  assert.equal(m.data.ed.lots.length,old.ed.lots.length);
  assert.equal(Object.keys(m.data.ed.segs).length,Object.keys(old.ed.segs).length);
  assert.equal(m.data.S.money,old.S.money);
  assert.equal(JSON.stringify(old),before,'исходные данные не изменились');
});
test('миграция детерминирована: одно сохранение — тот же город',()=>{
  const a=Saves.migrate(fixture('save-v1.json')),b=Saves.migrate(fixture('save-v1.json'));
  assert.equal(JSON.stringify(a.data),JSON.stringify(b.data));
});
test('файл текущей схемы читается как есть',()=>{
  const m1=Saves.migrate(fixture('save-v1.json'));
  const file=Saves.make(m1.data,{app:'0.4.0',name:'Тест',meta:{day:3}});
  assert.equal(file.format,'city-builder-save');assert.equal(file.schema,Saves.SCHEMA);
  const m2=Saves.migrate(JSON.parse(JSON.stringify(file)));
  assert.ok(m2.ok);assert.deepEqual(m2.steps,[]);assert.equal(m2.name,'Тест');
  assert.equal(JSON.stringify(m2.data),JSON.stringify(m1.data));
});
test('сохранение новее игры не открывается',()=>{
  const f=Saves.make({ed:{},S:{}},{app:'9.0.0'});f.schema=Saves.SCHEMA+1;
  const m=Saves.migrate(f);assert.equal(m.ok,false);assert.equal(m.reason,'newer');assert.equal(m.app,'9.0.0');
});
test('чужой и повреждённый файл — понятный отказ',()=>{
  assert.equal(Saves.migrate({hello:1}).reason,'unknown');
  assert.equal(Saves.migrate(null).reason,'unknown');
  const bad=fixture('save-v1.json');delete bad.S.money;
  const m=Saves.migrate(bad);assert.equal(m.reason,'broken');assert.ok(m.errors.some((e)=>/казн/.test(e)));
  const bad2=fixture('save-v1.json');const id=Object.keys(bad2.ed.segs)[0];bad2.ed.segs[id].a=999999;
  assert.equal(Saves.migrate(bad2).reason,'broken');
});
test('у каждой прошлой схемы есть шаг миграции',()=>{
  for(let v=1;v<Saves.SCHEMA;v++)assert.equal(typeof Saves.MIGRATIONS[v],'function',`нет шага ${v}→${v+1}`);
});

// ---- в игре (собранная страница prototypes/app/index.html) ----
let chromium=null;try{({chromium}=require('playwright'))}catch(e){}
const page=path.join(here,'..','index.html');
async function open(fn){const b=await chromium.launch();const p=await b.newPage();const errs=[];p.on('pageerror',(e)=>errs.push(e.message));
  await p.route(/three(\.min)?\.js/,(r)=>r.abort());await p.route(/fonts\./,(r)=>r.abort());
  try{return await fn(p,errs)}finally{await b.close()}}
test('игра: старое браузерное сохранение открывается, переносится в новый формат и живёт дальше',{skip:!chromium},async()=>{
  await open(async(p,errs)=>{
    await p.goto('file://'+page);
    await p.waitForFunction(()=>window.__game);await p.evaluate((raw)=>{__game.quiet();localStorage.clear();localStorage.setItem('city-builder-app-v1',raw)},JSON.stringify(fixture('save-v1.json')));
    await p.reload();await p.waitForFunction(()=>window.__game&&__game.S().stats&&__game.S().stats.pop>0,null,{timeout:15000});
    const r=await p.evaluate(async()=>{const G=__game,E=CityEditor;const lots=E.lots.length,pop=G.S().stats.pop;
      G.advance(86400);   // сутки после загрузки — без ошибок
      const list=await G.Store.list();return {lots,pop,pop2:G.S().stats.pop,list,styles:E.lots.filter((l)=>l.style!=null).length}});
    assert.ok(r.lots>50&&r.pop>0);assert.ok(r.pop2>0);
    assert.ok(r.styles>0);
    assert.equal(r.list.length,1,'перенесено в новый формат');assert.equal(r.list[0].schema,Saves.SCHEMA);
    assert.deepEqual(errs,[]);
  });
});
test('игра: сохранить → новый город → загрузить — город тот же',{skip:!chromium},async()=>{
  await open(async(p,errs)=>{
    await p.goto('file://'+page);await p.waitForFunction(()=>window.__game);await p.evaluate(()=>{__game.quiet();localStorage.clear()});await p.reload();await p.waitForTimeout(600);
    const r=await p.evaluate(async()=>{const G=__game,E=CityEditor;G.S().speed=0;
      const nd=(x,y)=>{for(const n in E.nodes)if(E.nodes[n].x===x&&E.nodes[n].y===y)return +n;return E.newNode(x,y)};
      E.newSeg(nd(1280,2240),nd(1920,2240));E.newSeg(nd(1920,2240),nd(1920,1600));E.drawStatic();G.zoneAll('r');G.advance(20*3600);
      const before={segs:Object.keys(E.segs).length,lots:E.lots.length,money:Math.round(G.S().money),t:G.S().t};
      await G.save('save-test','Мой город',true);
      document.getElementById('b-new').click();document.getElementById('b-new').click();   // новый город (двойное нажатие)
      const empty=E.lots.length;
      const o=await G.Store.read('save-test');G.applySave(o,'save-test');
      return {before,empty,after:{segs:Object.keys(E.segs).length,lots:E.lots.length,money:Math.round(G.S().money),t:G.S().t},name:G.S().name,slot:G.S().slot}});
    assert.equal(r.empty,0);assert.deepEqual(r.after,r.before);assert.equal(r.name,'Мой город');assert.equal(r.slot,'save-test');
    assert.deepEqual(errs,[]);
  });
});
test('игра: сохранение новее игры не загружается и город не меняется',{skip:!chromium},async()=>{
  await open(async(p)=>{
    await p.goto('file://'+page);await p.waitForFunction(()=>window.__game);await p.evaluate(()=>{__game.quiet();localStorage.clear()});await p.reload();await p.waitForTimeout(600);
    const r=await p.evaluate(()=>{const G=__game,f=G.saveFile('x');f.schema=CitySaves.SCHEMA+1;f.app='9.9.9';const segs=Object.keys(CityEditor.segs).length;
      const ok=G.applySave(f);return {ok,segs,segs2:Object.keys(CityEditor.segs).length,toast:document.getElementById('toasts').textContent}});
    assert.equal(r.ok,false);assert.equal(r.segs,r.segs2);assert.match(r.toast,/более новой версией/);
  });
});
