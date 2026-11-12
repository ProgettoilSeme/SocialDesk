'use strict';
// Su Windows, con alcuni file della cartella condivisa del NAS (es. file copiati da un Mac, che hanno
// metadati macOS salvati come flussi alternativi), stat/lstat/realpath falliscono con
// "ENOTSUP: operation not supported on socket". Il file però si apre e si legge normalmente.
// In quel caso ricaviamo le informazioni aprendo il file (fstat) o, per le cartelle, dall'elenco
// della cartella che le contiene. Vale per tutti i moduli che usano node:fs/promises.
const fs=require('node:fs/promises');
const path=require('node:path');

const UNSUPPORTED=new Set(['ENOTSUP','EOPNOTSUPP']);
const original={stat:fs.stat,lstat:fs.lstat,realpath:fs.realpath};
const dirStats=()=>{const now=new Date(0);return{isFile:()=>false,isDirectory:()=>true,isSymbolicLink:()=>false,size:0,mtimeMs:0,ctimeMs:0,birthtimeMs:0,mtime:now,ctime:now,birthtime:now,dev:0,ino:0,mode:0o040755,nlink:1};};

async function fallbackStat(p){
 let handle;
 try{handle=await fs.open(p,'r');return await handle.stat();}
 catch(e){
  if(!['EISDIR','EPERM','EACCES','ENOTSUP','EOPNOTSUPP'].includes(e.code))throw e;
  // cartella: prima si prova a leggerne il contenuto (se si legge, è una cartella). L'elenco della
  // cartella madre è l'ultima risorsa: su Windows la radice di una condivisione (\\NAS\Comunicazione\)
  // spesso non si può elencare e dava "ENOTSUP … scandir" (segnalato l'11-12/11/2026)
  try{await fs.readdir(p);return dirStats();}
  catch(inner){if(inner.code==='ENOENT')throw inner;}
  const parent=path.dirname(p),name=path.basename(p);
  let entries;
  try{entries=await fs.readdir(parent,{withFileTypes:true});}catch{throw e;}
  const entry=entries.find(d=>d.name===name);
  if(!entry)throw Object.assign(new Error(`ENOENT: no such file or directory, stat '${p}'`),{code:'ENOENT',path:p});
  if(entry.isDirectory())return dirStats();
  throw e;
 }
 finally{await handle?.close().catch(()=>{});}
}
function wrap(name,fallback){
 return async function(p,...rest){
  try{return await original[name].call(fs,p,...rest);}
  catch(e){if(!UNSUPPORTED.has(e.code))throw e;return fallback(p,...rest);}
 };
}
function install(){
 if(fs.stat.socialSafe)return;
 fs.stat=Object.assign(wrap('stat',p=>fallbackStat(String(p))),{socialSafe:true});
 fs.lstat=Object.assign(wrap('lstat',p=>fallbackStat(String(p))),{socialSafe:true});
 // senza realpath non si possono seguire i collegamenti: si usa il percorso assoluto
 fs.realpath=Object.assign(wrap('realpath',p=>path.resolve(String(p))),{socialSafe:true});
}
install();
module.exports={install,fallbackStat,original};
