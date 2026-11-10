'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const os=require('node:os');
const {Book}=require('./workbook.cjs');
const {CHANNELS,FORMATS,PostError,rootInfo,checkExcelClosed,assertContained,slug,allCaps,CAPS_MESSAGE}=require('./posts.cjs');
const {primaryTextName,decodeText,MAX_TEXT_BYTES,selectedPost,sourceDirectory,TEXT_EXTENSIONS}=require('./details.cjs');
const layout=require('./layout.cjs');
const BACKUP_FOLDER='Copie di sicurezza';
const STATUSES=['testi da creare','testi in bozza','immagine da creare','da pubblicare','pubblicato'];
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const exists=async p=>fs.stat(p).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
const key=value=>value.normalize('NFC').toLowerCase();
async function safeRename(from,to){
 if(await exists(to)){
  const a=await fs.stat(from),b=await fs.stat(to);
  if(key(from)!==key(to)||a.ino!==b.ino||a.dev!==b.dev)throw new PostError('EXISTS','La destinazione è già occupata. Nessun file verrà sovrascritto.');
 }
 await fs.rename(from,to);
}
async function listPosts(root){
 const info=await rootInfo(root),buffer=await fs.readFile(info.book);
 const book=new Book(buffer);
 return{revision:hash(buffer),years:book.sheets().map(s=>s.getAttribute('name')).filter(n=>/^\d{4}$/.test(n)).map(Number),posts:book.posts()};
}
function validateChanges(input,post){
 const text=(name,max)=>{if(typeof input[name]!=='string'||input[name].trim().length>max)throw new PostError('INPUT',`Il campo ${name} non è valido.`);return input[name].trim();};
 const title=text('title',140),topic=text('topic',200),format=text('format',100),status=text('status',100);
 if(!title||!slug(title)||Buffer.byteLength(slug(title)+'_instagram.ai')>240)throw new PostError('INPUT','Inserisci un titolo valido e non troppo lungo.');
 if(allCaps(title)&&title!==post.title)throw new PostError('INPUT',CAPS_MESSAGE);
 if(format!==''&&!FORMATS.includes(format)&&format!==post.format)throw new PostError('INPUT','Scegli un formato valido.');
 if(!STATUSES.includes(status)&&status!==post.status)throw new PostError('INPUT','Scegli uno stato valido.');
 let date=null;
 if(input.undefinedDate!==true){
  date=String(input.date||'');const parsed=new Date(date+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw new PostError('INPUT','Inserisci una data valida.');
  if(Number(date.slice(0,4))!==post.year)throw new PostError('YEAR',`Scegli una data del ${post.year}. Il cambio di anno non è ancora disponibile.`);
 }
 return{title,topic,format,status,date};
}
function sourceParts(relative,post){
 const parsed=layout.parseSources(relative,post);
 if(!parsed)throw new PostError('PATH','Il collegamento ai sorgenti non corrisponde alla struttura Social.');
 return parsed;
}
async function inventory(root,folder){
 const files=[];
 async function walk(dir){
  await assertContained(root,dir);
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
   if(entry.name==='.DS_Store')continue;
   const full=path.join(dir,entry.name);
   if(entry.isSymbolicLink())throw new PostError('PATH','Il post contiene collegamenti simbolici. Verifica i sorgenti prima di rinominarlo.');
   if(entry.isDirectory())await walk(full);
   else if(entry.isFile()){const stat=await fs.stat(full);files.push({relative:path.relative(folder,full).split(path.sep).join('/'),size:stat.size,mtime:stat.mtimeMs});}
  }
 }
 await walk(folder);return files.sort((a,b)=>a.relative.localeCompare(b.relative));
}
async function prepareTextEdit(root,oldPath,files,post,input,unified){
 if(input.postText===undefined)return null;
 if(typeof input.postText!=='string'||Buffer.byteLength(input.postText)>MAX_TEXT_BYTES||!/^[a-f0-9]{64}$/.test(input.textRevision||''))throw new PostError('INPUT','Il testo del post non è valido o supera 1 MB.');
 const names=files.filter(file=>path.posix.dirname(file.relative)==='01_Sorgenti').map(file=>path.posix.basename(file.relative)).filter(name=>layout.visibleFor(name,post.channel,unified));
 const name=primaryTextName(names,post);
 if(!name||name!==input.textName)throw new PostError('TEXT_CHANGED','Il file di testo principale è cambiato. Riapri Modifica post.');
 const original=path.join(oldPath,'01_Sorgenti',name);await assertContained(root,original);
 const stat=await fs.lstat(original);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_TEXT_BYTES)throw new PostError('INPUT','Il file di testo principale non può essere modificato.');
 const bytes=await fs.readFile(original),revision=hash(bytes);
 if(bytes.length>MAX_TEXT_BYTES||revision!==input.textRevision)throw new PostError('TEXT_CHANGED','Il testo è cambiato dopo l’apertura. Riapri Modifica post.');
 const current=decodeText(bytes).replace(/\r\n/g,'\n');
 const changed=input.postText!==current;
 const content=changed?Buffer.from(input.postText.replace(/\r?\n/g,bytes.includes(Buffer.from('\r\n'))?'\r\n':'\n'),'utf8'):null;
 if(content&&content.length>MAX_TEXT_BYTES)throw new PostError('INPUT','Il testo del post supera 1 MB.');
 return{name,relative:`01_Sorgenti/${name}`,revision,changed,content};
}
function renamesFor(allFiles,post,link,changes,newFolder,shared){
 if(changes.title===post.title)return[];
 const newSlug=slug(changes.title),oldFolder=link.folder;
 // Nella cartella unificata si rinominano solo i file di questo social (e, se la cartella
 // non è condivisa con altri social, anche quelli comuni senza suffisso).
 const files=link.unified?allFiles.filter(f=>{const name=path.posix.basename(f.relative);return shared?layout.ownedBy(name,post.channel):layout.visibleFor(name,post.channel,true);}):allFiles;
 const oldStem=link.unified?oldFolder.replace(/^\d+_/,''):oldFolder.slice(6);
 const candidates=[[oldFolder,newFolder],[oldStem,newSlug],[slug(post.title),newSlug],[post.title.normalize('NFC'),newSlug]].sort((a,b)=>b[0].length-a[0].length);
 const sources=files.filter(f=>path.posix.dirname(f.relative)==='01_Sorgenti');
 const result=[];
 for(const file of files){
  const name=path.posix.basename(file.relative).normalize('NFC'),ext=path.posix.extname(name),stem=name.slice(0,-ext.length||undefined);
  let replacement;
  for(const [prefix,next] of candidates){
   if(!prefix)continue;
   if(key(stem).startsWith(key(prefix))&&(stem.length===prefix.length||/^[ _.-]/.test(stem.slice(prefix.length)))){replacement=next+stem.slice(prefix.length)+ext;break;}
  }
  // I sorgenti principali storici possono avere un nome diverso dal titolo.
  if(!replacement&&path.posix.dirname(file.relative)==='01_Sorgenti'&&['.ai','.md','.txt'].includes(ext.toLowerCase())&&sources.filter(f=>path.posix.extname(f.relative).toLowerCase()===ext.toLowerCase()).length===1)replacement=`${newSlug}_${CHANNELS[post.channel].suffix}${ext}`;
  if(replacement&&replacement!==path.posix.basename(file.relative)){
   if(Buffer.byteLength(replacement)>240)throw new PostError('PATH','Il titolo rende troppo lungo il nome di un file. Accorcialo.');
   result.push({from:file.relative,to:path.posix.join(path.posix.dirname(file.relative),replacement)});
  }
 }
 const planned=new Map(result.map(r=>[r.from,r.to])),targets=new Set();
 for(const file of allFiles){const dest=key(planned.get(file.relative)||file.relative);if(targets.has(dest))throw new PostError('EXISTS','La rinomina creerebbe due file con lo stesso nome. Nessun file è stato modificato.');targets.add(dest);}
 // Non scambiare tra loro nomi già esistenti: rendere prima esplicito il conflitto.
 for(const r of result)if(allFiles.some(f=>key(f.relative)===key(r.to)&&key(f.relative)!==key(r.from)))throw new PostError('EXISTS','Uno dei nuovi nomi è già usato da un altro file.');
 return result;
}
async function prepare(root,input){
 if(!input||!/^\d{4}:\d+$/.test(input.key||'')||!/^[a-f0-9]{64}$/.test(input.revision||''))throw new PostError('INPUT','Seleziona un post dall’elenco aggiornato.');
 const info=await rootInfo(root);await checkExcelClosed(info.root,info.book);
 const buffer=await fs.readFile(info.book);
 if(hash(buffer)!==input.revision)throw new PostError('CHANGED','Il piano è cambiato. Aggiorna l’elenco e seleziona di nuovo il post.');
 const workbook=new Book(buffer),posts=workbook.posts(),post=posts.find(p=>p.key===input.key);
 if(!post)throw new PostError('MISSING','Non trovo più il post selezionato. Aggiorna l’elenco.');
 const changes=validateChanges(input,post);
 let link;
 try{link=sourceParts(post.sourcesRelative,post);}catch(e){link=null;}
 // percorso reale (anche con accenti scritti in forma diversa dal collegamento)
 const locate=async candidate=>{await assertContained(info.root,path.join(info.root,...candidate.parts.slice(0,3)));return layout.existingPath(info.root,candidate.parts.slice(0,3));};
 let oldPath=link&&await locate(link);
 if(!link||!oldPath){
  try{const decoded=sourceParts(decodeURIComponent(post.sourcesRelative),post);const found=await locate(decoded);if(found||!link){link=decoded;oldPath=found;}}catch{if(!link)throw new PostError('PATH','Il collegamento ai sorgenti non corrisponde alla struttura Social.');}
 }
 if(!oldPath)throw new PostError('MISSING','Non trovo la cartella sorgenti del post. Nessun file è stato modificato.');
 const parts=link.parts;
 await assertContained(info.root,oldPath);
 const sources=path.join(oldPath,'01_Sorgenti');await assertContained(info.root,sources);
 if(!await exists(sources))throw new PostError('MISSING','Non trovo la cartella sorgenti del post. Nessun file è stato modificato.');
 const sameFolder=p=>{try{const other=layout.parseLink(p.sourcesRelative||'',p);return other&&key(other.relative)===key(link.relative);}catch{return false;}};
 const shared=posts.some(p=>p.key!==post.key&&sameFolder(p));
 let folderName;
 if(link.unified){
  // ID_Titolo: la data non fa parte del nome; il titolo cambia la cartella solo se non è condivisa con altri social.
  const id=link.folder.match(layout.UNIFIED_FOLDER)?.[1];
  folderName=changes.title!==post.title&&!shared&&id!==undefined?layout.unifiedFolderName(id,slug(changes.title)):link.folder;
 }else folderName=`${changes.date?changes.date.slice(5):'xx-xx'}_${changes.title===post.title?parts[2].slice(6):slug(changes.title)}`;
 // Se il nome non cambia, la cartella resta quella reale e il collegamento resta quello del piano.
 const oldRelative=parts.slice(0,3).join('/'),newRelative=[parts[0],parts[1],folderName].join('/'),newPath=folderName===link.folder?oldPath:path.join(path.dirname(oldPath),folderName);
 await assertContained(info.root,newPath);
 if(oldPath!==newPath&&await exists(newPath)){
  const a=await fs.stat(oldPath),b=await fs.stat(newPath);
  if(key(oldPath)!==key(newPath)||a.ino!==b.ino||a.dev!==b.dev)throw new PostError('EXISTS','La cartella con il nuovo nome esiste già. Nessun file verrà sovrascritto.');
 }
 const files=await inventory(info.root,oldPath),renames=renamesFor(files,post,link,changes,folderName,shared);
 const textEdit=await prepareTextEdit(info.root,oldPath,files,post,input,link.unified);
 if(!link.unified&&(oldRelative!==newRelative||renames.length)&&shared)throw new PostError('SHARED','La cartella è collegata anche a un’altra riga del piano. Verifica i collegamenti prima di rinominare.');
 if(process.platform==='win32'&&files.some(f=>path.join(newPath,...(renames.find(r=>r.from===f.relative)?.to||f.relative).split('/')).length>248))throw new PostError('PATH','Il percorso dei file è troppo lungo per Windows. Accorcia il titolo.');
 const fingerprint=hash(JSON.stringify({root:info.root,key:post.key,revision:input.revision,changes,oldRelative,newRelative,files,renames,textEdit:textEdit&&{name:textEdit.name,revision:textEdit.revision,content:textEdit.content&&hash(textEdit.content)}}));
 return{...info,buffer,workbook,post,changes,oldRelative,newRelative,oldPath,newPath,renames,textEdit,fingerprint};
}
const preview=p=>({key:p.post.key,year:p.post.year,channel:p.post.channel,id:p.post.id,previous:{title:p.post.title,topic:p.post.topic,format:p.post.format,status:p.post.status,date:p.post.date},changes:p.changes,oldRelative:p.oldRelative,newRelative:p.newRelative,renames:p.renames,textChanged:!!p.textEdit?.changed,textName:p.textEdit?.name||null,fingerprint:p.fingerprint});
async function planPostEdit(root,input){return preview(await prepare(root,input));}
async function savePostEdit(root,input,fingerprint,options={}){
 const initial=await prepare(root,input),lock=path.join(initial.root,'.social-create.lock');let handle;
 try{handle=await fs.open(lock,'wx');await handle.writeFile(JSON.stringify({app:'Social',pid:process.pid,host:os.hostname(),at:new Date().toISOString()}));await handle.close();}
 catch(e){if(handle)await handle.close().catch(()=>{});if(e.code==='EEXIST')throw new PostError('LOCKED','Un’altra operazione è in corso. Attendi e riprova.');throw e;}
 let p,stage,folderMoved=false,textWritten=false,committed=false,recovery=false;const renamed=[];
 try{
  p=await prepare(root,input);
  if(p.fingerprint!==fingerprint)throw new PostError('CHANGED','I file o i dati del post sono cambiati. Controlla di nuovo il riepilogo.');
  const updated=p.workbook.updatePost(p.post.year,p.post.row,p.changes,p.newRelative+'/01_Sorgenti');
  stage=await fs.mkdtemp(path.join(p.root,'.social-stage-'));
  const stagedBook=path.join(stage,'piano.xlsx');await fs.writeFile(stagedBook,updated,{flag:'wx'});
  if(p.textEdit?.changed){
   await fs.writeFile(path.join(stage,'testo-nuovo.txt'),p.textEdit.content,{flag:'wx'});
   await fs.copyFile(path.join(p.oldPath,...p.textEdit.relative.split('/')),path.join(stage,'testo-originale.txt'));
  }
  const backups=path.join(p.root,'.social-backups');await assertContained(p.root,backups);await fs.mkdir(backups,{recursive:true});
  const backup=path.join(backups,`Piano-${Date.now()}-${crypto.randomUUID()}.xlsx`);await fs.writeFile(backup,p.buffer,{flag:'wx'});
  await fs.writeFile(path.join(stage,'rinomine.json'),JSON.stringify({old:p.oldRelative,new:p.newRelative,renames:p.renames,backup},null,2));
  await checkExcelClosed(p.root,p.book);
  if(hash(await fs.readFile(p.book))!==input.revision)throw new PostError('CHANGED','Il piano è cambiato prima del salvataggio. Aggiorna l’elenco.');
  for(const rename of p.renames){
   const from=path.join(p.oldPath,...rename.from.split('/')),to=path.join(p.oldPath,...rename.to.split('/'));
   await assertContained(p.root,from);await assertContained(p.root,to);
   if(await exists(to)){const a=await fs.stat(from),b=await fs.stat(to);if(key(from)!==key(to)||a.ino!==b.ino||a.dev!==b.dev)throw new PostError('EXISTS','Uno dei nomi file è già occupato. Operazione annullata.');}
   await safeRename(from,to);renamed.push(rename);
   if(options.failAfterFileRename)throw new Error('Errore di prova dopo la rinomina di un file.');
  }
  if(p.oldPath!==p.newPath){
   if(await exists(p.newPath)){const a=await fs.stat(p.oldPath),b=await fs.stat(p.newPath);if(key(p.oldPath)!==key(p.newPath)||a.ino!==b.ino||a.dev!==b.dev)throw new PostError('EXISTS','La cartella di destinazione è stata creata nel frattempo.');}
   await safeRename(p.oldPath,p.newPath);folderMoved=true;
  }
  if(options.failAfterFolderRename)throw new Error('Errore di prova dopo la rinomina della cartella.');
  if(p.textEdit?.changed){
   const renamedText=p.renames.find(item=>item.from===p.textEdit.relative)?.to||p.textEdit.relative;
   const target=path.join(p.newPath,...renamedText.split('/'));await assertContained(p.root,target);
   if(hash(await fs.readFile(target))!==p.textEdit.revision)throw new PostError('TEXT_CHANGED','Il testo è cambiato durante il salvataggio. Operazione annullata.');
   await fs.rename(path.join(stage,'testo-nuovo.txt'),target);textWritten=true;
   if(options.failAfterTextWrite)throw new Error('Errore di prova dopo la modifica del testo.');
  }
  await checkExcelClosed(p.root,p.book);
  if(hash(await fs.readFile(p.book))!==input.revision)throw new PostError('CHANGED','Il piano è cambiato durante il salvataggio. Operazione annullata.');
  await fs.rename(stagedBook,p.book);committed=true;return{...preview(p),backup};
 }catch(e){
  if(!committed&&p){
   if(textWritten){
    const renamedText=p.renames.find(item=>item.from===p.textEdit.relative)?.to||p.textEdit.relative;
    const target=path.join(folderMoved?p.newPath:p.oldPath,...renamedText.split('/'));
    try{await fs.copyFile(path.join(stage,'testo-originale.txt'),target);}catch{recovery=true;}
   }
   let current=p.oldPath;
   if(folderMoved){try{await safeRename(p.newPath,p.oldPath);}catch{recovery=true;current=p.newPath;}}
   for(const r of [...renamed].reverse())try{await safeRename(path.join(current,...r.to.split('/')),path.join(current,...r.from.split('/')));}catch{recovery=true;}
   if(recovery)throw new PostError('RECOVERY',`Ripristino incompleto: conserva i file e verifica il registro in ${path.basename(stage)}. Il piano precedente è in .social-backups.`);
  }
  throw e;
 }finally{if(stage&&!recovery)await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});await fs.unlink(lock).catch(()=>{});}
}
// Salva il testo dell'utente come copia separata quando il file è stato
// cambiato da altri: non tocca il file originale né il piano Excel.
async function saveTextBackup(root,input){
 if(!input||typeof input.content!=='string'||Buffer.byteLength(input.content)>MAX_TEXT_BYTES)throw new PostError('INPUT','Il testo da salvare non è valido o supera 1 MB.');
 const name=String(input.textName||'');
 if(!name||/[\\/\x00-\x1f:]/.test(name)||!TEXT_EXTENSIONS.includes(path.extname(name).toLowerCase()))throw new PostError('INPUT','Il nome del file di testo non è valido.');
 const selected=await selectedPost(root,input);
 const sources=await sourceDirectory(selected.root,selected.post);
 const folder=path.join(sources,BACKUP_FOLDER);await assertContained(selected.root,folder);
 await fs.mkdir(folder,{recursive:true});
 const stat=await fs.lstat(folder);if(stat.isSymbolicLink()||!stat.isDirectory())throw new PostError('PATH','La cartella delle copie di sicurezza non è valida.');
 const now=new Date(),pad=n=>String(n).padStart(2,'0');
 const stamp=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}`;
 const stem=name.slice(0,-path.extname(name).length);
 const data=Buffer.from(input.content.replace(/\r?\n/g,'\n'),'utf8');
 for(let i=1;i<100;i++){
  const file=`${stem} - copia ${stamp}${i>1?` (${i})`:''}.md`,target=path.join(folder,file);
  await assertContained(selected.root,target);
  try{await fs.writeFile(target,data,{flag:'wx'});return{name:file,relative:path.relative(selected.root,target).split(path.sep).join('/')};}
  catch(e){if(e.code!=='EEXIST')throw e;}
 }
 throw new PostError('EXISTS','Non riesco a scegliere un nome libero per la copia di sicurezza.');
}
// Percorso di una copia di sicurezza del post selezionato (solo per aprirla).
async function resolveTextBackup(root,input){
 const name=String(input?.name||'');
 if(!name||/[\\/\x00-\x1f:]/.test(name)||path.extname(name).toLowerCase()!=='.md')throw new PostError('INPUT','Copia di sicurezza non valida.');
 const selected=await selectedPost(root,input);
 const file=path.join(await sourceDirectory(selected.root,selected.post),BACKUP_FOLDER,name);
 await assertContained(selected.root,file);
 let stat;try{stat=await fs.lstat(file);}catch(e){if(e.code==='ENOENT')throw new PostError('MISSING','La copia di sicurezza non è più disponibile.');throw e;}
 if(stat.isSymbolicLink()||!stat.isFile())throw new PostError('INPUT','Copia di sicurezza non valida.');
 return file;
}
module.exports={STATUSES,listPosts,planPostEdit,savePostEdit,saveTextBackup,resolveTextBackup,BACKUP_FOLDER};
