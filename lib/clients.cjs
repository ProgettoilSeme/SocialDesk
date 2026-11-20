'use strict';
// Clienti: dentro la cartella Social c'è una cartella per cliente (es. Social/progetto_il_seme) con tutto
// quello che serve a quel cliente, con nomi fissi: Piano editoriale.xlsx, 00_Cestino, 01_Posts, 02_Settings
// (impostazioni, idee, logo), 03_Template (template .ai, Archivio asset). È un cliente ogni sottocartella diretta
// di Social che contiene il piano. I template si caricano dalle Impostazioni del cliente (lib/templates.cjs).
require('./safe-fs.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');
const {PostError}=require('./posts.cjs');
const folders=require('./folders.cjs');
const PLAN='Piano editoriale.xlsx';
const EMPTY_PLAN=path.join(__dirname,'templates','piano-vuoto.xlsx');
const MAX_NAME=60;
// cartelle di Social che non sono mai clienti
const RESERVED=new Set(['app social','app_social','00_template_base','00_template','00_settings','02_settings','03_template','00_cestino','00_old','01_posts','01_facebook','02_instagram','03_linkedin']);
const WINDOWS_RESERVED=/^(con|prn|aux|nul|com\d|lpt\d)$/i;

// Nome mostrato: quello della cartella, con lo spazio al posto di "_" (progetto_il_seme → progetto il seme)
const displayName=folder=>String(folder).normalize('NFC').replace(/_/g,' ').replace(/\s+/g,' ').trim();
const fold=text=>String(text).normalize('NFC').toLowerCase();
const skip=name=>name.startsWith('.')||name.startsWith('@')||name.startsWith('#')||name.startsWith('~')||RESERVED.has(fold(name));

async function isFile(file){return fs.stat(file).then(s=>s.isFile(),e=>{if(['ENOENT','ENOTDIR'].includes(e.code))return false;throw e;});}
async function baseInfo(base){
 if(typeof base!=='string'||!base)throw new PostError('ROOT','Scegli la cartella Social.');
 const stat=await fs.stat(base).catch(e=>{if(['ENOENT','ENOTDIR'].includes(e.code))return null;throw e;});
 if(!stat)throw new PostError('ROOT','La cartella Social non è raggiungibile. Ricollega la cartella.');
 if(!stat.isDirectory())throw new PostError('ROOT','La cartella Social scelta non è una cartella.');
 return path.resolve(base);
}
async function listClients(base){
 const root=await baseInfo(base);
 const entries=await fs.readdir(root,{withFileTypes:true});
 const clients=[];
 for(const entry of entries){
  if(!entry.isDirectory()||skip(entry.name))continue;
  if(await isFile(path.join(root,entry.name,PLAN)))clients.push({folder:entry.name,name:displayName(entry.name)});
 }
 return clients.sort((a,b)=>a.name.localeCompare(b.name,'it',{sensitivity:'base'}));
}
// Cartella del cliente scelto, solo se è davvero uno dei clienti di Social (il renderer passa solo il nome)
async function clientPath(base,folder){
 if(typeof folder!=='string'||!folder)throw new PostError('CLIENT','Scegli un cliente.');
 const found=(await listClients(base)).find(c=>c.folder===folder);
 if(!found)throw new PostError('CLIENT','Questo cliente non c’è più nella cartella Social.');
 return path.join(path.resolve(base),found.folder);
}
// Nome della nuova cartella: quello scritto, con "_" al posto degli spazi
function folderName(input){
 if(typeof input!=='string')throw new PostError('INPUT','Scrivi il nome del cliente.');
 const name=input.normalize('NFC').replace(/[\x00-\x1f\x7f]/g,'').trim().replace(/\s+/g,'_');
 if(!name)throw new PostError('INPUT','Scrivi il nome del cliente.');
 if(name.length>MAX_NAME)throw new PostError('INPUT',`Il nome è troppo lungo (massimo ${MAX_NAME} caratteri).`);
 if(/[\\/:*?"<>|]/.test(name))throw new PostError('INPUT','Il nome non può contenere \\ / : * ? " < > |');
 if(/^[.@#~]/.test(name)||/[.]$/.test(name))throw new PostError('INPUT','Il nome non può iniziare con . @ # ~ né finire con un punto.');
 if(RESERVED.has(fold(name))||RESERVED.has(fold(name.replace(/_/g,' ')))||WINDOWS_RESERVED.test(name))throw new PostError('INPUT','Questo nome è riservato: scegline un altro.');
 return name;
}
// Crea Social/<nome> con il piano vuoto e le cartelle fisse (00_Cestino, 01_Posts, 02_Settings, 03_Template vuota):
// i template si caricano poi dalle Impostazioni del cliente.
// Controllo del nome (primo passo di Crea cliente): valido e non già usato in Social
async function checkClientName(base,input){
 const root=await baseInfo(base),folder=folderName(input);
 const entries=await fs.readdir(root);
 if(entries.some(name=>fold(name)===fold(folder)))throw new PostError('EXISTS',`In Social c’è già una cartella “${folder}”.`);
 return{root,folder,name:displayName(folder)};
}
async function createClient(base,input){
 const {root,folder}=await checkClientName(base,input);
 const target=path.join(root,folder);
 await fs.mkdir(target);
 try{
  await fs.copyFile(EMPTY_PLAN,path.join(target,PLAN),fs.constants.COPYFILE_EXCL);
  for(const kind of ['trash','posts','settings','template'])await fs.mkdir(path.join(target,folders.NAMES[kind]));
  return{folder,name:displayName(folder)};
 }catch(e){
  // la cartella l'abbiamo appena creata noi: se qualcosa va storto la togliamo
  await fs.rm(target,{recursive:true,force:true}).catch(()=>{});
  throw e;
 }
}
module.exports={PLAN,EMPTY_PLAN,displayName,baseInfo,listClients,clientPath,folderName,checkClientName,createClient};
