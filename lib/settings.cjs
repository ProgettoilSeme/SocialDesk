'use strict';
// Impostazioni del CLIENTE, in 02_Settings/settings.json della sua cartella: logo, sfondo della home, colore e piattaforme gestite.
// Le impostazioni dell'APP (cartella Social, tema chiaro/scuro) restano sul computer di chi la usa.
// Template e cestino non si scelgono più: la struttura delle cartelle è fissa (lib/folders.cjs).
// Si legge ancora il vecchio 00_template/socialdesk-settings.json finché il nuovo file non esiste.
require('./safe-fs.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {PostError,CHANNELS,DEFAULT_PLATFORMS}=require('./posts.cjs');
const folders=require('./folders.cjs');
const FILE='settings.json';
const LEGACY_FILE=['00_template','socialdesk-settings.json'];
const LOGO_TYPES={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml'};
const MAX_LOGO=2*1024*1024;
// Sfondo della home del cliente: come il logo (anche SVG), con un limite più alto perché spesso è una foto
const BACKGROUND_TYPES={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml'};
const MAX_BACKGROUND=10*1024*1024;
const COLOR=/^#[0-9a-f]{6}$/i;

async function fileFor(root){return path.join(await folders.folder(root,'settings'),FILE);}
const isFile=file=>fs.lstat(file).then(s=>s.isFile(),e=>{if(['ENOENT','ENOTDIR'].includes(e.code))return false;throw e;});
async function existingFile(root){
 for(const file of [await fileFor(root),path.join(root,...LEGACY_FILE)])if(await isFile(file))return file;
 return null;
}
async function readDoc(root){
 const file=await existingFile(root);if(!file)return{};
 let doc;
 try{doc=JSON.parse((await fs.readFile(file,'utf8')).replace(/^﻿/,''));}catch{doc=null;}
 if(!doc||typeof doc!=='object'||Array.isArray(doc))throw new PostError('SETTINGS',`Il file ${folders.relative(root,file)} non è valido. Correggilo prima di salvare le impostazioni del cliente.`);
 return doc;
}
// solo un nome di file dentro 02_Settings, con un'estensione da immagine
const validLogoName=name=>typeof name==='string'&&/^[^\\/]+$/.test(name)&&!name.startsWith('.')&&!!LOGO_TYPES[path.extname(name).toLowerCase()];
const validBackgroundName=name=>typeof name==='string'&&/^[^\\/]+$/.test(name)&&!name.startsWith('.')&&!!BACKGROUND_TYPES[path.extname(name).toLowerCase()];
// piattaforme gestite dal cliente, nell'ordine dell'app; senza scelta (o vuote) quelle predefinite
function cleanPlatforms(value){const list=Array.isArray(value)?Object.keys(CHANNELS).filter(c=>value.includes(c)):[];return list.length?list:[...DEFAULT_PLATFORMS];}
function clean(doc){return{logo:validLogoName(doc.logo)?doc.logo:'',background:validBackgroundName(doc.background)?doc.background:'',color:typeof doc.color==='string'&&COLOR.test(doc.color)?doc.color.toLowerCase():'',platforms:cleanPlatforms(doc.platforms)};}
async function current(root){return clean(await readDoc(root));}
async function write(root,values){
 const dir=await folders.folder(root,'settings');await fs.mkdir(dir,{recursive:true});
 const target=path.join(dir,FILE),staged=target+'.'+crypto.randomUUID()+'.tmp';
 try{await fs.writeFile(staged,JSON.stringify({version:2,...clean(values)},null,2)+'\n',{flag:'wx'});await fs.rename(staged,target);}
 finally{await fs.rm(staged,{force:true});}
}
async function save(root,input){
 if(!input||typeof input!=='object')throw new PostError('INPUT','Impostazioni non valide.');
 const next={...(await current(root))};
 // si salvano solo i campi indicati
 if(input.color!==undefined){
  const color=typeof input.color==='string'?input.color.trim():'';
  if(color&&!COLOR.test(color))throw new PostError('INPUT','Scegli un colore valido.');
  next.color=color;
 }
 if(input.platforms!==undefined){
  if(!Array.isArray(input.platforms)||input.platforms.some(c=>!CHANNELS[c]))throw new PostError('INPUT','Piattaforma non valida.');
  if(!input.platforms.length)throw new PostError('INPUT','Il cliente deve gestire almeno una piattaforma.');
  next.platforms=cleanPlatforms(input.platforms);
 }
 await write(root,next);
 return current(root);
}
async function logoPath(root){
 const {logo}=await current(root);if(!logo)return null;
 const file=path.join(await folders.folder(root,'settings'),logo);
 const stat=await fs.lstat(file).catch(()=>null);
 if(!stat||!stat.isFile()||stat.size>MAX_LOGO)return null;
 return file;
}
// Il logo come data URL per il renderer (che non legge file): vuoto se manca o non è valido
async function logoData(root){
 try{const file=await logoPath(root);if(!file)return'';return`data:${LOGO_TYPES[path.extname(file).toLowerCase()]};base64,${(await fs.readFile(file)).toString('base64')}`;}
 catch{return'';}
}
// Immagine scelta come logo: controlla tipo e dimensione e restituisce l'anteprima (data URL)
async function checkLogo(source){
 const ext=path.extname(String(source||'')).toLowerCase();
 if(!LOGO_TYPES[ext])throw new PostError('INPUT','Scegli un’immagine PNG, JPG, WEBP, GIF o SVG.');
 const stat=await fs.stat(source).catch(()=>null);
 if(!stat||!stat.isFile())throw new PostError('MISSING','Non trovo l’immagine scelta.');
 if(stat.size>MAX_LOGO)throw new PostError('INPUT','Il logo è troppo grande (massimo 2 MB).');
 return`data:${LOGO_TYPES[ext]};base64,${(await fs.readFile(source)).toString('base64')}`;
}
// Carica il logo: copia l'immagine scelta in 02_Settings/logo.<estensione> e lo segna in settings.json
async function setLogo(root,source){
 const ext=path.extname(String(source||'')).toLowerCase();
 if(!LOGO_TYPES[ext])throw new PostError('INPUT','Scegli un’immagine PNG, JPG, WEBP, GIF o SVG.');
 const stat=await fs.stat(source).catch(()=>null);
 if(!stat||!stat.isFile())throw new PostError('MISSING','Non trovo l’immagine scelta.');
 if(stat.size>MAX_LOGO)throw new PostError('INPUT','Il logo è troppo grande (massimo 2 MB).');
 const settings=await current(root),dir=await folders.folder(root,'settings');await fs.mkdir(dir,{recursive:true});
 const name='logo'+ext,target=path.join(dir,name),staged=path.join(dir,`.logo-${crypto.randomUUID()}${ext}`);
 try{await fs.copyFile(source,staged);await fs.rename(staged,target);}finally{await fs.rm(staged,{force:true});}
 if(settings.logo&&settings.logo!==name)await fs.rm(path.join(dir,settings.logo),{force:true});
 await write(root,{...settings,logo:name});
 return current(root);
}
async function removeLogo(root){
 const settings=await current(root);
 if(settings.logo)await fs.rm(path.join(await folders.folder(root,'settings'),settings.logo),{force:true});
 await write(root,{...settings,logo:''});
 return current(root);
}
// Sfondo della home: copiato in 02_Settings/sfondo.<estensione> e segnato in settings.json (come il logo)
async function setBackground(root,source){
 const ext=path.extname(String(source||'')).toLowerCase();
 if(!BACKGROUND_TYPES[ext])throw new PostError('INPUT','Scegli un’immagine PNG, JPG, WEBP, GIF o SVG.');
 const stat=await fs.stat(source).catch(()=>null);
 if(!stat||!stat.isFile())throw new PostError('MISSING','Non trovo l’immagine scelta.');
 if(stat.size>MAX_BACKGROUND)throw new PostError('INPUT','L’immagine è troppo grande (massimo 10 MB).');
 const settings=await current(root),dir=await folders.folder(root,'settings');await fs.mkdir(dir,{recursive:true});
 const name='sfondo'+ext,target=path.join(dir,name),staged=path.join(dir,`.sfondo-${crypto.randomUUID()}${ext}`);
 try{await fs.copyFile(source,staged);await fs.rename(staged,target);}finally{await fs.rm(staged,{force:true});}
 if(settings.background&&settings.background!==name)await fs.rm(path.join(dir,settings.background),{force:true});
 await write(root,{...settings,background:name});
 return current(root);
}
async function removeBackground(root){
 const settings=await current(root);
 if(settings.background)await fs.rm(path.join(await folders.folder(root,'settings'),settings.background),{force:true});
 await write(root,{...settings,background:''});
 return current(root);
}
async function backgroundFile(root){
 const {background}=await current(root);if(!background)return null;
 const file=path.join(await folders.folder(root,'settings'),background);
 const stat=await fs.lstat(file).catch(()=>null);
 if(!stat||!stat.isFile()||stat.size>MAX_BACKGROUND)return null;
 return{file,stat};
}
// Impronta dello sfondo (nome, data, dimensione): il renderer ricarica l'immagine solo quando cambia
async function backgroundStamp(root){try{const b=await backgroundFile(root);return b?`${path.basename(b.file)}:${b.stat.mtimeMs}:${b.stat.size}`:'';}catch{return'';}}
// L'immagine per il renderer (che non legge file): tipo e byte, oppure null
async function backgroundData(root){
 try{const b=await backgroundFile(root);if(!b)return null;return{type:BACKGROUND_TYPES[path.extname(b.file).toLowerCase()],data:await fs.readFile(b.file),stamp:`${path.basename(b.file)}:${b.stat.mtimeMs}:${b.stat.size}`};}
 catch{return null;}
}
module.exports={FILE,LEGACY_FILE,LOGO_TYPES,MAX_LOGO,BACKGROUND_TYPES,MAX_BACKGROUND,fileFor,current,save,checkLogo,setLogo,removeLogo,logoData,setBackground,removeBackground,backgroundStamp,backgroundData};
