/*
 * Установщик для Windows: desktop/dist/Gorodok-Setup-<версия>.exe
 *   npm run installer      (из папки desktop)
 * Шаги:
 *   1. собрать игру в web/index.html (prototypes/app/build.mjs --desktop);
 *   2. electron-builder упаковывает приложение в dist/win-unpacked (без установщика);
 *   3. иконка и сведения о версии записываются в Gorodok.exe библиотекой resedit
 *      (чистый JavaScript — Wine не нужен, собирается и на Linux, и на Windows);
 *   4. makensis собирает установщик по installer.nsi (NSIS 3: на Windows — из
 *      «Program Files (x86)\NSIS», на Linux — пакет nsis).
 */
import {execFileSync,execSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pkg=JSON.parse(readFileSync(path.join(dir,'package.json'),'utf8')),ver=pkg.version,ver4=ver.split('.').concat(['0','0','0']).slice(0,4).join('.');
const run=(cmd)=>execSync(cmd,{cwd:dir,stdio:'inherit'});

run('node ../prototypes/app/build.mjs --desktop');
run('npx electron-builder --win dir --x64 --publish never');
const unpacked=path.join(dir,'dist','win-unpacked'),exe=path.join(unpacked,'Gorodok.exe');
if(!existsSync(exe))throw new Error('нет '+exe+' — electron-builder не упаковал приложение');

// иконка: build/icon.png → build/icon.ico (16…256)
const pngToIco=require('png-to-ico');
const ico=await pngToIco(path.join(dir,'build','icon.png'));
writeFileSync(path.join(dir,'build','icon.ico'),ico);

// иконка и сведения о версии в Gorodok.exe
const ResEdit=require('resedit');
const ex=ResEdit.NtExecutable.from(readFileSync(exe),{ignoreCert:true}),res=ResEdit.NtExecutableResource.from(ex);
const groups=ResEdit.Resource.IconGroupEntry.fromEntries(res.entries),icon=ResEdit.Data.IconFile.from(ico);
const gid=groups.length?groups[0].id:1,glang=groups.length?groups[0].lang:1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries,gid,glang,icon.icons.map((i)=>i.data));
const vi=ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0]||ResEdit.Resource.VersionInfo.createEmpty();
const [a,b,c,d]=ver4.split('.').map(Number);vi.setFileVersion(a,b,c,d,1033);vi.setProductVersion(a,b,c,d,1033);
vi.setStringValues({lang:1033,codepage:1200},{ProductName:pkg.productName,FileDescription:pkg.productName,CompanyName:'city-builder',LegalCopyright:'city-builder',OriginalFilename:'Gorodok.exe',InternalName:'Gorodok',FileVersion:ver,ProductVersion:ver});
vi.outputToResourceEntries(res.entries);res.outputResource(ex);writeFileSync(exe,Buffer.from(ex.generate()));

// установщик
const nsisWin=['C:\\Program Files (x86)\\NSIS\\makensis.exe','C:\\Program Files\\NSIS\\makensis.exe'].find((p)=>existsSync(p));
const makensis=nsisWin||'makensis';
const out=path.join(dir,'dist',`Gorodok-Setup-${ver}.exe`);rmSync(out,{force:true});
execFileSync(makensis,['-V2',`-DVER=${ver}`,`-DVER4=${ver4}`,`-DSRC=${unpacked}`,`-DOUT=${out}`,`-DICON=${path.join(dir,'build','icon.ico')}`,path.join(dir,'installer.nsi')],{cwd:dir,stdio:'inherit'});
console.log('готово:',path.relative(dir,out),Math.round(readFileSync(out).length/1048576)+' МБ');
