'use strict';
// Aggiornamento dall'interno dell'app: la nuova versione viene letta dalla cartella
// "App Social" dentro la cartella Social (sul NAS), descritta da versione.json.
// Il renderer non passa mai percorsi: tutto è risolto qui, dentro App Social.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {PostError,assertContained}=require('./posts.cjs');

const APP_FOLDER='App Social';
const MANIFEST='versione.json';
const BUNDLE_ID='it.progettoilseme.social';

function parseVersion(value){
 const match=/^(\d+)\.(\d+)\.(\d+)$/.exec(String(value||'').trim());
 return match?match.slice(1).map(Number):null;
}
// >0 se a è più recente di b
function compareVersions(a,b){
 const x=parseVersion(a),y=parseVersion(b);
 if(!x||!y)throw new PostError('INPUT','Numero di versione non valido.');
 for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]-y[i];
 return 0;
}
// percorso relativo dichiarato nel manifest: niente assoluti, niente "..", solo dentro App Social
async function resolveInside(folder,relative,label){
 if(typeof relative!=='string'||!relative.trim()||path.isAbsolute(relative)||relative.split(/[\\/]+/).includes('..'))throw new PostError('UPDATE',`Il file versione.json indica un percorso non valido per ${label}.`);
 const full=path.join(folder,...relative.split(/[\\/]+/));
 await assertContained(folder,full);
 return full;
}
async function readManifest(root){
 if(!root)throw new PostError('UPDATE','La cartella Social non è configurata.');
 const folder=path.join(root,APP_FOLDER),file=path.join(folder,MANIFEST);
 await assertContained(root,file);
 const stat=await fs.lstat(file);
 if(!stat.isFile()||stat.size>64*1024)throw new PostError('UPDATE','Il file versione.json non è valido.');
 let manifest;
 try{manifest=JSON.parse(await fs.readFile(file,'utf8'));}catch{throw new PostError('UPDATE','Il file versione.json non è leggibile.');}
 if(!manifest||typeof manifest!=='object'||!parseVersion(manifest.version))throw new PostError('UPDATE','Il file versione.json non indica una versione valida.');
 return{folder,manifest};
}
// Cosa offrire all'utente. Non lancia errori: senza NAS o manifest non c'è nessun aggiornamento.
async function checkUpdate(root,currentVersion,platform=process.platform){
 try{
  const {manifest}=await readManifest(root);
  const available=compareVersions(manifest.version,currentVersion)>0&&(platform==='darwin'?!!manifest.mac:platform==='win32'?!!manifest.windows:false);
  return{available,version:manifest.version,current:currentVersion,notes:typeof manifest.notes==='string'?manifest.notes.slice(0,500):''};
 }catch(e){return{available:false,current:currentVersion,reason:e.message};}
}
// Bundle .app in esecuzione: .../SocialDesk.app/Contents/MacOS/SocialDesk
function runningBundle(execPath){
 const bundle=path.resolve(execPath,'..','..','..');
 return bundle.endsWith('.app')?bundle:null;
}
async function sameFile(a,b){
 try{return (await fs.realpath(a))===(await fs.realpath(b));}catch{return false;}
}
// Prepara l'aggiornamento verificando file, versione e permessi; restituisce cosa fare.
async function prepareUpdate(root,{currentVersion,platform=process.platform,execPath=process.execPath,packaged=true}){
 const {folder,manifest}=await readManifest(root);
 if(compareVersions(manifest.version,currentVersion)<=0)throw new PostError('UPDATE','Stai già usando la versione più recente.');
 if(!packaged)throw new PostError('UPDATE','L’aggiornamento funziona solo dall’app installata, non dai sorgenti.');
 if(platform==='win32'){
  const installer=await resolveInside(folder,manifest.windows,'Windows');
  const stat=await fs.lstat(installer).catch(()=>null);
  if(!stat||!stat.isFile()||!/\.exe$/i.test(installer))throw new PostError('UPDATE','Il programma di installazione indicato in versione.json non è disponibile.');
  return{platform,version:manifest.version,installer};
 }
 if(platform==='darwin'){
  const source=await resolveInside(folder,manifest.mac,'Mac');
  const stat=await fs.lstat(source).catch(()=>null);
  if(!stat||!stat.isDirectory()||!source.endsWith('.app'))throw new PostError('UPDATE','La nuova app per Mac indicata in versione.json non è disponibile.');
  const plist=await fs.readFile(path.join(source,'Contents','Info.plist'),'utf8').catch(()=>'');
  if(!plist.includes(BUNDLE_ID)||!plist.includes(manifest.version))throw new PostError('UPDATE','La nuova app per Mac non corrisponde a SocialDesk '+manifest.version+'.');
  const target=runningBundle(execPath);
  if(!target)throw new PostError('UPDATE','Non riesco a individuare l’app in uso.');
  // l'app in uso è proprio quella già sostituita in App Social: basta riaprirla
  if(await sameFile(source,target))return{platform,version:manifest.version,restartOnly:true};
  try{await fs.access(path.dirname(target),require('node:fs').constants.W_OK);}
  catch{throw new PostError('UPDATE','Non posso sostituire l’app in '+path.dirname(target)+': mancano i permessi. Copia a mano la nuova SocialDesk.app da App Social.');}
  return{platform,version:manifest.version,source,target};
 }
 throw new PostError('UPDATE','Aggiornamento non disponibile su questo sistema.');
}
const shellQuote=value=>"'"+String(value).replace(/'/g,"'\\''")+"'";
// Mac: copia la nuova app accanto a quella in uso (stesso disco), poi uno script attende
// la chiusura di SocialDesk, scambia le due app e riapre la nuova. In caso di errore rimette la vecchia.
async function launchMacUpdate(plan,{pid=process.pid,env=process.env,keepEnv=false}={}){
 const parent=path.dirname(plan.target),stamp=Date.now();
 const staged=path.join(parent,`.SocialDesk-aggiornamento-${stamp}.app`),old=path.join(parent,`.SocialDesk-precedente-${stamp}.app`);
 await new Promise((resolve,reject)=>{const child=spawn('/usr/bin/ditto',[plan.source,staged],{stdio:'ignore'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new PostError('UPDATE','Copia della nuova app non riuscita (ditto '+code+').')));});
 const binary=path.join(plan.target,'Contents','MacOS','SocialDesk');
 const reopen=keepEnv?`${shellQuote(binary)} >/dev/null 2>&1 &`:`/usr/bin/open ${shellQuote(plan.target)}`;
 const script=[
  '#!/bin/sh',
  `while /bin/kill -0 ${Number(pid)} 2>/dev/null; do /bin/sleep 0.3; done`,
  `if /bin/mv ${shellQuote(plan.target)} ${shellQuote(old)}; then`,
  ` if /bin/mv ${shellQuote(staged)} ${shellQuote(plan.target)}; then /bin/rm -rf ${shellQuote(old)}; else /bin/mv ${shellQuote(old)} ${shellQuote(plan.target)}; /bin/rm -rf ${shellQuote(staged)}; fi`,
  `else /bin/rm -rf ${shellQuote(staged)}; fi`,
  reopen,
  '/bin/rm -f "$0"',
 ].join('\n')+'\n';
 const scriptFile=path.join(os.tmpdir(),`socialdesk-aggiornamento-${stamp}.sh`);
 await fs.writeFile(scriptFile,script,{mode:0o700});
 const child=spawn('/bin/sh',[scriptFile],{detached:true,stdio:'ignore',env});
 child.unref();
 return{staged,scriptFile};
}
// Windows: copia l'installer sul disco locale e lo avvia in silenzio; aggiorna l'installazione
// esistente (stesso appId) e riapre SocialDesk.
async function launchWindowsUpdate(plan){
 const local=path.join(os.tmpdir(),`SocialDesk-Setup-${plan.version}.exe`);
 await fs.copyFile(plan.installer,local);
 const child=spawn(local,['--updated','/S','--force-run'],{detached:true,stdio:'ignore'});
 child.unref();
 return{installer:local};
}
module.exports={APP_FOLDER,MANIFEST,parseVersion,compareVersions,readManifest,checkUpdate,prepareUpdate,launchMacUpdate,launchWindowsUpdate,runningBundle};
