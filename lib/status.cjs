'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const os=require('node:os');
const {Book}=require('./workbook.cjs');
const {STATUSES}=require('./editor.cjs');
const {PostError,rootInfo,checkExcelClosed,assertContained}=require('./posts.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
async function prepare(root,input){
 if(!input||!/^\d{4}:\d+$/.test(input.key||'')||!/^[a-f0-9]{64}$/.test(input.revision||'')||typeof input.status!=='string')throw new PostError('INPUT','Seleziona un post e uno stato validi.');
 const status=input.status.trim().toLowerCase();if(!STATUSES.includes(status))throw new PostError('INPUT','Scegli uno degli stati disponibili.');
 const info=await rootInfo(root);await checkExcelClosed(info.root,info.book);
 const buffer=await fs.readFile(info.book);
 if(hash(buffer)!==input.revision)throw new PostError('CHANGED','Il piano è cambiato. Premi Aggiorna e riprova.');
 const workbook=new Book(buffer),post=workbook.posts().find(p=>p.key===input.key);
 if(!post)throw new PostError('MISSING','Non trovo più il post selezionato. Aggiorna l’elenco.');
 return{...info,buffer,workbook,post,status,changed:post.status.trim().toLowerCase()!==status};
}
const result=p=>({key:p.post.key,channel:p.post.channel,title:p.post.title,status:p.status,changed:p.changed});
async function planPostStatus(root,input){return result(await prepare(root,input));}
async function savePostStatus(root,input,options={}){
 const TOTAL=3;const step=(n,label)=>{try{options.progress?.(n,TOTAL,label);}catch{}};
 step(0,'Controllo del piano');
 const initial=await prepare(root,input);if(!initial.changed)return result(initial);
 const lock=path.join(initial.root,'.social-create.lock');let handle,stage;
 try{handle=await fs.open(lock,'wx');await handle.writeFile(JSON.stringify({app:'Social',pid:process.pid,host:os.hostname(),at:new Date().toISOString()}));await handle.close();}
 catch(e){if(handle)await handle.close().catch(()=>{});if(e.code==='EEXIST')throw new PostError('LOCKED','Un’altra operazione è in corso. Attendi e riprova.');throw e;}
 try{
  const p=await prepare(root,input);if(!p.changed)return result(p);
  const updated=p.workbook.updatePostStatus(p.post.year,p.post.row,p.status);
  step(1,'Copia di sicurezza del piano');
  stage=await fs.mkdtemp(path.join(p.root,'.social-stage-'));const stagedBook=path.join(stage,'piano.xlsx');await fs.writeFile(stagedBook,updated,{flag:'wx'});
  const backups=path.join(p.root,'.social-backups');await assertContained(p.root,backups);await fs.mkdir(backups,{recursive:true});
  const backup=path.join(backups,`Piano-${Date.now()}-${crypto.randomUUID()}.xlsx`);await fs.writeFile(backup,p.buffer,{flag:'wx'});
  await checkExcelClosed(p.root,p.book);
  if(hash(await fs.readFile(p.book))!==input.revision)throw new PostError('CHANGED','Il piano è cambiato durante il salvataggio. Nessuno stato è stato modificato.');
  if(options.failBeforeCommit)throw new Error('Errore di prova prima del salvataggio dello stato.');
  step(2,'Salvataggio del piano editoriale');
  await fs.rename(stagedBook,p.book);return{...result(p),backup};
 }finally{if(stage)await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});await fs.unlink(lock).catch(()=>{});}
}
module.exports={planPostStatus,savePostStatus};
