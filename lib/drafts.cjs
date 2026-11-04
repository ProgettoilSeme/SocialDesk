'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const os=require('node:os');
const {Book}=require('./workbook.cjs');
const {CHANNELS,PostError,rootInfo,checkExcelClosed,assertContained}=require('./posts.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const exists=async p=>fs.stat(p).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
async function listDrafts(root){
 const info=await rootInfo(root),buffer=await fs.readFile(info.book);
 return {revision:hash(buffer),drafts:new Book(buffer).drafts()};
}
async function prepare(root,input){
 if(!input || !/^\d{4}:\d+$/.test(input.key || '') || !/^[a-f0-9]{64}$/.test(input.revision || ''))throw new PostError('INPUT','Scegli una bozza dall’elenco aggiornato.');
 const info=await rootInfo(root);await checkExcelClosed(info.root,info.book);
 const buffer=await fs.readFile(info.book);
 if(hash(buffer)!==input.revision)throw new PostError('CHANGED','Il piano è cambiato. Aggiorna l’elenco e scegli di nuovo la bozza.');
 const workbook=new Book(buffer),draft=workbook.drafts().find(d=>d.key===input.key);
 if(!draft)throw new PostError('MISSING','La bozza non è più disponibile. Aggiorna l’elenco.');
 const date=String(input.date || '');
 const parsed=new Date(date+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw new PostError('INPUT','Inserisci una data valida.');
 if(Number(date.slice(0,4))!==draft.year)throw new PostError('YEAR',`Scegli una data del ${draft.year}. Lo spostamento di un post in un altro anno non è ancora disponibile.`);
 let relative;
 try{relative=decodeURIComponent(draft.sourcesRelative).replace(/\\/g,'/');}catch{throw new PostError('PATH','Il collegamento ai sorgenti non è valido.');}
 const segments=relative.split('/'),config=CHANNELS[draft.channel];
 if(!config || segments.length!==4 || segments[0]!==config.directory || segments[1]!==String(draft.year) || !/^(?:\d{2}-\d{2}|xx-xx)_.+/.test(segments[2]) || segments[3]!=='01_Sorgenti' || segments.some(s=>s==='.'||s==='..'||/[\x00-\x1f:]/.test(s)))throw new PostError('PATH','Il collegamento ai sorgenti non corrisponde alla struttura Social prevista.');
 const oldRelative=segments.slice(0,3).join('/'),newRelative=[segments[0],segments[1],date.slice(5)+'_'+segments[2].slice(6)].join('/');
 const oldPath=path.join(info.root,...segments.slice(0,3)),newPath=path.join(info.root,...newRelative.split('/'));
 await assertContained(info.root,oldPath);await assertContained(info.root,newPath);
 const sources=path.join(oldPath,'01_Sorgenti');await assertContained(info.root,sources);
 if(!await exists(sources))throw new PostError('MISSING','Non trovo la cartella sorgenti di questa bozza. Nessun file è stato modificato.');
 if(oldPath!==newPath && await exists(newPath))throw new PostError('EXISTS','Esiste già una cartella con questa data e questo nome. Nessun file verrà sovrascritto.');
 const fingerprint=hash(JSON.stringify({root:info.root,revision:input.revision,key:input.key,date,oldRelative,newRelative}));
 return {...info,buffer,workbook,draft,date,oldRelative,newRelative,oldPath,newPath,fingerprint};
}
const preview=p=>({key:p.draft.key,title:p.draft.title,channel:p.draft.channel,year:p.draft.year,date:p.date,oldRelative:p.oldRelative,newRelative:p.newRelative,fingerprint:p.fingerprint});
async function planDraftDate(root,input){return preview(await prepare(root,input));}
async function updateDraftDate(root,input,fingerprint,options={}){
 const initial=await prepare(root,input);
 const lock=path.join(initial.root,'.social-create.lock');let handle;
 try{handle=await fs.open(lock,'wx');await handle.writeFile(JSON.stringify({app:'Social',pid:process.pid,host:os.hostname(),at:new Date().toISOString()}));await handle.close();}
 catch(e){if(handle)await handle.close().catch(()=>{});if(e.code==='EEXIST')throw new PostError('LOCKED','Un’altra operazione è in corso. Attendi e riprova.');throw e;}
 let stage,moved=false,committed=false,p;
 try{
  p=await prepare(root,input);
  if(p.fingerprint!==fingerprint)throw new PostError('CHANGED','La bozza è cambiata. Controlla di nuovo il riepilogo.');
  const updated=p.workbook.updateDraftDate(p.draft.year,p.draft.row,p.date,p.newRelative+'/01_Sorgenti');
  stage=await fs.mkdtemp(path.join(p.root,'.social-stage-'));
  const stagedBook=path.join(stage,'piano.xlsx');await fs.writeFile(stagedBook,updated,{flag:'wx'});
  const backups=path.join(p.root,'.social-backups');await assertContained(p.root,backups);await fs.mkdir(backups,{recursive:true});
  const backup=path.join(backups,`Piano-${Date.now()}-${crypto.randomUUID()}.xlsx`);await fs.writeFile(backup,p.buffer,{flag:'wx'});
  await checkExcelClosed(p.root,p.book);
  if(hash(await fs.readFile(p.book))!==input.revision)throw new PostError('CHANGED','Il piano è cambiato. Aggiorna l’elenco e riprova.');
  await assertContained(p.root,p.oldPath);await assertContained(p.root,p.newPath);
  if(p.oldPath!==p.newPath){
   if(await exists(p.newPath))throw new PostError('EXISTS','La cartella di destinazione esiste già. Operazione annullata.');
   await fs.rename(p.oldPath,p.newPath);moved=true;
  }
  if(options.failAfterRename)throw new Error('Errore di prova dopo la rinomina.');
  await checkExcelClosed(p.root,p.book);
  if(hash(await fs.readFile(p.book))!==input.revision)throw new PostError('CHANGED','Il piano è cambiato prima del salvataggio. Operazione annullata.');
  await fs.rename(stagedBook,p.book);committed=true;
  return {...preview(p),backup};
 }catch(e){
  if(moved&&!committed){try{await fs.rename(p.newPath,p.oldPath);}catch{throw new PostError('RECOVERY',`Non riesco a ripristinare la cartella dopo l’errore. La cartella è in ${p.newRelative}; il piano precedente è conservato in .social-backups. Non ripetere l’operazione prima di verificare.`);}}
  throw e;
 }finally{if(stage)await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});await fs.unlink(lock).catch(()=>{});}
}
module.exports={listDrafts,planDraftDate,updateDraftDate};
