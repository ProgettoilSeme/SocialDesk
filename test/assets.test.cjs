'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {syncAssetArchive}=require('../lib/assets.cjs');
async function seed(t){
 const base=await fs.mkdtemp(path.join(process.env.SOCIAL_TEST_TEMP||os.tmpdir(),'social-assets-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const root=path.join(base,'Social');await fs.mkdir(path.join(root,'00_template'),{recursive:true});await fs.writeFile(path.join(root,'Piano editoriale.xlsx'),'x');
 const put=async(relative,content)=>{const file=path.join(root,relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,content);return file;};
 return{root,put,archive:path.join(root,'00_template','Archivio asset')};
}
const list=async dir=>(await fs.readdir(dir)).filter(n=>!n.startsWith('.')).sort();
test('archivio asset: copia per social e anno, senza cartelle dei post, solo immagini',async t=>{
 const {root,put,archive}=await seed(t);
 const original=await put('01_Facebook/2026/03-27_Disability-card/02_Asset/card.png','A');
 await put('01_Facebook/2026/xx-xx_Bozza/02_Asset/sotto/foto.JPG','B');
 await put('01_Facebook/2025/12-10_Natale/02_Asset/natale.jpg','C');
 await put('02_Instagram/2026/03-27_Disability-card/02_Asset/card.png','A');
 await put('01_Facebook/2026/03-27_Disability-card/02_Asset/note.docx','no');
 await put('01_Facebook/2026/03-27_Disability-card/01_Sorgenti/sorgente.png','no');
 const result=await syncAssetArchive(root);
 assert.equal(result.copied,4);assert.equal(result.errors.length,0);
 assert.deepEqual(await list(path.join(archive,'01_Facebook/2026')),['card.png','foto.JPG']);
 assert.deepEqual(await list(path.join(archive,'01_Facebook/2025')),['natale.jpg']);
 assert.deepEqual(await list(path.join(archive,'02_Instagram/2026')),['card.png']);
 assert.equal(await fs.readFile(original,'utf8'),'A');
 const again=await syncAssetArchive(root);
 assert.equal(again.copied,0);assert.equal(again.unchanged,4);
});
test('archivio asset: nomi uguali con contenuto diverso, doppioni e copie modificate a mano',async t=>{
 const {root,put,archive}=await seed(t);
 await put('01_Facebook/2026/01-01_Uno/02_Asset/logo.png','uno');
 await put('01_Facebook/2026/02-02_Due/02_Asset/Logo.png','due');
 await put('01_Facebook/2026/03-03_Tre/02_Asset/copia.png','uno');
 let result=await syncAssetArchive(root);
 assert.equal(result.copied,2);assert.equal(result.duplicates,1);
 const year=path.join(archive,'01_Facebook/2026');
 assert.deepEqual(await list(year),['Logo__2.png','logo.png']);
 // Sorgente cambiato: la copia non toccata viene aggiornata.
 const source=path.join(root,'01_Facebook/2026/01-01_Uno/02_Asset/logo.png');
 await fs.writeFile(source,'uno nuovo');await fs.utimes(source,new Date(),new Date(Date.now()+5000));
 result=await syncAssetArchive(root);
 assert.equal(result.updated,1);assert.equal(await fs.readFile(path.join(year,'logo.png'),'utf8'),'uno nuovo');
 // Copia modificata a mano: non viene sovrascritta, si aggiunge una nuova copia.
 await fs.writeFile(path.join(year,'logo.png'),'modificata a mano');
 await fs.writeFile(source,'terza versione');await fs.utimes(source,new Date(),new Date(Date.now()+10000));
 result=await syncAssetArchive(root);
 assert.equal(result.copied,1);assert.equal(await fs.readFile(path.join(year,'logo.png'),'utf8'),'modificata a mano');
 assert.deepEqual(await list(year),['Logo__2.png','logo.png','logo__3.png']);
});
test('archivio asset: post rinominato non crea doppioni, file cancellati restano nell’archivio',async t=>{
 const {root,put,archive}=await seed(t);
 await put('03_LinkedIn/2026/xx-xx_Vecchio/02_Asset/foto.webp','F');
 await syncAssetArchive(root);
 await fs.rename(path.join(root,'03_LinkedIn/2026/xx-xx_Vecchio'),path.join(root,'03_LinkedIn/2026/04-04_Nuovo'));
 const result=await syncAssetArchive(root);
 assert.equal(result.copied,0);assert.equal(result.duplicates,1);
 await fs.rm(path.join(root,'03_LinkedIn/2026/04-04_Nuovo'),{recursive:true});
 await syncAssetArchive(root);
 assert.deepEqual(await list(path.join(archive,'03_LinkedIn/2026')),['foto.webp']);
});
test('archivio asset: ignora collegamenti simbolici e rispetta il lock condiviso',async t=>{
 const {root,put}=await seed(t);
 const outside=path.join(path.dirname(root),'fuori.png');await fs.writeFile(outside,'segreto');
 await fs.mkdir(path.join(root,'01_Facebook/2026/01-01_Link/02_Asset'),{recursive:true});
 await fs.symlink(outside,path.join(root,'01_Facebook/2026/01-01_Link/02_Asset/link.png'));
 let result=await syncAssetArchive(root);assert.equal(result.total,0);
 await fs.writeFile(path.join(root,'.social-create.lock'),'{}');
 await assert.rejects(()=>syncAssetArchive(root),e=>e.code==='LOCKED');
});
