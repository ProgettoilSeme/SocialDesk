'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell,Menu,clipboard,nativeTheme}=require('electron');
// L'interfaccia è chiara: barra del titolo e finestre di sistema chiare anche con macOS/Windows in modalità scura.
nativeTheme.themeSource='light';
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {rootInfo,planPost,createPost,PostError,assertContained}=require('./lib/posts.cjs');
const {syncAssetArchive}=require('./lib/assets.cjs');
const {listDrafts,planDraftDate,updateDraftDate}=require('./lib/drafts.cjs');
const {listPosts,planPostEdit,savePostEdit,saveTextBackup,resolveTextBackup}=require('./lib/editor.cjs');
const {postDetails,resolvePostText,resolvePostFolder}=require('./lib/details.cjs');
const {illustratorFiles,resolveIllustrator,illustratorData}=require('./lib/illustrator.cjs');
const {planPostStatus,savePostStatus}=require('./lib/status.cjs');
const {planDeletePost,deletePost}=require('./lib/delete.cjs');
const settings=require('./lib/settings.cjs');
const update=require('./lib/update.cjs');
const relink=require('./lib/relink.cjs');
const {regenerateSource}=require('./lib/regenerate.cjs');
const {planAddChannel,addChannel}=require('./lib/addchannel.cjs');
if(process.env.SOCIAL_TEST_USER_DATA)app.setPath('userData',process.env.SOCIAL_TEST_USER_DATA);
let window,root='',busy=false,lastResult=null,startupFailed=false;
// Registro di avvio: aiuta a capire perché l'app non si apre (es. su Windows/NAS).
const startupLog=()=>path.join(app.getPath('userData'),'socialdesk-avvio.log');
function log(message){
 try{const file=startupLog();require('node:fs').mkdirSync(path.dirname(file),{recursive:true});
  try{if(require('node:fs').statSync(file).size>256*1024)require('node:fs').renameSync(file,file+'.old');}catch{}
  require('node:fs').appendFileSync(file,`${new Date().toISOString()} ${message}\n`);}catch{}
}
function fatal(title,detail){
 if(startupFailed)return;startupFailed=true;log(`ERRORE ${title}: ${detail}`);
 try{dialog.showErrorBox(`SocialDesk — ${title}`,`${detail}\n\nRegistro: ${startupLog()}`);}catch{}
 app.exit(1);
}
process.on('uncaughtException',e=>fatal('Errore imprevisto',e?.stack||String(e)));
process.on('unhandledRejection',e=>fatal('Errore imprevisto',e?.stack||String(e)));
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
function createWindow(){
 log('creazione finestra');
 window=new BrowserWindow({width:1000,height:820,minWidth:580,minHeight:620,title:'SocialDesk',backgroundColor:'#ffffff',show:false,
  // Mac: niente barra del titolo nativa (e niente riga sotto): l'header dell'app arriva in cima e i pulsanti della finestra stanno sopra
  ...(process.platform==='darwin'?{titleBarStyle:'hiddenInset',trafficLightPosition:{x:18,y:26}}:{}),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('will-navigate',(event,url)=>{if(url!==page)event.preventDefault();});
 // Menu del tasto destro (Electron non ne mostra uno da solo): taglia/copia/incolla sul testo selezionato e nei campi.
 window.webContents.on('context-menu',(event,params)=>{
  const flags=params.editFlags||{},selected=!!(params.selectionText&&params.selectionText.trim()),template=[];
  if(params.isEditable&&params.misspelledWord){
   for(const word of (params.dictionarySuggestions||[]).slice(0,5))template.push({label:word,click:()=>window.webContents.replaceMisspelling(word)});
   if(template.length)template.push({type:'separator'});
  }
  if(params.isEditable)template.push({label:'Taglia',role:'cut',enabled:!!flags.canCut});
  if(params.isEditable||selected)template.push({label:'Copia',role:'copy',enabled:!!flags.canCopy});
  if(params.isEditable)template.push({label:'Incolla',role:'paste',enabled:!!flags.canPaste});
  if(params.isEditable||selected)template.push({type:'separator'},{label:'Seleziona tutto',role:'selectAll'});
  if(template.length)Menu.buildFromTemplate(template).popup({window});
 });
 window.on('close',event=>{if(busy){event.preventDefault();dialog.showMessageBox(window,{type:'info',message:'Un’operazione è in corso. Attendi il completamento prima di chiudere.'});}});
 const reveal=()=>{if(window&&!window.isDestroyed()&&!window.isVisible()){window.show();log('finestra mostrata');}};
 window.once('ready-to-show',reveal);
 // Se la pagina non è pronta in 15 secondi, mostra comunque la finestra.
 setTimeout(()=>{if(window&&!window.isDestroyed()&&!window.isVisible()){log('pagina non pronta dopo 15 s: mostro la finestra');reveal();}},15000);
 window.webContents.on('render-process-gone',(event,details)=>fatal('La finestra si è chiusa in modo imprevisto',`Motivo: ${details.reason} (codice ${details.exitCode}).\nSe hai avviato SocialDesk da una cartella di rete, installalo sul PC con il programma di installazione SocialDesk-Setup.`));
 window.webContents.on('did-fail-load',(event,code,description,url)=>{if(url===page)fatal('Impossibile caricare la pagina',`${description} (${code}).`);});
 window.webContents.on('preload-error',(event,file,error)=>fatal('Errore di caricamento',`${file}: ${error?.message||error}`));
 window.loadFile(path.join(__dirname,'ui/index.html'));
}
app.on('child-process-gone',(event,details)=>log(`processo interno terminato: ${details.type} ${details.reason} (${details.exitCode})`));
if(!app.requestSingleInstanceLock()){log('già in esecuzione: passo il controllo alla finestra aperta');app.quit();}
else{
 app.on('second-instance',()=>{log('secondo avvio: mostro la finestra');if(window&&!window.isDestroyed()){if(window.isMinimized())window.restore();window.show();window.focus();}});
 app.whenReady().then(async()=>{
  log(`avvio ${app.getVersion()} ${process.platform} ${process.arch} exe=${process.execPath}`);
  // Windows: la cartella del programma non può essere avviata da una condivisione di rete.
  if(process.platform==='win32'&&/^\\\\/.test(process.execPath)){
   fatal('Avvio da cartella di rete non supportato','SocialDesk è stato avviato direttamente dal NAS. Windows non permette a SocialDesk di funzionare da una cartella di rete.\n\nInstallalo sul PC aprendo il programma di installazione SocialDesk-Setup, poi avvialo dal menu Start o dall’icona sul desktop.\nI dati possono restare sul NAS.');return;
  }
  await preferences();
  // residui di un aggiornamento interrotto accanto all'app (solo app installata su Mac)
  if(app.isPackaged&&process.platform==='darwin')update.cleanupLeftovers().then(n=>{if(n)log(`rimossi ${n} residui di aggiornamento`);}).catch(()=>{});
  log(`cartella Social: ${root||'(non scelta)'}`);
  if(process.platform==='darwin')Menu.setApplicationMenu(Menu.buildFromTemplate([{role:'appMenu'},{role:'editMenu'},{role:'windowMenu'}]));else Menu.setApplicationMenu(null);
  endpoint('social:initial',async()=>{
   const version=app.getVersion();
   if(!root)return{root:'',valid:false,version};
   try{await rootInfo(root);return{root,valid:true,version};}catch(e){return{root,valid:false,version,message:errorMessage(e).message};}
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
  endpoint('social:sync-assets',async()=>{if(busy)throw new PostError('BUSY','Un’operazione è già in corso.');busy=true;try{return await syncAssetArchive(root);}finally{busy=false;}});
  endpoint('social:save-text-backup',async input=>{if(busy)throw new PostError('BUSY','Un’operazione è già in corso.');busy=true;try{return await saveTextBackup(root,input);}finally{busy=false;}});
  endpoint('social:open-text-backup',async input=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');const file=await resolveTextBackup(root,input);const error=await shell.openPath(file);if(error)throw new Error(error);return true;});
  endpoint('social:copy-text',async text=>{if(typeof text!=='string'||Buffer.byteLength(text)>1024*1024)throw new PostError('INPUT','Il testo da copiare non è valido.');clipboard.writeText(text);return true;});
  endpoint('social:open-post-folder',async input=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');const folder=await resolvePostFolder(root,input);const error=await shell.openPath(folder);if(error)throw new Error(error);return true;});
  endpoint('social:illustrator-files',async input=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');return illustratorFiles(root,input);});
  endpoint('social:illustrator-data',async input=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');return illustratorData(root,input);});
  endpoint('social:open-illustrator',async input=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');const file=await resolveIllustrator(root,input);const error=await shell.openPath(file);if(error)throw new Error(error);return true;});
  endpoint('social:update-status',async input=>{
   if(busy)throw new PostError('BUSY','Un’operazione è già in corso.');
   busy=true;
   try{const plan=await planPostStatus(root,input);if(!plan.changed)return plan;return await savePostStatus(root,input);}finally{busy=false;}
  });
  endpoint('social:delete-post',async input=>{
   if(busy)throw new PostError('BUSY','Un’operazione è già in corso.');
   busy=true;
   try{
    const plan=await planDeletePost(root,input);
    const confirmation=await dialog.showMessageBox(window,{type:'warning',title:'Elimina post',message:`Eliminare “${plan.title}” per ${plan.channel}?`,detail:`Verrà rimossa solo questa riga dal piano editoriale. ${plan.partial?(plan.trashRelative?`La cartella è condivisa con gli altri social: solo i file di ${plan.channel} (${plan.movedFiles.length}) saranno spostati in:\n${plan.trashRelative}`:`La cartella è condivisa con gli altri social e non contiene file di ${plan.channel}: nessun file verrà spostato.`):`La cartella del post sarà spostata in:\n${plan.trashRelative}`}\n\nGli altri social dello stesso post resteranno invariati.\nLe modifiche non salvate in questa schermata verranno scartate.`,buttons:['Annulla','Elimina'],defaultId:0,cancelId:0,noLink:true});
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
    
    return await savePostEdit(root,input,fingerprint);
   }finally{busy=false;}
  });
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
  // Rigenera sorgente: ricrea il file Illustrator o di testo mancante (mai sovrascrivendo)
  endpoint('social:add-channel',async input=>{
   if(busy)throw new PostError('BUSY','Un’operazione è già in corso.');
   busy=true;
   try{
    const plan=await planAddChannel(root,{key:input?.key,revision:input?.revision,channel:input?.channel,format:input?.format});
    const confirmation=await dialog.showMessageBox(window,{type:'question',title:'Aggiungi social',message:`Creare “${plan.title}” anche per ${plan.channel}?`,detail:`Verrà aggiunta una riga ${plan.channel} con lo stesso ID (${plan.id}) e lo stato “testi da creare”. Nella cartella del post verranno creati ${plan.files.join(' e ')}${plan.aiExists||plan.mdExists?' (i file già presenti restano come sono)':''}.`,buttons:['Annulla','Sì, crea'],defaultId:0,cancelId:0,noLink:true});
    if(confirmation.response!==1)return{canceled:true};
    return await addChannel(root,{key:input.key,revision:input.revision,channel:input.channel,format:input.format});
   }finally{busy=false;}
  });
  endpoint('social:regenerate-source',async input=>{if(busy)throw new PostError('BUSY','Un’operazione è già in corso.');busy=true;try{return await regenerateSource(root,input);}finally{busy=false;}});
  // Ricollega cartella: post con la cartella rinominata a mano
  endpoint('social:missing-folders',async()=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');return relink.missingFolders(root);});
  endpoint('social:relink-candidates',async input=>{if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione.');return relink.relinkCandidates(root,input);});
  endpoint('social:relink',async input=>{
   if(busy)throw new PostError('BUSY','Un’operazione è già in corso.');
   busy=true;
   try{
    let chosen=null;
    if(input&&input.browse){
     const candidates=await relink.relinkCandidates(root,input);
     const result=await dialog.showOpenDialog(window,{title:'Scegli la cartella del post',buttonLabel:'Ricollega questa cartella',properties:['openDirectory'],defaultPath:path.join(root,...candidates.parent.split('/'))});
     if(result.canceled)return{canceled:true};
     chosen=result.filePaths[0];
    }
    const plan=await relink.planRelink(root,input,chosen);
    const answer=await dialog.showMessageBox(window,{type:'question',title:'Ricollega cartella',message:`Ricollegare “${plan.post.title}” (${plan.post.channel})?`,detail:`La cartella\n${plan.from}\nverrà rinominata in\n${plan.to}\ncioè il nome che il piano editoriale si aspetta. Il piano Excel e il contenuto dei file non cambiano.\n\nHai chiuso i file del post (Illustrator, testi, immagini)?`,buttons:['Annulla','Sì, ricollega'],defaultId:0,cancelId:0,noLink:true});
    if(answer.response!==1)return{canceled:true};
    return await relink.relinkFolder(root,input,chosen);
   }finally{busy=false;}
  });
  // Aggiornamento da App Social/versione.json nella cartella Social (NAS)
  endpoint('social:check-update',async()=>update.checkUpdate(root,app.getVersion()));
  endpoint('social:install-update',async()=>{
   if(busy)throw new PostError('BUSY','Attendi la fine dell’operazione in corso, poi aggiorna.');
   busy=true;
   try{
    const plan=await update.prepareUpdate(root,{currentVersion:app.getVersion(),packaged:app.isPackaged});
    log(`aggiornamento a ${plan.version} (${plan.platform}${plan.restartOnly?', solo riavvio':''})`);
    if(plan.restartOnly){busy=false;setTimeout(()=>{app.relaunch();app.exit(0);},400);return{started:true,version:plan.version};}
    if(plan.platform==='darwin')await update.launchMacUpdate(plan,{keepEnv:!!process.env.SOCIAL_TEST_ROOT});
    else await update.launchWindowsUpdate(plan);
    busy=false;setTimeout(()=>app.quit(),600);
    return{started:true,version:plan.version};
   }finally{busy=false;}
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
