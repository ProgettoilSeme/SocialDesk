'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const settings=require('../lib/settings.cjs');
const folders=require('../lib/folders.cjs');
const {templateFor}=require('../lib/posts.cjs');
const fixture=process.env.SOCIAL_TEST_FIXTURE;if(!fixture)throw Error('Impostare SOCIAL_TEST_FIXTURE.');
async function seed(t){
 const base=await fs.mkdtemp(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-settings-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const root=path.join(base,'Social');await fs.cp(fixture,root,{recursive:true});return{base,root};
}
test('cartelle fisse: nomi nuovi, oppure quelli di prima se ci sono ancora (senza badare alle maiuscole)',async t=>{
 const {root}=await seed(t);
 assert.equal(await folders.folder(root,'trash'),path.join(root,'00_Cestino'));
 assert.equal(await folders.folder(root,'settings'),path.join(root,'02_Settings'));
 assert.equal(await folders.folder(root,'template'),path.join(root,'00_template'),'la fixture ha ancora 00_template');
 await fs.mkdir(path.join(root,'00_cestino'));await fs.mkdir(path.join(root,'00_Settings'));
 assert.equal(await folders.folder(root,'trash'),path.join(root,'00_cestino'));
 assert.equal(await folders.folder(root,'settings'),path.join(root,'00_Settings'));
 await fs.rename(path.join(root,'00_template'),path.join(root,'03_Template'));
 assert.equal(await folders.folder(root,'template'),path.join(root,'03_Template'));
 assert.equal(await templateFor(root,'Facebook'),path.join(root,'03_Template','base Facebook.ai'));
 await fs.rm(path.join(root,'03_Template','base Instagram.ai'));
 await assert.rejects(templateFor(root,'Instagram'),/Manca il template Instagram in 03_Template/);
});
test('impostazioni del cliente: colore e logo in 02_Settings, JSON senza i vecchi percorsi',async t=>{
 const {base,root}=await seed(t);
 assert.deepEqual(await settings.current(root),{logo:'',background:'',color:'',platforms:['Facebook','Instagram','LinkedIn']});
 assert.deepEqual(await settings.save(root,{color:'#AA00cc'}),{logo:'',background:'',color:'#aa00cc',platforms:['Facebook','Instagram','LinkedIn']});
 await assert.rejects(settings.save(root,{color:'rosso'}),/colore valido/);
 const png=path.join(base,'logo cliente.PNG');await fs.writeFile(png,Buffer.from('89504e470d0a1a0a','hex'));
 assert.deepEqual(await settings.setLogo(root,png),{logo:'logo.png',background:'',color:'#aa00cc',platforms:['Facebook','Instagram','LinkedIn']});
 assert.ok((await fs.stat(path.join(root,'02_Settings','logo.png'))).isFile());
 assert.match(await settings.logoData(root),/^data:image\/png;base64,iVBORw0KGgo/);
 // un logo nuovo con un'altra estensione sostituisce il vecchio
 const svg=path.join(base,'logo.svg');await fs.writeFile(svg,'<svg xmlns="http://www.w3.org/2000/svg"/>');
 await settings.setLogo(root,svg);
 assert.deepEqual((await fs.readdir(path.join(root,'02_Settings'))).sort(),['logo.svg','settings.json']);
 assert.match(await settings.logoData(root),/^data:image\/svg\+xml;base64,/);
 await assert.rejects(settings.setLogo(root,path.join(base,'testo.txt')),/PNG, JPG/);
 const big=path.join(base,'grande.png');await fs.writeFile(big,Buffer.alloc(settings.MAX_LOGO+1));
 await assert.rejects(settings.setLogo(root,big),/troppo grande/);
 assert.deepEqual(await settings.removeLogo(root),{logo:'',background:'',color:'#aa00cc',platforms:['Facebook','Instagram','LinkedIn']});
 assert.deepEqual((await fs.readdir(path.join(root,'02_Settings'))),['settings.json']);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'02_Settings','settings.json'),'utf8')),{version:2,logo:'',background:'',color:'#aa00cc',platforms:['Facebook','Instagram','LinkedIn']});
});
test('impostazioni del cliente: il vecchio 00_template/socialdesk-settings.json si legge (senza i percorsi) e non si tocca',async t=>{
 const {root}=await seed(t);
 const old=JSON.stringify({version:1,mac:{socialRoot:root,templates:{},trash:'00_cestino'},windows:{},color:'#123456'});
 await fs.writeFile(path.join(root,'00_template','socialdesk-settings.json'),old);
 assert.deepEqual(await settings.current(root),{logo:'',background:'',color:'#123456',platforms:['Facebook','Instagram','LinkedIn']});
 await settings.save(root,{color:'#654321'});
 assert.equal(await fs.readFile(path.join(root,'00_template','socialdesk-settings.json'),'utf8'),old);
 assert.deepEqual(await settings.current(root),{logo:'',background:'',color:'#654321',platforms:['Facebook','Instagram','LinkedIn']});
 await fs.writeFile(path.join(root,'02_Settings','settings.json'),'{non json');
 await assert.rejects(settings.current(root),e=>e.code==='SETTINGS');
 assert.equal(await settings.logoData(root),'');
});

