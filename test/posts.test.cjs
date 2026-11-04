'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {unzipSync,strFromU8}=require('fflate');
const {DOMParser}=require('@xmldom/xmldom');
const {validate,planPost,createPost}=require('../lib/posts.cjs');
const {Book}=require('../lib/workbook.cjs');
const fixture=process.env.SOCIAL_TEST_FIXTURE;
if(!fixture)throw new Error('Impostare SOCIAL_TEST_FIXTURE su una copia di test.');
const base={channels:['Facebook','Instagram'],title:'Nuovo post di prova',topic:'Inclusione',format:'Carosello',date:'2026-12-11',undefinedDate:false,year:'2026'};
async function root(t){const dir=await fs.mkdtemp(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-test-'));const dest=path.join(dir,'Cartella con spazi','Social');await fs.cp(fixture,dest,{recursive:true});t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dest;}
async function book(root){return fs.readFile(path.join(root,'Piano editoriale.xlsx'));}
async function snapshot(root){const out={};async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else out[path.relative(root,p)]=(await fs.readFile(p)).toString('base64');}}await walk(root);return out;}
test('validazione: social, date, anno, titolo e caratteri di percorso',()=>{
 assert.throws(()=>validate({...base,channels:[]}),/Seleziona/);
 assert.throws(()=>validate({...base,date:'2027-02-29'}),/valida/);
 assert.equal(validate({...base,date:'2028-02-29'}).year,2028);
 assert.equal(validate({...base,undefinedDate:true,year:'2027'}).prefix,'xx-xx');
 assert.throws(()=>validate({...base,undefinedDate:true,year:'../'}),/anno/);
 assert.equal(validate({...base,title:' Test / Post: nuovo? '}).slug,'Test-Post-nuovo');
 assert.throws(()=>validate({...base,title:'../'}),/titolo/i);
});
test('creazione: stesso ID per due social, file corretti, testi vuoti e template invariati',async t=>{
 const r=await root(t),before=await book(r),p=await planPost(r,base);
 assert.equal(p.id,0);assert.equal(p.folders.length,2);
 const result=await createPost(r,base,p.fingerprint);
 assert.equal(result.id,0);assert.equal(result.rowsAdded,2);
 for(const c of result.created){
  const suffix=c.channel.toLowerCase();
  assert.equal((await fs.readFile(path.join(c.path,'01_Sorgenti',`Nuovo-post-di-prova_${suffix}.txt`))).length,0);
  const template=path.join(r,'00_template',`base ${c.channel}.ai`);
  assert.deepEqual(await fs.readFile(path.join(c.path,'01_Sorgenti',`Nuovo-post-di-prova_${suffix}.ai`)),await fs.readFile(template));
  for(const sub of ['01_Sorgenti','02_Asset','03_Export'])assert.equal((await fs.stat(path.join(c.path,sub))).isDirectory(),true);
 }
 const after=await book(r),info=new Book(after).info(2026);
 assert.equal(info.count,new Book(before).info(2026).count+2);assert.equal(info.nextId,1);
 assert.deepEqual(await fs.readFile(result.backup),before);
 // Nessun altro foglio o asset interno del vecchio piano deve essere riscritto.
 const a=unzipSync(before),b=unzipSync(after);
 for(const name of Object.keys(a))if(!['xl/worksheets/sheet1.xml','xl/worksheets/_rels/sheet1.xml.rels','xl/tables/table1.xml','xl/workbook.xml','xl/_rels/workbook.xml.rels','[Content_Types].xml'].includes(name))assert.deepEqual(b[name],a[name],name);
});
test('numerazione annuale: prosegue nello stesso anno, riparte da zero nel nuovo anno',async t=>{
 const r=await root(t);
 for(const [title,expected] of [['Primo',0],['Secondo',1]]){const input={...base,title};const p=await planPost(r,input);assert.equal(p.id,expected);await createPost(r,input,p.fingerprint);}
 const input={...base,title:'Anno nuovo',channels:['LinkedIn'],undefinedDate:true,year:'2027'};
 const p=await planPost(r,input);assert.equal(p.id,0);assert.equal(p.newYear,true);
 const result=await createPost(r,input,p.fingerprint);
 assert.match(result.created[0].path,/2027.*xx-xx_Anno-nuovo/);
 const w=new Book(await book(r));assert.equal(w.info(2027).count,1);assert.equal(w.info(2027).nextId,1);assert.equal(w.info(2026).nextId,2);
 await fs.writeFile(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-qa-two-years.xlsx'),await book(r));
});
test('Excel aperto: si ferma senza modificare alcun file',async t=>{
 const r=await root(t);await fs.writeFile(path.join(r,'~$Piano editoriale.xlsx'),'aperto');const before=await snapshot(r);
 await assert.rejects(()=>planPost(r,base),e=>e.code==='EXCEL_OPEN');assert.deepEqual(await snapshot(r),before);
});
test('template mancante: nessuna cartella o riga parziale',async t=>{
 const r=await root(t);await fs.unlink(path.join(r,'00_template','base Instagram.ai'));const before=await snapshot(r);
 await assert.rejects(()=>planPost(r,base),e=>e.code==='TEMPLATE');assert.deepEqual(await snapshot(r),before);
});
test('collisioni: non sovrascrive la cartella esistente e non crea gli altri social',async t=>{
 const r=await root(t);await fs.mkdir(path.join(r,'01_Facebook','2026','12-11_Nuovo-post-di-prova'),{recursive:true});const before=await snapshot(r);
 await assert.rejects(()=>planPost(r,base),e=>e.code==='EXISTS');assert.deepEqual(await snapshot(r),before);
});
test('riepilogo scaduto: il file Excel cambiato blocca il salvataggio',async t=>{
 const r=await root(t),p=await planPost(r,base);
 const other={...base,title:'Altro post',channels:['LinkedIn']},q=await planPost(r,other);await createPost(r,other,q.fingerprint);
 const before=await book(r);await assert.rejects(()=>createPost(r,base,p.fingerprint),e=>e.code==='CHANGED');assert.deepEqual(await book(r),before);
 assert.equal(await fs.stat(path.join(r,'01_Facebook','2026','12-11_Nuovo-post-di-prova')).then(()=>true,()=>false),false);
});
test('errore a metà: ripristina cartelle e workbook',async t=>{
 const r=await root(t),p=await planPost(r,base),before=await book(r);
 await assert.rejects(()=>createPost(r,base,p.fingerprint,{failAfterFirstMove:true}),/Errore di prova/);
 assert.deepEqual(await book(r),before);
 for(const name of ['01_Facebook','02_Instagram'])assert.equal(await fs.stat(path.join(r,name,'2026','12-11_Nuovo-post-di-prova')).then(()=>true,()=>false),false);
 assert.equal(await fs.stat(path.join(r,'.social-create.lock')).then(()=>true,()=>false),false);
});
test('concorrenza: una sola operazione alla volta sulla stessa cartella',async t=>{
 const r=await root(t),a={...base,title:'A'},b={...base,title:'B'};
 const [pa,pb]=await Promise.all([planPost(r,a),planPost(r,b)]);
 const outcomes=await Promise.allSettled([createPost(r,a,pa.fingerprint),createPost(r,b,pb.fingerprint)]);
 assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
 assert.equal(new Book(await book(r)).info(2026).nextId,1);
});
test('i nomi di template vengono riconosciuti anche con maiuscole diverse',async t=>{
 const r=await root(t);await fs.rename(path.join(r,'00_template','base Facebook.ai'),path.join(r,'00_template','BASE FACEBOOK.AI'));
 const p=await planPost(r,{...base,channels:['Facebook']});assert.equal(p.folders[0].templateName,'BASE FACEBOOK.AI');
});
