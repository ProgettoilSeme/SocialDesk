'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {matchesPost,matchesSearch,statusTone,groupById}=require('../ui/post-filters.js');
const today='2026-11-04';
const filters={year:'2026',channels:['Facebook','LinkedIn','Instagram'],status:'',month:''};
const posts=[
 {year:2026,channel:'Facebook',status:'pubblicato',date:'2026-11-01'},
 {year:2026,channel:'Instagram',status:'da pubblicare',date:'2026-11-30'},
 {year:2026,channel:'LinkedIn',status:'testi da creare',date:null},
 {year:2026,channel:'Facebook',status:'immagine da creare',date:'2026-10-31'},
 {year:2027,channel:'LinkedIn',status:'pubblicato',date:'2027-11-04'},
 {year:2026,channel:'Instagram',status:'',date:null},
];
const apply=f=>posts.filter(p=>matchesPost(p,{...filters,...f},today));
test('anno: mostra soltanto quello selezionato, anche con tutti i canali',()=>{
 assert.equal(apply({}).length,5);assert.equal(apply({year:'2027'}).length,1);assert.equal(apply({year:'2028'}).length,0);
});
test('chips: combinazioni indipendenti e nessun post se tutte spente',()=>{
 assert.deepEqual(apply({channels:['Facebook','Instagram']}).map(p=>p.channel),['Facebook','Instagram','Facebook','Instagram']);
 assert.equal(apply({channels:['LinkedIn']}).length,1);assert.equal(apply({channels:[]}).length,0);
});
test('mese selezionato: include inizio/fine mese ed esclude le date da definire',()=>{
 assert.deepEqual(apply({month:'11'}).map(p=>p.date),['2026-11-01','2026-11-30']);
 assert.equal(apply({year:'2027',month:'11'}).length,1);
 assert.equal(apply({year:'2026',month:'10'}).length,1);
 assert.equal(apply({year:'2026',month:'12'}).length,0);
});
test('stato: combina anno, mese e canali; gestisce anche stati vuoti',()=>{
 assert.equal(apply({status:'pubblicato',month:'11',channels:['Facebook']}).length,1);
 assert.equal(apply({status:'da pubblicare',channels:['Facebook']}).length,0);
 assert.equal(apply({status:'__none'}).length,1);
 assert.equal(matchesPost({...posts[0],status:' Pubblicato '},{...filters,status:'pubblicato'},today),true);
});
test('colori degli stati: cinque toni distinti e fallback neutro',()=>{
 assert.equal(new Set(['testi da creare','testi in bozza','immagine da creare','da pubblicare','pubblicato'].map(statusTone)).size,5);
 assert.equal(statusTone(' Pubblicato '),'published');assert.equal(statusTone(''),'unassigned');
 assert.equal(statusTone('__proto__'),'unassigned');assert.equal(statusTone('constructor'),'unassigned');
});

test('tutti i mesi include anche le bozze senza data; mese e anno sono indipendenti',()=>{
 assert.equal(apply({month:''}).length,5);
 assert.equal(apply({month:'11',year:'2027'}).length,1);
 for(let month=1;month<=12;month++){
  const value=String(month).padStart(2,'0');
  assert.equal(matchesPost({year:2027,channel:'LinkedIn',status:'pubblicato',date:'2027-'+value+'-15'},{...filters,year:'2027',month:value}),true);
 }
 assert.equal(matchesPost({year:2026,channel:'Facebook',status:'pubblicato',date:'2027-11-04'},{...filters,month:'11'}),false);
});
test('nascondi pubblicati esclude solo i pubblicati',()=>{
 const base={year:2026,channel:'Facebook',date:null};
 const filters={year:'2026',channels:['Facebook'],status:'',month:'',hidePublished:true};
 assert.equal(matchesPost({...base,status:' Pubblicato '},filters),false);
 assert.equal(matchesPost({...base,status:'testi da creare'},filters),true);
 assert.equal(matchesPost({...base,status:''},filters),true);
 assert.equal(matchesPost({...base,status:'pubblicato'},{...filters,hidePublished:false}),true);
});
test('raggruppa solo ID dello stesso anno, preserva ordine e post senza ID',()=>{
 const entries=[
  {key:'2026:2',year:2026,id:7,channel:'Facebook'},
  {key:'2026:3',year:2026,id:null,channel:'Instagram'},
  {key:'2026:4',year:2026,id:7,channel:'Instagram'},
  {key:'2027:2',year:2027,id:7,channel:'LinkedIn'},
 ];
 assert.deepEqual(groupById(entries).map(group=>group.posts.map(post=>post.key)),[['2026:2','2026:4'],['2026:3'],['2027:2']]);
 assert.deepEqual(groupById(entries.filter(post=>post.channel==='Instagram')).map(group=>group.posts.map(post=>post.key)),[['2026:3'],['2026:4']]);
});

test('ricerca: titolo, argomento e formato senza maiuscole né accenti, tutte le parole',()=>{
 const post={title:'Festival del Cinema Nuovo',topic:'Disabilità e città',format:'Carosello',id:12};
 assert.equal(matchesSearch(post,''),true);
 assert.equal(matchesSearch(post,'   '),true);
 assert.equal(matchesSearch(post,'cinema'),true);
 assert.equal(matchesSearch(post,'FESTIVAL nuovo'),true);
 assert.equal(matchesSearch(post,'disabilita citta'),true,'accenti ignorati');
 assert.equal(matchesSearch(post,'carosello'),true);
 assert.equal(matchesSearch(post,'cinema teatro'),false,'serve ogni parola');
});
test('ricerca: un numero trova l’ID esatto, anche scritto "ID 12"',()=>{
 const post={title:'Auguri',topic:'',format:'',id:12},noId={title:'Senza ID',topic:'',format:'',id:null};
 assert.equal(matchesSearch(post,'12'),true);
 assert.equal(matchesSearch(post,'ID 12'),true);
 assert.equal(matchesSearch(post,'id12'),true);
 assert.equal(matchesSearch(post,'012'),true,'ID a tre cifre come nelle cartelle');
 assert.equal(matchesSearch(post,'1'),false);
 assert.equal(matchesSearch(noId,'12'),false);
 assert.equal(matchesSearch({title:'Lab 2026',topic:'',format:'',id:3},'2026'),true,'numeri anche nel titolo');
});
