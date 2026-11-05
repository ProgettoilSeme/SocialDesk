'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {unzipSync}=require('fflate');
const {Book}=require('../lib/workbook.cjs');
const {planPost,createPost}=require('../lib/posts.cjs');
const {listPosts,planPostEdit,savePostEdit}=require('../lib/editor.cjs');
const {postDetails}=require('../lib/details.cjs');
const fixture=process.env.SOCIAL_TEST_FIXTURE;
if(!fixture)throw new Error('Impostare SOCIAL_TEST_FIXTURE su una copia di test.');
async function seed(t){
 const base=await fs.mkdtemp(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-editor-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const root=path.join(base,'Social');await fs.cp(fixture,root,{recursive:true});
 const post={title:'Titolo originale',topic:'Prima',format:'Carosello',channels:['Facebook','Instagram'],undefinedDate:true,year:'2026'};
 const plan=await planPost(root,post);await createPost(root,post,plan.fingerprint);
 const list=await listPosts(root),selected=list.posts.find(p=>p.title===post.title&&p.channel==='Facebook');
 const input={key:selected.key,revision:list.revision,title:'Nuovo titolo',topic:'Dopo',format:'Video',status:'pubblicato',undefinedDate:false,date:'2026-12-12'};
 return{root,file:path.join(root,'Piano editoriale.xlsx'),old:path.join(root,'01_Facebook/2026/xx-xx_Titolo-originale'),selected,input};
}
test('tutti i post: include pubblicati e bozze con campi modificabili',async t=>{
 const {root,selected}=await seed(t),list=await listPosts(root),book=new Book(await fs.readFile(path.join(root,'Piano editoriale.xlsx')));
 assert.ok(list.posts.length>book.drafts().length);assert.ok(list.posts.some(p=>p.status==='pubblicato'));
 assert.equal(selected.topic,'Prima');assert.equal(selected.format,'Carosello');
});
test('testo del post: modifica il TXT del solo social selezionato e lo rinomina col titolo',async t=>{
 const {root,old,input,selected}=await seed(t);
 const details=await postDetails(root,{key:selected.key,revision:input.revision});
 const original=details.editableText;
 assert.equal(original.name,'Titolo-originale_facebook.md');
 const edit={...input,postText:'Testo Facebook aggiornato\nSeconda riga',textName:original.name,textRevision:original.revision};
 const plan=await planPostEdit(root,edit);assert.equal(plan.textChanged,true);
 const result=await savePostEdit(root,edit,plan.fingerprint);
 assert.equal(await fs.readFile(path.join(root,result.newRelative,'01_Sorgenti/Nuovo-titolo_facebook.md'),'utf8'),edit.postText);
 assert.equal(await fs.readFile(path.join(root,'02_Instagram/2026/xx-xx_Titolo-originale/01_Sorgenti/Titolo-originale_instagram.md'),'utf8'),'');
 assert.equal(await fs.stat(old).then(()=>true,()=>false),false);
});
test('testo del post: blocca una versione superata e ripristina TXT, nomi ed Excel se il salvataggio fallisce',async t=>{
 const {root,old,file,input,selected}=await seed(t);
 const original=(await postDetails(root,{key:selected.key,revision:input.revision})).editableText;
 const edit={...input,postText:'Nuovo contenuto',textName:original.name,textRevision:original.revision};
 const beforeBook=await fs.readFile(file),beforeText=await fs.readFile(path.join(old,'01_Sorgenti',original.name));
 const plan=await planPostEdit(root,edit);
 await assert.rejects(()=>savePostEdit(root,edit,plan.fingerprint,{failAfterTextWrite:true}),/Errore di prova/);
 assert.deepEqual(await fs.readFile(file),beforeBook);
 assert.deepEqual(await fs.readFile(path.join(old,'01_Sorgenti',original.name)),beforeText);
 await fs.writeFile(path.join(old,'01_Sorgenti',original.name),'Modifica esterna');
 await assert.rejects(()=>savePostEdit(root,edit,plan.fingerprint),e=>e.code==='CHANGED');
 assert.equal(await fs.readFile(path.join(old,'01_Sorgenti',original.name),'utf8'),'Modifica esterna');
});
test('modifica completa: rinomina cartella, AI/TXT ed export; conserva contenuti, ID e altro canale',async t=>{
 const {root,file,old,selected,input}=await seed(t);
 await fs.writeFile(path.join(old,'01_Sorgenti/Titolo-originale_facebook.md'),'Testo originale da mantenere');
 await fs.writeFile(path.join(old,'03_Export/Titolo-originale_Facebook-1.jpg'),'export');
 await fs.writeFile(path.join(old,'02_Asset/foto-originale.png'),'asset indipendente');
 const ai=await fs.readFile(path.join(old,'01_Sorgenti/Titolo-originale_facebook.ai')),before=await fs.readFile(file);
 const plan=await planPostEdit(root,input);assert.equal(plan.renames.length,3);
 const result=await savePostEdit(root,input,plan.fingerprint),target=path.join(root,result.newRelative);
 assert.equal(await fs.stat(old).then(()=>true,()=>false),false);
 assert.deepEqual(await fs.readFile(path.join(target,'01_Sorgenti/Nuovo-titolo_facebook.ai')),ai);
 assert.equal(await fs.readFile(path.join(target,'01_Sorgenti/Nuovo-titolo_facebook.md'),'utf8'),'Testo originale da mantenere');
 assert.equal(await fs.readFile(path.join(target,'03_Export/Nuovo-titolo_Facebook-1.jpg'),'utf8'),'export');
 assert.equal(await fs.readFile(path.join(target,'02_Asset/foto-originale.png'),'utf8'),'asset indipendente');
 const rows=new Book(await fs.readFile(file)).posts(),fb=rows.find(p=>p.key===selected.key),ig=rows.find(p=>p.title==='Titolo originale'&&p.channel==='Instagram');
 assert.equal(fb.id,selected.id);assert.equal(fb.title,input.title);assert.equal(fb.topic,input.topic);assert.equal(fb.format,input.format);assert.equal(fb.status,'pubblicato');assert.equal(fb.date,input.date);
 assert.equal(fb.sourcesRelative,'01_Facebook/2026/12-12_Nuovo-titolo/01_Sorgenti');assert.equal(ig.date,null);
 assert.ok(await fs.stat(path.join(root,'02_Instagram/2026/xx-xx_Titolo-originale/01_Sorgenti/Titolo-originale_instagram.ai')));
 assert.deepEqual(await fs.readFile(result.backup),before);
 const a=unzipSync(before),b=unzipSync(await fs.readFile(file));
 for(const name of Object.keys(a))if(!['xl/worksheets/sheet1.xml','xl/worksheets/_rels/sheet1.xml.rels'].includes(name))assert.deepEqual(b[name],a[name],name);
 // Un pubblicato resta selezionabile e può tornare a bozza senza data.
 const list=await listPosts(root),again={...input,revision:list.revision,undefinedDate:true,status:'da pubblicare'};
 const q=await planPostEdit(root,again);await savePostEdit(root,again,q.fingerprint);
 assert.equal(new Book(await fs.readFile(file)).posts().find(p=>p.key===selected.key).date,null);
 assert.ok(await fs.stat(path.join(root,'01_Facebook/2026/xx-xx_Nuovo-titolo/01_Sorgenti/Nuovo-titolo_facebook.md')));
});
for(const fault of ['failAfterFileRename','failAfterFolderRename'])test(`rollback completo: ${fault}`,async t=>{
 const {root,file,old,input}=await seed(t),before=await fs.readFile(file),ai=await fs.readFile(path.join(old,'01_Sorgenti/Titolo-originale_facebook.ai'));
 const plan=await planPostEdit(root,input);
 await assert.rejects(()=>savePostEdit(root,input,plan.fingerprint,{[fault]:true}),/Errore di prova/);
 assert.deepEqual(await fs.readFile(file),before);assert.deepEqual(await fs.readFile(path.join(old,'01_Sorgenti/Titolo-originale_facebook.ai')),ai);
 assert.equal(await fs.stat(path.join(root,plan.newRelative)).then(()=>true,()=>false),false);
 assert.equal(await fs.stat(path.join(root,'.social-create.lock')).then(()=>true,()=>false),false);
});
test('collisione file: nessuna sovrascrittura e nessuna rinomina parziale',async t=>{
 const {file,old,root,input}=await seed(t),before=await fs.readFile(file);
 await fs.writeFile(path.join(old,'01_Sorgenti/Nuovo-titolo_facebook.md'),'già presente');
 await assert.rejects(()=>planPostEdit(root,input),e=>e.code==='EXISTS');
 assert.deepEqual(await fs.readFile(file),before);assert.equal(await fs.readFile(path.join(old,'01_Sorgenti/Nuovo-titolo_facebook.md'),'utf8'),'già presente');
});
test('collisione cartella: conserva la destinazione esistente',async t=>{
 const {root,file,input}=await seed(t),before=await fs.readFile(file);
 const target=path.join(root,'01_Facebook/2026/12-12_Nuovo-titolo');await fs.mkdir(target);await fs.writeFile(path.join(target,'originale.txt'),'presente');
 await assert.rejects(()=>planPostEdit(root,input),e=>e.code==='EXISTS');assert.deepEqual(await fs.readFile(file),before);
});
test('file modificati dopo il riepilogo: blocca la rinomina e preserva il nuovo contenuto',async t=>{
 const {root,file,old,input}=await seed(t),before=await fs.readFile(file),plan=await planPostEdit(root,input);
 await fs.writeFile(path.join(old,'01_Sorgenti/Titolo-originale_facebook.md'),'Modifica successiva');
 await assert.rejects(()=>savePostEdit(root,input,plan.fingerprint),e=>e.code==='CHANGED');
 assert.deepEqual(await fs.readFile(file),before);assert.equal(await fs.readFile(path.join(old,'01_Sorgenti/Titolo-originale_facebook.md'),'utf8'),'Modifica successiva');
});
test('metadati: preserva i nomi se il titolo e la data non cambiano',async t=>{
 const {root,old,input,selected}=await seed(t),edit={...input,title:selected.title,undefinedDate:true};
 const plan=await planPostEdit(root,edit);assert.equal(plan.renames.length,0);assert.equal(plan.oldRelative,plan.newRelative);
 await savePostEdit(root,edit,plan.fingerprint);assert.ok(await fs.stat(path.join(old,'01_Sorgenti/Titolo-originale_facebook.ai')));
});
test('validazione, Excel aperto e revisioni scadute impediscono il salvataggio',async t=>{
 const {root,file,input}=await seed(t),before=await fs.readFile(file);
 for(const fields of [{title:''},{format:'invalid'},{status:'invalid'},{date:'2026-02-30'},{date:'2027-01-01'}])await assert.rejects(()=>planPostEdit(root,{...input,...fields}),e=>['INPUT','YEAR'].includes(e.code));
 await fs.writeFile(path.join(root,'~$Piano editoriale.xlsx'),'aperto');await assert.rejects(()=>planPostEdit(root,input),e=>e.code==='EXCEL_OPEN');await fs.unlink(path.join(root,'~$Piano editoriale.xlsx'));
 await fs.writeFile(file,Buffer.concat([before,Buffer.from('\n')]));await assert.rejects(()=>planPostEdit(root,input),e=>e.code==='CHANGED');
});
test('sorgenti con nomi storici e Unicode: rinomina i principali senza toccare gli asset',async t=>{
 const {root,old,input}=await seed(t);
 await fs.rename(path.join(old,'01_Sorgenti/Titolo-originale_facebook.ai'),path.join(old,'01_Sorgenti/vecchio.ai'));
 await fs.rename(path.join(old,'01_Sorgenti/Titolo-originale_facebook.md'),path.join(old,'01_Sorgenti/testo storico.txt'));
 const edit={...input,title:'Novità e inclusione'};const plan=await planPostEdit(root,edit);await savePostEdit(root,edit,plan.fingerprint);
 assert.ok(await fs.stat(path.join(root,plan.newRelative,'01_Sorgenti/Novità-e-inclusione_facebook.ai')));
 assert.ok(await fs.stat(path.join(root,plan.newRelative,'01_Sorgenti/Novità-e-inclusione_facebook.txt')));
});
test('post storici senza ID: modifica e rinomina senza assegnare un numero',async t=>{
 const {root,file,selected,input}=await seed(t);
 const {zipSync,strFromU8,strToU8}=require('fflate'),{DOMParser,XMLSerializer}=require('@xmldom/xmldom');
 const parts=unzipSync(await fs.readFile(file)),doc=new DOMParser().parseFromString(strFromU8(parts['xl/worksheets/sheet1.xml']),'application/xml');
 const cell=Array.from(doc.getElementsByTagName('c')).find(c=>c.getAttribute('r')==='A'+selected.row);
 while(cell.firstChild)cell.removeChild(cell.firstChild);cell.removeAttribute('t');
 parts['xl/worksheets/sheet1.xml']=strToU8(new XMLSerializer().serializeToString(doc));await fs.writeFile(file,zipSync(parts));
 const list=await listPosts(root),edit={...input,revision:list.revision};
 const plan=await planPostEdit(root,edit);await savePostEdit(root,edit,plan.fingerprint);
 assert.equal(new Book(await fs.readFile(file)).posts().find(p=>p.key===selected.key).id,null);
});
test('rinomina con sole maiuscole/minuscole: aggiorna nomi reali e link',async t=>{
 const {root,input}=await seed(t),edit={...input,title:'titolo originale',undefinedDate:true};
 const plan=await planPostEdit(root,edit);await savePostEdit(root,edit,plan.fingerprint);
 const folders=await fs.readdir(path.join(root,'01_Facebook/2026'));
 assert.ok(folders.includes('xx-xx_titolo-originale'));
 const files=await fs.readdir(path.join(root,'01_Facebook/2026/xx-xx_titolo-originale/01_Sorgenti'));
 assert.ok(files.includes('titolo-originale_facebook.ai'));assert.ok(files.includes('titolo-originale_facebook.md'));
});
