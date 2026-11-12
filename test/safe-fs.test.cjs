'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const safe=require('../lib/safe-fs.cjs');

test('stat/lstat/realpath: con ENOTSUP (file del NAS su Windows) si usa il ripiego',async()=>{
 const base=await fs.mkdtemp(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-safefs-'));
 const file=path.join(base,'versione.json'),dir=path.join(base,'Mac');
 await fs.writeFile(file,'{"version":"1.0.0"}');await fs.mkdir(dir);
 const saved={...safe.original};
 const fail=async()=>{throw Object.assign(new Error('ENOTSUP: operation not supported on socket'),{code:'ENOTSUP'});};
 safe.original.stat=fail;safe.original.lstat=fail;safe.original.realpath=fail;
 try{
  const st=await fs.lstat(file);assert.equal(st.isFile(),true);assert.equal(st.size,19);
  assert.equal((await fs.stat(dir)).isDirectory(),true);
  await assert.rejects(fs.stat(path.join(base,'manca.json')),{code:'ENOENT'});
  assert.equal(await fs.realpath(file),path.resolve(file));
  // assertContained e exists di posts.cjs passano anche così
  const {assertContained}=require('../lib/posts.cjs');
  await assertContained(base,file);
 }finally{Object.assign(safe.original,saved);}
 // altri errori restano invariati
 await assert.rejects(fs.stat(path.join(base,'manca.json')),{code:'ENOENT'});
});

test('stat di una cartella con ENOTSUP quando la cartella madre (radice della condivisione) non si può elencare',async()=>{
 const base=await fs.mkdtemp(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-safefs-root-'));
 const social=path.join(base,'Social');await fs.mkdir(social);await fs.writeFile(path.join(social,'Piano editoriale.xlsx'),'x');
 const saved={...safe.original},readdir=fs.readdir;
 const fail=async()=>{throw Object.assign(new Error('ENOTSUP: operation not supported on socket'),{code:'ENOTSUP'});};
 safe.original.stat=fail;safe.original.lstat=fail;
 // come su Windows: elencare \\NAS\Comunicazione\ (la madre di Social) dà ENOTSUP
 fs.readdir=async(p,...rest)=>{if(path.resolve(p)===path.resolve(base))return fail();return readdir.call(fs,p,...rest);};
 try{
  assert.equal((await fs.stat(social)).isDirectory(),true);
  assert.equal((await fs.stat(path.join(social,'Piano editoriale.xlsx'))).isFile(),true);
  await assert.rejects(fs.stat(path.join(base,'Manca')),{code:'ENOENT'});
  const {rootInfo}=require('../lib/posts.cjs');
  assert.equal((await rootInfo(social)).root,path.resolve(social));
 }finally{Object.assign(safe.original,saved);fs.readdir=readdir;await fs.rm(base,{recursive:true,force:true});}
});
