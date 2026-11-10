'use strict';
// Struttura unificata 01_Posts/<anno>/<ID>_<Titolo> con i file dei social insieme (suffisso).
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {planPost,createPost}=require('../lib/posts.cjs');
const {listPosts,planPostEdit,savePostEdit}=require('../lib/editor.cjs');
const {postDetails}=require('../lib/details.cjs');
const {illustratorFiles,resolveIllustrator}=require('../lib/illustrator.cjs');
const {planDraftDate,updateDraftDate}=require('../lib/drafts.cjs');
const {planDeletePost,deletePost}=require('../lib/delete.cjs');
const {regenerateSource}=require('../lib/regenerate.cjs');
const relink=require('../lib/relink.cjs');
const {syncAssetArchive}=require('../lib/assets.cjs');
const layout=require('../lib/layout.cjs');
const {Book}=require('../lib/workbook.cjs');
const F=layout.formatId;
const fixture=process.env.SOCIAL_TEST_FIXTURE;
if(!fixture)throw new Error('Impostare SOCIAL_TEST_FIXTURE su una copia.');
const exists=p=>fs.access(p).then(()=>true,()=>false);

async function seed(t,{unified=true,channels=['Facebook','Instagram'],title='Festa unica'}={}){
 const base=await fs.mkdtemp(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-unified-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const root=path.join(base,'Social');await fs.cp(fixture,root,{recursive:true});
 if(unified)await fs.mkdir(path.join(root,'01_Posts'));
 const input={title,topic:'',channels,channelFormats:Object.fromEntries(channels.map(c=>[c,'Carosello'])),channelDates:Object.fromEntries(channels.map((c,i)=>[c,{date:`2026-05-1${i}`}]))};
 const plan=await planPost(root,input),created=await createPost(root,input,plan.fingerprint);
 return{root,plan,created,book:path.join(root,'Piano editoriale.xlsx')};
}
async function rows(root,title){const list=await listPosts(root);return{revision:list.revision,rows:list.posts.filter(p=>p.title===title)};}
const row=(list,channel)=>list.rows.find(r=>r.channel===channel);
const input=(list,channel,extra={})=>({key:row(list,channel).key,revision:list.revision,...extra});
function editInput(list,channel,changes){const r=row(list,channel);return{key:r.key,revision:list.revision,title:r.title,topic:r.topic||'',format:r.format,status:r.status,date:r.date,undefinedDate:!r.date,...changes};}

test('layout: collegamenti unificati e per social, file per suffisso',()=>{
 const post={channel:'Facebook',year:2026};
 assert.equal(layout.parseSources('01_Posts/2026/12_Festa/01_Sorgenti',post).unified,true);
 assert.equal(layout.parseSources('01_Facebook/2026/05-10_Festa/01_Sorgenti',post).unified,false);
 assert.equal(layout.parseSources('02_Instagram/2026/05-10_Festa/01_Sorgenti',post),null);
 assert.equal(layout.parseSources('01_Posts/2025/12_Festa/01_Sorgenti',post).unified,true,'cartella unificata in un altro anno');
 assert.equal(layout.parseSources('01_Facebook/2025/05-10_Festa/01_Sorgenti',post),null);
 assert.equal(layout.unifiedFolderName(7,'Festa'),'007_Festa');
 assert.equal(layout.sameId('007_Festa',7),true);assert.equal(layout.sameId('70_Festa',7),false);
 assert.equal(layout.parseSources('01_Posts/2026/../01_Sorgenti',post),null);
 assert.equal(layout.fileChannel('Festa_instagram.ai'),'Instagram');
 assert.equal(layout.fileChannel('Festa_LinkedIn.md'),'LinkedIn');
 assert.equal(layout.fileChannel('Festa.ai'),null);
 assert.equal(layout.visibleFor('Festa_instagram.md','Facebook',true),false);
 assert.equal(layout.visibleFor('Festa_instagram.md','Facebook',false),true);
 assert.equal(layout.visibleFor('note.md','Facebook',true),true);
});

test('unificata: una cartella ID_Titolo per tutti i social, file con suffisso, stesso collegamento',async t=>{
 const {root,plan,created}=await seed(t,{channels:['Facebook','Instagram','LinkedIn']});
 assert.equal(plan.unified,true);
 const folder=path.join(root,'01_Posts','2026',`${F(plan.id)}_Festa-unica`);
 assert.ok(plan.folders.every(f=>f.relative===path.join('01_Posts','2026',`${F(plan.id)}_Festa-unica`)));
 assert.deepEqual(created.created.map(c=>c.path),[folder,folder,folder]);
 for(const sub of ['01_Sorgenti','02_Asset','03_Export'])assert.ok(await exists(path.join(folder,sub)));
 assert.deepEqual((await fs.readdir(path.join(folder,'01_Sorgenti'))).sort(),['Festa-unica_facebook.ai','Festa-unica_facebook.md','Festa-unica_instagram.ai','Festa-unica_instagram.md','Festa-unica_linkedin.ai','Festa-unica_linkedin.md']);
 assert.equal(await exists(path.join(root,'01_Facebook','2026','05-10_Festa-unica')),false,'nessuna cartella per social');
 const list=await rows(root,'Festa unica');
 assert.equal(list.rows.length,3);
 assert.ok(list.rows.every(r=>r.sourcesRelative===`01_Posts/2026/${F(plan.id)}_Festa-unica/01_Sorgenti`&&r.id===plan.id));
 // Dettagli e Illustrator mostrano solo i file del social scelto
 await fs.writeFile(path.join(folder,'01_Sorgenti','Festa-unica_instagram.md'),'testo instagram');
 await fs.writeFile(path.join(folder,'01_Sorgenti','Festa-unica_facebook.md'),'testo facebook');
 const fb=await postDetails(root,input(list,'Facebook'));
 assert.deepEqual(fb.textFiles.map(f=>f.name),['Festa-unica_facebook.md']);
 assert.equal(fb.editableText.content,'testo facebook');
 const ig=await illustratorFiles(root,input(list,'Instagram'));
 assert.deepEqual(ig.files.map(f=>f.name),['Festa-unica_instagram.ai']);
 await assert.rejects(resolveIllustrator(root,{...input(list,'Instagram'),name:'Festa-unica_facebook.ai'}),/altro social/);
});

test('unificata: ID già usato da un’altra cartella → creazione rifiutata',async t=>{
 const base=await fs.mkdtemp(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-unified-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const root=path.join(base,'Social');await fs.cp(fixture,root,{recursive:true});
 const post={title:'Nuovo',topic:'',channels:['Facebook'],format:'Video',date:'2026-02-02'};
 await fs.mkdir(path.join(root,'01_Posts','2026','0_Cartella-manuale'),{recursive:true});
 await assert.rejects(planPost(root,post),/già una cartella con l’ID 0/);
});

test('struttura per social invariata quando 01_Posts non esiste',async t=>{
 const {root,plan}=await seed(t,{unified:false});
 assert.equal(plan.unified,false);
 assert.ok(await exists(path.join(root,'01_Facebook','2026','05-10_Festa-unica','01_Sorgenti','Festa-unica_facebook.ai')));
 assert.ok(await exists(path.join(root,'02_Instagram','2026','05-11_Festa-unica','01_Sorgenti','Festa-unica_instagram.md')));
});

test('Aggiorna data: unificata senza rinomine, Data da definire in entrambe le strutture',async t=>{
 const {root,plan,book}=await seed(t);
 const folder=path.join(root,'01_Posts','2026',`${F(plan.id)}_Festa-unica`);
 let list=await rows(root,'Festa unica');
 let request=input(list,'Facebook',{date:'2026-08-20'});
 let result=await updateDraftDate(root,request,(await planDraftDate(root,request)).fingerprint);
 assert.equal(result.oldRelative,result.newRelative);
 assert.ok(await exists(folder));
 list=await rows(root,'Festa unica');
 assert.equal(row(list,'Facebook').date,'2026-08-20');assert.equal(row(list,'Instagram').date,'2026-05-11');
 request=input(list,'Facebook',{undefinedDate:true});
 result=await updateDraftDate(root,request,(await planDraftDate(root,request)).fingerprint);
 assert.equal(result.date,null);assert.equal(result.undefinedDate,true);
 list=await rows(root,'Festa unica');
 assert.equal(row(list,'Facebook').date,null);assert.equal(row(list,'Facebook').sourcesRelative,`01_Posts/2026/${F(plan.id)}_Festa-unica/01_Sorgenti`);
 assert.ok(await exists(folder));void book;
 // struttura per social: la cartella torna xx-xx_Titolo
 const legacy=await seed(t,{unified:false,channels:['LinkedIn'],title:'Vecchio stile'});
 let old=await rows(legacy.root,'Vecchio stile');
 request=input(old,'LinkedIn',{undefinedDate:true});
 result=await updateDraftDate(legacy.root,request,(await planDraftDate(legacy.root,request)).fingerprint);
 assert.equal(result.newRelative,'03_LinkedIn/2026/xx-xx_Vecchio-stile');
 assert.ok(await exists(path.join(legacy.root,'03_LinkedIn','2026','xx-xx_Vecchio-stile','01_Sorgenti')));
 old=await rows(legacy.root,'Vecchio stile');
 assert.equal(row(old,'LinkedIn').date,null);
 assert.equal(row(old,'LinkedIn').sourcesRelative,'03_LinkedIn/2026/xx-xx_Vecchio-stile/01_Sorgenti');
});

test('Modifica: titolo in cartella condivisa rinomina solo i file del social; cartella rinominata quando è solo sua',async t=>{
 const {root,plan}=await seed(t);
 const folder=path.join(root,'01_Posts','2026',`${F(plan.id)}_Festa-unica`),sources=path.join(folder,'01_Sorgenti');
 await fs.writeFile(path.join(folder,'03_Export','Festa-unica_facebook.png'),'x');
 await fs.writeFile(path.join(folder,'02_Asset','foto comune.png'),'x');
 let list=await rows(root,'Festa unica');
 let request=editInput(list,'Facebook',{title:'Festa nuova',date:'2026-09-01',undefinedDate:false});
 const preview=await planPostEdit(root,request);
 assert.equal(preview.oldRelative,preview.newRelative,'cartella condivisa: nome invariato');
 await savePostEdit(root,request,preview.fingerprint);
 assert.deepEqual((await fs.readdir(sources)).sort(),['Festa-nuova_facebook.ai','Festa-nuova_facebook.md','Festa-unica_instagram.ai','Festa-unica_instagram.md']);
 assert.ok(await exists(path.join(folder,'03_Export','Festa-nuova_facebook.png')));
 assert.ok(await exists(path.join(folder,'02_Asset','foto comune.png')));
 list=await rows(root,'Festa nuova');
 assert.equal(row(list,'Facebook').sourcesRelative,`01_Posts/2026/${F(plan.id)}_Festa-unica/01_Sorgenti`);
 assert.equal(row(list,'Facebook').date,'2026-09-01');
 // eliminazione di Instagram (cartella condivisa con Facebook): solo i suoi file vanno nel cestino
 const ig=await rows(root,'Festa unica');
 let del=input(ig,'Instagram');
 const delPlan=await planDeletePost(root,del);
 assert.equal(delPlan.partial,true);assert.deepEqual(delPlan.movedFiles.sort(),['01_Sorgenti/Festa-unica_instagram.ai','01_Sorgenti/Festa-unica_instagram.md']);
 const deleted=await deletePost(root,del,delPlan.fingerprint);
 assert.equal(deleted.trashRelative,`00_cestino/01_Posts/2026/${F(plan.id)}_Festa-unica_instagram`);
 assert.ok(await exists(path.join(root,deleted.trashRelative,'01_Sorgenti','Festa-unica_instagram.ai')));
 assert.deepEqual((await fs.readdir(sources)).sort(),['Festa-nuova_facebook.ai','Festa-nuova_facebook.md']);
 // ora la cartella è solo di Facebook: cambiare titolo rinomina anche la cartella (ID conservato)
 list=await rows(root,'Festa nuova');
 request=editInput(list,'Facebook',{title:'Festa finale'});
 const second=await planPostEdit(root,request);
 assert.equal(second.newRelative,`01_Posts/2026/${F(plan.id)}_Festa-finale`);
 await savePostEdit(root,request,second.fingerprint);
 const finalFolder=path.join(root,'01_Posts','2026',`${F(plan.id)}_Festa-finale`);
 assert.ok(await exists(path.join(finalFolder,'01_Sorgenti','Festa-finale_facebook.ai')));
 assert.ok(await exists(path.join(finalFolder,'02_Asset','foto comune.png')));
 // ultima riga: l'intera cartella va nel cestino
 list=await rows(root,'Festa finale');
 del=input(list,'Facebook');
 const last=await planDeletePost(root,del);
 assert.equal(last.partial,false);
 await deletePost(root,del,last.fingerprint);
 assert.equal(await exists(finalFolder),false);
 assert.ok(await exists(path.join(root,'00_cestino','01_Posts','2026',`${F(plan.id)}_Festa-finale`,'02_Asset','foto comune.png')));
});

test('Elimina: errore dopo lo spostamento dei file → file e piano ripristinati',async t=>{
 const {root,plan,book}=await seed(t);
 const sources=path.join(root,'01_Posts','2026',`${F(plan.id)}_Festa-unica`,'01_Sorgenti'),before=await fs.readFile(book);
 const list=await rows(root,'Festa unica'),del=input(list,'Instagram');
 const p=await planDeletePost(root,del);
 await assert.rejects(deletePost(root,del,p.fingerprint,{failAfterMove:true}),/Errore di prova/);
 assert.equal((await fs.readdir(sources)).length,4);
 assert.deepEqual(await fs.readFile(book),before);
 assert.equal(await exists(path.join(root,'00_cestino','01_Posts','2026',`${F(plan.id)}_Festa-unica_instagram`)),false);
});

test('Rigenera nella cartella condivisa: il file di un altro social non blocca',async t=>{
 const {root,plan}=await seed(t);
 const sources=path.join(root,'01_Posts','2026',`${F(plan.id)}_Festa-unica`,'01_Sorgenti');
 await fs.unlink(path.join(sources,'Festa-unica_facebook.ai'));
 const list=await rows(root,'Festa unica');
 assert.equal((await illustratorFiles(root,input(list,'Facebook'))).empty,true);
 const result=await regenerateSource(root,{...input(list,'Facebook'),kind:'ai'});
 assert.equal(result.name,'Festa-unica_facebook.ai');
 await assert.rejects(regenerateSource(root,{...input(list,'Instagram'),kind:'ai'}),/c’è già/);
});

test('Ricollega nella struttura unificata: stesso ID proposto per primo',async t=>{
 const {root,plan,book}=await seed(t);
 const year=path.join(root,'01_Posts','2026'),before=await fs.readFile(book);
 await fs.rename(path.join(year,`${F(plan.id)}_Festa-unica`),path.join(year,`${F(plan.id)}_Festa rinominata`));
 await fs.mkdir(path.join(year,'99_Altro','01_Sorgenti'),{recursive:true});
 const missing=(await relink.missingFolders(root)).missing.filter(m=>m.title==='Festa unica');
 assert.equal(missing.length,2,'una voce per ogni social collegato');
 const list=await rows(root,'Festa unica');
 const c=await relink.relinkCandidates(root,input(list,'Facebook'));
 assert.equal(c.candidates[0].name,`${F(plan.id)}_Festa rinominata`);
 assert.ok(c.candidates[0].reasons.includes('stesso ID'));
 const result=await relink.relinkFolder(root,{...input(list,'Instagram'),name:`${F(plan.id)}_Festa rinominata`});
 assert.equal(result.to,`01_Posts/2026/${F(plan.id)}_Festa-unica`);
 assert.equal((await relink.missingFolders(root)).missing.some(m=>m.title==='Festa unica'),false,'ricollegati entrambi i social');
 await assert.rejects(relink.relinkFolder(root,input(list,'Facebook'),path.join(root,'01_Facebook')),/c’è già|dentro 01_Posts/);
 assert.deepEqual(await fs.readFile(book),before);
});

test('Archivio asset: immagini di 01_Posts in Archivio asset/01_Posts/<anno>',async t=>{
 const {root,plan}=await seed(t);
 await fs.writeFile(path.join(root,'01_Posts','2026',`${F(plan.id)}_Festa-unica`,'02_Asset','locandina.png'),'png');
 const result=await syncAssetArchive(root);
 assert.equal(result.errors.length,0);
 assert.ok(await exists(path.join(root,'00_template','Archivio asset','01_Posts','2026','locandina.png')));
});

test('unificata: cartella in un altro anno rispetto alla scheda (collegamento del piano)',async t=>{
 const {root,plan,book}=await seed(t,{channels:['Facebook']});
 const name=`${F(plan.id)}_Festa-unica`;
 await fs.mkdir(path.join(root,'01_Posts','2025'),{recursive:true});
 await fs.rename(path.join(root,'01_Posts','2026',name),path.join(root,'01_Posts','2025',name));
 let list=await rows(root,'Festa unica');const r=row(list,'Facebook');
 await fs.writeFile(book,new Book(await fs.readFile(book)).updateDraftDate(r.year,r.row,r.date,`01_Posts/2025/${name}/01_Sorgenti`));
 list=await rows(root,'Festa unica');
 const details=await postDetails(root,input(list,'Facebook'));
 assert.equal(details.folderMissing,undefined);assert.deepEqual(details.textFiles.map(f=>f.name),['Festa-unica_facebook.md']);
 assert.equal((await relink.missingFolders(root)).missing.some(m=>m.title==='Festa unica'),false);
});

test('piano: righe importate con stato e senza link, schede annuali in ordine di anno',async t=>{
 const {root,book}=await seed(t,{channels:['Facebook']});
 let buffer=await fs.readFile(book);
 for(const [year,title,date] of [[2024,'Vecchio post','2024-05-28'],[2021,'Più vecchio',null]])buffer=new Book(buffer).append(year,0,[{channel:'Facebook',title,topic:'',format:'',date,status:date?'pubblicato':'',sourcesRelative:null}]);
 const b=new Book(buffer);
 assert.deepEqual(b.sheets().map(s=>s.getAttribute('name')).filter(n=>/^\d{4}$/.test(n)),['2021','2024','2026']);
 const old=b.posts().find(p=>p.title==='Vecchio post');
 assert.equal(old.status,'pubblicato');assert.equal(old.date,'2024-05-28');assert.equal(old.sourcesRelative,'');
 assert.equal(b.posts().find(p=>p.title==='Più vecchio').date,null);
 assert.ok(!/<hyperlinks\/>|<x:hyperlinks\/>/.test(Buffer.from(require('fflate').unzipSync(new Uint8Array(buffer))['xl/worksheets/sheet3.xml']||[]).toString()),'nessun hyperlinks vuoto');
 void root;
});

test('aggiungi social: riga con lo stesso ID nella stessa cartella, file dal template, data vuota e formato facoltativo',async t=>{
 const {addChannel,planAddChannel}=require('../lib/addchannel.cjs');
 const {root,plan,book}=await seed(t,{channels:['Facebook'],title:'Solo Facebook'});
 const folder=path.join(root,'01_Posts','2026',`${F(plan.id)}_Solo-Facebook`,'01_Sorgenti');
 let list=await rows(root,'Solo Facebook');
 const p=await planAddChannel(root,input(list,'Facebook',{channel:'Instagram'}));
 assert.deepEqual(p.files,['Solo-Facebook_instagram.ai','Solo-Facebook_instagram.md']);
 // errore prima del salvataggio: nessun file e piano invariato
 const before=await fs.readFile(book);
 await assert.rejects(addChannel(root,input(list,'Facebook',{channel:'Instagram'}),{failBeforeCommit:true}),/Errore di prova/);
 assert.equal(await exists(path.join(folder,'Solo-Facebook_instagram.ai')),false);
 assert.deepEqual(await fs.readFile(book),before);
 const r=await addChannel(root,input(list,'Facebook',{channel:'Instagram'}));
 assert.deepEqual(r.created,['Solo-Facebook_instagram.ai','Solo-Facebook_instagram.md']);
 list=await rows(root,'Solo Facebook');
 const ig=row(list,'Instagram');
 assert.equal(ig.id,plan.id);assert.equal(ig.sourcesRelative,row(list,'Facebook').sourcesRelative);
 assert.equal(ig.date,null);assert.equal(ig.status,'testi da creare');assert.equal(ig.format,'');
 assert.equal((await postDetails(root,input(list,'Instagram'))).editableText.name,'Solo-Facebook_instagram.md');
 await assert.rejects(addChannel(root,input(list,'Facebook',{channel:'Instagram'})),/esiste già per Instagram/);
 assert.equal(await exists(path.join(root,'.social-create.lock')),false);
});

test('creazione: formato facoltativo, data vuota nel piano invece di xx-xx',async t=>{
 const base=await fs.mkdtemp(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-unified-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const root=path.join(base,'Social');await fs.cp(fixture,root,{recursive:true});await fs.mkdir(path.join(root,'01_Posts'));
 const input={title:'Senza formato',topic:'',channels:['LinkedIn'],channelFormats:{LinkedIn:''},channelDates:{LinkedIn:{undefinedDate:true}},year:2026};
 const sheet=async()=>Buffer.from(require('fflate').unzipSync(new Uint8Array(await fs.readFile(path.join(root,'Piano editoriale.xlsx'))))['xl/worksheets/sheet1.xml']).toString();
 const count=x=>(x.match(/xx-xx/g)||[]).length,before=count(await sheet());
 const p=await planPost(root,input);await createPost(root,input,p.fingerprint);
 const list=await rows(root,'Senza formato');const r=row(list,'LinkedIn');
 assert.equal(r.format,'');assert.equal(r.date,null);
 assert.equal(count(await sheet()),before,'nessun nuovo xx-xx scritto nel piano');
});
