'use strict';
// Ricollega cartella: quando la cartella di un post viene rinominata a mano (Finder/Esplora file),
// il collegamento del piano non la trova più. Qui si individuano i post scollegati, si propongono
// le cartelle "orfane" dello stesso social e anno e si ridà alla cartella scelta il nome che il piano
// si aspetta. Il piano Excel non viene modificato.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {Book}=require('./workbook.cjs');
const {CHANNELS,PostError,rootInfo,assertContained,slug}=require('./posts.cjs');
const {selectedPost}=require('./details.cjs');
const layout=require('./layout.cjs');

const exists=p=>fs.access(p).then(()=>true,()=>false);
const fold=value=>String(value).normalize('NFC').toLowerCase();
const FOLDER_RE=/^(\d{2}-\d{2}|xx-xx)_(.+)$/;

// Cartella del post che il collegamento Excel indica:
// …/01_Posts/<anno>/<ID_Titolo>/01_Sorgenti oppure …/<canale>/<anno>/<MM-GG_Titolo>/01_Sorgenti.
function expectedFolder(root,post){
 if(!post.sourcesRelative||!CHANNELS[post.channel])return null;
 const candidates=[post.sourcesRelative];
 try{const decoded=decodeURIComponent(post.sourcesRelative);if(decoded!==post.sourcesRelative)candidates.unshift(decoded);}catch{}
 for(const relative of candidates){
  const parsed=layout.parseSources(relative,post);
  if(!parsed)continue;
  return{name:parsed.folder,unified:parsed.unified,parentRelative:parsed.parentRelative,relative:parsed.relative,absolute:path.join(root,...parsed.parts.slice(0,3))};
 }
 return null;
}
// Una cartella esiste se c'è la cartella del post (01_Sorgenti può mancare: allora non è un problema di nome).
async function folderPresent(target){
 const actual=await layout.existingPath(path.dirname(path.dirname(target.absolute)),[path.basename(path.dirname(target.absolute)),path.basename(target.absolute)]);
 if(!actual)return false;
 try{return (await fs.stat(actual)).isDirectory();}catch(e){if(e.code==='ENOENT')return false;throw e;}
}
async function readPlan(root){
 const info=await rootInfo(root),buffer=await fs.readFile(info.book);
 return{root:info.root,revision:crypto.createHash('sha256').update(buffer).digest('hex'),posts:new Book(buffer).posts()};
}
// Tutti i post il cui collegamento punta a una cartella che non esiste più.
async function missingFolders(root){
 const plan=await readPlan(root),missing=[];
 for(const post of plan.posts){
  const target=expectedFolder(plan.root,post);
  if(!target)continue;
  await assertContained(plan.root,target.absolute);
  if(!await folderPresent(target))missing.push({key:post.key,year:post.year,channel:post.channel,title:post.title,id:post.id,expected:target.relative});
 }
 return{revision:plan.revision,missing};
}
// nomi (minuscoli) delle cartelle già collegate da qualche riga del piano, per social/anno
function linkedNames(root,posts,parentRelative){
 const names=new Set();
 for(const post of posts){const target=expectedFolder(root,post);if(target&&target.parentRelative===parentRelative)names.add(fold(target.name));}
 return names;
}
const words=value=>fold(value).replace(/^(?:\d{2}-\d{2}|xx-xx|\d+)_/,'').split(/[^a-z0-9àèéìòù]+/).filter(word=>word.length>=3);
function similarity(a,b){
 const x=new Set(words(a)),y=new Set(words(b));if(!x.size||!y.size)return 0;
 let common=0;for(const word of x)if(y.has(word))common++;
 return common/Math.max(x.size,y.size);
}
async function scoreCandidate(folder,name,post,target){
 const reasons=[];let score=0;
 if(target.unified){
  const id=name.match(layout.UNIFIED_FOLDER)?.[1],expectedId=target.name.match(layout.UNIFIED_FOLDER)?.[1];
  if(id!==undefined&&expectedId!==undefined&&Number(id)===Number(expectedId)){score+=4;reasons.push('stesso ID');}
 }else{
  const prefix=name.match(FOLDER_RE)?.[1],expectedPrefix=target.name.match(FOLDER_RE)?.[1];
  if(prefix&&prefix===expectedPrefix){score+=3;reasons.push(prefix==='xx-xx'?'stessa data da definire':'stessa data');}
 }
 const similar=Math.max(similarity(name,target.name),similarity(name,post.title));
 if(similar>=0.3){score+=5*similar;reasons.push('titolo simile');}
 let files=[];
 try{files=(await fs.readdir(path.join(folder,'01_Sorgenti'),{withFileTypes:true})).filter(entry=>entry.isFile()).map(entry=>entry.name);}catch{}
 const fileStart=fold(`${slug(post.title)}_${CHANNELS[post.channel].suffix}`);
 if(files.some(file=>fold(file).startsWith(fileStart))){score+=4;reasons.push('contiene i file del post');}
 return{name,score:Math.round(score*10)/10,reasons,hasSources:files.length>0||await exists(path.join(folder,'01_Sorgenti'))};
}
// Cartelle orfane dello stesso social e anno, dalla più probabile.
async function relinkCandidates(root,input){
 const selected=await selectedPost(root,input),plan=await readPlan(root);
 const target=expectedFolder(selected.root,selected.post);
 if(!target)throw new PostError('INPUT','Questo post non ha un collegamento alla cartella nel piano editoriale.');
 await assertContained(selected.root,target.absolute);
 if(await folderPresent(target))throw new PostError('INPUT','La cartella del post c’è già: non serve ricollegarla. Aggiorna l’elenco.');
 const parent=path.dirname(target.absolute),linked=linkedNames(selected.root,plan.posts,target.parentRelative),candidates=[];
 let entries=[];
 try{entries=await fs.readdir(parent,{withFileTypes:true});}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const entry of entries){
  if(!entry.isDirectory()||entry.name.startsWith('.')||linked.has(fold(entry.name)))continue;
  candidates.push(await scoreCandidate(path.join(parent,entry.name),entry.name,selected.post,target));
 }
 candidates.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'it'));
 return{post:selected.post,expected:target.relative,expectedName:target.name,parent:target.parentRelative,candidates:candidates.slice(0,20)};
}
// Verifica la cartella scelta e cosa succederà, senza modificare nulla (per la conferma).
async function planRelink(root,input,chosenPath){
 const selected=await selectedPost(root,input),plan=await readPlan(root);
 const target=expectedFolder(selected.root,selected.post);
 if(!target)throw new PostError('INPUT','Questo post non ha un collegamento alla cartella nel piano editoriale.');
 await assertContained(selected.root,target.absolute);
 if(await folderPresent(target))throw new PostError('INPUT','La cartella del post c’è già: non serve ricollegarla. Aggiorna l’elenco.');
 let source;
 if(chosenPath){source=path.resolve(chosenPath);}
 else{
  if(typeof input.name!=='string'||!input.name||/[\\/\x00-\x1f:]/.test(input.name)||input.name==='.'||input.name==='..')throw new PostError('INPUT','Scegli una delle cartelle proposte.');
  source=path.join(path.dirname(target.absolute),input.name);
 }
 await assertContained(selected.root,source);
 const stat=await fs.lstat(source).catch(()=>null);
 if(!stat||stat.isSymbolicLink()||!stat.isDirectory())throw new PostError('MISSING','La cartella scelta non è più disponibile.');
 const relative=path.relative(selected.root,source).split(path.sep).join('/');
 const allowed=target.unified?[layout.POSTS_DIR]:Object.values(CHANNELS).map(c=>c.directory);
 if(relative.split('/').length!==3||!allowed.includes(relative.split('/')[0]))throw new PostError('INPUT',target.unified?`Scegli la cartella di un post, dentro ${layout.POSTS_DIR} e l’anno.`:'Scegli la cartella di un post, dentro 01_Facebook, 02_Instagram o 03_LinkedIn e l’anno.');
 if(!await exists(path.join(source,'01_Sorgenti')))throw new PostError('INPUT','La cartella scelta non contiene 01_Sorgenti: non sembra la cartella di un post.');
 for(const post of plan.posts){
  if(post.key===selected.post.key)continue;
  const other=expectedFolder(selected.root,post);
  if(other&&fold(other.absolute)===fold(source))throw new PostError('INPUT',`La cartella scelta è già collegata a “${post.title}” (${post.channel}).`);
 }
 return{root:selected.root,post:selected.post,source,target,from:relative,to:target.relative};
}
async function relinkFolder(root,input,chosenPath){
 const initial=await planRelink(root,input,chosenPath);
 const lock=path.join(initial.root,'.social-create.lock');let handle;
 try{handle=await fs.open(lock,'wx');await handle.writeFile(JSON.stringify({app:'Social',pid:process.pid,host:os.hostname(),at:new Date().toISOString()}));await handle.close();}
 catch(e){if(handle)await handle.close().catch(()=>{});if(e.code==='EEXIST')throw new PostError('LOCKED','Un’altra operazione è in corso. Attendi e riprova.');throw e;}
 try{
  const p=await planRelink(root,input,chosenPath);
  if(p.source!==initial.source)throw new PostError('CHANGED','Le cartelle sono cambiate. Riapri Ricollega cartella.');
  await fs.mkdir(path.dirname(p.target.absolute),{recursive:true});
  if(await exists(p.target.absolute))throw new PostError('COLLISION','Esiste già una cartella con il nome atteso: nessuna cartella è stata rinominata.');
  try{await fs.rename(p.source,p.target.absolute);}
  catch(e){if(['EBUSY','EPERM','EACCES'].includes(e.code))throw new PostError('BUSY','Non riesco a rinominare la cartella: chiudi i file del post (Illustrator, testi, immagini) e riprova.');throw e;}
  return{title:p.post.title,channel:p.post.channel,from:p.from,to:p.to};
 }finally{await fs.unlink(lock).catch(()=>{});}
}
module.exports={expectedFolder,missingFolders,relinkCandidates,planRelink,relinkFolder};
