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
 await assert.rejects(templateFor(root,'Instagram'),/base Instagram\.ai\) in 03_Template/);
});
test('impostazioni del cliente: colore e logo in 02_Settings, JSON senza i vecchi percorsi',async t=>{
 const {base,root}=await seed(t);
 assert.deepEqual(await settings.current(root),{logo:'',color:''});
 assert.deepEqual(await settings.save(root,{color:'#AA00cc'}),{logo:'',color:'#aa00cc'});
 await assert.rejects(settings.save(root,{color:'rosso'}),/colore valido/);
 const png=path.join(base,'logo cliente.PNG');await fs.writeFile(png,Buffer.from('89504e470d0a1a0a','hex'));
 assert.deepEqual(await settings.setLogo(root,png),{logo:'logo.png',color:'#aa00cc'});
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
 assert.deepEqual(await settings.removeLogo(root),{logo:'',color:'#aa00cc'});
 assert.deepEqual((await fs.readdir(path.join(root,'02_Settings'))),['settings.json']);
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'02_Settings','settings.json'),'utf8')),{version:2,logo:'',color:'#aa00cc'});
});
test('impostazioni del cliente: il vecchio 00_template/socialdesk-settings.json si legge (senza i percorsi) e non si tocca',async t=>{
 const {root}=await seed(t);
 const old=JSON.stringify({version:1,mac:{socialRoot:root,templates:{},trash:'00_cestino'},windows:{},color:'#123456'});
 await fs.writeFile(path.join(root,'00_template','socialdesk-settings.json'),old);
 assert.deepEqual(await settings.current(root),{logo:'',color:'#123456'});
 await settings.save(root,{color:'#654321'});
 assert.equal(await fs.readFile(path.join(root,'00_template','socialdesk-settings.json'),'utf8'),old);
 assert.deepEqual(await settings.current(root),{logo:'',color:'#654321'});
 await fs.writeFile(path.join(root,'02_Settings','settings.json'),'{non json');
 await assert.rejects(settings.current(root),e=>e.code==='SETTINGS');
 assert.equal(await settings.logoData(root),'');
});
