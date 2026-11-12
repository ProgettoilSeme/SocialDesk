(function(root){
 'use strict';
 const normalized=value=>String(value||'').trim().toLowerCase();
 const tones=new Map([['testi da creare','text-needed'],['testi in bozza','text-draft'],['immagine da creare','image-needed'],['da pubblicare','ready'],['pubblicato','published']]);
 function statusTone(status){
  return tones.get(normalized(status))||'unassigned';
 }
 function matchesPost(post,filters){
  if(String(post.year)!==String(filters.year)||!filters.channels.includes(post.channel))return false;
  const status=normalized(post.status);
  if(filters.hidePublished&&status==='pubblicato')return false;
  if(filters.status==='__none'&&status)return false;
  if(filters.status&&filters.status!=='__none'&&status!==normalized(filters.status))return false;
  if(filters.month&&(!post.date||post.date.slice(0,7)!==String(filters.year)+'-'+filters.month))return false;
  return true;
 }
 // Ricerca: senza maiuscole né accenti; ogni parola deve comparire in titolo, argomento, formato o ID.
 // Un numero trova anche l'ID esatto (es. "12" → ID 12).
 const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 function searchWords(query){return fold(query).replace(/^id\s+(?=\d)/,'id').replace(/\sid\s+(?=\d)/g,' id').split(/\s+/).filter(Boolean);}
 function matchesSearch(post,query){
  const words=searchWords(query);if(!words.length)return true;
  const text=fold([post.title,post.topic,post.format].join(' ')),id=post.id===null||post.id===undefined?'':String(post.id);
  return words.every(word=>text.includes(word)||(/^\d+$/.test(word)&&id!==''&&Number(word)===Number(id))||(word.startsWith('id')&&/^\d+$/.test(word.slice(2))&&id!==''&&Number(word.slice(2))===Number(id)));
 }
 function groupById(posts){
  const groups=[],byId=new Map();
  for(const post of posts){
   if(post.id===null||post.id===undefined||post.id===''){groups.push({key:post.key,posts:[post]});continue;}
   const key=`${post.year}:${post.id}`;
   let group=byId.get(key);
   if(!group){group={key,posts:[]};byId.set(key,group);groups.push(group);}
   group.posts.push(post);
  }
  return groups;
 }
 const api={matchesPost,matchesSearch,searchWords,statusTone,groupById};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.SocialPostFilters=Object.freeze(api);
})(globalThis);
