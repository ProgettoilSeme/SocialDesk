'use strict';
const path = require('node:path');
const { unzipSync, zipSync, strFromU8, strToU8 } = require('fflate');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const { excelDate } = require('./dates.cjs');
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types';
const HEADERS = ['ID post', 'Canale', 'Data pubblicazione', 'Titolo', 'Argomento', 'Formato', 'Stato pubblicazione', 'Cartella Sorgenti'];
const PREVIOUS_STATUSES='"testi da creare,immagine da creare,da pubblicare,pubblicato"';
const CURRENT_STATUSES='"testi da creare,testi in bozza,immagine da creare,da pubblicare,pubblicato"';
const serial = new XMLSerializer();
const children = (node, name, ns = MAIN) => Array.from(node.childNodes || []).filter(n => n.nodeType === 1 && n.localName === name && n.namespaceURI === ns);
const first = (node, name, ns = MAIN) => children(node, name, ns)[0];
function element(doc, name, ns = MAIN) { return doc.createElementNS(ns, name); }
function parse(bytes) { return new DOMParser().parseFromString(strFromU8(bytes), 'application/xml'); }
function encode(doc) { return strToU8(serial.serializeToString(doc)); }
function resolvePart(base, target) {
  const result = target.startsWith('/') ? target.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(base), target));
  if (!result.startsWith('xl/') || result.includes('../')) throw new Error('Riferimento interno Excel non valido.');
  return result;
}
function relPart(part) { return path.posix.join(path.posix.dirname(part), '_rels', path.posix.basename(part) + '.rels'); }
function newRelationships() { return parse(strToU8(`<Relationships xmlns="${RELS}"/>`)); }
function setInline(doc, cell, value) {
  while (cell.firstChild) cell.removeChild(cell.firstChild);
  if (typeof value === 'number') {
    cell.removeAttribute('t');
    const v = element(doc, 'v'); v.textContent = String(value); cell.appendChild(v);
  } else {
    cell.setAttribute('t', 'inlineStr');
    const is = element(doc, 'is'), text = element(doc, 't');
    text.setAttribute('xml:space', 'preserve'); text.textContent = value == null ? '' : String(value);
    is.appendChild(text); cell.appendChild(is);
  }
}
// Tendine del piano: Stato (vecchio elenco → nuovo), Canale (B) e Formato (F) con tutte le piattaforme e i formati
// dell'app. Si aggiornano solo le liste scritte nella cella (tra virgolette), mai quelle con un riferimento.
function updateStatusValidation(doc){
 const {CHANNELS,FORMATS}=require('./posts.cjs');
 const lists={B:`"${Object.keys(CHANNELS).join(',')}"`,F:`"${FORMATS.join(',')}"`};
 let changed=false;
 for(const validation of Array.from(doc.getElementsByTagNameNS(MAIN,'dataValidation'))){
  if(validation.getAttribute('type')!=='list')continue;
  const sqref=validation.getAttribute('sqref')||'',formula=first(validation,'formula1');
  if(!formula)continue;
  if(/(?:^|\s)G\d+:G\d+(?:\s|$)/.test(sqref)&&formula.textContent===PREVIOUS_STATUSES){formula.textContent=CURRENT_STATUSES;changed=true;continue;}
  for(const [column,list] of Object.entries(lists)){
   if(!new RegExp(`(?:^|\\s)${column}\\d+:${column}\\d+(?:\\s|$)`).test(sqref)||!/^"[^"]*"$/.test(formula.textContent))continue;
   if(formula.textContent!==list){formula.textContent=list;changed=true;}
  }
 }
 return changed;
}

