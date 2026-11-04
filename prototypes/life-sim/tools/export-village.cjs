/*
 * Снимок деревни из редактора дорог → scenes/village.snapshot.json.
 * Открывает prototypes/road-editor/index.html (деревня грузится при старте)
 * и вызывает тот же экспорт, что и кнопка «Экспорт для симуляции».
 * Нужен Playwright с Chromium. Самой симуляции он не нужен.
 *   node prototypes/life-sim/tools/export-village.cjs
 */
const path=require('path'),fs=require('fs');
const {chromium}=require('playwright');
(async()=>{
const b=await chromium.launch(),p=await b.newPage();
await p.goto('file://'+path.resolve(__dirname,'../../road-editor/index.html'));
const snap=await p.evaluate(()=>window.__dbg.api.exportSim());
await b.close();
snap.name='Деревня';
const out=path.resolve(__dirname,'../scenes/village.snapshot.json');
fs.writeFileSync(out,JSON.stringify(snap,null,1)+'\n');
console.log('записано',out,'— узлов',snap.nodes.length,'звеньев',snap.edges.length,'домов',snap.buildings.length,'ворот',snap.gates.length);
})();
