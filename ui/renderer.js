'use strict';
const api=window.socialAPI;
const localToday=()=>{const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const initialPost=()=>({channels:[],title:'',topic:'',format:'',date:localToday(),undefinedDate:false,year:String(new Date().getFullYear())});
const state={route:'home',step:0,visited:0,root:'',rootValid:false,post:initialPost(),plan:null,result:null,error:'',loading:false,drafts:[],revision:'',selected:null,draftDate:'',datePlan:null,notice:'',filterYear:'',filterChannel:''};
const main=document.getElementById('main'),footer=document.getElementById('footer'),progress=document.getElementById('progress');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function call(method,...args){if(!api)throw new Error('Apri Social dall’applicazione per accedere ai file.');const response=await api[method](...args);if(!response.ok){const e=new Error(response.error.message);e.code=response.error.code;throw e;}return response.value;}
function valid(){if(state.step===0)return state.rootValid&&state.post.channels.length>0;if(state.step===1)return state.post.title.trim().length>0&&state.post.title.trim().length<=140&&!!state.post.format;if(state.step===2)return state.post.undefinedDate?/^\d{4}$/.test(state.post.year)&&Number(state.post.year)>=1900&&Number(state.post.year)<=9999:/^\d{4}-\d{2}-\d{2}$/.test(state.post.date);return !!state.plan;}
function updateContinue(){const next=document.getElementById('next');if(next)next.disabled=state.loading||!valid();}
function render(){
 document.querySelector('.app-header').hidden=state.route==='home';
 progress.hidden=state.route!=='create';
 document.body.dataset.screen=state.route;
 document.getElementById('subtitle').textContent=state.route==='create'?'Nuovo post':'Post in bozza';
 document.title=state.route==='home'?'Social':state.route==='create'?'Social — Nuovo post':'Social — Post in bozza';
 if(state.route==='home')return renderHome();
 if(state.route==='drafts')return renderDrafts();
 if(state.route==='edit-date')return renderDateEdit();
 renderWizard();
 if(!state.loading){const home=document.createElement('button');home.type='button';home.className='home-link';home.textContent='Torna alla home';home.addEventListener('click',goHome);footer.appendChild(home);}
}
function renderWizard(){
 progress.innerHTML=['Social','Post','Data','Riepilogo'].map((name,i)=>`<button class="step ${i===state.step?'current':i<state.step?'complete':''}" type="button" data-step="${i}" ${i>state.visited||state.loading||state.result?'disabled':''} ${i===state.step?'aria-current="step"':''}><span class="number">${i+1}</span><span>${name}</span></button>`).join('');
 if(state.result){renderSuccess();return;}
 let content='';
 if(state.step===0)content=`<h1>Dove vuoi pubblicare?</h1><p class="lead">Seleziona uno o più social per questo post.</p><div class="social-list">${['Facebook','Instagram','LinkedIn'].map(c=>`<label class="social-option"><input type="checkbox" name="social" value="${c}" ${state.post.channels.includes(c)?'checked':''}><span>${c}</span></label>`).join('')}</div><div class="folder-setting"><label>Cartella Social</label><div class="folder-path" title="${escape(state.root)}"><span>${escape(state.root||'Nessuna cartella selezionata')}</span></div><button class="btn" id="choose-root" type="button">${state.root?'Cambia cartella':'Scegli cartella'}</button></div>`;
 if(state.step===1)content=`<h1>Di cosa parla il post?</h1><p class="lead">Questi dati saranno uguali per i social selezionati.</p><div class="fields"><div class="field"><label for="title">Titolo</label><input class="text-input" id="title" maxlength="140" autocomplete="off" value="${escape(state.post.title)}"></div><div class="field"><label for="topic">Argomento <span class="optional">(facoltativo)</span></label><input class="text-input" id="topic" maxlength="200" autocomplete="off" value="${escape(state.post.topic)}"></div><div class="field"><label for="format">Formato</label><select class="select-input" id="format"><option value="">Scegli un formato</option>${['Immagine singola','Carosello','Video','Reel','Storia'].map(f=>`<option ${state.post.format===f?'selected':''}>${f}</option>`).join('')}</select></div></div>`;
 if(state.step===2)content=`<h1>Quando vuoi pubblicare?</h1><p class="lead">Scegli una data oppure lasciala da definire.</p><div class="fields"><div class="field"><label for="date">Data pubblicazione</label><input class="text-input" type="date" id="date" value="${escape(state.post.date)}" ${state.post.undefinedDate?'disabled':''}></div><label class="check-line"><input type="checkbox" id="undefined-date" ${state.post.undefinedDate?'checked':''}><span>Data da definire</span></label>${state.post.undefinedDate?`<div class="field year-field"><label for="year">Anno</label><input class="text-input" id="year" type="number" inputmode="numeric" min="1900" max="9999" step="1" value="${escape(state.post.year)}"><p class="hint">La cartella inizierà con xx-xx.</p></div>`:''}</div>`;
 if(state.step===3){const p=state.plan;content=p?`<h1>È tutto pronto?</h1><p class="lead">Controlla i dati prima di creare il post.</p><dl class="review"><dt>Titolo</dt><dd>${escape(p.title)}</dd><dt>Social</dt><dd>${escape(p.channels.join(', '))}</dd><dt>Pubblicazione</dt><dd>${p.undefinedDate?'Da definire · '+p.year:escape(p.date.split('-').reverse().join('/'))}</dd><dt>Argomento</dt><dd>${escape(p.topic||'—')}</dd><dt>Formato</dt><dd>${escape(p.format)}</dd><dt>ID post</dt><dd>${p.id}</dd></dl><div class="destinations">${p.folders.map(f=>`<div class="destination"><strong>${escape(f.channel)}</strong><span class="destination-path">${escape(f.relative)}</span><span class="file-note">${escape(f.aiName)} · ${escape(f.textName)}</span></div>`).join('')}</div><p class="review-total">${p.channels.length===1?'Verranno create una cartella e una riga':'Verranno create '+p.channels.length+' cartelle e '+p.channels.length+' righe'} nel piano editoriale, nella scheda ${p.year}.</p>`:`<h1>Controllo dei dati</h1><p class="loading">Verifico cartelle, template e piano editoriale…</p>`;}
 main.innerHTML=`<div class="screen-enter">${content}<div class="error" role="alert" id="error">${escape(state.error)}</div></div>`;
 footer.innerHTML=`<span class="step-caption">Passo ${state.step+1} di 4</span><div class="footer-actions"><button class="btn" id="back" type="button" ${state.step===0||state.loading?'disabled':''}>Indietro</button><button class="btn primary" id="next" type="button" ${!valid()||state.loading?'disabled':''}>${state.loading?'Attendi…':state.step===3?'Crea post':'Continua'}</button></div>`;
 wire();
}
function error(message){state.error=message;const box=document.getElementById('error');if(box)box.textContent=message;}
function wire(){
 document.querySelectorAll('[name=social]').forEach(input=>input.addEventListener('change',()=>{state.post.channels=Array.from(document.querySelectorAll('[name=social]:checked')).map(x=>x.value);state.plan=null;error('');updateContinue();}));
 document.getElementById('choose-root')?.addEventListener('click',async()=>{try{const result=await call('chooseRoot');if(result){state.root=result.root;state.rootValid=result.valid;state.plan=null;state.error='';render();}}catch(e){error(e.message);}});
 for(const id of ['title','topic','format','date','year'])document.getElementById(id)?.addEventListener('input',event=>{state.post[id]=event.target.value;state.plan=null;error('');updateContinue();});
 document.getElementById('undefined-date')?.addEventListener('change',event=>{state.post.undefinedDate=event.target.checked;state.plan=null;state.error='';render();if(state.post.undefinedDate)document.getElementById('year')?.focus();});
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
 main.innerHTML=`<h1>Post creato</h1><p class="lead">${r.channels.length===1?'La cartella e la riga Excel sono pronte.':'Le '+r.channels.length+' cartelle e le righe Excel sono pronte.'}</p><dl class="review"><dt>Titolo</dt><dd>${escape(r.title)}</dd><dt>ID post</dt><dd>${r.id}</dd><dt>Anno</dt><dd>${r.year}</dd></dl><div class="success-detail">${r.created.map(f=>`<div class="destination"><strong>${escape(f.channel)}</strong><span class="destination-path">${escape(f.path)}</span></div>`).join('')}</div><div class="success-actions"><button class="btn" id="open-root" type="button">Apri cartella Social</button><button class="btn primary" id="new-post" type="button">Crea un altro post</button></div><div class="error" role="alert" id="error"></div>`;
 footer.innerHTML='<span class="step-caption">Creazione completata</span>';
 document.getElementById('open-root').addEventListener('click',async()=>{try{await call('openResult');}catch(e){error(e.message);}});
 document.getElementById('new-post').addEventListener('click',()=>{state.step=0;state.visited=0;state.post=initialPost();state.plan=null;state.result=null;state.error='';render();});
}
function folderSetting(){return `<div class="folder-setting"><label>Cartella Social</label><div class="folder-path" title="${escape(state.root)}"><span>${escape(state.root||'Nessuna cartella selezionata')}</span></div><button class="btn" id="choose-root" type="button" ${state.loading?'disabled':''}>${state.root?'Cambia cartella':'Scegli cartella'}</button></div>`;}
function goHome(){if(state.loading)return;state.route='home';state.error='';state.notice='';state.selected=null;state.datePlan=null;render();}
async function chooseHomeRoot(){
 try{const result=await call('chooseRoot');if(result){state.root=result.root;state.rootValid=result.valid;state.error='';state.drafts=[];state.revision='';render();}}
 catch(e){error(e.message);}
}
function renderHome(){
 main.innerHTML=`<div class="home-screen"><h1>Social</h1><div class="home-actions"><button class="btn home-action" id="drafts" type="button" ${state.loading?'disabled':''}>Post in bozza</button><button class="btn primary home-action" id="create-new" type="button" ${state.loading?'disabled':''}>Crea nuovo post</button></div>${folderSetting()}<div class="error" id="error" role="alert">${escape(state.error)}</div></div>`;
 footer.innerHTML='';
 document.getElementById('choose-root').addEventListener('click',chooseHomeRoot);
 document.getElementById('drafts').addEventListener('click',loadDrafts);
 document.getElementById('create-new').addEventListener('click',()=>{state.route='create';state.step=0;state.visited=0;state.post=initialPost();state.plan=null;state.result=null;state.error='';render();});
}
async function loadDrafts(){
 if(state.loading)return;
 if(!state.rootValid){error('Scegli prima la cartella Social qui sotto.');return;}
 state.loading=true;state.error='';render();
 try{const result=await call('drafts');state.drafts=result.drafts;state.revision=result.revision;state.route='drafts';state.selected=null;state.datePlan=null;}
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
function renderDrafts(){
 const years=[...new Set(state.drafts.map(d=>String(d.year)))].sort().reverse();
 const items=state.drafts.filter(d=>(!state.filterYear||String(d.year)===state.filterYear)&&(!state.filterChannel||d.channel===state.filterChannel));
 main.innerHTML=`<h1>Post in bozza</h1><p class="lead">Tutti i post non ancora pubblicati. Aggiorna la data del singolo social.</p>${state.notice?`<div class="notice" role="status">${escape(state.notice)}</div>`:''}<div class="draft-toolbar"><div class="field"><label for="filter-year">Anno</label><select id="filter-year" class="select-input"><option value="">Tutti gli anni</option>${years.map(y=>`<option ${state.filterYear===y?'selected':''}>${y}</option>`).join('')}</select></div><div class="field"><label for="filter-channel">Canale</label><select id="filter-channel" class="select-input"><option value="">Tutti i social</option>${['Facebook','Instagram','LinkedIn'].map(c=>`<option ${state.filterChannel===c?'selected':''}>${c}</option>`).join('')}</select></div><button class="btn" id="refresh" type="button" ${state.loading?'disabled':''}>${state.loading?'Attendi…':'Aggiorna elenco'}</button></div><p class="draft-count">${items.length} ${items.length===1?'post':'post'}</p><div class="draft-list">${items.length?items.map(d=>`<article class="draft-item" data-channel="${escape(d.channel)}"><div><h2>${escape(d.title)}</h2><p class="draft-meta draft-channel-line"><span class="social-label">${socialIcon(d.channel)}<span>${escape(d.channel)}</span></span><span>· ${d.year} · ${escape(d.status||'Stato non indicato')}${d.id!==null&&d.id!==''?' · ID '+escape(d.id):''}</span></p>${d.date?`<p class="draft-meta">Data: ${escape(d.date.split('-').reverse().join('/'))}</p>`:''}</div><button class="btn" data-draft="${escape(d.key)}" type="button" ${state.loading?'disabled':''}>Aggiorna data</button></article>`).join(''):'<p class="empty-state">Nessun post in bozza per questa selezione.</p>'}</div><div class="error" id="error" role="alert">${escape(state.error)}</div>`;
 footer.innerHTML=`<button class="btn" id="home" type="button" ${state.loading?'disabled':''}>Torna alla home</button>`;
 document.getElementById('home').addEventListener('click',goHome);
 document.getElementById('refresh').addEventListener('click',loadDrafts);
 for(const [id,key] of [['filter-year','filterYear'],['filter-channel','filterChannel']])document.getElementById(id).addEventListener('change',e=>{state[key]=e.target.value;render();});
 main.querySelectorAll('[data-draft]').forEach(button=>button.addEventListener('click',()=>{
  state.selected=state.drafts.find(d=>d.key===button.dataset.draft);state.datePlan=null;
  state.draftDate=state.selected.date || (state.selected.year===new Date().getFullYear()?localToday():state.selected.year+'-01-01');
  state.error='';state.route='edit-date';render();
 }));
}
function dateInput(){return{key:state.selected.key,revision:state.revision,date:state.draftDate};}
function renderDateEdit(){
 const d=state.selected,p=state.datePlan;
 main.innerHTML=`<h1>Aggiorna la data</h1><p class="lead">${escape(d.title)}</p><dl class="review"><dt>Canale</dt><dd>${escape(d.channel)}</dd><dt>Anno</dt><dd>${d.year}</dd><dt>Data attuale</dt><dd>${d.date?escape(d.date.split('-').reverse().join('/')):'Da definire'}</dd></dl><div class="field"><label for="draft-date">Nuova data di pubblicazione</label><input class="text-input" type="date" id="draft-date" min="${d.year}-01-01" max="${d.year}-12-31" value="${escape(state.draftDate)}" ${state.loading?'disabled':''}><p class="hint">Scegli una data del ${d.year}. La modifica riguarda solo ${escape(d.channel)}.</p></div>${p?`<div class="date-summary" id="date-summary"><strong>Controlla la modifica</strong><p>Nuova data: ${escape(p.date.split('-').reverse().join('/'))}</p><p>Cartella: ${escape(p.newRelative)}</p><p>Verranno aggiornati la data in Excel e il link ai sorgenti. I file del post, l’ID e lo stato saranno conservati.</p></div>`:''}<div class="error" role="alert" id="error">${escape(state.error)}</div>`;
 footer.innerHTML=`<button class="btn" id="cancel-date" type="button" ${state.loading?'disabled':''}>Torna alle bozze</button><button class="btn primary" id="save-date" type="button" ${state.loading||!state.draftDate?'disabled':''}>${state.loading?'Attendi…':p?'Salva data':'Controlla modifica'}</button>`;
 document.getElementById('cancel-date').addEventListener('click',()=>{state.route='drafts';state.error='';render();});
 document.getElementById('draft-date').addEventListener('input',e=>{state.draftDate=e.target.value;state.datePlan=null;document.getElementById('date-summary')?.remove();const b=document.getElementById('save-date');b.textContent='Controlla modifica';b.disabled=!state.draftDate;error('');});
 document.getElementById('save-date').addEventListener('click',async()=>{
  if(state.loading)return;
  const plan=state.datePlan;state.loading=true;state.error='';render();
  try{
   if(!plan)state.datePlan=await call('planDate',dateInput());
   else{const result=await call('updateDate',dateInput(),plan.fingerprint);state.notice=`Data aggiornata per ${result.channel}: ${result.date.split('-').reverse().join('/')}.`;state.loading=false;await loadDrafts();return;}
  }catch(e){state.error=e.message;state.datePlan=null;}
  finally{state.loading=false;render();}
 });
}
render();
call('initial').then(result=>{state.root=result.root;state.rootValid=result.valid;state.error=result.valid?'':result.message||'';render();}).catch(e=>error(e.message));
