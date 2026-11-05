'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell,Menu}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {rootInfo,planPost,createPost,PostError,assertContained}=require('./lib/posts.cjs');
const {listDrafts,planDraftDate,updateDraftDate}=require('./lib/drafts.cjs');
const {listPosts,planPostEdit,savePostEdit}=require('./lib/editor.cjs');
const {postDetails,resolvePostText,resolvePostFolder}=require('./lib/details.cjs');
const {illustratorFiles,resolveIllustrator,illustratorData}=require('./lib/illustrator.cjs');
const {planPostStatus,savePostStatus}=require('./lib/status.cjs');
const {planDeletePost,deletePost}=require('./lib/delete.cjs');
const settings=require('./lib/settings.cjs');
if(process.env.SOCIAL_TEST_USER_DATA)app.setPath('userData',process.env.SOCIAL_TEST_USER_DATA);
let window,root='',busy=false,lastResult=null;
const page=pathToFileURL(path.join(__dirname,'ui/index.html')).href;
const config=()=>path.join(app.getPath('userData'),'social-preferences.json');
async function preferences(){
 const files=[config(),...['Social','social-post-assistant'].map(name=>path.join(app.getPath('appData'),name,'social-preferences.json'))];
 for(const file of files){try{const data=JSON.parse(await fs.readFile(file,'utf8'));if(typeof data.root==='string'&&data.root){root=data.root;break;}}catch{}}
 if(process.env.SOCIAL_TEST_ROOT)root=process.env.SOCIAL_TEST_ROOT;
 else if(root){try{const doc=await settings.read(root),configured=doc[settings.platform()]?.socialRoot;if(typeof configured==='string'&&configured)root=configured;}catch{}}
}
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
async function confirmSave(){
 const result=await dialog.showMessageBox(window,{type:'question',title:'Conferma salvataggio',message:'Sei sicuro di salvare le modifiche?',detail:'Hai chiuso tutti i file del post e il piano Excel?\n\nPrima di continuare chiudi Illustrator, Excel e gli altri file del post. Confermando dichiari che sono chiusi.',buttons:['Annulla','Sì, i file sono chiusi: salva'],defaultId:0,cancelId:0,noLink:true});
 return result.response===1;
}
function createWindow(){
 window=new BrowserWindow({width:1000,height:820,minWidth:580,minHeight:620,title:'SocialDesk',backgroundColor:'#ffffff',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('will-navigate',(event,url)=>{if(url!==page)event.preventDefault();});
 window.on('close',event=>{if(busy){event.preventDefault();dialog.showMessageBox(window,{type:'info',message:'Un’operazione è in corso. Attendi il completamento prima di chiudere.'});}});
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
  endpoint('social:settings',async()=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');await rootInfo(root);return settings.current(root);});
  endpoint('social:choose-setting',async(kind)=>{
   if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');
   const current=await settings.current(root);
   if(!['Facebook','Instagram','LinkedIn','trash'].includes(kind))throw new PostError('INPUT','Percorso non valido.');
   const isTrash=kind==='trash',previous=isTrash?current.trash:current.templates[kind];
   const location=path.isAbsolute(previous)?previous:path.join(root,previous);
   const result=await dialog.showOpenDialog(window,{title:isTrash?'Scegli la cartella cestino':`Scegli il template ${kind}`,properties:[isTrash?'openDirectory':'openFile'],defaultPath:location,filters:isTrash?undefined:[{name:'Adobe Illustrator',extensions:['ai']}]});
   return result.canceled?null:settings.relativeOrAbsolute(root,result.filePaths[0]);
  });
  endpoint('social:save-settings',async input=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');await rootInfo(root);return settings.save(root,input);});
  endpoint('social:plan',async input=>{if(busy)throw new PostError('BUSY','Attendi la fine della creazione.');return planPost(root,input);});
  endpoint('social:drafts',async()=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');return listDrafts(root);});
  endpoint('social:posts',async()=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');return listPosts(root);});
  endpoint('social:details',async input=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');return postDetails(root,input);});
  endpoint('social:open-text',async input=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');const file=await resolvePostText(root,input);const error=await shell.openPath(file);if(error)throw new Error(error);return true;});
  endpoint('social:open-post-folder',async input=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');const folder=await resolvePostFolder(root,input);const error=await shell.openPath(folder);if(error)throw new Error(error);return true;});
  endpoint('social:illustrator-files',async input=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');return illustratorFiles(root,input);});
  endpoint('social:illustrator-data',async input=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');return illustratorData(root,input);});
  endpoint('social:open-illustrator',async input=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');const file=await resolveIllustrator(root,input);const error=await shell.openPath(file);if(error)throw new Error(error);return true;});
  endpoint('social:update-status',async input=>{
   if(busy)throw new PostError('BUSY','Un’operazione è già in corso.');
   busy=true;
   try{const plan=await planPostStatus(root,input);if(!plan.changed)return plan;if(!await confirmSave())return{canceled:true};return await savePostStatus(root,input);}finally{busy=false;}
  });
  endpoint('social:delete-post',async input=>{
   if(busy)throw new PostError('BUSY','Un’operazione è già in corso.');
   busy=true;
   try{
    const plan=await planDeletePost(root,input);
    const confirmation=await dialog.showMessageBox(window,{type:'warning',title:'Elimina post',message:`Eliminare “${plan.title}” per ${plan.channel}?`,detail:`Verrà rimossa solo questa riga dal piano editoriale. La cartella del post sarà spostata in:\n${plan.trashRelative}\n\nGli altri social dello stesso post resteranno invariati.\nHai chiuso tutti i file del post e il piano Excel? Le modifiche non salvate in questa schermata verranno scartate.`,buttons:['Annulla','Sì, i file sono chiusi: elimina'],defaultId:0,cancelId:0,noLink:true});
    if(confirmation.response!==1)return{canceled:true};
    return await deletePost(root,input,plan.fingerprint);
   }finally{busy=false;}
  });
  endpoint('social:plan-edit',async input=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');return planPostEdit(root,input);});
  endpoint('social:save-edit',async(input,fingerprint)=>{
   if(busy)throw new PostError('BUSY','Un’operazione è già in corso.');
   if(typeof fingerprint!=='string'||fingerprint.length!==64)throw new PostError('INPUT','Controlla di nuovo il riepilogo.');
   busy=true;
   try{
    const plan=await planPostEdit(root,input);
    if(plan.fingerprint!==fingerprint)throw new PostError('CHANGED','I dati o i file sono cambiati. Controlla di nuovo il riepilogo.');
    if(!await confirmSave())return{canceled:true};
    return await savePostEdit(root,input,fingerprint);
   }finally{busy=false;}
  });
  endpoint('social:plan-date',async input=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');return planDraftDate(root,input);});
  endpoint('social:update-date',async(input,fingerprint)=>{
   if(busy)throw new PostError('BUSY','Un’operazione è già in corso.');
   if(typeof fingerprint!=='string'||fingerprint.length!==64)throw new PostError('INPUT','Controlla di nuovo il riepilogo.');
   busy=true;try{if(!await confirmSave())return{canceled:true};return await updateDraftDate(root,input,fingerprint);}finally{busy=false;}
  });
  endpoint('social:create',async(input,fingerprint)=>{
   if(busy)throw new PostError('BUSY','La creazione è già in corso.');
   if(typeof fingerprint!=='string'||fingerprint.length!==64)throw new PostError('INPUT','Aggiorna il riepilogo prima di creare il post.');
   busy=true;try{lastResult=await createPost(root,input,fingerprint);return lastResult;}finally{busy=false;}
  });
  endpoint('social:open',async channel=>{
   if(!lastResult)throw new PostError('INPUT','Non è ancora stato creato un post.');
   const folder=lastResult.created.find(item=>item.channel===channel);
   if(!folder)throw new PostError('INPUT','Seleziona una delle cartelle del post appena creato.');
   await assertContained(lastResult.root,folder.path);
   if(!(await fs.stat(folder.path)).isDirectory())throw new PostError('MISSING','La cartella del post non è più disponibile.');
   const error=await shell.openPath(folder.path);if(error)throw new Error(error);return true;
  });
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
 });
 app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
}
