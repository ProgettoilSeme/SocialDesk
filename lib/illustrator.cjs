'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {selectedPost,sourceDirectory}=require('./details.cjs');
const {PostError,assertContained,CHANNELS,slug}=require('./posts.cjs');
const MAX_AI_BYTES=64*1024*1024,MAX_AI_FILES=20;
const normalized=value=>value.normalize('NFC').toLowerCase();
async function illustratorFiles(root,input){
 const selected=await selectedPost(root,input),result={files:[],message:''};
 try{
  const folder=await sourceDirectory(selected.root,selected.post);
  const expected=normalized(`${slug(selected.post.title)}_${CHANNELS[selected.post.channel].suffix}.ai`);
  const files=(await fs.readdir(folder,{withFileTypes:true})).filter(e=>e.isFile()&&path.extname(e.name).toLowerCase()==='.ai').sort((a,b)=>Number(normalized(b.name)===expected)-Number(normalized(a.name)===expected)||a.name.localeCompare(b.name));
  result.files=files.slice(0,MAX_AI_FILES).map(file=>({name:file.name}));
  if(!files.length){result.message='Nessun file Illustrator presente nella cartella sorgenti.';result.empty=true;}
  else if(files.length>MAX_AI_FILES)result.message=`Sono mostrati i primi ${MAX_AI_FILES} file Illustrator su ${files.length}.`;
 }catch(e){result.message=e instanceof PostError?e.message:'Non riesco a leggere i file Illustrator. Verifica che la cartella sia raggiungibile.';}
 return result;
}
async function resolveIllustrator(root,input){
 if(!input||typeof input.name!=='string'||!input.name||/[\\/\x00-\x1f:]/.test(input.name)||path.extname(input.name).toLowerCase()!=='.ai')throw new PostError('INPUT','Seleziona un file Illustrator del post.');
 const selected=await selectedPost(root,input),folder=await sourceDirectory(selected.root,selected.post),file=path.join(folder,input.name);
 await assertContained(selected.root,file);
 let stat;try{stat=await fs.lstat(file);}catch(e){if(e.code==='ENOENT')throw new PostError('MISSING','Il file Illustrator non è più disponibile. Chiudi e riapri i dettagli del post.');throw e;}
 if(stat.isSymbolicLink()||!stat.isFile())throw new PostError('INPUT','Il percorso non corrisponde a un file Illustrator del post.');
 return file;
}
async function illustratorData(root,input){
 const file=await resolveIllustrator(root,input);let handle;
 try{
  handle=await fs.open(file,'r');const stat=await handle.stat();
  if(!stat.isFile())throw new PostError('INPUT','Il percorso non corrisponde a un file Illustrator.');
  if(stat.size>MAX_AI_BYTES)throw new PostError('PREVIEW','Anteprima non disponibile: il file supera 64 MB. Puoi aprire l’originale dal link.');
  const header=Buffer.alloc(5);await handle.read(header,0,5,0);
  if(header.toString('ascii')!=='%PDF-')throw new PostError('PREVIEW','Anteprima non disponibile. Salva il file in Illustrator con “Crea file compatibile PDF” per visualizzarlo qui.');
  const data=Buffer.alloc(stat.size);let length=0;
  while(length<data.length){const read=await handle.read(data,length,data.length-length,length);if(!read.bytesRead)break;length+=read.bytesRead;}
  if(length!==stat.size||(await handle.stat()).size!==stat.size)throw new PostError('CHANGED','Il file Illustrator è cambiato durante il caricamento. Chiudi e riapri i dettagli.');
  return{data:new Uint8Array(data)};
 }finally{if(handle)await handle.close();}
}
module.exports={illustratorFiles,resolveIllustrator,illustratorData,MAX_AI_BYTES};
