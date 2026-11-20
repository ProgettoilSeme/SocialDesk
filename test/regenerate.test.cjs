'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {planPost,createPost}=require('../lib/posts.cjs');
const {listPosts}=require('../lib/editor.cjs');
const {postDetails}=require('../lib/details.cjs');
const {illustratorFiles}=require('../lib/illustrator.cjs');
const {regenerateSource}=require('../lib/regenerate.cjs');
const fixture=process.env.SOCIAL_TEST_FIXTURE;
if(!fixture)throw new Error('Impostare SOCIAL_TEST_FIXTURE su una copia.');
const exists=p=>fs.access(p).then(()=>true,()=>false);

async function seed(t){
 const base=await fs.mkdtemp(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-regenerate-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const root=path.join(base,'Social');await fs.cp(fixture,root,{recursive:true});
 const post={title:'Rigenera prova',topic:'',format:'Carosello',channels:['Instagram'],date:'2026-05-10',undefinedDate:false};
 const p=await planPost(root,post);await createPost(root,post,p.fingerprint);
 const list=await listPosts(root),row=list.posts.find(r=>r.title===post.title);
 const sources=path.join(root,'02_Instagram','2026','05-10_Rigenera-prova','01_Sorgenti');
 return{root,sources,input:{key:row.key,revision:list.revision},book:path.join(root,'Piano editoriale.xlsx'),template:p.folders[0].template};
}

test('rigenera: ricrea .ai dal template e .md vuoto con il nome canonico, Excel invariato',async t=>{
 const {root,sources,input,book}=await seed(t),before=await fs.readFile(book);
 const ai=path.join(sources,'Rigenera-prova_instagram.ai'),md=path.join(sources,'Rigenera-prova_instagram.md');
 const original=await fs.readFile(ai);
 await fs.unlink(ai);await fs.unlink(md);
 assert.equal((await illustratorFiles(root,input)).empty,true);
 assert.equal((await postDetails(root,input)).noText,true);
 const r1=await regenerateSource(root,{...input,kind:'ai'});
 assert.equal(r1.name,'Rigenera-prova_instagram.ai');assert.match(r1.template,/^00_template\//);
 assert.deepEqual(await fs.readFile(ai),original,'copia identica del template');
 const r2=await regenerateSource(root,{...input,kind:'md'});
 assert.equal(r2.name,'Rigenera-prova_instagram.md');assert.equal(await fs.readFile(md,'utf8'),'');
 assert.deepEqual(await fs.readFile(book),before,'il piano Excel non cambia');
 assert.equal((await postDetails(root,input)).editableText.name,'Rigenera-prova_instagram.md');
 assert.equal(await exists(path.join(root,'.social-create.lock')),false);
});

test('rigenera: non sovrascrive e rifiuta se c’è già un file dello stesso tipo, anche con altro nome',async t=>{
 const {root,sources,input}=await seed(t);
 await assert.rejects(regenerateSource(root,{...input,kind:'ai'}),/c’è già/);
 await assert.rejects(regenerateSource(root,{...input,kind:'md'}),/c’è già/);
 await fs.rename(path.join(sources,'Rigenera-prova_instagram.md'),path.join(sources,'vecchio testo.txt'));
 await assert.rejects(regenerateSource(root,{...input,kind:'md'}),/vecchio testo\.txt/);
 await assert.rejects(regenerateSource(root,{...input,kind:'docx'}),/Scegli il file/);
});

test('rigenera: cartella del post mancante, revisione superata o lock attivo → nessun file creato',async t=>{
 const {root,sources,input}=await seed(t);
 await fs.unlink(path.join(sources,'Rigenera-prova_instagram.ai'));
 await fs.writeFile(path.join(root,'.social-create.lock'),'{}');
 await assert.rejects(regenerateSource(root,{...input,kind:'ai'}),/Un’altra operazione/);
 await fs.unlink(path.join(root,'.social-create.lock'));
 await assert.rejects(regenerateSource(root,{...input,revision:'0'.repeat(64),kind:'ai'}),/piano è cambiato/);
 const post=path.dirname(sources);await fs.rename(post,post+'-rinominata');
 await assert.rejects(regenerateSource(root,{...input,kind:'ai'}),/Non trovo la cartella/);
 assert.equal(await exists(path.join(post+'-rinominata','01_Sorgenti','Rigenera-prova_instagram.ai')),false);
});

test('rigenera .ai di un post senza formato: si sceglie il formato, che va nel piano (solo quella riga)',async t=>{
 const base=await fs.mkdtemp(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-regenerate-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const root=path.join(base,'Social');await fs.cp(fixture,root,{recursive:true});
 const post={title:'Senza formato',topic:'',format:'',channels:['Facebook','Instagram'],date:'2026-05-12',undefinedDate:false};
 const p=await planPost(root,post);await createPost(root,post,p.fingerprint);
 const list=await listPosts(root),row=list.posts.find(r=>r.title===post.title&&r.channel==='Instagram');
 const input={key:row.key,revision:list.revision};
 const sources=path.join(root,'02_Instagram','2026','05-12_Senza-formato','01_Sorgenti'),ai=path.join(sources,'Senza-formato_instagram.ai');
 assert.equal(await exists(ai),false,'senza formato alla creazione nessun .ai');
 await assert.rejects(regenerateSource(root,{...input,kind:'ai'}),/Scegli il formato/);
 await assert.rejects(regenerateSource(root,{...input,kind:'ai',format:'Reel'}),/non è un formato da immagine/);
 await assert.rejects(regenerateSource(root,{...input,kind:'ai',format:'Articolo'}),/non è un formato da immagine di Instagram/);
 assert.equal(await exists(ai),false);
 const r=await regenerateSource(root,{...input,kind:'ai',format:'Carosello'});
 assert.equal(r.name,'Senza-formato_instagram.ai');assert.equal(r.format,'Carosello');assert.equal(r.formatSaved,true);
 assert.ok(await exists(ai));assert.ok(await exists(r.backup),'copia di sicurezza del piano');
 const after=await listPosts(root);
 assert.equal(after.posts.find(x=>x.key===row.key).format,'Carosello');
 assert.equal(after.posts.find(x=>x.title===post.title&&x.channel==='Facebook').format,'','l’altro social resta senza formato');
 // con il vecchio file tolto e il formato ora nel piano non serve sceglierlo di nuovo, e il piano non cambia
 await fs.unlink(ai);const book=await fs.readFile(path.join(root,'Piano editoriale.xlsx'));
 const again=await regenerateSource(root,{key:row.key,revision:after.revision,kind:'ai'});
 assert.equal(again.formatSaved,false);assert.deepEqual(await fs.readFile(path.join(root,'Piano editoriale.xlsx')),book);
 assert.equal(await exists(path.join(root,'.social-create.lock')),false);
});
