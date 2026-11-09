'use strict';
// Interfaccia costruita con i componenti della libreria myPgs (attributi pgs, pgs-state, pgs-data).
const api=window.socialAPI;
const localToday=()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const initialPost=()=>({channels:[],title:'',topic:'',channelFormats:{},channelDates:{},year:String(new Date().getFullYear())});
const state={route:'home',step:0,visited:0,root:'',rootValid:false,post:initialPost(),plan:null,result:null,error:'',loading:false,drafts:[],revision:'',selected:null,notice:'',filterYear:String(new Date().getFullYear()),filterChannels:['Facebook','LinkedIn','Instagram'],filterStatus:'',filterMonth:'',groupById:true,hidePublished:true,expandedGroups:new Set(),years:[],listMode:'drafts',editValues:null,editOriginal:null,editReturn:null,settings:null};
const main=document.getElementById('main'),footer=document.getElementById('footer'),progress=document.getElementById('progress');
const CHANNELS=['Facebook','Instagram','LinkedIn'];
const FORMATS=['Immagine singola','Carosello','Video','Reel','Storia'];
const STATUSES=['testi da creare','testi in bozza','immagine da creare','da pubblicare','pubblicato'];
const MONTHS=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const disabled=flag=>flag?'disabled':'';

//# myPgs
// pgs è pubblicato su globalThis dal bundle della libreria; ogni markup inserito dopo il caricamento va inizializzato.
function enhance(root){try{globalThis.pgs?.helper.init(root);}catch(e){console.error(e);}}
const icon=(name,size='')=>`<i pgs="icon['icon-${name}'${size?` '${size}'`:''}]" aria-hidden="true"></i>`;
function socialIcon(channel){return CHANNELS.includes(channel)?`<i pgs="icon" class="social-icon social-${channel.toLowerCase()}" aria-hidden="true"></i>`:'';}
const ALERTS={error:['alertError','circleXmark'],success:['alertSuccess','circleCheck'],info:['alertInfo','circleInfo'],warning:['alertWarning','triangleExclamation']};
function alertHtml(kind,message,title=''){
 if(!message)return'';const [option,glyph]=ALERTS[kind]||ALERTS.info;
 return `<div pgs="alert['${option}']"><i pgs="icon['icon-${glyph}'] alert-icon" aria-hidden="true"></i><div pgs="alert-content">${title?`<strong pgs="alert-content-title">${escape(title)}</strong>`:''}<p>${escape(message)}</p></div></div>`;
}
function setAlert(box,message,kind='error'){if(box){box.innerHTML=alertHtml(kind,message);box.hidden=!message;}}
const errorBox=()=>`<div id="error" role="alert">${alertHtml('error',state.error)}</div>`;
const noticeBox=()=>state.notice?`<div role="status">${alertHtml('success',state.notice)}</div>`:'';
const field=(label,control,hint='')=>`<label pgs="flex['column']"><span pgs="label">${label}</span>${control}</label>${hint?`<p class="hint">${hint}</p>`:''}`;
const formatDate=date=>date?date.split('-').reverse().join('/'):'';

// Modale nativa gestita da pgs.modal: resta nel proprio wrapper (dialogTopLevel → showModal) e si chiude
// con X (modal-close), Esc o clic sullo sfondo; onClose riceve sempre la chiusura effettiva.
function createModal({title,titleId,describedBy='',body,size='dialogSmall',form=false,closable=true,onClose}){
 const wrapper=document.createElement('div');
 wrapper.setAttribute('pgs',`modal['dialogTopLevel' 'dialogCenter' '${size}' 'dialogDisableBackdropClose']`);
 const close=closable?`<button pgs="button['btnIconOnly' 'btnMini'] modal-close" type="button" aria-label="Chiudi" data-modal-x>${icon('close')}</button>`:'';
 const inner=`<div pgs="modal-dialog-content-header flex['row' 'itemCenter' 'justifyBetween' 'gapParagraphs']"><h2 pgs="h4" id="${titleId}">${escape(title)}</h2>${close}</div><div pgs="modal-dialog-content-scroll flex['column' 'gapParagraphs']">${body}</div>`;
 wrapper.innerHTML=`<dialog aria-labelledby="${titleId}" ${describedBy?`aria-describedby="${describedBy}"`:''}><div pgs="modal-dialog-content">${form?`<form pgs="form flex['column' 'gapParagraphs']" novalidate>${inner}</form>`:inner}</div></dialog>`;
 document.body.appendChild(wrapper);
 enhance(wrapper);
 const dialog=wrapper.querySelector('dialog'),instance=()=>globalThis.pgs?.modal.api(wrapper);
 let pressed=null;
 dialog.addEventListener('pointerdown',event=>{pressed=event.target;},{capture:true});
 const modal={wrapper,dialog,busy:false,
  open(){const live=instance();if(live)live.open();else dialog.showModal();},
  close(value){if(modal.busy||!dialog.open)return;dialog.close(value);},
 };
 dialog.addEventListener('cancel',event=>{event.preventDefault();modal.close();});
 dialog.addEventListener('click',event=>{const fromBackdrop=pressed===null||pressed===dialog;pressed=null;if(closable&&event.target===dialog&&fromBackdrop)modal.close();});
 dialog.addEventListener('close',()=>{instance()?.destroy();wrapper.remove();onClose?.(dialog.returnValue);},{once:true});
 return modal;
}

