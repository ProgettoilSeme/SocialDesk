'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const {Book}=require('./workbook.cjs');
const {selectedPost,sourceInfo}=require('./details.cjs');
const layout=require('./layout.cjs');
const {CHANNELS}=require('./posts.cjs');
const {PostError,checkExcelClosed,rootInfo,assertContained}=require('./posts.cjs');
const folders=require('./folders.cjs');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const exists=p=>fs.lstat(p).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
const normalized=p=>p.normalize('NFC').replace(/\\/g,'/').toLowerCase();
async function safePath(root,target){await assertContained(root,target);let current=root;for(const part of path.relative(root,target).split(path.sep).filter(Boolean)){current=path.join(current,part);try{if((await fs.lstat(current)).isSymbolicLink())throw new PostError('PATH','La cartella contiene un collegamento simbolico. Verifica il percorso prima di eliminare il post.');}catch(e){if(e.code==='ENOENT')break;throw e;}}}
async function inventory(root,folder){const entries=[];async function walk(dir){await safePath(root,dir);for(const entry of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isSymbolicLink())throw new PostError('PATH','Il post contiene collegamenti simbolici. Verifica i file prima di eliminarlo.');const stat=await fs.lstat(full);if(!stat.isFile()&&!stat.isDirectory())throw new PostError('PATH','Il post contiene elementi che non posso spostare.');entries.push({name:path.relative(folder,full).split(path.sep).join('/'),directory:stat.isDirectory(),size:stat.isFile()?stat.size:0,mtime:stat.mtimeMs});if(stat.isDirectory())await walk(full);}}await walk(folder);return entries.sort((a,b)=>a.name.localeCompare(b.name));}
async function prepare(root,input){
 const selected=await selectedPost(root,input),info=await rootInfo(selected.root);await checkExcelClosed(info.root,info.book);const buffer=await fs.readFile(info.book);
 if(hash(buffer)!==input.revision)throw new PostError('CHANGED','Il piano è cambiato. Premi Aggiorna e riprova.');
 const workbook=new Book(buffer),post=workbook.posts().find(p=>p.key===input.key);if(!post)throw new PostError('MISSING','Non trovo più il post selezionato.');
 const {folder:sources,unified}=await sourceInfo(info.root,post),oldPath=path.dirname(sources),oldRelative=path.relative(info.root,oldPath).split(path.sep).join('/');await safePath(info.root,sources);
 const references=value=>{const values=[value];try{values.push(decodeURIComponent(value));}catch{}return values.map(v=>normalized(v));};
 const shared=workbook.posts().some(p=>p.key!==post.key&&references(p.sourcesRelative).includes(normalized(oldRelative+'/01_Sorgenti')));
 // Struttura unificata con altri social nella stessa cartella: nel cestino vanno solo i file di questo social.
 const partial=unified&&shared;
 if(shared&&!partial)throw new PostError('SHARED','La cartella è collegata anche a un’altra riga del piano. Non posso spostarla nel cestino senza coinvolgere altri post.');
 const trashParent=path.join(await folders.folder(info.root,'trash'),...oldRelative.split('/').slice(0,2));await safePath(info.root,trashParent);
 const basename=path.basename(oldPath)+(partial?'_'+CHANNELS[post.channel].suffix:'');let destination=path.join(trashParent,basename),suffix=2;
 while(await exists(destination))destination=path.join(trashParent,basename+'__'+suffix++);
 await safePath(info.root,destination);const files=await inventory(info.root,oldPath);
 const moving=partial?files.filter(f=>!f.directory&&layout.ownedBy(path.posix.basename(f.name),post.channel)).map(f=>f.name):null;
 if(process.platform==='win32'&&(partial?moving:files.map(f=>f.name)).some(name=>path.join(destination,...name.split('/')).length>248))throw new PostError('PATH','Il percorso nel cestino sarebbe troppo lungo per Windows. Accorcia prima il titolo del post.');
 const trashRelative=path.relative(info.root,destination).split(path.sep).join('/'),updated=workbook.deletePost(post.year,post.row);
 const fingerprint=hash(JSON.stringify({key:post.key,revision:input.revision,oldRelative,trashRelative,files,moving}));
 return{...info,buffer,updated,post,oldPath,oldRelative,destination,trashRelative,moving,fingerprint};
}
const preview=p=>({key:p.post.key,title:p.post.title,channel:p.post.channel,year:p.post.year,id:p.post.id,oldRelative:p.oldRelative,trashRelative:p.moving&&!p.moving.length?null:p.trashRelative,partial:!!p.moving,movedFiles:p.moving||null,fingerprint:p.fingerprint});
async function planDeletePost(root,input){return preview(await prepare(root,input));}
async function deletePost(root,input,fingerprint,options={}){
 const TOTAL=4;const step=(n,label)=>{try{options.progress?.(n,TOTAL,label);}catch{}};
 step(0,'Controllo del post e dei file');
 const initial=await prepare(root,input),lock=path.join(initial.root,'.social-create.lock');let handle,stage,p,moved=false,committed=false,recovery=false;const created=[],movedFiles=[];
 try{handle=await fs.open(lock,'wx');await handle.writeFile(JSON.stringify({app:'SocialDesk',pid:process.pid,host:os.hostname(),at:new Date().toISOString()}));await handle.close();}
 catch(e){if(handle)await handle.close().catch(()=>{});if(e.code==='EEXIST')throw new PostError('LOCKED','Un’altra operazione è in corso. Attendi e riprova.');throw e;}
 try{
  p=await prepare(root,input);if(p.fingerprint!==fingerprint)throw new PostError('CHANGED','I file o la destinazione nel cestino sono cambiati. Riprova dopo aver controllato i dati.');
  step(1,'Copia di sicurezza del piano');
  stage=await fs.mkdtemp(path.join(p.root,'.social-stage-'));const stagedBook=path.join(stage,'piano.xlsx');await fs.writeFile(stagedBook,p.updated,{flag:'wx'});
  const backups=path.join(p.root,'.social-backups');await safePath(p.root,backups);await fs.mkdir(backups,{recursive:true});const backup=path.join(backups,`Piano-${Date.now()}-${crypto.randomUUID()}.xlsx`);await fs.writeFile(backup,p.buffer,{flag:'wx'});
  await fs.writeFile(path.join(stage,'eliminazione.json'),JSON.stringify({...preview(p),backup},null,2));
  async function ensure(dir){if(await exists(dir))return;await ensure(path.dirname(dir));await fs.mkdir(dir);created.push(dir);}
  await safePath(p.root,p.destination);if(!p.moving)await ensure(path.dirname(p.destination));
  await checkExcelClosed(p.root,p.book);if(hash(await fs.readFile(p.book))!==input.revision)throw new PostError('CHANGED','Il piano è cambiato prima dell’eliminazione. Premi Aggiorna e riprova.');
  if(await exists(p.destination))throw new PostError('EXISTS','La cartella nel cestino esiste già. Nessun file verrà sovrascritto.');
  step(2,'Spostamento nel cestino');
  if(p.moving){
   // solo i file di questo social, con le stesse sottocartelle (01_Sorgenti, 03_Export…)
   for(const name of p.moving){
    const from=path.join(p.oldPath,...name.split('/')),to=path.join(p.destination,...name.split('/'));
    await safePath(p.root,from);await safePath(p.root,to);await ensure(path.dirname(to));
    if(await exists(to))throw new PostError('EXISTS','Un file nel cestino esiste già. Nessun file verrà sovrascritto.');
    await fs.rename(from,to);movedFiles.push(name);moved=true;
    if(options.failAfterMove)throw new Error('Errore di prova dopo lo spostamento nel cestino.');
   }
  }else{await safePath(p.root,p.oldPath);await fs.rename(p.oldPath,p.destination);moved=true;}
  if(options.failAfterMove)throw new Error('Errore di prova dopo lo spostamento nel cestino.');
  if(options.beforeCommit)await options.beforeCommit(p);
  step(3,'Salvataggio del piano editoriale');
  await checkExcelClosed(p.root,p.book);if(hash(await fs.readFile(p.book))!==input.revision)throw new PostError('CHANGED','Il piano è cambiato durante l’eliminazione. La cartella viene ripristinata.');
  await fs.rename(stagedBook,p.book);committed=true;return{...preview(p),backup};
 }catch(e){
  if(moved&&!committed&&p.moving){
   for(const name of [...movedFiles].reverse()){try{const back=path.join(p.oldPath,...name.split('/'));if(await exists(back))throw new Error('occupato');await fs.rename(path.join(p.destination,...name.split('/')),back);}catch{recovery=true;}}
   if(recovery)throw new PostError('RECOVERY',`Non riesco a ripristinare alcuni file. Sono in ${p.trashRelative}; il piano precedente è in .social-backups. Conserva il registro ${path.basename(stage)}.`);
   for(const dir of [...created].reverse())await fs.rmdir(dir).catch(()=>{});
   created.length=0;
   // le sottocartelle create nel cestino per i file vengono tolte se vuote
   const cleanup=async dir=>{if(!dir.startsWith(p.destination))return;for(const e of await fs.readdir(dir,{withFileTypes:true}).catch(()=>[]))if(e.isDirectory())await cleanup(path.join(dir,e.name));await fs.rmdir(dir).catch(()=>{});};
   await cleanup(p.destination);
  }
  else if(moved&&!committed){try{if(await exists(p.oldPath))throw new Error('Percorso originale occupato.');await safePath(p.root,p.oldPath);await fs.rename(p.destination,p.oldPath);}catch{recovery=true;throw new PostError('RECOVERY',`Non riesco a ripristinare la cartella. I file sono in ${p.trashRelative}; il piano precedente è in .social-backups. Conserva il registro ${path.basename(stage)}.`);}}
  throw e;
 }finally{if(stage&&!recovery)await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});if(!committed)for(const dir of [...created].reverse())await fs.rmdir(dir).catch(()=>{});await fs.unlink(lock).catch(()=>{});}
}
module.exports={planDeletePost,deletePost};
