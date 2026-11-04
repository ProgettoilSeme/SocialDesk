'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {matchesPost,statusTone}=require('../ui/post-filters.js');
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
test('colori degli stati: quattro toni distinti e fallback neutro',()=>{
 assert.equal(new Set(['testi da creare','immagine da creare','da pubblicare','pubblicato'].map(statusTone)).size,4);
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
