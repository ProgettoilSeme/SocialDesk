'use strict';
// Rigenera sorgente: se in 01_Sorgenti manca il file Illustrator o il file di testo del post,
// lo ricrea come alla creazione (template del social copiato / testo vuoto) con il nome canonico
// Titolo_canale.ai/.md. Non sovrascrive mai. Il template dipende dal formato: se il post non ha un formato
// da immagine, il formato va scelto (input.format) e viene scritto nel piano (solo la colonna F della riga).
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {constants}=require('node:fs');
const crypto=require('node:crypto');
const {CHANNELS,PostError,assertContained,rootInfo,slug,templateFor,formatKind,VIDEO_EXTENSION,checkExcelClosed}=require('./posts.cjs');
const {Book}=require('./workbook.cjs');
const {selectedPost,sourceInfo,TEXT_EXTENSIONS}=require('./details.cjs');
const layout=require('./layout.cjs');
const KINDS={ai:{extensions:['.ai'],label:'file Illustrator'},md:{extensions:TEXT_EXTENSIONS,label:'file di testo'}};
async function regenerateSource(root,input){
 const kind=KINDS[input?.kind];
 if(!kind)throw new PostError('INPUT','Scegli il file da rigenerare.');
 const selected=await selectedPost(root,input),post=selected.post;
 const {folder,unified}=await sourceInfo(selected.root,post);
 const name=`${slug(post.title)}_${CHANNELS[post.channel].suffix}.${input.kind}`,file=path.join(folder,name);
 await assertContained(selected.root,file);
 const lock=path.join(selected.root,'.social-create.lock');let handle;
 try{handle=await fs.open(lock,'wx');await handle.writeFile(JSON.stringify({app:'Social',pid:process.pid,host:os.hostname(),at:new Date().toISOString()}));await handle.close();}
 catch(e){if(handle)await handle.close().catch(()=>{});if(e.code==='EEXIST')throw new PostError('LOCKED','Un’altra operazione è in corso. Attendi e riprova.');throw e;}
 try{
  const existing=(await fs.readdir(folder,{withFileTypes:true})).filter(e=>e.isFile()&&kind.extensions.includes(path.extname(e.name).toLowerCase())&&layout.visibleFor(e.name,post.channel,unified));
  if(existing.length)throw new PostError('EXISTS',`Nei sorgenti c’è già un ${kind.label} (${existing[0].name}): non serve rigenerarlo.`);
  if(input.kind==='ai'){
   const chosen=typeof input.format==='string'?input.format.trim():'';
   const format=chosen||(formatKind(post.format)==='ai'?post.format:'');
   if(!format)throw new PostError('FORMAT','Scegli il formato del post: il file Illustrator nasce dal template di quel formato.');
   if(!CHANNELS[post.channel].formats.includes(format)||formatKind(format)!=='ai')throw new PostError('INPUT',`${format} non è un formato da immagine di ${post.channel}.`);
   const template=await templateFor(selected.root,post.channel,format);
   const saveFormat=format!==post.format;
   if(saveFormat)await checkExcelClosed(selected.root,(await rootInfo(selected.root)).book);
   await fs.copyFile(template,file,constants.COPYFILE_EXCL);
   let backup;
   if(saveFormat){
    try{backup=await writeFormat(selected.root,post,format,input.revision);}
    catch(e){await fs.unlink(file).catch(()=>{});throw e;}
   }
   return{name,channel:post.channel,format,formatSaved:saveFormat,backup,template:path.relative(selected.root,template).split(path.sep).join('/')};
  }
  await fs.writeFile(file,'',{flag:'wx'});
  return{name,channel:post.channel};
 }catch(e){if(e.code==='EEXIST')throw new PostError('EXISTS',`Esiste già ${name}: non viene sovrascritto.`);throw e;}
 finally{await fs.unlink(lock).catch(()=>{});}
}
// Scrive il formato nella riga del post (con copia di sicurezza del piano); chiamata con il lock già preso
async function writeFormat(root,post,format,revision){
 const info=await rootInfo(root),buffer=await fs.readFile(info.book);
 if(crypto.createHash('sha256').update(buffer).digest('hex')!==revision)throw new PostError('CHANGED','Il piano è cambiato. Premi Aggiorna e riprova.');
 const updated=new Book(buffer).updatePostFormat(post.year,post.row,format);
 let stage;
 try{
  stage=await fs.mkdtemp(path.join(info.root,'.social-stage-'));const staged=path.join(stage,'piano.xlsx');await fs.writeFile(staged,updated,{flag:'wx'});
  const backups=path.join(info.root,'.social-backups');await assertContained(info.root,backups);await fs.mkdir(backups,{recursive:true});
  const backup=path.join(backups,`Piano-${Date.now()}-${crypto.randomUUID()}.xlsx`);await fs.writeFile(backup,buffer,{flag:'wx'});
  await checkExcelClosed(info.root,info.book);
  if(crypto.createHash('sha256').update(await fs.readFile(info.book)).digest('hex')!==revision)throw new PostError('CHANGED','Il piano è cambiato durante il salvataggio. Nessun file è stato creato.');
  await fs.rename(staged,info.book);
  return backup;
 }finally{if(stage)await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});}
}
// Dopo Modifica post: se il formato scelto ha un file (template .ai o video .mp4 vuoto) e nei sorgenti della
// piattaforma non ce n'è ancora uno di quel tipo, lo crea. Non sovrascrive mai e non tocca il piano.
const VIDEO_EXTENSIONS=['.mp4','.mov','.m4v','.webm'];
async function ensureFormatFile(root,key){
 const info=await rootInfo(root);
 const post=new Book(await fs.readFile(info.book)).posts().find(p=>p.key===key);
 const kind=post?formatKind(post.format):'';
 if(!post||!kind||!CHANNELS[post.channel])return null;
 let source;try{source=await sourceInfo(info.root,post);}catch{return null;}
 const {folder,unified}=source;
 const extensions=kind==='ai'?['.ai']:VIDEO_EXTENSIONS;
 let entries;try{entries=await fs.readdir(folder,{withFileTypes:true});}catch{return null;}
 if(entries.some(e=>e.isFile()&&extensions.includes(path.extname(e.name).toLowerCase())&&layout.visibleFor(e.name,post.channel,unified)))return null;
 const name=`${slug(post.title)}_${CHANNELS[post.channel].suffix}${kind==='ai'?'.ai':VIDEO_EXTENSION}`,file=path.join(folder,name);
 await assertContained(info.root,file);
 try{
  if(kind==='ai')await fs.copyFile(await templateFor(info.root,post.channel,post.format),file,constants.COPYFILE_EXCL);
  else await fs.writeFile(file,'',{flag:'wx'});
 }catch(e){if(e.code==='EEXIST')return null;throw e;}
 return{name,kind,format:post.format};
}
module.exports={regenerateSource,ensureFormatFile};
