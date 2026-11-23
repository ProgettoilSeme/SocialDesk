'use strict';
// Aggiornamenti da GitHub Releases: un piccolo server HTTP locale fa la parte di
// https://github.com/<repo>/releases (latest/download/versione.json e download/v<versione>/<file>).
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const update=require('../lib/update.cjs');
const isMac=process.platform==='darwin';

const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const describe=(file,data)=>({file,size:data.length,sha256:sha(data)});
async function tempDir(t){const dir=await fs.mkdtemp(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-update-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
// Server delle Release: files = {'/latest/download/versione.json': Buffer|string, '/download/v1.3.0/x.exe': Buffer}
async function releases(t,files){
 const hits=[];
 const server=http.createServer((req,res)=>{
  const url=decodeURIComponent(req.url.split('?')[0]);hits.push(url);
  // come GitHub, "latest" fa un redirect alla Release vera
  if(url.startsWith('/latest/download/')&&files.latestVersion){res.writeHead(302,{Location:`/download/v${files.latestVersion}/${url.slice(17)}`});return res.end();}
  const body=files[url];
  if(body===undefined){res.writeHead(404);return res.end('Not Found');}
  res.writeHead(200,{'Content-Length':Buffer.byteLength(body)});res.end(body);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 return{env:{SOCIAL_UPDATE_URL:`http://127.0.0.1:${server.address().port}`},hits};
}
// Release completa della versione indicata: manifest, installer finto e (su Mac) zip con una SocialDesk.app finta
async function fullRelease(t,version,{plistVersion=version,tamper=false}={}){
 const exe=Buffer.from('MZ installer '+version),files={latestVersion:version};
 const manifest={version,notes:'Novità',windows:describe(`SocialDesk-Setup-${version}.exe`,exe)};
 files[`/download/v${version}/SocialDesk-Setup-${version}.exe`]=tamper?Buffer.from('MZ manomesso '+version):exe;
 if(isMac){
  const {execFileSync}=require('node:child_process');
  const dir=await tempDir(t),app=path.join(dir,'SocialDesk.app','Contents');
  await fs.mkdir(path.join(app,'MacOS'),{recursive:true});
  await fs.writeFile(path.join(app,'Info.plist'),`<plist><string>it.progettoilseme.social</string><string>${plistVersion}</string></plist>`);
  const zip=path.join(dir,'SocialDesk-Mac.zip');
  execFileSync('/usr/bin/ditto',['-c','-k','--keepParent',path.join(dir,'SocialDesk.app'),zip]);
  const data=await fs.readFile(zip);manifest.mac=describe('SocialDesk-Mac.zip',data);
  files[`/download/v${version}/SocialDesk-Mac.zip`]=data;
 }
 files[`/download/v${version}/versione.json`]=JSON.stringify(manifest);
 return{manifest,files};
}

test('confronto versioni numerico, non alfabetico',()=>{
 assert.ok(update.compareVersions('1.10.0','1.9.9')>0);
 assert.ok(update.compareVersions('2.0.0','1.12.1')>0);
 assert.equal(update.compareVersions('1.3.0','1.3.0'),0);
 assert.throws(()=>update.compareVersions('1.3','1.2.0'),/non valido/);
});

test('indirizzi delle Release: repository di package.json, oppure quello di prova',()=>{
 assert.equal(update.REPO,require('../package.json').updates.github);
 assert.equal(update.manifestUrl({}),`https://github.com/${update.REPO}/releases/latest/download/versione.json`);
 assert.equal(update.assetUrl('2.4.0','SocialDesk Setup 2.4.0.exe',{}),`https://github.com/${update.REPO}/releases/download/v2.4.0/SocialDesk%20Setup%202.4.0.exe`);
 assert.equal(update.manifestUrl({SOCIAL_UPDATE_URL:'http://127.0.0.1:9/'}),'http://127.0.0.1:9/latest/download/versione.json');
});

test('controllo: senza internet o senza Release nessun aggiornamento e nessun errore',async t=>{
 const none=await releases(t,{});
 const r=await update.checkUpdate('2.0.0',{platform:'win32',env:none.env});
 assert.equal(r.available,false);assert.match(r.reason,/nessuna versione pubblicata/);
 const offline=await update.checkUpdate('2.0.0',{platform:'win32',env:{SOCIAL_UPDATE_URL:'http://127.0.0.1:9'}});
 assert.equal(offline.available,false);assert.match(offline.reason,/connessione a internet/);
});

test('controllo: propone solo versioni più recenti e con il file per il proprio sistema',async t=>{
 const {files}=await fullRelease(t,'2.4.0');
 const {env,hits}=await releases(t,files);
 const win=await update.checkUpdate('2.3.4',{platform:'win32',env});
 assert.deepEqual(win,{available:true,version:'2.4.0',current:'2.3.4',notes:'Novità'});
 assert.ok(hits.includes('/latest/download/versione.json'),'segue il redirect di latest');
 assert.equal((await update.checkUpdate('2.4.0',{platform:'win32',env})).available,false);
 assert.equal((await update.checkUpdate('2.5.0',{platform:'win32',env})).available,false);
 assert.equal((await update.checkUpdate('2.3.4',{platform:'linux',env})).available,false);
 // manifest senza il file per Mac: niente aggiornamento su Mac
 const onlyWin=JSON.parse(files['/download/v2.4.0/versione.json']);delete onlyWin.mac;
 const other=await releases(t,{latestVersion:'2.4.0','/download/v2.4.0/versione.json':JSON.stringify(onlyWin)});
 assert.equal((await update.checkUpdate('2.3.4',{platform:'darwin',env:other.env})).available,false);
});

test('manifest non valido: nome di file con cartelle, impronta mancante, JSON rotto',async t=>{
 const bad=async manifest=>{const {env}=await releases(t,{'/latest/download/versione.json':typeof manifest==='string'?manifest:JSON.stringify(manifest)});return update.prepareUpdate({currentVersion:'2.0.0',platform:'win32',env});};
 await assert.rejects(bad('{rotto'),/non è leggibile/);
 await assert.rejects(bad({version:'2.4'}),/versione valida/);
 await assert.rejects(bad({version:'2.4.0',windows:{file:'../../evil.exe',size:2,sha256:'a'.repeat(64)}}),/nome di file non valido/);
 await assert.rejects(bad({version:'2.4.0',windows:{file:'SocialDesk-Setup-2.4.0.exe',size:2}}),/impronta/);
 await assert.rejects(bad({version:'2.4.0',windows:{file:'SocialDesk-Setup-2.4.0.exe',size:0,sha256:'a'.repeat(64)}}),/dimensione/);
});

test('Windows: scarica l’installer, controlla dimensione e impronta',async t=>{
 const {files}=await fullRelease(t,'2.4.0');
 const {env}=await releases(t,files);
 const steps=[];
 const plan=await update.prepareUpdate({currentVersion:'2.3.4',platform:'win32',env,progress:(step,total,label)=>steps.push([step,total,label])});
 assert.equal(plan.version,'2.4.0');assert.equal(plan.platform,'win32');
 assert.equal(await fs.readFile(plan.installer,'utf8'),'MZ installer 2.4.0');
 assert.equal(steps.at(-1)[0],100);assert.match(steps.at(-1)[2],/Scaricamento 100%/);
 await fs.rm(plan.installer,{force:true});
 await assert.rejects(update.prepareUpdate({currentVersion:'2.4.0',platform:'win32',env}),/più recente/);
 await assert.rejects(update.prepareUpdate({currentVersion:'2.3.4',platform:'win32',env,packaged:false}),/dai sorgenti/);
});

test('Windows: file manomesso o mancante nella Release → errore e nessun file lasciato',async t=>{
 const before=new Set(await fs.readdir(os.tmpdir()));
 const tampered=await fullRelease(t,'2.4.1',{tamper:true});
 const a=await releases(t,tampered.files);
 await assert.rejects(update.prepareUpdate({currentVersion:'2.3.4',platform:'win32',env:a.env}),/(impronta diversa|più grande)/);
 const missing=await fullRelease(t,'2.4.2');delete missing.files['/download/v2.4.2/SocialDesk-Setup-2.4.2.exe'];
 const b=await releases(t,missing.files);
 await assert.rejects(update.prepareUpdate({currentVersion:'2.3.4',platform:'win32',env:b.env}),/nessuna versione pubblicata/);
 const left=(await fs.readdir(os.tmpdir())).filter(n=>!before.has(n)&&/^SocialDesk-Setup-2\.4\.[12]-/.test(n));
 assert.deepEqual(left,[]);
});

test('Mac: scarica lo zip, lo estrae accanto all’app in uso e ne verifica la versione',{skip:!isMac},async t=>{
 const {files}=await fullRelease(t,'2.4.0');
 const {env}=await releases(t,files);
 const base=await tempDir(t),installed=path.join(base,'Applicazioni','SocialDesk.app'),exec=path.join(installed,'Contents','MacOS','SocialDesk');
 await fs.mkdir(path.dirname(exec),{recursive:true});
 const plan=await update.prepareUpdate({currentVersion:'2.3.4',platform:'darwin',execPath:exec,env});
 assert.equal(plan.target,installed);assert.ok(plan.zip.endsWith('.zip'));
 const staged=await update.stageMacApp(plan,123);
 assert.equal(staged,path.join(base,'Applicazioni','.SocialDesk-aggiornamento-123.app'));
 assert.ok((await fs.readFile(path.join(staged,'Contents','Info.plist'),'utf8')).includes('2.4.0'));
 assert.equal(await fs.stat(plan.zip).then(()=>true,()=>false),false,'lo zip scaricato viene tolto');
 assert.equal(await update.cleanupLeftovers(exec),1);
 assert.deepEqual(await fs.readdir(path.join(base,'Applicazioni')),['SocialDesk.app']);
 // zip con dentro un'altra versione: errore e nessun residuo
 const wrong=await fullRelease(t,'2.4.1',{plistVersion:'2.0.0'});
 const w=await releases(t,wrong.files);
 const plan2=await update.prepareUpdate({currentVersion:'2.3.4',platform:'darwin',execPath:exec,env:w.env});
 await assert.rejects(update.stageMacApp(plan2,456),/non corrisponde/);
 assert.deepEqual(await fs.readdir(path.join(base,'Applicazioni')),['SocialDesk.app']);
});
