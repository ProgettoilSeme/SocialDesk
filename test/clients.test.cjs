'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const clients=require('../lib/clients.cjs');
const {planPost,createPost,rootInfo}=require('../lib/posts.cjs');
const {Book}=require('../lib/workbook.cjs');
const {listIdeas,changeIdea}=require('../lib/ideas.cjs');
const fixture=process.env.SOCIAL_TEST_FIXTURE;
if(!fixture)throw new Error('Impostare SOCIAL_TEST_FIXTURE su una copia.');

// Social con dentro due clienti (copie della fixture) e le cartelle che non sono clienti
async function seed(t){
 const base=await fs.mkdtemp(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-clients-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const social=path.join(base,'Social');await fs.mkdir(social);
 await fs.cp(fixture,path.join(social,'progetto_il_seme'),{recursive:true});
 await fs.cp(fixture,path.join(social,'social_economy'),{recursive:true});
 await fs.mkdir(path.join(social,'App Social'));await fs.writeFile(path.join(social,'App Social','Piano editoriale.xlsx'),'');
 await fs.mkdir(path.join(social,'.nascosta'));await fs.writeFile(path.join(social,'.nascosta','Piano editoriale.xlsx'),'');
 await fs.mkdir(path.join(social,'senza_piano'));
 await fs.mkdir(path.join(social,'@Recycle'));
 return social;
}

test('clienti: solo le sottocartelle con il piano, nome con spazi al posto di _ , in ordine',async t=>{
 const social=await seed(t);
 assert.deepEqual(await clients.listClients(social),[{folder:'progetto_il_seme',name:'progetto il seme'},{folder:'social_economy',name:'social economy'}]);
 assert.equal(clients.displayName('Social_Economy'),'Social Economy');
 assert.equal(await clients.clientPath(social,'social_economy'),path.join(social,'social_economy'));
 await assert.rejects(clients.clientPath(social,'senza_piano'),/non c’è più/);
 await assert.rejects(clients.clientPath(social,'../fuori'),/non c’è più/);
 await assert.rejects(clients.listClients(path.join(social,'manca')),/non è raggiungibile/);
});

test('clienti: Social con il piano direttamente dentro (vecchia struttura) non ha clienti',async t=>{
 const base=await fs.mkdtemp(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-legacy-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const social=path.join(base,'Social');await fs.cp(fixture,social,{recursive:true});
 assert.deepEqual(await clients.listClients(social),[]);
});

test('crea cliente: piano vuoto e cartelle fisse, 03_Template vuota; poi si crea un post (e si carica un template)',async t=>{
 const social=await seed(t),from=path.join(social,'progetto_il_seme');
 const created=await clients.createClient(social,'  Nuovo   Cliente ');
 assert.deepEqual(created,{folder:'Nuovo_Cliente',name:'Nuovo Cliente'});
 const root=path.join(social,'Nuovo_Cliente');
 await rootInfo(root);
 for(const name of ['00_Cestino','01_Posts','02_Settings','03_Template'])assert.ok((await fs.stat(path.join(root,name))).isDirectory(),name);
 assert.deepEqual(await fs.readdir(path.join(root,'03_Template')),[],'nessun template copiato da altri');
 const book=new Book(await fs.readFile(path.join(root,'Piano editoriale.xlsx')));
 assert.equal(book.posts().length,0,'nessun post degli altri clienti');
 assert.deepEqual((await clients.listClients(social)).map(c=>c.folder),['Nuovo_Cliente','progetto_il_seme','social_economy']);
 // il nuovo cliente funziona: senza template un Carosello non si crea, con il template caricato sì
 const year=new Date().getFullYear();
 const post={title:'Primo post',topic:'',format:'Carosello',channels:['Facebook','Instagram'],date:`${year}-05-11`,undefinedDate:false};
 await assert.rejects(planPost(root,post),/Manca il template Facebook – Carosello/);
 const {setTemplate}=require('../lib/templates.cjs');
 const ai=path.join(from,'00_template','base Facebook.ai');
 await setTemplate(root,'Facebook','Carosello',ai);await setTemplate(root,'Instagram','Carosello',ai);
 const plan=await planPost(root,post);
 await createPost(root,post,plan.fingerprint);
 const after=new Book(await fs.readFile(path.join(root,'Piano editoriale.xlsx'))).posts();
 assert.deepEqual(after.map(p=>[p.id,p.channel,p.title]),[[0,'Facebook','Primo post'],[0,'Instagram','Primo post']]);
 assert.ok(after[0].sourcesRelative.startsWith(`01_Posts/${year}/`));
 // le idee sono del cliente: quelle del nuovo cliente non compaiono negli altri
 await changeIdea(root,{action:'add',text:'Idea del nuovo cliente'});
 assert.equal((await listIdeas(root)).ideas.length,1);
 assert.equal((await listIdeas(from)).ideas.length,0);
});

test('crea cliente: nomi non validi o già usati rifiutati senza lasciare cartelle',async t=>{
 const social=await seed(t);
 await assert.rejects(clients.createClient(social,'Social Economy'),/già una cartella/,'stesso nome con maiuscole diverse');
 await assert.rejects(clients.createClient(social,'senza_piano'),/già una cartella/);
 await assert.rejects(clients.createClient(social,'   '),/Scrivi il nome/);
 await assert.rejects(clients.createClient(social,'a/b'),/non può contenere/);
 await assert.rejects(clients.createClient(social,'..'),/non può iniziare/);
 await assert.rejects(clients.createClient(social,'App Social'),/riservato/);
 await assert.rejects(clients.createClient(social,'x'.repeat(61)),/troppo lungo/);
 const before=(await fs.readdir(social)).sort();
 await assert.rejects(clients.createClient(path.join(social,'manca'),'Altro'),/non è raggiungibile/);
 assert.deepEqual((await fs.readdir(social)).sort(),before);
});

test('crea cliente a passi: controllo del nome prima di creare, anteprima del logo',async t=>{
 const social=await seed(t);
 assert.deepEqual(await clients.checkClientName(social,' Nuovo  cliente '),{root:social,folder:'Nuovo_cliente',name:'Nuovo cliente'});
 await assert.rejects(clients.checkClientName(social,'Social Economy'),/già una cartella/);
 assert.equal((await fs.readdir(social)).includes('Nuovo_cliente'),false,'il controllo non crea nulla');
 const settings=require('../lib/settings.cjs');
 const png=path.join(social,'..','logo.png');await fs.writeFile(png,Buffer.from([0x89,0x50,0x4e,0x47]));
 assert.match(await settings.checkLogo(png),/^data:image\/png;base64,/);
 await assert.rejects(settings.checkLogo(path.join(social,'..','logo.txt')),/PNG, JPG/);
 await assert.rejects(settings.checkLogo(path.join(social,'..','manca.png')),/Non trovo/);
});

test('rinomina cliente: cambia la cartella in Social, contenuto e collegamenti invariati',async t=>{
 const social=await seed(t);
 const before=(await fs.readdir(path.join(social,'social_economy'))).sort();
 await assert.rejects(clients.renameClient(social,'social_economy','Progetto il seme'),/già una cartella/);
 await assert.rejects(clients.renameClient(social,'social_economy','a/b'),/non può contenere/);
 await assert.rejects(clients.renameClient(social,'manca','Altro'),/non c’è più/);
 assert.deepEqual(await clients.renameClient(social,'social_economy','social economy'),{folder:'social_economy',name:'social economy',changed:false});
 const r=await clients.renameClient(social,'social_economy','  Economia   Sociale ');
 assert.deepEqual(r,{folder:'Economia_Sociale',name:'Economia Sociale',changed:true});
 assert.deepEqual((await fs.readdir(path.join(social,'Economia_Sociale'))).sort(),before);
 assert.deepEqual((await clients.listClients(social)).map(c=>c.folder),['Economia_Sociale','progetto_il_seme']);
 // solo maiuscole: passa da un nome d'appoggio
 const r2=await clients.renameClient(social,'Economia_Sociale','economia sociale');
 assert.equal(r2.folder,'economia_sociale');
 assert.ok((await fs.readdir(social)).includes('economia_sociale'));
 assert.ok(!(await fs.readdir(social)).some(n=>n.startsWith('.rinomina-')));
 // operazione in corso: niente rinomina
 await fs.writeFile(path.join(social,'economia_sociale','.social-create.lock'),'{}');
 await assert.rejects(clients.renameClient(social,'economia_sociale','Altro nome'),/operazione è in corso/);
});
