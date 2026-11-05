'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {postDetails,resolvePostText,resolvePostFolder}=require('../lib/details.cjs');
const {planPost,createPost}=require('../lib/posts.cjs');
const {listPosts}=require('../lib/editor.cjs');
const fixture=process.env.SOCIAL_TEST_FIXTURE;
if(!fixture)throw new Error('Impostare SOCIAL_TEST_FIXTURE su una copia.');
async function seed(t){
 const base=await fs.mkdtemp(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-details-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const root=path.join(base,'Social');await fs.cp(fixture,root,{recursive:true});
 const post={title:'Dettaglio prova',topic:'Inclusione',format:'Carosello',channels:['Facebook','Instagram'],date:'2026-11-04',undefinedDate:false};
 const p=await planPost(root,post);await createPost(root,post,p.fingerprint);
 const list=await listPosts(root),row=list.posts.find(p=>p.title===post.title&&p.channel==='Facebook');
 const folder=path.join(root,'01_Facebook/2026/11-04_Dettaglio-prova/01_Sorgenti');
 return{root,folder,file:path.join(root,'Piano editoriale.xlsx'),text:path.join(folder,'Dettaglio-prova_facebook.md'),input:{key:row.key,revision:list.revision},base};
}
test('dettagli: tutti i campi e TXT del solo canale, lettura senza modifiche',async t=>{
 const {root,folder,file,text,input}=await seed(t),before=await fs.readFile(file);
 const content='Prima riga: inclusione e novità 😊\n\n<script>non eseguire</script>\nTesto finale.';
 await fs.writeFile(text,content);await fs.writeFile(path.join(folder,'AAA-riferimento.txt'),'Riferimento aggiuntivo');
 const result=await postDetails(root,input);
 assert.equal(result.post.id,0);assert.equal(result.post.channel,'Facebook');assert.equal(result.post.date,'2026-11-04');assert.equal(result.post.topic,'Inclusione');assert.equal(result.post.format,'Carosello');assert.equal(result.post.status,'testi da creare');assert.ok(result.post.sourcesRelative.endsWith('/01_Sorgenti'));
 assert.equal(result.textFiles.length,2);assert.equal(result.textFiles[0].name,'Dettaglio-prova_facebook.md');assert.equal(result.textFiles[0].content,content);assert.equal(result.textFiles[1].content,'Riferimento aggiuntivo');
 assert.deepEqual(await fs.readFile(file),before);assert.equal(await fs.readFile(text,'utf8'),content);
 const list=await listPosts(root),ig=list.posts.find(p=>p.title==='Dettaglio prova'&&p.channel==='Instagram');
 assert.equal((await postDetails(root,{key:ig.key,revision:list.revision})).textFiles[0].content,'');
});
test('TXT vuoto o mancante: conserva i metadati e distingue i due casi',async t=>{
 const {root,text,input}=await seed(t);
 assert.equal((await postDetails(root,input)).textFiles[0].content,'');
 await fs.unlink(text);const missing=await postDetails(root,input);assert.equal(missing.post.title,'Dettaglio prova');assert.deepEqual(missing.textFiles,[]);assert.match(missing.textMessage,/Nessun file di testo/);
});
test('codifiche testo: UTF8 BOM, UTF16 Windows e Windows-1252',async t=>{
 const {root,text,input}=await seed(t);
 for(const [bytes,expected] of [[Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('Novità 😊')]),'Novità 😊'],[Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('Testo più chiaro','utf16le')]),'Testo più chiaro'],[Buffer.concat([Buffer.from([0xfe,0xff]),Buffer.from('Testo più chiaro','utf16le').swap16()]),'Testo più chiaro'],[Buffer.from([0x63,0x61,0x66,0xe9]),'café']]){
  await fs.writeFile(text,bytes);assert.equal((await postDetails(root,input)).textFiles[0].content,expected);
 }
});
test('file molto grande: mostra un avviso senza caricare contenuti illimitati',async t=>{
 const {root,text,input}=await seed(t);await fs.writeFile(text,Buffer.alloc(1024*1024+1,65));
 const result=await postDetails(root,input);assert.equal(result.textFiles[0].content,null);assert.match(result.textFiles[0].message,/supera 1 MB/);
});
test('cartella assente: informazioni del piano disponibili, messaggio sul testo',async t=>{
 const {root,folder,input}=await seed(t);await fs.rm(folder,{recursive:true});
 const result=await postDetails(root,input);assert.equal(result.post.title,'Dettaglio prova');assert.equal(result.textFiles.length,0);assert.match(result.textMessage,/Non trovo la cartella sorgenti/);
});
test('non legge TXT collegati fuori dalla cartella Social',async t=>{
 const {root,folder,text,input,base}=await seed(t);await fs.unlink(text);const secret=path.join(base,'privato.txt');await fs.writeFile(secret,'Non leggere');await fs.symlink(secret,path.join(folder,'testo.txt'));
 const result=await postDetails(root,input);assert.equal(result.textFiles.length,0);assert.match(result.textMessage,/Nessun file di testo/);
});
test('piano aperto leggibile; selezioni errate e revisioni scadute rifiutate',async t=>{
 const {root,file,input}=await seed(t);await fs.writeFile(path.join(root,'~$Piano editoriale.xlsx'),'Excel');
 assert.equal((await postDetails(root,input)).post.title,'Dettaglio prova');
 await assert.rejects(()=>postDetails(root,{...input,key:'../../etc/passwd'}),e=>e.code==='INPUT');
 await assert.rejects(()=>postDetails(root,{...input,key:'2026:9999'}),e=>e.code==='MISSING');
 await fs.appendFile(file,'\n');await assert.rejects(()=>postDetails(root,input),e=>e.code==='CHANGED');
});

