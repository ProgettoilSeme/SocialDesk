'use strict';
// Template del cliente: un file .ai per ogni piattaforma e formato da immagine, in 03_Template con il nome
// "<Piattaforma> - <Formato>.ai" (es. "Instagram - Storia foto.ai"). Si caricano dalle Impostazioni del cliente:
// il file scelto viene copiato e rinominato così. Se manca, alla creazione si usa il vecchio "base <Piattaforma>.ai".
require('./safe-fs.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {PostError,CHANNELS,formatKind,templateName,assertContained}=require('./posts.cjs');
const folders=require('./folders.cjs');
const MAX_TEMPLATE=200*1024*1024;
const fold=name=>String(name).normalize('NFC').toLowerCase();
function check(channel,format){
 if(!CHANNELS[channel]||!CHANNELS[channel].formats.includes(format)||formatKind(format)!=='ai')throw new PostError('INPUT','Template non valido.');
}
async function entries(dir){try{return await fs.readdir(dir,{withFileTypes:true});}catch(e){if(['ENOENT','ENOTDIR'].includes(e.code))return[];throw e;}}
// Per ogni piattaforma gestita, i formati da immagine con il loro template: presente, oppure il vecchio template unico che verrà usato
async function listTemplates(root,platforms){
 const dir=await folders.folder(root,'template'),files=(await entries(dir)).filter(e=>e.isFile());
 const find=name=>files.find(e=>fold(e.name)===fold(name));
 const result=[];
 for(const channel of platforms.filter(c=>CHANNELS[c])){
  const legacy=CHANNELS[channel].templates.map(find).find(Boolean);
  for(const format of CHANNELS[channel].formats.filter(f=>formatKind(f)==='ai')){
   const name=templateName(channel,format),file=find(name);
   let modified='';
   if(file){try{modified=(await fs.stat(path.join(dir,file.name))).mtime.toISOString();}catch{}}
   result.push({channel,format,name,present:!!file,modified,fallback:!file&&legacy?legacy.name:''});
  }
 }
 return result;
}
// Copia il file .ai scelto in 03_Template con il nome giusto, sostituendo quello che c'era
async function setTemplate(root,channel,format,source){
 check(channel,format);
 if(path.extname(String(source||'')).toLowerCase()!=='.ai')throw new PostError('INPUT','Scegli un file Illustrator (.ai).');
 const stat=await fs.stat(source).catch(()=>null);
 if(!stat||!stat.isFile())throw new PostError('MISSING','Non trovo il file scelto.');
 if(stat.size>MAX_TEMPLATE)throw new PostError('INPUT','Il template è troppo grande (massimo 200 MB).');
 const dir=await folders.folder(root,'template');await fs.mkdir(dir,{recursive:true});
 const name=templateName(channel,format),target=path.join(dir,name);await assertContained(root,target);
 // un file con lo stesso nome ma maiuscole diverse viene sostituito
 const old=(await entries(dir)).find(e=>e.isFile()&&fold(e.name)===fold(name)&&e.name!==name);
 const staged=path.join(dir,`.template-${crypto.randomUUID()}.ai`);
 try{await fs.copyFile(source,staged);if(old)await fs.rm(path.join(dir,old.name),{force:true});await fs.rename(staged,target);}
 finally{await fs.rm(staged,{force:true});}
 return{channel,format,name};
}
async function removeTemplate(root,channel,format){
 check(channel,format);
 const dir=await folders.folder(root,'template'),name=templateName(channel,format);
 const file=(await entries(dir)).find(e=>e.isFile()&&fold(e.name)===fold(name));
 if(file)await fs.rm(path.join(dir,file.name),{force:true});
 return{channel,format,name};
}
module.exports={listTemplates,setTemplate,removeTemplate};
