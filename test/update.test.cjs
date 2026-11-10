'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const update=require('../lib/update.cjs');

async function social(manifest,{mac=true,win=true,version='1.3.0'}={}){
 const base=await fs.mkdtemp(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-update-'));
 const root=path.join(base,'Social'),folder=path.join(root,'App Social');
 await fs.mkdir(path.join(folder,'Windows'),{recursive:true});
 if(mac){const app=path.join(folder,'Mac','SocialDesk.app','Contents');await fs.mkdir(path.join(app,'MacOS'),{recursive:true});await fs.writeFile(path.join(app,'Info.plist'),`<plist><string>it.progettoilseme.social</string><string>${version}</string></plist>`);}
 if(win)await fs.writeFile(path.join(folder,'Windows',`SocialDesk-Setup-${version}.exe`),'MZ');
 if(manifest!==undefined)await fs.writeFile(path.join(folder,'versione.json'),typeof manifest==='string'?manifest:JSON.stringify(manifest));
 return{base,root,folder};
}
const manifest=(version='1.3.0')=>({version,mac:'Mac/SocialDesk.app',windows:`Windows/SocialDesk-Setup-${version}.exe`,notes:'Novità'});

test('confronto versioni numerico, non alfabetico',()=>{
 assert.ok(update.compareVersions('1.2.10','1.2.9')>0);
 assert.ok(update.compareVersions('1.3.0','1.2.15')>0);
 assert.equal(update.compareVersions('1.2.15','1.2.15'),0);
 assert.ok(update.compareVersions('1.2.9','1.2.10')<0);
 assert.throws(()=>update.compareVersions('1.2','1.2.0'));
});

test('controllo: senza manifest o cartella nessun aggiornamento e nessun errore',async()=>{
 const {root}=await social(undefined);
 assert.equal((await update.checkUpdate(root,'1.2.15','darwin')).available,false);
 assert.equal((await update.checkUpdate('', '1.2.15','darwin')).available,false);
 assert.equal((await update.checkUpdate(path.join(root,'manca'),'1.2.15','win32')).available,false);
});

test('controllo: propone solo versioni più recenti e per il proprio sistema',async()=>{
 const {root}=await social(manifest('1.3.0'));
 const mac=await update.checkUpdate(root,'1.2.15','darwin');
 assert.equal(mac.available,true);assert.equal(mac.version,'1.3.0');assert.equal(mac.notes,'Novità');
 assert.equal((await update.checkUpdate(root,'1.3.0','darwin')).available,false);
 assert.equal((await update.checkUpdate(root,'1.4.0','win32')).available,false);
 assert.equal((await update.checkUpdate(root,'1.2.15','linux')).available,false);
 const {root:onlyMac}=await social({version:'1.3.0',mac:'Mac/SocialDesk.app'});
 assert.equal((await update.checkUpdate(onlyMac,'1.2.15','win32')).available,false);
});

test('manifest non valido o con percorsi fuori da App Social',async()=>{
 assert.equal((await update.checkUpdate((await social('{non json')).root,'1.0.0','darwin')).available,false);
 assert.equal((await update.checkUpdate((await social({version:'tre'})).root,'1.0.0','darwin')).available,false);
 for(const bad of ['../fuori.exe','/tmp/x.exe','Windows/../../x.exe']){
  const {root}=await social({version:'1.3.0',windows:bad,mac:bad});
  await assert.rejects(update.prepareUpdate(root,{currentVersion:'1.2.15',platform:'win32'}),/percorso non valido/);
  await assert.rejects(update.prepareUpdate(root,{currentVersion:'1.2.15',platform:'darwin',execPath:'/Applications/SocialDesk.app/Contents/MacOS/SocialDesk'}),/percorso non valido/);
 }
});

test('Windows: installer esistente; manca o non è .exe → errore chiaro',async()=>{
 const {root,folder}=await social(manifest('1.3.0'));
 const plan=await update.prepareUpdate(root,{currentVersion:'1.2.15',platform:'win32'});
 assert.equal(plan.installer,path.join(folder,'Windows','SocialDesk-Setup-1.3.0.exe'));
 await assert.rejects(update.prepareUpdate(root,{currentVersion:'1.3.0',platform:'win32'}),/più recente/);
 await assert.rejects(update.prepareUpdate(root,{currentVersion:'1.2.15',platform:'win32',packaged:false}),/app installata/);
 const {root:missing}=await social(manifest('1.3.0'),{win:false});
 await assert.rejects(update.prepareUpdate(missing,{currentVersion:'1.2.15',platform:'win32'}),/non è disponibile/);
});

test('Mac: sostituzione accanto all’app in uso, solo riavvio se è la stessa app, versione verificata',async()=>{
 const {base,root,folder}=await social(manifest('1.3.0'));
 const installed=path.join(base,'Applicazioni','SocialDesk.app');
 await fs.mkdir(path.join(installed,'Contents','MacOS'),{recursive:true});
 const plan=await update.prepareUpdate(root,{currentVersion:'1.2.15',platform:'darwin',execPath:path.join(installed,'Contents','MacOS','SocialDesk')});
 assert.equal(plan.target,installed);assert.equal(plan.source,path.join(folder,'Mac','SocialDesk.app'));
 const same=await update.prepareUpdate(root,{currentVersion:'1.2.15',platform:'darwin',execPath:path.join(folder,'Mac','SocialDesk.app','Contents','MacOS','SocialDesk')});
 assert.equal(same.restartOnly,true);
 const {root:wrong}=await social(manifest('1.3.0'),{version:'1.2.99'});
 await assert.rejects(update.prepareUpdate(wrong,{currentVersion:'1.2.15',platform:'darwin',execPath:path.join(installed,'Contents','MacOS','SocialDesk')}),/non corrisponde/);
});

test('Mac: lo zip ha la precedenza, si estrae accanto all’app in uso e la versione viene verificata',{skip:process.platform!=='darwin'},async()=>{
 const {execFileSync}=require('node:child_process');
 const {base,root,folder}=await social({...manifest('1.3.0'),macZip:'Mac/SocialDesk-Mac.zip'});
 execFileSync('/usr/bin/ditto',['-c','-k','--keepParent',path.join(folder,'Mac','SocialDesk.app'),path.join(folder,'Mac','SocialDesk-Mac.zip')]);
 const installed=path.join(base,'Applicazioni','SocialDesk.app');
 await fs.mkdir(path.join(installed,'Contents','MacOS'),{recursive:true});
 const plan=await update.prepareUpdate(root,{currentVersion:'1.2.15',platform:'darwin',execPath:path.join(installed,'Contents','MacOS','SocialDesk')});
 assert.equal(plan.zip,path.join(folder,'Mac','SocialDesk-Mac.zip'));assert.equal(plan.source,undefined);
 const staged=await update.stageMacApp(plan,123);
 assert.equal(staged,path.join(base,'Applicazioni','.SocialDesk-aggiornamento-123.app'));
 assert.ok((await fs.readFile(path.join(staged,'Contents','Info.plist'),'utf8')).includes('1.3.0'));
 assert.deepEqual((await fs.readdir(path.join(base,'Applicazioni'))).sort(),['.SocialDesk-aggiornamento-123.app','SocialDesk.app']);
 // residui tolti all'avvio
 assert.equal(await update.cleanupLeftovers(path.join(installed,'Contents','MacOS','SocialDesk')),1);
 assert.deepEqual(await fs.readdir(path.join(base,'Applicazioni')),['SocialDesk.app']);
 // zip con una versione diversa: errore e nessun residuo
 const wrong=await social({...manifest('1.3.1'),macZip:'Mac/SocialDesk-Mac.zip'},{version:'1.3.0'});
 execFileSync('/usr/bin/ditto',['-c','-k','--keepParent',path.join(wrong.folder,'Mac','SocialDesk.app'),path.join(wrong.folder,'Mac','SocialDesk-Mac.zip')]);
 const plan2=await update.prepareUpdate(wrong.root,{currentVersion:'1.2.15',platform:'darwin',execPath:path.join(installed,'Contents','MacOS','SocialDesk')});
 await assert.rejects(update.stageMacApp(plan2,456),/non corrisponde/);
 assert.deepEqual(await fs.readdir(path.join(base,'Applicazioni')),['SocialDesk.app']);
});
