'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {unzipSync}=require('fflate');
const {Book}=require('../lib/workbook.cjs');
const {planPost,createPost}=require('../lib/posts.cjs');
const {listPosts}=require('../lib/editor.cjs');
const {planPostStatus,savePostStatus}=require('../lib/status.cjs');
const fixture=process.env.SOCIAL_TEST_FIXTURE;
if(!fixture)throw new Error('Impostare SOCIAL_TEST_FIXTURE su una copia.');
async function seed(t,create=true){
 const base=await fs.mkdtemp(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-status-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const root=path.join(base,'Social');await fs.cp(fixture,root,{recursive:true});
 if(create){const input={title:'Stato rapido',topic:'Inclusione',format:'Carosello',channels:['Facebook','Instagram'],date:'2026-11-04',undefinedDate:false};const plan=await planPost(root,input);await createPost(root,input,plan.fingerprint);}
 const list=await listPosts(root),post=create?list.posts.find(p=>p.title==='Stato rapido'&&p.channel==='Facebook'):list.posts[0];
 return{root,file:path.join(root,'Piano editoriale.xlsx'),post,input:{key:post.key,revision:list.revision,status:'pubblicato'}};
}
test('stato rapido: cambia solo G della riga selezionata, mantenendo gli altri dati e canali',async t=>{
 const {root,file,post,input}=await seed(t),before=await fs.readFile(file),rows=new Book(before).posts();
 const txt=path.join(root,'01_Facebook/2026/11-04_Stato-rapido/01_Sorgenti/Stato-rapido_facebook.txt');await fs.writeFile(txt,'Testo da mantenere');
 const result=await savePostStatus(root,input);assert.equal(result.changed,true);assert.equal(result.status,'pubblicato');
 const after=await fs.readFile(file),next=new Book(after).posts();
 assert.deepEqual(next.find(p=>p.key===post.key),{...post,status:'pubblicato'});
 assert.deepEqual(next.filter(p=>p.key!==post.key),rows.filter(p=>p.key!==post.key));
 assert.equal(await fs.readFile(txt,'utf8'),'Testo da mantenere');assert.deepEqual(await fs.readFile(result.backup),before);
 const a=unzipSync(before),b=unzipSync(after);for(const part of Object.keys(a))if(part!=='xl/worksheets/sheet1.xml')assert.deepEqual(b[part],a[part],part);
});
test('tutti i quattro stati consentiti e passaggio da pubblicato a bozza',async t=>{
 const {root,file,post}=await seed(t);
 for(const status of ['immagine da creare','da pubblicare','pubblicato','testi da creare']){
  const list=await listPosts(root);await savePostStatus(root,{key:post.key,revision:list.revision,status});
  const book=new Book(await fs.readFile(file));assert.equal(book.posts().find(p=>p.key===post.key).status,status);assert.equal(book.drafts().some(p=>p.key===post.key),status!=='pubblicato');
 }
});
test('righe storiche senza ID o cartella disponibile: aggiorna soltanto lo stato e preserva ISO',async t=>{
 const {root,file,post,input}=await seed(t,false),before=await fs.readFile(file);
 assert.equal(post.id,null);assert.equal(await fs.stat(path.join(root,post.sourcesRelative)).then(()=>true,()=>false),false);
 await savePostStatus(root,{...input,status:'da pubblicare'});const after=new Book(await fs.readFile(file));assert.deepEqual(after.posts().find(p=>p.key===post.key),{...post,status:'da pubblicare'});
 const previous=new Book(before),s=previous.year(2026),next=after.year(2026),row=Array.from(s.data.childNodes).find(r=>r.nodeType===1&&r.getAttribute('r')===String(post.row)),updated=Array.from(next.data.childNodes).find(r=>r.nodeType===1&&r.getAttribute('r')===String(post.row));
 assert.equal(previous.cell(row,'C').toString(),after.cell(updated,'C').toString());
 assert.equal(await fs.stat(path.join(root,post.sourcesRelative)).then(()=>true,()=>false),false);
});
test('stato invariato: nessuna scrittura o nuovo backup',async t=>{
 const {root,file,post,input}=await seed(t),before=await fs.readFile(file),backups=await fs.readdir(path.join(root,'.social-backups'));
 const p=await planPostStatus(root,{...input,status:post.status});assert.equal(p.changed,false);
 assert.equal((await savePostStatus(root,{...input,status:post.status})).changed,false);assert.deepEqual(await fs.readFile(file),before);assert.deepEqual(await fs.readdir(path.join(root,'.social-backups')),backups);
});
test('errore prima del commit: piano invariato, lock e staging rimossi',async t=>{
 const {root,file,input}=await seed(t),before=await fs.readFile(file);
 await assert.rejects(()=>savePostStatus(root,input,{failBeforeCommit:true}),/Errore di prova/);
 assert.deepEqual(await fs.readFile(file),before);assert.equal((await fs.readdir(root)).some(n=>n.startsWith('.social-stage-')||n==='.social-create.lock'),false);
});
test('Excel aperto, stato non valido e revisioni scadute impediscono il salvataggio',async t=>{
 const {root,file,input}=await seed(t),before=await fs.readFile(file);
 await assert.rejects(()=>savePostStatus(root,{...input,status:'stato inventato'}),e=>e.code==='INPUT');
 await fs.writeFile(path.join(root,'~$Piano editoriale.xlsx'),'Excel');await assert.rejects(()=>savePostStatus(root,input),e=>e.code==='EXCEL_OPEN');await fs.unlink(path.join(root,'~$Piano editoriale.xlsx'));
 await fs.appendFile(file,'\n');await assert.rejects(()=>savePostStatus(root,input),e=>e.code==='CHANGED');assert.deepEqual(await fs.readFile(file),Buffer.concat([before,Buffer.from('\n')]));
});
test('concorrenza: una sola modifica dello stato per la stessa revisione',async t=>{
 const {root,file,post,input}=await seed(t);
 const results=await Promise.allSettled([savePostStatus(root,input),savePostStatus(root,{...input,status:'da pubblicare'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.ok(['pubblicato','da pubblicare'].includes(new Book(await fs.readFile(file)).posts().find(p=>p.key===post.key).status));
});
