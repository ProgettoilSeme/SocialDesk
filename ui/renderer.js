'use strict';
// Interfaccia costruita con i componenti della libreria myPgs (attributi pgs, pgs-state, pgs-data).
const api=window.socialAPI;
// Su Mac la barra del titolo è nascosta: l'header fa da barra (trascinamento e spazio per i pulsanti della finestra)
document.documentElement.dataset.platform=/Mac/i.test(navigator.platform)?'mac':'other';
const localToday=()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const initialPost=()=>({channels:[],title:'',topic:'',channelFormats:{},channelDates:{},year:String(new Date().getFullYear())});
const state={route:'home',step:0,visited:0,root:'',rootValid:false,baseValid:false,clients:[],client:'',post:initialPost(),plan:null,result:null,error:'',loading:false,drafts:[],revision:'',selected:null,notice:'',filterYear:String(new Date().getFullYear()),filterChannels:['Facebook','Instagram','LinkedIn','Blog','TikTok','YouTube','X','Reddit'],filterStatus:'',filterMonth:'',filterSearch:'',groupById:true,hidePublished:true,expandedGroups:new Set(),years:[],listMode:'drafts',editValues:null,editOriginal:null,settings:null,settingsTab:'app',logoBusy:false,platformsBusy:false,highlight:null,editModal:null,ideas:null,ideaDraft:{text:'',notes:'',channels:[]},ideasLoading:false,background:{key:'',url:''}};
const main=document.getElementById('main'),footer=document.getElementById('footer'),progress=document.getElementById('progress');
// Piattaforme e formati arrivano dal main (social:initial → catalog); questi valori valgono solo prima della risposta
let CHANNELS=['Facebook','Instagram','LinkedIn','Blog','TikTok','YouTube','X','Reddit'];
let CATALOG={platforms:{},kinds:{}};
const DEFAULT_PLATFORMS=['Facebook','Instagram','LinkedIn'];
const platformFormats=channel=>CATALOG.platforms[channel]?.formats||[];
const formatKind=format=>CATALOG.kinds[format]||'';
// piattaforme gestite dal cliente in uso (Impostazioni del cliente)
const clientPlatforms=()=>{const c=state.clients.find(x=>x.folder===state.client);return c?.platforms?.length?c.platforms:DEFAULT_PLATFORMS;};
// Tema: myPgs lo salva e lo applica; le finestre di sistema (conferme, dialoghi) lo seguono.
document.addEventListener('pgs:svg:changeColor',event=>{api?.setTheme?.(!!event.detail?.isDarkMode);});
const STATUSES=['testi da creare','testi in bozza','immagine da creare','da pubblicare','pubblicato'];
const MONTHS=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const disabled=flag=>flag?'disabled':'';

//# myPgs
// pgs è pubblicato su globalThis dal bundle della libreria; ogni markup inserito dopo il caricamento va inizializzato.
// Striscia a destra tenuta vuota per la barra di scorrimento (scrollbar-gutter): quando è vuota (la pagina non scorre)
// l'header la copre, così lo spazio a destra di "Crea nuovo post" fino al bordo della finestra è uguale a quello sopra.
// Quando la pagina scorre la barra c'è davvero (clientWidth < innerWidth) e l'header si ferma prima, accanto alla barra.
function syncHeaderGutter(){
 const header=document.querySelector('header');if(!header)return;
 const root=document.documentElement;
 const scrollbar=window.innerWidth-root.clientWidth>0;
 root.style.setProperty('--header-gutter','0px');
 const gap=scrollbar?0:Math.max(0,Math.round(window.innerWidth-header.getBoundingClientRect().right));
 root.style.setProperty('--header-gutter',gap+'px');
}
window.addEventListener('resize',syncHeaderGutter);
// la barra compare e sparisce quando cambia l'altezza della pagina (elenchi, gruppi aperti, schede…)
try{new ResizeObserver(()=>syncHeaderGutter()).observe(document.body);}catch{}
function enhance(root){try{globalThis.pgs?.helper.init(root);}catch(e){console.error(e);}}
const icon=(name,size='')=>`<i pgs="icon['icon-${name}'${size?` '${size}'`:''}]" aria-hidden="true"></i>`;
function socialIcon(channel){return CHANNELS.includes(channel)?`<i pgs="icon" class="social-icon social-${channel.toLowerCase()}" aria-hidden="true"></i>`:'';}
const ALERTS={error:['alertError','circleXmark'],success:['alertSuccess','circleCheck'],info:['alertInfo','circleInfo'],warning:['alertWarning','triangleExclamation']};
// Piano cambiato da qualcun altro (errore CHANGED): il messaggio ha il pulsante Aggiorna (refreshChangedPlan)
const changedMessages=new Set();
const planChanged=message=>changedMessages.has(message);
const refreshButton=()=>`<div><button pgs="button['btnMini']" type="button" data-plan-refresh>${icon('refresh')}<span>Aggiorna</span></button></div>`;
function alertHtml(kind,message,title=''){
 if(!message)return'';const [option,glyph]=ALERTS[kind]||ALERTS.info;const refresh=kind==='error'&&planChanged(message);
 return `<div pgs="alert['${option}']"><i pgs="icon['icon-${glyph}'] alert-icon" aria-hidden="true"></i><div pgs="alert-content${refresh?` flex['column' 'gapParagraphs']`:''}">${title?`<strong pgs="alert-content-title">${escape(title)}</strong>`:''}<p>${escape(message)}</p>${refresh?refreshButton():''}</div></div>`;
}
function setAlert(box,message,kind='error'){if(box){box.innerHTML=alertHtml(kind,message);box.hidden=!message;}}
const errorBox=()=>`<div id="error" role="alert">${alertHtml('error',state.error)}</div>`;
const noticeBox=()=>state.notice?`<div role="status">${alertHtml('success',state.notice)}</div>`:'';
const field=(label,control,hint='')=>`<label pgs="flex['column']"><span pgs="label">${label}</span>${control}</label>${hint?`<p class="hint">${hint}</p>`:''}`;
const formatDate=date=>date?date.split('-').reverse().join('/'):'';

// Modale nativa gestita da pgs.modal: resta nel proprio wrapper (dialogTopLevel → showModal) e si chiude
// con X (modal-close), Esc o clic sullo sfondo; onClose riceve sempre la chiusura effettiva.
function createModal({title,titleHtml,titleId,describedBy='',body,footer='',size='dialogSmall',form=false,closable=true,onClose,beforeClose}){
 const wrapper=document.createElement('div');
 wrapper.setAttribute('pgs',`modal['dialogTopLevel' 'dialogCenter' '${size}' 'dialogDisableBackdropClose']`);
 const close=closable?`<button pgs="button['btnIconOnly' 'btnMini'] modal-close" type="button" aria-label="Chiudi" data-modal-x>${icon('close')}</button>`:'';
 const inner=`<div pgs="modal-dialog-content-header flex['row' 'itemCenter' 'justifyBetween' 'gapParagraphs']"><h2 pgs="h4" id="${titleId}">${titleHtml||escape(title)}</h2>${close}</div><div pgs="modal-dialog-content-scroll flex['column' 'gapParagraphs']">${body}</div>${footer?`<div pgs="modal-dialog-content-footer">${footer}</div>`:''}`;
 wrapper.innerHTML=`<dialog aria-labelledby="${titleId}" ${describedBy?`aria-describedby="${describedBy}"`:''}><div pgs="modal-dialog-content">${form?`<form pgs="form flex['column' 'gapParagraphs']" novalidate>${inner}</form>`:inner}</div></dialog>`;
 // myPgs chiude le altre modali quando se ne apre una: una conferma aperta sopra un'altra modale
 // (es. sopra Modifica post) va scritta dentro di essa, così quella sotto resta aperta
 const parent=[...document.querySelectorAll('dialog[open]')].filter(d=>!d.closest('header')).at(-1);
 (parent||document.body).appendChild(wrapper);
 enhance(wrapper);
 const dialog=wrapper.querySelector('dialog'),instance=()=>globalThis.pgs?.modal.api(wrapper);
 let pressed=null;
 dialog.addEventListener('pointerdown',event=>{pressed=event.target;},{capture:true});
 const modal={wrapper,dialog,busy:false,planRefresh:null,
  open(){const live=instance();if(live)live.open();else dialog.showModal();},
  close(value){if(modal.busy||!dialog.open)return;dialog.close(value);},
  // chiusura chiesta dall'utente (X, Esc, sfondo): passa da beforeClose, che può chiedere conferma
  async request(value){
   if(modal.busy||!dialog.open||modal.asking)return;
   if(beforeClose){modal.asking=true;let ok=false;try{ok=await beforeClose();}finally{modal.asking=false;}if(!ok)return;}
   modal.close(value);
  },
 };
 // Esc: prima del listener di myPgs (che chiuderebbe subito), per rispettare conferme e salvataggi in corso
 dialog.addEventListener('cancel',event=>{event.preventDefault();event.stopImmediatePropagation();modal.request();},{capture:true});
 dialog.addEventListener('click',event=>{const fromBackdrop=pressed===null||pressed===dialog;pressed=null;if(closable&&event.target===dialog&&fromBackdrop)modal.request();});
 // la X non chiude direttamente (myPgs): passa da request, così rispetta salvataggi in corso e conferme
 dialog.addEventListener('click',event=>{const x=event.target.closest?.('[data-modal-x]');if(!x||x.closest('dialog')!==dialog)return;event.preventDefault();event.stopPropagation();modal.request();},{capture:true});
 dialog.addEventListener('close',()=>{instance()?.destroy();wrapper.remove();onClose?.(dialog.returnValue);},{once:true});
 dialog.socialModal=modal;
 return modal;
}

//# Toast di attesa
// Durante le operazioni lunghe (creazione, salvataggio, eliminazione…) un toast fisso con l'icona che gira,
// il passo in corso e la barra di avanzamento (i passi arrivano dal processo principale). Alla fine il toast di successo.
// Il contenitore è un popover: così resta sopra anche alle modali aperte (che stanno nel top layer).
const toastHost=document.getElementById('toast-host');
function bringToastToFront(){try{if(toastHost.matches(':popover-open'))toastHost.hidePopover();toastHost.showPopover();}catch{}}
let activeProgress=null;
api?.onProgress?.(data=>activeProgress?.update(data));
function progressToast(title,{lazy=false,segments=1}={}){
 let shown=false,card=null,segment=0;
 const job={label:'Controllo dei dati…',fraction:0,step:'',
  show(){
   if(shown||!globalThis.pgs?.toast)return;shown=true;
   pgs.toast.neutral({title,description:job.label,timeout:0,icon:'<span class="toast-spinner"></span>',closeTitle:'Nascondi'});
   card=toastHost.querySelector('[pgs*="_alert"]');
   if(card){card.classList.add('progress-toast');card.setAttribute('aria-busy','true');card.querySelector('[pgs~="_alert-content"]')?.insertAdjacentHTML('beforeend','<p class="toast-step"></p><div class="toast-progress" role="progressbar" aria-label="Avanzamento" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>');}
   bringToastToFront();job.draw();
  },
  draw(){
   if(!card?.isConnected)return;
   const text=card.querySelector('[pgs~="_alert-content"] p:not(.toast-step)');if(text)text.textContent=job.label;
   const step=card.querySelector('.toast-step');if(step){step.textContent=job.step;step.hidden=!job.step;}
   const value=Math.round(Math.max(0,Math.min(1,job.fraction))*100),bar=card.querySelector('.toast-progress');
   if(bar){bar.setAttribute('aria-valuenow',String(value));bar.firstElementChild.style.width=value+'%';}
  },
  // passo n di total dell'operazione in corso (dal processo principale)
  update({step,total,label}){
   if(!Number.isInteger(step)||!Number.isInteger(total)||total<1)return;
   job.label=String(label||'');job.fraction=(segment+step/total)/segments;
   job.step=segments===1?`Passo ${step+1} di ${total}`:'';
   job.show();job.draw();
  },
  // operazioni fatte di più salvataggi (es. data e stato): ognuno occupa una parte della barra
  next(){segment=Math.min(segment+1,segments-1);job.fraction=segment/segments;job.draw();},
  done(){if(activeProgress===job)activeProgress=null;},
  success(successTitle,description=''){
   job.done();
   if(shown&&card?.isConnected){job.fraction=1;job.label='Completato';job.step='';job.draw();}
   setTimeout(()=>{globalThis.pgs?.toast.success({title:successTitle,description,timeout:5000,closeTitle:'Chiudi'});bringToastToFront();},shown?250:0);
  },
  // errore o annullamento: il toast sparisce, il messaggio resta dove l'utente sta lavorando
  cancel(){job.done();if(shown&&card?.isConnected)globalThis.pgs?.toast.deleteAll();},
 };
 activeProgress=job;
 if(!lazy)job.show();
 return job;
}

