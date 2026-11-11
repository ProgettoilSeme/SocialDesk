'use strict';
// Idee: una piccola to do list condivisa, salvata in 00_template/idee.json nella cartella Social
// (sul NAS la vedono tutti). Ogni modifica rilegge il file e applica solo quell'operazione,
// così due colleghi che lavorano insieme non si cancellano le idee a vicenda.
require('./safe-fs.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {PostError,rootInfo,assertContained}=require('./posts.cjs');
const CHANNELS=['Facebook','Instagram','LinkedIn'];

const FILE=['00_template','idee.json'];
const MAX_TEXT=500,MAX_IDEAS=2000;
const ideasPath=root=>path.join(root,...FILE);

function cleanText(value){
 if(typeof value!=='string')throw new PostError('INPUT','Scrivi il testo dell’idea.');
 const text=value.replace(/\r\n?/g,'\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'').trim();
 if(!text)throw new PostError('INPUT','Scrivi il testo dell’idea.');
 if(text.length>MAX_TEXT)throw new PostError('INPUT',`L’idea è troppo lunga (massimo ${MAX_TEXT} caratteri).`);
 return text;
}
function cleanChannels(value){
 if(value===undefined||value===null)return[];
 if(!Array.isArray(value)||value.some(c=>!CHANNELS.includes(c)))throw new PostError('INPUT','Social non valido.');
 return CHANNELS.filter(c=>value.includes(c));
}
function normalizeIdea(raw){
 if(!raw||typeof raw!=='object'||typeof raw.id!=='string'||typeof raw.text!=='string')return null;
 return{id:raw.id,text:raw.text,channels:Array.isArray(raw.channels)?CHANNELS.filter(c=>raw.channels.includes(c)):[],done:raw.done===true,createdAt:String(raw.createdAt||''),updatedAt:String(raw.updatedAt||raw.createdAt||''),doneAt:raw.done===true?String(raw.doneAt||''):''};
}
async function readFile(root){
 const file=ideasPath(root);await assertContained(root,file);
 let text;
 try{text=await fs.readFile(file,'utf8');}
 catch(e){if(e.code==='ENOENT')return{ideas:[],revision:'vuoto'};throw e;}
 let data;
 try{data=JSON.parse(text.replace(/^﻿/,''));}
 catch{throw new PostError('INPUT','Il file delle idee (00_template/idee.json) non è leggibile. Controllalo prima di aggiungere idee.');}
 const ideas=(Array.isArray(data?.ideas)?data.ideas:[]).map(normalizeIdea).filter(Boolean);
 return{ideas,revision:crypto.createHash('sha256').update(text).digest('hex')};
}
async function listIdeas(root){await rootInfo(root);return readFile(root);}

async function withLock(root,task){
 const lock=path.join(root,'00_template','.idee.lock');
 for(let attempt=0;;attempt++){
  try{const handle=await fs.open(lock,'wx');try{await handle.writeFile(JSON.stringify({app:'SocialDesk',pid:process.pid,host:os.hostname(),at:new Date().toISOString()}));}finally{await handle.close();}break;}
  catch(e){
   if(e.code!=='EEXIST')throw e;
   // un lock più vecchio di 2 minuti è rimasto da un'interruzione: le operazioni sulle idee durano pochi millisecondi
   try{const stat=await fs.stat(lock);if(Date.now()-stat.mtimeMs>120000){await fs.unlink(lock).catch(()=>{});continue;}}catch{}
   if(attempt>=20)throw new PostError('LOCKED','Un collega sta salvando le idee in questo momento. Riprova tra poco.');
   await new Promise(resolve=>setTimeout(resolve,150));
  }
 }
 try{return await task();}finally{await fs.unlink(lock).catch(()=>{});}
}
async function writeIdeas(root,ideas){
 const file=ideasPath(root),temp=`${file}.${process.pid}-${Date.now()}.tmp`;
 await fs.writeFile(temp,JSON.stringify({version:1,ideas},null,2)+'\n',{flag:'wx'});
 try{await fs.rename(temp,file);}catch(e){await fs.unlink(temp).catch(()=>{});throw e;}
}
// action: add {text,channels} | update {id,text?,channels?,done?} | delete {id}
async function changeIdea(root,input){
 await rootInfo(root);
 if(!input||typeof input!=='object'||!['add','update','delete'].includes(input.action))throw new PostError('INPUT','Richiesta non valida.');
 await fs.mkdir(path.join(root,'00_template'),{recursive:true});
 return withLock(root,async()=>{
  const {ideas}=await readFile(root),now=new Date().toISOString();
  let idea=null;
  if(input.action==='add'){
   if(ideas.length>=MAX_IDEAS)throw new PostError('INPUT','Ci sono troppe idee: elimina quelle fatte prima di aggiungerne altre.');
   idea={id:crypto.randomUUID(),text:cleanText(input.text),channels:cleanChannels(input.channels),done:false,createdAt:now,updatedAt:now,doneAt:''};
   ideas.push(idea);
  }else{
   const index=ideas.findIndex(item=>item.id===input.id);
   if(index<0)throw new PostError('MISSING','Questa idea non c’è più: forse l’ha eliminata un collega. Aggiorna l’elenco.');
   if(input.action==='delete'){idea=ideas[index];ideas.splice(index,1);}
   else if(input.action==='update'){
    idea={...ideas[index]};
    if(input.text!==undefined)idea.text=cleanText(input.text);
    if(input.channels!==undefined)idea.channels=cleanChannels(input.channels);
    if(input.done!==undefined){if(typeof input.done!=='boolean')throw new PostError('INPUT','Stato dell’idea non valido.');if(idea.done!==input.done)idea.doneAt=input.done?now:'';idea.done=input.done;}
    idea.updatedAt=now;ideas[index]=idea;
   }else throw new PostError('INPUT','Richiesta non valida.');
  }
  await writeIdeas(root,ideas);
  const result=await readFile(root);
  return{...result,idea};
 });
}
module.exports={listIdeas,changeIdea,ideasPath,MAX_TEXT};
