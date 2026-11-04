'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {strFromU8,strToU8,zipSync}=require('fflate');
const {DOMParser,XMLSerializer}=require('@xmldom/xmldom');
const {excelDate}=require('../lib/dates.cjs');
const {Book}=require('../lib/workbook.cjs');
const serial=iso=>(Date.parse(iso+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000;
test('date Excel: legge ISO nativo, testo italiano e numeri seriali senza spostare il giorno',()=>{
 for(const value of ['2026-11-04T00:00:00.000Z','2026-11-04','2026-11-04T00:00:00+02:00','04/11/2026','4.11.2026',serial('2026-11-04'),serial('2026-11-04')+.9,String(serial('2026-11-04'))])assert.equal(excelDate(value),'2026-11-04',String(value));
 assert.equal(excelDate(serial('2026-11-04')-1462,true),'2026-11-04');
 assert.equal(excelDate(0,true),'1904-01-01');assert.equal(excelDate(1),'1900-01-01');assert.equal(excelDate(59),'1900-02-28');assert.equal(excelDate(61),'1900-03-01');
});
test('date vuote o non valide: non inventa date di pubblicazione',()=>{
 for(const value of [null,'','xx-xx','Data da definire','31/02/2026','2026-02-30T00:00:00Z','2026-11-04T99:00:00Z',NaN,Infinity,-1,60,99999999,'2026'])assert.equal(excelDate(value),null,String(value));
 assert.equal(excelDate('2028-02-29'),'2028-02-29');
});
test('workbook: le date t=d, inline e shared strings sono visibili anche in Post in bozza',async()=>{
 const fixture=process.env.SOCIAL_TEST_FIXTURE;if(!fixture)throw new Error('Impostare SOCIAL_TEST_FIXTURE su una copia.');
 const original=await fs.readFile(path.join(fixture,'Piano editoriale.xlsx'));
 for(const [type,value] of [['d','2026-11-04T00:00:00.000Z'],['inlineStr','04/11/2026'],['s','2026-11-04'],['n',String(serial('2026-11-04'))]]){
  const b=new Book(original),s=b.year(2026),row=Array.from(s.data.childNodes).find(r=>r.nodeType===1&&r.getAttribute('r')===String(s.header+1));
  const cell=b.cell(row,'C');while(cell.firstChild)cell.removeChild(cell.firstChild);cell.setAttribute('t',type);
  const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  if(type==='inlineStr'){const is=s.doc.createElementNS(NS,'is'),t=s.doc.createElementNS(NS,'t');t.textContent=value;is.appendChild(t);cell.appendChild(is);}
  else{const v=s.doc.createElementNS(NS,'v');v.textContent=type==='s'?String(b.strings.length):value;cell.appendChild(v);}
  if(type==='s'){
   const parser=new DOMParser();let strings;
   if(b.parts['xl/sharedStrings.xml'])strings=parser.parseFromString(strFromU8(b.parts['xl/sharedStrings.xml']),'application/xml');
   else strings=parser.parseFromString(`<sst xmlns="${NS}"/>`,'application/xml');
   const si=strings.createElementNS(NS,'si'),t=strings.createElementNS(NS,'t');t.textContent=value;si.appendChild(t);strings.documentElement.appendChild(si);b.parts['xl/sharedStrings.xml']=strToU8(new XMLSerializer().serializeToString(strings));
  }
  // Il caso deve funzionare anche per una bozza con data, non solo per i pubblicati.
  const status=b.cell(row,'G');while(status.firstChild)status.removeChild(status.firstChild);status.setAttribute('t','inlineStr');const is=s.doc.createElementNS(NS,'is'),t=s.doc.createElementNS(NS,'t');t.textContent='da pubblicare';is.appendChild(t);status.appendChild(is);
  b.parts[s.part]=strToU8(new XMLSerializer().serializeToString(s.doc));const reopened=new Book(Buffer.from(zipSync(b.parts)));
  assert.equal(reopened.posts().find(p=>p.row===s.header+1).date,'2026-11-04',type);
  assert.equal(reopened.drafts().find(p=>p.row===s.header+1).date,'2026-11-04',type);
 }
});
