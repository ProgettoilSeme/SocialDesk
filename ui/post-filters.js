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
  if(filters.status==='__none'&&status)return false;
  if(filters.status&&filters.status!=='__none'&&status!==normalized(filters.status))return false;
  if(filters.month&&(!post.date||post.date.slice(0,7)!==String(filters.year)+'-'+filters.month))return false;
  return true;
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
 const api={matchesPost,statusTone,groupById};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.SocialPostFilters=Object.freeze(api);
})(globalThis);
