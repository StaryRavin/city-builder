/*
 * Снимок деревни из редактора дорог → scenes/*.snapshot.json.
 * Открывает prototypes/road-editor/index.html, строит деревню и вызывает тот
 * же экспорт, что и кнопка «Экспорт для симуляции».
 * Нужен Playwright с Chromium. Самой симуляции он не нужен.
 *   node prototypes/life-sim/tools/export-village.cjs        — «Деревня 10» → village.snapshot.json
 *   node prototypes/life-sim/tools/export-village.cjs 100    — «Деревня 100» → village100.snapshot.json
 */
const path=require('path'),fs=require('fs');
const {chromium}=require('playwright');
(async()=>{
const b=await chromium.launch(),p=await b.newPage();
await p.goto('file://'+path.resolve(__dirname,'../../road-editor/index.html'));
const big=process.argv[2]==='100';
const snap=await p.evaluate((big)=>{const A=window.__dbg.api;if(big)A.buildVillage();else A.buildHamlet();return A.exportSim()},big);
await b.close();
snap.name=big?'Деревня 100':'Деревня 10';
const out=path.resolve(__dirname,'../scenes/'+(big?'village100':'village')+'.snapshot.json');
fs.writeFileSync(out,JSON.stringify(snap,null,1)+'\n');
console.log('записано',out,'— узлов',snap.nodes.length,'звеньев',snap.edges.length,'домов',snap.buildings.length,'ворот',snap.gates.length);
})();
