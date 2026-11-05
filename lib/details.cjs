'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {Book}=require('./workbook.cjs');
const {CHANNELS,PostError,rootInfo,assertContained,slug}=require('./posts.cjs');
const MAX_TEXT_BYTES=1024*1024,MAX_FILES=20;
const normalized=value=>value.normalize('NFC').toLowerCase();
function primaryTextName(names,post){
 const texts=names.filter(name=>path.extname(name).toLowerCase()==='.txt');
 const expected=normalized(`${slug(post.title)}_${CHANNELS[post.channel].suffix}.txt`);
 return texts.find(name=>normalized(name)===expected)||(texts.length===1?texts[0]:null);
}
async function sourceDirectory(root,post){
 const candidates=[post.sourcesRelative];
 try{const decoded=decodeURIComponent(post.sourcesRelative);if(decoded!==post.sourcesRelative)candidates.push(decoded);}catch{}
 for(const relative of candidates){
  const parts=relative.replace(/\\/g,'/').split('/');
  if(!CHANNELS[post.channel]||parts.length!==4||parts[0]!==CHANNELS[post.channel].directory||parts[1]!==String(post.year)||!/^(?:\d{2}-\d{2}|xx-xx)_.+$/.test(parts[2])||parts[3]!=='01_Sorgenti'||parts.some(p=>p==='.'||p==='..'||/[\x00-\x1f:]/.test(p)))continue;
  const folder=path.join(root,...parts);await assertContained(root,folder);
  try{if((await fs.stat(folder)).isDirectory())return folder;}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 throw new PostError('MISSING','Non trovo la cartella sorgenti del post. Verifica il collegamento nel piano editoriale.');
}
async function resolvePostFolder(root,input){
 const selected=await selectedPost(root,input);
 const sources=await sourceDirectory(selected.root,selected.post);
 const folder=path.dirname(sources);
 await assertContained(selected.root,folder);
 const stat=await fs.lstat(folder);
 if(stat.isSymbolicLink()||!stat.isDirectory())throw new PostError('MISSING','La cartella del post non è più disponibile.');
 return folder;
}
function decodeText(bytes){
 if(bytes[0]===0xff&&bytes[1]===0xfe)return new TextDecoder('utf-16le').decode(bytes.subarray(2));
 if(bytes[0]===0xfe&&bytes[1]===0xff)return new TextDecoder('utf-16be').decode(bytes.subarray(2));
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder('windows-1252').decode(bytes);}
}
async function textFile(root,folder,name){
 const file=path.join(folder,name);await assertContained(root,file);
 // Non seguire file TXT collegati simbolicamente, anche se puntano dentro Social.
 if((await fs.lstat(file)).isSymbolicLink())return{name,content:null,message:'Il file è un collegamento e non viene letto automaticamente.'};
 let handle;
 try{
  handle=await fs.open(file,'r');const stat=await handle.stat();
  if(!stat.isFile())return{name,content:null,message:'Il percorso non corrisponde a un file di testo.'};
  if(stat.size>MAX_TEXT_BYTES)return{name,content:null,message:'Il file supera 1 MB ed è troppo grande per questa anteprima.'};
  const bytes=Buffer.alloc(MAX_TEXT_BYTES+1);let size=0;
  while(size<bytes.length){const result=await handle.read(bytes,size,bytes.length-size,size);if(!result.bytesRead)break;size+=result.bytesRead;}
  if(size>MAX_TEXT_BYTES)return{name,content:null,message:'Il file supera 1 MB ed è troppo grande per questa anteprima.'};
  const content=bytes.subarray(0,size);
  return{name,content:decodeText(content),revision:crypto.createHash('sha256').update(content).digest('hex'),message:''};
 }finally{if(handle)await handle.close();}
}
async function selectedPost(root,input){
 if(!input||!/^\d{4}:\d+$/.test(input.key||'')||!/^[a-f0-9]{64}$/.test(input.revision||''))throw new PostError('INPUT','Scegli un post dall’elenco aggiornato.');
 const info=await rootInfo(root),buffer=await fs.readFile(info.book);
 if(crypto.createHash('sha256').update(buffer).digest('hex')!==input.revision)throw new PostError('CHANGED','Il piano è cambiato. Chiudi questa finestra, aggiorna l’elenco e apri di nuovo il post.');
 const post=new Book(buffer).posts().find(p=>p.key===input.key);
 if(!post)throw new PostError('MISSING','Il post non è più presente nel piano. Aggiorna l’elenco.');
 return{root:info.root,post};
}
async function postDetails(root,input){
 const selected=await selectedPost(root,input),info={root:selected.root},post=selected.post;
 const result={post,textFiles:[],textMessage:''};
 try{
  const folder=await sourceDirectory(info.root,post);
  const expected=normalized(`${slug(post.title)}_${CHANNELS[post.channel].suffix}.txt`);
  const entries=(await fs.readdir(folder,{withFileTypes:true})).filter(e=>e.isFile()&&path.extname(e.name).toLowerCase()==='.txt').sort((a,b)=>Number(normalized(b.name)===expected)-Number(normalized(a.name)===expected)||a.name.localeCompare(b.name));
  if(!entries.length)result.textMessage='Nessun file TXT presente nella cartella sorgenti.';
  if(entries.length>MAX_FILES)result.textMessage=`Sono mostrati i primi ${MAX_FILES} file TXT su ${entries.length}.`;
  for(const entry of entries.slice(0,MAX_FILES)){
   try{result.textFiles.push(await textFile(info.root,folder,entry.name));}
   catch(e){result.textFiles.push({name:entry.name,content:null,message:e.code==='ENOENT'?'Il file non è più disponibile.':'Non riesco a leggere questo file TXT.'});}
  }
  const primary=primaryTextName(entries.map(entry=>entry.name),post);
  result.editableText=result.textFiles.find(file=>file.name===primary&&file.content!==null)||null;
 }catch(e){result.textMessage=e instanceof PostError?e.message:'Non riesco a leggere i testi dai sorgenti. Verifica che la cartella sia raggiungibile.';}
 return result;
}
async function resolvePostText(root,input){
 if(!input||typeof input.name!=='string'||!input.name||/[\\/\x00-\x1f:]/.test(input.name)||path.extname(input.name).toLowerCase()!=='.txt')throw new PostError('INPUT','Seleziona un file TXT del post.');
 const result=await postDetails(root,input);
 if(!result.textFiles.some(file=>file.name===input.name))throw new PostError('MISSING','Il file TXT non è più disponibile. Chiudi e riapri i dettagli del post.');
 const folder=await sourceDirectory(root,result.post),file=path.join(folder,input.name);
 await assertContained(root,file);
 const stat=await fs.lstat(file);
 if(stat.isSymbolicLink()||!stat.isFile())throw new PostError('INPUT','Il percorso non corrisponde a un file TXT del post.');
 return file;
}
module.exports={postDetails,resolvePostText,resolvePostFolder,selectedPost,sourceDirectory,primaryTextName,decodeText,MAX_TEXT_BYTES};
