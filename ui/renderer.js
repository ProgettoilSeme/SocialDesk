'use strict';
const api=window.socialAPI;
const localToday=()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const initialPost=()=>({channels:[],title:'',topic:'',channelFormats:{},channelDates:{},year:String(new Date().getFullYear())});
const state={route:'home',step:0,visited:0,root:'',rootValid:false,post:initialPost(),plan:null,result:null,error:'',loading:false,drafts:[],revision:'',selected:null,notice:'',filterYear:String(new Date().getFullYear()),filterChannels:['Facebook','LinkedIn','Instagram'],filterStatus:'',filterMonth:'',groupById:true,hidePublished:true,expandedGroups:new Set(),years:[],listMode:'drafts',editValues:null,editOriginal:null,editReturn:null,settings:null};
const main=document.getElementById('main'),footer=document.getElementById('footer'),progress=document.getElementById('progress');
const actionIcons={
 topic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h10l8 8-9 9-9-9V4Z"/><circle cx="8" cy="9" r="1.2"/></svg>',
 edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M4 16.5V20h3.5L19 8.5 15.5 5 4 16.5Z"/><path d="m13.5 7 3.5 3.5"/></svg>',
 images:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="15" height="13" rx="2"/><circle cx="8" cy="10" r="1.5"/><path d="m3 16 4.5-4.5 4 4L14 13l4 4"/><path d="M7 3h12a2 2 0 0 1 2 2v10"/></svg>',
 refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.2 6.5"/><path d="M20 4v7h-7"/></svg>',
 chevron:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'
};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
 if(state.route==='home')return renderHome();
 if(state.route==='settings')return renderSettings();
 if(state.route==='drafts'||state.route==='posts')return renderDrafts();
 if(state.route==='edit-post')return renderPostEdit();
 renderWizard();
 if(!state.loading){const home=document.createElement('button');home.type='button';home.className='home-link';home.textContent='Torna alla home';home.addEventListener('click',goHome);footer.appendChild(home);}
}
function renderHeader(){
 const active=state.route==='home'||state.route==='settings'?'':state.route==='create'?'create':state.listMode;
 document.getElementById('brand-home').disabled=state.loading;
 document.querySelectorAll('[data-nav]').forEach(link=>{
  if(link.dataset.nav===active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  link.setAttribute('aria-disabled',String(state.loading));link.tabIndex=state.loading?-1:0;
 });
}
function startCreate(){
 if(state.loading)return;state.route='create';state.step=0;state.visited=0;state.post=initialPost();state.plan=null;state.result=null;state.error='';render();window.scrollTo({top:0});
}
function renderWizard(){
 progress.innerHTML=['Social','Post','Data','Riepilogo'].map((name,i)=>`<button class="step ${i===state.step?'current':i<state.step?'complete':''}" type="button" data-step="${i}" ${i>state.visited||state.loading||state.result?'disabled':''} ${i===state.step?'aria-current="step"':''}><span class="number">${i+1}</span><span>${name}</span></button>`).join('');
 if(state.result){renderSuccess();return;}
 let content='';
 if(state.step===0)content=`<h1>Dove vuoi pubblicare?</h1><p class="lead">Seleziona uno o più social per questo post.</p><div class="social-list">${['Facebook','Instagram','LinkedIn'].map(c=>`<label class="social-option"><input type="checkbox" name="social" value="${c}" ${state.post.channels.includes(c)?'checked':''}><span>${c}</span></label>`).join('')}</div>${state.rootValid?'':'<div class="create-settings-notice" role="alert"><p>La cartella Social non è configurata.</p><button class="btn" id="create-open-settings" type="button">Apri Impostazioni</button></div>'}`;
 if(state.step===1)content=`<h1>Di cosa parla il post?</h1><p class="lead">Titolo e argomento saranno uguali per i social selezionati. Scegli il formato per ciascuno.</p><div class="fields"><div class="field"><label for="title">Titolo</label><input class="text-input" id="title" maxlength="140" autocomplete="off" value="${escape(state.post.title)}"></div><div class="field"><label for="topic">Argomento <span class="optional">(facoltativo)</span></label><input class="text-input" id="topic" maxlength="200" autocomplete="off" value="${escape(state.post.topic)}"></div><div class="channel-dates channel-formats">${state.post.channels.map(channel=>{const id=channel.toLowerCase();return `<fieldset class="channel-date-card" data-channel="${channel}"><legend>${socialIcon(channel)}<span>${channel}</span></legend><div class="field"><label for="format-${id}">Formato</label><select class="select-input" id="format-${id}" data-channel-format="${channel}"><option value="">Scegli un formato</option>${['Immagine singola','Carosello','Video','Reel','Storia'].map(format=>`<option value="${format}" ${state.post.channelFormats[channel]===format?'selected':''}>${format}</option>`).join('')}</select></div></fieldset>`;}).join('')}</div></div>`;
 if(state.step===2){
  const allUndefined=state.post.channels.every(channel=>state.post.channelDates[channel]?.undefinedDate);
  content=`<h1>Quando vuoi pubblicare?</h1><p class="lead">Scegli la data per ogni social, oppure lasciala da definire.</p><div class="channel-dates">${state.post.channels.map(channel=>{const item=state.post.channelDates[channel],id=channel.toLowerCase();return `<fieldset class="channel-date-card" data-channel="${channel}"><legend>${socialIcon(channel)}<span>${channel}</span></legend><div class="field"><label for="date-${id}">Data pubblicazione</label><input class="text-input" type="date" id="date-${id}" data-channel-date="${channel}" value="${escape(item.date)}" ${item.undefinedDate?'disabled':''}></div><label class="check-line"><input type="checkbox" data-undefined-date="${channel}" ${item.undefinedDate?'checked':''}><span>Data da definire</span></label></fieldset>`;}).join('')}</div>${allUndefined?`<div class="field year-field"><label for="year">Anno</label><input class="text-input" id="year" type="number" inputmode="numeric" min="1900" max="9999" step="1" value="${escape(state.post.year)}"><p class="hint">Le cartelle inizieranno con xx-xx.</p></div>`:''}<p class="hint channel-date-hint">I social dello stesso post devono restare nello stesso anno per condividere l’ID.</p>`;
 }
 if(state.step===3){
  const p=state.plan;
  content=p?`<h1>È tutto pronto?</h1><p class="lead">Controlla i dati prima di creare il post.</p><dl class="review"><dt>Titolo</dt><dd>${escape(p.title)}</dd><dt>Social</dt><dd>${escape(p.channels.join(', '))}</dd><dt>Anno</dt><dd>${p.year}</dd><dt>Argomento</dt><dd>${escape(p.topic||'—')}</dd><dt>ID post</dt><dd>${p.id}</dd></dl><div class="destinations">${p.folders.map(f=>`<div class="destination"><strong>${escape(f.channel)}</strong><span class="destination-format">Formato: ${escape(f.format)}</span><span class="destination-date">${f.date?escape(f.date.split('-').reverse().join('/')):'Data da definire'}</span><span class="destination-path">${escape(f.relative)}</span><span class="file-note">${escape(f.aiName)} · ${escape(f.textName)}</span></div>`).join('')}</div><p class="review-total">${p.channels.length===1?'Verranno create una cartella e una riga':'Verranno create '+p.channels.length+' cartelle e '+p.channels.length+' righe'} nel piano editoriale, nella scheda ${p.year}.</p>`:`<h1>Controllo dei dati</h1><p class="loading">Verifico cartelle, template e piano editoriale…</p>`;
 }
 main.innerHTML=`<div class="screen-enter">${content}<div class="error" role="alert" id="error">${escape(state.error)}</div></div>`;
 footer.innerHTML=`<span class="step-caption">Passo ${state.step+1} di 4</span><div class="footer-actions"><button class="btn" id="back" type="button" ${state.step===0||state.loading?'disabled':''}>Indietro</button><button class="btn primary" id="next" type="button" ${!valid()||state.loading?'disabled':''}>${state.loading?'Attendi…':state.step===3?'Crea post':'Continua'}</button></div>`;
 wire();
}
function error(message){state.error=message;const box=document.getElementById('error');if(box)box.textContent=message;}
function wire(){
 document.querySelectorAll('[name=social]').forEach(input=>input.addEventListener('change',()=>{state.post.channels=Array.from(document.querySelectorAll('[name=social]:checked')).map(x=>x.value);for(const channel of state.post.channels){state.post.channelDates[channel]??={date:localToday(),undefinedDate:false};state.post.channelFormats[channel]??='';}state.plan=null;error('');updateContinue();}));
 document.getElementById('create-open-settings')?.addEventListener('click',openSettings);
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
 main.innerHTML=`<h1>Post creato</h1><p class="lead">${r.channels.length===1?'La cartella e la riga Excel sono pronte.':'Le '+r.channels.length+' cartelle e le righe Excel sono pronte.'}</p><dl class="review"><dt>Titolo</dt><dd>${escape(r.title)}</dd><dt>ID post</dt><dd>${r.id}</dd><dt>Anno</dt><dd>${r.year}</dd></dl><div class="success-detail">${r.created.map(f=>`<div class="destination"><strong>${escape(f.channel)}</strong><span class="destination-path">${escape(f.path)}</span></div>`).join('')}</div><div class="success-actions">${r.created.map(f=>`<button class="btn" data-open-post="${escape(f.channel)}" type="button">${r.created.length===1?'Apri cartella del post':'Apri cartella '+escape(f.channel)}</button>`).join('')}<button class="btn primary" id="new-post" type="button">Crea un altro post</button></div><div class="error" role="alert" id="error"></div>`;
 footer.innerHTML='<span class="step-caption">Creazione completata</span>';
 document.querySelectorAll('[data-open-post]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{await call('openResult',button.dataset.openPost);}catch(e){error(e.message);}finally{button.disabled=false;}}));
 document.getElementById('new-post').addEventListener('click',()=>{state.step=0;state.visited=0;state.post=initialPost();state.plan=null;state.result=null;state.error='';render();});
}
async function goHome(){if(state.loading||state.route==='edit-post'&&!await confirmEditExit())return;state.route='home';state.error='';state.notice='';state.selected=null;render();window.scrollTo({top:0});}
function renderHome(){
 main.innerHTML=`<div class="home-screen"><h1>Cosa vuoi fare oggi?</h1><div class="home-actions"><button class="home-action home-action-posts" id="all-posts" type="button" ${state.loading?'disabled':''}><img src="assets/calendar.png" alt="" width="240" height="240"><span>Tutti i post</span></button><button class="home-action home-action-drafts" id="drafts" type="button" ${state.loading?'disabled':''}><img src="assets/draft.png" alt="" width="240" height="240"><span>Post in bozza</span></button><button class="home-action home-action-create" id="create-new" type="button" ${state.loading?'disabled':''}><img src="assets/megaphone.png" alt="" width="240" height="240"><span>Crea nuovo post</span></button></div><div class="home-settings"><button class="btn" id="open-settings" type="button" ${state.loading?'disabled':''}>⚙ Impostazioni</button><button class="btn" id="sync-assets" type="button" ${state.loading||!state.rootValid?'disabled':''} title="Copia le immagini di tutti i post in 00_template/Archivio asset, divise per social e anno">${actionIcons.images}<span>${state.assetSyncing?'Aggiornamento…':'Aggiorna archivio asset'}</span></button>${state.version?`<span class="app-version">Versione ${escape(state.version)}</span>`:''}</div>${state.notice?`<div class="notice" role="status">${escape(state.notice)}</div>`:''}<div class="error" id="error" role="alert">${escape(state.error)}</div></div>`;
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
 const row=(label,key,value)=>`<div class="settings-row"><label for="setting-${key}">${label}</label><div class="settings-control"><input class="text-input" id="setting-${key}" value="${escape(value||'')}" ${!s?'disabled':''}><button class="btn" type="button" data-pick="${key}" ${!s?'disabled':''}>Sfoglia</button></div></div>`;
 main.innerHTML=`<div class="settings-screen"><h1>Impostazioni</h1><p class="lead">I percorsi vengono salvati in <strong>00_template/socialdesk-settings.json</strong>. Mac e Windows mantengono impostazioni separate.</p><div class="settings-section"><h2>Cartella Social</h2><div class="settings-control"><div class="folder-path" title="${escape(state.root)}"><span>${escape(state.root||'Nessuna cartella selezionata')}</span></div><button class="btn" id="settings-root" type="button">${state.root?'Cambia cartella':'Scegli cartella'}</button></div></div>${s?`<div class="settings-section"><h2>Template Illustrator</h2><p class="hint">Scegli un file .ai per ogni social. I percorsi relativi partono dalla cartella Social.</p>${row('Facebook','Facebook',s.templates.Facebook)}${row('Instagram','Instagram',s.templates.Instagram)}${row('LinkedIn','LinkedIn',s.templates.LinkedIn)}</div><div class="settings-section"><h2>Cestino</h2><p class="hint">La cartella deve trovarsi dentro Social. Se non esiste, verrà creata quando elimini un post.</p>${row('Cartella cestino','trash',s.trash)}</div><p class="hint">Piano editoriale: Piano editoriale.xlsx nella cartella Social.</p><button class="btn primary" id="save-settings" type="button">Salva impostazioni</button>`:''}<div class="error" role="alert" id="error">${escape(state.error)}</div>${state.notice?`<p class="notice" role="status">${escape(state.notice)}</p>`:''}</div>`;
 footer.innerHTML='<button class="btn" id="settings-home" type="button">Torna alla home</button>';
 document.getElementById('settings-home').addEventListener('click',goHome);
 document.getElementById('settings-root').addEventListener('click',async()=>{try{const result=await call('chooseRoot');if(result){state.root=result.root;state.rootValid=result.valid;state.settings=await call('settings');state.error='';state.notice='';render();}}catch(e){error(e.message);}});
 document.querySelectorAll('[data-pick]').forEach(button=>button.addEventListener('click',async()=>{try{const value=await call('chooseSetting',button.dataset.pick);if(value!==null)document.getElementById('setting-'+button.dataset.pick).value=value;}catch(e){error(e.message);}}));
 document.getElementById('save-settings')?.addEventListener('click',async()=>{const input={socialRoot:state.root,templates:{},trash:document.getElementById('setting-trash').value};for(const channel of ['Facebook','Instagram','LinkedIn'])input.templates[channel]=document.getElementById('setting-'+channel).value;try{state.settings=await call('saveSettings',input);state.notice='Impostazioni salvate.';state.error='';render();}catch(e){error(e.message);}});
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
function socialIcon(channel){
 const marks={
  Facebook:'<circle cx="12" cy="12" r="11" fill="currentColor"/><path fill="#fff" d="M13.5 21v-8h2.7l.4-3.1h-3.1V8c0-.9.3-1.5 1.6-1.5h1.7V3.7c-.8-.1-1.6-.2-2.4-.2-2.4 0-4.1 1.5-4.1 4.3v2.1H7.6V13h2.7v8z"/>',
  Instagram:'<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/>',
  LinkedIn:'<rect x="2" y="2" width="20" height="20" rx="2" fill="currentColor"/><circle cx="6.7" cy="7" r="1.5" fill="#fff"/><path fill="#fff" d="M5.3 9.5h2.8V19H5.3zm4.7 0h2.7v1.3c.5-.9 1.5-1.5 2.8-1.5 2.8 0 3.5 1.8 3.5 4.3V19h-2.8v-4.8c0-1.2 0-2.5-1.6-2.5s-1.8 1.2-1.8 2.4V19H10z"/>',
 };
 return marks[channel]?`<svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${marks[channel]}</svg>`:'';
}
function renderPostRow(d){
 const status=d.status||'Non indicato',date=d.date?d.date.split('-').reverse().join('/'):'Da definire';
 const topic=d.topic?.trim()?`<span class="post-topic" title="Argomento: ${escape(d.topic)}">${actionIcons.topic}<span class="sr-only">Argomento: </span><span class="post-topic-text">${escape(d.topic)}</span></span>`:'';
 const id=d.id!==null&&d.id!==''?`<span>ID ${escape(d.id)}</span>`:'';
 return `<article class="draft-item" data-channel="${escape(d.channel)}"><div class="post-body post-summary" data-details="${escape(d.key)}" title="Visualizza dettagli del post"><div class="post-heading"><span class="post-social-icon" role="img" aria-label="${escape(d.channel)}" title="${escape(d.channel)}">${socialIcon(d.channel)}</span><h2><button class="post-title-button" type="button">${escape(d.title)}</button></h2></div>${topic||id?`<p class="draft-meta post-details">${topic}${id}</p>`:''}</div><div class="post-actions"><button class="btn status-action status-badge" data-status="${SocialPostFilters.statusTone(d.status)}" data-change-status="${escape(d.key)}" type="button" aria-label="Cambia stato: ${escape(status)}" title="Cambia stato" ${state.loading?'disabled':''}>${escape(status)}</button><button class="btn date-action" data-change-date="${escape(d.key)}" type="button" aria-label="Aggiorna data: ${escape(date)}" title="Aggiorna data" ${state.loading?'disabled':''}>${escape(date)}</button><button class="btn icon-btn" data-draft="${escape(d.key)}" type="button" aria-label="Modifica" title="Modifica" ${state.loading?'disabled':''}>${actionIcons.edit}</button></div></article>`;
}
function renderPostGroup(group){
 const first=group.posts[0],channels=group.posts.map(post=>post.channel);
 const icons=group.posts.map(post=>`<span class="post-social-icon" data-channel="${escape(post.channel)}" aria-hidden="true">${socialIcon(post.channel)}</span>`).join('');
 return `<details class="post-group" data-group-key="${escape(group.key)}" ${state.expandedGroups.has(group.key)?'open':''}><summary class="draft-item group-summary"><div class="post-body"><div class="post-heading"><span class="post-icon-stack" role="img" aria-label="${escape(channels.join(', '))}">${icons}</span><h2>${escape(first.title)}</h2></div><p class="draft-meta post-details">ID ${escape(first.id)} · ${group.posts.length} social</p></div><span class="group-chevron" aria-hidden="true">${actionIcons.chevron}</span></summary><div class="group-children">${group.posts.map(renderPostRow).join('')}</div></details>`;
}
function renderDrafts(){
 const all=state.listMode==='posts',today=localToday(),year=today.slice(0,4);
 const years=[...new Set([year,...state.years.map(String),...state.drafts.map(d=>String(d.year))])].sort().reverse();
 if(!years.includes(state.filterYear))state.filterYear=year;
 const statuses=[...new Set(['testi da creare','testi in bozza','immagine da creare','da pubblicare','pubblicato',...state.drafts.map(d=>d.status.trim().toLowerCase()).filter(Boolean)])].filter(status=>!state.hidePublished||status!=='pubblicato');
 const items=state.drafts.filter(d=>SocialPostFilters.matchesPost(d,{year:state.filterYear,channels:state.filterChannels,status:state.filterStatus,month:state.filterMonth,hidePublished:state.hidePublished}));
 const channels=['Facebook','LinkedIn','Instagram'];
 const chips=`<div class="channel-chips" role="group" aria-label="Filtra per canale">${channels.map(channel=>`<button class="channel-chip" type="button" data-channel-filter="${channel}" aria-pressed="${state.filterChannels.includes(channel)}" ${state.loading?'disabled':''}>${socialIcon(channel)}<span>${channel}</span></button>`).join('')}</div>`;
 const toolbar=`<div class="draft-toolbar posts-toolbar"><div class="field"><label for="filter-year">Anno</label><select id="filter-year" class="select-input" ${state.loading?'disabled':''}>${years.map(y=>`<option ${state.filterYear===y?'selected':''}>${y}</option>`).join('')}</select></div><div class="field"><label for="filter-status">Stato</label><select id="filter-status" class="select-input status-filter" data-status="${state.filterStatus?SocialPostFilters.statusTone(state.filterStatus):'all'}" ${state.loading?'disabled':''}><option value="">Tutti gli stati</option>${statuses.map(status=>`<option value="${escape(status)}" data-status="${SocialPostFilters.statusTone(status)}" ${state.filterStatus===status?'selected':''}>${escape(status)}</option>`).join('')}<option value="__none" ${state.filterStatus==='__none'?'selected':''}>Non indicato</option></select></div><div class="field"><label for="filter-month">Mese</label><select id="filter-month" class="select-input" ${state.loading?'disabled':''}><option value="">Tutti i mesi</option>${['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'].map((name,index)=>{const value=String(index+1).padStart(2,'0');return `<option value="${value}" ${state.filterMonth===value?'selected':''}>${name}</option>`;}).join('')}</select></div><div class="list-toggles"><label class="group-toggle"><input type="checkbox" id="group-by-id" ${state.groupById?'checked':''} ${state.loading?'disabled':''}><span>Raggruppa per ID</span></label></div></div>`;
 const groups=state.groupById?SocialPostFilters.groupById(items):items.map(post=>({key:post.key,posts:[post]}));
 const rows=groups.map(group=>group.posts.length>1?renderPostGroup(group):renderPostRow(group.posts[0])).join('');
 main.innerHTML=`<div class="list-heading"><h1>${all?'Tutti i post':'Post in bozza'}</h1><button class="btn refresh-icon" id="refresh" type="button" aria-label="Aggiorna elenco" title="Aggiorna elenco" ${state.loading?'disabled':''}>${actionIcons.refresh}</button></div><p class="lead list-intro">${all?'Pubblicati e bozze. Modifica i dati del singolo social.':'Tutti i post non ancora pubblicati. Li trovi tutti, anche pubblicati, in Tutti i post.'}</p>${chips}${toolbar}${state.notice?`<div class="notice" role="status">${escape(state.notice)}</div>`:''}<p class="draft-count">${items.length} post</p><div class="draft-list">${rows||`<p class="empty-state">${state.filterChannels.length?'Nessun post per questi filtri.':'Seleziona almeno un social per visualizzare i post.'}</p>`}</div><div class="error" id="error" role="alert">${escape(state.error)}</div>`;
 footer.innerHTML=`<button class="btn" id="home" type="button" ${state.loading?'disabled':''}>Torna alla home</button>`;
 document.getElementById('home').addEventListener('click',goHome);
 document.getElementById('refresh').addEventListener('click',()=>loadList(state.listMode));
 document.getElementById('group-by-id')?.addEventListener('change',event=>{state.groupById=event.target.checked;render();document.getElementById('group-by-id')?.focus({preventScroll:true});});
 main.querySelectorAll('[data-group-key]').forEach(group=>group.addEventListener('toggle',()=>{if(group.open)state.expandedGroups.add(group.dataset.groupKey);else state.expandedGroups.delete(group.dataset.groupKey);}));
 document.getElementById('filter-year').addEventListener('change',e=>{state.filterYear=e.target.value;render();});
 document.getElementById('filter-status').addEventListener('change',e=>{state.filterStatus=e.target.value;render();});
 document.getElementById('filter-month').addEventListener('change',e=>{state.filterMonth=e.target.value;render();});
 main.querySelectorAll('[data-channel-filter]').forEach(button=>button.addEventListener('click',()=>{
  const channel=button.dataset.channelFilter;
  state.filterChannels=state.filterChannels.includes(channel)?state.filterChannels.filter(c=>c!==channel):[...state.filterChannels,channel];render();
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
  state.editTextNote=note;state.error='';state.loading=false;state.route='edit-post';render();
 }));
}
function openStatusModal(post,opener){
 if(document.querySelector('dialog[open]'))return;
 const mode=state.listMode,scrollY=window.scrollY,current=post.status.trim().toLowerCase();
 const statuses=['testi da creare','testi in bozza','immagine da creare','da pubblicare','pubblicato'];
 const initial=statuses.includes(current)?current:'';
 const modal=document.createElement('dialog');modal.id='status-modal';modal.className='date-modal';modal.setAttribute('aria-labelledby','status-modal-title');modal.setAttribute('aria-describedby','status-modal-post');
 modal.innerHTML=`<form><div class="date-modal-heading"><h2 id="status-modal-title">Cambia stato</h2><button type="button" class="modal-close" id="status-close" aria-label="Chiudi">×</button></div><p id="status-modal-post" class="date-modal-post">${escape(post.title)}</p><p class="date-modal-channel">${escape(post.channel)} · ${post.year}</p><div class="field"><label for="quick-status">Nuovo stato</label><select class="select-input status-filter" id="quick-status" required data-status="${SocialPostFilters.statusTone(initial)}">${initial?'':`<option value="" disabled selected>${escape(post.status?'Attuale: '+post.status:'Scegli uno stato')}</option>`}${statuses.map(status=>`<option value="${status}" ${initial===status?'selected':''}>${status}</option>`).join('')}</select><p class="hint">La modifica riguarda solo ${escape(post.channel)}.</p></div><p class="error" id="status-error" role="alert"></p><div class="date-modal-actions"><button class="btn" id="status-cancel" type="button">Annulla</button><button class="btn primary" id="status-save" type="submit" disabled>Salva stato</button></div></form>`;
 document.body.appendChild(modal);document.body.classList.add('status-modal-open');
 let saving=false;const select=modal.querySelector('#quick-status'),save=modal.querySelector('#status-save'),message=modal.querySelector('#status-error');
 function changed(){return!!select.value&&select.value!==current;}
 function close(){if(saving)return;modal.close();modal.remove();document.body.classList.remove('status-modal-open');if(opener.isConnected)opener.focus({preventScroll:true});}
 function busy(value){saving=value;state.loading=value;modal.querySelectorAll('button,select').forEach(el=>{el.disabled=value;});save.disabled=value||!changed();save.textContent=value?'Salvataggio…':'Salva stato';modal.setAttribute('aria-busy',String(value));}
 modal.querySelector('#status-close').addEventListener('click',close);modal.querySelector('#status-cancel').addEventListener('click',close);
 modal.addEventListener('cancel',event=>{event.preventDefault();close();});
 modal.addEventListener('click',event=>{const r=modal.getBoundingClientRect();if(event.target===modal&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))close();});
 select.addEventListener('change',()=>{select.dataset.status=SocialPostFilters.statusTone(select.value);save.disabled=!changed();message.textContent='';});
 modal.querySelector('form').addEventListener('submit',async event=>{
  event.preventDefault();if(saving||!changed()||!select.reportValidity())return;
  const request={key:post.key,revision:state.revision,status:select.value};message.textContent='';busy(true);
  try{
   const result=await call('updateStatus',request);if(result.canceled)return;
   state.notice=`Stato aggiornato per ${result.channel}: ${result.status}.${mode==='drafts'&&result.status==='pubblicato'?' Lo trovi in Tutti i post.':''}`;
   busy(false);close();await loadList(mode);window.scrollTo({top:scrollY});main.querySelector(`[data-change-status="${post.key}"]`)?.focus({preventScroll:true});
  }catch(e){message.textContent=e.message;}
  finally{if(modal.isConnected)busy(false);else state.loading=false;}
 });
 modal.showModal();select.focus();
}
function detailsMetadata(post){
 const postFolder=post.sourcesRelative?.replace(/\\/g,'/').replace(/\/01_Sorgenti\/?$/,'');
 const folderLink=postFolder&&postFolder!==post.sourcesRelative?`<a href="#" class="details-file-link details-folder-link" data-open-post-folder title="Apri la cartella del post" aria-label="Apri la cartella del post: ${escape(postFolder)}"><span>${escape(postFolder)}</span><svg class="external-link-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3h7v7M21 3 10 14"/><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2-2v-5"/></svg></a>`:'Collegamento non indicato';
 return `<h3 class="details-post-title" id="details-post-title">${escape(post.title)}</h3><dl class="details-grid"><dt>ID post</dt><dd>${post.id!==null&&post.id!==''?escape(post.id):'Non assegnato'}</dd><dt>Canale</dt><dd class="details-channel" data-channel="${escape(post.channel)}">${socialIcon(post.channel)}<span>${escape(post.channel)}</span></dd><dt>Anno</dt><dd>${post.year}</dd><dt>Pubblicazione</dt><dd>${post.date?escape(post.date.split('-').reverse().join('/')):'Da definire'}</dd><dt>Argomento</dt><dd>${escape(post.topic||'Non indicato')}</dd><dt>Formato</dt><dd>${escape(post.format||'Non indicato')}</dd><dt>Stato</dt><dd><span class="status-badge" data-status="${SocialPostFilters.statusTone(post.status)}">${escape(post.status||'Non indicato')}</span></dd><dt>Cartella post</dt><dd class="details-source">${folderLink}<p class="error details-open-error" id="details-folder-error" role="alert" hidden></p></dd></dl>`;
}
function openPostDetails(post,opener){
 if(document.querySelector('dialog[open]'))return;
 const modal=document.createElement('dialog');modal.id='post-details-modal';modal.className='date-modal post-details-modal';modal.setAttribute('aria-labelledby','details-modal-title');modal.setAttribute('aria-describedby','details-post-title');
 modal.innerHTML=`<div class="date-modal-heading"><h2 id="details-modal-title">Dettagli post</h2><button type="button" class="modal-close" id="details-close" aria-label="Chiudi">×</button></div><section id="details-metadata">${detailsMetadata(post)}</section><section class="details-text-section" aria-label="Testo del post"><h3>Testo del post</h3><div id="details-text" aria-live="polite"><p class="hint">Caricamento del testo…</p></div></section><section class="details-text-section details-artwork-section" aria-label="Grafica del post"><h3>Grafica del post</h3><div id="details-artwork"></div></section><div class="date-modal-actions"><button class="btn" id="details-done" type="button">Chiudi</button></div>`;
 document.body.appendChild(modal);document.body.classList.add('details-modal-open');
 let disposeArtwork=()=>{};
 function close(){disposeArtwork();modal.close();modal.remove();document.body.classList.remove('details-modal-open');if(opener?.isConnected)opener.focus({preventScroll:true});}
 modal.querySelector('#details-close').addEventListener('click',close);modal.querySelector('#details-done').addEventListener('click',close);
 modal.addEventListener('cancel',event=>{event.preventDefault();close();});
 modal.addEventListener('click',event=>{const r=modal.getBoundingClientRect();if(event.target===modal&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))close();});
 let openingFolder=false;
 modal.addEventListener('click',async event=>{
  const link=event.target.closest?.('[data-open-post-folder]');if(!link)return;
  event.preventDefault();if(openingFolder)return;
  openingFolder=true;link.setAttribute('aria-disabled','true');
  const error=modal.querySelector('#details-folder-error');error.hidden=true;
  try{await call('openPostFolder',{key:post.key,revision:state.revision});}
  catch(e){if(error.isConnected){error.textContent=e.message;error.hidden=false;}}
  finally{openingFolder=false;link.removeAttribute('aria-disabled');}
 });
 modal.showModal();modal.querySelector('#details-close').focus();
 disposeArtwork=SocialIllustratorPreview.mount(modal.querySelector('#details-artwork'),{key:post.key,revision:state.revision},call);
 call('details',{key:post.key,revision:state.revision}).then(result=>{
  if(!modal.isConnected)return;
  modal.querySelector('#details-metadata').innerHTML=detailsMetadata(result.post);
  const container=modal.querySelector('#details-text');container.replaceChildren();
  if(result.textMessage){const note=document.createElement('p');note.className='hint details-note';note.textContent=result.textMessage;container.appendChild(note);}
  for(const file of result.textFiles){
   const block=document.createElement('section');block.className='details-text-file';
   const name=document.createElement('a');name.className='details-filename details-file-link';name.href='#';name.title='Apri il file di testo';name.setAttribute('aria-label','Apri '+file.name);
   const label=document.createElement('span');label.textContent=file.name;name.appendChild(label);
   name.insertAdjacentHTML('beforeend','<svg class="external-link-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3h7v7M21 3 10 14"/><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></svg>');
   const openingError=document.createElement('p');openingError.className='error details-open-error';openingError.setAttribute('role','alert');openingError.hidden=true;
   let opening=false;name.addEventListener('click',async event=>{event.preventDefault();if(opening)return;opening=true;name.setAttribute('aria-disabled','true');openingError.hidden=true;try{await call('openText',{key:post.key,revision:state.revision,name:file.name});}catch(e){openingError.textContent=e.message;openingError.hidden=false;}finally{opening=false;name.removeAttribute('aria-disabled');}});
   block.append(name,openingError);
   const content=document.createElement('div');content.className='details-text md-content';
   if(file.message||file.content===''){content.classList.add('details-text-empty');content.textContent=file.message||'Il file di testo è vuoto.';}
   else{
    SocialMarkdown.renderInto(content,file.content);
    const copy=document.createElement('button');copy.type='button';copy.className='btn details-copy';copy.textContent='Copia per i social';
    copy.title='Copia il testo con grassetto e barrato visibili su Facebook, Instagram e LinkedIn';
    copy.addEventListener('click',()=>copySocialText(file.content,copy));
    name.after(copy);
   }
   block.appendChild(content);container.appendChild(block);
  }
 }).catch(e=>{if(!modal.isConnected)return;const container=modal.querySelector('#details-text');container.replaceChildren();const message=document.createElement('p');message.className='error';message.setAttribute('role','alert');message.textContent=e.message;container.appendChild(message);});
}
function openDateModal(post,opener){
 if(document.getElementById('date-modal'))return;
 const mode=state.listMode,scrollY=window.scrollY;
 const initial=post.date||(post.year===new Date().getFullYear()?localToday():post.year+'-01-01');
 const modal=document.createElement('dialog');modal.id='date-modal';modal.className='date-modal';modal.setAttribute('aria-labelledby','date-modal-title');modal.setAttribute('aria-describedby','date-modal-post');
 modal.innerHTML=`<form id="date-modal-form"><div class="date-modal-heading"><h2 id="date-modal-title">Aggiorna data</h2><button type="button" class="modal-close" id="date-modal-close" aria-label="Chiudi">×</button></div><p id="date-modal-post" class="date-modal-post">${escape(post.title)}</p><p class="date-modal-channel">${escape(post.channel)} · ${post.year}</p><div class="field"><label for="draft-date">Data pubblicazione</label><input class="text-input" type="date" id="draft-date" required min="${post.year}-01-01" max="${post.year}-12-31" value="${escape(initial)}" autofocus><p class="hint">La modifica riguarda solo ${escape(post.channel)}.</p></div><p class="error" id="date-modal-error" role="alert"></p><div class="date-modal-actions"><button class="btn" id="date-modal-cancel" type="button">Annulla</button><button class="btn primary" id="date-modal-save" type="submit">Salva data</button></div></form>`;
 document.body.appendChild(modal);document.body.classList.add('date-modal-open');
 let saving=false;
 const input=modal.querySelector('#draft-date'),save=modal.querySelector('#date-modal-save'),message=modal.querySelector('#date-modal-error');
 function closeModal(){if(saving)return;modal.close();modal.remove();document.body.classList.remove('date-modal-open');state.selected=null;if(opener.isConnected)opener.focus({preventScroll:true});}
 function busy(value){saving=value;state.loading=value;modal.querySelectorAll('button,input').forEach(el=>{el.disabled=value;});save.textContent=value?'Salvataggio…':'Salva data';modal.setAttribute('aria-busy',String(value));}
 modal.querySelector('#date-modal-close').addEventListener('click',closeModal);
 modal.querySelector('#date-modal-cancel').addEventListener('click',closeModal);
 modal.addEventListener('cancel',event=>{event.preventDefault();closeModal();});
 modal.addEventListener('click',event=>{const r=modal.getBoundingClientRect();if(event.target===modal&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))closeModal();});
 input.addEventListener('input',()=>{message.textContent='';});
 modal.querySelector('form').addEventListener('submit',async event=>{
  event.preventDefault();if(saving||!input.reportValidity())return;
  const request={key:post.key,revision:state.revision,date:input.value};message.textContent='';busy(true);
  try{
   const plan=await call('planDate',request);
   const result=await call('updateDate',request,plan.fingerprint);
   if(result.canceled)return;
   state.notice=`Data aggiornata per ${result.channel}: ${result.date.split('-').reverse().join('/')}.`;
   busy(false);closeModal();await loadList(mode);
   window.scrollTo({top:scrollY});
   const current=main.querySelector(`[data-change-date="${post.key}"]`);current?.focus({preventScroll:true});
  }catch(e){message.textContent=e.message;}
  finally{if(modal.isConnected)busy(false);else state.loading=false;}
 });
 modal.showModal();input.focus();
}
function editInput(){return{key:state.selected.key,revision:state.revision,...state.editValues};}
function editOptions(current,values){return [...new Set([current,...values])].map(value=>`<option value="${escape(value)}" ${value===current?'selected':''}>${escape(value||'Non indicato')}</option>`).join('');}
function confirmDiscardEdit(){
 return new Promise(resolve=>{
  const modal=document.createElement('dialog');modal.className='date-modal';modal.setAttribute('aria-labelledby','discard-edit-title');
  modal.innerHTML='<div class="date-modal-heading"><h2 id="discard-edit-title">Uscire senza salvare?</h2></div><p>Le modifiche a questo post andranno perse.</p><div class="date-modal-actions"><button class="btn" id="stay-edit" type="button">Resta qui</button><button class="btn danger" id="discard-edit" type="button">Esci senza salvare</button></div>';
  document.body.appendChild(modal);
  modal.addEventListener('close',()=>{modal.remove();resolve(modal.returnValue==='discard');},{once:true});
  modal.querySelector('#stay-edit').addEventListener('click',()=>modal.close('stay'));
  modal.querySelector('#discard-edit').addEventListener('click',()=>modal.close('discard'));
  modal.showModal();modal.querySelector('#stay-edit').focus();
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
 {command:'list',label:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>',title:'Elenco puntato'}
];
function markdownToolbar(){
 const groups=[[0,4],[4,7],[7,8]];
 return `<div class="md-toolbar" role="toolbar" aria-label="Formattazione del testo">${groups.map(([a,b])=>`<div class="md-toolbar-group">${markdownButtons.slice(a,b).map(button=>`<button class="md-tool" type="button" data-md="${button.command}" title="${button.title}" aria-label="${button.title}" aria-pressed="false" ${state.loading?'disabled':''}>${button.label}</button>`).join('')}</div>`).join('')}<button class="btn md-copy" type="button" id="copy-social" title="Copia il testo con grassetto e barrato visibili su Facebook, Instagram e LinkedIn" ${state.loading?'disabled':''}>Copia per i social</button></div>`;
}
async function copySocialText(markdown,button){
 const label=button.textContent;button.disabled=true;
 try{await call('copyText',SocialMarkdown.toSocialText(markdown));button.textContent='Copiato ✓';}
 catch(e){button.textContent='Copia non riuscita';}
 setTimeout(()=>{if(button.isConnected){button.textContent=label;button.disabled=false;}},1600);
}
function currentBlock(area){
 const selection=document.getSelection();let node=selection&&selection.anchorNode;
 while(node&&node!==area){if(node.nodeType===1&&/^(H1|H2|H3|LI|DIV|P)$/.test(node.tagName))return node;node=node.parentNode;}
 return null;
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
   if(command==='bold')document.execCommand('bold');
   else if(command==='italic')document.execCommand('italic');
   else if(command==='strike')document.execCommand('strikeThrough');
   else if(command==='list')document.execCommand('insertUnorderedList');
   else if(command==='p')document.execCommand('formatBlock',false,'div');
   else{if(tag==='LI')document.execCommand('insertUnorderedList');document.execCommand('formatBlock',false,tag===command.toUpperCase()?'div':command);}
   sync();
  });
 });
 document.getElementById('copy-social')?.addEventListener('click',event=>copySocialText(v.postText,event.currentTarget));
}
function renderPostEdit(){
 const d=state.selected,v=state.editValues;
 main.innerHTML=`<button class="btn edit-back" id="back-posts" type="button" ${state.loading?'disabled':''}>← Torna indietro</button><h1>Modifica post</h1><p class="lead">${escape(d.channel)} · ${d.year}${d.id!==null&&d.id!==''?' · ID '+escape(d.id):''}</p><div class="edit-fields"><div class="field"><label for="edit-title">Titolo</label><input class="text-input" id="edit-title" maxlength="140" value="${escape(v.title)}" ${state.loading?'disabled':''}></div><div class="field"><label for="edit-topic">Argomento</label><input class="text-input" id="edit-topic" maxlength="200" value="${escape(v.topic)}" ${state.loading?'disabled':''}></div><div class="edit-pair"><div class="field"><label for="edit-format">Formato</label><select class="select-input" id="edit-format" ${state.loading?'disabled':''}>${editOptions(v.format,['Immagine singola','Carosello','Video','Reel','Storia'])}</select></div><div class="field"><label for="edit-status">Stato pubblicazione</label><select class="select-input" id="edit-status" ${state.loading?'disabled':''}>${editOptions(v.status,['testi da creare','testi in bozza','immagine da creare','da pubblicare','pubblicato'])}</select></div></div><div class="field"><label for="edit-date">Data pubblicazione</label><input class="text-input" id="edit-date" type="date" min="${d.year}-01-01" max="${d.year}-12-31" value="${escape(v.date)}" ${v.undefinedDate||state.loading?'disabled':''}><p class="hint">La data deve rimanere nel ${d.year}.</p></div><label class="check-line"><input type="checkbox" id="edit-undefined" ${v.undefinedDate?'checked':''} ${state.loading?'disabled':''}><span>Data da definire</span></label><div class="field"><span class="field-label" id="edit-post-text-label">Testo del post</span>${v.textName?`${markdownToolbar()}<div class="post-text-input md-editor md-content" id="edit-post-text" contenteditable="${state.loading?'false':'true'}" role="textbox" aria-multiline="true" aria-labelledby="edit-post-text-label" spellcheck="true" ${state.loading?'aria-disabled="true"':''}></div><p class="hint">${escape(v.textName)} · Modifichi solo il testo di ${escape(d.channel)}. Usa i pulsanti per titoli, grassetto, corsivo, barrato ed elenchi.</p>`:`<p class="hint">${escape(state.editTextNote||'Nessun file di testo modificabile presente nei Sorgenti.')}</p>`}</div></div><section class="delete-post-section" aria-label="Eliminazione del post"><h2>Elimina post</h2><p>Rimuove la riga di ${escape(d.channel)} dal piano editoriale e sposta la sua cartella in <strong>00_cestino</strong>.</p><button class="btn danger" id="delete-post" type="button" ${state.loading?'disabled':''}>Elimina post</button></section><div class="error" role="alert" id="error">${escape(state.error)}</div>`;
 footer.innerHTML=`<span></span><button class="btn primary" id="save-post" type="button" ${state.loading||!v.title.trim()?'disabled':''}>${state.loading?'Attendi…':'Salva modifiche'}</button>`;
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
  }catch(e){state.error=e.message;}
  finally{state.loading=false;render();}
 });
}


document.getElementById('brand-home').addEventListener('click',goHome);
document.querySelectorAll('[data-nav]').forEach(link=>link.addEventListener('click',async event=>{
 event.preventDefault();if(state.loading||document.querySelector('dialog[open]'))return;
 if(state.route==='edit-post'&&!await confirmEditExit())return;
 if(link.dataset.nav==='create'){startCreate();return;}
 await loadList(link.dataset.nav);window.scrollTo({top:0});
}));

render();
call('initial').then(result=>{state.version=result.version||'';state.root=result.root;state.rootValid=result.valid;state.error=result.valid?'':result.message||'';render();}).catch(e=>error(e.message));
