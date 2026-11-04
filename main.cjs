'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell,Menu}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {rootInfo,planPost,createPost,PostError}=require('./lib/posts.cjs');
const {listDrafts,planDraftDate,updateDraftDate}=require('./lib/drafts.cjs');
if(process.env.SOCIAL_TEST_USER_DATA)app.setPath('userData',process.env.SOCIAL_TEST_USER_DATA);
let window,root='',busy=false,lastResult=null;
const page=pathToFileURL(path.join(__dirname,'ui/index.html')).href;
const config=()=>path.join(app.getPath('userData'),'social-preferences.json');
async function preferences(){try{root=JSON.parse(await fs.readFile(config(),'utf8')).root||'';}catch{}if(process.env.SOCIAL_TEST_ROOT)root=process.env.SOCIAL_TEST_ROOT;}
async function remember(){await fs.mkdir(path.dirname(config()),{recursive:true});const temp=config()+'.tmp';await fs.writeFile(temp,JSON.stringify({root}));await fs.rename(temp,config());}
function errorMessage(e){
 if(e instanceof PostError)return{code:e.code,message:e.message};
 if(['EACCES','EPERM','EROFS'].includes(e.code))return{code:'PERMISSION',message:'Non ho il permesso di scrivere nella cartella scelta. Controlla i permessi o scegli una cartella di test.'};
 if(e.code==='ENOSPC')return{code:'SPACE',message:'Spazio insufficiente sul disco o sul NAS.'};
 if(e.code==='ENOENT')return{code:'MISSING',message:'Un file o una cartella non è più disponibile. Verifica il collegamento al NAS e riprova.'};
 return{code:'ERROR',message:e.message||'Non riesco a completare l’operazione. Nessun post è stato creato.'};
}
function endpoint(name,handler){ipcMain.handle(name,async(event,...args)=>{
 if(event.sender!==window.webContents||event.senderFrame?.url!==page)return{ok:false,error:{code:'ACCESS',message:'Richiesta non valida.'}};
 try{return{ok:true,value:await handler(...args)};}catch(e){return{ok:false,error:errorMessage(e)};}
});}
function createWindow(){
 window=new BrowserWindow({width:1000,height:820,minWidth:580,minHeight:620,title:'Social',backgroundColor:'#ffffff',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('will-navigate',(event,url)=>{if(url!==page)event.preventDefault();});
 window.on('close',event=>{if(busy){event.preventDefault();dialog.showMessageBox(window,{type:'info',message:'La creazione è in corso. Attendi il completamento prima di chiudere.'});}});
 window.once('ready-to-show',()=>window.show());
 window.loadFile(path.join(__dirname,'ui/index.html'));
}
if(!app.requestSingleInstanceLock())app.quit();
else{
 app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
 app.whenReady().then(async()=>{
  await preferences();
  if(process.platform==='darwin')Menu.setApplicationMenu(Menu.buildFromTemplate([{role:'appMenu'},{role:'editMenu'},{role:'windowMenu'}]));else Menu.setApplicationMenu(null);
  endpoint('social:initial',async()=>{
   if(!root)return{root:'',valid:false};
   try{await rootInfo(root);return{root,valid:true};}catch(e){return{root,valid:false,message:errorMessage(e).message};}
  });
  endpoint('social:choose',async()=>{
   if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');
   const result=await dialog.showOpenDialog(window,{title:'Scegli la cartella Social',properties:['openDirectory'],defaultPath:root||app.getPath('documents')});
   if(result.canceled)return null;
   const selected=result.filePaths[0];await rootInfo(selected);root=selected;await remember();return{root,valid:true};
  });
  endpoint('social:plan',async input=>{if(busy)throw new PostError('BUSY','Attendi la fine della creazione.');return planPost(root,input);});
  endpoint('social:drafts',async()=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');return listDrafts(root);});
  endpoint('social:plan-date',async input=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');return planDraftDate(root,input);});
  endpoint('social:update-date',async(input,fingerprint)=>{
   if(busy)throw new PostError('BUSY','Un’operazione è già in corso.');
   if(typeof fingerprint!=='string'||fingerprint.length!==64)throw new PostError('INPUT','Controlla di nuovo il riepilogo.');
   busy=true;try{return await updateDraftDate(root,input,fingerprint);}finally{busy=false;}
  });
  endpoint('social:create',async(input,fingerprint)=>{
   if(busy)throw new PostError('BUSY','La creazione è già in corso.');
   if(typeof fingerprint!=='string'||fingerprint.length!==64)throw new PostError('INPUT','Aggiorna il riepilogo prima di creare il post.');
   busy=true;try{lastResult=await createPost(root,input,fingerprint);return lastResult;}finally{busy=false;}
  });
  endpoint('social:open',async()=>{if(!lastResult)throw new PostError('INPUT','Non è ancora stato creato un post.');const error=await shell.openPath(lastResult.root);if(error)throw new Error(error);return true;});
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
 });
 app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
}
