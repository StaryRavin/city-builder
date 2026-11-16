/*
 * Сборка игры в один самодостаточный файл: index.src.html + общий 3D-вид
 * (shared/city3d.js) + симуляция жизни (life-sim, те же модули, что в Node) +
 * игра (game.js) + редактор дорог (road-editor/editor.js) → index.html.
 *   node prototypes/app/build.mjs
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..');
const read=(p)=>readFileSync(path.join(root,p),'utf8');
const MODULES=['rng','config','world','population','census','life','traffic','peds','sim'];
const sim=MODULES.map((m)=>{
  const src=read('life-sim/'+m+'.mjs').split('\n').filter((l)=>!/^\s*import\s/.test(l)&&!/^\s*export\s*\{/.test(l)).join('\n')
    .replace(/^export\s+(const|function|let|class)/gm,'$1');
  if(/\bexport\b\s/.test(src.replace(/\/\/.*$/gm,'')))throw new Error(m+': остался export, который сборка не понимает');
  return `// ---- life-sim/${m}.mjs ----\n`+src;
}).join('\n');
const esc=(s)=>s.replace(/<\/script/gi,'<\\/script');
const html=read('app/index.src.html')
  .replace('/*@CITY3D@*/',()=>esc(read('shared/city3d.js')))
  .replace('/*@SIM@*/',()=>esc(sim))
  .replace('/*@GAME@*/',()=>esc(read('app/game.js')))
  .replace('/*@EDITOR@*/',()=>esc(read('road-editor/editor.js')));
writeFileSync(path.join(here,'index.html'),html);
console.log('собрано app/index.html,',Math.round(html.length/1024),'КБ');
