'use strict';
// Archivio di consultazione: copia le immagini di ogni 02_Asset in
// 00_template/Archivio asset/<social o 01_Posts>/<anno>/, senza sottocartelle per post.
// Gli originali restano nei post (Illustrator li collega da lì). L'archivio
// non viene mai svuotato e i file modificati a mano non vengono sovrascritti.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {CHANNELS,PostError,rootInfo,assertContained}=require('./posts.cjs');
const layout=require('./layout.cjs');
const ARCHIVE='Archivio asset';
const clientFolders=require('./folders.cjs');
const MANIFEST='.archivio-asset.json';
const IMAGE_EXTENSIONS=new Set(['.png','.jpg','.jpeg','.webp','.gif','.svg','.psd','.tif','.tiff','.heic','.bmp','.avif']);
const isImage=name=>IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase())&&!name.startsWith('.');
const key=name=>name.normalize('NFC').toLowerCase();
async function fileHash(file){
 const hash=crypto.createHash('sha256'),handle=await fs.open(file,'r');
 try{for await(const chunk of handle.createReadStream())hash.update(chunk);}finally{await handle.close().catch(()=>{});}
 return hash.digest('hex');
}
async function directories(dir){
 try{return(await fs.readdir(dir,{withFileTypes:true})).filter(e=>e.isDirectory()&&!e.isSymbolicLink());}catch(e){if(e.code==='ENOENT')return[];throw e;}
}
async function sourceImages(root){
 const result=[];
 // Struttura per social e struttura unificata (01_Posts): l'archivio segue la cartella di origine.
 for(const directory of [...Object.values(CHANNELS).map(c=>c.directory),layout.POSTS_DIR]){
  const config={directory},channelDir=path.join(root,directory);
  for(const year of await directories(channelDir)){
   if(!/^\d{4}$/.test(year.name))continue;
   for(const post of await directories(path.join(channelDir,year.name))){
    if(!(directory===layout.POSTS_DIR?layout.UNIFIED_FOLDER:layout.LEGACY_FOLDER).test(post.name))continue;
    const assets=path.join(channelDir,year.name,post.name,'02_Asset');
    async function walk(dir){
     let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}
     for(const entry of entries){
      const full=path.join(dir,entry.name);
      if(entry.isSymbolicLink())continue;
      if(entry.isDirectory()){await walk(full);continue;}
      if(entry.isFile()&&isImage(entry.name))result.push({channel:config.directory,year:year.name,file:full,name:entry.name.normalize('NFC'),relative:path.relative(root,full).split(path.sep).join('/')});
     }
    }
    await walk(assets);
   }
  }
 }
 return result.sort((a,b)=>a.relative.localeCompare(b.relative));
}
function uniqueName(name,taken){
 const ext=path.extname(name),stem=name.slice(0,name.length-ext.length);
 if(!taken.has(key(name)))return name;
 for(let i=2;;i++){const candidate=`${stem}__${i}${ext}`;if(!taken.has(key(candidate)))return candidate;}
}
async function copyInto(source,target){
 const temp=path.join(path.dirname(target),`.tmp-${crypto.randomUUID()}${path.extname(target)}`);
 try{
  await fs.copyFile(source,temp,fs.constants.COPYFILE_EXCL);
  const stat=await fs.stat(source);await fs.utimes(temp,stat.atime,stat.mtime).catch(()=>{});
  await fs.rename(temp,target);
 }catch(e){await fs.unlink(temp).catch(()=>{});throw e;}
}
async function syncAssetArchive(root,options={}){
 const info=await rootInfo(root),archive=path.join(await clientFolders.folder(info.root,'template'),ARCHIVE);
 await assertContained(info.root,archive);
 const lock=path.join(info.root,'.social-create.lock');let handle;
 try{handle=await fs.open(lock,'wx');await handle.writeFile(JSON.stringify({app:'Social',task:'archivio-asset',pid:process.pid,host:os.hostname(),at:new Date().toISOString()}));await handle.close();}
 catch(e){if(handle)await handle.close().catch(()=>{});if(e.code==='EEXIST')throw new PostError('LOCKED','Un’altra operazione è in corso. Attendi e riprova.');throw e;}
 try{
  await fs.mkdir(archive,{recursive:true});
  const archiveStat=await fs.lstat(archive);
  if(archiveStat.isSymbolicLink()||!archiveStat.isDirectory())throw new PostError('PATH','La cartella Archivio asset non è valida.');
  const manifestFile=path.join(archive,MANIFEST);
  let manifest={version:1,entries:{}};
  try{const parsed=JSON.parse(await fs.readFile(manifestFile,'utf8'));if(parsed&&typeof parsed.entries==='object')manifest=parsed;}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
  const sources=await sourceImages(info.root);
  const folders=new Map();
  // Stato di una cartella dell'archivio: nomi occupati e hash già presenti.
  async function folderState(channel,year){
   const id=channel+'/'+year;if(folders.has(id))return folders.get(id);
   const dir=path.join(archive,channel,year);await fs.mkdir(dir,{recursive:true});await assertContained(info.root,dir);
   const names=(await fs.readdir(dir,{withFileTypes:true})).filter(e=>e.isFile()&&!e.name.startsWith('.'));
   const state={dir,taken:new Set(names.map(e=>key(e.name))),hashes:null,names:names.map(e=>e.name)};
   state.loadHashes=async()=>{if(state.hashes)return state.hashes;state.hashes=new Map();for(const name of state.names){try{state.hashes.set(await fileHash(path.join(dir,name)),name);}catch{}}return state.hashes;};
   folders.set(id,state);return state;
  }
  const result={copied:0,updated:0,unchanged:0,duplicates:0,errors:[],total:sources.length,archiveRelative:clientFolders.relative(info.root,archive)};
  for(const source of sources){
   try{
    const stat=await fs.stat(source.file),entry=manifest.entries[source.relative];
    const folder=await folderState(source.channel,source.year);
    const archived=entry&&path.join(archive,...entry.archive.split('/'));
    if(entry&&entry.size===stat.size&&entry.mtimeMs===stat.mtimeMs&&await fs.stat(archived).then(s=>s.isFile(),()=>false)){result.unchanged++;continue;}
    const hash=await fileHash(source.file);
    const hashes=await folder.loadHashes();
    if(entry&&entry.hash===hash&&await fs.stat(archived).then(s=>s.isFile(),()=>false)){manifest.entries[source.relative]={...entry,size:stat.size,mtimeMs:stat.mtimeMs};result.unchanged++;continue;}
    // Sorgente modificato: aggiorna la copia solo se nessuno l'ha cambiata a mano.
    if(entry&&entry.archive.startsWith(`${source.channel}/${source.year}/`)&&await fs.stat(archived).then(s=>s.isFile(),()=>false)&&await fileHash(archived)===entry.hash&&!hashes.has(hash)){
     await copyInto(source.file,archived);hashes.delete(entry.hash);hashes.set(hash,path.basename(archived));
     manifest.entries[source.relative]={archive:entry.archive,size:stat.size,mtimeMs:stat.mtimeMs,hash};result.updated++;continue;
    }
    if(hashes.has(hash)){
     manifest.entries[source.relative]={archive:`${source.channel}/${source.year}/${hashes.get(hash)}`,size:stat.size,mtimeMs:stat.mtimeMs,hash};result.duplicates++;continue;
    }
    const name=uniqueName(source.name,folder.taken),target=path.join(folder.dir,name);
    await assertContained(info.root,target);
    await copyInto(source.file,target);
    if(options.failAfterCopy)throw new Error('Errore di prova dopo la copia.');
    folder.taken.add(key(name));folder.names.push(name);hashes.set(hash,name);
    manifest.entries[source.relative]={archive:`${source.channel}/${source.year}/${name}`,size:stat.size,mtimeMs:stat.mtimeMs,hash};result.copied++;
   }catch(e){result.errors.push({file:source.relative,message:e.message});}
  }
  manifest.updatedAt=new Date().toISOString();
  const temp=path.join(archive,`.tmp-${crypto.randomUUID()}.json`);
  await fs.writeFile(temp,JSON.stringify(manifest,null,1),{flag:'wx'});await fs.rename(temp,manifestFile);
  return result;
 }finally{await fs.unlink(lock).catch(()=>{});}
}
module.exports={syncAssetArchive,sourceImages,IMAGE_EXTENSIONS,ARCHIVE};
