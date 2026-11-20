'use strict';
// Crea il piano editoriale vuoto usato per i nuovi clienti (lib/templates/piano-vuoto.xlsx)
// partendo da un piano con le otto colonne concordate: toglie tutte le righe dei post,
// riscrive l'elenco dei testi condivisi tenendo solo quelli ancora usati (niente titoli
// di altri clienti dentro il file) e mette una descrizione generica nella riga 3.
// Uso: node scripts/make-empty-plan.cjs <piano.xlsx> <uscita.xlsx>
const fs=require('node:fs');
const {DOMParser,XMLSerializer}=require('@xmldom/xmldom');
const {unzipSync,zipSync,strToU8,strFromU8}=require('fflate');
const {Book}=require('../lib/workbook.cjs');
const MAIN='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const [source,target]=process.argv.slice(2);
if(!source||!target){console.error('uso: make-empty-plan.cjs piano.xlsx uscita.xlsx');process.exit(1);}

let buffer=fs.readFileSync(source);
// tutte le schede annuali tranne la prima restano fuori: il nuovo cliente parte con una sola scheda
for(;;){
 const book=new Book(buffer),posts=book.posts();
 if(!posts.length)break;
 const last=posts.reduce((a,b)=>a.year>b.year||(a.year===b.year&&a.row>b.row)?a:b);
 buffer=book.deletePost(last.year,last.row);
}
const parts=unzipSync(buffer);
const parse=text=>new DOMParser().parseFromString(strFromU8(text),'text/xml');
const encode=doc=>strToU8(new XMLSerializer().serializeToString(doc));
const sst=parse(parts['xl/sharedStrings.xml']);
const items=Array.from(sst.documentElement.getElementsByTagNameNS(MAIN,'si'));
const used=new Map(),order=[];
const sheets=Object.keys(parts).filter(p=>/^xl\/worksheets\/[^/]+\.xml$/.test(p));
const docs=sheets.map(p=>[p,parse(parts[p])]);
for(const [,doc] of docs)for(const cell of Array.from(doc.getElementsByTagNameNS(MAIN,'c'))){
 if(cell.getAttribute('t')!=='s')continue;
 const v=cell.getElementsByTagNameNS(MAIN,'v')[0],old=Number(v.textContent);
 if(!used.has(old)){used.set(old,order.length);order.push(old);}
 v.textContent=String(used.get(old));
 if(cell.getAttribute('r')==='A3')items[old].textContent='';
}
// riga 3: descrizione generica al posto di quella del primo cliente
const DESCRIPTION='Facebook, LinkedIn e Instagram, comprese le bozze. Una riga per social; lo stesso post su più social ha lo stesso ID.';
for(const [,doc] of docs)for(const cell of Array.from(doc.getElementsByTagNameNS(MAIN,'c')))if(cell.getAttribute('r')==='A3'){
 const v=cell.getElementsByTagNameNS(MAIN,'v')[0];
 if(cell.getAttribute('t')==='s'){const si=items[order[Number(v.textContent)]];while(si.firstChild)si.removeChild(si.firstChild);const t=sst.createElementNS(MAIN,'t');t.textContent=DESCRIPTION;si.appendChild(t);}
 else if(v){cell.setAttribute('t','str');v.textContent=DESCRIPTION;}
}
for(const si of items)si.parentNode.removeChild(si);
for(const old of order)sst.documentElement.appendChild(items[old]);
sst.documentElement.setAttribute('count',String(order.length));sst.documentElement.setAttribute('uniqueCount',String(order.length));
parts['xl/sharedStrings.xml']=encode(sst);
for(const [p,doc] of docs)parts[p]=encode(doc);
const result=Buffer.from(zipSync(parts,{level:6}));
const check=new Book(result);
if(check.posts().length)throw new Error('il piano contiene ancora post');
const status=check.updateStatusValidations();
fs.writeFileSync(target,status||result);
console.log('ok',target,'testi:',order.length,'schede:',check.sheets().map(s=>s.getAttribute('name')).join(','));
