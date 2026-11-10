'use strict';
// Aggiungi social: crea la riga di un altro social per un post già esistente (stesso anno e ID),
// nella stessa cartella 01_Posts, con il template del social (.ai) e un testo vuoto (.md).
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {Book}=require('./workbook.cjs');
const {CHANNELS,FORMATS,PostError,checkExcelClosed,assertContained,slug,templateFor}=require('./posts.cjs');
const {selectedPost,sourceInfo}=require('./details.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const exists=p=>fs.lstat(p).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
async function prepare(root,input){
 if(!input||!CHANNELS[input.channel])throw new PostError('INPUT','Scegli il social da aggiungere.');
 const format=input.format||'';
 if(format&&!FORMATS.includes(format))throw new PostError('INPUT','Scegli un formato valido.');
 const selected=await selectedPost(root,input),post=selected.post;
 if(post.id===null||post.id===undefined||post.id==='')throw new PostError('INPUT','Il post non ha un ID: non posso collegare un altro social.');
 const buffer=await fs.readFile(path.join(selected.root,'Piano editoriale.xlsx'));
 if(hash(buffer)!==input.revision)throw new PostError('CHANGED','Il piano è cambiato. Aggiorna l’elenco e riprova.');
 const rows=new Book(buffer).posts().filter(p=>p.year===post.year&&p.id===post.id);
 if(rows.some(p=>p.channel===input.channel))throw new PostError('EXISTS',`Il post esiste già per ${input.channel}.`);
 const {folder,unified}=await sourceInfo(selected.root,post);
 if(!unified)throw new PostError('INPUT','Aggiungere un social è possibile solo con la cartella unica 01_Posts.');
 const name=slug(post.title)+'_'+CHANNELS[input.channel].suffix,ai=path.join(folder,name+'.ai'),md=path.join(folder,name+'.md');
 await assertContained(selected.root,ai);await assertContained(selected.root,md);
 const template=await templateFor(selected.root,input.channel);
 return{root:selected.root,book:path.join(selected.root,'Piano editoriale.xlsx'),buffer,post,channel:input.channel,format,ai,md,template,
  record:{channel:input.channel,title:post.title,topic:post.topic||'',format,date:null,sourcesRelative:post.sourcesRelative}};
}
async function planAddChannel(root,input){const p=await prepare(root,input);return{title:p.post.title,id:p.post.id,year:p.post.year,channel:p.channel,files:[path.basename(p.ai),path.basename(p.md)],aiExists:await exists(p.ai),mdExists:await exists(p.md)};}
async function addChannel(root,input,options={}){
 const initial=await prepare(root,input);
 const lock=path.join(initial.root,'.social-create.lock');let handle;
 try{handle=await fs.open(lock,'wx');await handle.writeFile(JSON.stringify({app:'SocialDesk',task:'aggiungi-social',pid:process.pid,host:os.hostname(),at:new Date().toISOString()}));await handle.close();}
 catch(e){if(handle)await handle.close().catch(()=>{});if(e.code==='EEXIST')throw new PostError('LOCKED','Un’altra operazione è in corso. Attendi e riprova.');throw e;}
 const created=[];let stage,committed=false;
 try{
  const p=await prepare(root,input);
  await checkExcelClosed(p.root,p.book);
  const updated=new Book(p.buffer).append(p.post.year,p.post.id,[p.record],{existingId:true});
  stage=await fs.mkdtemp(path.join(p.root,'.social-stage-'));
  const staged=path.join(stage,'piano.xlsx');await fs.writeFile(staged,updated,{flag:'wx'});
  const backups=path.join(p.root,'.social-backups');await fs.mkdir(backups,{recursive:true});
  const backup=path.join(backups,`Piano-${Date.now()}-${crypto.randomUUID()}.xlsx`);await fs.writeFile(backup,p.buffer,{flag:'wx'});
  // i file già presenti con lo stesso nome restano come sono
  if(!await exists(p.ai)){await fs.copyFile(p.template,p.ai,fs.constants.COPYFILE_EXCL);created.push(p.ai);}
  if(!await exists(p.md)){await fs.writeFile(p.md,'',{flag:'wx'});created.push(p.md);}
  if(options.failBeforeCommit)throw new Error('Errore di prova prima del salvataggio.');
  await checkExcelClosed(p.root,p.book);
  if(hash(await fs.readFile(p.book))!==hash(p.buffer))throw new PostError('CHANGED','Il piano è cambiato durante il salvataggio. Nessuna modifica.');
  await fs.rename(staged,p.book);committed=true;
  return{title:p.post.title,id:p.post.id,year:p.post.year,channel:p.channel,created:created.map(f=>path.basename(f)),backup};
 }catch(e){
  if(!committed)for(const f of created.reverse())await fs.unlink(f).catch(()=>{});
  throw e;
 }finally{if(stage)await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});await fs.unlink(lock).catch(()=>{});}
}
module.exports={planAddChannel,addChannel};