async function call(method,...args){if(!api)throw new Error('Apri SocialDesk dall’applicazione per accedere ai file.');const response=await api[method](...args);if(!response.ok){const e=new Error(response.error.message);e.code=response.error.code;throw e;}return response.value;}
function valid(){
 if(state.step===0)return state.rootValid&&state.post.channels.length>0;
 if(state.step===1)return state.post.title.trim().length>0&&state.post.title.trim().length<=140&&state.post.channels.length>0&&state.post.channels.every(channel=>!!state.post.channelFormats[channel]);
 if(state.step===2){
  const selections=state.post.channels.map(channel=>state.post.channelDates[channel]);
  if(!selections.length||selections.some(value=>!value||(!value.undefinedDate&&!/^\d{4}-\d{2}-\d{2}$/.test(value.date))))return false;
  const years=new Set(selections.filter(value=>!value.undefinedDate).map(value=>value.date.slice(0,4)));
  return years.size>1?false:years.size===1?true:/^\d{4}$/.test(state.post.year)&&Number(state.post.year)>=1900&&Number(state.post.year)<=9999;
 }
 return !!state.plan;
}
function updateContinue(){const next=document.getElementById('next');if(next)next.disabled=state.loading||!valid();}
function render(){
 renderHeader();
 progress.hidden=state.route!=='create';
 document.body.dataset.screen=state.route;
 const section=state.listMode==='posts'?'Tutti i post':'Post in bozza';
 document.title=state.route==='home'?'SocialDesk':state.route==='create'?'SocialDesk — Nuovo post':state.route==='settings'?'SocialDesk — Impostazioni':'SocialDesk — '+section;
 if(state.route==='home')renderHome();
 else if(state.route==='settings')renderSettings();
 else if(state.route==='drafts'||state.route==='posts')renderDrafts();
 else if(state.route==='edit-post')renderPostEdit();
 else{
  renderWizard();
  if(!state.loading){const home=document.createElement('button');home.type='button';home.setAttribute('pgs',"button['btnTransparent']");home.className='home-link';home.innerHTML=`${icon('arrowLeft')}<span>Torna alla home</span>`;home.addEventListener('click',goHome);footer.prepend(home);}
 }
 enhance(main);enhance(footer);enhance(progress);
}
function renderHeader(){
 const active=state.route==='home'||state.route==='settings'?'':state.route==='create'?'create':state.listMode;
 const brand=document.getElementById('brand-home');brand.setAttribute('aria-disabled',String(state.loading));
 document.querySelectorAll('[data-nav]').forEach(link=>{
  if(link.dataset.nav===active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  link.setAttribute('aria-disabled',String(state.loading));link.tabIndex=state.loading?-1:0;
 });
}
function startCreate(){
 if(state.loading)return;state.route='create';state.step=0;state.visited=0;state.post=initialPost();state.plan=null;state.result=null;state.error='';render();window.scrollTo({top:0});
}
function channelCard(channel,content){
 const id=channel.toLowerCase();
 return `<div pgs="box flex['column' 'gapParagraphs']" class="channel-card" data-channel="${channel}" role="group" aria-labelledby="card-${id}"><h3 pgs="h5 flex['row' 'itemCenter' 'gapDetails']" id="card-${id}">${socialIcon(channel)}<span>${channel}</span></h3>${content}</div>`;
}
function renderWizard(){
 progress.innerHTML=['Social','Post','Data','Riepilogo'].map((name,i)=>{
  const current=i===state.step,complete=i<state.step;
  const look=current?"'btnMini' 'btnStrong'":complete?"'btnMini'":"'btnMini' 'btnTransparent'";
  return `<button pgs="button[${look}]" class="step" type="button" data-step="${i}" ${i>state.visited||state.loading||state.result?'disabled':''} ${current?'aria-current="step"':''}><span pgs="badge${complete?"['badgeSuccess']":''}" class="step-number">${complete?icon('check'):i+1}</span><span>${name}</span></button>`;
 }).join('');
 if(state.result){renderSuccess();return;}
 let content='';
 if(state.step===0)content=`<h1 pgs="h2">Dove vuoi pubblicare?</h1><p class="lead">Seleziona uno o più social per questo post.</p><fieldset pgs="grid['column-3' 'gapParagraphs']" class="social-list"><legend pgs="visuallyHidden">Social del post</legend>${CHANNELS.map(c=>`<label pgs="button['btnTwoState' 'btnVertical']" class="channel-chip social-option" data-channel="${c}"><input type="checkbox" name="social" value="${c}" ${state.post.channels.includes(c)?'checked':''}>${socialIcon(c)}<span>${c}</span></label>`).join('')}</fieldset>${state.rootValid?'':`<div pgs="alert['alertWarning']" role="alert"><i pgs="icon['icon-triangleExclamation'] alert-icon" aria-hidden="true"></i><div pgs="alert-content flex['column' 'gapParagraphs']"><p>La cartella Social non è configurata.</p><button pgs="button" id="create-open-settings" type="button">${icon('gear')}<span>Apri Impostazioni</span></button></div></div>`}`;
 if(state.step===1)content=`<h1 pgs="h2">Di cosa parla il post?</h1><p class="lead">Titolo e argomento saranno uguali per i social selezionati. Scegli il formato per ciascuno.</p><div pgs="form flex['column' 'gapElements']">${field('Titolo',`<input pgs="input" id="title" maxlength="140" autocomplete="off" required placeholder=" " value="${escape(state.post.title)}">`)}${field('Argomento <span class="optional">(facoltativo)</span>',`<input pgs="input" id="topic" maxlength="200" autocomplete="off" placeholder=" " value="${escape(state.post.topic)}">`)}<div pgs="grid['column-3' 'gapParagraphs']">${state.post.channels.map(channel=>channelCard(channel,field('Formato',`<select pgs="select" id="format-${channel.toLowerCase()}" data-channel-format="${channel}" required><option value="" ${state.post.channelFormats[channel]?'':'selected'} disabled>Scegli un formato</option>${FORMATS.map(format=>`<option value="${format}" ${state.post.channelFormats[channel]===format?'selected':''}>${format}</option>`).join('')}</select>`))).join('')}</div></div>`;
 if(state.step===2){
  const allUndefined=state.post.channels.every(channel=>state.post.channelDates[channel]?.undefinedDate);
  content=`<h1 pgs="h2">Quando vuoi pubblicare?</h1><p class="lead">Scegli la data per ogni social, oppure lasciala da definire.</p><div pgs="form flex['column' 'gapElements']"><div pgs="grid['column-3' 'gapParagraphs']">${state.post.channels.map(channel=>{const item=state.post.channelDates[channel],id=channel.toLowerCase();return channelCard(channel,`${field('Data pubblicazione',`<input pgs="input" type="date" id="date-${id}" data-channel-date="${channel}" value="${escape(item.date)}" ${disabled(item.undefinedDate)}>`)}<label pgs="checkbox"><input type="checkbox" data-undefined-date="${channel}" ${item.undefinedDate?'checked':''}><span>Data da definire</span></label>`);}).join('')}</div>${allUndefined?`<div class="year-field">${field('Anno',`<input pgs="input" id="year" type="number" inputmode="numeric" min="1900" max="9999" step="1" value="${escape(state.post.year)}">`,'Le cartelle inizieranno con xx-xx.')}</div>`:''}<p class="hint">I social dello stesso post devono restare nello stesso anno per condividere l’ID.</p></div>`;
 }
 if(state.step===3){
  const p=state.plan;
  content=p?`<h1 pgs="h2">È tutto pronto?</h1><p class="lead">Controlla i dati prima di creare il post.</p><dl pgs="box" class="review"><dt>Titolo</dt><dd>${escape(p.title)}</dd><dt>Social</dt><dd>${escape(p.channels.join(', '))}</dd><dt>Anno</dt><dd>${p.year}</dd><dt>Argomento</dt><dd>${escape(p.topic||'—')}</dd><dt>ID post</dt><dd>${p.id}</dd></dl><div pgs="grid['column-3' 'gapParagraphs']">${p.folders.map(f=>channelCard(f.channel,`<p pgs="flex['row' 'wrap' 'gapDetails']"><span pgs="badge['badgeNeutral']">${escape(f.format)}</span><span pgs="badge['badgeInfo']">${f.date?escape(formatDate(f.date)):'Data da definire'}</span></p><p class="path">${escape(f.relative)}</p><p class="hint">${escape(f.aiName)} · ${escape(f.textName)}</p>`)).join('')}</div><p>${p.channels.length===1?'Verranno create una cartella e una riga':'Verranno create '+p.channels.length+' cartelle e '+p.channels.length+' righe'} nel piano editoriale, nella scheda <strong>${p.year}</strong>.</p>`:`<h1 pgs="h2">Controllo dei dati</h1><p class="lead loading">Verifico cartelle, template e piano editoriale…</p>`;
 }
 main.innerHTML=`${content}${errorBox()}`;
 footer.innerHTML=`<span pgs="badge['badgeNeutral']">Passo ${state.step+1} di 4</span><div pgs="flex['row' 'gapParagraphs']"><button pgs="button" id="back" type="button" ${state.step===0||state.loading?'disabled':''}>${icon('arrowLeft')}<span>Indietro</span></button><button pgs="button['btnStrong' 'btnReverse']" id="next" type="button" ${!valid()||state.loading?'disabled':''}><span>${state.loading?'Attendi…':state.step===3?'Crea post':'Continua'}</span>${state.step===3?icon('check'):icon('arrowRight')}</button></div>`;
 wire();
}
function error(message){state.error=message;setAlert(document.getElementById('error'),message);}
function wire(){
 document.querySelectorAll('[name=social]').forEach(input=>input.addEventListener('change',()=>{state.post.channels=Array.from(document.querySelectorAll('[name=social]:checked')).map(x=>x.value);for(const channel of state.post.channels){state.post.channelDates[channel]??={date:localToday(),undefinedDate:false};state.post.channelFormats[channel]??='';}state.plan=null;error('');updateContinue();}));
 document.getElementById('create-open-settings')?.addEventListener('click',async()=>{if(await confirmLeave())openSettings();});
 for(const id of ['title','topic','year'])document.getElementById(id)?.addEventListener('input',event=>{state.post[id]=event.target.value;state.plan=null;error('');updateContinue();});
 document.querySelectorAll('[data-channel-format]').forEach(input=>input.addEventListener('change',event=>{state.post.channelFormats[event.target.dataset.channelFormat]=event.target.value;state.plan=null;error('');updateContinue();}));
 document.querySelectorAll('[data-channel-date]').forEach(input=>input.addEventListener('input',event=>{state.post.channelDates[event.target.dataset.channelDate].date=event.target.value;state.plan=null;error('');updateContinue();}));
 document.querySelectorAll('[data-undefined-date]').forEach(input=>input.addEventListener('change',event=>{state.post.channelDates[event.target.dataset.undefinedDate].undefinedDate=event.target.checked;state.plan=null;state.error='';render();}));
 document.getElementById('back')?.addEventListener('click',()=>go(state.step-1));
 document.getElementById('next')?.addEventListener('click',async()=>{if(state.step===3)await submit();else await go(state.step+1);});
 progress.querySelectorAll('[data-step]').forEach(button=>button.addEventListener('click',()=>go(Number(button.dataset.step))));
}
async function go(step){
 if(state.loading||step<0||step>3)return;
 state.error='';
 if(step===3){
  state.loading=true;render();
  try{state.plan=await call('plan',state.post);state.step=3;state.visited=3;}
  catch(e){state.error=e.message;}
  finally{state.loading=false;render();}
 }else{state.step=step;state.visited=Math.max(state.visited,step);render();}
}
async function submit(){
 if(!state.plan||state.loading)return;
 state.loading=true;state.error='';render();
 try{state.result=await call('create',state.post,state.plan.fingerprint);}
 catch(e){state.error=e.message;if(e.code==='CHANGED'){try{state.plan=await call('plan',state.post);}catch{state.plan=null;}}}
 finally{state.loading=false;render();}
}
function renderSuccess(){
 const r=state.result;
 main.innerHTML=`<div pgs="alert['alertSuccess']" role="status"><i pgs="icon['icon-circleCheck'] alert-icon" aria-hidden="true"></i><div pgs="alert-content"><h1 pgs="alert-content-title h3">Post creato</h1><p>${r.channels.length===1?'La cartella e la riga Excel sono pronte.':'Le '+r.channels.length+' cartelle e le righe Excel sono pronte.'}</p></div></div><dl pgs="box" class="review"><dt>Titolo</dt><dd>${escape(r.title)}</dd><dt>ID post</dt><dd>${r.id}</dd><dt>Anno</dt><dd>${r.year}</dd></dl><div pgs="grid['column-3' 'gapParagraphs']">${r.created.map(f=>channelCard(f.channel,`<p class="path">${escape(f.path)}</p>`)).join('')}</div><div pgs="flex['row' 'wrap' 'gapParagraphs']">${r.created.map(f=>`<button pgs="button" data-open-post="${escape(f.channel)}" type="button">${icon('folderOpen')}<span>${r.created.length===1?'Apri cartella del post':'Apri cartella '+escape(f.channel)}</span></button>`).join('')}<button pgs="button['btnStrong']" id="new-post" type="button">${icon('plus')}<span>Crea un altro post</span></button></div><div id="error" role="alert"></div>`;
 footer.innerHTML=`<span pgs="badge['badgeSuccess']">${icon('check')}Creazione completata</span>`;
 document.querySelectorAll('[data-open-post]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{await call('openResult',button.dataset.openPost);}catch(e){error(e.message);}finally{button.disabled=false;}}));
 document.getElementById('new-post').addEventListener('click',()=>{state.step=0;state.visited=0;state.post=initialPost();state.plan=null;state.result=null;state.error='';render();});
}
async function goHome(){if(state.loading||!await confirmLeave())return;state.route='home';state.error='';state.notice='';state.selected=null;render();window.scrollTo({top:0});}
function renderHome(){
 const card=(id,tone,image,label)=>`<button pgs="box${tone?` background['${tone}']`:''} flex['column' 'itemCenter' 'gapParagraphs']" class="home-action" id="${id}" type="button" ${disabled(state.loading)}><img src="assets/${image}" alt="" width="240" height="240"><span pgs="h4">${label}</span></button>`;
 main.innerHTML=`<h1 class="home-title">Cosa vuoi fare oggi?</h1><div pgs="grid['column-3' 'gapElements']" class="home-actions">${card('all-posts','','calendar.png','Tutti i post')}${card('drafts','','draft.png','Post in bozza')}${card('create-new','bgSuccessSoft','megaphone.png','Crea nuovo post')}</div><hr><div pgs="flex['row' 'wrap' 'itemCenter' 'gapParagraphs']" class="home-settings"><button pgs="button" id="open-settings" type="button" ${disabled(state.loading)}>${icon('gear')}<span>Impostazioni</span></button><button pgs="button" id="sync-assets" type="button" ${disabled(state.loading||!state.rootValid)} title="Copia le immagini di tutti i post in 00_template/Archivio asset, divise per social e anno">${icon('images')}<span>${state.assetSyncing?'Aggiornamento…':'Aggiorna archivio asset'}</span></button>${state.version?`<span pgs="badge['badgeNeutral']" class="app-version">Versione ${escape(state.version)}</span>`:''}</div>${noticeBox()}${errorBox()}`;
 footer.innerHTML='';
 document.getElementById('open-settings').addEventListener('click',openSettings);
 document.getElementById('sync-assets').addEventListener('click',syncAssets);
 document.getElementById('drafts').addEventListener('click',loadDrafts);
 document.getElementById('all-posts').addEventListener('click',loadPosts);
 document.getElementById('create-new').addEventListener('click',startCreate);
}
async function openSettings(){
 state.route='settings';state.error='';state.notice='';render();
 if(!state.rootValid)return;
 try{state.settings=await call('settings');render();}catch(e){error(e.message);}
}
function renderSettings(){
 const s=state.settings;
 const row=(label,key,value)=>`<div pgs="flex['column']"><label pgs="label" for="setting-${key}">${label}</label><div pgs="flex['row' 'itemCenter' 'gapParagraphs' 'nowrap']" class="settings-control"><input pgs="input" id="setting-${key}" placeholder=" " value="${escape(value||'')}" ${disabled(!s)}><button pgs="button" type="button" data-pick="${key}" ${disabled(!s)}>${icon('folderOpen')}<span>Sfoglia</span></button></div></div>`;
 main.innerHTML=`<h1 pgs="h2">Impostazioni</h1><p class="lead">I percorsi vengono salvati in <strong>00_template/socialdesk-settings.json</strong>. Mac e Windows mantengono impostazioni separate.</p><section pgs="box flex['column' 'gapParagraphs']" aria-labelledby="settings-root-title"><h2 pgs="h4" id="settings-root-title">Cartella Social</h2><div pgs="flex['row' 'itemCenter' 'gapParagraphs' 'nowrap']" class="settings-control"><p class="path folder-path" title="${escape(state.root)}">${escape(state.root||'Nessuna cartella selezionata')}</p><button pgs="button" id="settings-root" type="button">${icon('folderOpen')}<span>${state.root?'Cambia cartella':'Scegli cartella'}</span></button></div></section>${s?`<section pgs="box form flex['column' 'gapParagraphs']" aria-labelledby="settings-templates-title"><h2 pgs="h4" id="settings-templates-title">Template Illustrator</h2><p class="hint">Scegli un file .ai per ogni social. I percorsi relativi partono dalla cartella Social.</p>${row('Facebook','Facebook',s.templates.Facebook)}${row('Instagram','Instagram',s.templates.Instagram)}${row('LinkedIn','LinkedIn',s.templates.LinkedIn)}</section><section pgs="box form flex['column' 'gapParagraphs']" aria-labelledby="settings-trash-title"><h2 pgs="h4" id="settings-trash-title">Cestino</h2><p class="hint">La cartella deve trovarsi dentro Social. Se non esiste, verrà creata quando elimini un post.</p>${row('Cartella cestino','trash',s.trash)}</section><p class="hint">Piano editoriale: Piano editoriale.xlsx nella cartella Social.</p><div><button pgs="button['btnStrong']" id="save-settings" type="button">${icon('save')}<span>Salva impostazioni</span></button></div>`:''}${errorBox()}${noticeBox()}`;
 footer.innerHTML=`<button pgs="button['btnTransparent']" id="settings-home" type="button">${icon('arrowLeft')}<span>Torna alla home</span></button>`;
 document.getElementById('settings-home').addEventListener('click',goHome);
 document.getElementById('settings-root').addEventListener('click',async()=>{try{const result=await call('chooseRoot');if(result){state.root=result.root;state.rootValid=result.valid;state.settings=await call('settings');state.error='';state.notice='';render();}}catch(e){error(e.message);}});
 document.querySelectorAll('[data-pick]').forEach(button=>button.addEventListener('click',async()=>{try{const value=await call('chooseSetting',button.dataset.pick);if(value!==null)document.getElementById('setting-'+button.dataset.pick).value=value;}catch(e){error(e.message);}}));
 document.getElementById('save-settings')?.addEventListener('click',async()=>{const input={socialRoot:state.root,templates:{},trash:document.getElementById('setting-trash').value};for(const channel of CHANNELS)input.templates[channel]=document.getElementById('setting-'+channel).value;try{state.settings=await call('saveSettings',input);state.notice='Impostazioni salvate.';state.error='';render();}catch(e){error(e.message);}});
}
async function syncAssets(){
 if(state.loading)return;
 state.loading=true;state.assetSyncing=true;state.error='';state.notice='';render();
 try{
  const r=await call('syncAssets');
  const parts=[`${r.copied} ${r.copied===1?'nuova immagine':'nuove immagini'}`];
  if(r.updated)parts.push(`${r.updated} ${r.updated===1?'aggiornata':'aggiornate'}`);
  parts.push(`${r.unchanged+r.duplicates} già presenti`);
  state.notice=`Archivio asset aggiornato: ${parts.join(', ')}. Cartella: ${r.archiveRelative}.`+(r.errors.length?` ${r.errors.length} file non copiati (es. ${r.errors[0].file}: ${r.errors[0].message}).`:'');
 }catch(e){state.error=e.message;}
 finally{state.loading=false;state.assetSyncing=false;render();}
}
async function loadDrafts(){return loadList('drafts');}
async function loadPosts(){return loadList('posts');}
async function loadList(kind){
 if(state.loading)return;
 if(!state.rootValid){error('Configura prima la cartella Social in Impostazioni.');return;}
 const reset=state.route==='home'||state.listMode!==kind;
 state.loading=true;state.error='';render();
 try{const result=await call('posts');state.drafts=result.posts;state.hidePublished=kind==='drafts';state.revision=result.revision;state.years=result.years||[];state.route=kind;state.listMode=kind;state.selected=null;if(reset){state.filterYear=String(new Date().getFullYear());state.filterChannels=['Facebook','LinkedIn','Instagram'];state.filterStatus='';state.filterMonth='';}}
 catch(e){state.error=e.message;}
 finally{state.loading=false;render();}
}
function statusBadge(status){return `<span pgs="badge" class="status-badge" data-status="${SocialPostFilters.statusTone(status)}">${escape(status||'Non indicato')}</span>`;}
function renderPostRow(d){
 const status=d.status||'Non indicato',date=d.date?formatDate(d.date):'Da definire';
 const topic=d.topic?.trim()?`<span pgs="flex['row' 'itemCenter' 'gapDetails' 'nowrap']" class="post-topic" title="Argomento: ${escape(d.topic)}">${icon('tag')}<span pgs="visuallyHidden">Argomento: </span><span pgs="truncate" class="post-topic-text">${escape(d.topic)}</span></span>`:'';
 const id=d.id!==null&&d.id!==''?`<span>ID ${escape(d.id)}</span>`:'';
 return `<article pgs="flex['row' 'itemCenter' 'justifyBetween' 'gapParagraphs']" class="draft-item" data-channel="${escape(d.channel)}"><div pgs="flex['row' 'itemStart' 'gapParagraphs' 'nowrap']" class="post-body post-summary" data-details="${escape(d.key)}" title="Visualizza dettagli del post"><span class="post-social-icon" role="img" aria-label="${escape(d.channel)}" title="${escape(d.channel)}">${socialIcon(d.channel)}</span><div pgs="flex['column' 'gapDetails']" class="post-heading"><h2 pgs="h6"><button class="post-title-button" type="button">${escape(d.title)}</button></h2>${topic||id?`<p pgs="flex['row' 'itemCenter' 'gapParagraphs']" class="draft-meta post-details">${topic}${id}</p>`:''}</div></div><div pgs="flex['row' 'wrap' 'itemCenter' 'gapDetails']" class="post-actions"><button pgs="button['btnMini']" class="status-action" data-status="${SocialPostFilters.statusTone(d.status)}" data-change-status="${escape(d.key)}" type="button" aria-label="Cambia stato: ${escape(status)}" title="Cambia stato" ${disabled(state.loading)}>${escape(status)}</button><button pgs="button['btnMini']" class="date-action" data-change-date="${escape(d.key)}" type="button" aria-label="Aggiorna data: ${escape(date)}" title="Aggiorna data" ${disabled(state.loading)}>${icon('calendar')}<span>${escape(date)}</span></button><button pgs="button['btnIconOnly' 'btnMini']" data-draft="${escape(d.key)}" type="button" aria-label="Modifica" title="Modifica" ${disabled(state.loading)}>${icon('pencil')}</button></div></article>`;
}
function renderPostGroup(group){
 const first=group.posts[0],channels=group.posts.map(post=>post.channel);
 const icons=group.posts.map(post=>`<span class="post-social-icon" data-channel="${escape(post.channel)}" aria-hidden="true">${socialIcon(post.channel)}</span>`).join('');
 return `<div pgs="accordion['accOpenBox']" class="post-group" data-group-key="${escape(group.key)}" ${state.expandedGroups.has(group.key)?'pgs-state="open"':''}><button pgs="accordion-button" class="group-summary" type="button"><span pgs="flex['row' 'itemStart' 'gapParagraphs' 'nowrap']" class="post-body"><span class="post-icon-stack" role="img" aria-label="${escape(channels.join(', '))}">${icons}</span><span pgs="flex['column' 'gapDetails']" class="post-heading"><span pgs="h6" class="group-title">${escape(first.title)}</span><span class="draft-meta post-details">ID ${escape(first.id)} · ${group.posts.length} social</span></span></span></button><div pgs="accordion-content flex['column']" class="group-children" ${state.expandedGroups.has(group.key)?'':'hidden'}>${group.posts.map(renderPostRow).join('')}</div></div>`;
}
function renderDrafts(){
 const all=state.listMode==='posts',today=localToday(),year=today.slice(0,4);
 const years=[...new Set([year,...state.years.map(String),...state.drafts.map(d=>String(d.year))])].sort().reverse();
 if(!years.includes(state.filterYear))state.filterYear=year;
 const statuses=[...new Set([...STATUSES,...state.drafts.map(d=>d.status.trim().toLowerCase()).filter(Boolean)])].filter(status=>!state.hidePublished||status!=='pubblicato');
 const items=state.drafts.filter(d=>SocialPostFilters.matchesPost(d,{year:state.filterYear,channels:state.filterChannels,status:state.filterStatus,month:state.filterMonth,hidePublished:state.hidePublished}));
 const channels=['Facebook','LinkedIn','Instagram'];
 const chips=`<fieldset pgs="chips" class="channel-chips"><legend pgs="visuallyHidden">Filtra per canale</legend>${channels.map(channel=>`<label pgs="button['btnMini' 'btnTwoState']" class="channel-chip" data-channel="${channel}"><input type="checkbox" data-channel-filter="${channel}" ${state.filterChannels.includes(channel)?'checked':''} ${disabled(state.loading)}>${socialIcon(channel)}<span>${channel}</span></label>`).join('')}</fieldset>`;
 const select=(id,label,options,extra='')=>`<label pgs="flex['column']" class="toolbar-field"><span pgs="label">${label}</span><select pgs="select" id="${id}" ${extra} ${disabled(state.loading)}>${options}</select></label>`;
 const toolbar=`<div pgs="form flex['row' 'wrap' 'itemEnd' 'gapParagraphs']" class="posts-toolbar">${select('filter-year','Anno',years.map(y=>`<option ${state.filterYear===y?'selected':''}>${y}</option>`).join(''))}${select('filter-status','Stato',`<option value="">Tutti gli stati</option>${statuses.map(status=>`<option value="${escape(status)}" ${state.filterStatus===status?'selected':''}>${escape(status)}</option>`).join('')}<option value="__none" ${state.filterStatus==='__none'?'selected':''}>Non indicato</option>`,`class="status-filter" data-status="${state.filterStatus?SocialPostFilters.statusTone(state.filterStatus):'all'}"`)}${select('filter-month','Mese',`<option value="">Tutti i mesi</option>${MONTHS.map((name,index)=>{const value=String(index+1).padStart(2,'0');return `<option value="${value}" ${state.filterMonth===value?'selected':''}>${name}</option>`;}).join('')}`)}<label pgs="toggle" class="group-toggle"><span>Raggruppa per ID</span><input type="checkbox" id="group-by-id" ${state.groupById?'checked':''} ${disabled(state.loading)}></label></div>`;
 const groups=state.groupById?SocialPostFilters.groupById(items):items.map(post=>({key:post.key,posts:[post]}));
 const rows=groups.map(group=>group.posts.length>1?renderPostGroup(group):renderPostRow(group.posts[0])).join('');
 const empty=`<div pgs="alert['alertInfo']" class="empty-state"><i pgs="icon['icon-circleInfo'] alert-icon" aria-hidden="true"></i><div pgs="alert-content"><p>${state.filterChannels.length?'Nessun post per questi filtri.':'Seleziona almeno un social per visualizzare i post.'}</p></div></div>`;
 main.innerHTML=`<div pgs="flex['row' 'itemCenter' 'gapParagraphs']" class="list-heading"><h1 pgs="h2">${all?'Tutti i post':'Post in bozza'}</h1><button pgs="button['btnIconOnly']" id="refresh" type="button" aria-label="Aggiorna elenco" title="Aggiorna elenco" ${disabled(state.loading)}>${icon('refresh')}</button></div><p class="lead list-intro">${all?'Pubblicati e bozze. Modifica i dati del singolo social.':'Tutti i post non ancora pubblicati. Li trovi tutti, anche pubblicati, in Tutti i post.'}</p>${chips}${toolbar}${noticeBox()}<p class="draft-count"><span pgs="badge['badgeNeutral']">${items.length} post</span></p><div pgs="flex['column']" class="draft-list">${rows||empty}</div>${errorBox()}`;
 footer.innerHTML=`<button pgs="button['btnTransparent']" id="home" type="button" ${disabled(state.loading)}>${icon('arrowLeft')}<span>Torna alla home</span></button>`;
 enhance(main);
 document.getElementById('home').addEventListener('click',goHome);
 document.getElementById('refresh').addEventListener('click',()=>loadList(state.listMode));
 document.getElementById('group-by-id')?.addEventListener('change',event=>{state.groupById=event.target.checked;render();document.getElementById('group-by-id')?.focus({preventScroll:true});});
 // l'accordion di myPgs scrive pgs-state="open": lo si legge dopo il suo listener per ricordare i gruppi aperti
 main.querySelectorAll('[data-group-key]').forEach(group=>group.querySelector('[pgs~="accordion-button"]')?.addEventListener('click',()=>{const open=globalThis.pgs?globalThis.pgs(group).state.contains('open'):false;if(open)state.expandedGroups.add(group.dataset.groupKey);else state.expandedGroups.delete(group.dataset.groupKey);}));
 document.getElementById('filter-year').addEventListener('change',e=>{state.filterYear=e.target.value;render();});
 document.getElementById('filter-status').addEventListener('change',e=>{state.filterStatus=e.target.value;render();});
 document.getElementById('filter-month').addEventListener('change',e=>{state.filterMonth=e.target.value;render();});
 main.querySelectorAll('[data-channel-filter]').forEach(input=>input.addEventListener('change',()=>{
  const channel=input.dataset.channelFilter;
  state.filterChannels=input.checked?[...new Set([...state.filterChannels,channel])]:state.filterChannels.filter(c=>c!==channel);render();
  main.querySelector(`[data-channel-filter="${channel}"]`)?.focus({preventScroll:true});
 }));
 main.querySelectorAll('[data-details]').forEach(summary=>summary.addEventListener('click',()=>{
  const post=state.drafts.find(d=>d.key===summary.dataset.details);
  if(post)openPostDetails(post,summary.querySelector('.post-title-button'));
 }));
 main.querySelectorAll('[data-change-status]').forEach(button=>button.addEventListener('click',()=>{
  const post=state.drafts.find(d=>d.key===button.dataset.changeStatus);if(post)openStatusModal(post,button);
 }));
 main.querySelectorAll('[data-change-date]').forEach(button=>button.addEventListener('click',()=>{
  const post=state.drafts.find(d=>d.key===button.dataset.changeDate);if(post)openDateModal(post,button);
 }));
 main.querySelectorAll('[data-draft]').forEach(button=>button.addEventListener('click',async()=>{
  if(state.loading)return;
  state.editReturn={route:state.listMode,scrollY:window.scrollY};
  state.selected=state.drafts.find(d=>d.key===button.dataset.draft);
  const d=state.selected;state.loading=true;button.disabled=true;
  let editable=null,note='';
  try{
   const details=await call('details',{key:d.key,revision:state.revision});
   editable=details.editableText;
   if(!editable)note=details.textMessage||'Il file di testo principale non è individuabile: controlla i file nella cartella Sorgenti.';
  }catch(e){note=e.message;}
  state.editValues={title:d.title,topic:d.topic,format:d.format,status:d.status,undefinedDate:!d.date,date:d.date||(d.year===new Date().getFullYear()?localToday():d.year+'-01-01')};
  if(editable){state.editValues.postText=editable.content.replace(/\r\n/g,'\n');state.editValues.textName=editable.name;state.editValues.textRevision=editable.revision;}
  state.editOriginal={...state.editValues};
  state.editTextNote=note;state.error='';state.loading=false;state.route='edit-post';render();window.scrollTo({top:0});
 }));
}
// il menu compatto dell'header è una modale myPgs dentro <header>: non blocca la navigazione
const anyModalOpen=()=>[...document.querySelectorAll('dialog[open]')].some(dialog=>!dialog.closest('header'));
const closeCompactMenu=()=>{const menu=document.getElementById('compact-menu');if(menu)globalThis.pgs?.modal.api(menu)?.close();};
function postHeading(post,id){return `<p id="${id}" pgs="flex['column' 'gapDetails']"><strong>${escape(post.title)}</strong><span pgs="flex['row' 'itemCenter' 'gapDetails']" class="hint">${socialIcon(post.channel)}${escape(post.channel)} · ${post.year}</span></p>`;}
// pallino colorato dello stato: la select box di myPgs disegna il <template> prima del testo dell'opzione
const statusDot=status=>`<template><span class="status-dot" data-status="${SocialPostFilters.statusTone(status)}" aria-hidden="true"></span></template>`;
function openStatusModal(post,opener){
 if(anyModalOpen())return;
 const mode=state.listMode,scrollY=window.scrollY,current=post.status.trim().toLowerCase();
 const initial=STATUSES.includes(current)?current:'';
 const body=`${postHeading(post,'status-modal-post')}<div pgs="flex['column']"><label pgs="label" for="quick-status">Nuovo stato</label><div pgs="selectBox" class="status-select"><select pgs="select" id="quick-status" required>${initial?'':`<option value="" selected disabled hidden>${escape(post.status?'Attuale: '+post.status:'Scegli uno stato')}</option>`}${STATUSES.map(status=>`<option value="${status}" ${initial===status?'selected':''}>${statusDot(status)}${status}</option>`).join('')}</select></div></div><p class="hint">La modifica riguarda solo ${escape(post.channel)}.</p><div id="status-error" role="alert" hidden></div><div pgs="flex['row' 'justifyEnd' 'gapParagraphs']"><button pgs="button" id="status-cancel" type="button">Annulla</button><button pgs="button['btnStrong']" id="status-save" type="submit" disabled>Salva stato</button></div>`;
  const modal=createModal({title:'Cambia stato',titleId:'status-modal-title',describedBy:'status-modal-post',body,form:true,onClose:()=>{document.body.classList.remove('status-modal-open');if(opener.isConnected)opener.focus({preventScroll:true});}});
 modal.dialog.id='status-modal';
 document.body.classList.add('status-modal-open');
 const select=modal.dialog.querySelector('#quick-status'),save=modal.dialog.querySelector('#status-save'),message=modal.dialog.querySelector('#status-error');
 function changed(){return!!select.value&&select.value!==current;}
 function busy(value){modal.busy=value;state.loading=value;modal.dialog.querySelectorAll('button,select').forEach(el=>{el.disabled=value;});save.disabled=value||!changed();save.textContent=value?'Salvataggio…':'Salva stato';modal.dialog.setAttribute('aria-busy',String(value));}
 modal.dialog.querySelector('#status-cancel').addEventListener('click',()=>modal.close());
 select.addEventListener('change',()=>{select.dataset.status=SocialPostFilters.statusTone(select.value);save.disabled=!changed();setAlert(message,'');});
 modal.dialog.querySelector('form').addEventListener('submit',async event=>{
  event.preventDefault();if(modal.busy||!changed()||!select.reportValidity())return;
  const request={key:post.key,revision:state.revision,status:select.value};setAlert(message,'');busy(true);
  try{
   const result=await call('updateStatus',request);if(result.canceled)return;
   state.notice=`Stato aggiornato per ${result.channel}: ${result.status}.${mode==='drafts'&&result.status==='pubblicato'?' Lo trovi in Tutti i post.':''}`;
   busy(false);modal.close();await loadList(mode);window.scrollTo({top:scrollY});main.querySelector(`[data-change-status="${post.key}"]`)?.focus({preventScroll:true});
  }catch(e){setAlert(message,e.message);}
  finally{if(modal.dialog.isConnected)busy(false);else state.loading=false;}
 });
 modal.open();(modal.dialog.querySelector('[pgs~="_selectBox-button"]')||select).focus();
}
function detailsMetadata(post){
 const postFolder=post.sourcesRelative?.replace(/\\/g,'/').replace(/\/01_Sorgenti\/?$/,'');
 const folderLink=postFolder&&postFolder!==post.sourcesRelative?`<a href="#" class="details-file-link details-folder-link" data-open-post-folder title="Apri la cartella del post" aria-label="Apri la cartella del post: ${escape(postFolder)}"><span>${escape(postFolder)}</span>${icon('externalLink')}</a>`:'Collegamento non indicato';
 return `<h3 pgs="h5" class="details-post-title" id="details-post-title">${escape(post.title)}</h3><dl pgs="box['boxMini']" class="review details-grid"><dt>ID post</dt><dd>${post.id!==null&&post.id!==''?escape(post.id):'Non assegnato'}</dd><dt>Canale</dt><dd pgs="flex['row' 'itemCenter' 'gapDetails']" class="details-channel" data-channel="${escape(post.channel)}">${socialIcon(post.channel)}<span>${escape(post.channel)}</span></dd><dt>Anno</dt><dd>${post.year}</dd><dt>Pubblicazione</dt><dd>${post.date?escape(formatDate(post.date)):'Da definire'}</dd><dt>Argomento</dt><dd>${escape(post.topic||'Non indicato')}</dd><dt>Formato</dt><dd>${escape(post.format||'Non indicato')}</dd><dt>Stato</dt><dd>${statusBadge(post.status)}</dd><dt>Cartella post</dt><dd class="details-source">${folderLink}<div id="details-folder-error" role="alert" hidden></div></dd></dl>`;
}
function openPostDetails(post,opener){
 if(anyModalOpen())return;
 let disposeArtwork=()=>{};
 const body=`<section id="details-metadata" pgs="flex['column' 'gapParagraphs']">${detailsMetadata(post)}</section><section pgs="flex['column' 'gapParagraphs']" class="details-text-section" aria-label="Testo del post"><h3 pgs="h5">Testo del post</h3><div id="details-text" pgs="flex['column' 'gapParagraphs']" aria-live="polite"><p class="hint">Caricamento del testo…</p></div></section><section pgs="flex['column' 'gapParagraphs']" class="details-text-section details-artwork-section" aria-label="Grafica del post"><h3 pgs="h5">Grafica del post</h3><div id="details-artwork" pgs="flex['column' 'gapParagraphs']"></div></section><div pgs="flex['row' 'justifyEnd']"><button pgs="button" id="details-done" type="button">Chiudi</button></div>`;
 const modal=createModal({title:'Dettagli post',titleId:'details-modal-title',describedBy:'details-post-title',body,size:'dialogMedium',onClose:()=>{disposeArtwork();document.body.classList.remove('details-modal-open');if(opener?.isConnected)opener.focus({preventScroll:true});}});
 const dialog=modal.dialog;dialog.id='post-details-modal';dialog.classList.add('post-details-modal');
 document.body.classList.add('details-modal-open');
 dialog.querySelector('#details-done').addEventListener('click',()=>modal.close());
 let openingFolder=false;
 dialog.addEventListener('click',async event=>{
  const link=event.target.closest?.('[data-open-post-folder]');if(!link)return;
  event.preventDefault();if(openingFolder)return;
  openingFolder=true;link.setAttribute('aria-disabled','true');
  const box=dialog.querySelector('#details-folder-error');setAlert(box,'');
  try{await call('openPostFolder',{key:post.key,revision:state.revision});}
  catch(e){if(box.isConnected)setAlert(box,e.message);}
  finally{openingFolder=false;link.removeAttribute('aria-disabled');}
 });
 modal.open();dialog.querySelector('[data-modal-x]').focus();
 disposeArtwork=SocialIllustratorPreview.mount(dialog.querySelector('#details-artwork'),{key:post.key,revision:state.revision},call);
 call('details',{key:post.key,revision:state.revision}).then(result=>{
  if(!dialog.isConnected)return;
  dialog.querySelector('#details-metadata').innerHTML=detailsMetadata(result.post);
  const container=dialog.querySelector('#details-text');container.replaceChildren();
  if(result.textMessage){const note=document.createElement('p');note.className='hint details-note';note.textContent=result.textMessage;container.appendChild(note);}
  for(const file of result.textFiles){
   const block=document.createElement('section');block.className='details-text-file';block.setAttribute('pgs',"box['boxMini'] flex['column' 'gapParagraphs']");
   const head=document.createElement('div');head.setAttribute('pgs',"flex['row' 'wrap' 'itemCenter' 'justifyBetween' 'gapParagraphs']");
   const name=document.createElement('a');name.className='details-filename details-file-link';name.href='#';name.title='Apri il file di testo';name.setAttribute('aria-label','Apri '+file.name);
   const label=document.createElement('span');label.textContent=file.name;name.appendChild(label);
   name.insertAdjacentHTML('beforeend',icon('externalLink'));
   const openingError=document.createElement('div');openingError.setAttribute('role','alert');openingError.hidden=true;
   let opening=false;name.addEventListener('click',async event=>{event.preventDefault();if(opening)return;opening=true;name.setAttribute('aria-disabled','true');setAlert(openingError,'');try{await call('openText',{key:post.key,revision:state.revision,name:file.name});}catch(e){setAlert(openingError,e.message);}finally{opening=false;name.removeAttribute('aria-disabled');}});
   head.appendChild(name);block.append(head,openingError);
   const content=document.createElement('div');content.className='details-text md-content';content.setAttribute('pgs','list');
   if(file.message||file.content===''){content.classList.add('details-text-empty');content.textContent=file.message||'Il file di testo è vuoto.';}
   else{
    SocialMarkdown.renderInto(content,file.content);
    const copy=document.createElement('button');copy.type='button';copy.setAttribute('pgs',"button['btnMini']");copy.className='details-copy';copy.innerHTML=`${icon('copy')}<span>Copia per i social</span>`;
    copy.title='Copia il testo con grassetto e barrato visibili su Facebook, Instagram e LinkedIn';
    copy.addEventListener('click',()=>copySocialText(file.content,copy));
    head.appendChild(copy);
   }
   block.appendChild(content);container.appendChild(block);
  }
 }).catch(e=>{if(!dialog.isConnected)return;const container=dialog.querySelector('#details-text');container.replaceChildren();const box=document.createElement('div');box.setAttribute('role','alert');container.appendChild(box);setAlert(box,e.message);});
}
function openDateModal(post,opener){
 if(document.getElementById('date-modal')||anyModalOpen())return;
 const mode=state.listMode,scrollY=window.scrollY;
 const initial=post.date||(post.year===new Date().getFullYear()?localToday():post.year+'-01-01');
 const body=`${postHeading(post,'date-modal-post')}${field('Data pubblicazione',`<input pgs="input" type="date" id="draft-date" required min="${post.year}-01-01" max="${post.year}-12-31" value="${escape(initial)}">`,`La modifica riguarda solo ${escape(post.channel)}.`)}<div id="date-modal-error" role="alert" hidden></div><div pgs="flex['row' 'justifyEnd' 'gapParagraphs']"><button pgs="button" id="date-modal-cancel" type="button">Annulla</button><button pgs="button['btnStrong']" id="date-modal-save" type="submit">Salva data</button></div>`;
 const modal=createModal({title:'Aggiorna data',titleId:'date-modal-title',describedBy:'date-modal-post',body,form:true,onClose:()=>{document.body.classList.remove('date-modal-open');state.selected=null;if(opener.isConnected)opener.focus({preventScroll:true});}});
 modal.dialog.id='date-modal';
 document.body.classList.add('date-modal-open');
 const input=modal.dialog.querySelector('#draft-date'),save=modal.dialog.querySelector('#date-modal-save'),message=modal.dialog.querySelector('#date-modal-error');
 function busy(value){modal.busy=value;state.loading=value;modal.dialog.querySelectorAll('button,input').forEach(el=>{el.disabled=value;});save.textContent=value?'Salvataggio…':'Salva data';modal.dialog.setAttribute('aria-busy',String(value));}
 modal.dialog.querySelector('#date-modal-cancel').addEventListener('click',()=>modal.close());
 input.addEventListener('input',()=>setAlert(message,''));
 modal.dialog.querySelector('form').addEventListener('submit',async event=>{
  event.preventDefault();if(modal.busy||!input.reportValidity())return;
  const request={key:post.key,revision:state.revision,date:input.value};setAlert(message,'');busy(true);
  try{
   const plan=await call('planDate',request);
   const result=await call('updateDate',request,plan.fingerprint);
   if(result.canceled)return;
   state.notice=`Data aggiornata per ${result.channel}: ${formatDate(result.date)}.`;
   busy(false);modal.close();await loadList(mode);
   window.scrollTo({top:scrollY});
   main.querySelector(`[data-change-date="${post.key}"]`)?.focus({preventScroll:true});
  }catch(e){setAlert(message,e.message);}
  finally{if(modal.dialog.isConnected)busy(false);else state.loading=false;}
 });
 modal.open();input.focus();
}
function editInput(){return{key:state.selected.key,revision:state.revision,...state.editValues};}
function editOptions(current,values){return [...new Set([current,...values])].map(value=>`<option value="${escape(value)}" ${value===current?'selected':''}>${escape(value||'Non indicato')}</option>`).join('');}
function openTextConflictModal(){
 if(anyModalOpen())return;
 const v=state.editValues,d=state.selected,opener=document.getElementById('save-post');
 const body=`<div class="conflict-body" pgs="flex['column' 'gapParagraphs']"><p>Mentre lavoravi, un'altra persona ha modificato e salvato <strong>${escape(v.textName)}</strong>. Le tue modifiche non sono state salvate, per non sovrascrivere il suo lavoro.</p><p>Vuoi salvare il tuo testo in una copia di sicurezza? Verrà messa in <strong>01_Sorgenti/Copie di sicurezza</strong> e il file dell'altra persona resterà com'è. Poi l'editor mostrerà il testo aggiornato, mantenendo le altre modifiche (titolo, data, stato…).</p></div><div role="alert" id="conflict-error" hidden></div><div pgs="flex['row' 'wrap' 'justifyEnd' 'gapParagraphs']" class="conflict-actions"><button pgs="button" type="button" data-cancel>Annulla</button><button pgs="button['btnStrong']" type="button" id="conflict-save">${icon('save')}<span>Salva copia di sicurezza</span></button></div>`;
 const modal=createModal({title:'Qualcun altro ha modificato il testo',titleId:'conflict-title',body,size:'dialogMedium',onClose:()=>opener?.focus()});
 const dialog=modal.dialog;dialog.classList.add('conflict-modal');
 dialog.querySelectorAll('[data-cancel]').forEach(button=>button.addEventListener('click',()=>modal.close()));
 const save=dialog.querySelector('#conflict-save'),errorBox=dialog.querySelector('#conflict-error');
 save.addEventListener('click',async()=>{
  if(modal.busy)return;modal.busy=true;save.disabled=true;save.textContent='Salvataggio…';setAlert(errorBox,'');
  dialog.querySelectorAll('[data-cancel],[data-modal-x]').forEach(button=>button.disabled=true);
  try{
   const result=await call('saveTextBackup',{key:d.key,revision:state.revision,textName:v.textName,content:v.postText});
   const details=await call('details',{key:d.key,revision:state.revision});
   const fresh=details.editableText;
   if(fresh){
    v.postText=fresh.content.replace(/\r\n/g,'\n');v.textName=fresh.name;v.textRevision=fresh.revision;
    Object.assign(state.editOriginal,{postText:v.postText,textName:v.textName,textRevision:v.textRevision});
   }
   render();
   dialog.querySelector('.conflict-body').innerHTML=alertHtml('success',`Copia salvata: ${result.relative}.`)+`<p>${fresh?"L'editor ora mostra il testo aggiornato dall'altra persona. Le altre modifiche non salvate sono state mantenute: controlla e premi Salva modifiche.":'Non riesco a ricaricare il testo aggiornato: torna all’elenco e riapri il post.'}</p>`;
   dialog.querySelector('#conflict-title').textContent='Copia di sicurezza salvata';
   dialog.querySelector('.conflict-actions').innerHTML=`<button pgs="button" type="button" id="conflict-open-backup">${icon('externalLink')}<span>Apri copia di sicurezza</span></button>${fresh?`<button pgs="button" type="button" id="conflict-open-original">${icon('externalLink')}<span>Apri file originale</span></button>`:''}<button pgs="button['btnStrong']" type="button" id="conflict-done">Ho capito</button>`;
   const openWith=async(button,method,name)=>{if(button.disabled)return;button.disabled=true;setAlert(errorBox,'');try{await call(method,{key:d.key,revision:state.revision,name});}catch(e){setAlert(errorBox,e.message);}finally{button.disabled=false;}};
   const backupButton=dialog.querySelector('#conflict-open-backup');backupButton.addEventListener('click',()=>openWith(backupButton,'openTextBackup',result.name));
   const originalButton=dialog.querySelector('#conflict-open-original');originalButton?.addEventListener('click',()=>openWith(originalButton,'openText',fresh.name));
   modal.busy=false;dialog.querySelector('#conflict-done').addEventListener('click',()=>modal.close());dialog.querySelector('#conflict-done').focus();
   dialog.querySelector('[data-modal-x]').disabled=false;
  }catch(e){modal.busy=false;save.disabled=false;save.innerHTML=`${icon('save')}<span>Salva copia di sicurezza</span>`;dialog.querySelectorAll('[data-cancel],[data-modal-x]').forEach(button=>button.disabled=false);setAlert(errorBox,e.message);}
 });
 modal.open();save.focus();
}
// Creazione iniziata e non conclusa: social scelti o campi compilati.
function createDirty(){
 if(state.route!=='create'||state.result)return false;
 const p=state.post;
 return p.channels.length>0||!!p.title.trim()||!!p.topic.trim()||Object.values(p.channelFormats).some(Boolean);
}
// Prima di lasciare la pagina corrente: conferma se ci sono dati non salvati.
async function confirmLeave(){
 if(state.route==='edit-post')return confirmEditExit();
 if(createDirty())return confirmDiscardEdit('Uscire dalla creazione?','I dati inseriti per il nuovo post andranno persi. Nessun file e nessuna riga Excel sono stati creati.');
 return true;
}
function confirmDiscardEdit(title='Uscire senza salvare?',text='Le modifiche a questo post andranno perse.'){
 return new Promise(resolve=>{
  const body=`<p>${escape(text)}</p><div pgs="flex['row' 'justifyEnd' 'gapParagraphs']"><button pgs="button" id="stay-edit" type="button">Resta qui</button><button pgs="button" class="danger" id="discard-edit" type="button">Esci senza salvare</button></div>`;
  const modal=createModal({title,titleId:'discard-edit-title',body,closable:false,onClose:value=>resolve(value==='discard')});
  modal.dialog.querySelector('#stay-edit').addEventListener('click',()=>modal.close('stay'));
  modal.dialog.querySelector('#discard-edit').addEventListener('click',()=>modal.close('discard'));
  modal.open();modal.dialog.querySelector('#stay-edit').focus();
 });
}
async function leavePostEdit(){
 if(state.loading||!await confirmEditExit())return;
 const previous=state.editReturn;
 state.route=previous?.route||state.listMode;state.error='';render();
 requestAnimationFrame(()=>window.scrollTo(0,previous?.scrollY||0));
}
async function confirmEditExit(){
 const changed=Object.keys(state.editOriginal||{}).some(name=>state.editValues[name]!==state.editOriginal[name]);
 return !changed||await confirmDiscardEdit();
}
const markdownButtons=[
 {command:'h1',label:'H1',title:'Titolo grande (H1)'},{command:'h2',label:'H2',title:'Titolo medio (H2)'},{command:'h3',label:'H3',title:'Titolo piccolo (H3)'},{command:'p',label:'Testo',title:'Testo normale'},
 {command:'bold',label:'<strong>B</strong>',title:'Grassetto (⌘/Ctrl+B)'},{command:'italic',label:'<em>I</em>',title:'Corsivo (⌘/Ctrl+I)'},{command:'strike',label:'<s>S</s>',title:'Barrato'},
 {command:'list',label:icon('list'),title:'Elenco puntato'}
];
function markdownToolbar(){
 const groups=[[0,4],[4,7],[7,8]];
 return `<div pgs="flex['row' 'wrap' 'itemCenter' 'gapParagraphs']" class="md-toolbar" role="toolbar" aria-label="Formattazione del testo">${groups.map(([a,b])=>`<div pgs="flex['row' 'gapDetails']" class="md-toolbar-group">${markdownButtons.slice(a,b).map(button=>`<button pgs="button['btnMini' 'btnPaddingEqual' 'btnCurrent']" class="md-tool" type="button" data-md="${button.command}" title="${button.title}" aria-label="${button.title}" aria-pressed="false" ${disabled(state.loading)}>${button.label}</button>`).join('')}</div>`).join('')}<button pgs="button['btnMini']" class="md-copy" type="button" id="copy-social" title="Copia il testo con grassetto e barrato visibili su Facebook, Instagram e LinkedIn" ${disabled(state.loading)}>${icon('copy')}<span>Copia per i social</span></button></div>`;
}
async function copySocialText(markdown,button){
 const label=button.innerHTML;button.disabled=true;
 try{await call('copyText',SocialMarkdown.toSocialText(markdown));button.textContent='Copiato ✓';}
 catch(e){button.textContent='Copia non riuscita';}
 setTimeout(()=>{if(button.isConnected){button.innerHTML=label;button.disabled=false;}},1600);
}
function currentBlock(area){
 const selection=document.getSelection();let node=selection&&selection.anchorNode;
 while(node&&node!==area){if(node.nodeType===1&&/^(H1|H2|H3|LI|DIV|P)$/.test(node.tagName))return node;node=node.parentNode;}
 return null;
}
// posizione del cursore contata dalla fine della riga, che non cambia quando la riga diventa titolo o elenco
function caretFromEnd(area){
 const selection=document.getSelection();if(!selection?.rangeCount||!selection.isCollapsed)return null;
 const block=currentBlock(area);if(!block)return null;
 const range=document.createRange();range.setStart(selection.anchorNode,selection.anchorOffset);range.setEnd(block,block.childNodes.length);
 return range.toString().length;
}
function restoreCaret(area,fromEnd){
 if(fromEnd===null)return;const block=currentBlock(area);if(!block)return;
 let target=Math.max(0,block.textContent.length-fromEnd);
 const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT),range=document.createRange();let node,placed=false;
 while((node=walker.nextNode())){if(target<=node.length){range.setStart(node,target);placed=true;break;}target-=node.length;}
 if(!placed){range.selectNodeContents(block);}
 range.collapse(placed);const selection=document.getSelection();selection.removeAllRanges();selection.addRange(range);
}
function updateMarkdownToolbar(area){
 const toolbar=area.parentElement.querySelector('.md-toolbar');if(!toolbar)return;
 const selection=document.getSelection(),inside=selection&&area.contains(selection.anchorNode);
 const block=inside?currentBlock(area):null,tag=block?.tagName||'';
 const states={bold:inside&&document.queryCommandState('bold'),italic:inside&&document.queryCommandState('italic'),strike:inside&&document.queryCommandState('strikeThrough'),h1:tag==='H1',h2:tag==='H2',h3:tag==='H3',list:tag==='LI'};
 toolbar.querySelectorAll('[data-md]').forEach(button=>button.setAttribute('aria-pressed',String(!!states[button.dataset.md])));
}
function setupMarkdownEditor(area,v){
 SocialMarkdown.renderInto(area,v.postText);
 const sync=()=>{v.postText=SocialMarkdown.fromElement(area);error('');updateMarkdownToolbar(area);};
 area.addEventListener('focus',()=>{document.execCommand('defaultParagraphSeparator',false,'div');document.execCommand('styleWithCSS',false,false);});
 area.addEventListener('input',sync);
 area.addEventListener('keyup',()=>updateMarkdownToolbar(area));area.addEventListener('mouseup',()=>updateMarkdownToolbar(area));
 // Incolla: niente HTML esterno; il Markdown incollato viene formattato.
 area.addEventListener('paste',event=>{
  event.preventDefault();const text=(event.clipboardData?.getData('text/plain')||'').replace(/\r\n?/g,'\n');if(!text)return;
  const holder=document.createElement('div');SocialMarkdown.renderInto(holder,text);
  const html=!text.includes('\n')&&holder.childElementCount===1&&holder.firstElementChild.tagName==='DIV'?holder.firstElementChild.innerHTML:holder.innerHTML;
  document.execCommand('insertHTML',false,html);sync();
 });
 area.addEventListener('drop',event=>event.preventDefault());
 const toolbar=area.parentElement.querySelector('.md-toolbar');
 toolbar.querySelectorAll('[data-md]').forEach(button=>{
  button.addEventListener('mousedown',event=>event.preventDefault());
  button.addEventListener('click',()=>{
   if(state.loading)return;
   if(!area.contains(document.getSelection()?.anchorNode)){area.focus();const range=document.createRange();range.selectNodeContents(area);range.collapse(false);const s=document.getSelection();s.removeAllRanges();s.addRange(range);}
   document.execCommand('defaultParagraphSeparator',false,'div');document.execCommand('styleWithCSS',false,false);
   const command=button.dataset.md,tag=currentBlock(area)?.tagName||'';
   // i comandi di blocco di Chromium riportano il cursore all'inizio della riga: lo rimettiamo dov'era
   const fromEnd=['bold','italic','strike'].includes(command)?null:caretFromEnd(area);
   if(command==='bold')document.execCommand('bold');
   else if(command==='italic')document.execCommand('italic');
   else if(command==='strike')document.execCommand('strikeThrough');
   else if(command==='list')document.execCommand('insertUnorderedList');
   else if(command==='p')document.execCommand('formatBlock',false,'div');
   else{if(tag==='LI')document.execCommand('insertUnorderedList');document.execCommand('formatBlock',false,tag===command.toUpperCase()?'div':command);}
   restoreCaret(area,fromEnd);
   sync();
  });
 });
 document.getElementById('copy-social')?.addEventListener('click',event=>copySocialText(v.postText,event.currentTarget));
}
function renderPostEdit(){
 const d=state.selected,v=state.editValues,busy=disabled(state.loading);
 const text=v.textName?`<div pgs="flex['column' 'gapParagraphs']" class="md-field">${markdownToolbar()}<div pgs="input list" class="post-text-input md-editor md-content" id="edit-post-text" contenteditable="${state.loading?'false':'true'}" role="textbox" aria-multiline="true" aria-labelledby="edit-post-text-label" spellcheck="true" ${state.loading?'aria-disabled="true"':''}></div><p class="hint">${escape(v.textName)} · Modifichi solo il testo di ${escape(d.channel)}. Usa i pulsanti per titoli, grassetto, corsivo, barrato ed elenchi.</p></div>`:alertHtml('warning',state.editTextNote||'Nessun file di testo modificabile presente nei Sorgenti.');
 main.innerHTML=`<div><button pgs="button['btnTransparent']" class="edit-back" id="back-posts" type="button" ${busy}>${icon('arrowLeft')}<span>Torna indietro</span></button></div><h1 pgs="h2">Modifica post</h1><p class="lead" pgs="flex['row' 'itemCenter' 'gapDetails']">${socialIcon(d.channel)}<span>${escape(d.channel)} · ${d.year}${d.id!==null&&d.id!==''?' · ID '+escape(d.id):''}</span></p><div pgs="form flex['column' 'gapElements']" class="edit-fields">${field('Titolo',`<input pgs="input" id="edit-title" maxlength="140" required placeholder=" " value="${escape(v.title)}" ${busy}>`)}${field('Argomento',`<input pgs="input" id="edit-topic" maxlength="200" placeholder=" " value="${escape(v.topic)}" ${busy}>`)}<div pgs="grid['column-2' 'gapParagraphs']">${field('Formato',`<select pgs="select" id="edit-format" ${busy}>${editOptions(v.format,FORMATS)}</select>`)}${field('Stato pubblicazione',`<select pgs="select" id="edit-status" ${busy}>${editOptions(v.status,STATUSES)}</select>`)}</div><div pgs="flex['column' 'gapParagraphs']">${field('Data pubblicazione',`<input pgs="input" id="edit-date" type="date" min="${d.year}-01-01" max="${d.year}-12-31" value="${escape(v.date)}" ${disabled(v.undefinedDate||state.loading)}>`,`La data deve rimanere nel ${d.year}.`)}<label pgs="checkbox"><input type="checkbox" id="edit-undefined" ${v.undefinedDate?'checked':''} ${busy}><span>Data da definire</span></label></div><div pgs="flex['column']"><span pgs="label" id="edit-post-text-label">Testo del post</span>${text}</div></div><section pgs="alert['alertError']" class="delete-post-section" aria-labelledby="delete-post-title"><i pgs="icon['icon-trash'] alert-icon" aria-hidden="true"></i><div pgs="alert-content flex['column' 'gapParagraphs']"><h2 pgs="alert-content-title h5" id="delete-post-title">Elimina post</h2><p>Rimuove la riga di ${escape(d.channel)} dal piano editoriale e sposta la sua cartella in <strong>00_cestino</strong>.</p><div><button pgs="button" class="danger" id="delete-post" type="button" ${busy}>${icon('trash')}<span>Elimina post</span></button></div></div></section>${errorBox()}`;
 footer.innerHTML=`<span></span><button pgs="button['btnStrong']" id="save-post" type="button" ${disabled(state.loading||!v.title.trim())}>${icon('save')}<span>${state.loading?'Attendi…':'Salva modifiche'}</span></button>`;
 document.getElementById('back-posts').addEventListener('click',leavePostEdit);
 for(const name of ['title','topic','format','status','date'])document.getElementById('edit-'+name).addEventListener('input',e=>{v[name]=e.target.value;document.getElementById('save-post').disabled=!v.title.trim();error('');});
 const textArea=document.getElementById('edit-post-text');
 if(textArea)setupMarkdownEditor(textArea,v);
 document.getElementById('edit-undefined').addEventListener('change',e=>{v.undefinedDate=e.target.checked;state.error='';render();});
 document.getElementById('delete-post').addEventListener('click',async()=>{
  if(state.loading)return;
  const request={key:d.key,revision:state.revision};state.loading=true;state.error='';render();
  try{
   const result=await call('deletePost',request);if(result.canceled)return;
   state.notice=`Post eliminato per ${result.channel}: ${result.title}. Cartella spostata in ${result.trashRelative}.`;state.loading=false;await loadList(state.listMode);return;
  }catch(e){state.error=e.message;}
  finally{state.loading=false;render();}
 });
 document.getElementById('save-post').addEventListener('click',async()=>{
  if(state.loading)return;
  state.loading=true;state.error='';render();
  try{
   const input=editInput(),plan=await call('planEdit',input);
   const result=await call('saveEdit',input,plan.fingerprint);
   if(result.canceled)return;
   state.notice=`Post aggiornato per ${result.channel}: ${result.changes.title}.`;state.loading=false;await loadList(state.listMode);return;
  }catch(e){if(e.code==='TEXT_CHANGED'&&v.textName){state.loading=false;render();openTextConflictModal();return;}state.error=e.message;}
  finally{state.loading=false;render();}
 });
}


document.getElementById('brand-home').addEventListener('click',event=>{event.preventDefault();closeCompactMenu();goHome();});
document.querySelectorAll('[data-nav]').forEach(link=>link.addEventListener('click',async event=>{
 event.preventDefault();if(state.loading||anyModalOpen())return;
 closeCompactMenu();
 if(!await confirmLeave())return;
 if(link.dataset.nav==='create'){startCreate();return;}
 await loadList(link.dataset.nav);window.scrollTo({top:0});
}));

render();
call('initial').then(result=>{state.version=result.version||'';state.root=result.root;state.rootValid=result.valid;state.error=result.valid?'':result.message||'';render();}).catch(e=>error(e.message));
