'use strict';
// Read-only canvas viewer: no PDF links, scripts, forms or external navigation.
window.SocialIllustratorPreview=(()=>{
 let library;
 function pdfLibrary(){return library||=(async()=>{const pdf=await import('../node_modules/pdfjs-dist/build/pdf.mjs');pdf.GlobalWorkerOptions.workerSrc=new URL('../node_modules/pdfjs-dist/build/pdf.worker.mjs',document.baseURI).href;return pdf;})().catch(error=>{library=null;throw error;});}
 const externalIcon='<i pgs="icon[\'icon-externalLink\']" aria-hidden="true"></i>';
 function mount(host,request,call,options={}){
  let closed=false,generation=0,loadingTask=null,renderTask=null,documentPdf=null,pageNumber=1,rendering=false,resizeTimer;
  const note=document.createElement('p');note.className='hint artwork-note';note.setAttribute('role','status');note.textContent='Caricamento della grafica…';host.appendChild(note);
  let select,link,label,openError,canvas,stage,controls,previous,next,counter;
  const alive=token=>!closed&&host.isConnected&&generation===token;
  function clearDocument(){renderTask?.cancel();renderTask=null;documentPdf=null;const task=loadingTask;loadingTask=null;if(task)void task.destroy().catch(()=>{});}
  function updateControls(){if(!controls)return;const pages=documentPdf?.numPages||0;controls.hidden=pages<2;previous.disabled=rendering||pageNumber<=1;next.disabled=rendering||pageNumber>=pages;counter.textContent=`Tavola ${pageNumber} di ${pages}`;}
  function message(text){note.textContent=text;note.hidden=!text;}
  // Altezza disponibile per la tavola: l'area visibile della modale meno link al file, scelta del file,
  // pulsanti delle tavole e margini, così grafica e pulsanti stanno insieme nello schermo.
  function availableHeight(){
   const box=host.closest('[pgs~="modal-dialog-content-scroll"]');
   const visible=box?box.clientHeight:window.innerHeight;
   const pages=documentPdf?.numPages||0;
   const reserved=(link?.offsetHeight||0)+(select?.parentElement?.offsetHeight||0)+(pages>1?Math.max(controls?.offsetHeight||0,44):0)+26+56;
   return Math.max(160,visible-reserved);
  }
  async function renderPage(token,resize=false){
   if(!alive(token)||!documentPdf||rendering)return;
   rendering=true;updateControls();stage.setAttribute('aria-busy','true');message('Caricamento della tavola…');
   try{
    const page=await documentPdf.getPage(pageNumber);if(!alive(token))return;
    const original=page.getViewport({scale:1});
    if(!Number.isFinite(original.width)||!Number.isFinite(original.height)||original.width<=0||original.height<=0)throw new Error('Invalid page size');
    const width=Math.max(120,Math.min(stage.clientWidth-24,1400));const scale=Math.min(width/original.width,availableHeight()/original.height)*Math.min(window.devicePixelRatio||1,2);const viewport=page.getViewport({scale});
    // Render offscreen: the visible canvas and frame keep their size while loading.
    const pendingCanvas=document.createElement('canvas');pendingCanvas.width=Math.max(1,Math.ceil(viewport.width));pendingCanvas.height=Math.max(1,Math.ceil(viewport.height));
    renderTask=page.render({canvasContext:pendingCanvas.getContext('2d'),viewport,background:'rgb(255,255,255)',annotationMode:0});await renderTask.promise;
    if(!alive(token))return;
    if(!stage.hasAttribute('data-ready')||resize){const ratio=Math.min(window.devicePixelRatio||1,2);stage.style.height=Math.ceil(viewport.height/ratio+26)+'px';}
    stage.setAttribute('data-ready','');
    canvas.width=pendingCanvas.width;canvas.height=pendingCanvas.height;canvas.getContext('2d').drawImage(pendingCanvas,0,0);pendingCanvas.width=0;pendingCanvas.height=0;
    canvas.setAttribute('aria-label',`Anteprima Illustrator, tavola ${pageNumber} di ${documentPdf.numPages}`);canvas.hidden=false;message('');host.dataset.preview='ready';
   }catch(error){if(alive(token)&&error.name!=='RenderingCancelledException'){message('Anteprima non disponibile per questa tavola. Puoi aprire il file originale dal link.');host.dataset.preview='unavailable';}}
   finally{if(alive(token)){rendering=false;renderTask=null;stage.setAttribute('aria-busy','false');updateControls();}}
  }
  async function loadFile(name){
   const token=++generation;clearDocument();pageNumber=1;rendering=false;canvas.hidden=true;stage.removeAttribute('data-ready');stage.style.removeProperty('height');stage.removeAttribute('aria-busy');controls.hidden=true;openError.hidden=true;host.dataset.preview='loading';label.textContent=name;link.setAttribute('aria-label','Apri '+name);link.dataset.filename=name;message('Caricamento dell’anteprima…');
   try{
    const [pdf,result]=await Promise.all([pdfLibrary(),call('illustratorData',{...request,name})]);if(!alive(token))return;
    const resource=new URL('../node_modules/pdfjs-dist/',document.baseURI).href;
    loadingTask=pdf.getDocument({data:new Uint8Array(result.data),isEvalSupported:false,enableXfa:false,disableWorkerRendering:true,useWasm:true,wasmUrl:resource+'wasm/',iccUrl:resource+'iccs/',cMapUrl:resource+'cmaps/',standardFontDataUrl:resource+'standard_fonts/',useWorkerFetch:false,maxImageSize:32*1024*1024,canvasMaxAreaInBytes:32*1024*1024});
    loadingTask.onPassword=()=>{if(alive(token)){message('Anteprima non disponibile: il file è protetto da password. Puoi aprire l’originale dal link.');host.dataset.preview='unavailable';clearDocument();}};
    documentPdf=await loadingTask.promise;if(!alive(token))return;
    await renderPage(token);
   }catch(error){if(alive(token)){clearDocument();message(error.code?error.message:'Anteprima non disponibile. Puoi aprire il file originale dal link.');host.dataset.preview='unavailable';}}
  }
  call('illustratorFiles',request).then(result=>{
   if(closed||!host.isConnected)return;
   if(!result.files.length){
    message(result.message||'Nessun file Illustrator presente nella cartella sorgenti.');host.dataset.preview='empty';
    // file .ai mancante: lo si ricrea dal template del social
    if(result.empty&&options.onRegenerated){
     const button=document.createElement('button');button.type='button';button.setAttribute('pgs','button');button.dataset.regenerate='ai';button.innerHTML='<i pgs="icon[\'icon-refresh\']" aria-hidden="true"></i><span>Rigenera file Illustrator</span>';
     const wrap=document.createElement('div');wrap.appendChild(button);host.appendChild(wrap);
     button.addEventListener('click',async()=>{button.disabled=true;message('Creo il file Illustrator dal template…');try{await call('regenerateSource',{...request,kind:'ai'});if(!closed)options.onRegenerated();}catch(error){if(!closed){button.disabled=false;message(error.message);}}});
    }
    return;
   }
   if(result.message){const extra=document.createElement('p');extra.className='hint details-note';extra.textContent=result.message;host.insertBefore(extra,note);}
   if(result.files.length>1){const field=document.createElement('div');field.className='artwork-file-field';field.setAttribute('pgs',"flex['column']");const caption=document.createElement('label');caption.setAttribute('pgs','label');caption.htmlFor='artwork-file';caption.textContent='File Illustrator';select=document.createElement('select');select.id='artwork-file';select.setAttribute('pgs','select');for(const file of result.files){const option=document.createElement('option');option.value=file.name;option.textContent=file.name;select.appendChild(option);}select.addEventListener('change',()=>void loadFile(select.value));field.append(caption,select);host.insertBefore(field,note);}
   link=document.createElement('a');link.href='#';link.className='details-filename details-file-link artwork-file-link';link.title='Apri il file Illustrator';label=document.createElement('span');link.appendChild(label);link.insertAdjacentHTML('beforeend',externalIcon);
   let opening=false;link.addEventListener('click',async event=>{event.preventDefault();if(opening)return;opening=true;link.setAttribute('aria-disabled','true');openError.hidden=true;try{await call('openIllustrator',{...request,name:link.dataset.filename});}catch(error){if(!closed){openError.textContent=error.message;openError.hidden=false;}}finally{opening=false;link.removeAttribute('aria-disabled');}});
   openError=document.createElement('p');openError.className='error-text details-open-error';openError.setAttribute('pgs',"textColor['txtError']");openError.setAttribute('role','alert');openError.hidden=true;host.insertBefore(link,note);host.insertBefore(openError,note);
   stage=document.createElement('div');stage.className='artwork-stage';stage.setAttribute('pgs','box');canvas=document.createElement('canvas');canvas.hidden=true;canvas.setAttribute('role','img');stage.append(note,canvas);host.appendChild(stage);
   controls=document.createElement('div');controls.className='artwork-controls';controls.setAttribute('pgs',"flex['row' 'itemCenter' 'justifyCenter' 'gapParagraphs']");controls.hidden=true;previous=document.createElement('button');previous.type='button';previous.setAttribute('pgs',"button['btnIconOnly' 'btnMini']");previous.innerHTML='<i pgs="icon[\'icon-arrowLeft\']" aria-hidden="true"></i>';previous.setAttribute('aria-label','Tavola precedente');counter=document.createElement('span');counter.className='artwork-page-count';counter.setAttribute('aria-live','polite');next=document.createElement('button');next.type='button';next.setAttribute('pgs',"button['btnIconOnly' 'btnMini']");next.innerHTML='<i pgs="icon[\'icon-arrowRight\']" aria-hidden="true"></i>';next.setAttribute('aria-label','Tavola successiva');
   previous.addEventListener('click',()=>{if(!rendering&&pageNumber>1){pageNumber--;void renderPage(generation);}});next.addEventListener('click',()=>{if(!rendering&&pageNumber<documentPdf.numPages){pageNumber++;void renderPage(generation);}});controls.append(previous,counter,next);host.appendChild(controls);host.append(link,openError);
   void loadFile(result.files[0].name);
  }).catch(error=>{if(!closed){message(error.message);host.dataset.preview='unavailable';}});
  const resize=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(!closed&&documentPdf&&!rendering)void renderPage(generation,true);},160);};window.addEventListener('resize',resize);
  return()=>{closed=true;generation++;clearTimeout(resizeTimer);window.removeEventListener('resize',resize);clearDocument();if(canvas){canvas.width=0;canvas.height=0;}};
 }
 return{mount};
})();
