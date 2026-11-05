'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const md=require('../ui/markdown.js');
const show=nodes=>nodes.map(n=>n.type==='text'?n.value:`${n.type}(${show(n.children)})`).join('|');

test('markdown: grassetto, corsivo, barrato e combinazioni',()=>{
 assert.equal(show(md.parseInline('una **parola** e *corsivo* e ~~barrato~~')),'una |b(parola)| e |i(corsivo)| e |s(barrato)');
 assert.equal(show(md.parseInline('**ab*cd***')),'b(ab|i(cd))');
 assert.equal(show(md.parseInline('***tutto***')),'i(b(tutto))');
 assert.equal(show(md.parseInline('~~**x**~~')),'s(b(x))');
 assert.equal(show(md.parseInline('**ab*')),'*|i(ab)');
});
test('markdown: testo letterale, hashtag ed escape',()=>{
 assert.equal(show(md.parseInline('#hashtag #Lavoro')),'#hashtag #Lavoro');
 assert.equal(show(md.parseInline('\\*non\\* corsivo')),'*non* corsivo');
 assert.equal(show(md.parseInline('~singolo~')),'~singolo~');
 assert.equal(show(md.parseInline('**a ** b')),'**a ** b');
 assert.equal(show(md.parseInline('<b>html</b> & co')),'<b>html</b> & co');
});
test('markdown: blocchi per riga',()=>{
 assert.deepEqual(md.parse('# Titolo\n## Sub\n### Terzo\n- uno\n\ntesto\n#hashtag').map(b=>b.type),['h1','h2','h3','li','blank','p','p']);
});
test('markdown: copia per i social con lettere Unicode',()=>{
 const text=md.toSocialText('# Siamo\nUn **anno** di ~~ok~~ *si* 26\n- punto');
 assert.equal(text,'𝗦𝗶𝗮𝗺𝗼\nUn 𝗮𝗻𝗻𝗼 di o̶k̶ 𝘴𝘪 26\n• punto');
 assert.equal(md.toSocialText('**è**').normalize('NFC').length>0,true);
 assert.equal(md.toSocialText('**è**'),'𝗲̀');
});
