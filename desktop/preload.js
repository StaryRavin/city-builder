// Мост между окном игры и приложением: только операции с сохранениями (без доступа к диску напрямую).
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('cityHost',{
  version:ipcRenderer.sendSync('app:version'),
  list:()=>ipcRenderer.invoke('saves:list'),
  read:(id)=>ipcRenderer.invoke('saves:read',id),
  write:(id,obj)=>ipcRenderer.invoke('saves:write',id,obj),
  writeSync:(id,obj)=>ipcRenderer.sendSync('saves:writeSync',id,obj),   // при закрытии окна
  remove:(id)=>ipcRenderer.invoke('saves:remove',id),
  openFolder:()=>ipcRenderer.invoke('saves:folder'),
  exportSave:(id)=>ipcRenderer.invoke('saves:export',id),
  importSave:()=>ipcRenderer.invoke('saves:import'),
});
