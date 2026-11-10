'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {PostError,CHANNELS,assertContained}=require('./posts.cjs');
const FILE='socialdesk-settings.json';
const platform=()=>process.platform==='win32'?'windows':'mac';
const fileFor=root=>path.join(root,'00_template',FILE);
const defaults=root=>({socialRoot:root,templates:{Facebook:'00_template/base Facebook.ai',Instagram:'00_template/base Instagram.ai',LinkedIn:'00_template/base Linkedin.ai'},trash:'00_cestino'});
const blank=()=>({version:1,mac:defaults(''),windows:defaults('')});
function clean(value,label){if(typeof value!=='string'||!value.trim()||value.includes('\0'))throw new PostError('INPUT',`${label}: inserisci un percorso valido.`);return value.trim();}
function resolve(root,value,label){const text=clean(value,label);return path.isAbsolute(text)?path.normalize(text):path.resolve(root,text);}
function relativeOrAbsolute(root,value){const relative=path.relative(root,value);return relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)?relative.split(path.sep).join('/'):value;}
function safeTrash(root,folder){
 const blocked=['00_template','.social-backups','01_Posts',...Object.values(CHANNELS).map(value=>value.directory)];
 if(folder===root||blocked.some(name=>folder===path.join(root,name)||folder.startsWith(path.join(root,name)+path.sep)))throw new PostError('SETTINGS','Scegli un cestino separato da template, backup e cartelle dei social.');
}
async function read(root){
 try{const doc=JSON.parse(await fs.readFile(fileFor(root),'utf8'));if(doc&&doc.version===1&&doc.mac&&typeof doc.mac==='object'&&doc.windows&&typeof doc.windows==='object')return doc;throw Error('Struttura non valida');}
 catch(e){if(e.code==='ENOENT')return blank();throw new PostError('SETTINGS',`Il file ${FILE} non è valido. Correggilo prima di salvare le impostazioni.`);}
}
async function current(root){const doc=await read(root);return{...defaults(root),...doc[platform()],templates:{...defaults(root).templates,...doc[platform()]?.templates},socialRoot:root,settingsFile:fileFor(root)};}
async function templatePath(root,channel){
 const settings=await current(root);let selected=settings.templates[channel];
 // Old folders keep working until the first explicit settings save.
 const hasFile=await fs.stat(fileFor(root)).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
 if(!hasFile){for(const name of CHANNELS[channel].templates){const candidate=path.join(root,'00_template',name);if(await fs.stat(candidate).then(s=>s.isFile(),()=>false)){selected=relativeOrAbsolute(root,candidate);break;}}}
 const file=resolve(root,selected,`Template ${channel}`);await assertContained(root,file);
 if(path.extname(file).toLowerCase()!=='.ai'||!(await fs.stat(file).then(s=>s.isFile(),()=>false)))throw new PostError('TEMPLATE',`Non trovo il template Illustrator per ${channel}: ${file}`);
 return file;
}
async function trashPath(root){const settings=await current(root),folder=resolve(root,settings.trash,'Cestino');await assertContained(root,folder);safeTrash(root,folder);return folder;}
async function save(root,input){
 if(!input||typeof input!=='object')throw new PostError('INPUT','Impostazioni non valide.');
 const socialRoot=path.resolve(clean(input.socialRoot,'Cartella Social'));
 if(socialRoot!==path.resolve(root))throw new PostError('INPUT','Seleziona prima la cartella Social da usare.');
 const templates={};for(const channel of Object.keys(CHANNELS)){
  const file=resolve(root,input.templates?.[channel],`Template ${channel}`);
  await assertContained(root,file);
  if(path.extname(file).toLowerCase()!=='.ai'||!(await fs.stat(file).then(s=>s.isFile(),()=>false)))throw new PostError('TEMPLATE',`Scegli un file .ai esistente per ${channel}.`);
  templates[channel]=relativeOrAbsolute(root,file);
 }
 const trash=resolve(root,input.trash,'Cestino');await assertContained(root,trash);
 safeTrash(root,trash);if(Object.values(templates).some(t=>trash===path.dirname(resolve(root,t,'Template'))))throw new PostError('SETTINGS','La cartella cestino deve essere distinta dai template.');
 if(await fs.stat(trash).then(s=>!s.isDirectory(),e=>e.code==='ENOENT'?false:Promise.reject(e)))throw new PostError('SETTINGS','Il cestino indicato non è una cartella.');
 const doc=await read(root),key=platform();doc[key]={socialRoot:root,templates,trash:relativeOrAbsolute(root,trash)};
 await fs.mkdir(path.join(root,'00_template'),{recursive:true});const target=fileFor(root),staged=target+'.'+crypto.randomUUID()+'.tmp';
 try{await fs.writeFile(staged,JSON.stringify(doc,null,2)+'\n',{flag:'wx'});await fs.rename(staged,target);}finally{await fs.rm(staged,{force:true});}
 return current(root);
}
module.exports={FILE,fileFor,read,current,save,templatePath,trashPath,relativeOrAbsolute,platform};
