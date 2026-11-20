'use strict';
// Rigenera sorgente: se in 01_Sorgenti manca il file Illustrator o il file di testo del post,
// lo ricrea come alla creazione (template del social copiato / testo vuoto) con il nome canonico
// Titolo_canale.ai/.md. Non sovrascrive mai e non tocca il piano Excel.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {constants}=require('node:fs');
const {CHANNELS,PostError,assertContained,rootInfo,slug,templateFor,formatKind,VIDEO_EXTENSION}=require('./posts.cjs');
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
   const template=await templateFor(selected.root,post.channel,formatKind(post.format)==='ai'?post.format:'');
   await fs.copyFile(template,file,constants.COPYFILE_EXCL);
   return{name,channel:post.channel,template:path.relative(selected.root,template).split(path.sep).join('/')};
  }
  await fs.writeFile(file,'',{flag:'wx'});
  return{name,channel:post.channel};
 }catch(e){if(e.code==='EEXIST')throw new PostError('EXISTS',`Esiste già ${name}: non viene sovrascritto.`);throw e;}
 finally{await fs.unlink(lock).catch(()=>{});}
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