test('apertura TXT: risolve solo il testo del post selezionato senza modificarlo',async t=>{
 const {root,text,file,input}=await seed(t),before=await fs.readFile(file);
 const content='Testo con accenti e novità';await fs.writeFile(text,content);
 assert.equal(await resolvePostText(root,{...input,name:path.basename(text)}),text);
 assert.equal(await fs.readFile(text,'utf8'),content);assert.deepEqual(await fs.readFile(file),before);
});
test('apertura TXT: rifiuta nomi arbitrari, altri file, symlink e file mancanti',async t=>{
 const {root,text,folder,input,base}=await seed(t);
 for(const name of ['../privato.txt','..\\privato.txt','file.ai','file:stream.txt','assente.txt'])await assert.rejects(()=>resolvePostText(root,{...input,name}));
 await fs.unlink(text);await fs.symlink(path.join(base,'privato.txt'),text);await assert.rejects(()=>resolvePostText(root,{...input,name:path.basename(text)}));
});
test('apertura TXT: blocca selezioni con revisione superata',async t=>{
 const {root,text,file,input}=await seed(t);await fs.appendFile(file,'\n');await assert.rejects(()=>resolvePostText(root,{...input,name:path.basename(text)}),e=>e.code==='CHANGED');
});
test('cartella post: apre il livello sopra Sorgenti e rifiuta revisioni superate',async t=>{
 const {root,folder,file,input}=await seed(t),before=await fs.readFile(file);
 assert.equal(await resolvePostFolder(root,input),path.dirname(folder));
 assert.deepEqual(await fs.readFile(file),before);
 await fs.appendFile(file,'\n');
 await assert.rejects(()=>resolvePostFolder(root,input),e=>e.code==='CHANGED');
});
test('testi storici .txt: restano leggibili, apribili e il .md canonico ha la precedenza',async t=>{
 const {root,folder,text,input}=await seed(t);
 const legacy=path.join(folder,'Dettaglio-prova_facebook.txt');
 await fs.rename(text,legacy);await fs.writeFile(legacy,'Testo storico');
 let result=await postDetails(root,input);
 assert.equal(result.editableText.name,'Dettaglio-prova_facebook.txt');assert.equal(result.editableText.content,'Testo storico');
 assert.equal(await resolvePostText(root,{...input,name:'Dettaglio-prova_facebook.txt'}),legacy);
 await fs.writeFile(text,'# Testo nuovo');
 result=await postDetails(root,input);
 assert.equal(result.textFiles[0].name,'Dettaglio-prova_facebook.md');assert.equal(result.editableText.name,'Dettaglio-prova_facebook.md');
});