class Book {
  constructor(buffer) {
    if (buffer.length > 50 * 1024 * 1024) throw new Error('Il piano editoriale supera 50 MB.');
    let total = 0;
    this.parts = unzipSync(buffer, { filter(file) {
      total += file.originalSize;
      if (file.originalSize > 60 * 1024 * 1024 || total > 200 * 1024 * 1024) throw new Error('Il file Excel è troppo grande per questa versione.');
      return true;
    } });
    for (const p of ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', '[Content_Types].xml']) if (!this.parts[p]) throw new Error('Il file non è un piano Excel .xlsx valido.');
    this.workbook = parse(this.parts['xl/workbook.xml']);
    this.rels = parse(this.parts['xl/_rels/workbook.xml.rels']);
    this.types = parse(this.parts['[Content_Types].xml']);
    this.strings = this.parts['xl/sharedStrings.xml'] ? children(parse(this.parts['xl/sharedStrings.xml']).documentElement, 'si').map(n => n.textContent) : [];
  }
  value(cell) {
    if (!cell) return null;
    const type = cell.getAttribute('t'), v = first(cell, 'v');
    if (type === 'inlineStr') return first(cell, 'is')?.textContent ?? '';
    if (!v) return null;
    if (type === 's') return this.strings[Number(v.textContent)] ?? '';
    if (type === 'str' || type === 'd') return v.textContent;
    return Number(v.textContent);
  }
  cell(row, col) { return children(row, 'c').find(c => c.getAttribute('r').replace(/\d/g, '') === col); }
  sheets() { return children(first(this.workbook.documentElement, 'sheets'), 'sheet'); }
  sheetPart(sheet) {
    const id = sheet.getAttributeNS(OFFICE, 'id');
    const rel = children(this.rels.documentElement, 'Relationship', RELS).find(r => r.getAttribute('Id') === id);
    if (!rel) throw new Error('Collegamento alla scheda Excel mancante.');
    return resolvePart('xl/workbook.xml', rel.getAttribute('Target'));
  }
  openSheet(sheet) {
    const part = this.sheetPart(sheet), doc = parse(this.parts[part]);
    const data = first(doc.documentElement, 'sheetData');
    if (!data) throw new Error('La scheda Excel non contiene dati leggibili.');
    const header = children(data, 'row').find(row => {
      if (Number(row.getAttribute('r')) > 20) return false;
      return HEADERS.every((label, i) => this.value(this.cell(row, String.fromCharCode(65 + i))) === label);
    });
    if (!header) throw new Error('Le colonne del piano non corrispondono al modello concordato.');
    return { sheet, part, doc, data, header: Number(header.getAttribute('r')) };
  }
  year(year, create = false) {
    const sheet = this.sheets().find(s => s.getAttribute('name') === String(year));
    if (sheet) return { ...this.openSheet(sheet), exists: true };
    let template;
    for (const candidate of this.sheets()) { try { template = this.openSheet(candidate); break; } catch {} }
    if (!template) throw new Error('Non trovo una scheda con le otto colonne del piano editoriale.');
    if (!create) return { ...template, exists: false };
    return this.createYear(year, template);
  }
  info(year) {
    const s = this.year(year);
    let maxId = -1, lastRow = s.header, count = 0;
    if (s.exists) for (const row of children(s.data, 'row')) {
      const r = Number(row.getAttribute('r'));
      if (r <= s.header) continue;
      const channel = this.value(this.cell(row, 'B')), title = this.value(this.cell(row, 'D'));
      if (channel == null && title == null || channel === '' && title === '') continue;
      if (!channel && !title) continue;
      lastRow = Math.max(lastRow, r); count++;
      const id = this.value(this.cell(row, 'A'));
      if (id !== null && id !== '' && /^\d+$/.test(String(id)) && Number.isSafeInteger(Number(id))) maxId = Math.max(maxId, Number(id));
    }
    if (maxId >= Number.MAX_SAFE_INTEGER) throw new Error('La numerazione degli ID ha raggiunto il limite.');
    return { exists: s.exists, nextId: maxId + 1, lastRow, count, header: s.header };
  }
  posts() {
    const result = [];
    const date1904 = ['1','true'].includes(first(this.workbook.documentElement,'workbookPr')?.getAttribute('date1904'));
    for (const sheet of this.sheets()) {
      const name = sheet.getAttribute('name');
      if (!/^\d{4}$/.test(name)) continue;
      const s = this.openSheet(sheet);
      const rels = this.parts[relPart(s.part)] ? parse(this.parts[relPart(s.part)]) : newRelationships();
      const links = first(s.doc.documentElement,'hyperlinks');
      for (const row of children(s.data,'row')) {
        const number = Number(row.getAttribute('r'));
        if (number <= s.header) continue;
        const title = this.value(this.cell(row,'D')), channel = this.value(this.cell(row,'B'));
        const status = String(this.value(this.cell(row,'G')) || '').trim();
        if (!title || !channel) continue;
        const link = children(links || {},'hyperlink').find(h=>h.getAttribute('ref')==='H'+number);
        const relation = link && children(rels.documentElement,'Relationship',RELS).find(r=>r.getAttribute('Id')===link.getAttributeNS(OFFICE,'id') && r.getAttribute('Type')===OFFICE+'/hyperlink');
        const value = this.value(this.cell(row,'C'));
        const date = excelDate(value,date1904);
        result.push({key:`${name}:${number}`,year:Number(name),row:number,id:this.value(this.cell(row,'A')),title:String(title),channel:String(channel),topic:String(this.value(this.cell(row,'E'))||''),format:String(this.value(this.cell(row,'F'))||''),status,date,sourcesRelative:relation?.getAttribute('Target') || ''});
      }
    }
    return result;
  }
  drafts() { return this.posts().filter(p=>p.status.toLowerCase()!=='pubblicato'); }
  updateStatusValidations(){
    let changed=false;
    for(const sheet of this.sheets()){
      if(!/^\d{4}$/.test(sheet.getAttribute('name')))continue;
      const part=this.sheetPart(sheet),doc=parse(this.parts[part]);
      if(updateStatusValidation(doc)){this.parts[part]=encode(doc);changed=true;}
    }
    return changed?Buffer.from(zipSync(this.parts,{level:6})):null;
  }
  deletePost(year,number){
    if(!this.posts().some(p=>p.year===year&&p.row===number))throw new Error('Il post non è più disponibile. Aggiorna l’elenco.');
    // The editorial model has no cell formulas, drawings or comments. Stop rather
    // than corrupt references if a workbook has been extended with these features.
    for(const part of Object.keys(this.parts).filter(p=>/^xl\/worksheets\/[^/]+\.xml$/.test(p))){
      const doc=parse(this.parts[part]);
      if(doc.getElementsByTagNameNS(MAIN,'f').length)throw new Error('Il piano contiene formule: non posso eliminare la riga mantenendo tutti i riferimenti. Nessun dato è stato modificato.');
    }
    const s=this.year(year),doc=s.doc;
    if(['drawing','legacyDrawing','legacyDrawingHF','oleObjects','controls','pivotTableParts','rowBreaks'].some(tag=>first(doc.documentElement,tag)))throw new Error('La scheda contiene elementi aggiuntivi che non posso aggiornare durante l’eliminazione. Nessun dato è stato modificato.');
    const names=first(this.workbook.documentElement,'definedNames');
    if(children(names||{},'definedName').some(n=>n.textContent.includes(String(year)+'!')||n.textContent.includes("'"+year+"'!")))throw new Error('La scheda contiene intervalli con nome: controlla il piano prima di eliminare la riga.');
    const shift=ref=>{
      const match=/^(\$?[A-Z]+)(\$?)(\d+)(?::(\$?[A-Z]+)(\$?)(\d+))?$/.exec(ref);
      if(!match)return ref;
      let start=Number(match[3]),end=Number(match[6]||match[3]);
      if(start===number&&end===number)return null;
      if(start>number)start--;if(end>=number)end--;
      return match[1]+match[2]+start+(match[4]?':'+match[4]+match[5]+end:'');
    };
    const affectedMerge=Array.from(doc.getElementsByTagNameNS(MAIN,'mergeCell')).some(n=>{const rows=n.getAttribute('ref').match(/\d+/g)||[];return Number(rows[0])<=number&&Number(rows.at(-1))>=number;});
    if(affectedMerge)throw new Error('La riga contiene celle unite: separale prima di eliminare il post.');
    for(const tag of ['formula','formula1','formula2'])for(const node of Array.from(doc.getElementsByTagNameNS(MAIN,tag))){if(!/^"[\s\S]*"$/.test(node.textContent))throw new Error('La scheda contiene formule negli intervalli di formattazione o convalida. Nessun dato è stato modificato.');}
    const row=children(s.data,'row').find(r=>Number(r.getAttribute('r'))===number);s.data.removeChild(row);
    for(const r of children(s.data,'row'))if(Number(r.getAttribute('r'))>number){r.setAttribute('r',String(Number(r.getAttribute('r'))-1));for(const c of children(r,'c'))c.setAttribute('r',shift(c.getAttribute('r')));}
    const relations=this.parts[relPart(s.part)]?parse(this.parts[relPart(s.part)]):newRelationships(),removedIds=[];
    const links=first(doc.documentElement,'hyperlinks');
    for(const link of children(links||{},'hyperlink'))if(shift(link.getAttribute('ref'))===null){removedIds.push(link.getAttributeNS(OFFICE,'id'));links.removeChild(link);}
    for(const id of removedIds)if(!children(links||{},'hyperlink').some(h=>h.getAttributeNS(OFFICE,'id')===id)){const relation=children(relations.documentElement,'Relationship',RELS).find(r=>r.getAttribute('Id')===id);if(relation)relations.documentElement.removeChild(relation);}
    const adjust=xml=>{
      for(const node of Array.from(xml.getElementsByTagNameNS(MAIN,'*'))){
        for(const attribute of ['ref','sqref','activeCell','topLeftCell']){
          if(!node.hasAttribute(attribute))continue;
          const refs=node.getAttribute(attribute).split(/\s+/).map(shift).filter(Boolean);
          if(refs.length)node.setAttribute(attribute,refs.join(' '));
          else if(['hyperlink','dataValidation','conditionalFormatting','sortCondition','mergeCell'].includes(node.localName))node.parentNode?.removeChild(node);
          else node.removeAttribute(attribute);
        }
      }
    };
    if(links&&!children(links,'hyperlink').length)links.parentNode.removeChild(links);
    adjust(doc);
    for(const tag of ['dataValidations','mergeCells']){const parent=first(doc.documentElement,tag);if(parent){const count=children(parent,tag==='dataValidations'?'dataValidation':'mergeCell').length;if(count)parent.setAttribute('count',String(count));else parent.parentNode.removeChild(parent);}}
    for(const relation of children(relations.documentElement,'Relationship',RELS))if(relation.getAttribute('Type')===OFFICE+'/table'){
      const part=resolvePart(s.part,relation.getAttribute('Target')),table=parse(this.parts[part]);adjust(table);this.parts[part]=encode(table);
    }
    this.parts[s.part]=encode(doc);if(this.parts[relPart(s.part)])this.parts[relPart(s.part)]=encode(relations);
    return Buffer.from(zipSync(this.parts,{level:6}));
  }
  updatePostStatus(year,number,status){return this.updatePostCell(year,number,'G',status);}
  // Formato (colonna F) di una sola riga, es. scelto quando si rigenera il file Illustrator
  updatePostFormat(year,number,format){return this.updatePostCell(year,number,'F',format);}
  updatePostCell(year,number,column,value){
    if(!this.posts().some(p=>p.year===year&&p.row===number))throw new Error('Il post non è più disponibile. Aggiorna l’elenco.');
    const s=this.year(year),row=children(s.data,'row').find(r=>Number(r.getAttribute('r'))===number);
    let cell=this.cell(row,column);
    if(!cell){cell=element(s.doc,'c');cell.setAttribute('r',column+number);const next=children(row,'c').find(c=>c.getAttribute('r').replace(/\d/g,'')>column);row.insertBefore(cell,next||null);}
    setInline(s.doc,cell,value);updateStatusValidation(s.doc);this.parts[s.part]=encode(s.doc);
    return Buffer.from(zipSync(this.parts,{level:6}));
  }
  updatePost(year, number, changes, sourcesRelative) {
    if (!this.posts().some(p=>p.year===year&&p.row===number)) throw new Error('Il post non è più disponibile. Aggiorna l’elenco.');
    const s=this.year(year),row=children(s.data,'row').find(r=>Number(r.getAttribute('r'))===number);
    const date1904=['1','true'].includes(first(this.workbook.documentElement,'workbookPr')?.getAttribute('date1904'));
    const date=changes.date?(Date.parse(changes.date+'T00:00:00Z')-Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30))/86400000:'';
    for(const [col,value] of Object.entries({C:date,D:changes.title,E:changes.topic,F:changes.format,G:changes.status})){
      let cell=this.cell(row,col);
      if(!cell){cell=element(s.doc,'c');cell.setAttribute('r',col+number);const next=children(row,'c').find(c=>c.getAttribute('r').replace(/\d/g,'')>col);row.insertBefore(cell,next||null);}
      setInline(s.doc,cell,value);
    }
    const rels=this.parts[relPart(s.part)]?parse(this.parts[relPart(s.part)]):newRelationships();
    const link=children(first(s.doc.documentElement,'hyperlinks')||{},'hyperlink').find(h=>h.getAttribute('ref')==='H'+number);
    const relation=link&&children(rels.documentElement,'Relationship',RELS).find(r=>r.getAttribute('Id')===link.getAttributeNS(OFFICE,'id')&&r.getAttribute('Type')===OFFICE+'/hyperlink');
    if(!relation)throw new Error('Manca il collegamento ai sorgenti del post.');
    relation.setAttribute('Target',sourcesRelative);relation.setAttribute('TargetMode','External');
    updateStatusValidation(s.doc);this.parts[s.part]=encode(s.doc);this.parts[relPart(s.part)]=encode(rels);
    return Buffer.from(zipSync(this.parts,{level:6}));
  }
  // Svuota le celle della data che contengono il vecchio testo "xx-xx" (data da definire = cella vuota).
  clearUndefinedDates() {
    let count = 0;
    for (const sheet of this.sheets()) {
      if (!/^\d{4}$/.test(sheet.getAttribute('name'))) continue;
      const s = this.year(Number(sheet.getAttribute('name')));
      let changed = false;
      for (const row of children(s.data, 'row')) {
        if (Number(row.getAttribute('r')) <= s.header) continue;
        const cell = this.cell(row, 'C');
        if (cell && String(this.value(cell) ?? '').trim().toLowerCase() === 'xx-xx') { setInline(s.doc, cell, ''); count++; changed = true; }
      }
      if (changed) this.parts[s.part] = encode(s.doc);
    }
    return { count, buffer: Buffer.from(zipSync(this.parts, { level: 6 })) };
  }
  updateDraftDate(year, number, date, sourcesRelative) {
    const draft = this.posts().find(d=>d.year===year && d.row===number);
    if (!draft) throw new Error('Il post non è più disponibile. Aggiorna l’elenco.');
    const s = this.year(year), row = children(s.data,'row').find(r=>Number(r.getAttribute('r'))===number);
    const cell = this.cell(row,'C');
    if (!cell) throw new Error('La riga non contiene una cella per la data.');
    const date1904 = ['1','true'].includes(first(this.workbook.documentElement,'workbookPr')?.getAttribute('date1904'));
    setInline(s.doc,cell,date===null?'':(Date.parse(date+'T00:00:00Z')-Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30))/86400000);
    const rels = this.parts[relPart(s.part)] ? parse(this.parts[relPart(s.part)]) : newRelationships();
    const link = children(first(s.doc.documentElement,'hyperlinks') || {},'hyperlink').find(h=>h.getAttribute('ref')==='H'+number);
    const relation = link && children(rels.documentElement,'Relationship',RELS).find(r=>r.getAttribute('Id')===link.getAttributeNS(OFFICE,'id') && r.getAttribute('Type')===OFFICE+'/hyperlink');
    if (!relation) throw new Error('Manca il collegamento ai sorgenti del post.');
    relation.setAttribute('Target',sourcesRelative);
    relation.setAttribute('TargetMode','External');
    this.parts[s.part] = encode(s.doc);
    this.parts[relPart(s.part)] = encode(rels);
    return Buffer.from(zipSync(this.parts,{level:6}));
  }
  addOverride(part, type) {
    if (children(this.types.documentElement, 'Override', TYPES).some(x => x.getAttribute('PartName') === '/' + part)) return;
    const n = element(this.types, 'Override', TYPES); n.setAttribute('PartName', '/' + part); n.setAttribute('ContentType', type); this.types.documentElement.appendChild(n);
  }
  relationship(doc, id, type, target, external = false) {
    const n = element(doc, 'Relationship', RELS);
    for (const [k, v] of Object.entries({ Id: id, Type: type, Target: target, ...(external ? { TargetMode: 'External' } : {}) })) n.setAttribute(k, v);
    doc.documentElement.appendChild(n); return n;
  }
  newTable(sheet, relations, templateTable = null) {
    const numbers = Object.keys(this.parts).map(p => /^xl\/tables\/table(\d+)\.xml$/.exec(p)).filter(Boolean).map(m => Number(m[1]));
    const n = Math.max(0, ...numbers) + 1, part = `xl/tables/table${n}.xml`;
    const year = sheet.sheet.getAttribute('name');
    const doc = templateTable ? parse(templateTable) : parse(strToU8(`<table xmlns="${MAIN}" id="${n}" name="Social_${year}" displayName="Social_${year}" ref="A${sheet.header}:H${sheet.header}" totalsRowShown="0"><autoFilter ref="A${sheet.header}:H${sheet.header}"/><tableColumns count="8">${HEADERS.map((h,i)=>`<tableColumn id="${i+1}" name="${h}"/>`).join('')}</tableColumns><tableStyleInfo name="TableStyleMedium2" showRowStripes="1"/></table>`));
    const t = doc.documentElement;
    t.setAttribute('id', String(n)); t.setAttribute('name', `Social_${year}_${n}`); t.setAttribute('displayName', `Social_${year}_${n}`);
    t.setAttribute('ref', `A${sheet.header}:H${sheet.header}`);
    const filter = first(t, 'autoFilter'); if (filter) { filter.setAttribute('ref', t.getAttribute('ref')); while(filter.firstChild)filter.removeChild(filter.firstChild); }
    const rid = 'rIdSocialTable' + n;
    this.relationship(relations, rid, OFFICE + '/table', '../tables/table' + n + '.xml');
    let tableParts = first(sheet.doc.documentElement, 'tableParts');
    if (!tableParts) { tableParts = element(sheet.doc, 'tableParts'); sheet.doc.documentElement.appendChild(tableParts); }
    tableParts.setAttribute('count', '1');
    const tp = element(sheet.doc, 'tablePart'); tp.setAttributeNS(OFFICE, 'r:id', rid); tableParts.appendChild(tp);
    this.parts[part] = encode(doc); this.addOverride(part, 'application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml');
    return { part, doc };
  }
  createYear(year, template) {
    const nums = Object.keys(this.parts).map(p=>/^xl\/worksheets\/sheet(\d+)\.xml$/.exec(p)).filter(Boolean).map(m=>Number(m[1]));
    const n = Math.max(0, ...nums) + 1, part = `xl/worksheets/sheet${n}.xml`;
    const sheet = element(this.workbook, 'sheet');
    sheet.setAttribute('name', String(year));
    sheet.setAttribute('sheetId', String(Math.max(0, ...this.sheets().map(x=>Number(x.getAttribute('sheetId')))) + 1));
    const rid = 'rIdSocialYear' + year;
    sheet.setAttributeNS(OFFICE, 'r:id', rid);
    // Le schede annuali restano in ordine di anno (es. 2024 prima del 2026).
    const sheetsNode = first(this.workbook.documentElement, 'sheets'), all = this.sheets();
    const next = all.find(x => /^\d{4}$/.test(x.getAttribute('name')) && Number(x.getAttribute('name')) > Number(year)) || null;
    const index = next ? all.indexOf(next) : all.length;
    sheetsNode.insertBefore(sheet, next);
    if (next) {
      // indici di scheda usati da viste e nomi definiti: si spostano di uno
      for (const view of children(first(this.workbook.documentElement, 'bookViews') || {}, 'workbookView'))
        for (const attr of ['activeTab', 'firstSheet']) if (view.hasAttribute(attr) && Number(view.getAttribute(attr)) >= index) view.setAttribute(attr, String(Number(view.getAttribute(attr)) + 1));
      for (const name of children(first(this.workbook.documentElement, 'definedNames') || {}, 'definedName'))
        if (name.hasAttribute('localSheetId') && Number(name.getAttribute('localSheetId')) >= index) name.setAttribute('localSheetId', String(Number(name.getAttribute('localSheetId')) + 1));
    }
    this.relationship(this.rels, rid, OFFICE + '/worksheet', 'worksheets/sheet' + n + '.xml');
    const doc = parse(encode(template.doc)), data = first(doc.documentElement, 'sheetData');
    for (const row of children(data, 'row')) {
      row.removeAttribute('hidden');
      if (Number(row.getAttribute('r')) <= template.header) continue;
      for (const c of children(row, 'c')) { while(c.firstChild)c.removeChild(c.firstChild); c.removeAttribute('t'); }
    }
    for (const name of ['hyperlinks','tableParts','drawing','legacyDrawing','legacyDrawingHF','extLst']) {
      const node = first(doc.documentElement, name); if(node)node.parentNode.removeChild(node);
    }
    for (const view of children(first(doc.documentElement,'sheetViews') || {},'sheetView')) view.removeAttribute('tabSelected');
    const result = { sheet, part, doc, data, header: template.header, exists: true };
    const relations = newRelationships();
    this.newTable(result, relations);
    this.parts[part] = encode(doc); this.parts[relPart(part)] = encode(relations);
    this.addOverride(part, 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml');
    for (const [r, value] of [[2,`Piano editoriale ${year}`],[3,'Una riga per social. Stesso ID per le versioni dello stesso post.']]) {
      const row = children(data,'row').find(x=>Number(x.getAttribute('r'))===r);
      const c = row && this.cell(row,'A'); if(c)setInline(doc,c,value);
    }
    return result;
  }
  append(year, id, records, options = {}) {
    const info = this.info(year);
    // existingId: riga di un social in più per un post già presente (stesso ID)
    if (!options.existingId && id !== info.nextId) throw new Error('La numerazione è cambiata. Aggiorna il riepilogo.');
    const s = this.year(year, true), doc = s.doc;
    const rels = this.parts[relPart(s.part)] ? parse(this.parts[relPart(s.part)]) : newRelationships();
    const styleRow = children(s.data,'row').find(r=>Number(r.getAttribute('r'))===s.header+1);
    const styles = Object.fromEntries(HEADERS.map((_,i)=>{const col=String.fromCharCode(65+i);return[col,styleRow && this.cell(styleRow,col)?.getAttribute('s')];}));
    let hyperlinks = first(doc.documentElement,'hyperlinks');
    if (!hyperlinks) {
      hyperlinks=element(doc,'hyperlinks');
      const later=['printOptions','pageMargins','pageSetup','headerFooter','rowBreaks','colBreaks','drawing','legacyDrawing','legacyDrawingHF','picture','oleObjects','controls','webPublishItems','tableParts','extLst'];
      const before=Array.from(doc.documentElement.childNodes).find(n=>n.nodeType===1&&later.includes(n.localName));
      doc.documentElement.insertBefore(hyperlinks,before || null);
    }
    const date1904 = first(this.workbook.documentElement,'workbookPr')?.getAttribute('date1904');
    records.forEach((record,index)=>{
      const number=info.lastRow+index+1;
      if(number>1048576)throw new Error('La scheda ha raggiunto il numero massimo di righe.');
      let row=children(s.data,'row').find(r=>Number(r.getAttribute('r'))===number);
      if(!row){row=element(doc,'row');row.setAttribute('r',String(number));const next=children(s.data,'row').find(r=>Number(r.getAttribute('r'))>number);s.data.insertBefore(row,next || null);}
      row.setAttribute('ht','36');row.setAttribute('customHeight','1');row.removeAttribute('hidden');
      const dateValue=record.date ? (Date.parse(record.date+'T00:00:00Z')-Date.UTC(date1904==='1'||date1904==='true'?1904:1899,date1904==='1'||date1904==='true'?0:11,date1904==='1'||date1904==='true'?1:30))/86400000 : '';
      // status: per le righe importate (es. 'pubblicato' o ''); senza sourcesRelative nessun link ai sorgenti
      const values=[id,record.channel,dateValue,record.title,record.topic,record.format,record.status===undefined?'testi da creare':record.status,record.sourcesRelative?'Apri sorgenti':''];
      values.forEach((value,i)=>{
        const col=String.fromCharCode(65+i);let cell=this.cell(row,col);
        if(!cell){cell=element(doc,'c');cell.setAttribute('r',col+number);if(styles[col])cell.setAttribute('s',styles[col]);const before=children(row,'c').find(c=>c.getAttribute('r').replace(/\d/g,'')>col);row.insertBefore(cell,before || null);}
        setInline(doc,cell,value);
      });
      for(const h of children(hyperlinks,'hyperlink'))if(h.getAttribute('ref')==='H'+number)hyperlinks.removeChild(h);
      if(record.sourcesRelative){
       const rid=`rIdSocialPost${year}_${id}_${index}_${number}`;
       this.relationship(rels,rid,OFFICE+'/hyperlink',record.sourcesRelative,true);
       const h=element(doc,'hyperlink');h.setAttribute('ref','H'+number);h.setAttributeNS(OFFICE,'r:id',rid);hyperlinks.appendChild(h);
      }
    });
    if(!children(hyperlinks,'hyperlink').length)hyperlinks.parentNode.removeChild(hyperlinks);
    const last=info.lastRow+records.length;
    const tablePart=first(first(doc.documentElement,'tableParts') || {},'tablePart');
    let table;
    if(tablePart){const rid=tablePart.getAttributeNS(OFFICE,'id');const rel=children(rels.documentElement,'Relationship',RELS).find(x=>x.getAttribute('Id')===rid);if(rel){const part=resolvePart(s.part,rel.getAttribute('Target'));table={part,doc:parse(this.parts[part])};}}
    if(!table)table=this.newTable(s,rels);
    table.doc.documentElement.setAttribute('ref',`A${s.header}:H${last}`);
    const af=first(table.doc.documentElement,'autoFilter');if(af)af.setAttribute('ref',`A${s.header}:H${last}`);
    this.parts[table.part]=encode(table.doc);
    for(const tag of ['dataValidation','conditionalFormatting'])for(const node of Array.from(doc.getElementsByTagNameNS(MAIN,tag))){
      const refs=node.getAttribute('sqref');if(refs)node.setAttribute('sqref',refs.replace(/([A-H]\d+:[A-H])(\d+)/g,(all,start,end)=>Number(end)>=s.header+1?start+Math.max(Number(end),last):all));
    }
    const dimension=first(doc.documentElement,'dimension');if(dimension){const old=Number((dimension.getAttribute('ref').match(/\d+$/)||['1'])[0]);dimension.setAttribute('ref',`A1:H${Math.max(old,last)}`);}
    updateStatusValidation(doc);this.parts[s.part]=encode(doc);this.parts[relPart(s.part)]=encode(rels);
    let calc=first(this.workbook.documentElement,'calcPr');if(!calc){calc=element(this.workbook,'calcPr');this.workbook.documentElement.appendChild(calc);}calc.setAttribute('calcMode','auto');calc.setAttribute('fullCalcOnLoad','1');
    this.parts['xl/workbook.xml']=encode(this.workbook);this.parts['xl/_rels/workbook.xml.rels']=encode(this.rels);this.parts['[Content_Types].xml']=encode(this.types);
    return Buffer.from(zipSync(this.parts,{level:6}));
  }
}

module.exports={Book,HEADERS};
