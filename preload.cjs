const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('socialAPI',{
 initial:()=>ipcRenderer.invoke('social:initial'),
 chooseRoot:()=>ipcRenderer.invoke('social:choose'),
 drafts:()=>ipcRenderer.invoke('social:drafts'),
 planDate:input=>ipcRenderer.invoke('social:plan-date',input),
 updateDate:(input,fingerprint)=>ipcRenderer.invoke('social:update-date',input,fingerprint),
 plan:input=>ipcRenderer.invoke('social:plan',input),
 create:(input,fingerprint)=>ipcRenderer.invoke('social:create',input,fingerprint),
 openResult:()=>ipcRenderer.invoke('social:open'),
});
