'use strict';
// Struttura delle cartelle dei post.
// - unificata (dalla 1.6.0): 01_Posts/<anno>/<ID>_<Titolo>/{01_Sorgenti,02_Asset,03_Export}
//   una sola cartella per tutti i social dello stesso post; in 01_Sorgenti i file
//   di ogni social hanno il suffisso (Titolo_facebook.ai, Titolo_instagram.md…).
// - per social (storica): 01_Facebook|02_Instagram|03_LinkedIn/<anno>/<MM-GG|xx-xx>_<Titolo>/…
// L'app legge entrambe; i nuovi post usano la struttura unificata quando 01_Posts esiste.
const fs=require('node:fs/promises');
const path=require('node:path');
const POSTS_DIR='01_Posts';
const LEGACY_FOLDER=/^(?:\d{2}-\d{2}|xx-xx)_.+$/;
const UNIFIED_FOLDER=/^(\d+)_(.+)$/;
const SUFFIXES={Facebook:'facebook',Instagram:'instagram',LinkedIn:'linkedin'};
const LEGACY_DIRS={Facebook:'01_Facebook',Instagram:'02_Instagram',LinkedIn:'03_LinkedIn'};
const badSegment=s=>!s||s==='.'||s==='..'||/[\x00-\x1f:]/.test(s);

// Interpreta il collegamento Excel "…/01_Sorgenti" di una riga. Restituisce null se non è valido.
function parseSources(relative,post){
 if(typeof relative!=='string'||!relative||!SUFFIXES[post.channel])return null;
 const parts=relative.replace(/\\/g,'/').split('/');
 if(parts.length!==4||parts[3]!=='01_Sorgenti'||parts.some(badSegment))return null;
 // Nella struttura unificata la cartella può stare in un altro anno (es. un post di dicembre nella scheda dell'anno dopo).
 if(parts[0]===POSTS_DIR&&/^\d{4}$/.test(parts[1]))return{unified:true,parts,folder:parts[2],parentRelative:parts.slice(0,2).join('/'),relative:parts.slice(0,3).join('/')};
 if(parts[0]===LEGACY_DIRS[post.channel]&&parts[1]===String(post.year)&&LEGACY_FOLDER.test(parts[2]))return{unified:false,parts,folder:parts[2],parentRelative:parts.slice(0,2).join('/'),relative:parts.slice(0,3).join('/')};
 return null;
}
// Come parseSources, provando anche la versione decodificata (%20…) del collegamento.
function parseLink(relative,post){
 const values=[relative];
 try{const decoded=decodeURIComponent(relative);if(decoded!==relative)values.push(decoded);}catch{}
 for(const value of values){const parsed=parseSources(value,post);if(parsed)return parsed;}
 return null;
}
const stemOf=name=>{const ext=path.extname(name);return name.slice(0,name.length-ext.length).normalize('NFC').toLowerCase();};
// Social indicato dal suffisso del nome del file (…_facebook.ai), oppure null se il file è comune.
function fileChannel(name){
 const stem=stemOf(name);
 for(const [channel,suffix] of Object.entries(SUFFIXES))if(new RegExp(`[ _.-]${suffix}$`).test(stem)||stem===suffix)return channel;
 return null;
}
// Nella cartella unificata un social vede i propri file e quelli comuni, non quelli degli altri social.
function visibleFor(name,channel,unified){if(!unified)return true;const owner=fileChannel(name);return!owner||owner===channel;}
function ownedBy(name,channel){return fileChannel(name)===channel;}
// La cartella Social usa la struttura unificata se contiene 01_Posts.
async function usesUnified(root){try{return(await fs.stat(path.join(root,POSTS_DIR))).isDirectory();}catch(e){if(e.code==='ENOENT'||e.code==='ENOTDIR')return false;throw e;}}
// ID a tre cifre come nella riorganizzazione (000_, 001_ … 081_).
const formatId=id=>String(id).padStart(3,'0');
const unifiedFolderName=(id,slugTitle)=>`${formatId(id)}_${slugTitle}`;
const sameId=(name,id)=>{const match=String(name).match(UNIFIED_FOLDER);return!!match&&Number(match[1])===Number(id);};
// Percorso reale sul disco: le lettere accentate possono essere scritte in forma composta (NFC, come nel piano)
// o scomposta (NFD, come le crea il Finder). Sulle cartelle di rete i due nomi non coincidono:
// si cerca ogni parte del percorso tra le voci della cartella superiore. Restituisce null se manca.
async function existingPath(base,segments){
 let current=base;
 for(const segment of segments){
  const direct=path.join(current,segment);
  try{await fs.lstat(direct);current=direct;continue;}catch(e){if(e.code!=='ENOENT'&&e.code!=='ENOTDIR')throw e;}
  let entries;try{entries=await fs.readdir(current);}catch(e){if(e.code==='ENOENT'||e.code==='ENOTDIR')return null;throw e;}
  const wanted=segment.normalize('NFC'),found=entries.find(name=>name.normalize('NFC')===wanted);
  if(found===undefined)return null;
  current=path.join(current,found);
 }
 return current;
}
module.exports={formatId,sameId,existingPath,POSTS_DIR,LEGACY_FOLDER,UNIFIED_FOLDER,LEGACY_DIRS,SUFFIXES,parseSources,parseLink,fileChannel,visibleFor,ownedBy,usesUnified,unifiedFolderName};
