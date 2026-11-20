'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {Book}=require('./workbook.cjs');
const {CHANNELS,PostError,rootInfo,assertContained,slug}=require('./posts.cjs');
const layout=require('./layout.cjs');
const MAX_TEXT_BYTES=1024*1024,MAX_FILES=20;
const normalized=value=>value.normalize('NFC').toLowerCase();
// I testi dei post sono in Markdown (.md); i vecchi .txt restano leggibili.
const TEXT_EXTENSIONS=['.md','.txt'];
const isText=name=>TEXT_EXTENSIONS.includes(path.extname(name).toLowerCase());
const canonicalRank=(name,post)=>{const base=normalized(`${slug(post.title)}_${CHANNELS[post.channel].suffix}`),value=normalized(name);return value===base+'.md'?2:value===base+'.txt'?1:0;};
function primaryTextName(names,post){
 const texts=names.filter(isText);
 const ranked=texts.filter(name=>canonicalRank(name,post)>0).sort((a,b)=>canonicalRank(b,post)-canonicalRank(a,post));
 return ranked[0]||(texts.length===1?texts[0]:null);
}
// Cartella 01_Sorgenti indicata dal collegamento del piano (struttura unificata o per social).
async function sourceInfo(root,post){
 // post importati dai vecchi piani (anni precedenti): nessuna cartella dei sorgenti
 if(!post.sourcesRelative)throw new PostError('NO_FOLDER','Questo post non ha una cartella dei sorgenti nel piano editoriale.');
 const candidates=[post.sourcesRelative];
 try{const decoded=decodeURIComponent(post.sourcesRelative);if(decoded!==post.sourcesRelative)candidates.push(decoded);}catch{}
 for(const relative of candidates){
  const parsed=layout.parseSources(relative,post);
  if(!parsed)continue;
  await assertContained(root,path.join(root,...parsed.parts));
  const folder=await layout.existingPath(root,parsed.parts);
  if(!folder)continue;
  await assertContained(root,folder);
  try{if((await fs.stat(folder)).isDirectory())return{folder,unified:parsed.unified,parsed};}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 throw new PostError('MISSING','Non trovo la cartella sorgenti del post. Verifica il collegamento nel piano editoriale.');
}
async function sourceDirectory(root,post){return(await sourceInfo(root,post)).folder;}
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
 // Non seguire file di testo collegati simbolicamente, anche se puntano dentro Social.
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
 if(crypto.createHash('sha256').update(buffer).digest('hex')!==input.revision)throw new PostError('CHANGED','Il piano è cambiato. Premi Aggiorna per ricaricarlo.');
 const post=new Book(buffer).posts().find(p=>p.key===input.key);
 if(!post)throw new PostError('MISSING','Il post non è più presente nel piano. Aggiorna l’elenco.');
 return{root:info.root,post};
}
async function postDetails(root,input){
 const selected=await selectedPost(root,input),info={root:selected.root},post=selected.post;
 const result={post,textFiles:[],textMessage:''};
 try{
  const {folder,unified}=await sourceInfo(info.root,post);
  // Nella cartella unificata si vedono solo i testi di questo social (e quelli senza suffisso).
  const entries=(await fs.readdir(folder,{withFileTypes:true})).filter(e=>e.isFile()&&isText(e.name)&&layout.visibleFor(e.name,post.channel,unified)).sort((a,b)=>canonicalRank(b.name,post)-canonicalRank(a.name,post)||a.name.localeCompare(b.name));
  if(!entries.length){result.textMessage='Nessun file di testo (.md) presente nella cartella sorgenti.';result.noText=true;}
  if(entries.length>MAX_FILES)result.textMessage=`Sono mostrati i primi ${MAX_FILES} file di testo su ${entries.length}.`;
  for(const entry of entries.slice(0,MAX_FILES)){
   try{result.textFiles.push(await textFile(info.root,folder,entry.name));}
   catch(e){result.textFiles.push({name:entry.name,content:null,message:e.code==='ENOENT'?'Il file non è più disponibile.':'Non riesco a leggere questo file di testo.'});}
  }
  const primary=primaryTextName(entries.map(entry=>entry.name),post);
  result.editableText=result.textFiles.find(file=>file.name===primary&&file.content!==null)||null;
 }catch(e){result.textMessage=e instanceof PostError?e.message:'Non riesco a leggere i testi dai sorgenti. Verifica che la cartella sia raggiungibile.';
  // cartella del post rinominata o spostata: l'interfaccia propone Ricollega cartella
  if(e instanceof PostError&&e.code==='MISSING'&&post.sourcesRelative)result.folderMissing=true;}
 return result;
}
async function resolvePostText(root,input){
 if(!input||typeof input.name!=='string'||!input.name||/[\\/\x00-\x1f:]/.test(input.name)||!isText(input.name))throw new PostError('INPUT','Seleziona un file di testo del post.');
 const result=await postDetails(root,input);
 if(!result.textFiles.some(file=>file.name===input.name))throw new PostError('MISSING','Il file di testo non è più disponibile. Chiudi e riapri i dettagli del post.');
 const folder=await sourceDirectory(root,result.post),file=path.join(folder,input.name);
 await assertContained(root,file);
 const stat=await fs.lstat(file);
 if(stat.isSymbolicLink()||!stat.isFile())throw new PostError('INPUT','Il percorso non corrisponde a un file di testo del post.');
 return file;
}
module.exports={sourceInfo,TEXT_EXTENSIONS,postDetails,resolvePostText,resolvePostFolder,selectedPost,sourceDirectory,primaryTextName,decodeText,MAX_TEXT_BYTES};
