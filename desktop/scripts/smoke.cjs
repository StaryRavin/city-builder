/*
 * Проверка собранного приложения: запуск, сохранение в файл, продолжение после
 * перезапуска, открытие старого сохранения (схема 1) и резервная копия при перезаписи.
 *   node scripts/smoke.cjs            — Linux: electron из node_modules (без экрана)
 *   node scripts/smoke.cjs --packaged — Windows: dist/win-unpacked/Gorodok.exe
 */
const {_electron}=require('playwright');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const dir=path.resolve(__dirname,'..'),packaged=process.argv.includes('--packaged');
const ud=fs.mkdtempSync(path.join(os.tmpdir(),'gorodok-smoke-')),saves=path.join(ud,'saves');
function launch(){
  const args=['--user-data-dir='+ud];
  if(packaged)return _electron.launch({executablePath:path.join(dir,'dist','win-unpacked','Gorodok.exe'),args,timeout:90000});
  return _electron.launch({executablePath:require('electron'),args:['--no-sandbox','--ozone-platform=headless','--disable-gpu',...args,dir],timeout:90000});
}
(async()=>{
  // старое сохранение из браузерной версии (схема 1) лежит в папке сохранений до первого запуска
  fs.mkdirSync(saves,{recursive:true});
  fs.copyFileSync(path.join(dir,'..','prototypes','app','test','fixtures','save-v1.json'),path.join(saves,'old-city.json'));
  let app=await launch(),w=await app.firstWindow();const errs=[];w.on('pageerror',(e)=>errs.push(e.message));
  await w.waitForFunction(()=>window.__game&&window.cityHost&&CityEditor.lots.length>0,null,{timeout:60000});
  const a=await w.evaluate(async()=>{const G=__game,E=CityEditor;G.S().speed=0;
    const lots=E.lots.length,styled=E.lots.filter((l)=>l.style!=null).length,three=!!window.THREE,ver=cityHost.version;
    G.advance(6*3600);await G.save('save-smoke','Проверка',true);
    // перезапись старого файла новой схемой — старый должен уйти в резервные копии
    await cityHost.write('old-city',G.saveFile('Перезаписан'));
    return {lots,styled,three,ver,list:(await cityHost.list()).map((h)=>h.id+':'+h.schema)}});
  console.log('первый запуск:',JSON.stringify(a));
  assert.ok(a.lots>50,'старое сохранение открылось');assert.ok(a.styled>0,'миграция назначила стили');assert.ok(a.three,'three.js внутри приложения');
  assert.ok(fs.existsSync(path.join(saves,'save-smoke.json')),'файл сохранения');
  assert.ok(fs.readdirSync(path.join(saves,'backups')).some((f)=>/^old-city-schema1-/.test(f)),'резервная копия старого файла');
  await app.close();
  assert.ok(fs.readdirSync(saves).some((f)=>/^auto-\d\.json$/.test(f)),'автосохранение при закрытии');
  // второй запуск — продолжить последний город
  app=await launch();w=await app.firstWindow();
  await w.waitForFunction(()=>window.__game&&CityEditor.lots.length>0,null,{timeout:60000});
  const b=await w.evaluate(()=>({lots:CityEditor.lots.length,name:__game.S().name}));
  console.log('второй запуск:',JSON.stringify(b));assert.ok(b.lots>50);
  await app.close();
  assert.deepEqual(errs,[]);
  console.log('приложение работает, сохранения целы:',fs.readdirSync(saves).join(', '));
})().catch((e)=>{console.error(e);process.exit(1)});
