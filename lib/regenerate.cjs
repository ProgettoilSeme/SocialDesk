'use strict';
// Rigenera sorgente: se in 01_Sorgenti manca il file Illustrator o il file di testo del post,
// lo ricrea come alla creazione (template del social copiato / testo vuoto) con il nome canonico
// Titolo_canale.ai/.md. Non sovrascrive mai e non tocca il piano Excel.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {constants}=require('node:fs');
const {CHANNELS,PostError,assertContained,slug,templateFor}=require('./posts.cjs');
const {selectedPost,sourceDirectory,TEXT_EXTENSIONS}=require('./details.cjs');
const KINDS={ai:{extensions:['.ai'],label:'file Illustrator'},md:{extensions:TEXT_EXTENSIONS,label:'file di testo'}};
async function regenerateSource(root,input){
 const kind=KINDS[input?.kind];
 if(!kind)throw new PostError('INPUT','Scegli il file da rigenerare.');
 const selected=await selectedPost(root,input),post=selected.post;
 const folder=await sourceDirectory(selected.root,post);
 const name=`${slug(post.title)}_${CHANNELS[post.channel].suffix}.${input.kind}`,file=path.join(folder,name);
 await assertContained(selected.root,file);
 const lock=path.join(selected.root,'.social-create.lock');let handle;
 try{handle=await fs.open(lock,'wx');await handle.writeFile(JSON.stringify({app:'Social',pid:process.pid,host:os.hostname(),at:new Date().toISOString()}));await handle.close();}
 catch(e){if(handle)await handle.close().catch(()=>{});if(e.code==='EEXIST')throw new PostError('LOCKED','Un’altra operazione è in corso. Attendi e riprova.');throw e;}
 try{
  const existing=(await fs.readdir(folder,{withFileTypes:true})).filter(e=>e.isFile()&&kind.extensions.includes(path.extname(e.name).toLowerCase()));
  if(existing.length)throw new PostError('EXISTS',`Nei sorgenti c’è già un ${kind.label} (${existing[0].name}): non serve rigenerarlo.`);
  if(input.kind==='ai'){
   const template=await templateFor(selected.root,post.channel);
   await fs.copyFile(template,file,constants.COPYFILE_EXCL);
   return{name,channel:post.channel,template:path.relative(selected.root,template).split(path.sep).join('/')};
  }
  await fs.writeFile(file,'',{flag:'wx'});
  return{name,channel:post.channel};
 }catch(e){if(e.code==='EEXIST')throw new PostError('EXISTS',`Esiste già ${name}: non viene sovrascritto.`);throw e;}
 finally{await fs.unlink(lock).catch(()=>{});}
}
module.exports={regenerateSource};
