/*
 * Сборка игры в один самодостаточный файл: index.src.html + общий 3D-вид
 * (shared/city3d.js) + симуляция жизни (life-sim, те же модули, что в Node) +
 * сохранения (saves.js) + игра (game.js) + редактор дорог (road-editor/editor.js).
 *   node prototypes/app/build.mjs            → prototypes/app/index.html (для браузера: three.js и шрифт — с CDN)
 *   node prototypes/app/build.mjs --desktop  → desktop/web/index.html (для приложения: всё внутри, работает без сети)
 * Версия игры — из desktop/package.json.
 */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..'),repo=path.resolve(root,'..');
const desktop=process.argv.includes('--desktop');
const read=(p)=>readFileSync(path.join(root,p),'utf8');
const MODULES=['rng','config','world','population','census','life','traffic','peds','sim'];
const sim=MODULES.map((m)=>{
  const src=read('life-sim/'+m+'.mjs').split('\n').filter((l)=>!/^\s*import\s/.test(l)&&!/^\s*export\s*\{/.test(l)).join('\n')
    .replace(/^export\s+(const|function|let|class)/gm,'$1');
  if(/\bexport\b\s/.test(src.replace(/\/\/.*$/gm,'')))throw new Error(m+': остался export, который сборка не понимает');
  return `// ---- life-sim/${m}.mjs ----\n`+src;
}).join('\n');
const pkg=path.join(repo,'desktop','package.json'),version=existsSync(pkg)?JSON.parse(readFileSync(pkg,'utf8')).version:'0.0.0';
const esc=(s)=>s.replace(/<\/script/gi,'<\\/script');
let html=read('app/index.src.html')
  .replace('/*@CITY3D@*/',()=>esc(read('shared/city3d.js')))
  .replace('/*@SIM@*/',()=>esc(sim))
  .replace('/*@SAVES@*/',()=>esc(read('app/saves.js')))
  .replace('/*@GAME@*/',()=>esc(read('app/game.js').replace("'__APP_VERSION__'",JSON.stringify(version))))
  .replace('/*@EDITOR@*/',()=>esc(read('road-editor/editor.js')));
let out=path.join(here,'index.html');
if(desktop){
  // без сети: three.js r128 и шрифт Onest — внутри страницы
  const nm=path.join(repo,'desktop','node_modules');
  const three=readFileSync(path.join(nm,'three','build','three.min.js'),'utf8');
  const faces=[400,500,600,700].flatMap((w)=>['cyrillic','latin'].map((sub)=>{
    const f=readFileSync(path.join(nm,'@fontsource','onest','files',`onest-${sub}-${w}-normal.woff2`)).toString('base64');
    const range=sub==='cyrillic'?'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116':'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
    return `@font-face{font-family:'Onest';font-style:normal;font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${f}) format('woff2');unicode-range:${range}}`}));
  html=html.replace(/<link rel="preconnect"[^>]*>\n?/g,'').replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>\n?/,'')
    .replace('<style>','<style>'+faces.join('\n')+'\n')
    .replace('<script>','<script>'+esc(three)+'</script>\n<script>');
  if(/https?:\/\/(fonts|cdnjs)/.test(html.replace(/sc\.src='https:\/\/cdnjs[^']*'/,'')))throw new Error('в сборке для приложения осталась ссылка в сеть');
  mkdirSync(path.join(repo,'desktop','web'),{recursive:true});out=path.join(repo,'desktop','web','index.html');
}
writeFileSync(out,html);
console.log('собрано',path.relative(repo,out)+',',Math.round(html.length/1024),'КБ, версия',version);
