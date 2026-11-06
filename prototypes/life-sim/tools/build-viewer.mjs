/*
 * Сборка просмотрщика: viewer.src.html + модули симуляции + общий 3D-вид
 * (prototypes/shared/city3d.js) + снимок деревни →
 * viewer.html, один самодостаточный файл (страница работает без сервера).
 * В страницу попадает тот же код симуляции, что запускается в Node: модули
 * склеиваются по порядку, строки import и слово export убираются.
 *   node prototypes/life-sim/tools/build-viewer.mjs
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const MODULES=['rng','config','world','population','census','life','traffic','peds','sim'];
const code=MODULES.map((m)=>{
  const src=readFileSync(path.join(root,m+'.mjs'),'utf8')
    .split('\n').filter((l)=>!/^\s*import\s/.test(l)&&!/^\s*export\s*\{/.test(l)).join('\n')
    .replace(/^export\s+(const|function|let|class)/gm,'$1');
  if(/\bexport\b\s/.test(src.replace(/\/\/.*$/gm,'')))throw new Error(m+': остался export, который сборка не понимает');
  return `// ---- ${m}.mjs ----\n`+src;
}).join('\n');
const snap=JSON.stringify(JSON.parse(readFileSync(path.join(root,'scenes/village.snapshot.json'),'utf8')));
// общий 3D-вид — тот же файл, что подключает редактор дорог
const city3d=readFileSync(path.join(root,'../shared/city3d.js'),'utf8');
const html=readFileSync(path.join(root,'viewer.src.html'),'utf8')
  .replace('/*@CITY3D@*/',()=>city3d).replace('/*@SIM@*/',()=>code).replace('/*@SNAPSHOT@*/',()=>snap);
writeFileSync(path.join(root,'viewer.html'),html);
console.log('собрано viewer.html,',Math.round(html.length/1024),'КБ');
