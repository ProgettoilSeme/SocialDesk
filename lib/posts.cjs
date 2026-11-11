'use strict';
require('./safe-fs.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {execFileSync,execFile}=require('node:child_process');
const {Book}=require('./workbook.cjs');
const layout=require('./layout.cjs');
const CHANNELS={
 Facebook:{directory:'01_Facebook',suffix:'facebook',templates:['base Facebook.ai','base facebook - linkedin.ai']},
 Instagram:{directory:'02_Instagram',suffix:'instagram',templates:['base Instagram.ai']},
 LinkedIn:{directory:'03_LinkedIn',suffix:'linkedin',templates:['base Linkedin.ai']},
};
const FORMATS=['Immagine singola','Carosello','Video','Reel','Storia'];
class PostError extends Error { constructor(code,message){super(message);this.code=code;} }
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const exists=async p=>fs.stat(p).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});
function normalize(value,max,label){if(typeof value!=='string'||value.trim().length>max)throw new PostError('INPUT',`${label} non valido.`);return value.trim();}
function slug(title){return title.normalize('NFC').replace(/[\x00-\x1f<>:"/\\|?*]/g,'-').replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^[. -]+|[. -]+$/g,'');}
const CAPS_MESSAGE='Non scrivere il titolo tutto in maiuscolo: va bene solo la prima lettera (es. «Buone feste»).';
function allCaps(title){const letters=String(title||'').match(/\p{L}/gu)||[];return letters.length>1&&!/\p{Ll}/u.test(title)&&/\p{Lu}/u.test(title);}
function validate(input,now=new Date()){
 if(!input||typeof input!=='object')throw new PostError('INPUT','Compila i dati del post.');
 const title=normalize(input.title,140,'Titolo');
 if(!title||!slug(title))throw new PostError('INPUT','Inserisci un titolo valido.');
 if(allCaps(title))throw new PostError('INPUT',CAPS_MESSAGE);
 const topic=normalize(input.topic||'',200,'Argomento');
 if(!Array.isArray(input.channels)||!input.channels.length||new Set(input.channels).size!==input.channels.length||input.channels.some(c=>!CHANNELS[c]))throw new PostError('INPUT','Seleziona almeno un social valido.');
 const channels=Object.keys(CHANNELS).filter(c=>input.channels.includes(c));
 const suppliedFormats=input.channelFormats;
 if(suppliedFormats!==undefined&&(typeof suppliedFormats!=='object'||suppliedFormats===null||Array.isArray(suppliedFormats)))throw new PostError('INPUT','Indica il formato per ogni social.');
 const channelFormats={};
 for(const channel of channels){
  // il formato è facoltativo: vuoto = da definire
  const format=(suppliedFormats===undefined?input.format:suppliedFormats[channel])??'';
  if(format!==''&&!FORMATS.includes(format))throw new PostError('INPUT',`Scegli un formato valido per ${channel}.`);
  channelFormats[channel]=format;
 }
 const supplied=input.channelDates;
 if(supplied!==undefined&&(typeof supplied!=='object'||supplied===null||Array.isArray(supplied)))throw new PostError('INPUT','Indica le date dei social selezionati.');
 const channelDates={};
 let year=null;
 for(const channel of channels){
  const selection=supplied===undefined?input:supplied[channel];
  if(!selection||typeof selection!=='object')throw new PostError('INPUT',`Indica la data di ${channel}.`);
  let date=null;
  if(selection.undefinedDate!==true){
   const value=String(selection.date||''),parsed=new Date(value+'T00:00:00Z');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value||Number(value.slice(0,4))<1900)throw new PostError('INPUT',`La data di ${channel} non è valida.`);
   date=value;
   const selectedYear=Number(value.slice(0,4));
   if(year!==null&&year!==selectedYear)throw new PostError('YEAR','Le date dei social dello stesso post devono essere nello stesso anno per condividere l’ID.');
   year=selectedYear;
  }
  channelDates[channel]={date,undefinedDate:date===null,prefix:date?date.slice(5):'xx-xx'};
 }
 if(year===null){
  const value=String(input.year??now.getFullYear());
  if(!/^\d{4}$/.test(value)||Number(value)<1900||Number(value)>9999)throw new PostError('INPUT','Inserisci un anno valido a quattro cifre.');
  year=Number(value);
 }
 const dates=channels.map(channel=>channelDates[channel].date);
 const date=dates.every(value=>value===dates[0])?dates[0]:null;
 const undefinedDate=dates.every(value=>value===null);
 const prefix=channels.every(channel=>channelDates[channel].prefix===channelDates[channels[0]].prefix)?channelDates[channels[0]].prefix:null;
 const name=slug(title);
 if(Buffer.byteLength(`${name}_instagram.ai`)>240)throw new PostError('INPUT','Il titolo è troppo lungo per il nome dei file: accorcialo.');
 const formats=channels.map(channel=>channelFormats[channel]);
 return{title,topic,format:formats.every(value=>value===formats[0])?formats[0]:null,channelFormats,channels,year,date,prefix,slug:name,undefinedDate,channelDates};
}
async function assertContained(root,p){
 const rel=path.relative(root,p);
 if(rel.startsWith('..'+path.sep)||rel==='..'||path.isAbsolute(rel))throw new PostError('PATH','Percorso fuori dalla cartella Social.');
 let parent=p;
 while(!await exists(parent))parent=path.dirname(parent);
 const real=await fs.realpath(parent),realRoot=await fs.realpath(root),inside=path.relative(realRoot,real);
 if(inside==='..'||inside.startsWith('..'+path.sep)||path.isAbsolute(inside))throw new PostError('PATH','La cartella contiene un collegamento che porta fuori da Social.');
}
async function checkExcelClosed(root,book){
 for(const lock of ['~$Piano editoriale.xlsx','.~lock.Piano editoriale.xlsx#'])if(await exists(path.join(root,lock)))throw new PostError('EXCEL_OPEN','Chiudi Piano editoriale.xlsx in Excel e riprova. Nessun post è stato creato.');
 if(process.platform==='win32'){
  try{execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',"try { $f=[System.IO.File]::Open($env:SOCIAL_CHECK_BOOK,'Open','ReadWrite','None'); $f.Dispose(); exit 0 } catch { exit 3 }"],{env:{...process.env,SOCIAL_CHECK_BOOK:book},timeout:10000,windowsHide:true,stdio:'ignore'});}
  catch{throw new PostError('EXCEL_OPEN','Il piano non è disponibile in scrittura. Chiudi Excel e controlla i permessi della cartella.');}
 }else if(process.platform==='darwin'){
  const editor=await macEditorUsing(book);
  if(editor)throw new PostError('EXCEL_OPEN',`Chiudi il piano editoriale in ${editor} e riprova.`);
 }
}
// Mac: quale programma (Excel, Numbers, LibreOffice) ha aperto il piano. Prima si cercano quei programmi
// con ps (istantaneo): se nessuno è aperto il piano è libero. Altrimenti lsof elenca i file aperti solo
// da loro, con -b per non bloccarsi sulle cartelle di rete (NAS) montate. Asincrono e con un nuovo
// tentativo: un NAS lento non blocca l'app e non fa fallire il controllo.
const EDITORS=[[/^Microsoft Excel$/i,'Excel'],[/^Excel$/i,'Excel'],[/^Numbers$/i,'Numbers'],[/^soffice(\.bin)?$/i,'LibreOffice'],[/^LibreOffice$/i,'LibreOffice']];
const runFile=(file,args,options)=>new Promise((resolve,reject)=>execFile(file,args,{encoding:'utf8',maxBuffer:32*1024*1024,...options},(error,stdout)=>error?Object.assign(error,{stdout})&&reject(error):resolve(stdout)));
async function macEditorUsing(book){
 const busy=()=>new PostError('FILE_BUSY','Non riesco a verificare che il piano sia chiuso. Riprova dopo aver chiuso Excel.');
 let list;
 try{list=await runFile('/bin/ps',['-axo','pid=,comm='],{timeout:5000});}catch{throw busy();}
 const editors=new Map();
 for(const line of list.split('\n')){
  const match=line.trim().match(/^(\d+)\s+(.+)$/);if(!match||Number(match[1])===process.pid)continue;
  const name=path.basename(match[2]),editor=EDITORS.find(([re])=>re.test(name));
  if(editor)editors.set(match[1],editor[1]);
 }
 if(!editors.size)return null;
 const targets=new Set([book]);
 try{targets.add(await fs.realpath(book));}catch{}
 const key=value=>value.normalize('NFC').toLowerCase();
 const wanted=new Set([...targets].map(key));
 let output=null;
 for(const timeout of [8000,15000]){
  try{output=await runFile('/usr/sbin/lsof',['-b','-w','-n','-P','-a','-p',[...editors.keys()].join(','),'-Fpn'],{timeout});break;}
  catch(e){if(e.code===1&&typeof e.stdout==='string'){output=e.stdout;break;}}
 }
 if(output===null)throw busy();
 let pid=null;
 for(const line of output.split('\n')){
  if(line[0]==='p')pid=line.slice(1);
  else if(line[0]==='n'&&wanted.has(key(line.slice(1))))return editors.get(pid)||'un altro programma';
 }
 return null;
}
async function rootInfo(selectedRoot){
 if(typeof selectedRoot!=='string'||!selectedRoot)throw new PostError('ROOT','Scegli la cartella Social.');
 const root=path.resolve(selectedRoot);
 if(!await exists(root))throw new PostError('ROOT','La cartella Social non è raggiungibile. Ricollega la cartella.');
 const book=path.join(root,'Piano editoriale.xlsx');
 if(!await exists(book))throw new PostError('ROOT','Nella cartella scelta manca Piano editoriale.xlsx.');
 await assertContained(root,book);
 return{root,book};
}
async function templateFor(root,channel){
 const settingsFile=path.join(root,'00_template','socialdesk-settings.json');
 if(await exists(settingsFile))return require('./settings.cjs').templatePath(root,channel);
 const folders=['00_template','00_Template'];
 for(const folder of folders){
  const dir=path.join(root,folder);
  if(!await exists(dir))continue;
  const entries=await fs.readdir(dir,{withFileTypes:true});
  for(const wanted of CHANNELS[channel].templates){
   const file=entries.find(e=>e.isFile()&&e.name.normalize('NFC').toLowerCase()===wanted.normalize('NFC').toLowerCase());
   if(file){const candidate=path.join(dir,file.name);await assertContained(root,candidate);return candidate;}
  }
 }
 throw new PostError('TEMPLATE',`Manca il template ${channel} in 00_template. Nessun post è stato creato.`);
}
async function prepare(selectedRoot,input){
 const post=validate(input),{root,book}=await rootInfo(selectedRoot);
 await checkExcelClosed(root,book);
 const buffer=await fs.readFile(book),workbook=new Book(buffer),info=workbook.info(post.year);
 const folders=[],unified=await layout.usesUnified(root);
 // Struttura unificata: una sola cartella 01_Posts/<anno>/<ID>_<Titolo> per tutti i social del post.
 let shared=null;
 if(unified){
  const yearDir=path.join(root,layout.POSTS_DIR,String(post.year)),name=layout.unifiedFolderName(info.nextId,post.slug);
  shared={relative:path.join(layout.POSTS_DIR,String(post.year),name),target:path.join(yearDir,name)};
  await assertContained(root,shared.target);
  let entries=[];try{entries=await fs.readdir(yearDir,{withFileTypes:true});}catch(e){if(e.code!=='ENOENT')throw e;}
  const sameId=entries.find(e=>e.isDirectory()&&layout.sameId(e.name,info.nextId));
  if(sameId)throw new PostError('EXISTS',`In ${layout.POSTS_DIR}/${post.year} c’è già una cartella con l’ID ${layout.formatId(info.nextId)} (${sameId.name.normalize('NFC')}). Controlla il piano editoriale: nessun file verrà sovrascritto.`);
 }
 for(const channel of post.channels){
  const config=CHANNELS[channel],publication=post.channelDates[channel],relative=shared?shared.relative:path.join(config.directory,String(post.year),`${publication.prefix}_${post.slug}`),target=path.join(root,relative);
  await assertContained(root,target);
  if(process.platform==='win32'&&target.length+post.slug.length+45>248)throw new PostError('PATH','Il percorso è troppo lungo per Windows. Accorcia il titolo o usa una cartella più vicina alla radice.');
  if(await exists(target))throw new PostError('EXISTS',shared?'La cartella del post esiste già. Cambia titolo; nessun file verrà sovrascritto.':`La cartella del post esiste già per ${channel}. Cambia titolo o data; nessun file verrà sovrascritto.`);
  const template=await templateFor(root,channel),templateHash=hash(await fs.readFile(template));
  folders.push({channel,format:post.channelFormats[channel],date:publication.date,undefinedDate:publication.undefinedDate,relative,target,template,templateHash,suffix:config.suffix,sourcesRelative:path.join(relative,'01_Sorgenti').split(path.sep).join('/')});
 }
 const fingerprint=hash(Buffer.from(JSON.stringify({root,post,unified,book:hash(buffer),templates:folders.map(x=>[x.channel,x.templateHash,x.relative])})));
 return{post,root,book,buffer,info,folders,unified,fingerprint};
}
function publicPlan(p){return{id:p.info.nextId,year:p.post.year,date:p.post.date,undefinedDate:p.post.undefinedDate,title:p.post.title,topic:p.post.topic,format:p.post.format,channelFormats:p.post.channelFormats,channels:p.post.channels,root:p.root,newYear:!p.info.exists,unified:p.unified,folders:p.folders.map(f=>({channel:f.channel,format:f.format,date:f.date,undefinedDate:f.undefinedDate,relative:f.relative,templateName:path.basename(f.template),aiName:`${p.post.slug}_${f.suffix}.ai`,textName:`${p.post.slug}_${f.suffix}.md`})),fingerprint:p.fingerprint};}
async function planPost(root,input){return publicPlan(await prepare(root,input));}
async function createPost(root,input,fingerprint,options={}){
 const TOTAL=5;const step=(n,label)=>{try{options.progress?.(n,TOTAL,label);}catch{}};
 step(0,'Controllo del piano e dei template');
 const preliminary=await prepare(root,input);
 const lock=path.join(preliminary.root,'.social-create.lock');
 let handle;
 try{handle=await fs.open(lock,'wx');await handle.writeFile(JSON.stringify({app:'Social',pid:process.pid,host:os.hostname(),at:new Date().toISOString()}));await handle.close();}
 catch(e){if(handle)await handle.close().catch(()=>{});if(e.code==='EEXIST')throw new PostError('LOCKED','Un’altra creazione è in corso in questa cartella. Attendi e riprova.');throw e;}
 let stage,backup,committed=false;const moved=[],createdParents=[];
 try{
  const p=await prepare(root,input);
  if(p.fingerprint!==fingerprint)throw new PostError('CHANGED','Il piano o i template sono cambiati. Aggiorna il riepilogo prima di creare il post.');
  step(1,'Preparazione di cartelle e file');
  const id=p.info.nextId;
  const records=p.folders.map(f=>({channel:f.channel,title:p.post.title,topic:p.post.topic,format:f.format,date:f.date,sourcesRelative:f.sourcesRelative}));
  const updated=new Book(p.buffer).append(p.post.year,id,records);
  stage=await fs.mkdtemp(path.join(p.root,'.social-stage-'));
  // Una cartella per destinazione: nella struttura unificata tutti i social condividono la stessa.
  const groups=[];
  for(const f of p.folders){let group=groups.find(g=>g.target===f.target);if(!group){group={target:f.target,dir:path.join(stage,String(groups.length)),items:[]};groups.push(group);}group.items.push(f);}
  for(const group of groups){
   for(const sub of ['01_Sorgenti','02_Asset','03_Export'])await fs.mkdir(path.join(group.dir,sub),{recursive:true});
   for(const f of group.items){
    const template=await fs.readFile(f.template);if(hash(template)!==f.templateHash)throw new PostError('CHANGED','Un template è cambiato durante la creazione. Riprova.');
    await fs.writeFile(path.join(group.dir,'01_Sorgenti',`${p.post.slug}_${f.suffix}.ai`),template,{flag:'wx'});
    await fs.writeFile(path.join(group.dir,'01_Sorgenti',`${p.post.slug}_${f.suffix}.md`),'',{flag:'wx'});
   }
  }
  const stagedBook=path.join(stage,'piano.xlsx');await fs.writeFile(stagedBook,updated,{flag:'wx'});
  step(2,'Copia di sicurezza del piano');
  await checkExcelClosed(p.root,p.book);
  if(hash(await fs.readFile(p.book))!==hash(p.buffer))throw new PostError('CHANGED','Il piano è cambiato durante la creazione. Nessun post è stato salvato.');
  const backupDir=path.join(p.root,'.social-backups');await assertContained(p.root,backupDir);await fs.mkdir(backupDir,{recursive:true});
  backup=path.join(backupDir,`Piano-${Date.now()}-${crypto.randomUUID()}.xlsx`);await fs.writeFile(backup,p.buffer,{flag:'wx'});
  async function ensure(dir){if(await exists(dir))return;await ensure(path.dirname(dir));await fs.mkdir(dir);createdParents.push(dir);}
  step(3,'Creazione della cartella del post');
  for(const [index,group] of groups.entries()){
   await ensure(path.dirname(group.target));
   await assertContained(p.root,group.target);
   if(await exists(group.target))throw new PostError('EXISTS','Una delle cartelle è stata creata nel frattempo. Operazione annullata.');
   await fs.rename(group.dir,group.target);moved.push(group.target);
   if(options.failAfterFirstMove&&index===0)throw new Error('Errore di prova per verificare il ripristino.');
  }
  step(4,'Salvataggio del piano editoriale');
  await checkExcelClosed(p.root,p.book);
  if(hash(await fs.readFile(p.book))!==hash(p.buffer))throw new PostError('CHANGED','Il piano è cambiato prima del salvataggio. Operazione annullata.');
  await fs.rename(stagedBook,p.book);committed=true;
  return{...publicPlan(p),id,backup,created:p.folders.map(f=>({channel:f.channel,date:f.date,path:f.target})),rowsAdded:records.length};
 }catch(e){
  if(!committed){for(const target of [...moved].reverse())await fs.rm(target,{recursive:true,force:true});for(const dir of [...createdParents].reverse())await fs.rmdir(dir).catch(()=>{});}
  throw e;
 }finally{
  if(stage)await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});
  await fs.unlink(lock).catch(()=>{});
 }
}
module.exports={CHANNELS,FORMATS,PostError,validate,allCaps,CAPS_MESSAGE,slug,rootInfo,planPost,createPost,checkExcelClosed,assertContained,templateFor};
