/*
 * Сохранения игры: формат файла, проверка и миграции между версиями.
 *
 * Файл сохранения:
 *   {format:'city-builder-save', schema, app, saved, name, meta:{day, pop, money}, data:{ed, S}}
 *   schema — версия формата данных (data); app — версия игры, которая сохранила;
 *   data.ed — дороги, участки и выезды (CityEditor.dump()), data.S — состояние игры.
 *
 * Правило, чтобы новая версия не ломала старые сохранения: любое изменение того,
 * что лежит в data, — это новая схема. SCHEMA растёт на 1, а в MIGRATIONS
 * добавляется шаг от прежней схемы к новой. Старое сохранение при загрузке проходит
 * все шаги по порядку (1 → 2 → 3 ...). Сохранение более новой схемы, чем знает игра,
 * не открывается и не перезаписывается — его сделала более новая версия.
 * Тесты: prototypes/app/test/saves.test.mjs (образцы старых сохранений — test/fixtures).
 *
 * Один и тот же файл работает в браузере (window.CitySaves) и в Node (module.exports).
 */
(function(root){
'use strict';
var FORMAT='city-builder-save',SCHEMA=2;

// наборы стилей фасадов (как City3D.STYLE_SETS) — для домов из сохранений, где стиля ещё не было
var STYLE_SETS={classic:[0,1,2,3,4,5,6,7],modern:[8,9,10],panel:[11,12],glass:[13,14],warehouse:[15,16],cottage:[17,18,19],shop:[20,21]};
function hash(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0}return h}
function styleFor(l){var b=l.b||{},z=b.z,lv=b.lv||1,h=hash(String(l.key)+':'+l.k0+':'+l.k1+':'+l.j1),one=function(a){return a[h%a.length]},r=(h>>>8)%100/100;
  if(z==='r')return lv===1?one(STYLE_SETS.cottage):one(r<0.55?STYLE_SETS.classic:STYLE_SETS.modern);
  if(z==='h')return one(r<0.4?STYLE_SETS.panel:r<0.75?STYLE_SETS.modern:STYLE_SETS.classic);
  if(z==='c')return lv<3?one(r<0.7?STYLE_SETS.shop:STYLE_SETS.classic):one(STYLE_SETS.modern);
  if(z==='i')return one(STYLE_SETS.warehouse);
  if(z==='o')return one(r<0.6?STYLE_SETS.glass:STYLE_SETS.modern);
  return null}

/*
 * Шаги миграции: MIGRATIONS[n] переводит data схемы n в схему n+1.
 * Шаг получает копию и возвращает новые данные; исходный файл не трогается.
 */
var MIGRATIONS={
  // 1 → 2. Схема 1 — сохранение в браузере до появления файлов: просто {ed, S}.
  // В первых версиях у домов не было стиля фасада — назначаем по зоне и уровню
  // (детерминированно, по месту дома: одно и то же сохранение даёт тот же город).
  1:function(d){
    (d.ed.lots||[]).forEach(function(l){if(l.style==null&&l.b){var st=styleFor(l);if(st!=null)l.style=st}});
    d.S=d.S||{};if(d.S.lastH==null&&typeof d.S.t==='number')d.S.lastH=Math.floor(d.S.t/3600);
    return d}
};

function clone(o){return JSON.parse(JSON.stringify(o))}
// схема объекта: файл нового формата или старый {ed, S}
function schemaOf(obj){if(!obj||typeof obj!=='object')return null;if(obj.format===FORMAT)return typeof obj.schema==='number'?obj.schema:null;if(obj.ed&&obj.S)return 1;return null}
// проверка, что данные можно загрузить; возвращает список ошибок
function check(d){var e=[];
  if(!d||!d.ed||!d.S)return ['нет данных города'];
  var ed=d.ed,S=d.S;
  if(typeof ed.nodes!=='object'||!ed.nodes)e.push('нет узлов дорог');
  if(typeof ed.segs!=='object'||!ed.segs)e.push('нет дорог');
  if(!Array.isArray(ed.lots))e.push('нет списка домов');
  if(!Array.isArray(ed.exits))e.push('нет выездов');
  if(typeof S.t!=='number'||!isFinite(S.t))e.push('нет игрового времени');
  if(typeof S.money!=='number'||!isFinite(S.money))e.push('нет казны');
  if(S.zones&&typeof S.zones!=='object')e.push('зоны повреждены');
  if(ed.segs)for(var id in ed.segs){var g=ed.segs[id];if(!ed.nodes[g.a]||!ed.nodes[g.b]){e.push('дорога '+id+' ведёт в несуществующий узел');break}}
  return e}
/*
 * Прочитать сохранение любой поддерживаемой схемы.
 * Возвращает {ok:true, data, from, steps, name, meta, app} или {ok:false, reason, schema}.
 * reason: 'unknown' — не сохранение игры; 'newer' — схема новее игры; 'broken' — данные повреждены.
 */
function migrate(obj){
  var v=schemaOf(obj);if(v==null)return {ok:false,reason:'unknown'};
  if(v>SCHEMA)return {ok:false,reason:'newer',schema:v,app:obj.app};
  var data=clone(v===1?{ed:obj.ed,S:obj.S}:obj.data),from=v,steps=[];
  while(v<SCHEMA){var step=MIGRATIONS[v];if(!step)return {ok:false,reason:'broken',schema:v,errors:['нет шага миграции со схемы '+v]};data=step(data);steps.push(v+'→'+(v+1));v++}
  var errs=check(data);if(errs.length)return {ok:false,reason:'broken',schema:from,errors:errs};
  return {ok:true,data:data,from:from,steps:steps,name:obj.name||null,meta:obj.meta||null,app:obj.app||null}}
// собрать файл сохранения текущей схемы
function make(data,info){info=info||{};
  return {format:FORMAT,schema:SCHEMA,app:info.app||'?',saved:info.saved||new Date().toISOString(),name:info.name||'Город',meta:info.meta||{},data:data}}

var API={FORMAT:FORMAT,SCHEMA:SCHEMA,MIGRATIONS:MIGRATIONS,schemaOf:schemaOf,check:check,migrate:migrate,make:make,styleFor:styleFor};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.CitySaves=API;
})(typeof window!=='undefined'?window:globalThis);