test('piattaforme del cliente: predefinite, scelte e salvate nell’ordine dell’app, almeno una',async t=>{
 const {root}=await seed(t);
 assert.deepEqual((await settings.save(root,{platforms:['Reddit','Instagram','Blog']})).platforms,['Instagram','Blog','Reddit']);
 assert.equal((await settings.current(root)).color,'','il colore non cambia salvando le piattaforme');
 await assert.rejects(settings.save(root,{platforms:[]}),/almeno una/);
 await assert.rejects(settings.save(root,{platforms:['MySpace']}),/non valida/);
 assert.deepEqual((await settings.save(root,{color:'#112233'})).platforms,['Instagram','Blog','Reddit'],'le piattaforme restano salvando il colore');
});
test('template per piattaforma e formato: elenco, caricamento con il nome giusto, uso alla creazione, rimozione',async t=>{
 const templates=require('../lib/templates.cjs');
 const {planPost,createPost}=require('../lib/posts.cjs');
 const {base,root}=await seed(t);await fs.mkdir(path.join(root,'01_Posts'));
 let list=await templates.listTemplates(root,['Instagram','TikTok']);
 assert.deepEqual(list.map(x=>`${x.channel}|${x.format}|${x.present}|${x.fallback}`),['Instagram|Immagine singola|false|base Instagram.ai','Instagram|Carosello|false|base Instagram.ai','Instagram|Storia foto|false|base Instagram.ai','TikTok|Carosello|false|']);
 const ai=path.join(base,'grafica storia.AI');await fs.writeFile(ai,'AI STORIA');
 await assert.rejects(templates.setTemplate(root,'Instagram','Storia foto',path.join(base,'x.png')),/\.ai/);
 await assert.rejects(templates.setTemplate(root,'Instagram','Video',ai),/non valido/);
 assert.deepEqual(await templates.setTemplate(root,'Instagram','Storia foto',ai),{channel:'Instagram',format:'Storia foto',name:'Instagram - Storia foto.ai'});
 list=await templates.listTemplates(root,['Instagram']);
 assert.equal(list.find(x=>x.format==='Storia foto').present,true);
 // creazione: Storia foto usa il suo template, Immagine singola il vecchio "base", Video un .mp4 vuoto, da definire nessun file
 const post={title:'Prova formati',topic:'',channels:['Facebook','Instagram','LinkedIn'],channelFormats:{Facebook:'Video',Instagram:'Storia foto',LinkedIn:''},channelDates:{Facebook:{undefinedDate:true},Instagram:{undefinedDate:true},LinkedIn:{undefinedDate:true}},year:2026};
 const plan=await planPost(root,post);await createPost(root,post,plan.fingerprint);
 const sources=path.join(root,'01_Posts','2026','000_Prova-formati','01_Sorgenti');
 assert.deepEqual((await fs.readdir(sources)).sort(),['Prova-formati_facebook.md','Prova-formati_facebook.mp4','Prova-formati_instagram.ai','Prova-formati_instagram.md','Prova-formati_linkedin.md']);
 assert.equal(await fs.readFile(path.join(sources,'Prova-formati_instagram.ai'),'utf8'),'AI STORIA');
 assert.equal((await fs.stat(path.join(sources,'Prova-formati_facebook.mp4'))).size,0);
 await templates.removeTemplate(root,'Instagram','Storia foto');
 assert.equal((await templates.listTemplates(root,['Instagram'])).find(x=>x.format==='Storia foto').present,false);
 // formato non della piattaforma e piattaforma senza template
 await assert.rejects(planPost(root,{...post,title:'Altro',channels:['TikTok'],channelFormats:{TikTok:'Immagine singola'},channelDates:{TikTok:{undefinedDate:true}}}),/formato valido per TikTok/);
 await assert.rejects(planPost(root,{...post,title:'Altro',channels:['Reddit'],channelFormats:{Reddit:'Carosello'},channelDates:{Reddit:{undefinedDate:true}}}),/Manca il template Reddit – Carosello/);
});
test('Modifica: scegliendo dopo un formato si crea il suo file, senza sovrascrivere',async t=>{
 const {ensureFormatFile}=require('../lib/regenerate.cjs');
 const {planPost,createPost}=require('../lib/posts.cjs');
 const {listPosts,planPostEdit,savePostEdit}=require('../lib/editor.cjs');
 const {root}=await seed(t);await fs.mkdir(path.join(root,'01_Posts'));
 const post={title:'Dopo',topic:'',channels:['Facebook'],channelFormats:{Facebook:''},channelDates:{Facebook:{undefinedDate:true}},year:2026};
 const plan=await planPost(root,post);await createPost(root,post,plan.fingerprint);
 const sources=path.join(root,'01_Posts','2026','000_Dopo','01_Sorgenti');
 assert.deepEqual(await fs.readdir(sources),['Dopo_facebook.md']);
 let list=await listPosts(root);let row=list.posts.find(p=>p.title==='Dopo');
 assert.equal(await ensureFormatFile(root,row.key),null,'senza formato nessun file');
 const edit={key:row.key,revision:list.revision,title:'Dopo',topic:'',format:'Immagine singola',status:row.status||'testi da creare',undefinedDate:true};
 const p=await planPostEdit(root,edit);await savePostEdit(root,edit,p.fingerprint);
 assert.deepEqual(await ensureFormatFile(root,row.key),{name:'Dopo_facebook.ai',kind:'ai',format:'Immagine singola'});
 assert.equal(await ensureFormatFile(root,row.key),null,'già presente: niente');
 assert.deepEqual((await fs.readdir(sources)).sort(),['Dopo_facebook.ai','Dopo_facebook.md']);
});

