/*
 * «Городок у реки» — приложение для Windows (Electron).
 *
 * Окно показывает собранную игру (web/index.html, собирается из prototypes/app
 * командой npm run web). Сохранения — JSON-файлы в папке пользователя:
 *   %APPDATA%\Городок у реки\saves\<id>.json
 * Установщик ставит игру в Program Files / AppData\Local\Programs, а сохранения
 * лежат отдельно, поэтому обновление и удаление игры их не трогают
 * (nsis.deleteAppDataOnUninstall: false).
 *
 * Защита сохранений:
 *   - запись атомарная: сначала во временный файл, потом переименование —
 *     сбой посреди записи не портит прежнее сохранение;
 *   - если файл перезаписывается сохранением другой схемы (другой версией игры),
 *     прежний файл копируется в saves\backups;
 *   - сохранение более новой схемы, чем знает игра, игра не открывает (saves.js).
 */
const {app,BrowserWindow,ipcMain,shell,dialog,Menu}=require('electron');
const fs=require('fs');
const path=require('path');

const FORMAT='city-builder-save';
const savesDir=()=>path.join(app.getPath('userData'),'saves');
const backupsDir=()=>path.join(savesDir(),'backups');
// имя слота: только латиница, цифры и дефис — никаких путей из окна игры
function fileOf(id){if(typeof id!=='string'||!/^[a-z0-9-]{1,64}$/.test(id))throw new Error('недопустимое имя сохранения');return path.join(savesDir(),id+'.json')}
function schemaOf(o){if(!o||typeof o!=='object')return null;if(o.format===FORMAT)return o.schema;if(o.ed&&o.S)return 1;return null}
function readJSON(f){return JSON.parse(fs.readFileSync(f,'utf8'))}
function stamp(){return new Date().toISOString().replace(/[:.]/g,'-')}

function headerOf(id,f){
  try{const o=readJSON(f);return {id,name:o.name||'Город',saved:o.saved||fs.statSync(f).mtime.toISOString(),schema:schemaOf(o),app:o.app||null,meta:o.meta||{}}}
  catch(e){return {id,broken:true,saved:fs.statSync(f).mtime.toISOString()}}}
function list(){
  fs.mkdirSync(savesDir(),{recursive:true});
  return fs.readdirSync(savesDir()).filter((n)=>/^[a-z0-9-]{1,64}\.json$/.test(n)).map((n)=>headerOf(n.slice(0,-5),path.join(savesDir(),n)));}
function write(id,obj){
  const f=fileOf(id);fs.mkdirSync(savesDir(),{recursive:true});
  if(fs.existsSync(f)){let old=null;try{old=schemaOf(readJSON(f))}catch(e){old='broken'}
    if(old!==schemaOf(obj)){fs.mkdirSync(backupsDir(),{recursive:true});fs.copyFileSync(f,path.join(backupsDir(),`${id}-schema${old}-${stamp()}.json`))}}
  const tmp=f+'.tmp';fs.writeFileSync(tmp,JSON.stringify(obj));fs.renameSync(tmp,f);return true;}

ipcMain.handle('saves:list',()=>list());
ipcMain.handle('saves:read',(e,id)=>{const f=fileOf(id);return fs.existsSync(f)?readJSON(f):null});
ipcMain.handle('saves:write',(e,id,obj)=>write(id,obj));
ipcMain.on('saves:writeSync',(e,id,obj)=>{try{e.returnValue=write(id,obj)}catch(err){e.returnValue=false}});
ipcMain.handle('saves:remove',(e,id)=>{const f=fileOf(id);if(fs.existsSync(f)){fs.mkdirSync(backupsDir(),{recursive:true});fs.renameSync(f,path.join(backupsDir(),`${id}-deleted-${stamp()}.json`))}return true});
ipcMain.handle('saves:folder',()=>{fs.mkdirSync(savesDir(),{recursive:true});return shell.openPath(savesDir())});
ipcMain.handle('saves:export',async(e,id)=>{const f=fileOf(id);if(!fs.existsSync(f))return false;
  const o=readJSON(f);const r=await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender),{title:'Сохранить город в файл',defaultPath:(o.name||'город').replace(/[\\/:*?"<>|]/g,'_')+'.city.json',filters:[{name:'Город',extensions:['json']}]});
  if(r.canceled||!r.filePath)return false;fs.copyFileSync(f,r.filePath);return true});
ipcMain.handle('saves:import',async(e)=>{const r=await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender),{title:'Загрузить город из файла',properties:['openFile'],filters:[{name:'Город',extensions:['json']}]});
  if(r.canceled||!r.filePaths.length)return null;try{return {obj:readJSON(r.filePaths[0])}}catch(err){return {error:err.message}}});
ipcMain.on('app:version',(e)=>{e.returnValue=app.getVersion()});

function createWindow(){
  const win=new BrowserWindow({width:1440,height:900,minWidth:960,minHeight:620,backgroundColor:'#F1F0EB',title:'Городок у реки',autoHideMenuBar:true,show:false,
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.once('ready-to-show',()=>win.show());
  // игра — одна страница: никаких переходов и новых окон
  win.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//.test(url))shell.openExternal(url);return {action:'deny'}});
  win.webContents.on('will-navigate',(e)=>e.preventDefault());
  win.loadFile(path.join(__dirname,'web','index.html'));
  return win;
}
if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{const w=BrowserWindow.getAllWindows()[0];if(w){if(w.isMinimized())w.restore();w.focus()}});
  Menu.setApplicationMenu(null);
  app.whenReady().then(createWindow);
  app.on('window-all-closed',()=>app.quit());
}