// Stato dal main: cartella Social (baseValid), clienti e cliente in uso. rootValid = si può lavorare sui post.
function applyStatus(result){
 state.root=result.root||'';state.baseValid=!!result.valid;state.clients=result.clients||[];state.client=result.client||'';
 if(result.catalog){CATALOG=result.catalog;CHANNELS=Object.keys(result.catalog.platforms);}
 applyClientColor();
 state.rootValid=!!(result.valid&&result.clientValid);
 void loadClientBackground();
 state.error=!result.valid?result.message||'':result.client&&!result.clientValid?result.message||'':'';
}
const clientName=()=>state.clients.find(c=>c.folder===state.client)?.name||'';
// Colore del cliente (Impostazioni del cliente) → --color-primary di myPgs su :root: tutta l'interfaccia prende quel colore
// (anche -soft, -strong, -text… che myPgs ricava da --color-primary). Senza colore resta quello di myPgs.
function applyClientColor(){
 const color=state.clients.find(c=>c.folder===state.client)?.color||'',root=document.documentElement;
 if(/^#[0-9a-f]{6}$/i.test(color))root.style.setProperty('--color-primary',color);
 else root.style.removeProperty('--color-primary');
}
// Sfondo della home del cliente (Impostazioni del cliente): l'immagine arriva dal main come byte e diventa un URL blob,
// ricaricato solo quando cambiano cliente o file. È visibile solo in home (data-home-background su :root).
let backgroundLoading='';
async function loadClientBackground(){
 const current=state.clients.find(c=>c.folder===state.client),stamp=current?.background||'';
 const key=stamp&&state.rootValid?`${state.client}|${stamp}`:'';
 if(key===state.background.key||(key&&key===backgroundLoading))return;
 let url='';
 if(key){
  backgroundLoading=key;
  try{const r=await call('clientBackground');if(r?.data)url=URL.createObjectURL(new Blob([r.data],{type:r.type}));}catch{}
  finally{if(backgroundLoading===key)backgroundLoading='';}
  // nel frattempo è cambiato cliente: questa immagine non serve più
  const now=state.clients.find(c=>c.folder===state.client);
  if(`${state.client}|${now?.background||''}`!==key){if(url)URL.revokeObjectURL(url);return;}
 }
 if(state.background.url)URL.revokeObjectURL(state.background.url);
 state.background={key,url};
 const root=document.documentElement;
 if(url)root.style.setProperty('--client-background',`url("${url}")`);else root.style.removeProperty('--client-background');
 applyHomeBackground();
 if(state.route==='settings')render();
}
function applyHomeBackground(){document.documentElement.toggleAttribute('data-home-background',state.route==='home'&&state.rootValid&&!!state.background.url);}
const clientLogo=(c=state.clients.find(x=>x.folder===state.client))=>c?.logo?`<img class="client-logo" src="${escape(c.logo)}" alt="">`:'';
async function call(method,...args){if(!api)throw new Error('Apri SocialDesk dall’applicazione per accedere ai file.');const response=await api[method](...args);if(!response.ok){const e=new Error(response.error.message);e.code=response.error.code;if(e.code==='CHANGED'&&/Il piano è cambiato/.test(e.message))changedMessages.add(e.message);throw e;}return response.value;}
const CAPS_HINT='Non scrivere il titolo tutto in maiuscolo: va bene solo la prima lettera (es. «Buone feste»).';
function allCaps(title){const letters=String(title||'').match(/\p{L}/gu)||[];return letters.length>1&&!/\p{Ll}/u.test(title)&&/\p{Lu}/u.test(title);}
function showCapsHint(id,on){const hint=document.getElementById(id);if(hint)hint.hidden=!on;}
function editCapsBlocked(title,post){const t=String(title||'').trim();return allCaps(t)&&t!==String(post.title||'').trim();}
function valid(){
 if(state.step===0)return state.rootValid&&state.post.channels.length>0;
 if(state.step===1)return !allCaps(state.post.title.trim())&&state.post.title.trim().length>0&&state.post.title.trim().length<=140&&state.post.channels.length>0&&state.post.channels.length>0;
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
 applyHomeBackground();
 const section=state.listMode==='posts'?'Tutti i post':'Post in bozza';
 const who=clientName()?` — ${clientName()}`:'';
 document.title=(state.route==='home'?'SocialDesk':state.route==='create'?'SocialDesk — Nuovo post':state.route==='settings'?'SocialDesk — Impostazioni':state.route==='ideas'?'SocialDesk — Idee':'SocialDesk — '+section)+who;
 if(state.route==='home')renderHome();
 else if(state.route==='settings')renderSettings();
 else if(state.route==='drafts'||state.route==='posts')renderDrafts();
 else if(state.route==='ideas')renderIdeas();
 else{
  renderWizard();
  if(!state.loading){const home=document.createElement('button');home.type='button';home.setAttribute('pgs',"button['btnTransparent']");home.className='home-link';home.innerHTML=`${icon('arrowLeft')}<span>Torna alla home</span>`;home.addEventListener('click',goHome);footer.prepend(home);}
 }
 enhance(main);enhance(footer);enhance(progress);
 renderAppFooter();
}
function renderHeader(){
 const active=state.route==='home'||state.route==='settings'?'':state.route==='create'?'create':state.route==='ideas'?'ideas':state.listMode;
 renderClientSlot();
 document.querySelectorAll('[data-nav]').forEach(link=>{
  if(link.dataset.nav===active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  // senza cartella Social raggiungibile i collegamenti sono spenti (resta il logo per la home)
  const off=state.loading||!state.rootValid;link.setAttribute('aria-disabled',String(off));link.tabIndex=off?-1:0;
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
 if(state.step===0)content=`<h1 pgs="h2">Dove vuoi pubblicare?</h1><p class="lead">Seleziona uno o più social per questo post.</p><fieldset pgs="grid['column-3' 'gapParagraphs']" class="social-list"><legend pgs="visuallyHidden">Social del post</legend>${clientPlatforms().map(c=>`<label pgs="button['btnTwoState' 'btnVertical']" class="channel-chip social-option" data-channel="${c}"><input type="checkbox" name="social" value="${c}" ${state.post.channels.includes(c)?'checked':''}>${socialIcon(c)}<span>${c}</span></label>`).join('')}</fieldset>${state.rootValid?'':`<div pgs="alert['alertWarning']" role="alert"><i pgs="icon['icon-triangleExclamation'] alert-icon" aria-hidden="true"></i><div pgs="alert-content flex['column' 'gapParagraphs']"><p>La cartella Social non è configurata.</p><button pgs="button" id="create-open-settings" type="button">${icon('gear')}<span>Apri Impostazioni</span></button></div></div>`}`;
 if(state.step===1)content=`<h1 pgs="h2">Di cosa parla il post?</h1><p class="lead">Titolo e argomento saranno uguali per i social selezionati. Il formato si può scegliere anche più avanti.</p><div pgs="form flex['column' 'gapElements']">${field('Titolo',`<input pgs="input" id="title" maxlength="140" autocomplete="off" required placeholder=" " aria-describedby="title-caps" value="${escape(state.post.title)}">`)}<p class="hint field-error" id="title-caps" role="alert" ${allCaps(state.post.title.trim())?'':'hidden'}>${CAPS_HINT}</p>${field('Argomento <span class="optional">(facoltativo)</span>',`<input pgs="input" id="topic" maxlength="200" autocomplete="off" placeholder=" " value="${escape(state.post.topic)}">`)}<div pgs="grid['column-3' 'gapParagraphs']">${state.post.channels.map(channel=>channelCard(channel,field('Formato <span class="optional">(facoltativo)</span>',`<select pgs="select" id="format-${channel.toLowerCase()}" data-channel-format="${channel}"><option value="" ${state.post.channelFormats[channel]?'':'selected'}>Da definire</option>${platformFormats(channel).map(format=>`<option value="${format}" ${state.post.channelFormats[channel]===format?'selected':''}>${format}</option>`).join('')}</select>`))).join('')}</div></div>`;
 if(state.step===2){
  const allUndefined=state.post.channels.every(channel=>state.post.channelDates[channel]?.undefinedDate);
  content=`<h1 pgs="h2">Quando vuoi pubblicare?</h1><p class="lead">Scegli la data per ogni social, oppure lasciala da definire.</p><div pgs="form flex['column' 'gapElements']"><div pgs="grid['column-3' 'gapParagraphs']">${state.post.channels.map(channel=>{const item=state.post.channelDates[channel],id=channel.toLowerCase();return channelCard(channel,`${field('Data pubblicazione',`<input pgs="input" type="date" id="date-${id}" data-channel-date="${channel}" value="${escape(item.date)}" ${disabled(item.undefinedDate)}>`)}<label pgs="checkbox"><input type="checkbox" data-undefined-date="${channel}" ${item.undefinedDate?'checked':''}><span>Data da definire</span></label>`);}).join('')}</div>${allUndefined?`<div class="year-field">${field('Anno',`<input pgs="input" id="year" type="number" inputmode="numeric" min="1900" max="9999" step="1" value="${escape(state.post.year)}">`,'Anno della scheda del piano editoriale.')}</div>`:''}<p class="hint">I social dello stesso post devono restare nello stesso anno per condividere l’ID.</p></div>`;
 }
 if(state.step===3){
  const p=state.plan;
  content=p?`<h1 pgs="h2">È tutto pronto?</h1><p class="lead">Controlla i dati prima di creare il post.</p><dl pgs="box" class="review"><dt>Titolo</dt><dd>${escape(p.title)}</dd><dt>Social</dt><dd>${escape(p.channels.join(', '))}</dd><dt>Anno</dt><dd>${p.year}</dd><dt>Argomento</dt><dd>${escape(p.topic||'—')}</dd><dt>ID post</dt><dd>${p.id}</dd>${p.unified?`<dt>Cartella</dt><dd class="path">${escape(p.folders[0].relative)}</dd>`:''}</dl><div pgs="grid['column-3' 'gapParagraphs']">${p.folders.map(f=>channelCard(f.channel,`<p pgs="flex['row' 'wrap' 'gapDetails']"><span pgs="badge['badgeNeutral']">${escape(f.format||'Formato da definire')}</span><span pgs="badge['badgeInfo']">${f.date?escape(formatDate(f.date)):'Data da definire'}</span></p>${p.unified?'':`<p class="path">${escape(f.relative)}</p>`}<p class="hint">${[f.aiName,f.videoName,f.textName].filter(Boolean).map(escape).join(' · ')}</p>`)).join('')}</div><p>${p.channels.length===1?'Verranno create una cartella e una riga':p.unified?'Verranno create una cartella comune e '+p.channels.length+' righe':'Verranno create '+p.channels.length+' cartelle e '+p.channels.length+' righe'} nel piano editoriale, nella scheda <strong>${p.year}</strong>.</p>`:`<h1 pgs="h2">Controllo dei dati</h1><p class="lead loading">Verifico cartelle, template e piano editoriale…</p>`;
 }
 main.innerHTML=`${content}${errorBox()}`;
 footer.innerHTML=`<span pgs="badge['badgeNeutral']">Passo ${state.step+1} di 4</span><div pgs="flex['row' 'gapParagraphs']"><button pgs="button" id="back" type="button" ${state.step===0||state.loading?'disabled':''}>${icon('arrowLeft')}<span>Indietro</span></button><button pgs="button['btnStrong' 'btnReverse']" id="next" type="button" ${!valid()||state.loading?'disabled':''}><span>${state.loading?'Attendi…':state.step===3?'Crea post':'Continua'}</span>${state.step===3?icon('check'):icon('arrowRight')}</button></div>`;
 wire();
}
function error(message){state.error=message;setAlert(document.getElementById('error'),message);}
function wire(){
 document.querySelectorAll('[name=social]').forEach(input=>input.addEventListener('change',()=>{state.post.channels=Array.from(document.querySelectorAll('[name=social]:checked')).map(x=>x.value);for(const channel of state.post.channels){state.post.channelDates[channel]??={date:localToday(),undefinedDate:true};state.post.channelFormats[channel]??='';}state.plan=null;error('');updateContinue();}));
 document.getElementById('create-open-settings')?.addEventListener('click',async()=>{if(await confirmLeave())openSettings('app');});
 for(const id of ['title','topic','year'])document.getElementById(id)?.addEventListener('input',event=>{state.post[id]=event.target.value;state.plan=null;error('');if(id==='title')showCapsHint('title-caps',allCaps(event.target.value.trim()));updateContinue();});
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
 const job=progressToast('Creazione del post');
 try{
  state.result=await call('create',state.post,state.plan.fingerprint);
  let note='';
  // post nato da un'idea: l'idea viene segnata come sviluppata
  if(state.post.fromIdea){try{await call('changeIdea',{action:'update',id:state.post.fromIdea,done:true});note=' L’idea è stata segnata come sviluppata.';state.ideas=null;}catch{}}
  job.success('Post creato',`${state.result.title} · ${state.result.channels.join(', ')}.${note}`);
 }
 catch(e){job.cancel();state.error=e.message;if(e.code==='CHANGED'){try{state.plan=await call('plan',state.post);}catch{state.plan=null;}}}
 finally{state.loading=false;render();}
}
function renderSuccess(){
 const r=state.result,single=new Set(r.created.map(f=>f.path)).size===1;
 main.innerHTML=`<div pgs="alert['alertSuccess']" role="status"><i pgs="icon['icon-circleCheck'] alert-icon" aria-hidden="true"></i><div pgs="alert-content"><h1 pgs="alert-content-title h3">Post creato</h1><p>${single?(r.channels.length===1?'La cartella e la riga Excel sono pronte.':'La cartella e le righe Excel sono pronte.'):'Le '+r.channels.length+' cartelle e le righe Excel sono pronte.'}</p></div></div><dl pgs="box" class="review"><dt>Titolo</dt><dd>${escape(r.title)}</dd><dt>ID post</dt><dd>${r.id}</dd><dt>Anno</dt><dd>${r.year}</dd>${single?`<dt>Social</dt><dd>${escape(r.channels.join(', '))}</dd><dt>Cartella</dt><dd class="path">${escape(r.created[0].path)}</dd>`:''}</dl>${single?'':`<div pgs="grid['column-3' 'gapParagraphs']">${r.created.map(f=>channelCard(f.channel,`<p class="path">${escape(f.path)}</p>`)).join('')}</div>`}<div pgs="flex['row' 'wrap' 'gapParagraphs']"><button pgs="button" data-created-open="edit" type="button">${icon('pencil')}<span>Modifica post</span></button><button pgs="button" data-created-open="details" type="button">${icon('eye')}<span>Visualizza post</span></button><button pgs="button['btnStrong']" id="new-post" type="button">${icon('plus')}<span>Crea un altro post</span></button></div><div id="error" role="alert"></div>`;
 footer.innerHTML=`<span pgs="badge['badgeSuccess']">${icon('check')}Creazione completata</span>`;
 // Modifica / Visualizza: carica Tutti i post e apre la riga appena creata (il primo social scelto; gli altri dallo switch dei Dettagli).
 document.querySelectorAll('[data-created-open]').forEach(button=>button.addEventListener('click',async()=>{
  const kind=button.dataset.createdOpen,created={year:r.year,id:r.id,channel:r.channels[0]};
  await loadList('posts');
  const post=state.drafts.find(p=>p.year===created.year&&String(p.id)===String(created.id)&&p.channel===created.channel);
  if(!post){error('Non trovo il post appena creato nell’elenco: aggiorna l’elenco.');return;}
  if(kind==='edit')openPostEditor(post,null);else openPostDetails(post,null);
 }));
 document.getElementById('new-post').addEventListener('click',()=>{state.step=0;state.visited=0;state.post=initialPost();state.plan=null;state.result=null;state.error='';render();});
}
async function goHome(){if(state.loading||!await confirmLeave())return;state.route='home';state.error='';state.notice='';state.selected=null;state.highlight=null;render();window.scrollTo({top:0});refreshUpdate();}
// Aggiornamento: App Social/versione.json nella cartella Social. Controllato all'avvio e tornando in home (al massimo ogni minuto).
let lastUpdateCheck=0;
async function refreshUpdate(force=false){
 if(!state.baseValid||!api?.checkUpdate||(!force&&Date.now()-lastUpdateCheck<60000))return;
 lastUpdateCheck=Date.now();
 try{const result=await call('checkUpdate');const changed=!!result.available!==!!state.update?.available||result.version!==state.update?.version;state.update=result;if(changed&&!state.loading)renderAppFooter();}catch{}
}
// Cerca aggiornamenti: controllo esplicito, con risposta anche quando non c'è nulla da installare
async function checkUpdateNow(){
 if(state.loading||state.checkingUpdate)return;
 state.checkingUpdate=true;renderAppFooter();
 try{
  const result=await call('checkUpdate');lastUpdateCheck=Date.now();state.update=result;
  if(result.available){state.checkingUpdate=false;render();openUpdateModal();return;}
  if(result.reason)globalThis.pgs?.toast.error({title:'Aggiornamenti non controllati',description:result.reason,timeout:6000,closeTitle:'Chiudi'});
  else globalThis.pgs?.toast.success({title:'Hai già l’ultima versione',description:`SocialDesk ${state.version}`,timeout:3000,closeTitle:'Chiudi'});
  bringToastToFront();
 }catch(e){globalThis.pgs?.toast.error({title:'Aggiornamenti non controllati',description:e.message,timeout:6000,closeTitle:'Chiudi'});bringToastToFront();}
 finally{state.checkingUpdate=false;renderAppFooter();document.getElementById('check-update')?.focus({preventScroll:true});}
}
function openUpdateModal(){
 if(anyModalOpen()||!state.update?.available)return;
 const u=state.update,opener=document.getElementById('install-update');
 const body=`<p>È disponibile <strong>SocialDesk ${escape(u.version)}</strong> (ora usi la ${escape(state.version)}).</p>${u.notes?`<p class="hint">${escape(u.notes)}</p>`:''}<p>SocialDesk si chiuderà, installerà la nuova versione dalla cartella App Social e si riaprirà da solo. Le impostazioni restano invariate.</p><div id="update-error" role="alert" hidden></div><div pgs="flex['row' 'justifyEnd' 'gapParagraphs']"><button pgs="button" id="update-later" type="button">Più tardi</button><button pgs="button['btnStrong']" id="update-now" type="button">${icon('download')}<span>Aggiorna ora</span></button></div>`;
 const modal=createModal({title:'Aggiorna SocialDesk',titleId:'update-title',body,onClose:()=>{if(opener?.isConnected)opener.focus({preventScroll:true});}});
 modal.dialog.id='update-modal';
 const now=modal.dialog.querySelector('#update-now'),message=modal.dialog.querySelector('#update-error');
 modal.dialog.querySelector('#update-later').addEventListener('click',()=>modal.close());
 now.addEventListener('click',async()=>{
  if(modal.busy)return;modal.busy=true;state.loading=true;setAlert(message,'');
  modal.dialog.querySelectorAll('button').forEach(button=>button.disabled=true);now.textContent='Aggiornamento in corso…';
  try{await call('installUpdate');setAlert(message,'SocialDesk si chiude e si riapre con la nuova versione tra pochi secondi.','info');}
  catch(e){modal.busy=false;state.loading=false;modal.dialog.querySelectorAll('button').forEach(button=>button.disabled=false);now.innerHTML=`${icon('download')}<span>Aggiorna ora</span>`;setAlert(message,e.message);}
 });
 modal.open();now.focus();
}
// Nessun cliente nella cartella Social: al posto della home il benvenuto con Crea cliente
function renderWelcome(){
 main.innerHTML=`<section pgs="flex['column' 'itemCenter' 'gapElements']" class="welcome"><img class="welcome-logo" src="assets/socialdesk-logo.svg" alt="" width="120" height="120"><h1 pgs="h2">Benvenuto in SocialDesk</h1><p class="lead">Qui organizzi i post social dei tuoi clienti: idee, testi, grafiche e piano editoriale, tutto nella stessa cartella.</p><p class="hint">Per iniziare crea il primo cliente. In Social verrà creata la sua cartella con il piano editoriale e le cartelle per i post, le impostazioni e i template.</p><button pgs="button['btnStrong']" id="welcome-create" type="button" ${disabled(state.loading)}>${icon('circlePlus')}<span>Crea cliente</span></button></section>${noticeBox()}${errorBox()}`;
 footer.innerHTML='';
 document.getElementById('welcome-create').addEventListener('click',event=>openClientModal(event.currentTarget));
}
function renderHome(){
 if(state.baseValid&&!state.clients.length){renderWelcome();return;}
 const card=(id,tone,image,label)=>`<button pgs="box${tone?` background['${tone}']`:''} flex['column' 'itemCenter' 'gapParagraphs']" class="home-action" id="${id}" type="button" ${disabled(state.loading||!state.rootValid)}><img src="assets/${image}" alt="" width="240" height="240"><span pgs="h4">${label}</span></button>`;
 // Home: a sinistra Tutti i post e Post in bozza nello stesso riquadro, a destra Crea nuovo post, sotto Idee
 const row=(id,image,label)=>`<button pgs="flex['row' 'itemCenter' 'gapParagraphs']" class="home-action home-row" id="${id}" type="button" ${disabled(state.loading||!state.rootValid)}><img src="assets/${image}" alt="" width="120" height="120"><span pgs="h4">${label}</span></button>`;
 const rootError=homeErrorBox();
 // in alto il saluto con il nome del cliente; Cambia cliente (stesso elenco della freccia nell'header) nella riga in basso, accanto ad Aggiorna
 const current=state.clients.find(c=>c.folder===state.client);
 const greeting=current?`Ciao, ${current.name}`:'Ciao!';
 const switcher=state.baseValid&&state.clients.length?`<span pgs="dropdown" pgs-data="dropdownPosition[top]" class="client-dropdown home-client-dropdown"><button pgs="dropdown-button button" id="home-client-switch" type="button" aria-haspopup="true" ${disabled(state.loading)}>${icon('users')}<span>Cambia cliente</span>${icon('chevronDown')}</button><div pgs="dropdown-content" class="client-menu"><nav pgs="menu" aria-label="Clienti"><ul pgs="buttonGroup['btgVertical' 'btgFill']">${clientMenuItems()}<li><button pgs="button['btnTransparent' 'btnPaddingEqual']" id="home-client-create" type="button">${icon('circlePlus')}<span>Crea cliente</span></button></li></ul></nav></div></span>`:'';
 main.innerHTML=`${noticeBox()}${rootError}<div pgs="flex['column' 'itemCenter' 'gapDetails']" class="home-heading"><h1 pgs="h2" class="home-title">${escape(greeting)}</h1></div><div pgs="grid['column-2' 'gapElements']" class="home-actions"><div pgs="box flex['column']" class="home-pair">${row('all-posts','calendar.png','Tutti i post')}<hr class="home-divider">${row('drafts','draft.png','Post in bozza')}</div>${card('create-new','bgPrimarySoft','megaphone.png','Crea nuovo post')}<button pgs="box flex['row' 'itemCenter' 'gapParagraphs']" class="home-action home-ideas" id="home-ideas" type="button" ${disabled(state.loading||!state.rootValid)}><img src="assets/idea.png" alt="" width="120" height="120"><span pgs="flex['column' 'gapDetails']"><span pgs="h4">Idee</span><span class="hint">Le idee per i prossimi post, condivise con tutti.</span></span></button></div><hr><div pgs="flex['row' 'wrap' 'itemCenter' 'gapParagraphs']" class="home-settings"><button pgs="button" id="client-settings" type="button" ${disabled(state.loading||!state.rootValid)}>${icon('user')}<span>Impostazioni del cliente</span></button><button pgs="button" id="sync-assets" type="button" ${disabled(state.loading||!state.rootValid)} title="Copia le immagini di tutti i post in 03_Template/Archivio asset, divise per social e anno">${icon('images')}<span>${state.assetSyncing?'Aggiornamento…':'Aggiorna archivio asset'}</span></button>${state.baseValid?`<button pgs="button" id="home-recheck" class="${state.checkingRoot?'is-checking':''}" type="button" title="Ricontrolla la cartella Social e i clienti (es. dopo aver collegato il disco o la VPN)" ${disabled(state.loading||state.checkingRoot)}>${icon('refresh')}<span>${state.checkingRoot?'Controllo…':'Aggiorna'}</span></button>`:''}${switcher}</div>`;
 footer.innerHTML='';
 document.getElementById('choose-root')?.addEventListener('click',chooseRootFromHome);
 document.getElementById('sync-assets').addEventListener('click',syncAssets);
 document.getElementById('client-settings').addEventListener('click',()=>openSettings('client'));
 document.getElementById('drafts').addEventListener('click',loadDrafts);
 document.getElementById('all-posts').addEventListener('click',loadPosts);
 document.getElementById('create-new').addEventListener('click',startCreate);
 document.getElementById('home-ideas').addEventListener('click',openIdeas);
 document.getElementById('home-recheck')?.addEventListener('click',recheckRoot);
 document.getElementById('recheck-root')?.addEventListener('click',recheckRoot);
 main.querySelectorAll('.home-client-dropdown [data-client]').forEach(button=>button.addEventListener('click',()=>selectClient(button.dataset.client)));
 document.getElementById('home-client-create')?.addEventListener('click',()=>openClientModal(document.getElementById('home-client-switch')));
}
// Header: a sinistra il logo e il nome del cliente (link alla home) e la freccia che apre l'elenco dei clienti
// (dropdown di myPgs con menu buttonGroup verticale): clienti e, per ultimo, Crea cliente.
// Senza clienti in Social c'è direttamente Crea cliente. Si ridisegna solo quando cambia qualcosa.
let clientSlotKey='';
// Voci dell'elenco dei clienti (menu della freccia nell'header e Cambia cliente in home): il cliente in uso ha il cerchio
// con la spunta, gli altri un cerchio vuoto; senza logo l'iniziale del nome, così i nomi restano allineati
function clientMenuItems(){
 return state.clients.map(c=>{const here=c.folder===state.client;return `<li><button pgs="button['btnTransparent' 'btnPaddingEqual'${here?" 'btnCurrent'":''}]" type="button" data-client="${escape(c.folder)}" ${here?'aria-current="page"':''}>${here?icon('circleCheck'):'<span class="client-check-space" aria-hidden="true"></span>'}${clientLogo(c)||`<span class="client-logo client-logo-initial" aria-hidden="true">${escape((c.name||'?').trim().charAt(0).toUpperCase())}</span>`}<span>${escape(c.name)}</span></button></li>`;}).join('');
}
function renderClientSlot(){
 const slot=document.getElementById('client-slot');if(!slot)return;
 const off=state.loading||!state.baseValid;
 const key=JSON.stringify([state.clients,state.client,off,state.loading,state.root]);
 if(key===clientSlotKey)return;clientSlotKey=key;
 const current=state.clients.find(c=>c.folder===state.client);
 if(!state.root)slot.innerHTML=`<a pgs="logo" class="app-brand" id="brand-home" href="#home" aria-label="SocialDesk — Home"><span pgs="logo-text">SocialDesk</span></a>`;
 else if(!state.clients.length)slot.innerHTML=`<button pgs="button['btnTransparent']" id="client-create" class="client-create-first" type="button" ${disabled(off)}>${icon('circlePlus')}<span>Crea cliente</span></button>`;
 else{
  const items=clientMenuItems();
  const name=current?.name||'Scegli un cliente';
  slot.innerHTML=`<a pgs="logo" class="app-brand client-brand" id="brand-home" href="#home" aria-label="${escape(name)} — Home" title="Torna alla home" aria-disabled="${state.loading}">${current?.logo?`<img pgs="logo-image" class="client-brand-logo" src="${escape(current.logo)}" alt="">`:''}<span pgs="logo-text" class="client-brand-name">${escape(name)}</span></a><span pgs="dropdown" pgs-data="dropdownPosition[bottom]" class="client-dropdown"><button pgs="dropdown-button button['btnIconOnly' 'btnTransparent']" id="client-switch" class="client-switch" type="button" aria-haspopup="true" aria-label="Cambia cliente" title="Cambia cliente" ${disabled(off)}>${icon('chevronDown')}</button><div pgs="dropdown-content" class="client-menu"><nav pgs="menu" aria-label="Clienti"><ul pgs="buttonGroup['btgVertical' 'btgFill']">${items}<li><button pgs="button['btnTransparent' 'btnPaddingEqual']" id="client-create" type="button">${icon('circlePlus')}<span>Crea cliente</span></button></li></ul></nav></div></span>`;
 }
 enhance(slot);
 slot.querySelector('#brand-home')?.addEventListener('click',event=>{event.preventDefault();closeCompactMenu();goHome();});
 slot.querySelectorAll('[data-client]').forEach(button=>button.addEventListener('click',()=>selectClient(button.dataset.client)));
 slot.querySelector('#client-create')?.addEventListener('click',()=>openClientModal(document.getElementById('client-switch')||document.getElementById('client-create')));
}
// Footer dell'app, su tutte le pagine: logo SocialDesk, impostazioni dell'app, versione e aggiornamenti
function renderAppFooter(){
 const host=document.getElementById('app-footer');if(!host)return;
 const update=state.update?.available?`<button pgs="button['btnStrong' 'btnMini']" id="install-update" type="button" ${disabled(state.loading)} title="Installa la versione ${escape(state.update.version)} da App Social">${icon('download')}<span>Aggiorna alla ${escape(state.update.version)}</span></button>`:`<button pgs="button['btnMini']" id="check-update" type="button" ${disabled(state.loading||state.checkingUpdate)} title="Controlla se in App Social c'è una versione più recente">${icon('download')}<span>${state.checkingUpdate?'Controllo…':'Cerca aggiornamenti'}</span></button>`;
 host.innerHTML=`<section pgs="footer-legal section"><div pgs="footer-legal-content"><a pgs="logo" href="#home" id="footer-home" class="footer-brand-link" aria-label="SocialDesk — Home"><img pgs="logo-image" src="assets/socialdesk-logo.svg" alt=""><span pgs="logo-text">SocialDesk</span></a><button pgs="button['btnMini']" id="open-settings" type="button" ${disabled(state.loading)} ${state.route==='settings'&&state.settingsTab==='app'?'aria-current="page"':''}>${icon('gear')}<span>Impostazioni</span></button>${state.version?`<span pgs="badge['badgeNeutral']" class="app-version">Versione ${escape(state.version)}</span>${update}`:''}</div></section>`;
 enhance(host);
 host.querySelector('#footer-home').addEventListener('click',event=>{event.preventDefault();goHome();});
 host.querySelector('#open-settings').addEventListener('click',async()=>{if(state.loading||!await confirmLeave())return;openSettings('app');});
 host.querySelector('#install-update')?.addEventListener('click',openUpdateModal);
 host.querySelector('#check-update')?.addEventListener('click',checkUpdateNow);
}
async function selectClient(folder){
 closeClientMenu();
 if(state.loading||folder===state.client)return;
 // una creazione iniziata appartiene al cliente di prima: si chiede prima di perderla
 if(state.route==='create'&&!(await confirmLeave()))return;
 state.loading=true;state.error='';state.notice='';render();
 let ok=false;
 try{applyStatus(await call('selectClient',folder));state.drafts=[];state.ideas=null;state.highlight=null;state.expandedGroups=new Set();ok=true;}
 catch(e){state.error=e.message;}
 finally{state.loading=false;}
 // la pagina aperta si ricarica con i dati del nuovo cliente (elenco con i filtri di partenza)
 const route=state.route;
 if(ok&&state.rootValid&&(route==='posts'||route==='drafts')){state.route='home';await loadList(state.listMode);}
 else if(ok&&state.rootValid&&route==='ideas')await openIdeas();
 else if(ok&&route==='settings')await openSettings();
 else if(ok&&route==='create'){state.route='home';render();startCreate();}
 else{if(ok&&!state.rootValid)state.route='home';render();}
 document.getElementById('client-switch')?.focus({preventScroll:true});
}
// chiude i menu dei clienti (freccia nell'header e Cambia cliente in home) prima di ridisegnare la pagina:
// un menu ridisegnato mentre è aperto resterebbe «aperto» per myPgs e il clic dopo lo chiuderebbe invece di aprirlo
function closeClientMenu(){document.querySelectorAll('.client-dropdown').forEach(root=>{try{globalThis.pgs?.dropdown.api(root)?.close();}catch{}});}
// Crea cliente a passi (stepTabs di myPgs): 1) nome, controllato subito (valido e non già usato); 2) logo facoltativo
// (il file lo tiene il main, qui solo l'anteprima); 3) social gestiti, almeno uno. Poi Social/<nome> con piano vuoto e cartelle fisse.
async function openClientModal(opener){
 closeClientMenu();
 if(state.loading||anyModalOpen())return;
 if(state.route==='create'&&!(await confirmLeave()))return;
 // il flex sta dentro il passo: su stepTabs-container-tab vincerebbe sul display:none dei passi non attivi
 const tab=(iconName,content,locked=false)=>`<section pgs="stepTabs-container-tab flex['column' 'gapParagraphs']" pgs-data="stepTabsIcon[icon-${iconName}]" tabindex="-1" ${locked?'pgs-state="locked"':''}>${content}</section>`;
 const step1=tab('pencil',`<h3 pgs="h5">Come si chiama il cliente?</h3><div pgs="form flex['column' 'gapParagraphs']">${field('Nome del cliente',`<input pgs="input" id="client-name" maxlength="60" autocomplete="off" required placeholder=" ">`)}<p class="hint" id="client-folder-preview" aria-live="polite">Verrà creata in Social una cartella con questo nome (gli spazi diventano “_”).</p></div>`,true);
 const step2=tab('image',`<h3 pgs="h5">Logo <span class="optional">(facoltativo)</span></h3><p class="hint">Compare accanto al nome del cliente in alto. PNG, JPG, WEBP, GIF o SVG, massimo 2 MB. Puoi aggiungerlo anche dopo in Impostazioni del cliente.</p><div pgs="flex['row' 'wrap' 'itemCenter' 'gapParagraphs']" class="client-logo-row"><span id="new-client-logo" class="client-logo-preview client-logo-empty" aria-hidden="true">${icon('image')}</span><button pgs="button" type="button" id="new-client-logo-pick">${icon('upload')}<span>Scegli immagine</span></button><button pgs="button['btnTransparent']" type="button" id="new-client-logo-clear" hidden>${icon('trash')}<span>Togli</span></button></div>`);
 const step3=tab('globe',`<h3 pgs="h5">Su quali social pubblica?</h3><p class="hint">Scegline almeno uno. Potrai cambiarli in Impostazioni del cliente.</p><fieldset pgs="chips" class="channel-chips platform-choices"><legend pgs="visuallyHidden">Social del cliente</legend>${CHANNELS.map(c=>`<label pgs="button['btnMini' 'btnTwoState']" class="channel-chip" data-channel="${c}"><input type="checkbox" data-new-platform="${c}">${socialIcon(c)}<span>${c}</span></label>`).join('')}</fieldset>`);
 const body=`<div pgs="stepTabs flex['column' 'gapElements']" class="client-wizard"><div pgs="stepTabs-dots" role="group" aria-label="Passi"></div><div pgs="stepTabs-container">${step1}${step2}${step3}</div><div id="client-error" role="alert" hidden></div><div pgs="flex['row' 'wrap' 'justifyBetween' 'gapParagraphs']" class="client-wizard-actions"><button pgs="stepTabs-prev button" type="button">${icon('arrowLeft')}<span>Indietro</span></button><span pgs="flex['row' 'gapParagraphs']"><button pgs="button" type="button" id="client-cancel">Annulla</button><button pgs="stepTabs-next button['btnReverse']" type="button" id="client-next"><span>Avanti</span>${icon('arrowRight')}</button><button pgs="button['btnStrong']" type="button" id="client-save" hidden disabled>${icon('circlePlus')}<span>Crea cliente</span></button></span></div></div>`;
 let created=false;
 const modal=createModal({title:'Crea cliente',titleId:'client-modal-title',body,size:'dialogMedium',onClose:()=>{if(!created)call('clearClientLogo').catch(()=>{});if(opener?.isConnected)opener.focus({preventScroll:true});}});
 const dialog=modal.dialog,root=dialog.querySelector('.client-wizard');
 const input=dialog.querySelector('#client-name'),preview=dialog.querySelector('#client-folder-preview'),message=dialog.querySelector('#client-error');
 const next=dialog.querySelector('#client-next'),save=dialog.querySelector('#client-save');
 try{globalThis.pgs?.stepTabs.init(dialog);}catch(e){console.error(e);}
 const wizard=()=>{try{return globalThis.pgs?.stepTabs.api(root);}catch{return null;}};
 let checked='',checkTimer=null,valid=false;
 // passo 1: il nome si controlla mentre si scrive; finché non va bene Avanti resta bloccato
 const lock=on=>{valid=!on;try{wizard()?.toggleLock(0,on);}catch{}};
 const checkName=async()=>{
  const value=input.value;
  if(!value.trim()){lock(true);preview.textContent='Verrà creata in Social una cartella con questo nome (gli spazi diventano “_”).';preview.classList.remove('field-error');return;}
  try{const r=await call('checkClientName',value);if(input.value!==value)return;checked=value;preview.textContent=`Cartella: Social/${r.folder}`;preview.classList.remove('field-error');lock(false);}
  catch(e){if(input.value!==value)return;preview.textContent=e.message;preview.classList.add('field-error');lock(true);}
 };
 input.addEventListener('input',()=>{lock(true);clearTimeout(checkTimer);checkTimer=setTimeout(checkName,250);});
 input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();if(valid&&checked===input.value)wizard()?.next();}});
 // passo 2: logo facoltativo
 const logoBox=dialog.querySelector('#new-client-logo'),clear=dialog.querySelector('#new-client-logo-clear');let hasLogo=false;
 dialog.querySelector('#new-client-logo-pick').addEventListener('click',async()=>{
  setAlert(message,'');
  try{const r=await call('pickClientLogo');if(!r)return;hasLogo=true;logoBox.outerHTML=`<img id="new-client-logo" class="client-logo-preview" src="${escape(r.preview)}" alt="Logo scelto: ${escape(r.name)}">`;clear.hidden=false;}
  catch(e){setAlert(message,e.message);}
 });
 clear.addEventListener('click',async()=>{await call('clearClientLogo').catch(()=>{});hasLogo=false;dialog.querySelector('#new-client-logo').outerHTML=`<span id="new-client-logo" class="client-logo-preview client-logo-empty" aria-hidden="true">${icon('image')}</span>`;clear.hidden=true;});
 // passo 3: almeno un social
 const chosen=()=>[...dialog.querySelectorAll('[data-new-platform]:checked')].map(x=>x.dataset.newPlatform);
 dialog.querySelectorAll('[data-new-platform]').forEach(x=>x.addEventListener('change',()=>{save.disabled=!chosen().length;}));
 // sull'ultimo passo Avanti diventa Crea cliente
 root.addEventListener('pgs:stepTabs:change',event=>{const last=event.detail?.current===event.detail?.total-1;next.hidden=last;save.hidden=!last;setAlert(message,'');if(event.detail?.current===0)input.focus();});
 dialog.querySelector('#client-cancel').addEventListener('click',()=>modal.close());
 save.addEventListener('click',async()=>{
  if(modal.busy||!chosen().length)return;
  modal.busy=true;save.disabled=true;setAlert(message,'');
  try{
   const result=await call('createClient',{name:input.value,platforms:chosen(),logo:hasLogo});
   created=true;
   applyStatus(result);state.drafts=[];state.ideas=null;state.highlight=null;state.expandedGroups=new Set();
   modal.busy=false;modal.close();state.route='home';render();
   const warnings=result.created?.warnings||[];
   globalThis.pgs?.toast[warnings.length?'warning':'success']({title:'Cliente creato',description:`${result.created?.name||''}${warnings.length?': '+warnings.join(' '):': carica i template in Impostazioni del cliente.'}`,timeout:6000,closeTitle:'Chiudi'});bringToastToFront();
  }catch(e){modal.busy=false;save.disabled=false;setAlert(message,e.message);}
 });
 modal.open();input.focus();
}
// Ricontrolla la cartella Social senza riavviare l'app (disco non collegato, VPN spenta…)
async function recheckRoot(){
 if(state.loading||state.checkingRoot)return;
 state.checkingRoot=true;state.notice='';render();
 try{
  const result=await call('initial');
  applyStatus(result);
  if(result.valid){globalThis.pgs?.toast.success({title:'Cartella Social raggiungibile',timeout:3000,closeTitle:'Chiudi'});bringToastToFront();refreshUpdate(true);}
 }catch(e){state.error=e.message;}
 finally{state.checkingRoot=false;render();(document.getElementById('recheck-root')||document.getElementById('home-recheck'))?.focus({preventScroll:true});}
}
// Home: se la cartella Social non è valida, l'avviso offre subito la scelta della cartella
function homeErrorBox(){
 if(state.baseValid||!state.error)return errorBox();
 return `<div id="error" role="alert"><div pgs="alert['alertError']"><i pgs="icon['icon-circleXmark'] alert-icon" aria-hidden="true"></i><div pgs="alert-content flex['column' 'gapParagraphs']"><p>${escape(state.error)}</p><div pgs="flex['row' 'wrap' 'itemCenter' 'gapParagraphs']"><button pgs="button" id="choose-root" type="button" ${disabled(state.loading||state.checkingRoot)}>${icon('folderOpen')}<span>Scegli la cartella</span></button><button pgs="button" id="recheck-root" class="${state.checkingRoot?'is-checking':''}" type="button" title="Ricontrolla la cartella Social (es. dopo aver collegato il disco o la VPN)" ${disabled(state.loading||state.checkingRoot)}>${icon('refresh')}<span>${state.checkingRoot?'Controllo…':'Aggiorna'}</span></button></div></div></div></div>`;
}
async function chooseRootFromHome(){
 if(state.loading)return;
 try{const result=await call('chooseRoot');if(!result)return;applyStatus(result);state.notice='';render();refreshUpdate(true);}
 catch(e){state.error=e.message;render();}
}
// Impostazioni → Controlla cartelle: elenco dei post scollegati con Ricollega
function folderReport(){
 const r=state.folderReport;if(!r)return'';
 if(!r.length)return alertHtml('success','Tutte le cartelle dei post sono al loro posto.');
 return `<div pgs="alert['alertWarning']"><i pgs="icon['icon-triangleExclamation'] alert-icon" aria-hidden="true"></i><div pgs="alert-content"><p>${r.length===1?'Un post non trova la sua cartella.':r.length+' post non trovano la loro cartella.'}</p></div></div><ul pgs="flex['column']" class="folder-report">${r.map(m=>`<li pgs="flex['row' 'itemCenter' 'justifyBetween' 'gapParagraphs']" class="draft-item"><span pgs="flex['row' 'itemStart' 'gapParagraphs' 'nowrap']" class="post-body">${socialIcon(m.channel)}<span pgs="flex['column' 'gapDetails']" class="post-heading"><strong>${escape(m.title)}</strong><span class="post-details path">${escape(m.expected)}</span></span></span><button pgs="button['btnMini']" type="button" data-relink-key="${escape(m.key)}">${icon('folderOpen')}<span>Ricollega</span></button></li>`).join('')}</ul>`;
}
async function checkFolders(){
 if(state.checkingFolders)return;
 state.checkingFolders=true;state.error='';state.notice=state.route==='settings'?state.notice:'';render();
 try{
  const list=await call('posts');state.drafts=list.posts;state.revision=list.revision;state.years=list.years||[];
  const result=await call('missingFolders');state.folderReport=result.missing;state.missingKeys=new Set(result.missing.map(m=>m.key));
 }catch(e){state.error=e.message;state.folderReport=null;}
 finally{state.checkingFolders=false;if(state.route==='settings')render();}
}
// Finestra Ricollega cartella: cartelle orfane dello stesso social/anno, oppure scelta libera
function openRelinkModal(post,onDone){
 if(anyModalOpen('.post-edit-modal'))return;
 const request={key:post.key,revision:state.revision};
 const body=`<p pgs="flex['row' 'itemCenter' 'gapDetails']" class="hint">${socialIcon(post.channel)}<span>${escape(post.title)} · ${escape(post.channel)} ${post.year}</span></p><div id="relink-body" pgs="flex['column' 'gapParagraphs']"><p class="hint">Cerco le cartelle…</p></div><div id="relink-error" role="alert" hidden></div><div pgs="flex['row' 'wrap' 'justifyBetween' 'gapParagraphs']"><button pgs="button['btnTransparent']" id="relink-browse" type="button">${icon('folderOpen')}<span>Scegli un’altra cartella…</span></button><div pgs="flex['row' 'gapParagraphs']"><button pgs="button" id="relink-cancel" type="button">Annulla</button><button pgs="button['btnStrong']" id="relink-save" type="submit" disabled>Ricollega</button></div></div>`;
 const modal=createModal({title:'Ricollega cartella',titleId:'relink-title',body,size:'dialogMedium',form:true});
 modal.dialog.id='relink-modal';
 const message=modal.dialog.querySelector('#relink-error'),save=modal.dialog.querySelector('#relink-save'),bodyBox=modal.dialog.querySelector('#relink-body');
 const chosen=()=>modal.dialog.querySelector('input[name=relink]:checked')?.value;
 function busy(value){modal.busy=value;state.loading=value;modal.dialog.querySelectorAll('button,input').forEach(el=>{el.disabled=value;});save.disabled=value||!chosen();save.textContent=value?'Ricollego…':'Ricollega';}
 async function run(input){
  setAlert(message,'');busy(true);
  try{
   const result=await call('relink',input);
   if(result.canceled){busy(false);return;}
   state.notice=`Cartella ricollegata per ${result.channel}: “${result.from}” ora si chiama “${result.to}”.`;
   busy(false);modal.close();state.missingKeys?.delete(post.key);await onDone?.();
  }catch(e){busy(false);setAlert(message,e.message);}
 }
 modal.dialog.querySelector('#relink-cancel').addEventListener('click',()=>modal.close());
 modal.dialog.querySelector('#relink-browse').addEventListener('click',()=>{if(!modal.busy)run({...request,browse:true});});
 modal.dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();if(!modal.busy&&chosen())run({...request,name:chosen()});});
 modal.open();
 call('relinkCandidates',request).then(c=>{
  if(!modal.dialog.isConnected)return;
  const intro=`<p>Il piano editoriale cerca la cartella <strong>${escape(c.expectedName)}</strong> in <span class="path">${escape(c.parent)}</span>, ma non c’è più: forse è stata rinominata. Scegli quella giusta e le verrà ridato questo nome. Il piano Excel e i file non cambiano.</p>`;
  if(!c.candidates.length){bodyBox.innerHTML=intro+alertHtml('info',`In ${c.parent} non ci sono cartelle senza collegamento. Usa “Scegli un’altra cartella…” se è stata spostata altrove.`);return;}
  // prima le cartelle con almeno un indizio; le altre dietro "Mostra le altre cartelle"
  const option=(x,checked)=>`<label pgs="radio checkboxBackground" class="relink-option"><input type="radio" name="relink" value="${escape(x.name)}" ${checked?'checked':''}><span pgs="flex['column' 'gapDetails']"><span class="path">${escape(x.name)}</span>${x.reasons.length?`<span pgs="flex['row' 'wrap' 'gapDetails']">${x.reasons.map(r=>`<span pgs="badge['badgeInfo']">${escape(r)}</span>`).join('')}</span>`:''}</span></label>`;
  const likely=c.candidates.filter(x=>x.reasons.length),others=c.candidates.filter(x=>!x.reasons.length);
  const first=likely.length?likely:others;
  bodyBox.innerHTML=intro+`<fieldset pgs="fieldset flex['column' 'gapDetails']" class="relink-options"><legend pgs="legend">${likely.length?'Cartelle probabili':'Cartelle senza collegamento'}</legend>${first.map((x,i)=>option(x,i===0&&x.score>=3)).join('')}${likely.length&&others.length?`<div class="relink-others" hidden pgs="flex['column' 'gapDetails']">${others.map(x=>option(x,false)).join('')}</div><div><button pgs="button['btnMini' 'btnTransparent']" type="button" id="relink-more">${icon('chevronDown')}<span>Mostra le altre cartelle (${others.length})</span></button></div>`:''}</fieldset>`;
  bodyBox.querySelector('#relink-more')?.addEventListener('click',event=>{bodyBox.querySelector('.relink-others').hidden=false;event.currentTarget.parentElement.remove();});
  bodyBox.querySelectorAll('input[name=relink]').forEach(input=>input.addEventListener('change',()=>{save.disabled=modal.busy||!chosen();setAlert(message,'');}));
  save.disabled=!chosen();
 }).catch(e=>{if(modal.dialog.isConnected){bodyBox.innerHTML='';setAlert(message,e.message);}});
}
// dopo il ricollegamento dalla pagina Modifica: ricarica il testo, conserva le modifiche non salvate
async function reloadEditAfterRelink(){
 const d=state.selected,v=state.editValues;if(!d||!state.editModal)return;
 try{
  const details=await call('details',{key:d.key,revision:state.revision});
  state.editFolderMissing=!!details.folderMissing;state.editNoText=!!details.noText;const fresh=details.editableText;
  if(fresh){v.postText=fresh.content.replace(/\r\n/g,'\n');v.textName=fresh.name;v.textRevision=fresh.revision;Object.assign(state.editOriginal,{postText:v.postText,textName:v.textName,textRevision:v.textRevision});state.editTextNote='';}
  else state.editTextNote=details.textMessage||'';
 }catch(e){state.editError=e.message;}
 renderPostEdit();
}
// Due pagine di impostazioni: dell'App (dal footer; solo su questo computer: cartella Social, aspetto) e del Cliente
// (dalla home, accanto ad Aggiorna archivio asset; salvate in 02_Settings/settings.json del cliente, valgono per tutti: logo, colore, cartelle).
async function openSettings(tab){
 state.route='settings';state.error='';state.notice='';state.settings=null;if(tab)state.settingsTab=tab;render();window.scrollTo({top:0});
 if(state.settingsTab!=='client'||!state.rootValid)return;
 try{state.settings=await call('settings');render();}catch(e){error(e.message);}
}
// conferma breve dei salvataggi nelle impostazioni (toast, così non resta un avviso quando si cambia pagina)
function savedToast(title){globalThis.pgs?.toast.success({title,timeout:2500,closeTitle:'Chiudi'});bringToastToFront();}
// Impostazioni del cliente → Piattaforme gestite: quelle scelte compaiono in creazione, filtri, idee e Aggiungi social
function platformsSection(s){
 const chosen=s.platforms||DEFAULT_PLATFORMS;
 return `<section pgs="box flex['column' 'gapParagraphs']" aria-labelledby="settings-platforms-title"><h2 pgs="h4" id="settings-platforms-title">Piattaforme gestite</h2><p class="hint">Le piattaforme su cui pubblica ${escape(s.name)}: compaiono nella creazione dei post, nei filtri e nelle idee.</p><fieldset pgs="chips" class="channel-chips platform-choices"><legend pgs="visuallyHidden">Piattaforme gestite</legend>${CHANNELS.map(c=>`<label pgs="button['btnMini' 'btnTwoState']" class="channel-chip" data-channel="${c}"><input type="checkbox" data-platform-choice="${c}" ${chosen.includes(c)?'checked':''} ${disabled(state.platformsBusy)}>${socialIcon(c)}<span>${c}</span></label>`).join('')}</fieldset></section>`;
}
async function saveClientPlatforms(input){
 const chosen=[...main.querySelectorAll('[data-platform-choice]:checked')].map(x=>x.dataset.platformChoice);
 if(!chosen.length){input.checked=true;error('Il cliente deve gestire almeno una piattaforma.');return;}
 state.platformsBusy=true;state.error='';state.notice='';
 try{state.settings=await call('saveSettings',{platforms:chosen});await refreshClients();savedToast('Piattaforme salvate');}
 catch(e){state.error=e.message;}
 finally{state.platformsBusy=false;render();main.querySelector(`[data-platform-choice="${input.dataset.platformChoice}"]`)?.focus({preventScroll:true});}
}
// Impostazioni del cliente → Template: un .ai per ogni piattaforma e formato da immagine, ognuno con la sua modale
function templateStatus(t){return t.present?{tone:'badgeSuccess',text:'Caricato'}:t.fallback?{tone:'badgeWarning',text:`Usa ${t.fallback}`}:{tone:'badgeError',text:'Manca'};}
function templatesSection(s){
 const list=s.templates||[],platforms=s.platforms||DEFAULT_PLATFORMS;
 const groups=platforms.map(channel=>{
  const rows=list.filter(t=>t.channel===channel);
  const videos=platformFormats(channel).filter(f=>formatKind(f)==='video');
  return `<div pgs="flex['column' 'gapDetails']" class="template-group"><h3 pgs="h6" class="template-group-title">${socialIcon(channel)}<span>${escape(channel)}</span></h3>${rows.length?`<ul pgs="flex['column']" class="template-list">${rows.map(t=>{const st=templateStatus(t);return `<li><button pgs="button['btnTransparent']" class="template-row" type="button" data-template-channel="${escape(t.channel)}" data-template-format="${escape(t.format)}"><span class="template-format">${escape(t.format)}</span><span pgs="badge['${st.tone}']">${escape(st.text)}</span>${icon('chevronRight')}</button></li>`;}).join('')}</ul>`:''}${videos.length?`<p class="hint">${escape(videos.join(', '))}: file video vuoto (.mp4) da sostituire, nessun template.</p>`:''}</div>`;
 }).join('');
 return `<section pgs="box flex['column' 'gapParagraphs']" aria-labelledby="settings-templates-title"><h2 pgs="h4" id="settings-templates-title">Template</h2><p class="hint">Un file Illustrator per ogni piattaforma e formato: quando crei un post con quel formato viene copiato nei sorgenti. Il file scelto viene salvato in 03_Template con il nome giusto (es. “Instagram - Carosello.ai”).</p>${groups}</section>`;
}
function openTemplateModal(channel,format,opener){
 if(anyModalOpen())return;
 const find=()=>(state.settings?.templates||[]).find(t=>t.channel===channel&&t.format===format);
 const body=`<div id="template-modal-body" pgs="flex['column' 'gapParagraphs']"></div><div id="template-error" role="alert" hidden></div><div pgs="flex['row' 'wrap' 'justifyEnd' 'gapParagraphs']"><button pgs="button['btnTransparent']" type="button" id="template-remove">${icon('trash')}<span>Rimuovi</span></button><button pgs="button" type="button" id="template-close">Chiudi</button><button pgs="button['btnStrong']" type="button" id="template-choose">${icon('upload')}<span>Scegli file .ai</span></button></div>`;
 const modal=createModal({titleHtml:`<span class="modal-title-muted">Template</span> ${escape(channel)} – ${escape(format)}`,titleId:'template-modal-title',body,size:'dialogMedium',onClose:()=>{render();if(opener?.isConnected)opener.focus({preventScroll:true});}});
 const dialog=modal.dialog,message=dialog.querySelector('#template-error'),choose=dialog.querySelector('#template-choose'),remove=dialog.querySelector('#template-remove');
 const draw=()=>{
  const t=find()||{name:`${channel} - ${format}.ai`,present:false,fallback:''},st=templateStatus(t);
  dialog.querySelector('#template-modal-body').innerHTML=`<p pgs="flex['row' 'wrap' 'itemCenter' 'gapDetails']">${socialIcon(channel)}<strong>${escape(channel)}</strong><span>·</span><span>${escape(format)}</span><span pgs="badge['${st.tone}']">${escape(st.text)}</span></p><dl pgs="box['boxMini']" class="review"><dt>File</dt><dd class="path">03_Template/${escape(t.name)}</dd>${t.present&&t.modified?`<dt>Modificato</dt><dd>${escape(new Date(t.modified).toLocaleString('it-IT',{dateStyle:'medium',timeStyle:'short'}))}</dd>`:''}</dl><p class="hint">${t.present?'Quando crei un post '+escape(channel)+' con il formato '+escape(format)+' viene copiato questo file. Scegline un altro per sostituirlo.':t.fallback?`Finché non lo carichi, per questo formato viene copiato il vecchio template unico “${escape(t.fallback)}”.`:'Senza template non si può creare un post '+escape(channel)+' con il formato '+escape(format)+'. Scegli un file .ai: verrà copiato e rinominato.'}</p>`;
  enhance(dialog.querySelector('#template-modal-body'));
  remove.hidden=!t.present;choose.querySelector('span').textContent=t.present?'Sostituisci file .ai':'Scegli file .ai';
 };
 const run=async(method,done)=>{
  if(modal.busy)return;modal.busy=true;choose.disabled=remove.disabled=true;setAlert(message,'');
  try{const result=await call(method,{channel,format});if(result){state.settings=result;draw();globalThis.pgs?.toast.success({title:done,description:`${channel} – ${format}`,timeout:3000,closeTitle:'Chiudi'});bringToastToFront();}}
  catch(e){setAlert(message,e.message);}
  finally{modal.busy=false;choose.disabled=remove.disabled=false;}
 };
 choose.addEventListener('click',()=>run('chooseTemplate','Template salvato'));
 remove.addEventListener('click',()=>run('removeTemplate','Template rimosso'));
 dialog.querySelector('#template-close').addEventListener('click',()=>modal.close());
 draw();modal.open();choose.focus();
}
// dopo una modifica del logo si rilegge lo stato, così l'header mostra subito il logo nuovo
async function refreshClients(){try{const result=await call('initial');applyStatus(result);}catch{}}
function renderSettings(){
 const s=state.settings,tab=state.settingsTab==='client'?1:0;
 const appPanel=`<p class="hint">Valgono solo su questo computer, per chi usa l'app.</p><section pgs="box flex['column' 'gapParagraphs']" aria-labelledby="settings-root-title"><h2 pgs="h4" id="settings-root-title">Percorso</h2><p class="hint">La cartella Social che contiene le cartelle dei clienti.</p><div pgs="flex['row' 'itemCenter' 'gapParagraphs' 'nowrap']" class="settings-control"><p class="path folder-path" title="${escape(state.root)}">${escape(state.root||'Nessuna cartella selezionata')}</p><button pgs="button" id="settings-root" type="button">${icon('folderOpen')}<span>${state.root?'Cambia cartella':'Scegli cartella'}</span></button></div></section><section pgs="box flex['column' 'gapParagraphs']" aria-labelledby="settings-theme-title"><h2 pgs="h4" id="settings-theme-title">Aspetto</h2><p class="hint">Tema chiaro o scuro dell'app.</p><div><button pgs="button darkmodeToggle['tglLabeled']" class="theme-toggle" type="button" aria-label="Cambia tema"><i pgs="darkmodeToggle-light icon['icon-moon']" aria-hidden="true"></i><i pgs="darkmodeToggle-dark icon['icon-sun']" aria-hidden="true"></i></button></div></section>`;
 const clientPanel=!state.rootValid?alertHtml('info',state.baseValid?'Scegli o crea un cliente con la freccia in alto, accanto al nome.':'Scegli prima la cartella Social nelle impostazioni dell’app, in fondo alla pagina.'):!s?`<p class="hint">Caricamento…</p>`:`<p class="hint">Salvate nella cartella del cliente (02_Settings/settings.json): valgono per tutti quelli che lavorano su ${escape(s.name)}.</p><section pgs="box flex['column' 'gapParagraphs']" aria-labelledby="settings-name-title"><h2 pgs="h4" id="settings-name-title">Nome del cliente</h2><p class="hint">Cambia anche il nome della sua cartella in Social (gli spazi diventano “_”). Prima chiudi i file del cliente aperti, piano compreso.</p><div pgs="flex['row' 'itemCenter' 'gapParagraphs' 'nowrap']" class="settings-control client-name-control"><input pgs="input" id="client-name-input" maxlength="60" value="${escape(s.name)}" aria-label="Nome del cliente" ${disabled(state.renamingClient)}><button pgs="button" id="client-rename" type="button" disabled>${icon('pencil')}<span>${state.renamingClient?'Rinomino…':'Rinomina'}</span></button></div><div id="client-rename-error" role="alert" hidden></div></section><section pgs="box flex['column' 'gapParagraphs']" aria-labelledby="settings-logo-title"><h2 pgs="h4" id="settings-logo-title">Logo del cliente</h2><p class="hint">Compare accanto al nome del cliente in alto. PNG, JPG, WEBP, GIF o SVG, massimo 2 MB: viene copiato in 02_Settings.</p><div pgs="flex['row' 'wrap' 'itemCenter' 'gapParagraphs']" class="client-logo-row">${s.logo?`<img class="client-logo-preview" src="${escape(s.logo)}" alt="Logo di ${escape(s.name)}">`:`<span class="client-logo-preview client-logo-empty" aria-hidden="true">${icon('image')}</span>`}<button pgs="button" id="logo-choose" type="button" ${disabled(state.logoBusy)}>${icon('upload')}<span>${s.logo?'Cambia logo':'Carica logo'}</span></button>${s.logo?`<button pgs="button['btnTransparent']" id="logo-remove" type="button" ${disabled(state.logoBusy)}>${icon('trash')}<span>Rimuovi</span></button>`:''}</div></section><section pgs="box flex['column' 'gapParagraphs']" aria-labelledby="settings-background-title"><h2 pgs="h4" id="settings-background-title">Sfondo della home</h2><p class="hint">Compare dietro la home di questo cliente (solo in home). PNG, JPG, WEBP, GIF o SVG, massimo 10 MB: viene copiato in 02_Settings.</p><div pgs="flex['row' 'wrap' 'itemCenter' 'gapParagraphs']" class="client-logo-row">${s.background&&state.background.url?`<img class="client-background-preview" src="${escape(state.background.url)}" alt="Sfondo della home di ${escape(s.name)}">`:`<span class="client-background-preview client-logo-empty" aria-hidden="true">${icon('image')}</span>`}<button pgs="button" id="background-choose" type="button" ${disabled(state.logoBusy)}>${icon('upload')}<span>${s.background?'Cambia sfondo':'Carica sfondo'}</span></button>${s.background?`<button pgs="button['btnTransparent']" id="background-remove" type="button" ${disabled(state.logoBusy)}>${icon('trash')}<span>Rimuovi</span></button>`:''}</div></section><section pgs="box flex['column' 'gapParagraphs']" aria-labelledby="settings-color-title"><h2 pgs="h4" id="settings-color-title">Colore del cliente</h2><div pgs="flex['row' 'itemCenter' 'gapParagraphs']" class="client-color-row"><input type="color" id="client-color" value="${escape(s.color||'#23765a')}" aria-label="Colore del cliente"><span class="hint" id="client-color-value">${s.color?escape(s.color):'Nessun colore scelto'}</span></div></section>${platformsSection(s)}${templatesSection(s)}<section pgs="box flex['column' 'gapParagraphs']" aria-labelledby="settings-folders-title"><h2 pgs="h4" id="settings-folders-title">Cartelle dei post</h2><p class="hint">Trova i post la cui cartella è stata rinominata o spostata a mano e ricollegali.</p><div><button pgs="button" id="check-folders" type="button" ${disabled(state.checkingFolders)}>${icon('magnifyingGlass')}<span>${state.checkingFolders?'Controllo…':'Controlla cartelle'}</span></button></div>${folderReport()}</section>`;
 main.innerHTML=tab===0?`<h1 pgs="h2">Impostazioni dell’app</h1>${appPanel}${errorBox()}${noticeBox()}`:`<h1 pgs="h2">Impostazioni del cliente${clientName()?` <span class="title-muted">${escape(clientName())}</span>`:''}</h1>${clientPanel}${errorBox()}${noticeBox()}`;
 footer.innerHTML=`<button pgs="button['btnTransparent']" id="settings-home" type="button">${icon('arrowLeft')}<span>Torna alla home</span></button>`;
 document.getElementById('settings-home').addEventListener('click',goHome);
 document.getElementById('settings-root')?.addEventListener('click',async()=>{try{const result=await call('chooseRoot');if(result){applyStatus(result);state.settings=state.rootValid?await call('settings'):null;state.notice='';render();}}catch(e){error(e.message);}});
 document.getElementById('check-folders')?.addEventListener('click',checkFolders);
 main.querySelectorAll('[data-relink-key]').forEach(button=>button.addEventListener('click',()=>{const post=state.drafts.find(d=>d.key===button.dataset.relinkKey);if(post)openRelinkModal(post,checkFolders);}));
 const logoAction=async(method,message)=>{
  if(state.logoBusy)return;state.logoBusy=true;state.error='';state.notice='';render();
  try{const result=await call(method);if(result){state.settings=result;await refreshClients();savedToast(message.replace(/\.$/,''));}}
  catch(e){state.error=e.message;}
  finally{state.logoBusy=false;render();}
 };
 document.getElementById('logo-choose')?.addEventListener('click',()=>logoAction('chooseLogo','Logo salvato.'));
 document.getElementById('logo-remove')?.addEventListener('click',()=>logoAction('removeLogo','Logo rimosso.'));
 document.getElementById('background-choose')?.addEventListener('click',()=>logoAction('chooseBackground','Sfondo salvato.'));
 document.getElementById('background-remove')?.addEventListener('click',()=>logoAction('removeBackground','Sfondo rimosso.'));
 main.querySelectorAll('[data-platform-choice]').forEach(input=>input.addEventListener('change',()=>saveClientPlatforms(input)));
 main.querySelectorAll('[data-template-channel]').forEach(button=>button.addEventListener('click',()=>openTemplateModal(button.dataset.templateChannel,button.dataset.templateFormat,button)));
 // Nome del cliente: il pulsante si attiva solo se il nome cambia; Invio = Rinomina
 const nameInput=document.getElementById('client-name-input'),renameButton=document.getElementById('client-rename');
 if(nameInput&&renameButton){
  const changed=()=>nameInput.value.trim().replace(/\s+/g,' ')!==String(state.settings?.name||'');
  nameInput.addEventListener('input',()=>{renameButton.disabled=!changed()||state.renamingClient;setAlert(document.getElementById('client-rename-error'),'');});
  nameInput.addEventListener('keydown',event=>{if(event.key==='Enter'&&!renameButton.disabled){event.preventDefault();renameButton.click();}});
  renameButton.addEventListener('click',async()=>{
   if(!changed())return;
   const name=nameInput.value.trim(),same=name.replace(/\s+/g,' ').toLowerCase()===String(state.settings?.name||'').toLowerCase();
   // nome non valido o già usato: l'errore subito, senza passare dalla conferma (con sole maiuscole diverse è la stessa cartella)
   if(!same){try{await call('checkClientName',name);}catch(e){setAlert(document.getElementById('client-rename-error'),e.message);return;}}
   confirmRenameClient(name,renameButton);
  });
 }
 document.getElementById('client-color')?.addEventListener('change',async event=>{
  try{state.settings=await call('saveSettings',{color:event.target.value});await refreshClients();state.error='';savedToast('Colore salvato');}
  catch(e){state.error=e.message;}
  render();
 });
}
// Conferma e rinomina del cliente (cartella in Social). Sugli altri computer chi lo usava lo ritrova nell'elenco col nuovo nome.
function confirmRenameClient(name,opener){
 if(anyModalOpen())return;
 const from=state.settings?.name||'';
 const body=`<p>Il cliente <strong>${escape(from)}</strong> si chiamerà <strong>${escape(name.replace(/\s+/g,' '))}</strong> e la sua cartella in Social verrà rinominata. Post, piano e impostazioni restano com'erano.</p><p class="hint">Chi lo sta usando su un altro computer dovrà sceglierlo di nuovo dall'elenco dei clienti.</p><div pgs="flex['row' 'wrap' 'justifyEnd' 'gapParagraphs']"><button pgs="button" type="button" data-rename-cancel>Annulla</button><button pgs="button['btnStrong']" type="button" data-rename-ok>${icon('pencil')}<span>Rinomina</span></button></div>`;
 const modal=createModal({title:'Rinominare il cliente?',titleId:'rename-client-title',body,onClose:value=>{if(value==='ok')void renameClient(name);else opener?.focus({preventScroll:true});}});
 modal.dialog.querySelector('[data-rename-cancel]').addEventListener('click',()=>modal.close());
 modal.dialog.querySelector('[data-rename-ok]').addEventListener('click',()=>modal.close('ok'));
 modal.open();modal.dialog.querySelector('[data-rename-ok]').focus();
}
async function renameClient(name){
 if(state.renamingClient)return;
 state.renamingClient=true;render();
 try{
  const result=await call('renameClient',name);
  applyStatus(result);state.settings=await call('settings');
  savedToast(`Cliente rinominato: ${result.renamed.name}`);
 }catch(e){state.renamingClient=false;render();setAlert(document.getElementById('client-rename-error'),e.message);document.getElementById('client-name-input')?.focus();return;}
 state.renamingClient=false;render();
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
 if(!state.rootValid){error(state.baseValid?'Scegli o crea un cliente.':'Configura prima la cartella Social in Impostazioni.');return;}
 const reset=state.route==='home'||state.listMode!==kind;
 state.loading=true;state.error='';render();
 try{const result=await call('posts');state.drafts=result.posts;state.hidePublished=kind==='drafts';state.revision=result.revision;state.years=result.years||[];state.route=kind;state.listMode=kind;state.selected=null;if(reset){state.highlight=null;state.filterYear=String(new Date().getFullYear());state.filterChannels=[...CHANNELS];state.filterStatus='';state.filterMonth='';state.filterSearch='';}}
 catch(e){state.error=e.message;}
 finally{state.loading=false;render();}
 refreshMissing();
}
// Post la cui cartella non si trova più (rinominata a mano): segnalati nelle righe dell'elenco
async function refreshMissing(){
 if(!api?.missingFolders||!state.revision)return;
 try{const result=await call('missingFolders');if(result.revision!==state.revision)return;const keys=new Set(result.missing.map(m=>m.key));const changed=[...keys].join()!==[...(state.missingKeys||[])].join();state.missingKeys=keys;if(changed&&(state.route==='posts'||state.route==='drafts')&&!state.loading&&!anyModalOpen()){const y=window.scrollY;render();window.scrollTo({top:y});}}catch{}
}
function statusBadge(status){return `<span pgs="badge" class="status-badge" data-status="${SocialPostFilters.statusTone(status)}">${escape(status||'Non indicato')}</span>`;}
function renderPostRow(d){
 const status=d.status||'Non indicato',date=d.date?formatDate(d.date):'Da definire';
 const topic=d.topic?.trim()?`<span pgs="flex['row' 'itemCenter' 'gapDetails' 'nowrap']" class="post-topic" title="Argomento: ${escape(d.topic)}">${icon('tag')}<span pgs="visuallyHidden">Argomento: </span><span pgs="truncate" class="post-topic-text">${escape(d.topic)}</span></span>`:'';
 const id=d.id!==null&&d.id!==''?`<span>ID ${escape(d.id)}</span>`:'';
 const folderGone=state.missingKeys?.has(d.key);
 return `<article pgs="flex['row' 'itemCenter' 'justifyBetween' 'gapParagraphs']" class="draft-item${state.highlight===d.key?' is-selected':''}" data-channel="${escape(d.channel)}" data-row-key="${escape(d.key)}"><div pgs="flex['row' 'itemStart' 'gapParagraphs' 'nowrap']" class="post-body post-summary" data-details="${escape(d.key)}" title="Visualizza dettagli del post"><span class="post-social-icon" role="img" aria-label="${escape(d.channel)}" title="${escape(d.channel)}">${socialIcon(d.channel)}</span><div pgs="flex['column' 'gapDetails']" class="post-heading"><h2 pgs="h6"><button class="post-title-button" type="button">${escape(d.title)}</button></h2>${topic||id||folderGone?`<p pgs="flex['row' 'wrap' 'itemCenter' 'gapParagraphs']" class="draft-meta post-details">${topic}${id}<span pgs="flex['row' 'itemCenter' 'gapDetails' 'nowrap']" class="post-date" title="Data di pubblicazione">${icon('calendar')}<span>${escape(date)}</span></span>${folderGone?`<span pgs="flex['row' 'itemCenter' 'gapDetails' 'nowrap']" class="folder-missing" title="La cartella del post non si trova più: apri il post per ricollegarla">${icon('triangleExclamation')}<span>Cartella non trovata</span></span>`:''}</p>`:''}</div></div><div pgs="flex['row' 'wrap' 'itemCenter' 'gapDetails']" class="post-actions"><button pgs="button['btnMini']" class="status-action" data-status="${SocialPostFilters.statusTone(d.status)}" data-change-status="${escape(d.key)}" type="button" aria-label="Cambia stato: ${escape(status)}" title="Cambia stato" ${disabled(state.loading)}>${escape(status)}</button><button pgs="button['btnIconOnly' 'btnMini']" data-draft="${escape(d.key)}" type="button" aria-label="Modifica" title="Modifica" ${disabled(state.loading)}>${icon('pencil')}</button></div></article>`;
}
function renderPostGroup(group){
 const first=group.posts[0],channels=group.posts.map(post=>post.channel);
 const icons=group.posts.map(post=>`<span class="post-social-icon" data-channel="${escape(post.channel)}" aria-hidden="true">${socialIcon(post.channel)}</span>`).join('');
 return `<div pgs="accordion['accOpenBox']" class="post-group${group.posts.some(p=>p.key===state.highlight)?' has-selected':''}" data-group-key="${escape(group.key)}" ${state.expandedGroups.has(group.key)?'pgs-state="open"':''}><button pgs="accordion-button" class="group-summary" type="button"><span pgs="flex['row' 'itemStart' 'gapParagraphs' 'nowrap']" class="post-body"><span class="post-icon-stack" role="img" aria-label="${escape(channels.join(', '))}">${icons}</span><span pgs="flex['column' 'gapDetails']" class="post-heading"><span pgs="h6" class="group-title">${escape(first.title)}</span><span pgs="flex['row' 'wrap' 'itemCenter' 'gapParagraphs']" class="draft-meta post-details"><span>ID ${escape(first.id)} · ${group.posts.length} social</span>${group.posts.some(post=>state.missingKeys?.has(post.key))?`<span pgs="flex['row' 'itemCenter' 'gapDetails' 'nowrap']" class="folder-missing" title="La cartella del post non si trova più: apri il post per ricollegarla">${icon('triangleExclamation')}<span>Cartella non trovata</span></span>`:''}</span></span></span>${groupStatusDots(group.posts)}</button><div pgs="accordion-content flex['column']" class="group-children" ${state.expandedGroups.has(group.key)?'':'hidden'}>${group.posts.map(renderPostRow).join('')}</div></div>`;
}
// Gruppo per ID: vicino alla freccia un badge per social (icona del social + stato, nel colore dello stato).
function groupStatusDots(posts){
 return `<span pgs="flex['row' 'wrap' 'itemCenter' 'justifyEnd' 'gapDetails']" class="group-status-badges">${posts.map(p=>`<span pgs="badge" class="status-badge group-status-badge" data-status="${SocialPostFilters.statusTone(p.status)}" title="${escape(p.channel+': '+(p.status||'stato non indicato'))}">${socialIcon(p.channel)}<span>${escape(p.status||'Non indicato')}</span><span pgs="visuallyHidden"> (${escape(p.channel)})</span></span>`).join('')}</span>`;
}
// Filtri dell'elenco senza la ricerca (usati anche per contare i risultati negli altri anni)
function listFilters(year=state.filterYear,month=state.filterMonth){return{year,channels:state.filterChannels,status:state.filterStatus,month,hidePublished:state.hidePublished};}
function listItems(){return state.drafts.filter(d=>SocialPostFilters.matchesPost(d,listFilters())&&SocialPostFilters.matchesSearch(d,state.filterSearch));}
// Risultati: conteggio, eventuali risultati negli altri anni e righe. Si ridisegna da solo mentre si scrive nella ricerca.
function listResults(){
 const items=listItems(),query=state.filterSearch.trim();
 const groups=(state.groupById?SocialPostFilters.groupById(items):items.map(post=>({key:post.key,posts:[post]}))).reverse();
 const rows=groups.map(group=>group.posts.length>1?renderPostGroup(group):renderPostRow(group.posts[0])).join('');
 let elsewhere='';
 if(query){
  const counts=new Map();
  for(const d of state.drafts)if(String(d.year)!==state.filterYear&&SocialPostFilters.matchesPost(d,listFilters(String(d.year),''))&&SocialPostFilters.matchesSearch(d,query))counts.set(String(d.year),(counts.get(String(d.year))||0)+1);
  const years=[...counts.keys()].sort().reverse();
  if(years.length)elsewhere=`<p pgs="flex['row' 'wrap' 'itemCenter' 'gapDetails']" class="search-elsewhere"><span>Anche in altri anni:</span>${years.map(y=>`<button pgs="button['btnMini']" type="button" data-search-year="${escape(y)}" title="Mostra i risultati del ${escape(y)}">${escape(y)} <span pgs="badge['badgeNeutral']">${counts.get(y)}</span></button>`).join('')}</p>`;
 }
 const message=!state.filterChannels.length?'Seleziona almeno un social per visualizzare i post.':query?`Nessun post trovato per “${escape(query)}”${state.filterMonth?' in questo mese':''} nel ${escape(state.filterYear)}.`:'Nessun post per questi filtri.';
 const empty=`<div pgs="alert['alertInfo']" class="empty-state"><i pgs="icon['icon-circleInfo'] alert-icon" aria-hidden="true"></i><div pgs="alert-content"><p>${message}</p></div></div>`;
 return `<p class="draft-count"><span pgs="badge['badgeNeutral']">${items.length} post</span></p>${elsewhere}<div pgs="flex['column']" class="draft-list">${rows||empty}</div>`;
}
function bindListResults(root){
 // l'accordion di myPgs scrive pgs-state="open": lo si legge dopo il suo listener per ricordare i gruppi aperti
 root.querySelectorAll('[data-group-key]').forEach(group=>group.querySelector('[pgs~="accordion-button"]')?.addEventListener('click',()=>{const open=globalThis.pgs?globalThis.pgs(group).state.contains('open'):false;if(open)state.expandedGroups.add(group.dataset.groupKey);else state.expandedGroups.delete(group.dataset.groupKey);}));
 root.querySelectorAll('[data-details]').forEach(summary=>summary.addEventListener('click',()=>{
  const post=state.drafts.find(d=>d.key===summary.dataset.details);
  if(post)openPostDetails(post,summary.querySelector('.post-title-button'));
 }));
 root.querySelectorAll('[data-change-status]').forEach(button=>button.addEventListener('click',()=>{
  const post=state.drafts.find(d=>d.key===button.dataset.changeStatus);if(post)openStatusModal(post,button);
 }));
 root.querySelectorAll('[data-draft]').forEach(button=>button.addEventListener('click',()=>{
  const post=state.drafts.find(d=>d.key===button.dataset.draft);if(post)openPostEditor(post,button);
 }));
 root.querySelectorAll('[data-search-year]').forEach(button=>button.addEventListener('click',()=>{state.filterYear=button.dataset.searchYear;state.filterMonth='';render();document.getElementById('post-search')?.focus({preventScroll:true});}));
}
function refreshListResults(){
 const host=document.getElementById('list-results');if(!host)return;
 host.innerHTML=listResults();enhance(host);bindListResults(host);
}
function renderDrafts(){
 const all=state.listMode==='posts',today=localToday(),year=today.slice(0,4);
 const years=[...new Set([year,...state.years.map(String),...state.drafts.map(d=>String(d.year))])].sort().reverse();
 if(!years.includes(state.filterYear))state.filterYear=year;
 const statuses=[...new Set([...STATUSES,...state.drafts.map(d=>d.status.trim().toLowerCase()).filter(Boolean)])].filter(status=>!state.hidePublished||status!=='pubblicato');
 const used=new Set([...clientPlatforms(),...state.drafts.map(d=>d.channel)]),channels=CHANNELS.filter(c=>used.has(c));
 const search=`<form pgs="search" role="search" class="post-search" id="post-search-form" autocomplete="off"><button pgs="button['btnIconOnly' 'btnTransparent']" type="submit" title="Cerca" tabindex="-1">${icon('magnifyingGlass')}</button><input type="search" id="post-search" placeholder="Cerca per titolo, argomento o ID" aria-label="Cerca nei post" value="${escape(state.filterSearch)}" maxlength="200" ${disabled(state.loading)}><div pgs="search-suggestions"></div></form>`;
 const chips=`<fieldset pgs="chips" class="channel-chips"><legend pgs="visuallyHidden">Filtra per canale</legend>${channels.map(channel=>`<label pgs="button['btnMini' 'btnTwoState']" class="channel-chip" data-channel="${channel}"><input type="checkbox" data-channel-filter="${channel}" ${state.filterChannels.includes(channel)?'checked':''} ${disabled(state.loading)}>${socialIcon(channel)}<span>${channel}</span></label>`).join('')}</fieldset>`;
 const select=(id,label,options,extra='')=>`<label pgs="flex['column']" class="toolbar-field"><span pgs="label">${label}</span><select pgs="select" id="${id}" ${extra} ${disabled(state.loading)}>${options}</select></label>`;
 const toolbar=`<div pgs="form flex['row' 'wrap' 'itemEnd' 'gapParagraphs']" class="posts-toolbar">${select('filter-year','Anno',years.map(y=>`<option ${state.filterYear===y?'selected':''}>${y}</option>`).join(''))}${select('filter-status','Stato',`<option value="">Tutti gli stati</option>${statuses.map(status=>`<option value="${escape(status)}" ${state.filterStatus===status?'selected':''}>${escape(status)}</option>`).join('')}<option value="__none" ${state.filterStatus==='__none'?'selected':''}>Non indicato</option>`,`class="status-filter" data-status="${state.filterStatus?SocialPostFilters.statusTone(state.filterStatus):'all'}"`)}${select('filter-month','Mese',`<option value="">Tutti i mesi</option>${MONTHS.map((name,index)=>{const value=String(index+1).padStart(2,'0');return `<option value="${value}" ${state.filterMonth===value?'selected':''}>${name}</option>`;}).join('')}`)}<label pgs="toggle" class="group-toggle"><span>Raggruppa per ID</span><input type="checkbox" id="group-by-id" ${state.groupById?'checked':''} ${disabled(state.loading)}></label></div>`;
 main.innerHTML=`<div pgs="flex['row' 'itemCenter' 'gapParagraphs']" class="list-heading"><h1 pgs="h2">${all?'Tutti i post':'Post in bozza'}</h1><button pgs="button['btnIconOnly']" id="refresh" type="button" aria-label="Aggiorna elenco" title="Aggiorna elenco" ${disabled(state.loading)}>${icon('refresh')}</button></div><p class="lead list-intro">${all?'Pubblicati e bozze. Modifica i dati del singolo social.':'Tutti i post non ancora pubblicati. Li trovi tutti, anche pubblicati, in Tutti i post.'}</p>${search}${chips}${toolbar}${noticeBox()}<div pgs="flex['column' 'gapParagraphs']" id="list-results">${listResults()}</div>${errorBox()}`;
 footer.innerHTML=`<button pgs="button['btnTransparent']" id="home" type="button" ${disabled(state.loading)}>${icon('arrowLeft')}<span>Torna alla home</span></button>`;
 enhance(main);
 bindListResults(main);
 document.getElementById('home').addEventListener('click',goHome);
 document.getElementById('refresh').addEventListener('click',()=>loadList(state.listMode));
 const searchInput=document.getElementById('post-search');
 // mentre si scrive si ridisegnano solo i risultati, così il campo non perde il cursore
 const onSearch=()=>{if(state.filterSearch===searchInput.value)return;state.filterSearch=searchInput.value;refreshListResults();};
 searchInput.addEventListener('input',onSearch);searchInput.addEventListener('search',onSearch);
 document.getElementById('post-search-form').addEventListener('submit',event=>{event.preventDefault();onSearch();});
 document.getElementById('group-by-id')?.addEventListener('change',event=>{state.groupById=event.target.checked;render();document.getElementById('group-by-id')?.focus({preventScroll:true});});
 document.getElementById('filter-year').addEventListener('change',e=>{state.filterYear=e.target.value;render();});
 document.getElementById('filter-status').addEventListener('change',e=>{state.filterStatus=e.target.value;render();});
 document.getElementById('filter-month').addEventListener('change',e=>{state.filterMonth=e.target.value;render();});
 main.querySelectorAll('[data-channel-filter]').forEach(input=>input.addEventListener('change',()=>{
  const channel=input.dataset.channelFilter;
  state.filterChannels=input.checked?[...new Set([...state.filterChannels,channel])]:state.filterChannels.filter(c=>c!==channel);render();
  main.querySelector(`[data-channel-filter="${channel}"]`)?.focus({preventScroll:true});
 }));
}
// Riga "selezionata": l'ultimo post aperto (Dettagli, Modifica, Cambia stato) resta evidenziato nell'elenco,
// come un file appena aperto sul computer.
function selectRow(key){
 state.highlight=key;
 main.querySelectorAll('.draft-item.is-selected').forEach(row=>row.classList.remove('is-selected'));
 main.querySelectorAll('.post-group.has-selected').forEach(group=>group.classList.remove('has-selected'));
 const row=[...main.querySelectorAll('[data-row-key]')].find(el=>el.dataset.rowKey===key);
 row?.classList.add('is-selected');row?.closest('.post-group')?.classList.add('has-selected');
}
const rowButton=key=>[...main.querySelectorAll('[data-details]')].find(el=>el.dataset.details===key)?.querySelector('.post-title-button');
// Ricarica l'elenco dopo un salvataggio restando nello stesso punto
async function reloadListAt(key){
 const y=window.scrollY;await loadList(state.listMode);
 requestAnimationFrame(()=>{window.scrollTo({top:y});if(key)selectRow(key);});
}
// Lo stesso post nell'elenco ricaricato: la chiave (anno:riga) può puntare a un'altra riga se il piano ha righe in più o in meno
function freshPost(post){
 const list=state.drafts||[],same=p=>p.year===post.year&&p.channel===post.channel;
 const byKey=list.find(p=>p.key===post.key);
 if(byKey&&same(byKey)&&String(byKey.id??'')===String(post.id??'')&&(post.id!==null&&post.id!==''||byKey.title===post.title))return byKey;
 if(post.id!==null&&post.id!=='')return list.find(p=>same(p)&&String(p.id)===String(post.id))||null;
 return list.find(p=>same(p)&&p.title===post.title)||null;
}
// Riapre per il post aggiornato una modale (Dettagli, Cambia stato) dopo aver ricaricato l'elenco
function reopenFresh(modal,post,open){
 return async()=>{
  modal.close();await reloadListAt(null);
  const fresh=freshPost(post);
  if(!fresh){globalThis.pgs?.toast.error({title:'Post non trovato',description:'Il post non c’è più nel piano: forse è stato eliminato.',timeout:5000,closeTitle:'Chiudi'});bringToastToFront();return;}
  selectRow(fresh.key);setTimeout(()=>open(fresh),60);
 };
}
// Pulsante Aggiorna nei messaggi «Il piano è cambiato»: ricarica il piano senza chiudere a mano la finestra
async function refreshChangedPlan(button){
 if(state.loading||button.disabled)return;
 button.disabled=true;button.classList.add('is-checking');
 try{
  let dialog=button.closest('dialog');
  while(dialog&&!dialog.socialModal?.planRefresh)dialog=dialog.parentElement?.closest('dialog');
  if(dialog){await dialog.socialModal.planRefresh();return;}
  const open=button.closest('dialog')?.socialModal;
  if(open){open.close();await reloadListAt(state.highlight);return;}
  if(state.listMode)await reloadListAt(state.highlight);
 }finally{if(button.isConnected){button.disabled=false;button.classList.remove('is-checking');}}
}
document.addEventListener('click',event=>{const button=event.target.closest?.('[data-plan-refresh]');if(!button)return;event.preventDefault();event.stopPropagation();void refreshChangedPlan(button);},{capture:true});
// Modifica post: modale a tutto schermo sopra l'elenco (dall'elenco, dai Dettagli o dopo la creazione).
async function openPostEditor(post,opener){
 if(state.loading||anyModalOpen())return;
 selectRow(post.key);
 state.selected=post;state.loading=true;
 let editable=null,note='';state.editFolderMissing=false;state.editNoText=false;
 try{
  const details=await call('details',{key:post.key,revision:state.revision});
  editable=details.editableText;state.editFolderMissing=!!details.folderMissing;state.editNoText=!!details.noText;
  if(!editable)note=details.textMessage||'Il file di testo principale non è individuabile: controlla i file nella cartella Sorgenti.';
 }catch(e){note=e.message;}
 state.editValues={title:post.title,topic:post.topic,format:post.format,status:post.status,undefinedDate:!post.date,date:post.date||(post.year===new Date().getFullYear()?localToday():post.year+'-01-01')};
 if(editable){state.editValues.postText=editable.content.replace(/\r\n/g,'\n');state.editValues.textName=editable.name;state.editValues.textRevision=editable.revision;}
 state.editOriginal={...state.editValues};
 state.editTextNote=note;state.editError='';state.loading=false;
 const modal=createModal({titleHtml:`<span class="modal-title-muted">Modifica post</span> <span id="edit-post-title">${escape(post.title)}</span>`,titleId:'edit-modal-title',body:`<div id="edit-body" pgs="flex['column' 'gapElements']"></div>`,footer:`<button pgs="button" id="edit-cancel" type="button">Annulla</button><button pgs="button['btnStrong']" id="save-post" type="button">${icon('save')}<span>Salva modifiche</span></button>`,size:'dialogFull',beforeClose:confirmEditExit,onClose:()=>{
  state.editModal=null;document.body.classList.remove('edit-modal-open');
  const target=opener?.isConnected?opener:rowButton(post.key);target?.focus({preventScroll:true});
 }});
 modal.dialog.id='post-edit-modal';modal.dialog.classList.add('post-edit-modal');
 document.body.classList.add('edit-modal-open');
 // Piano cambiato: si ricarica l'elenco sotto e si aggancia la riga aggiornata, senza perdere i campi compilati
 // (il testo non si tocca: se è cambiato anche quello, al salvataggio interviene il controllo del testo)
 modal.planRefresh=async()=>{
  if(modal.busy)return;
  const before=state.selected,y=window.scrollY;
  await loadList(state.listMode);requestAnimationFrame(()=>window.scrollTo({top:y}));
  const fresh=freshPost(before);
  if(!fresh){state.selected=before;state.editError='Il post non c’è più nel piano: forse è stato eliminato. Chiudi la finestra senza salvare.';renderPostEdit();return;}
  state.selected=fresh;state.editError='';selectRow(fresh.key);renderPostEdit();
  globalThis.pgs?.toast.success({title:'Piano aggiornato',description:'Le tue modifiche sono ancora qui: ora puoi salvarle.',timeout:4000,closeTitle:'Chiudi'});bringToastToFront();
 };
 state.editModal=modal;renderPostEdit();modal.open();
 modal.dialog.querySelector('#edit-title')?.focus({preventScroll:true});
}
// il menu compatto dell'header è una modale myPgs dentro <header>: non blocca la navigazione
const anyModalOpen=(except='')=>[...document.querySelectorAll('dialog[open]')].some(dialog=>!dialog.closest('header')&&!(except&&dialog.matches(except)));
const closeCompactMenu=()=>{const menu=document.getElementById('compact-menu');if(menu)globalThis.pgs?.modal.api(menu)?.close();};
function postHeading(post,id){return `<p id="${id}" pgs="flex['column' 'gapDetails']"><strong>${escape(post.title)}</strong><span pgs="flex['row' 'itemCenter' 'gapDetails']" class="hint">${socialIcon(post.channel)}${escape(post.channel)} · ${post.year}</span></p>`;}
// pallino colorato dello stato: la select box di myPgs disegna il <template> prima del testo dell'opzione
const statusDot=status=>`<template><span class="status-dot" data-status="${SocialPostFilters.statusTone(status)}" aria-hidden="true"></span></template>`;
function openStatusModal(post,opener){
 if(anyModalOpen())return;
 selectRow(post.key);
 const current=post.status.trim().toLowerCase();
 const initial=STATUSES.includes(current)?current:'';
 // Passando a da pubblicare o pubblicato si può indicare anche la data (precompilata con quella del post o con oggi se è dello stesso anno).
 const withDate=status=>status==='da pubblicare'||status==='pubblicato';
 const today=localToday(),initialDate=post.date||(today.startsWith(post.year+'-')?today:'');
 const body=`${postHeading(post,'status-modal-post')}<div pgs="flex['column']"><label pgs="label" for="quick-status">Nuovo stato</label><div pgs="selectBox" class="status-select"><select pgs="select" id="quick-status" required>${initial?'':`<option value="" selected disabled hidden>${escape(post.status?'Attuale: '+post.status:'Scegli uno stato')}</option>`}${STATUSES.map(status=>`<option value="${status}" ${initial===status?'selected':''}>${statusDot(status)}${status}</option>`).join('')}</select></div></div><div id="status-date-block" pgs="flex['column' 'gapParagraphs']" ${withDate(initial)?'':'hidden'}>${field('Data di pubblicazione',`<input pgs="input" id="status-date" type="date" min="${post.year}-01-01" max="${post.year}-12-31" value="${escape(initialDate)}" ${post.date||initial==='pubblicato'?'required':'disabled'}>`,`Deve essere nel ${post.year}.`)}<label pgs="checkbox" id="status-undefined-label" ${initial==='pubblicato'?'hidden':''}><input type="checkbox" id="status-undefined" ${post.date?'':'checked'}><span>Data da definire</span></label></div><p class="hint">La modifica riguarda solo ${escape(post.channel)}.</p><div id="status-error" role="alert" hidden></div><div pgs="flex['row' 'justifyEnd' 'gapParagraphs']"><button pgs="button" id="status-cancel" type="button">Annulla</button><button pgs="button['btnStrong']" id="status-save" type="submit" disabled>Salva</button></div>`;
  const modal=createModal({title:'Cambia stato',titleId:'status-modal-title',describedBy:'status-modal-post',body,form:true,onClose:()=>{document.body.classList.remove('status-modal-open');if(opener.isConnected)opener.focus({preventScroll:true});}});
 modal.dialog.id='status-modal';modal.planRefresh=reopenFresh(modal,post,p=>openStatusModal(p,opener));
 document.body.classList.add('status-modal-open');
 const dateBlock=modal.dialog.querySelector('#status-date-block'),dateInput=modal.dialog.querySelector('#status-date'),undefinedBox=modal.dialog.querySelector('#status-undefined'),undefinedLabel=modal.dialog.querySelector('#status-undefined-label'),select=modal.dialog.querySelector('#quick-status'),save=modal.dialog.querySelector('#status-save'),message=modal.dialog.querySelector('#status-error');
 // Con pubblicato la data è obbligatoria: Data da definire non c'è.
 function undefinedActive(){return select.value!=='pubblicato'&&undefinedBox.checked;}
 function syncDate(){undefinedLabel.hidden=select.value==='pubblicato';const off=undefinedActive();dateInput.disabled=modal.busy||off;dateInput.required=!off;if(!off&&!dateInput.value)dateInput.value=initialDate;}
 function statusChanged(){return!!select.value&&select.value!==current;}
 function dateChanged(){if(!withDate(select.value))return false;return undefinedActive()?!!post.date:!!dateInput.value&&dateInput.value!==(post.date||'');}
 function changed(){return statusChanged()||dateChanged();}
 function busy(value){modal.busy=value;state.loading=value;modal.dialog.querySelectorAll('button,select,input').forEach(el=>{el.disabled=value;});dateInput.disabled=value||undefinedActive();save.disabled=value||!changed();save.textContent=value?'Salvataggio…':'Salva';modal.dialog.setAttribute('aria-busy',String(value));}
 modal.dialog.querySelector('#status-cancel').addEventListener('click',()=>modal.close());
 select.addEventListener('change',()=>{select.dataset.status=SocialPostFilters.statusTone(select.value);dateBlock.hidden=!withDate(select.value);syncDate();save.disabled=!changed();setAlert(message,'');});
 dateInput.addEventListener('input',()=>{save.disabled=!changed();setAlert(message,'');});
 undefinedBox.addEventListener('change',()=>{syncDate();save.disabled=!changed();setAlert(message,'');});
 modal.dialog.querySelector('form').addEventListener('submit',async event=>{
  event.preventDefault();if(modal.busy||!changed()||!select.reportValidity()||(withDate(select.value)&&!undefinedActive()&&!dateInput.reportValidity()))return;
  setAlert(message,'');busy(true);
  const both=dateChanged()&&statusChanged(),job=progressToast('Salvataggio',{segments:both?2:1});
  try{
   const notes=[];let revision=state.revision;
   if(dateChanged()){
    const request=undefinedActive()?{key:post.key,revision,undefinedDate:true}:{key:post.key,revision,date:dateInput.value};
    const plan=await call('planDate',request);const r=await call('updateDate',request,plan.fingerprint);if(r.canceled){job.cancel();return;}
    notes.push(undefinedActive()?'data da definire':`data ${formatDate(dateInput.value)}`);
    revision=(await call('posts')).revision;job.next();
   }
   if(statusChanged()){const r=await call('updateStatus',{key:post.key,revision,status:select.value});if(r.canceled){job.cancel();return;}notes.push(`stato ${r.status}`);}
   job.success('Post aggiornato',`${post.title} (${post.channel}): ${notes.join(' e ')}.${state.listMode==='drafts'&&select.value==='pubblicato'?' Lo trovi in Tutti i post.':''}`);
   state.notice='';busy(false);modal.close();await reloadListAt(post.key);main.querySelector(`[data-change-status="${post.key}"]`)?.focus({preventScroll:true});
  }catch(e){job.cancel();setAlert(message,e.message);}
  finally{if(modal.dialog.isConnected)busy(false);else state.loading=false;}
 });
 save.disabled=!changed();modal.open();(modal.dialog.querySelector('[pgs~="_selectBox-button"]')||select).focus();
}
function detailsMetadata(post){
 const postFolder=post.sourcesRelative?.replace(/\\/g,'/').replace(/\/01_Sorgenti\/?$/,'');
 const folderLink=postFolder&&postFolder!==post.sourcesRelative?`<a href="#" class="details-file-link details-folder-link" data-open-post-folder title="Apri la cartella del post" aria-label="Apri la cartella del post: ${escape(postFolder)}"><span>${escape(postFolder)}</span>${icon('externalLink')}</a>`:'Collegamento non indicato';
 return `<dl pgs="box['boxMini']" class="review details-grid"><dt>ID post</dt><dd>${post.id!==null&&post.id!==''?escape(post.id):'Non assegnato'}</dd><dt>Anno</dt><dd>${post.year}</dd><dt>Pubblicazione</dt><dd>${post.date?escape(formatDate(post.date)):'Da definire'}</dd><dt>Argomento</dt><dd>${escape(post.topic||'Non indicato')}</dd><dt>Formato</dt><dd>${escape(post.format||'Non indicato')}</dd><dt>Stato</dt><dd>${statusBadge(post.status)}</dd><dt>Cartella post</dt><dd class="details-source">${folderLink}<div id="details-folder-error" role="alert" hidden></div></dd></dl>`;
}
// Righe dello stesso post (stesso anno e ID) sugli altri social, per lo switch in alto nei Dettagli.
function siblingPosts(post){
 if(post.id===null||post.id===undefined||post.id==='')return[post];
 const rows=(state.drafts||[]).filter(p=>p.year===post.year&&p.id===post.id);
 const list=rows.length?rows:[post];
 return CHANNELS.map(c=>list.find(p=>p.channel===c)).filter(Boolean);
}
function detailsSwitch(post){
 const items=siblingPosts(post).map(p=>{const current=p.key===post.key;return `<li><button pgs="button['btnTransparent'${current?" 'btnCurrent'":''}]" type="button" data-switch-post="${escape(p.key)}" ${current?'aria-selected="true" aria-current="page"':''} data-channel="${escape(p.channel)}">${socialIcon(p.channel)}<span>${escape(p.channel)}</span></button></li>`;}).join('');
 return `<div pgs="flex['row' 'justifyCenter']" class="details-switch-wrap"><nav pgs="menu['menuHorizontal']" class="details-switch" aria-label="Social del post"><ul pgs="buttonGroup">${items}</ul></nav></div>`;
}
// Rigenera file Illustrator su un post senza formato da immagine: si sceglie il formato (che va anche nel piano).
// Restituisce il formato scelto, '' se il post ne ha già uno da immagine, null se si annulla.
async function chooseArtworkFormat(post){
 if(formatKind(post.format)==='ai')return '';
 const formats=platformFormats(post.channel).filter(f=>formatKind(f)==='ai');
 let templates=[];try{templates=(await call('settings')).templates||[];}catch{}
 const rows=formats.map(format=>{
  const t=templates.find(x=>x.channel===post.channel&&x.format===format);
  const missing=t&&!t.present&&!t.fallback,st=t?templateStatus(t):null;
  return `<li><button pgs="button['btnTransparent']" class="template-row" type="button" data-pick-format="${escape(format)}" ${missing?'disabled':''}><span class="template-format">${escape(format)}</span>${st?`<span pgs="badge['${st.tone}']">${escape(missing?'Template mancante':st.text)}</span>`:''}${icon('chevronRight')}</button></li>`;
 }).join('');
 const anyMissing=formats.some(format=>{const t=templates.find(x=>x.channel===post.channel&&x.format===format);return t&&!t.present&&!t.fallback;});
 return new Promise(resolve=>{
  let picked=null;
  const body=`<p>${post.format?`Il formato “${escape(post.format)}” non ha un file Illustrator.`:'Questo post non ha ancora un formato.'} Scegli il formato di ${escape(post.channel)}: verrà salvato nel piano e il file Illustrator verrà creato dal suo template.</p><ul pgs="flex['column']" class="template-list">${rows}</ul>${anyMissing?'<p class="hint">I formati senza template si attivano dopo averlo caricato in Impostazioni del cliente.</p>':''}<div pgs="flex['row' 'justifyEnd']"><button pgs="button" type="button" data-format-cancel>Annulla</button></div>`;
  const modal=createModal({title:'Scegli il formato',titleId:'format-pick-title',body,onClose:()=>resolve(picked)});
  modal.dialog.querySelectorAll('[data-pick-format]').forEach(button=>button.addEventListener('click',()=>{picked=button.dataset.pickFormat;modal.close();}));
  modal.dialog.querySelector('[data-format-cancel]').addEventListener('click',()=>modal.close());
  modal.open();(modal.dialog.querySelector('[data-pick-format]:not(:disabled)')||modal.dialog.querySelector('[data-format-cancel]')).focus();
 });
}
function openPostDetails(post,opener){
 if(anyModalOpen())return;
 selectRow(post.key);
 let disposeArtwork=()=>{};
 // Switch dei social in alto; a sinistra informazioni e testo, a destra la grafica.
 const body=`${detailsSwitch(post)}<div pgs="grid['column-2' 'gapGroups' 'itemStart']" class="details-layout"><div pgs="flex['column' 'gapGroups']" class="details-left"><section id="details-metadata" pgs="flex['column' 'gapElements']">${detailsMetadata(post)}</section><section pgs="flex['column' 'gapElements']" class="details-text-section" aria-label="Testo del post"><h3 pgs="h5">Testo del post</h3><div id="details-text" pgs="flex['column' 'gapElements']" aria-live="polite"><p class="hint">Caricamento del testo…</p></div></section></div><section pgs="flex['column' 'gapElements']" class="details-text-section details-artwork-section" aria-label="Grafica del post"><h3 pgs="h5">Grafica del post</h3><div id="details-artwork" pgs="flex['column' 'gapParagraphs']"></div></section></div><div pgs="flex['row' 'justifyEnd']"><button pgs="button['btnStrong']" id="details-edit" type="button">${icon('pencil')}<span>Modifica</span></button></div>`;
 const modal=createModal({titleHtml:`<span class="modal-title-muted">Dettagli post</span> <span id="details-post-title">${escape(post.title)}</span>`,titleId:'details-modal-title',body,size:'dialogFull',onClose:()=>{disposeArtwork();document.body.classList.remove('details-modal-open');const target=opener?.isConnected?opener:rowButton(state.highlight);target?.focus({preventScroll:true});}});
 const dialog=modal.dialog;dialog.id='post-details-modal';dialog.classList.add('post-details-modal');
 document.body.classList.add('details-modal-open');
 dialog.querySelector('#details-edit').addEventListener('click',()=>{modal.close();setTimeout(()=>openPostEditor(post,opener),60);});
 dialog.querySelectorAll('[data-switch-post]').forEach(button=>button.addEventListener('click',()=>{
  const other=(state.drafts||[]).find(p=>p.key===button.dataset.switchPost);
  if(!other||other.key===post.key)return;
  modal.close();setTimeout(()=>openPostDetails(other,rowButton(other.key)||opener),60);
 }));
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
 // dopo una rigenerazione i Dettagli si riaprono con il file nuovo
 const reopen=()=>{modal.close();setTimeout(()=>openPostDetails(post,opener),60);};
 modal.planRefresh=reopenFresh(modal,post,p=>openPostDetails(p,opener));
 // per i formati video il post non ha un file Illustrator: niente Rigenera
 // se il formato viene scelto ora, il piano cambia: si ricarica l'elenco e si riaprono i Dettagli aggiornati
 const afterArtwork=async result=>{
  if(!result?.formatSaved){reopen();return;}
  modal.close();await reloadListAt(post.key);
  const updated=(state.drafts||[]).find(p=>p.key===post.key);if(updated)setTimeout(()=>openPostDetails(updated,opener),60);
  globalThis.pgs?.toast.success({title:'File Illustrator creato',description:`${result.name} · formato ${result.format}`,timeout:4000,closeTitle:'Chiudi'});bringToastToFront();
 };
 disposeArtwork=SocialIllustratorPreview.mount(dialog.querySelector('#details-artwork'),{key:post.key,revision:state.revision},call,formatKind(post.format)==='video'?{}:{onRegenerated:afterArtwork,chooseFormat:()=>chooseArtworkFormat(post),onPlanChanged:()=>modal.planRefresh()});
 call('details',{key:post.key,revision:state.revision}).then(result=>{
  if(!dialog.isConnected)return;
  dialog.querySelector('#details-metadata').innerHTML=detailsMetadata(result.post);
  const container=dialog.querySelector('#details-text');container.replaceChildren();
  if(result.folderMissing){const box=document.createElement('div');box.innerHTML=`<div pgs="alert['alertWarning']" role="status"><i pgs="icon['icon-triangleExclamation'] alert-icon" aria-hidden="true"></i><div pgs="alert-content flex['column' 'gapParagraphs']"><strong pgs="alert-content-title">Cartella del post non trovata</strong><p>Probabilmente è stata rinominata o spostata a mano. Puoi ricollegarla: le verrà ridato il nome che il piano si aspetta.</p><div><button pgs="button" type="button" data-relink>${icon('folderOpen')}<span>Ricollega cartella</span></button></div></div></div>`;container.appendChild(box);box.querySelector('[data-relink]').addEventListener('click',()=>{modal.close();openRelinkModal(result.post,()=>loadList(state.listMode));});}
  else if(result.textMessage){const note=document.createElement('p');note.className='hint details-note';note.textContent=result.textMessage;container.appendChild(note);
   if(result.noText){const box=document.createElement('div');box.innerHTML=`<button pgs="button" type="button" data-regenerate="md">${icon('refresh')}<span>Rigenera file di testo</span></button><div role="alert" hidden></div>`;container.appendChild(box);const button=box.querySelector('[data-regenerate]'),err=box.querySelector('[role=alert]');button.addEventListener('click',async()=>{button.disabled=true;setAlert(err,'');try{await call('regenerateSource',{key:post.key,revision:state.revision,kind:'md'});reopen();}catch(e){button.disabled=false;setAlert(err,e.message);}});}}
  for(const file of result.textFiles){
   // nome del file fuori dal riquadro; nel riquadro il testo e, in alto a destra, l'icona Copia per i social
   const block=document.createElement('section');block.className='details-text-file';block.setAttribute('pgs',"flex['column' 'gapDetails']");
   const head=document.createElement('div');head.setAttribute('pgs',"flex['row' 'wrap' 'itemCenter' 'gapParagraphs']");
   const name=document.createElement('a');name.className='details-filename details-file-link';name.href='#';name.title='Apri il file di testo';name.setAttribute('aria-label','Apri '+file.name);
   const label=document.createElement('span');label.textContent=file.name;name.appendChild(label);
   name.insertAdjacentHTML('beforeend',icon('externalLink'));
   const openingError=document.createElement('div');openingError.setAttribute('role','alert');openingError.hidden=true;
   let opening=false;name.addEventListener('click',async event=>{event.preventDefault();if(opening)return;opening=true;name.setAttribute('aria-disabled','true');setAlert(openingError,'');try{await call('openText',{key:post.key,revision:state.revision,name:file.name});}catch(e){setAlert(openingError,e.message);}finally{opening=false;name.removeAttribute('aria-disabled');}});
   head.appendChild(name);
   const box=document.createElement('div');box.className='details-text-box';box.setAttribute('pgs',"box['boxMini']");
   const content=document.createElement('div');content.className='details-text md-content';content.setAttribute('pgs','list');
   if(file.message||file.content===''){content.classList.add('details-text-empty');content.textContent=file.message||'Il file di testo è vuoto.';}
   else{
    SocialMarkdown.renderInto(content,file.content);
    const copy=document.createElement('button');copy.type='button';copy.setAttribute('pgs',"button['btnIconOnly' 'btnMini']");copy.className='details-copy';copy.innerHTML=icon('copy');
    copy.setAttribute('aria-label','Copia per i social');copy.title='Copia per i social: testo con grassetto e barrato visibili su Facebook, Instagram e LinkedIn';
    copy.addEventListener('click',()=>copySocialText(file.content,copy));
    box.appendChild(copy);box.classList.add('has-copy');
   }
   box.appendChild(content);block.append(box,head,openingError);container.appendChild(block);
  }
 }).catch(e=>{if(!dialog.isConnected)return;const container=dialog.querySelector('#details-text');container.replaceChildren();const box=document.createElement('div');box.setAttribute('role','alert');container.appendChild(box);setAlert(box,e.message);});
}
function addChannelSection(post,busy){
 if(post.id===null||post.id===undefined||post.id===''||!post.sourcesRelative||!post.sourcesRelative.startsWith('01_Posts/'))return'';
 const present=siblingPosts(post).map(p=>p.channel),missing=clientPlatforms().filter(c=>!present.includes(c));
 if(!missing.length)return'';
 return `<section pgs="box flex['column' 'gapParagraphs']" class="add-channel-section" aria-labelledby="add-channel-title"><h2 pgs="h5" id="add-channel-title">Pubblica anche su altri social</h2><p class="hint">Crea lo stesso post (stesso ID e stessa cartella) per un social che non avevi scelto all’inizio. Verranno aggiunti la riga nel piano editoriale e i file del social nei sorgenti.</p><div pgs="flex['row' 'wrap' 'gapParagraphs']">${missing.map(c=>`<button pgs="button" type="button" data-add-channel="${c}" ${busy}>${socialIcon(c)}<span>Crea anche per ${c}</span></button>`).join('')}</div></section>`;
}
function editInput(){return{key:state.selected.key,revision:state.revision,...state.editValues};}
function editOptions(current,values,empty='Non indicato'){return [...new Set([current,...values])].map(value=>`<option value="${escape(value)}" ${value===current?'selected':''}>${escape(value||empty)}</option>`).join('');}
function openTextConflictModal(){
 if(anyModalOpen('.post-edit-modal'))return;
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
   renderPostEdit();
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
async function confirmEditExit(){
 const changed=Object.keys(state.editOriginal||{}).some(name=>state.editValues?.[name]!==state.editOriginal[name]);
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
 const label=button.innerHTML,iconOnly=button.classList.contains('details-copy'),title=button.title;button.disabled=true;
 const show=(ok)=>{if(iconOnly){button.innerHTML=icon(ok?'check':'close');button.title=ok?'Copiato':'Copia non riuscita';}else button.textContent=ok?'Copiato ✓':'Copia non riuscita';};
 try{await call('copyText',SocialMarkdown.toSocialText(markdown));show(true);}
 catch(e){show(false);}
 setTimeout(()=>{if(button.isConnected){button.innerHTML=label;button.title=title;button.disabled=false;}},1600);
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
 const modal=state.editModal;if(!modal)return;
 const host=modal.dialog.querySelector('#edit-body'),scroller=modal.dialog.querySelector('[pgs~="modal-dialog-content-scroll"]'),top=scroller?.scrollTop||0;
 const d=state.selected,v=state.editValues,busy=disabled(modal.busy);
 const text=v.textName?`<div pgs="flex['column' 'gapParagraphs']" class="md-field">${markdownToolbar()}<div pgs="input list" class="post-text-input md-editor md-content" id="edit-post-text" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="edit-post-text-label" spellcheck="true"></div><p class="hint">${escape(v.textName)} · Modifichi solo il testo di ${escape(d.channel)}. Usa i pulsanti per titoli, grassetto, corsivo, barrato ed elenchi.</p></div>`:alertHtml('warning',state.editTextNote||'Nessun file di testo modificabile presente nei Sorgenti.')+(state.editNoText?`<div pgs="flex['column' 'gapParagraphs']"><div><button pgs="button" type="button" id="edit-regenerate-md" ${busy}>${icon('refresh')}<span>Rigenera file di testo</span></button></div><div id="edit-regenerate-error" role="alert" hidden></div></div>`:'');
 host.innerHTML=`<p class="lead" pgs="flex['row' 'itemCenter' 'gapDetails']">${socialIcon(d.channel)}<span>${escape(d.channel)} · ${d.year}${d.id!==null&&d.id!==''?' · ID '+escape(d.id):''}</span></p>${state.editFolderMissing?`<div pgs="alert['alertWarning']" role="status"><i pgs="icon['icon-triangleExclamation'] alert-icon" aria-hidden="true"></i><div pgs="alert-content flex['column' 'gapParagraphs']"><strong pgs="alert-content-title">Cartella del post non trovata</strong><p>Senza la cartella non puoi salvare le modifiche né vedere il testo. Ricollegala: le verrà ridato il nome che il piano si aspetta.</p><div><button pgs="button" type="button" id="edit-relink" ${busy}>${icon('folderOpen')}<span>Ricollega cartella</span></button></div></div></div>`:''}<div pgs="form flex['column' 'gapElements']" class="edit-fields">${field('Titolo',`<input pgs="input" id="edit-title" maxlength="140" required placeholder=" " aria-describedby="edit-title-caps" value="${escape(v.title)}">`)}<p class="hint field-error" id="edit-title-caps" role="alert" ${editCapsBlocked(v.title,d)?'':'hidden'}>${CAPS_HINT}</p>${field('Argomento',`<input pgs="input" id="edit-topic" maxlength="200" placeholder=" " value="${escape(v.topic)}">`)}<div pgs="grid['column-2' 'gapParagraphs']">${field('Formato',`<select pgs="select" id="edit-format">${editOptions(v.format,platformFormats(d.channel),'Da definire')}</select>`)}${field('Stato pubblicazione',`<select pgs="select" id="edit-status">${editOptions(v.status,STATUSES)}</select>`)}</div><div pgs="flex['column' 'gapParagraphs']">${field('Data pubblicazione',`<input pgs="input" id="edit-date" type="date" min="${d.year}-01-01" max="${d.year}-12-31" value="${escape(v.date)}" ${disabled(v.undefinedDate)}>`,`La data deve rimanere nel ${d.year}.`)}<label pgs="checkbox"><input type="checkbox" id="edit-undefined" ${v.undefinedDate?'checked':''}><span>Data da definire</span></label></div><div pgs="flex['column']"><span pgs="label" id="edit-post-text-label">Testo del post</span>${text}</div></div><div id="edit-error" role="alert" ${state.editError?'':'hidden'}>${alertHtml('error',state.editError)}</div>${addChannelSection(d,'')}<section pgs="alert['alertError']" class="delete-post-section" aria-labelledby="delete-post-title"><i pgs="icon['icon-trash'] alert-icon" aria-hidden="true"></i><div pgs="alert-content flex['column' 'gapParagraphs']"><h2 pgs="alert-content-title h5" id="delete-post-title">Elimina post</h2><p>Rimuove la riga di ${escape(d.channel)} dal piano editoriale e sposta nel <strong>00_cestino</strong> la sua cartella (o solo i suoi file, se la cartella è condivisa con altri social).</p><div><button pgs="button" class="danger" id="delete-post" type="button">${icon('trash')}<span>Elimina post</span></button></div></div></section>`;
 enhance(host);
 if(scroller)scroller.scrollTop=top;
 const $=id=>modal.dialog.querySelector('#'+id);
 $('save-post').disabled=!v.title.trim()||editCapsBlocked(v.title,d);
 const showError=message=>{state.editError=message;setAlert($('edit-error'),message);};
 // durante un salvataggio la modale non si chiude e i comandi sono fermi
 const editBusy=value=>{
  modal.busy=value;state.loading=value;modal.dialog.setAttribute('aria-busy',String(value));
  modal.dialog.querySelectorAll('button,input,select').forEach(el=>{if(value){el.dataset.wasDisabled=String(el.disabled);el.disabled=true;}else{el.disabled=el.dataset.wasDisabled==='true';delete el.dataset.wasDisabled;}});
  const area=$('edit-post-text');if(area){area.contentEditable=String(!value);area.setAttribute('aria-disabled',String(value));}
  if(!value){$('edit-date').disabled=v.undefinedDate;$('save-post').disabled=!v.title.trim()||editCapsBlocked(v.title,d);}
 };
 const finish=()=>{modal.busy=false;state.loading=false;modal.close();};
 // pulsanti nel piede della modale: restano gli stessi tra un aggiornamento e l'altro, quindi onclick (un solo gestore)
 $('edit-cancel').onclick=()=>modal.request();
 $('edit-relink')?.addEventListener('click',()=>openRelinkModal(d,reloadEditAfterRelink));
 $('edit-regenerate-md')?.addEventListener('click',async event=>{const button=event.currentTarget;if(modal.busy)return;button.disabled=true;try{const r=await call('regenerateSource',{key:d.key,revision:state.revision,kind:'md'});await reloadEditAfterRelink();globalThis.pgs?.toast.success({title:'File di testo creato',description:r.name,timeout:4000,closeTitle:'Chiudi'});bringToastToFront();}catch(e){button.disabled=false;setAlert($('edit-regenerate-error'),e.message);}});
 for(const name of ['title','topic','format','status','date'])$('edit-'+name).addEventListener('input',e=>{v[name]=e.target.value;const caps=editCapsBlocked(v.title,d);showCapsHint('edit-title-caps',caps);$('save-post').disabled=!v.title.trim()||caps;showError('');});
 const textArea=$('edit-post-text');
 if(textArea)setupMarkdownEditor(textArea,v);
 $('edit-undefined').addEventListener('change',e=>{v.undefinedDate=e.target.checked;$('edit-date').disabled=v.undefinedDate;showError('');});
 // Aggiungi social: crea la riga di un altro social con lo stesso ID, nella stessa cartella del post
 host.querySelectorAll('[data-add-channel]').forEach(button=>button.addEventListener('click',async()=>{
  if(modal.busy||!await confirmEditExit())return;
  const request={key:d.key,revision:state.revision,channel:button.dataset.addChannel};showError('');editBusy(true);
  const job=progressToast('Aggiunta del social',{lazy:true});
  try{
   const result=await call('addChannel',request);
   if(result.canceled){job.cancel();editBusy(false);return;}
   job.success('Social aggiunto',`“${result.title}” è stato creato anche per ${result.channel} (ID ${result.id}).`);
   finish();await reloadListAt(d.key);
  }catch(e){job.cancel();editBusy(false);showError(e.message);}
 }));
 $('delete-post').addEventListener('click',async()=>{
  if(modal.busy)return;
  const request={key:d.key,revision:state.revision};showError('');editBusy(true);
  const job=progressToast('Eliminazione del post',{lazy:true});
  try{
   const result=await call('deletePost',request);
   if(result.canceled){job.cancel();editBusy(false);return;}
   job.success('Post eliminato',`${result.title} (${result.channel}). ${result.partial?(result.trashRelative?`File spostati in ${result.trashRelative}.`:'Nessun file spostato.'):`Cartella spostata in ${result.trashRelative}.`}`);
   finish();state.highlight=null;await reloadListAt(null);
  }catch(e){job.cancel();editBusy(false);showError(e.message);}
 });
 $('save-post').onclick=async()=>{
  if(modal.busy)return;
  showError('');editBusy(true);
  const job=progressToast('Salvataggio del post');
  try{
   const input=editInput(),plan=await call('planEdit',input);
   const result=await call('saveEdit',input,plan.fingerprint);
   if(result.canceled){job.cancel();editBusy(false);return;}
   job.success('Post salvato',`${result.changes.title} (${result.channel}).${result.createdFile?` Creato ${result.createdFile.name} per il formato ${result.createdFile.format}.`:''}${result.createdFileError?` Il file del formato non è stato creato: ${result.createdFileError}`:''}`);
   finish();await reloadListAt(d.key);
  }catch(e){
   job.cancel();editBusy(false);
   if(e.code==='TEXT_CHANGED'&&v.textName){openTextConflictModal();return;}
   showError(e.message);
  }
 };
}

//# Idee
// To do list condivisa: 00_Settings/idee.json nella cartella del cliente. Ogni idea ha titolo, appunti (testo semplice), social e spunta "sviluppata";
// "Crea post" apre la creazione con titolo e social già compilati.
async function openIdeas(){
 if(state.loading)return;
 if(!state.rootValid){state.route='home';error(state.baseValid?'Scegli o crea un cliente.':'Configura prima la cartella Social in Impostazioni.');return;}
 state.route='ideas';state.error='';state.notice='';state.highlight=null;render();window.scrollTo({top:0});
 await loadIdeas();
}
async function loadIdeas(){
 state.ideasLoading=true;if(state.route==='ideas')render();
 try{const result=await call('ideas');state.ideas=result.ideas;state.error='';}
 catch(e){state.error=e.message;}
 finally{state.ideasLoading=false;if(state.route==='ideas')render();}
}
const ideaChips=(name,selected)=>`<fieldset pgs="chips" class="channel-chips"><legend pgs="visuallyHidden">Social dell’idea</legend>${CHANNELS.filter(c=>clientPlatforms().includes(c)||selected.includes(c)).map(c=>`<label pgs="button['btnMini' 'btnTwoState']" class="channel-chip" data-channel="${c}"><input type="checkbox" name="${name}" value="${c}" ${selected.includes(c)?'checked':''}>${socialIcon(c)}<span>${c}</span></label>`).join('')}</fieldset>`;
const shortDate=iso=>{const d=new Date(iso);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'});};
function ideaRow(idea){
 const icons=idea.channels.map(c=>`<span class="idea-social" title="${escape(c)}">${socialIcon(c)}<span pgs="visuallyHidden">${escape(c)}</span></span>`).join('');
 const notes=(idea.notes||'').replace(/\s+/g,' ').trim();
 // tutta la riga apre la modifica (il titolo è il pulsante per la tastiera); spunta, Crea post ed Elimina restano a parte
 return `<li pgs="flex['row' 'itemCenter' 'justifyBetween' 'gapParagraphs']" class="draft-item idea-item${idea.done?' idea-done':''}" data-idea="${escape(idea.id)}" title="Apri l’idea"><div pgs="flex['row' 'itemStart' 'gapParagraphs' 'nowrap']" class="post-body"><label pgs="checkbox" class="idea-check" title="${idea.done?'Segna come da sviluppare':'Segna come sviluppata'}"><input type="checkbox" data-idea-done ${idea.done?'checked':''} ${disabled(state.loading)}><span pgs="visuallyHidden">Sviluppata</span></label><div pgs="flex['column' 'gapDetails']" class="post-heading idea-heading"><h3 pgs="h6"><button class="post-title-button idea-title" type="button" data-idea-open ${disabled(state.loading)}>${escape(idea.text)}</button></h3>${icons||notes?`<p pgs="flex['row' 'itemCenter' 'gapParagraphs' 'nowrap']" class="post-details idea-meta">${icons?`<span pgs="flex['row' 'itemCenter' 'gapDetails' 'nowrap']" class="idea-socials">${icons}</span>`:''}${notes?`<span pgs="truncate" class="idea-notes">${escape(notes)}</span>`:''}</p>`:''}</div></div><div pgs="flex['row' 'wrap' 'itemCenter' 'gapDetails']" class="post-actions">${idea.done?'':`<button pgs="button['btnMini']" type="button" data-idea-create title="Crea un post da questa idea" ${disabled(state.loading)}>${icon('circlePlus')}<span>Crea post</span></button>`}<button pgs="button['btnIconOnly' 'btnMini']" type="button" data-idea-delete aria-label="Elimina idea" title="Elimina idea" ${disabled(state.loading)}>${icon('trash')}</button></div></li>`;
}
function renderIdeas(){
 const list=state.ideas||[],draft=state.ideaDraft;
 const todo=list.filter(i=>!i.done).reverse(),done=list.filter(i=>i.done).sort((a,b)=>String(b.doneAt).localeCompare(String(a.doneAt)));
 const section=(title,items,emptyText)=>`<section pgs="flex['column' 'gapParagraphs']" class="idea-section"><h2 pgs="h4">${title} <span pgs="badge['badgeNeutral']">${items.length}</span></h2>${items.length?`<ul pgs="flex['column']" class="draft-list idea-list">${items.map(ideaRow).join('')}</ul>`:`<p class="hint">${emptyText}</p>`}</section>`;
 main.innerHTML=`<div pgs="flex['row' 'itemCenter' 'gapParagraphs']" class="list-heading"><h1 pgs="h2">Idee</h1><button pgs="button['btnIconOnly']" id="ideas-refresh" type="button" aria-label="Aggiorna idee" title="Aggiorna idee" ${disabled(state.loading||state.ideasLoading)}>${icon('refresh')}</button></div><p class="lead">Le idee per i prossimi post, da spuntare quando sono sviluppate. Le vedono tutti: sono salvate nella cartella del cliente.</p><form pgs="box form flex['column' 'gapParagraphs']" id="idea-form" novalidate>${field('Nuova idea',`<input pgs="input" id="idea-text" maxlength="500" autocomplete="off" placeholder=" " value="${escape(draft.text)}" ${disabled(state.loading)}>`)}${field('Appunti <span class="optional">(facoltativo)</span>',`<textarea pgs="textarea" id="idea-notes" rows="2" maxlength="10000" placeholder=" " ${disabled(state.loading)}>${escape(draft.notes||'')}</textarea>`,'Spunti e promemoria per chi svilupperà l’idea: non finiscono nel post.')}<div pgs="flex['row' 'wrap' 'itemCenter' 'justifyBetween' 'gapParagraphs']">${ideaChips('idea-channel',draft.channels)}<button pgs="button['btnStrong']" type="submit" id="idea-add" ${disabled(state.loading||!draft.text.trim())}>${icon('plus')}<span>Aggiungi</span></button></div></form>${errorBox()}${state.ideas===null?`<p class="hint">${state.ideasLoading?'Caricamento delle idee…':''}</p>`:`${section('Da sviluppare',todo,'Nessuna idea da sviluppare. Scrivine una qui sopra.')}${done.length?section('Sviluppate',done,''):''}`}`;
 footer.innerHTML=`<button pgs="button['btnTransparent']" id="ideas-home" type="button" ${disabled(state.loading)}>${icon('arrowLeft')}<span>Torna alla home</span></button>`;
 document.getElementById('ideas-home').addEventListener('click',goHome);
 document.getElementById('ideas-refresh').addEventListener('click',loadIdeas);
 const text=document.getElementById('idea-text'),add=document.getElementById('idea-add');
 text.addEventListener('input',()=>{draft.text=text.value;add.disabled=state.loading||!draft.text.trim();});
 document.getElementById('idea-notes').addEventListener('input',event=>{draft.notes=event.target.value;});
 // Invio nel titolo aggiunge l'idea; negli appunti va a capo
 text.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();document.getElementById('idea-form').requestSubmit();}});
 main.querySelectorAll('[name=idea-channel]').forEach(input=>input.addEventListener('change',()=>{draft.channels=[...main.querySelectorAll('[name=idea-channel]:checked')].map(x=>x.value);}));
 document.getElementById('idea-form').addEventListener('submit',async event=>{
  event.preventDefault();if(state.loading||!draft.text.trim())return;
  await changeIdea({action:'add',text:draft.text,notes:draft.notes||'',channels:draft.channels},()=>{state.ideaDraft={text:'',notes:'',channels:[]};},'Idea aggiunta');
  document.getElementById('idea-text')?.focus();
 });
 main.querySelectorAll('[data-idea]').forEach(row=>{
  const idea=list.find(i=>i.id===row.dataset.idea);if(!idea)return;
  row.querySelector('[data-idea-done]').addEventListener('change',event=>changeIdea({action:'update',id:idea.id,done:event.target.checked}));
  const title=row.querySelector('[data-idea-open]');
  row.addEventListener('click',event=>{if(state.loading||event.target.closest('button:not([data-idea-open]),input,label,a'))return;openIdeaModal(idea,title);});
  row.querySelector('[data-idea-delete]').addEventListener('click',event=>confirmDeleteIdea(idea,event.currentTarget));
  row.querySelector('[data-idea-create]')?.addEventListener('click',()=>createFromIdea(idea));
 });
}
async function changeIdea(input,onDone,successTitle=''){
 if(state.loading)return false;
 state.loading=true;state.error='';const y=window.scrollY;render();
 try{
  const result=await call('changeIdea',input);state.ideas=result.ideas;onDone?.(result);
  if(successTitle){globalThis.pgs?.toast.success({title:successTitle,description:result.idea?.text||'',timeout:3000,closeTitle:'Chiudi'});bringToastToFront();}
  return true;
 }catch(e){state.error=e.message;if(e.code==='MISSING')loadIdeas();return false;}
 finally{state.loading=false;if(state.route==='ideas'){render();window.scrollTo({top:y});}}
}
function openIdeaModal(idea,opener){
 if(anyModalOpen())return;
 const dates=[idea.createdAt?`Aggiunta il ${shortDate(idea.createdAt)}`:'',idea.done&&idea.doneAt?`sviluppata il ${shortDate(idea.doneAt)}`:'',!idea.done&&idea.updatedAt&&idea.updatedAt!==idea.createdAt?`modificata il ${shortDate(idea.updatedAt)}`:''].filter(Boolean).join(' · ');
 const body=`${dates?`<p pgs="flex['row' 'itemCenter' 'gapDetails']" class="hint">${icon('calendar')}<span>${escape(dates)}</span></p>`:''}<div pgs="form flex['column' 'gapParagraphs']">${field('Titolo',`<input pgs="input" id="idea-edit-text" maxlength="500" autocomplete="off" required placeholder=" " value="${escape(idea.text)}">`)}${field('Appunti',`<textarea pgs="textarea" id="idea-edit-notes" rows="8" maxlength="10000" placeholder=" ">${escape(idea.notes||'')}</textarea>`,'Testo semplice, senza formattazione: non finisce nel post.')}${ideaChips('idea-edit-channel',idea.channels)}</div><div id="idea-edit-error" role="alert" hidden></div><div pgs="flex['row' 'justifyEnd' 'gapParagraphs']"><button pgs="button" type="button" id="idea-edit-cancel">Annulla</button><button pgs="button['btnStrong']" type="submit" id="idea-edit-save">${icon('save')}<span>Salva</span></button></div>`;
 const channels=d=>[...d.querySelectorAll('[name=idea-edit-channel]:checked')].map(x=>x.value);
 let dialogRef=null;
 const changed=()=>dialogRef&&(dialogRef.querySelector('#idea-edit-text').value!==idea.text||dialogRef.querySelector('#idea-edit-notes').value!==(idea.notes||'')||channels(dialogRef).join()!==idea.channels.join());
 const modal=createModal({title:'Idea',titleId:'idea-edit-title',body,size:'dialogMedium',form:true,beforeClose:async()=>!changed()||confirmDiscardEdit('Chiudere senza salvare?','Le modifiche a questa idea andranno perse.'),onClose:()=>{if(opener?.isConnected)opener.focus({preventScroll:true});}});
 const dialog=dialogRef=modal.dialog,input=dialog.querySelector('#idea-edit-text'),save=dialog.querySelector('#idea-edit-save'),message=dialog.querySelector('#idea-edit-error');
 input.addEventListener('input',()=>{save.disabled=!input.value.trim();});
 dialog.querySelector('#idea-edit-cancel').addEventListener('click',()=>modal.request());
 dialog.querySelector('form').addEventListener('submit',async event=>{
  event.preventDefault();if(modal.busy||!input.value.trim())return;
  modal.busy=true;save.disabled=true;setAlert(message,'');
  try{const result=await call('changeIdea',{action:'update',id:idea.id,text:input.value,notes:dialog.querySelector('#idea-edit-notes').value,channels:channels(dialog)});state.ideas=result.ideas;modal.busy=false;modal.close();render();globalThis.pgs?.toast.success({title:'Idea salvata',description:result.idea?.text||'',timeout:3000,closeTitle:'Chiudi'});bringToastToFront();}
  catch(e){modal.busy=false;save.disabled=false;setAlert(message,e.message);}
 });
 modal.open();input.focus();
}
function confirmDeleteIdea(idea,opener){
 if(anyModalOpen())return;
 const body=`<p>Eliminare questa idea per tutti?</p><p class="hint">${escape(idea.text)}</p><div pgs="flex['row' 'justifyEnd' 'gapParagraphs']"><button pgs="button" type="button" id="idea-delete-cancel">Annulla</button><button pgs="button" class="danger" type="button" id="idea-delete-ok">${icon('trash')}<span>Elimina</span></button></div>`;
 const modal=createModal({title:'Elimina idea',titleId:'idea-delete-title',body,onClose:value=>{if(value==='delete')changeIdea({action:'delete',id:idea.id},null,'Idea eliminata');else if(opener?.isConnected)opener.focus({preventScroll:true});}});
 modal.dialog.querySelector('#idea-delete-cancel').addEventListener('click',()=>modal.close());
 modal.dialog.querySelector('#idea-delete-ok').addEventListener('click',()=>modal.close('delete'));
 modal.open();modal.dialog.querySelector('#idea-delete-cancel').focus();
}
// Crea post dall'idea: titolo (prima riga, al massimo 140 caratteri) e social già compilati
function createFromIdea(idea){
 if(state.loading)return;
 startCreate();
 const p=state.post;
 p.title=idea.text.split('\n')[0].trim().slice(0,140);p.fromIdea=idea.id;
 p.channels=[...idea.channels];for(const c of p.channels){p.channelDates[c]={date:localToday(),undefinedDate:true};p.channelFormats[c]='';}
 // con i social già scelti si parte dal passo Post, dove si controlla il titolo
 if(p.channels.length&&state.rootValid){state.step=1;state.visited=1;}
 render();
}

document.querySelectorAll('[data-nav]').forEach(link=>link.addEventListener('click',async event=>{
 event.preventDefault();if(state.loading||!state.rootValid||anyModalOpen())return;
 closeCompactMenu();
 if(!await confirmLeave())return;
 if(link.dataset.nav==='create'){startCreate();return;}
 if(link.dataset.nav==='ideas'){openIdeas();return;}
 await loadList(link.dataset.nav);window.scrollTo({top:0});
}));

render();
call('initial').then(result=>{state.version=result.version||'';applyStatus(result);render();syncHeaderGutter();refreshUpdate(true);}).catch(e=>error(e.message));
