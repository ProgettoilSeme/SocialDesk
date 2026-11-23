'use strict';
// Aggiornamento dall'interno dell'app: la nuova versione è pubblicata come Release su GitHub
// (repository indicato in package.json → "updates.github"). L'ultima Release contiene:
//   versione.json             {version, notes, mac:{file,size,sha256}, windows:{file,size,sha256}}
//   SocialDesk-Mac.zip        app per Mac (Apple Silicon)
//   SocialDesk-Setup-X.Y.Z.exe installer per Windows
// L'app scarica solo da quella Release, controlla dimensione e impronta SHA-256 dei file e non
// accetta percorsi dal renderer. Il manifest si legge da .../releases/latest/download/versione.json
// (nessuna chiave né token: la Release deve essere pubblica). SOCIAL_UPDATE_URL sostituisce
// l'indirizzo base solo per le prove.
const fs=require('node:fs/promises');
const {createWriteStream}=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {Readable}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {spawn}=require('node:child_process');
const {PostError}=require('./posts.cjs');

const MANIFEST='versione.json';
const BUNDLE_ID='it.progettoilseme.social';
const MAX_MANIFEST=64*1024;
const MAX_DOWNLOAD=600*1024*1024;
const pkg=require('../package.json');
const REPO=pkg.updates?.github||'';

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
// https://github.com/<proprietario>/<repo>/releases (o l'indirizzo di prova)
function releasesUrl(env=process.env){
 const custom=String(env.SOCIAL_UPDATE_URL||'').trim();
 if(custom)return custom.replace(/\/+$/,'');
 if(!/^[\w.-]+\/[\w.-]+$/.test(REPO))throw new PostError('UPDATE','l’indirizzo degli aggiornamenti non è configurato.');
 return `https://github.com/${REPO}/releases`;
}
const manifestUrl=env=>`${releasesUrl(env)}/latest/download/${MANIFEST}`;
const assetUrl=(version,file,env)=>`${releasesUrl(env)}/download/v${version}/${encodeURIComponent(file)}`;

