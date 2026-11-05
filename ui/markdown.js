// Markdown minimo per i testi dei post: titoli #/##/###, elenchi "- ",
// **grassetto**, *corsivo*, ~~barrato~~ e caratteri di escape "\".
// Il testo non viene mai interpretato come HTML: il DOM è costruito nodo per nodo.
(function(root){
 'use strict';
 const ESCAPABLE=/[\\`*_{}\[\]()#+\-.!~|>]/;

 // ---- Lettura: Markdown -> albero ----
 function tokenize(text){
  const tokens=[];let buffer='';
  const flush=()=>{if(buffer){tokens.push({type:'text',value:buffer});buffer='';}};
  for(let i=0;i<text.length;){
   const c=text[i];
   if(c==='\\'&&i+1<text.length&&ESCAPABLE.test(text[i+1])){buffer+=text[i+1];i+=2;continue;}
   if(c==='*'||c==='~'){
    let j=i;while(j<text.length&&text[j]===c)j++;
    const length=j-i;
    if(c==='~'&&length<2){buffer+=text.slice(i,j);i=j;continue;}
    const before=i>0?text[i-1]:' ',after=j<text.length?text[j]:' ';
    const space=ch=>/\s/u.test(ch),punct=ch=>/[\p{P}\p{S}]/u.test(ch);
    const left=!space(after)&&(!punct(after)||space(before)||punct(before));
    const right=!space(before)&&(!punct(before)||space(after)||punct(after));
    flush();tokens.push({type:'delim',char:c,length,open:left,close:right,raw:text.slice(i,j)});i=j;continue;
   }
   buffer+=c;i++;
  }
  flush();return tokens;
 }
 function parseInline(text){
  const tokens=tokenize(text);
  // Ogni nodo: testo, oppure delimitatore ancora da abbinare.
  const nodes=tokens.map(t=>t.type==='text'?{type:'text',value:t.value}:{...t,remaining:t.length});
  for(let c=0;c<nodes.length;c++){
   const closer=nodes[c];
   if(closer.type!=='delim'||!closer.close)continue;
   while(closer.remaining>0){
    let o=c-1,found=-1;
    for(;o>=0;o--){const n=nodes[o];if(n.type!=='delim'||n.char!==closer.char||!n.open||n.remaining<=0)continue;
     if(n.char==='~'&&(n.remaining<2||closer.remaining<2))continue;
     // Regola del 3 di CommonMark per delimitatori che possono aprire e chiudere.
     if(n.char==='*'&&(n.close||closer.open)&&(n.length+closer.length)%3===0&&(n.length%3!==0||closer.length%3!==0))continue;
     found=o;break;}
    if(found<0)break;
    const opener=nodes[found];
    let use,kind;
    if(closer.char==='~'){use=2;kind='s';}
    else{use=opener.remaining>=2&&closer.remaining>=2?2:1;kind=use===2?'b':'i';}
    const children=nodes.splice(found+1,c-found-1);
    const element={type:kind,children:children.map(flatten)};
    nodes.splice(found+1,0,element);c=found+2;
    opener.remaining-=use;closer.remaining-=use;
   }
  }
  return merge(nodes.map(flatten));
 }
 function merge(nodes){
  const output=[];
  for(const node of nodes){
   const item=node.children?{...node,children:merge(node.children)}:node;
   if(item.type==='text'&&!item.value)continue;
   const last=output[output.length-1];
   if(item.type==='text'&&last?.type==='text')last.value+=item.value;else output.push(item.type==='text'?{...item}:item);
  }
  return output;
 }
 function flatten(node){
  if(node.type==='delim')return{type:'text',value:node.char.repeat(node.remaining)};
  if(node.children)return{...node,children:node.children.map(flatten)};
  return node;
 }
 function parse(markdown){
  const lines=String(markdown??'').replace(/\r\n?/g,'\n').split('\n');
  return lines.map(line=>{
   let m;
   if((m=/^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line)))return{type:'h'+Math.min(m[1].length,3),inline:parseInline(m[2])};
   if(/^ {0,3}#{1,6}$/.test(line))return{type:'h'+Math.min(line.trim().length,3),inline:[]};
   if((m=/^[ \t]*[-*+][ \t]+(.*)$/.exec(line)))return{type:'li',inline:parseInline(m[1])};
   if(!line.trim())return{type:'blank',inline:[]};
   return{type:'p',inline:parseInline(line)};
  });
 }

 // ---- Disegno nel DOM ----
 function appendInline(parent,nodes,doc){
  for(const node of nodes){
   if(node.type==='text'){parent.appendChild(doc.createTextNode(node.value));continue;}
   const element=doc.createElement(node.type==='b'?'strong':node.type==='i'?'em':'s');
   appendInline(element,node.children,doc);parent.appendChild(element);
  }
 }
 function renderInto(container,markdown,doc=root.document){
  container.replaceChildren();let list=null;
  for(const block of parse(markdown)){
   if(block.type==='li'){
    if(!list){list=doc.createElement('ul');container.appendChild(list);}
    const item=doc.createElement('li');appendInline(item,block.inline,doc);if(!item.childNodes.length)item.appendChild(doc.createElement('br'));list.appendChild(item);continue;
   }
   list=null;
   const element=doc.createElement(block.type==='p'||block.type==='blank'?'div':block.type);
   appendInline(element,block.inline,doc);
   if(!element.childNodes.length)element.appendChild(doc.createElement('br'));
   container.appendChild(element);
  }
  return container;
 }

 // ---- Scrittura: DOM dell'editor -> Markdown ----
 const BLOCKS=new Set(['DIV','P','H1','H2','H3','H4','H5','H6','UL','OL','LI','BLOCKQUOTE','PRE','SECTION','ARTICLE']);
 function styleOf(element,inherited){
  const tag=element.tagName,style=element.getAttribute&&element.getAttribute('style')||'';
  const next={...inherited};
  if(tag==='B'||tag==='STRONG'||/font-weight\s*:\s*(bold|[6-9]00)/i.test(style))next.b=true;
  if(tag==='I'||tag==='EM'||/font-style\s*:\s*italic/i.test(style))next.i=true;
  if(tag==='S'||tag==='STRIKE'||tag==='DEL'||/line-through/i.test(style))next.s=true;
  if(/font-weight\s*:\s*(normal|[1-4]00)/i.test(style))next.b=false;
  return next;
 }
 function collectRuns(nodes,style,lines){
  // lines: array di array di run; un <br> chiude la riga corrente.
  for(const node of nodes){
   if(node.nodeType===3){if(node.nodeValue)lines[lines.length-1].push({text:node.nodeValue.replace(/ /g,' ').replace(/\n/g,' '),...style});continue;}
   if(node.nodeType!==1)continue;
   if(node.tagName==='BR'){lines.push([]);continue;}
   collectRuns(node.childNodes,styleOf(node,style),lines);
  }
 }
 const escapeText=text=>text.replace(/[\\*~]/g,'\\$&');
 const sameStyle=(a,b)=>!!a.b===!!b.b&&!!a.i===!!b.i&&!!a.s===!!b.s;
 function runsToMarkdown(runs){
  // Gli spazi ai bordi di una parte formattata restano fuori dai simboli.
  const pieces=[];
  runs.forEach(run=>{
   const m=/^(\s*)([\s\S]*?)(\s*)$/.exec(run.text);
   if(m[1])pieces.push({text:m[1],ws:true});
   if(m[2])pieces.push({text:m[2],b:!!run.b,i:!!run.i,s:!!run.s});
   if(m[3])pieces.push({text:m[3],ws:true});
  });
  pieces.forEach((piece,index)=>{
   if(!piece.ws)return;
   const prev=pieces.slice(0,index).reverse().find(p=>!p.ws),next=pieces.slice(index+1).find(p=>!p.ws);
   piece.b=!!(prev?.b&&next?.b);piece.i=!!(prev?.i&&next?.i);piece.s=!!(prev?.s&&next?.s);
  });
  const merged=[];
  for(const piece of pieces){const last=merged[merged.length-1];if(last&&sameStyle(last,piece))last.text+=piece.text;else merged.push({...piece});}
  const marks={s:'~~',b:'**',i:'*'},order=['s','b','i'];
  let output='';const stack=[];
  for(const piece of merged){
   while(stack.some(flag=>!piece[flag])){output+=marks[stack.pop()];}
   for(const flag of order)if(piece[flag]&&!stack.includes(flag)){stack.push(flag);output+=marks[flag];}
   output+=escapeText(piece.text);
  }
  while(stack.length)output+=marks[stack.pop()];
  return output;
 }
 function escapeLineStart(text){
  return text.replace(/^(\s*)(#{1,6}(?=\s|$)|[-+](?=\s)|\d+[.)](?=\s))/,(all,space,mark)=>space+'\\'+mark);
 }
 function blockLines(element,prefix,lines){
  const runsLines=[[]];collectRuns(element.childNodes,styleOf(element,{}),runsLines);
  if(runsLines.length>1&&!runsLines[runsLines.length-1].length)runsLines.pop();
  for(const runs of runsLines){
   let text=runsToMarkdown(runs);
   if(!prefix)text=escapeLineStart(text);
   lines.push(prefix&&text?prefix+text:prefix?prefix.trimEnd()+(prefix.startsWith('-')?' ':''):text);
  }
 }
 function walkBlocks(parent,lines){
  let inline=[];
  const flushInline=()=>{
   if(!inline.length)return;
   const holder={childNodes:inline,getAttribute:()=>null,tagName:'SPAN'};
   blockLines(holder,'',lines);inline=[];
  };
  for(const node of parent.childNodes){
   if(node.nodeType===1&&BLOCKS.has(node.tagName)){
    flushInline();
    const tag=node.tagName;
    if(/^H[1-6]$/.test(tag)){blockLines(node,'#'.repeat(Math.min(Number(tag[1]),3))+' ',lines);continue;}
    if(tag==='UL'||tag==='OL'){for(const item of node.childNodes){if(item.nodeType===1&&item.tagName==='LI')blockLines(item,'- ',lines);else if(item.nodeType===1&&BLOCKS.has(item.tagName))walkBlocks(item,lines);}continue;}
    if([...node.childNodes].some(child=>child.nodeType===1&&BLOCKS.has(child.tagName))){walkBlocks(node,lines);continue;}
    blockLines(node,tag==='LI'?'- ':'',lines);continue;
   }
   if(node.nodeType===1&&node.tagName==='BR'){inline.push(node);flushInline();continue;}
   inline.push(node);
  }
  flushInline();
 }
 function fromElement(element){
  const lines=[];walkBlocks(element,lines);
  return lines.map(line=>line.replace(/[ \t]+$/,'')).join('\n');
 }

 // ---- Copia per i social: lettere Unicode al posto dei simboli ----
 const RANGES={b:[0x1D5D4,0x1D5EE,0x1D7EC],i:[0x1D608,0x1D622,null],bi:[0x1D63C,0x1D656,0x1D7EC]};
 function styleChar(char,kind){
  const [upper,lower,digit]=RANGES[kind];
  const code=char.codePointAt(0);
  if(code>=65&&code<=90)return String.fromCodePoint(upper+code-65);
  if(code>=97&&code<=122)return String.fromCodePoint(lower+code-97);
  if(digit&&code>=48&&code<=57)return String.fromCodePoint(digit+code-48);
  return char;
 }
 function styleText(text,flags){
  let output='';
  for(const char of text.normalize('NFD')){
   let value=char;
   if(flags.b||flags.i)value=styleChar(char,flags.b&&flags.i?'bi':flags.b?'b':'i');
   output+=value;
   if(flags.s&&!/\s/u.test(char)&&!/\p{M}/u.test(char))output+='̶';
  }
  return output;
 }
 function inlineToUnicode(nodes,flags){
  return nodes.map(node=>node.type==='text'?styleText(node.value,flags):inlineToUnicode(node.children,{...flags,[node.type]:true})).join('');
 }
 function toSocialText(markdown){
  return parse(markdown).map(block=>{
   if(block.type==='blank')return'';
   if(block.type==='li')return'• '+inlineToUnicode(block.inline,{});
   if(block.type[0]==='h')return inlineToUnicode(block.inline,{b:true});
   return inlineToUnicode(block.inline,{});
  }).join('\n');
 }

 const api={parse,parseInline,renderInto,fromElement,toSocialText};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.SocialMarkdown=Object.freeze(api);
})(globalThis);
