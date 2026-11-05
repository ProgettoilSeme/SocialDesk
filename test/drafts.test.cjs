'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {unzipSync,zipSync,strFromU8,strToU8}=require('fflate');
const {DOMParser,XMLSerializer}=require('@xmldom/xmldom');
const {planPost,createPost}=require('../lib/posts.cjs');
const {Book}=require('../lib/workbook.cjs');
const {listDrafts,planDraftDate,updateDraftDate}=require('../lib/drafts.cjs');
const fixture=process.env.SOCIAL_TEST_FIXTURE;
if(!fixture)throw new Error('Impostare SOCIAL_TEST_FIXTURE su una copia di test.');
async function seed(t){
 const base=await fs.mkdtemp(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-drafts-'));
 t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const root=path.join(base,'Social');await fs.cp(fixture,root,{recursive:true});
 const post={title:'Bozza da aggiornare',topic:'Prova',format:'Carosello',channels:['Facebook','Instagram'],undefinedDate:true,year:'2026'};
 const p=await planPost(root,post);await createPost(root,post,p.fingerprint);
 const list=await listDrafts(root),draft=list.drafts.find(d=>d.title===post.title&&d.channel==='Facebook');
 return{root,file:path.join(root,'Piano editoriale.xlsx'),draft,input:{key:draft.key,revision:list.revision,date:'2026-12-15'}};
}
async function changeXml(file,edit){
 const parts=unzipSync(await fs.readFile(file)),doc=new DOMParser().parseFromString(strFromU8(parts['xl/worksheets/sheet1.xml']),'application/xml');
 edit(doc);parts['xl/worksheets/sheet1.xml']=strToU8(new XMLSerializer().serializeToString(doc));await fs.writeFile(file,zipSync(parts));
}
test('bozze: esclude i pubblicati e mostra una voce per ogni canale',async t=>{
 const {root}=await seed(t),list=await listDrafts(root);
 assert.ok(list.drafts.every(d=>d.status.toLowerCase()!=='pubblicato'));
 const own=list.drafts.filter(d=>d.title==='Bozza da aggiornare');
 assert.equal(own.length,2);assert.equal(own[0].id,own[1].id);assert.notEqual(own[0].key,own[1].key);
});
test('data: aggiorna solo Facebook, preserva contenuti e link Instagram con lo stesso ID',async t=>{
 const {root,file,input,draft}=await seed(t),before=await fs.readFile(file);
 const old=path.join(root,'01_Facebook/2026/xx-xx_Bozza-da-aggiornare');
 const source=await fs.readFile(path.join(old,'01_Sorgenti/Bozza-da-aggiornare_facebook.ai'));
 await fs.writeFile(path.join(old,'01_Sorgenti/Bozza-da-aggiornare_facebook.txt'),'Testo da conservare');
 const p=await planDraftDate(root,input),result=await updateDraftDate(root,input,p.fingerprint);
 const next=path.join(root,result.newRelative);
 assert.equal(await fs.stat(old).then(()=>true,()=>false),false);
 assert.deepEqual(await fs.readFile(path.join(next,'01_Sorgenti/Bozza-da-aggiornare_facebook.ai')),source);
 assert.equal(await fs.readFile(path.join(next,'01_Sorgenti/Bozza-da-aggiornare_facebook.txt'),'utf8'),'Testo da conservare');
 const rows=new Book(await fs.readFile(file)).drafts().filter(d=>d.title===draft.title);
 const fb=rows.find(d=>d.channel==='Facebook'),ig=rows.find(d=>d.channel==='Instagram');
 assert.equal(fb.date,input.date);assert.equal(fb.id,draft.id);assert.equal(fb.status,draft.status);
 assert.equal(fb.sourcesRelative,'01_Facebook/2026/12-15_Bozza-da-aggiornare/01_Sorgenti');
 assert.equal(ig.date,null);assert.equal(ig.sourcesRelative,'02_Instagram/2026/xx-xx_Bozza-da-aggiornare/01_Sorgenti');
 assert.deepEqual(await fs.readFile(result.backup),before);
 const a=unzipSync(before),b=unzipSync(await fs.readFile(file));
 for(const name of Object.keys(a))if(!['xl/worksheets/sheet1.xml','xl/worksheets/_rels/sheet1.xml.rels'].includes(name))assert.deepEqual(b[name],a[name],name);
 // Una bozza già datata può essere riprogrammata senza cambiare i nomi dei file.
 const list=await listDrafts(root),again={...input,revision:list.revision,date:'2026-12-16'};
 const q=await planDraftDate(root,again);await updateDraftDate(root,again,q.fingerprint);
 assert.equal(new Book(await fs.readFile(file)).drafts().find(d=>d.key===draft.key).date,again.date);
});
test('bozze storiche: modifica una riga senza assegnarle un ID',async t=>{
 const {root,file,input,draft}=await seed(t);
 await changeXml(file,doc=>{const c=Array.from(doc.getElementsByTagName('c')).find(c=>c.getAttribute('r')==='A'+draft.row);while(c.firstChild)c.removeChild(c.firstChild);c.removeAttribute('t');});
 const list=await listDrafts(root),i={...input,revision:list.revision};
 const p=await planDraftDate(root,i);await updateDraftDate(root,i,p.fingerprint);
 assert.equal(new Book(await fs.readFile(file)).drafts().find(d=>d.key===draft.key).id,null);
});
test('errore dopo rinomina: ripristina cartella, contenuti e piano',async t=>{
 const {root,file,input}=await seed(t),before=await fs.readFile(file),p=await planDraftDate(root,input);
 await assert.rejects(()=>updateDraftDate(root,input,p.fingerprint,{failAfterRename:true}),/Errore di prova/);
 assert.deepEqual(await fs.readFile(file),before);
 assert.equal((await fs.stat(path.join(root,p.oldRelative))).isDirectory(),true);
 assert.equal(await fs.stat(path.join(root,p.newRelative)).then(()=>true,()=>false),false);
 assert.equal(await fs.stat(path.join(root,'.social-create.lock')).then(()=>true,()=>false),false);
});
test('collisioni e cartelle mancanti: non sovrascrive o ricrea il post',async t=>{
 const {root,file,input}=await seed(t),before=await fs.readFile(file);
 const target=path.join(root,'01_Facebook/2026/12-15_Bozza-da-aggiornare');await fs.mkdir(target);
 await fs.writeFile(path.join(target,'presente.txt'),'originale');
 await assert.rejects(()=>planDraftDate(root,input),e=>e.code==='EXISTS');
 assert.deepEqual(await fs.readFile(file),before);
 await fs.rm(target,{recursive:true});await fs.rm(path.join(root,'01_Facebook/2026/xx-xx_Bozza-da-aggiornare'),{recursive:true});
 await assert.rejects(()=>planDraftDate(root,input),e=>e.code==='MISSING');
});
test('piano modificato, Excel aperto, data e anno errati: salvataggio bloccato',async t=>{
 const {root,file,input}=await seed(t),before=await fs.readFile(file),p=await planDraftDate(root,input);
 await assert.rejects(()=>planDraftDate(root,{...input,date:'2026-02-30'}),e=>e.code==='INPUT');
 await assert.rejects(()=>planDraftDate(root,{...input,date:'2027-01-01'}),e=>e.code==='YEAR');
 await fs.writeFile(path.join(root,'~$Piano editoriale.xlsx'),'Excel');
 await assert.rejects(()=>updateDraftDate(root,input,p.fingerprint),e=>e.code==='EXCEL_OPEN');
 await fs.unlink(path.join(root,'~$Piano editoriale.xlsx'));
 await fs.writeFile(file,Buffer.concat([before,Buffer.from('\n')]));
 await assert.rejects(()=>updateDraftDate(root,input,p.fingerprint),e=>e.code==='CHANGED');
});
test('anche un post pubblicato può aggiornare la data senza cambiare lo stato',async t=>{
 const {root,file,input,draft}=await seed(t);
 await changeXml(file,doc=>{const c=Array.from(doc.getElementsByTagName('c')).find(c=>c.getAttribute('r')==='G'+draft.row);c.getElementsByTagName('t')[0].textContent='pubblicato';});
 const list=await listDrafts(root);
 assert.equal(list.drafts.some(d=>d.key===draft.key),false);
 const request={...input,revision:list.revision},plan=await planDraftDate(root,request);
 await updateDraftDate(root,request,plan.fingerprint);
 const post=new Book(await fs.readFile(file)).posts().find(d=>d.key===draft.key);
 assert.equal(post.status,'pubblicato');assert.equal(post.date,input.date);
 assert.equal((await fs.stat(path.join(root,'01_Facebook/2026/12-15_Bozza-da-aggiornare'))).isDirectory(),true);
});
