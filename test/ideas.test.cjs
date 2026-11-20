'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {listIdeas,changeIdea,ideasPath}=require('../lib/ideas.cjs');
const {planPost,createPost}=require('../lib/posts.cjs');
const fixture=process.env.SOCIAL_TEST_FIXTURE;
if(!fixture)throw new Error('Impostare SOCIAL_TEST_FIXTURE su una copia.');

async function seed(t){
 const base=await fs.mkdtemp(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-ideas-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const root=path.join(base,'Social');await fs.cp(fixture,root,{recursive:true});return root;
}

test('idee: elenco vuoto senza file, aggiunta, modifica, fatta e eliminazione',async t=>{
 const root=await seed(t),book=path.join(root,'Piano editoriale.xlsx'),before=await fs.readFile(book);
 assert.deepEqual((await listIdeas(root)).ideas,[]);
 const a=await changeIdea(root,{action:'add',text:'  Post sul 5 per mille  ',channels:['LinkedIn','Facebook']});
 assert.equal(a.idea.text,'Post sul 5 per mille');
 assert.deepEqual(a.idea.channels,['Facebook','LinkedIn']);
 assert.equal(a.idea.done,false);
 const b=await changeIdea(root,{action:'add',text:'Video volontari'});
 assert.equal(b.ideas.length,2);
 const u=await changeIdea(root,{action:'update',id:a.idea.id,done:true,text:'Post 5 per mille'});
 assert.equal(u.idea.done,true);assert.ok(u.idea.doneAt);assert.equal(u.idea.text,'Post 5 per mille');
 const back=await changeIdea(root,{action:'update',id:a.idea.id,done:false});
 assert.equal(back.idea.doneAt,'');
 const d=await changeIdea(root,{action:'delete',id:b.idea.id});
 assert.deepEqual(d.ideas.map(i=>i.id),[a.idea.id]);
 const saved=JSON.parse(await fs.readFile(ideasPath(root),'utf8'));
 assert.equal(saved.ideas.length,1);
 assert.deepEqual(await fs.readFile(book),before,'il piano non cambia');
 assert.equal(ideasPath(root),path.join(root,'00_Settings','idee.json'));
 assert.deepEqual((await fs.readdir(path.join(root,'00_Settings'))).filter(n=>n.includes('.tmp')||n.includes('.lock')),[]);
});

test('idee: appunti in testo semplice, a capo conservati, modificabili e svuotabili',async t=>{
 const root=await seed(t);
 const a=await changeIdea(root,{action:'add',text:'Intervista',notes:'Chiedere a Marta\n- foto in sede\n**non grassetto**  \n\n'});
 assert.equal(a.idea.notes,'Chiedere a Marta\n- foto in sede\n**non grassetto**');
 const b=await changeIdea(root,{action:'add',text:'Senza appunti'});assert.equal(b.idea.notes,'');
 const u=await changeIdea(root,{action:'update',id:a.idea.id,notes:''});assert.equal(u.idea.notes,'');assert.equal(u.idea.text,'Intervista');
 await assert.rejects(changeIdea(root,{action:'update',id:a.idea.id,notes:'x'.repeat(10001)}),/troppo lunghi/);
 await assert.rejects(changeIdea(root,{action:'update',id:a.idea.id,notes:42}),/Appunti non validi/);
});

test('idee: testo vuoto, troppo lungo, social non valido e idea già eliminata',async t=>{
 const root=await seed(t);
 await assert.rejects(changeIdea(root,{action:'add',text:'   '}),/Scrivi il testo/);
 await assert.rejects(changeIdea(root,{action:'add',text:'x'.repeat(501)}),/troppo lunga/);
 await assert.rejects(changeIdea(root,{action:'add',text:'ok',channels:['TikTok']}),/Social non valido/);
 await assert.rejects(changeIdea(root,{action:'update',id:'nessuna',done:true}),/non c’è più/);
 await assert.rejects(changeIdea(root,{action:'boh'}),/Richiesta non valida/);
});

test('idee: due salvataggi contemporanei non si cancellano a vicenda',async t=>{
 const root=await seed(t);
 await Promise.all(Array.from({length:8},(_,i)=>changeIdea(root,{action:'add',text:`Idea ${i}`})));
 assert.equal((await listIdeas(root)).ideas.length,8);
});

test('idee: file illeggibile non viene sovrascritto',async t=>{
 const root=await seed(t);
 await fs.mkdir(path.dirname(ideasPath(root)),{recursive:true});await fs.writeFile(ideasPath(root),'{non json');
 await assert.rejects(listIdeas(root),/non è leggibile/);
 await assert.rejects(changeIdea(root,{action:'add',text:'nuova'}),/non è leggibile/);
 assert.equal(await fs.readFile(ideasPath(root),'utf8'),'{non json');
});

test('avanzamento: la creazione riporta i passi in ordine fino al salvataggio del piano',async t=>{
 const root=await seed(t),steps=[];
 const post={title:'Passi prova',topic:'',format:'Carosello',channels:['Facebook'],date:'2026-05-11',undefinedDate:false};
 const p=await planPost(root,post);
 await createPost(root,post,p.fingerprint,{progress:(n,total,label)=>steps.push([n,total,label])});
 assert.deepEqual(steps.map(s=>s[0]),[0,1,2,3,4]);
 assert.ok(steps.every(s=>s[1]===5&&typeof s[2]==='string'&&s[2]));
});

test('idee: il vecchio 00_template/idee.json si legge finché non esiste 00_Settings/idee.json, poi si scrive nel nuovo',async t=>{
 const root=await seed(t),legacy=path.join(root,'00_template','idee.json');
 const old={version:1,ideas:[{id:'a',text:'Idea vecchia',notes:'',channels:['Facebook'],done:false,createdAt:'2026-11-01T10:00:00.000Z',updatedAt:'2026-11-01T10:00:00.000Z',doneAt:''}]};
 await fs.writeFile(legacy,JSON.stringify(old));
 assert.deepEqual((await listIdeas(root)).ideas.map(i=>i.text),['Idea vecchia']);
 await changeIdea(root,{action:'add',text:'Idea nuova'});
 assert.deepEqual(JSON.parse(await fs.readFile(ideasPath(root),'utf8')).ideas.map(i=>i.text),['Idea vecchia','Idea nuova']);
 assert.deepEqual(JSON.parse(await fs.readFile(legacy,'utf8')),old,'il vecchio file resta com’era');
 assert.equal((await listIdeas(root)).ideas.length,2);
});