test('sfondo della home del cliente: in 02_Settings come il logo, sostituito e rimosso',async t=>{
 const {base,root}=await seed(t);
 assert.equal(await settings.backgroundStamp(root),'');assert.equal(await settings.backgroundData(root),null);
 const jpg=path.join(base,'foto.JPG');await fs.writeFile(jpg,Buffer.from('ffd8ffe000104a464946','hex'));
 const s1=await settings.setBackground(root,jpg);
 assert.equal(s1.background,'sfondo.jpg');
 const data=await settings.backgroundData(root);
 assert.equal(data.type,'image/jpeg');assert.deepEqual(data.data,await fs.readFile(jpg));assert.match(data.stamp,/^sfondo\.jpg:/);
 assert.equal(await settings.backgroundStamp(root),data.stamp);
 // il logo resta separato, un nuovo sfondo con altra estensione sostituisce il vecchio
 const png=path.join(base,'altro.png');await fs.writeFile(png,Buffer.from('89504e470d0a1a0a','hex'));
 await settings.setLogo(root,png);await settings.setBackground(root,png);
 assert.deepEqual((await fs.readdir(path.join(root,'02_Settings'))).sort(),['logo.png','settings.json','sfondo.png']);
 await assert.rejects(settings.setBackground(root,path.join(base,'x.tif')),/PNG, JPG, WEBP, GIF o SVG/);
 const svg=path.join(base,'sfondo vettoriale.svg');await fs.writeFile(svg,'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#c36"/></svg>');
 await settings.setBackground(root,svg);assert.equal((await settings.backgroundData(root)).type,'image/svg+xml');
 await settings.setBackground(root,png);
 const big=path.join(base,'grande.jpg');await fs.writeFile(big,Buffer.alloc(settings.MAX_BACKGROUND+1));
 await assert.rejects(settings.setBackground(root,big),/troppo grande/);
 const after=await settings.removeBackground(root);
 assert.equal(after.background,'');assert.equal(after.logo,'logo.png');
 assert.deepEqual((await fs.readdir(path.join(root,'02_Settings'))).sort(),['logo.png','settings.json']);
});
