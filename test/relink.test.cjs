'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {planPost,createPost}=require('../lib/posts.cjs');
const {listPosts}=require('../lib/editor.cjs');
const {postDetails}=require('../lib/details.cjs');
const relink=require('../lib/relink.cjs');
const fixture=process.env.SOCIAL_TEST_FIXTURE;
if(!fixture)throw new Error('Impostare SOCIAL_TEST_FIXTURE su una copia.');
const exists=p=>fs.access(p).then(()=>true,()=>false);

async function seed(t){
 const base=await fs.mkdtemp(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-relink-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const root=path.join(base,'Social');await fs.cp(fixture,root,{recursive:true});
 for(const [title,date] of [['Festa di primavera','2026-03-21'],['Giornata inclusione','2026-12-03']]){
  const post={title,topic:'',format:'Carosello',channels:['Facebook'],date,undefinedDate:false};
  const p=await planPost(root,post);await createPost(root,post,p.fingerprint);
 }
 const list=await listPosts(root);
 const row=title=>list.posts.find(p=>p.title===title&&p.channel==='Facebook');
 const year=path.join(root,'01_Facebook','2026');
 return{root,year,input:{key:row('Festa di primavera').key,revision:list.revision},other:row('Giornata inclusione'),revision:list.revision,book:path.join(root,'Piano editoriale.xlsx')};
}

test('ricollega: post scollegato individuato, cartella orfana proposta per prima, nome ripristinato senza toccare Excel',async t=>{
 const {root,year,input,book}=await seed(t),before=await fs.readFile(book);
 assert.equal((await relink.missingFolders(root)).missing.some(m=>m.key===input.key),false);
 await fs.rename(path.join(year,'03-21_Festa-di-primavera'),path.join(year,'03-21_Festa primavera NUOVA'));
 await fs.mkdir(path.join(year,'Cartella a caso','01_Sorgenti'),{recursive:true});
 const missing=(await relink.missingFolders(root)).missing;
 assert.deepEqual(missing.filter(m=>m.title==='Festa di primavera').map(m=>m.expected),['01_Facebook/2026/03-21_Festa-di-primavera']);
 assert.equal((await postDetails(root,input)).folderMissing,true);
 const c=await relink.relinkCandidates(root,input);
 assert.equal(c.expectedName,'03-21_Festa-di-primavera');
 assert.equal(c.candidates[0].name,'03-21_Festa primavera NUOVA');
 assert.ok(c.candidates[0].reasons.includes('stessa data')&&c.candidates[0].reasons.includes('contiene i file del post'));
 assert.equal(c.candidates.some(x=>x.name==='12-03_Giornata-inclusione'),false,'le cartelle già collegate non sono proposte');
 const result=await relink.relinkFolder(root,{...input,name:'03-21_Festa primavera NUOVA'});
 assert.equal(result.to,'01_Facebook/2026/03-21_Festa-di-primavera');
 assert.ok(await exists(path.join(year,'03-21_Festa-di-primavera','01_Sorgenti','Festa-di-primavera_facebook.ai')));
 assert.equal(await exists(path.join(year,'03-21_Festa primavera NUOVA')),false);
 assert.deepEqual(await fs.readFile(book),before,'il piano Excel non cambia');
 assert.equal((await relink.missingFolders(root)).missing.some(m=>m.key===input.key),false);
 assert.equal(await exists(path.join(root,'.social-create.lock')),false);
});

test('ricollega: rifiuta nomi non validi, cartelle senza 01_Sorgenti, già collegate o fuori dai social',async t=>{
 const {root,year,input,other}=await seed(t);
 await fs.rename(path.join(year,'03-21_Festa-di-primavera'),path.join(year,'rinominata'));
 for(const name of ['..','../2026','a/b',''])await assert.rejects(relink.relinkFolder(root,{...input,name}),/Scegli una delle cartelle/);
 await fs.mkdir(path.join(year,'vuota'));
 await assert.rejects(relink.relinkFolder(root,{...input,name:'vuota'}),/01_Sorgenti/);
 await assert.rejects(relink.relinkFolder(root,input,path.join(year,'12-03_Giornata-inclusione')),/già collegata/);
 await assert.rejects(relink.relinkFolder(root,input,path.join(root,'00_template')),/dentro 01_Facebook/);
 await assert.rejects(relink.relinkFolder(root,input,path.dirname(root)),/fuori dalla cartella Social|Percorso/);
 assert.ok(await exists(path.join(year,'rinominata')),'nessuna rinomina dopo un rifiuto');
 // revisione del piano superata
 await assert.rejects(relink.relinkCandidates(root,{...input,revision:'0'.repeat(64)}),/piano è cambiato/);
 void other;
});

test('ricollega: cartella già presente o nome atteso occupato → nessuna modifica',async t=>{
 const {root,year,input}=await seed(t);
 await assert.rejects(relink.relinkCandidates(root,input),/c’è già/);
 await fs.rename(path.join(year,'03-21_Festa-di-primavera'),path.join(year,'rinominata'));
 // un'altra persona ricrea nel frattempo una cartella con il nome atteso
 await fs.mkdir(path.join(year,'03-21_Festa-di-primavera'));
 await assert.rejects(relink.relinkFolder(root,{...input,name:'rinominata'}),/c’è già/);
 assert.ok(await exists(path.join(year,'rinominata')));
 await fs.rmdir(path.join(year,'03-21_Festa-di-primavera'));
 // lock di un'altra operazione
 await fs.writeFile(path.join(root,'.social-create.lock'),'{}');
 await assert.rejects(relink.relinkFolder(root,{...input,name:'rinominata'}),/Un’altra operazione/);
 await fs.unlink(path.join(root,'.social-create.lock'));
 await relink.relinkFolder(root,{...input,name:'rinominata'});
 assert.ok(await exists(path.join(year,'03-21_Festa-di-primavera')));
});

test('ricollega: cartella spostata in un altro anno riportata al posto giusto',async t=>{
 const {root,year,input}=await seed(t);
 const wrong=path.join(root,'01_Facebook','2027');await fs.mkdir(wrong,{recursive:true});
 await fs.rename(path.join(year,'03-21_Festa-di-primavera'),path.join(wrong,'03-21_Festa-di-primavera'));
 const result=await relink.relinkFolder(root,input,path.join(wrong,'03-21_Festa-di-primavera'));
 assert.equal(result.from,'01_Facebook/2027/03-21_Festa-di-primavera');
 assert.ok(await exists(path.join(year,'03-21_Festa-di-primavera','01_Sorgenti')));
});