async function request(url,{fetchImpl=globalThis.fetch,timeout=20000}={}){
 let response;
 try{response=await fetchImpl(url,{redirect:'follow',signal:AbortSignal.timeout(timeout),headers:{'User-Agent':'SocialDesk-updater','Cache-Control':'no-cache'}});}
 catch(e){throw new PostError('UPDATE',e?.name==='TimeoutError'?'il server degli aggiornamenti non risponde: controlla la connessione a internet.':'non riesco a raggiungere il server degli aggiornamenti: controlla la connessione a internet.');}
 if(response.status===404)throw new PostError('UPDATE','non c’è ancora nessuna versione pubblicata.');
 if(!response.ok)throw new PostError('UPDATE',`il server degli aggiornamenti ha risposto con un errore (${response.status}).`);
 return response;
}
// file di una piattaforma nel manifest: solo un nome di file (niente cartelle), dimensione e impronta
function asset(manifest,key){
 const a=manifest[key];
 if(!a||typeof a!=='object')return null;
 if(typeof a.file!=='string'||!/^[\w .()+-]+\.(zip|exe)$/i.test(a.file)||a.file.includes('..'))throw new PostError('UPDATE','Il file versione.json indica un nome di file non valido.');
 if(!Number.isInteger(a.size)||a.size<=0||a.size>MAX_DOWNLOAD)throw new PostError('UPDATE','Il file versione.json indica una dimensione non valida.');
 if(typeof a.sha256!=='string'||!/^[a-f0-9]{64}$/.test(a.sha256))throw new PostError('UPDATE','Il file versione.json non indica l’impronta del file.');
 return a;
}
async function readManifest(options={}){
 const response=await request(manifestUrl(options.env),options);
 const length=Number(response.headers.get('content-length')||0);
 if(length>MAX_MANIFEST)throw new PostError('UPDATE','Il file versione.json non è valido.');
 const text=await response.text();
 if(text.length>MAX_MANIFEST)throw new PostError('UPDATE','Il file versione.json non è valido.');
 let manifest;
 try{manifest=JSON.parse(text);}catch{throw new PostError('UPDATE','Il file versione.json non è leggibile.');}
 if(!manifest||typeof manifest!=='object'||!parseVersion(manifest.version))throw new PostError('UPDATE','Il file versione.json non indica una versione valida.');
 return manifest;
}
const platformKey=platform=>platform==='darwin'?'mac':platform==='win32'?'windows':null;
// Cosa offrire all'utente. Non lancia errori: senza internet o senza Release non c'è nessun aggiornamento.
async function checkUpdate(currentVersion,{platform=process.platform,...options}={}){
 try{
  const manifest=await readManifest(options);
  const key=platformKey(platform);
  const available=compareVersions(manifest.version,currentVersion)>0&&!!(key&&asset(manifest,key));
  return{available,version:manifest.version,current:currentVersion,notes:typeof manifest.notes==='string'?manifest.notes.slice(0,500):''};
 }catch(e){return{available:false,current:currentVersion,reason:e.message};}
}
// Scarica un file della Release in una cartella temporanea, controllando dimensione e SHA-256
async function download(url,expected,destination,{progress,...options}={}){
 const response=await request(url,{...options,timeout:options.downloadTimeout||30*60*1000});
 if(!response.body)throw new PostError('UPDATE','Il download dell’aggiornamento è vuoto.');
 const hash=crypto.createHash('sha256');let received=0,last=-1;
 const counter=new (require('node:stream').Transform)({transform(chunk,_enc,done){
  received+=chunk.length;
  if(received>expected.size)return done(new PostError('UPDATE','Il file scaricato è più grande del previsto.'));
  hash.update(chunk);
  const percent=Math.floor(received*100/expected.size);
  if(percent!==last){last=percent;try{progress?.(percent,100,`Scaricamento ${percent}%`);}catch{}}
  done(null,chunk);
 }});
 try{await pipeline(Readable.fromWeb(response.body),counter,createWriteStream(destination,{flags:'wx',mode:0o600}));}
 catch(e){await fs.rm(destination,{force:true});throw e instanceof PostError?e:new PostError('UPDATE','Il download dell’aggiornamento si è interrotto: riprova.');}
 if(received!==expected.size||hash.digest('hex')!==expected.sha256){await fs.rm(destination,{force:true});throw new PostError('UPDATE','Il file scaricato non corrisponde a quello pubblicato (impronta diversa): riprova più tardi.');}
 return destination;
}
// Bundle .app in esecuzione: .../SocialDesk.app/Contents/MacOS/SocialDesk
function runningBundle(execPath){
 const bundle=path.resolve(execPath,'..','..','..');
 return bundle.endsWith('.app')?bundle:null;
}
// Prepara l'aggiornamento: controlla versione e permessi, scarica e verifica il file; restituisce cosa fare.
async function prepareUpdate({currentVersion,platform=process.platform,execPath=process.execPath,packaged=true,progress,...options}){
 const manifest=await readManifest(options);
 if(compareVersions(manifest.version,currentVersion)<=0)throw new PostError('UPDATE','Stai già usando la versione più recente.');
 if(!packaged)throw new PostError('UPDATE','L’aggiornamento funziona solo dall’app installata, non dai sorgenti.');
 const key=platformKey(platform),file=key&&asset(manifest,key);
 if(!file)throw new PostError('UPDATE','Aggiornamento non disponibile su questo sistema.');
 const stamp=Date.now();
 if(platform==='darwin'){
  const target=runningBundle(execPath);
  if(!target)throw new PostError('UPDATE','Non riesco a individuare l’app in uso.');
  try{await fs.access(path.dirname(target),require('node:fs').constants.W_OK);}
  catch{throw new PostError('UPDATE','Non posso sostituire l’app in '+path.dirname(target)+': mancano i permessi. Scarica e installa a mano la nuova versione.');}
  if(!/\.zip$/i.test(file.file))throw new PostError('UPDATE','Il file per Mac indicato in versione.json non è uno zip.');
  const zip=await download(assetUrl(manifest.version,file.file,options.env),file,path.join(os.tmpdir(),`SocialDesk-${manifest.version}-${stamp}.zip`),{progress,...options});
  return{platform,version:manifest.version,zip,target};
 }
 if(!/\.exe$/i.test(file.file))throw new PostError('UPDATE','Il file per Windows indicato in versione.json non è un .exe.');
 const installer=await download(assetUrl(manifest.version,file.file,options.env),file,path.join(os.tmpdir(),`SocialDesk-Setup-${manifest.version}-${stamp}.exe`),{progress,...options});
 return{platform,version:manifest.version,installer};
}
async function checkBundle(app,version){
 const plist=await fs.readFile(path.join(app,'Contents','Info.plist'),'utf8').catch(()=>'');
 if(!plist.includes(BUNDLE_ID)||!plist.includes(version))throw new PostError('UPDATE','La nuova app per Mac non corrisponde a SocialDesk '+version+'.');
}
const run=(file,args)=>new Promise((resolve,reject)=>{const child=spawn(file,args,{stdio:'ignore'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new PostError('UPDATE',`Preparazione della nuova app non riuscita (${path.basename(file)} ${code}).`)));});
// Estrae lo zip scaricato accanto all'app in uso (stesso disco, scambio istantaneo) e ne verifica la versione.
async function stageMacApp(plan,stamp=Date.now()){
 const parent=path.dirname(plan.target),staged=path.join(parent,`.SocialDesk-aggiornamento-${stamp}.app`),unpack=path.join(parent,`.SocialDesk-aggiornamento-${stamp}`);
 try{
  await run('/usr/bin/ditto',['-x','-k',plan.zip,unpack]);
  const app=(await fs.readdir(unpack)).find(name=>name.endsWith('.app'));
  if(!app)throw new PostError('UPDATE','Lo zip non contiene l’app SocialDesk.');
  await checkBundle(path.join(unpack,app),plan.version);
  await fs.rename(path.join(unpack,app),staged);
 }catch(e){await fs.rm(staged,{recursive:true,force:true});throw e;}
 finally{await fs.rm(unpack,{recursive:true,force:true});await fs.rm(plan.zip,{force:true});}
 return staged;
}
// Residui di un aggiornamento interrotto (app chiusa durante la preparazione): si tolgono all'avvio.
async function cleanupLeftovers(execPath=process.execPath){
 const target=runningBundle(execPath);if(!target)return 0;
 const parent=path.dirname(target);let removed=0;
 let names=[];try{names=await fs.readdir(parent);}catch{return 0;}
 for(const name of names){
  if(!/^\.SocialDesk-(aggiornamento|precedente)-\d+(\.app)?$/.test(name))continue;
  try{await fs.rm(path.join(parent,name),{recursive:true,force:true});removed++;}catch{}
 }
 return removed;
}
const shellQuote=value=>"'"+String(value).replace(/'/g,"'\\''")+"'";
// Mac: prepara la nuova app accanto a quella in uso (stesso disco), poi uno script attende
// la chiusura di SocialDesk, scambia le due app e riapre la nuova. In caso di errore rimette la vecchia.
async function launchMacUpdate(plan,{pid=process.pid,env=process.env,keepEnv=false}={}){
 const parent=path.dirname(plan.target),stamp=Date.now();
 const staged=await stageMacApp(plan,stamp),old=path.join(parent,`.SocialDesk-precedente-${stamp}.app`);
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
// Windows: avvia in silenzio l'installer scaricato; aggiorna l'installazione esistente (stesso appId) e riapre SocialDesk.
async function launchWindowsUpdate(plan){
 const child=spawn(plan.installer,['--updated','/S','--force-run'],{detached:true,stdio:'ignore'});
 child.unref();
 return{installer:plan.installer};
}
module.exports={MANIFEST,REPO,parseVersion,compareVersions,releasesUrl,manifestUrl,assetUrl,readManifest,checkUpdate,download,prepareUpdate,stageMacApp,cleanupLeftovers,launchMacUpdate,launchWindowsUpdate,runningBundle};
