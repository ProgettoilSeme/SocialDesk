'use strict';
// Struttura fissa della cartella di ogni cliente (decisione dell'utente, 20/11/2026):
//   00_Cestino, 01_Posts, 02_Settings (settings.json, idee.json, logo), 03_Template (template .ai, Archivio asset)
//   e Piano editoriale.xlsx. I nomi non si scelgono più nelle impostazioni.
// Le cartelle si cercano senza badare a maiuscole e accenti, e si accettano anche i nomi di prima
// (00_cestino, 00_Settings, 00_template), così l'app funziona prima e dopo la loro rinomina.
require('./safe-fs.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');
const NAMES={trash:'00_Cestino',posts:'01_Posts',settings:'02_Settings',template:'03_Template'};
const LEGACY={trash:[],posts:[],settings:['00_Settings'],template:['00_template']};
const fold=name=>String(name).normalize('NFC').toLowerCase();

// Percorso della cartella del cliente per quel tipo: quella esistente (nome nuovo, poi quelli vecchi),
// altrimenti quella con il nome nuovo (non ancora creata).
async function folder(root,kind){
 if(!NAMES[kind])throw new Error('Cartella sconosciuta: '+kind);
 let entries=[];
 try{entries=await fs.readdir(root,{withFileTypes:true});}catch(e){if(!['ENOENT','ENOTDIR'].includes(e.code))throw e;}
 for(const wanted of [NAMES[kind],...LEGACY[kind]]){
  const found=entries.find(e=>e.isDirectory()&&fold(e.name)===fold(wanted));
  if(found)return path.join(root,found.name);
 }
 return path.join(root,NAMES[kind]);
}
// Relativo alla cartella del cliente, con le barre "/" (per i messaggi e il piano)
const relative=(root,target)=>path.relative(root,target).split(path.sep).join('/');
module.exports={NAMES,LEGACY,folder,relative};
