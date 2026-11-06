/*
 * Снимок деревни из редактора дорог → scenes/*.snapshot.json.
 * Открывает prototypes/road-editor/index.html, строит деревню и вызывает тот
 * же экспорт, что и кнопка «Экспорт для симуляции».
 * Нужен Playwright с Chromium. Самой симуляции он не нужен.
 *   node prototypes/life-sim/tools/export-village.cjs        — «Деревня 10» → village.snapshot.json
 *   node prototypes/life-sim/tools/export-village.cjs 100    — «Деревня 100» → village100.snapshot.json
 *   node prototypes/life-sim/tools/export-village.cjs dorcol — Белград, Дорчол (дома и заведения из OSM) → dorcol.snapshot.json
 */
const path=require('path'),fs=require('fs');
const {chromium}=require('playwright');
(async()=>{
const b=await chromium.launch(),p=await b.newPage();
await p.goto('file://'+path.resolve(__dirname,'../../road-editor/index.html'));
const which=process.argv[2]||'10',big=which==='100',dorcol=which==='dorcol';
const snap=await p.evaluate(([big,dorcol])=>{const A=window.__dbg.api;if(dorcol)A.loadDorcol();else if(big)A.buildVillage();else A.buildHamlet();return A.exportSim()},[big,dorcol]);
if(dorcol)delete snap.render.zoneCells;   // клетки зон Дорчола — тысячи, для симуляции и карты не нужны
await b.close();
snap.name=dorcol?'Белград, Дорчол':big?'Деревня 100':'Деревня 10';
if(dorcol)snap.attribution='Данные © участники OpenStreetMap, ODbL';
const out=path.resolve(__dirname,'../scenes/'+(dorcol?'dorcol':big?'village100':'village')+'.snapshot.json');
fs.writeFileSync(out,JSON.stringify(snap,null,1)+'\n');
console.log('записано',out,'— узлов',snap.nodes.length,'звеньев',snap.edges.length,'домов',snap.buildings.length,'ворот',snap.gates.length);
})();
